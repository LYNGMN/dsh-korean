import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'

test('apply registers the brave provider, the brave_search tool and the /brave command', async (t) => {
  const providers = []
  const tools = []
  const commands = []
  const ctx = {
    get: (name) => (name === 'credentials' ? { resolve: async () => ({ value: 'test-brave-key' }) } : undefined),
    web: { registerSearchProvider: (p) => providers.push(p) },
    tools: { register: (tool) => tools.push(tool) },
    commands: { register: (command) => commands.push(command) }
  }
  apply(ctx, { apiKeyFile: '/nonexistent/dsh-brave-test-key' })
  assert.deepEqual(providers.map((p) => p.id), ['brave'])
  assert.deepEqual(tools.map((tool) => tool.name), ['brave_search'])
  assert.deepEqual(commands.map((command) => command.name), ['brave'])

  const real = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({ web: { results: [{ url: 'https://b.example', title: 'B', description: 'desc' }] } }), { status: 200 })
  }
  t.after(() => { globalThis.fetch = real })
  const value = await tools[0].execute({ query: 'q', max_results: 2 }, {})
  assert.equal(value.sources[0].url, 'https://b.example')
  assert.equal(new URL(calls[0].url).searchParams.get('count'), '2')
  assert.equal(calls[0].init.headers['x-subscription-token'], 'test-brave-key')
  assert.match(tools[0].output.render({}, value)[0].text, /Results from Brave\./)

  const steered = []
  assert.equal(commands[0].handler({ rawInput: '오늘 날씨', agent: { steer: (m) => steered.push(m) } }).kind, 'success')
  assert.match(steered[0].content[0].text, /brave_search tool/)
})

test('the bundle does not reference any other search bundle', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const file of ['index.js', 'brave-core.js', 'search-tool.js', 'client.js', 'cordis.patch.yml', 'locale/ko.json', 'locale/en.json']) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(text, /\bexa\b/i, `${file} mentions Exa`)
  }
})
