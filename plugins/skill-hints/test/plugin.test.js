import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { COMMAND, ROUTE_PATH, apply, reportText } from '../index.js'
import { discover, frontmatter, hintsFor, labelsFor } from '../skills.js'
import { changedCount, createSync } from '../sync.js'

/** ~/.dsh/skills(감싸개 .md)와 ~/.agents/skills(폴더) 두 자리를 흉내 낸다. */
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'skill-hints-'))
  const dsh = join(base, 'dsh')
  const shelf = join(base, 'shelf')
  mkdirSync(dsh)
  for (const dir of ['gstack/gstack-cso', 'impeccable', 'plain', 'hidden', 'auto']) mkdirSync(join(shelf, dir), { recursive: true })
  writeFileSync(join(shelf, 'gstack', 'gstack-cso', 'SKILL.md'),
    '---\nname: cso\ndescription: |\n  Security audit\n  for code\nargument-hint: "[--diff 변경분만 | --code 코드]"\n---\nreal body\n')
  writeFileSync(join(dsh, 'gstack-cso.md'),
    `---\nname: gstack-cso\ndescription: "wrapper"\ndisable-model-invocation: true\n---\n\n1. \`${join(shelf, 'gstack', 'gstack-cso', 'SKILL.md')}\`를 끝까지 읽는다.\n`)
  writeFileSync(join(shelf, 'impeccable', 'SKILL.md'),
    '---\nname: impeccable\ndescription: Design work\ndisable-model-invocation: true\nargument-hint: "[polish 다듬기] [대상]"\n---\n')
  writeFileSync(join(shelf, 'plain', 'SKILL.md'), '---\nname: plain\ndescription: no hint\ndisable-model-invocation: true\n---\n')
  writeFileSync(join(shelf, 'hidden', 'SKILL.md'), '---\nname: hidden\ndescription: nobody\nuser-invocable: false\n---\n')
  writeFileSync(join(shelf, 'auto', 'SKILL.md'), '---\nname: auto\ndescription: Model picks this up\n---\n')
  // 앞 폴더가 이긴다: 선반의 같은 이름은 무시된다.
  mkdirSync(join(shelf, 'dup'))
  writeFileSync(join(dsh, 'impeccable.md'), '---\nname: impeccable\ndescription: wrapper\ndisable-model-invocation: true\n---\n')
  return [dsh, shelf]
}

test('frontmatter reads quoted, plain and block values', () => {
  const meta = frontmatter('---\nname: a\ndescription: |\n  line one\n  line two\nargument-hint: "[x | y]"\n---\n')
  assert.equal(meta.name, 'a')
  assert.equal(meta.description, 'line one line two')
  assert.equal(meta['argument-hint'], '[x | y]')
  assert.deepEqual(frontmatter('no fence'), {})
})

test('discover follows wrappers, lets the first folder win and drops hidden skills', () => {
  const found = discover(fixture(), { plain: { summary: '그냥 스킬', hint: '[대상]' }, auto: { summary: '자동' } })
  assert.deepEqual(found.map((s) => s.name).sort(), ['auto', 'gstack-cso', 'impeccable', 'plain'])
  const by = Object.fromEntries(found.map((s) => [s.name, s]))
  assert.equal(by['gstack-cso'].hint, '[--diff 변경분만 | --code 코드]')
  assert.equal(by['gstack-cso'].userOnly, true)
  assert.equal(by.impeccable.description, 'wrapper')
  assert.equal(by.impeccable.hint, undefined, 'the wrapper without a target path has no hint of its own')
  assert.equal(by.plain.hint, '[대상]', 'overlay hint fills in')
  assert.equal(by.plain.summary, '그냥 스킬')
  assert.equal(by.auto.userOnly, false)
})

test('hintsFor gives hints only in Korean', () => {
  const skills = [{ name: 'a', hint: '[x]' }, { name: 'b' }]
  assert.deepEqual(hintsFor(skills, 'ko'), { a: '[x]' })
  assert.deepEqual(hintsFor(skills, 'en'), {})
})

test('labelsFor gives Korean menu text only for AI-callable skills with a summary', () => {
  const skills = [
    { name: 'auto', userOnly: false, summary: '자동', hint: '[대상]' },
    { name: 'plain-auto', userOnly: false, summary: '그냥 자동' },
    { name: 'no-summary', userOnly: false },
    { name: 'mine', userOnly: true, summary: '내 것' },
  ]
  assert.deepEqual(labelsFor(skills, 'ko'), { auto: '자동 · [대상]', 'plain-auto': '그냥 자동' })
  assert.deepEqual(labelsFor(skills, 'en'), {})
})

test('changedCount reads the summary line of dsh-sync-skills', () => {
  assert.equal(changedCount('...\n12건 고침\n'), 12)
  assert.equal(changedCount('3건 바꿀 것 있음 (미리 보기)'), 3)
  assert.equal(changedCount('바꿀 것 없음'), 0)
})

