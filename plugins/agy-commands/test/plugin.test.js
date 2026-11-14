import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../index.js'

const COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u

/**
 * Fake Host. `locale` is the stored DSH language (`undefined` = follow the
 * system); `setLocale` changes it and fires the settings event like the Host.
 */
function makeHarness(definitions = {}, options = {}) {
  const registered = new Map()
  const listeners = []
  let preference = 'locale' in options ? options.locale : 'ko'
  const ctx = {
    get(name) {
      if (name !== 'settings') return undefined
      return {
        describe: () => [
          { ns: 'ui-theme', value: { preference: 'light' } },
          { ns: 'locale', value: preference === undefined ? {} : { preference } },
        ],
      }
    },
    on(event, listener) {
      listeners.push({ event, listener })
      return () => {}
    },
    commands: {
      register(definition) {
        registered.set(definition.name, definition)
        return () => {
          if (registered.get(definition.name) === definition) registered.delete(definition.name)
        }
      },
      find(agent, name) {
        return agent.definitions[name]
      },
    },
  }
  const setLocale = async (next) => {
    preference = next
    for (const { event, listener } of listeners) if (event === 'settings/document-updated') listener('locale', 1)
    await Promise.resolve()
  }

  const agent = {
    steered: [],
    definitions,
    steer(message) {
      this.steered.push(message)
    },
  }

  apply(ctx)

  const invoke = (name, rawInput, extra = {}) => {
    const command = registered.get(name)
    assert.ok(command, `command /${name} is registered`)
    return command.handler({
      commandId: 'cmd-test-1',
      agent,
      rawInput,
      attachments: [],
      signal: new AbortController().signal,
      ...extra,
    })
  }

  return { registered, agent, invoke, setLocale }
}

test('registers the agy command set with valid names', () => {
  const { registered } = makeHarness()
  assert.deepEqual(
    [...registered.keys()].sort(),
    ['agy', 'agy-boost', 'agy-goal', 'agy-grill-me', 'agy-plan', 'agy-teamwork'],
  )
  for (const name of registered.keys()) assert.match(name, COMMAND_NAME)
})

test('every definition satisfies the host registry contract', () => {
  const { registered } = makeHarness()
  for (const definition of registered.values()) {
    assert.match(definition.name, COMMAND_NAME)
    assert.equal(typeof definition.description, 'string')
    assert.ok(definition.description.trim().length > 0, `${definition.name} has a description`)
    assert.equal(typeof definition.handler, 'function')
    assert.equal(typeof definition.input?.hint, 'string')
    assert.ok(definition.input.hint.trim().length > 0, `${definition.name} has an input hint`)
  }
})

test('/agy without input shows help and lists direct commands', async () => {
  const { invoke } = makeHarness()
  const result = await invoke('agy', '   ')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /\/agy-plan/)
  assert.match(result.text, /\/agy-teamwork/)
})

test('help teaches the recommended sequence and the one-command limit', async () => {
  const { invoke } = makeHarness()
  const { text } = await invoke('agy', '')
  for (const fragment of [
    '추천 시퀀스',
    '한 줄에 명령 하나',
    '/agy-grill-me',
    '/agy-plan',
    '/agy-goal',
    '/agy-teamwork',
    '/agy-boost',
    '자체 범위 인터뷰',
  ]) {
    assert.ok(text.includes(fragment), `help mentions ${fragment}`)
  }
  assert.match(text, /겹쳐 쓰면 두 번째 명령은 계획서 본문/)
})

test('/agy plan delegates to the session plan handler', async () => {
  const seen = []
  const { invoke } = makeHarness({
    plan: {
      handler: (invocation) => {
        seen.push(invocation)
        return { kind: 'success', text: `plan:${invocation.rawInput}` }
      },
    },
  })

  const result = await invoke('agy', 'plan off')
  assert.deepEqual(result, { kind: 'success', text: 'plan:off' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].commandId, 'cmd-test-1')
})

