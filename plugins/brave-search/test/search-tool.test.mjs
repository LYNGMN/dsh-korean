import test from 'node:test'
import assert from 'node:assert/strict'
import { commandPrompt, createSearchTool, formatToolOutput, parseToolArgs, registerSearchCommand } from '../search-tool.js'

test('parseToolArgs trims the query, caps max_results and rejects bad input', () => {
  assert.deepEqual(parseToolArgs({ query: '  q ' }), { query: 'q' })
  assert.deepEqual(parseToolArgs({ query: 'q', max_results: 99 }), { query: 'q', maxResults: 20 })
  assert.throws(() => parseToolArgs({ query: '' }), /"query" must be a non-empty string/)
  assert.throws(() => parseToolArgs({ query: 'q', max_results: 0 }), /"max_results" must be a positive integer/)
  assert.throws(() => parseToolArgs({ query: 'q', extra: 1 }), /"extra" is not a known argument/)
  assert.throws(() => parseToolArgs(null), /must be an object/)
})

test('formatToolOutput marks web content as untrusted and handles empty and truncated results', () => {
  assert.match(formatToolOutput('X', { sources: [], truncated: false }), /No results found\./)
  const text = formatToolOutput('X', { sources: [{ url: 'https://a.example/p' }], truncated: true })
  assert.match(text, /- \[a\.example\]\(https:\/\/a\.example\/p\)/)
  assert.match(text, /Showing the first 1 sources/)
})

test('the tool uses only the JSON Schema keywords DSH accepts', () => {
  const allowed = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples'])
  const tool = createSearchTool({ toolName: 'x_search', engine: 'X', provider: { search: async () => ({ sources: [] }) } })
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      assert.ok(allowed.has(key), `${path}.${key} is not a supported keyword`)
      if (key === 'properties') for (const [name, child] of Object.entries(value)) walk(child, `${path}.properties.${name}`)
      if (key === 'items') walk(value, `${path}.items`)
    }
  }
  walk(tool.parameters, 'parameters')
  walk(tool.output.schema, 'output')
  assert.equal(typeof tool.output.render, 'function')
})

test('the tool passes the cancellation signal and drops malformed sources', async () => {
  const controller = new AbortController()
  let seen
  const tool = createSearchTool({
    toolName: 'x_search',
    engine: 'X',
    provider: { search: async (request, signal) => { seen = { request, signal }; return { sources: [{ url: 'u', title: '' }, { title: 'no url' }], truncated: true } } }
  })
  const value = await tool.execute({ query: 'q' }, { signal: controller.signal })
  assert.equal(seen.signal, controller.signal)
  assert.deepEqual(seen.request, { query: 'q' })
  assert.deepEqual(value, { sources: [{ url: 'u' }], truncated: true })
})

test('the command reports a steering failure instead of throwing', () => {
  const commands = []
  registerSearchCommand(localeHost('en', commands).ctx, { commandName: 'x', toolName: 'x_search', engine: 'X', description: 'd' })
  const out = commands[0].handler({ rawInput: 'q', agent: { steer: () => { throw new Error('busy') } } })
  assert.deepEqual(out, { kind: 'error', text: '/x failed: busy' })
  assert.match(commandPrompt('q', 'x_search', 'X'), /x_search tool so that X is used/)
})

/** Fake Host with a stored DSH language (`undefined` = follow the system) and the settings event. */
function localeHost(initial, list = []) {
  const listeners = []
  let preference = initial
  const ctx = {
    get: (name) => (name === 'settings'
      ? { describe: () => [{ ns: 'locale', value: preference === undefined ? {} : { preference } }] }
      : undefined),
    on: (event, listener) => { if (event === 'settings/document-updated') listeners.push(listener); return () => {} },
    commands: {
      register(command) {
        list.push(command)
        return () => { const at = list.indexOf(command); if (at >= 0) list.splice(at, 1) }
      }
    }
  }
  const setLocale = async (next) => {
    preference = next
    for (const listener of listeners) listener('locale', 1)
    await Promise.resolve()
  }
  return { ctx, commands: list, setLocale }
}

async function withSystemLocale(id, run) {
  const original = Intl.DateTimeFormat
  const lang = process.env.LANG
  Intl.DateTimeFormat = function () { return { resolvedOptions: () => ({ locale: id }) } }
  process.env.LANG = `${id.replace('-', '_')}.UTF-8`
  try {
    return await run()
  } finally {
    Intl.DateTimeFormat = original
    if (lang === undefined) delete process.env.LANG
    else process.env.LANG = lang
  }
}

const OPTIONS = { commandName: 'x', toolName: 'x_search', engine: 'X', description: { en: 'Search with X once', ko: 'X로 한 번 검색' } }
const steerOk = { steer() {} }

test('the command follows a Korean DSH language', () => {
  const host = localeHost('ko')
  registerSearchCommand(host.ctx, OPTIONS)
  const [command] = host.commands
  assert.equal(command.description, 'X로 한 번 검색')
  assert.equal(command.input.hint, '<질문>')
  assert.deepEqual(command.handler({ rawInput: ' ', agent: steerOk }), { kind: 'error', text: '사용법: /x <질문>' })
  assert.deepEqual(command.handler({ rawInput: 'q', agent: steerOk }), { kind: 'success', text: 'X로 검색해요.' })
})

test('the command follows an English DSH language', () => {
  const host = localeHost('en')
  registerSearchCommand(host.ctx, OPTIONS)
  const [command] = host.commands
  assert.equal(command.description, 'Search with X once')
  assert.equal(command.input.hint, '<question>')
  assert.deepEqual(command.handler({ rawInput: '', agent: steerOk }), { kind: 'error', text: 'Usage: /x <question>' })
  assert.deepEqual(command.handler({ rawInput: 'q', agent: steerOk }), { kind: 'success', text: 'Searching with X.' })
})

test('an unset DSH language follows the system language', async () => {
  for (const [system, description] of [['ko-KR', 'X로 한 번 검색'], ['en-US', 'Search with X once']]) {
    await withSystemLocale(system, () => {
      const host = localeHost(undefined)
      registerSearchCommand(host.ctx, OPTIONS)
      assert.equal(host.commands[0].description, description, system)
    })
  }
})

test('a language change registers the command again; the model prompt stays the same', async () => {
  const host = localeHost('en')
  registerSearchCommand(host.ctx, OPTIONS)
  const prompts = []
  host.commands[0].handler({ rawInput: 'q', agent: { steer: (m) => prompts.push(m.content[0].text) } })
  await host.setLocale('ko')
  assert.equal(host.commands.length, 1)
  assert.equal(host.commands[0].description, 'X로 한 번 검색')
  host.commands[0].handler({ rawInput: 'q', agent: { steer: (m) => prompts.push(m.content[0].text) } })
  assert.equal(prompts[0], prompts[1])
  const tool = createSearchTool({ toolName: 'x_search', engine: 'X', provider: { search: async () => ({ sources: [] }) } })
  assert.doesNotMatch(tool.description, /[가-힣]/u)
})