test('createSync passes the locale, treats preview exit 1 as ok and runs one job at a time', async () => {
  const calls = []
  let running = 0
  const run = async (file, args, env) => {
    running += 1
    assert.equal(running, 1)
    calls.push([file, args, env.DSH_SKILL_LOCALE])
    await new Promise((resolve) => setTimeout(resolve, 5))
    running -= 1
    return args.includes('--apply') ? { code: 0, stdout: '4건 고침' } : { code: 1, stdout: '4건 바꿀 것 있음' }
  }
  const sync = createSync({ script: '/x/dsh-sync-skills', run, available: () => true })
  const [check, applied] = await Promise.all([sync.check('ko'), sync.apply('en')])
  assert.deepEqual(check, { available: true, ok: true, changed: 4 })
  assert.deepEqual(applied, { available: true, ok: true, changed: 4 })
  assert.deepEqual(calls, [['/x/dsh-sync-skills', [], 'ko'], ['/x/dsh-sync-skills', ['--apply'], 'en']])

  const failing = createSync({ run: async () => ({ code: 2, stdout: '' }), available: () => true })
  assert.deepEqual(await failing.apply('ko'), { available: true, ok: false, changed: 0 })
  const missing = createSync({ run: async () => assert.fail('must not run'), available: () => false })
  assert.deepEqual(await missing.check('ko'), { available: false, ok: false, changed: 0 })
})

/** 가짜 호스트: 저장된 DSH 언어, 설정 바뀜 알림, 경로·명령 등록. */
function host(initial) {
  const listeners = []
  let preference = initial
  const routes = []
  const commands = []
  const ctx = {
    get: (name) => (name === 'settings' ? { describe: () => [{ ns: 'locale', value: { preference } }] } : undefined),
    on: (event, listener) => { if (event === 'settings/document-updated') listeners.push(listener); return () => {} },
    inject(names, callback) {
      callback({
        ...ctx,
        effect: (fn) => fn(),
        connection: { fetch: { register: (route) => { routes.push(route); return () => {} } } },
        commands: {
          register: (command) => {
            commands.push(command)
            return () => commands.splice(commands.indexOf(command), 1)
          },
        },
      })
    },
  }
  const setLocale = async (next) => {
    preference = next
    for (const listener of listeners) listener('locale', 1)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { ctx, setLocale, routes, commands }
}

function fakeSync(changes = []) {
  const calls = []
  return {
    calls,
    check: async (locale) => { calls.push(['check', locale]); return { available: true, ok: true, changed: 2 } },
    apply: async (locale) => { calls.push(['apply', locale]); return { available: true, ok: true, changed: changes.shift() ?? 0 } },
  }
}

test('apply matches descriptions on start and on a language change, and turns on the restart notice', async () => {
  const h = host('ko')
  const sync = fakeSync([0, 5])
  const plugin = apply(h.ctx, { roots: fixture(), overlay: '/nonexistent.json', sync })
  await plugin.ready
  assert.equal(plugin.state.restart, false)
  assert.equal(h.routes[0].path, ROUTE_PATH)

  let body = await (await h.routes[0].fetch()).json()
  assert.equal(body.locale, 'ko')
  assert.equal(body.restart, false)
  assert.equal(body.hints['gstack-cso'], '[--diff 변경분만 | --code 코드]')

  await h.setLocale('en')
  assert.deepEqual(sync.calls, [['apply', 'ko'], ['apply', 'en']])
  body = await (await h.routes[0].fetch()).json()
  assert.deepEqual(body, { locale: 'en', hints: {}, labels: {}, restart: true })
})

test('the command is registered in the DSH language and re-registered when it changes', async () => {
  const h = host('ko')
  apply(h.ctx, { roots: fixture(), overlay: '/nonexistent.json', sync: fakeSync() })
  assert.equal(h.commands.length, 1)
  assert.equal(h.commands[0].name, COMMAND)
  assert.match(h.commands[0].description, /스킬 메뉴/u)
  assert.equal(h.commands[0].input.hint, '[sync]')
  await h.setLocale('en')
  assert.equal(h.commands.length, 1)
  assert.match(h.commands[0].description, /skill menu/u)
})

test('/skill-hints reports, /skill-hints sync rewrites, anything else is an error', async () => {
  const h = host('ko')
  const sync = fakeSync([0, 3])
  const { handler } = apply(h.ctx, { roots: fixture(), overlay: '/nonexistent.json', sync, script: '/x/dsh-sync-skills' })

  const report = await handler({ rawInput: '' })
  assert.equal(report.kind, 'success')
  assert.match(report.text, /언어: 한국어/u)
  assert.match(report.text, /스킬: 4개 \(사용자 전용 3개, 입력 안내 있음 1개\)/u)
  assert.match(report.text, /맞출 것이 2건 있어요/u)

  const synced = await handler({ rawInput: ' SYNC ' })
  assert.equal(synced.kind, 'success')
  assert.match(synced.text, /스킬 메뉴 3건을 맞췄어요/u)
  assert.match(synced.text, /⌘Q/u)

  const bad = await handler({ rawInput: 'nope' })
  assert.equal(bad.kind, 'error')
  assert.match(bad.text, /"nope"/u)
})

test('reportText names a missing script and lists skills without a Korean summary', () => {
  const t = (key, vars) => `${key}${vars ? JSON.stringify(vars) : ''}`
  const skills = [{ name: 'a', userOnly: true }, { name: 'b', userOnly: true, summary: '요약' }, { name: 'c', userOnly: false }]
  const text = reportText(t, { locale: 'ko', skills, check: { available: false }, restart: false, script: '/x/s' })
  assert.match(text, /missing\{"count":1\}: a/u)
  assert.match(text, /scriptMissing\{"path":"\/x\/s"\}/u)
  assert.doesNotMatch(text, /restart/u)
  assert.doesNotMatch(reportText(t, { locale: 'en', skills, restart: true }), /missing/u)
})