test('/agy-plan passes the raw input and attachments through', async () => {
  const seen = []
  const { invoke } = makeHarness({
    plan: {
      handler: (invocation) => {
        seen.push(invocation)
        return { kind: 'success', text: 'ok' }
      },
    },
  })
  const attachment = Object.freeze({ type: 'text', text: 'x' })
  await invoke('agy-plan', '  hello world  ', { attachments: [attachment] })

  assert.equal(seen[0].rawInput, 'hello world')
  assert.deepEqual(seen[0].attachments, [attachment])
})

test('/agy-goal delegates clear/pause/resume grammar unchanged', async () => {
  const { invoke } = makeHarness({
    goal: { handler: (invocation) => ({ kind: 'success', text: `goal:${invocation.rawInput}` }) },
  })
  assert.deepEqual(await invoke('agy-goal', ' pause '), { kind: 'success', text: 'goal:pause' })
  assert.deepEqual(await invoke('agy', 'goal'), { kind: 'success', text: 'goal:' })
})

test('a missing plan definition returns a direct error instead of throwing', async () => {
  const { invoke } = makeHarness({}, { locale: 'en' })
  const result = await invoke('agy-plan', 'off')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /\/plan is not available/)
})

test('a throwing delegated handler becomes a command error', async () => {
  const { invoke } = makeHarness({
    plan: {
      handler: () => {
        throw new Error('boom')
      },
    },
  }, { locale: 'en' })
  const result = await invoke('agy-plan', '')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /\/plan failed: boom/)
})

test('/agy-grill-me steers one identified user message', async () => {
  const { invoke, agent } = makeHarness()
  const result = await invoke('agy-grill-me', ' rate limit API ')

  assert.equal(result.kind, 'success')
  assert.equal(agent.steered.length, 1)
  const [message] = agent.steered
  assert.equal(message.role, 'user')
  assert.equal(typeof message.id, 'string')
  assert.equal(message.source.kind, 'user')
  assert.equal(message.content.length, 1)
  assert.match(message.content[0].text, /\[agy-grill-me\]/)
  assert.match(message.content[0].text, /rate limit API/)
  assert.match(message.content[0].text, /ask_user_question/)
  assert.match(message.content[0].text, /Recommended/)
})

test('/agy-grill-me without a task still starts an interview', async () => {
  const { invoke, agent } = makeHarness()
  const result = await invoke('agy-grill-me', '')
  assert.equal(result.kind, 'success')
  assert.equal(agent.steered.length, 1)
})

test('/agy-boost requires a task and steers a multi-agent directive', async () => {
  const { invoke, agent } = makeHarness()
  const empty = await invoke('agy-boost', '')
  assert.equal(empty.kind, 'error')
  assert.equal(agent.steered.length, 0)

  const result = await invoke('agy', 'boost the race in the cache')
  assert.equal(result.kind, 'success')
  assert.equal(agent.steered.length, 1)
  assert.match(agent.steered[0].content[0].text, /\[agy-boost\]/)
  assert.match(agent.steered[0].content[0].text, /subagent 또는 workflow/)
})

test('/agy-teamwork requires a task and steers the project directive', async () => {
  const { invoke, agent } = makeHarness()
  assert.equal((await invoke('agy-teamwork', '   ')).kind, 'error')
  const result = await invoke('agy-teamwork', 'migrate the API')
  assert.equal(result.kind, 'success')
  assert.match(agent.steered[0].content[0].text, /teamwork_projects/)
})

test('an unknown subcommand returns an error and help', async () => {
  const { invoke } = makeHarness({}, { locale: 'en' })
  const result = await invoke('agy', 'nope')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /Unknown \/agy subcommand "nope"/)
  assert.match(result.text, /\/agy-plan/)
})

test('steer failures surface as command errors', async () => {
  const { invoke, agent } = makeHarness()
  agent.steer = () => {
    throw new Error('inbox closed')
  }
  const result = await invoke('agy-boost', 'x')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /inbox closed/)
})

