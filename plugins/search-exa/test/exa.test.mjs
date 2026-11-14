import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, ExaSearchProvider } from '../index.js'
import { buildSearchBody, mapExaResponse, normalizeSettings } from '../exa-core.js'

const KEY = 'test-exa-key-0000'
const NO_FILE = '/nonexistent/dsh-exa-test-key'

function hostCtx(store = new Map([['EXA_API_KEY', KEY]])) {
  return {
    get(name) {
      if (name === 'credentials') return { resolve: async (ref) => (store.has(ref) ? { value: store.get(ref) } : undefined) }
      return undefined
    }
  }
}

/** Replace global fetch for one test and record every call. */
function stubFetch(t, respond) {
  const calls = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return respond(url, init)
  }
  t.after(() => { globalThis.fetch = real })
  return calls
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('normalizeSettings fills defaults and caps the result count', () => {
  const s = normalizeSettings({})
  assert.equal(s.endpoint, 'https://api.exa.ai/search')
  assert.equal(s.apiKeyEnv, 'EXA_API_KEY')
  assert.equal(s.type, 'auto')
  assert.equal(s.count, 8)
  assert.equal(normalizeSettings({ count: 500 }).count, 25)
  assert.equal(normalizeSettings({ count: -1 }).count, 8)
})

test('buildSearchBody honors maxResults within the 25-result tier', () => {
  const s = normalizeSettings({})
  assert.deepEqual(buildSearchBody(s, { query: 'q' }), {
    query: 'q', numResults: 8, type: 'auto', contents: { highlights: { maxCharacters: 400 } }
  })
  assert.equal(buildSearchBody(s, { query: 'q', maxResults: 3 }).numResults, 3)
  assert.equal(buildSearchBody(s, { query: 'q', maxResults: 99 }).numResults, 25)
})

test('mapExaResponse maps, de-duplicates and prefers highlights for the snippet', () => {
  const out = mapExaResponse({
    results: [
      { url: 'https://a.example', title: ' A ', highlights: ['one', 'two'], publishedDate: '2026-11-13T00:00:00.000Z' },
      { url: 'https://a.example', title: 'dup' },
      { url: 'https://b.example', summary: 'sum', text: 'ignored' },
      { url: 'https://c.example', text: 'x'.repeat(50) },
      { title: 'no url' },
      null
    ]
  }, 10)
  assert.deepEqual(out, {
    truncated: false,
    sources: [
      { url: 'https://a.example', title: 'A', snippet: 'one … two', publishedAt: '2026-11-13T00:00:00.000Z' },
      { url: 'https://b.example', snippet: 'sum' },
      { url: 'https://c.example', snippet: `${'x'.repeat(10)}…` }
    ]
  })
  assert.deepEqual(mapExaResponse({}), { sources: [], truncated: false })
})

test('ExaSearchProvider posts the query with the stored key', async (t) => {
  const calls = stubFetch(t, () => json(200, { results: [{ url: 'https://n.example', title: 'Nvidia' }] }))
  const exa = new ExaSearchProvider(hostCtx(), { apiKeyFile: NO_FILE })
  const out = await exa.search({ query: '  Latest news on Nvidia ', maxResults: 3 })
  assert.deepEqual(out.sources, [{ url: 'https://n.example', title: 'Nvidia' }])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.exa.ai/search')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers['x-api-key'], KEY)
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    query: 'Latest news on Nvidia', numResults: 3, type: 'auto', contents: { highlights: { maxCharacters: 400 } }
  })
})

test('ExaSearchProvider redacts the key from error bodies', async (t) => {
  stubFetch(t, () => new Response(`bad key ${KEY}`, { status: 401 }))
  const exa = new ExaSearchProvider(hostCtx(), { apiKeyFile: NO_FILE })
  await assert.rejects(exa.search({ query: 'q' }), (error) => {
    assert.equal(error.code, 'WEB_PROVIDER_ERROR')
    assert.match(error.message, /HTTP 401/)
    assert.doesNotMatch(error.message, new RegExp(KEY))
    assert.match(error.message, /\[redacted\]/)
    return true
  })
})

test('ExaSearchProvider reports a missing key without calling the network', async (t) => {
  const saved = process.env.EXA_API_KEY
  delete process.env.EXA_API_KEY
  t.after(() => { if (saved !== undefined) process.env.EXA_API_KEY = saved })
  const calls = stubFetch(t, () => json(200, { results: [] }))
  const exa = new ExaSearchProvider(hostCtx(new Map()), { apiKeyFile: NO_FILE })
  await assert.rejects(exa.search({ query: 'q' }), { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
  assert.equal(calls.length, 0)
})

test('apply registers the exa provider, the exa_search tool and the /exa command', async (t) => {
  const providers = []
  const tools = []
  const commands = []
  apply({
    ...hostCtx(),
    web: { registerSearchProvider: (p) => providers.push(p) },
    tools: { register: (tool) => tools.push(tool) },
    commands: { register: (command) => commands.push(command) }
  }, { apiKeyFile: NO_FILE })
  assert.deepEqual(providers.map((p) => [p.id, p.title]), [['exa', 'Exa']])
  assert.equal(providers[0].available(), true)
  assert.deepEqual(tools.map((tool) => tool.name), ['exa_search'])
  assert.deepEqual(commands.map((command) => command.name), ['exa'])

  const calls = stubFetch(t, () => json(200, { results: [{ url: 'https://n.example', title: 'Nvidia', highlights: ['h'] }] }))
  const value = await tools[0].execute({ query: ' nvidia ', max_results: 3 }, { signal: undefined })
  assert.deepEqual(value, { sources: [{ url: 'https://n.example', title: 'Nvidia', snippet: 'h' }], truncated: false })
  assert.equal(JSON.parse(calls[0].init.body).numResults, 3)
  const text = tools[0].output.render({}, value)[0].text
  assert.match(text, /^External web content follows/)
  assert.match(text, /Results from Exa\./)
  assert.match(text, /- \[Nvidia\]\(https:\/\/n\.example\) — h/)

  const steered = []
  const ok = commands[0].handler({ rawInput: '  엔비디아 최신 소식 ', agent: { steer: (m) => steered.push(m) } })
  assert.equal(ok.kind, 'success')
  assert.equal(steered[0].role, 'user')
  assert.match(steered[0].content[0].text, /^엔비디아 최신 소식\n\n.*exa_search tool.*instead of web_search/s)
  assert.equal(commands[0].handler({ rawInput: '  ', agent: { steer: () => assert.fail('must not steer') } }).kind, 'error')
})

test('apply does not reference any other search bundle', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const file of ['index.js', 'exa-core.js', 'search-tool.js', 'client.js', 'cordis.patch.yml', 'locale/ko.json', 'locale/en.json']) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(text, /brave/i, `${file} mentions Brave`)
  }
})