/** Run `run` while the process reports `id` as its language (Intl and LANG). */
async function withSystemLocale(id, run) {
  const original = Intl.DateTimeFormat
  const lang = process.env.LANG
  Intl.DateTimeFormat = function () {
    return { resolvedOptions: () => ({ locale: id }) }
  }
  process.env.LANG = `${id.replace('-', '_')}.UTF-8`
  try {
    return await run()
  } finally {
    Intl.DateTimeFormat = original
    if (lang === undefined) delete process.env.LANG
    else process.env.LANG = lang
  }
}

test('descriptions, hints and results follow a Korean DSH language', async () => {
  const { registered, invoke } = makeHarness({}, { locale: 'ko' })
  assert.equal(registered.get('agy-boost').description, '어려운 문제를 다중 에이전트로 심층 추론')
  assert.equal(registered.get('agy-boost').input.hint, '<할 일>')
  assert.equal((await invoke('agy-boost', '')).text, '사용법: /agy-boost <할 일>')
  assert.equal((await invoke('agy-boost', 'x')).text, '심층 다중 에이전트 추론을 시작합니다.')
  assert.match((await invoke('agy-plan', '')).text, /명령이 이 세션의 에이전트 프리셋에 없습니다/)
  assert.match((await invoke('agy', '')).text, /^\/agy — Antigravity 방식 명령/)
})

test('descriptions, hints and results follow an English DSH language', async () => {
  const { registered, invoke } = makeHarness({}, { locale: 'en' })
  assert.equal(registered.get('agy-boost').description, 'Deep multi-agent reasoning for a hard problem')
  assert.equal(registered.get('agy-boost').input.hint, '<task>')
  assert.equal((await invoke('agy-boost', '')).text, 'Usage: /agy-boost <task>')
  assert.equal((await invoke('agy-boost', 'x')).text, 'Starting deep multi-agent reasoning.')
  assert.match((await invoke('agy', '')).text, /Recommended sequences/)
  for (const definition of registered.values()) assert.doesNotMatch(definition.description, /[가-힣]/u)
})

test('an unset DSH language follows the system language', async () => {
  await withSystemLocale('ko-KR', async () => {
    const { registered, invoke } = makeHarness({}, { locale: undefined })
    assert.equal(registered.get('agy-teamwork').description, '며칠짜리 다중 에이전트 프로젝트 (마일스톤·감사)')
    assert.equal((await invoke('agy-teamwork', '')).text, '사용법: /agy-teamwork <할 일>')
  })
  await withSystemLocale('en-US', async () => {
    const { registered, invoke } = makeHarness({}, { locale: undefined })
    assert.equal(registered.get('agy-teamwork').description, 'Multi-day multi-agent project (milestones and audits)')
    assert.equal((await invoke('agy-teamwork', '')).text, 'Usage: /agy-teamwork <task>')
  })
})

test('a language change registers the commands again in the new language', async () => {
  const { registered, invoke, setLocale } = makeHarness({}, { locale: 'en' })
  assert.equal(registered.get('agy').description, 'Antigravity-style commands (plan/goal/grill-me/boost/teamwork)')
  await setLocale('ko')
  assert.equal(registered.size, 6)
  assert.equal(registered.get('agy').description, 'Antigravity 방식 명령 (plan/goal/grill-me/boost/teamwork)')
  assert.equal((await invoke('agy-grill-me', '')).text, '요구사항 인터뷰를 시작합니다. 무엇을 할지 먼저 물어봅니다.')
  await setLocale('en')
  assert.equal(registered.get('agy-grill-me').description, 'Requirements interview before starting (one question at a time)')
})

test('the steered prompt does not change with the DSH language', async () => {
  const ko = makeHarness({}, { locale: 'ko' })
  const en = makeHarness({}, { locale: 'en' })
  await ko.invoke('agy-boost', 'same task')
  await en.invoke('agy-boost', 'same task')
  assert.equal(ko.agent.steered[0].content[0].text, en.agent.steered[0].content[0].text)
})
