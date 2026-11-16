import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { apply, errorDetail } from '../index.js'
import {
  buildRequest,
  clip,
  decodeBingUrl,
  looksRelevant,
  normalizeSettings,
  parseMcpMessage,
  parseResponse
} from '../free-core.js'

const SETTINGS = normalizeSettings({ bingMarket: 'ko-KR' })

function register(config = {}, credentials = {}) {
  const providers = []
  const ctx = {
    get: (name) => (name === 'credentials' ? { resolve: async (ref) => (credentials[ref] ? { value: credentials[ref] } : undefined) } : undefined),
    web: { registerSearchProvider: (p) => providers.push(p) }
  }
  apply(ctx, config)
  return providers
}

/** One registered provider by id. */
function provider(id, config, credentials) {
  return register(config, credentials).find((p) => p.id === id)
}

function stubFetch(t, respond) {
  const real = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return respond(String(url), init)
  }
  t.after(() => { globalThis.fetch = real })
  return calls
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

test('apply registers the five providers in fallback order and touches nothing else', () => {
  const providers = register()
  assert.deepEqual(providers.map((p) => p.id), ['you', 'parallel', 'keenable', 'tavily', 'bing'])
  for (const p of providers) {
    assert.equal(p.available(), true)
    assert.ok(p.title)
    assert.match(p.description.ko, /[가-힣]/)
    assert.ok(p.description.en)
  }
})

test('the providers list in the config limits what is registered', () => {
  assert.deepEqual(register({ providers: ['bing', 'tavily', 'nope'] }).map((p) => p.id), ['tavily', 'bing'])
})

test('the bundle patch does not pick web.searchProvider', async () => {
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(patch, /^- id: web\b/m)
})

test('keyless and keyed requests go to the right endpoint with the right headers', () => {
  const base = { query: 'q', count: 5, settings: SETTINGS }
  const tavilyFree = buildRequest('tavily', { ...base, apiKey: '' })
  assert.equal(tavilyFree.init.headers['x-tavily-access-mode'], 'keyless')
  assert.equal(JSON.parse(tavilyFree.init.body).max_results, 5)
  assert.equal(buildRequest('tavily', { ...base, apiKey: 'k1' }).init.headers.authorization, 'Bearer k1')

  assert.match(buildRequest('you', { ...base, apiKey: '' }).url, /^https:\/\/api\.you\.com\/v1\/agents\/search\?query=q&count=5$/)
  const youKeyed = buildRequest('you', { ...base, apiKey: 'k2' })
  assert.match(youKeyed.url, /^https:\/\/ydc-index\.io\/v1\/search\?/)
  assert.equal(youKeyed.init.headers['x-api-key'], 'k2')

  const parallelFree = buildRequest('parallel', { ...base, apiKey: '' })
  assert.equal(parallelFree.url, 'https://search.parallel.ai/mcp')
  assert.deepEqual(JSON.parse(parallelFree.init.body).params, { name: 'web_search', arguments: { objective: 'q', search_queries: ['q'] } })
  assert.equal(buildRequest('parallel', { ...base, apiKey: 'k3' }).url, 'https://api.parallel.ai/v1/search')

  assert.equal(JSON.parse(buildRequest('keenable', { ...base, apiKey: '' }).init.body).params.name, 'search_web_pages')
  assert.equal(buildRequest('keenable', { ...base, apiKey: 'k4' }).url, 'https://api.keenable.ai/v1/search')

  const bing = new URL(buildRequest('bing', { ...base, apiKey: '' }).url)
  assert.equal(bing.searchParams.get('mkt'), 'ko-KR')
  assert.equal(bing.searchParams.get('adlt'), 'moderate')
})

test('Tavily and You.com responses become sources', () => {
  const tavily = parseResponse('tavily', JSON.stringify({ results: [{ url: 'https://a.example', title: 'A', content: 'alpha' }, { url: 'https://a.example/', title: 'dup' }, { title: 'no url' }] }), { query: 'q', count: 8, keyed: false })
  assert.deepEqual(tavily.sources, [{ url: 'https://a.example', title: 'A', snippet: 'alpha' }])
  const you = parseResponse('you', JSON.stringify({ results: { web: [{ url: 'https://y.example', title: 'Y', description: 'd', snippets: ['one', 'two'] }] } }), { query: 'q', count: 8, keyed: false })
  assert.deepEqual(you.sources, [{ url: 'https://y.example', title: 'Y', snippet: 'one two' }])
})

test('Parallel MCP answers in plain JSON and in SSE both parse, and markdown noise is cleaned', () => {
  const payload = { results: [{ url: 'https://nodejs.org/x', title: 'Node', publish_date: '2025-05-06', excerpts: ['', '[](github.com/nodejs/node)\n\n# Node.js 24\nnotes'] }] }
  const message = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } }
  const expected = [{ url: 'https://nodejs.org/x', title: 'Node', snippet: 'Node.js 24 notes', publishedAt: '2025-05-06' }]
  assert.deepEqual(parseResponse('parallel', JSON.stringify(message), { query: 'node', count: 8, keyed: false }).sources, expected)
  const sse = `event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: ${JSON.stringify(message)}\n\n`
  assert.deepEqual(parseResponse('parallel', sse, { query: 'node', count: 8, keyed: false }).sources, expected)
  assert.equal(parseMcpMessage('event: x\ndata: not json\n\n'), undefined)
})

test('a Parallel rate-limit error inside HTTP 200 is a failure, not zero results', async (t) => {
  const parallel = provider('parallel')
  stubFetch(t, () => json({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: "You've hit the free-tier rate limit for Parallel MCP." } }))
  await assert.rejects(parallel.search({ query: 'q' }), (error) => error.code === 'WEB_PROVIDER_ERROR' && /rate limit/.test(error.message))
})

test('Keenable MCP text blocks parse, HTML in snippets is removed and unrelated pages count as no results', () => {
  const text = 'Title: Node changelog\nURL: https://raw.example/CHANGELOG.md\nAcquired: 2026-11-03\nSnippets:\n<th>LTS &amp; Current</th>\nsecond line\n\nTitle: No url here\nSnippets:\nx'
  const body = JSON.stringify({ result: { content: [{ type: 'text', text }] } })
  const parsed = parseResponse('keenable', body, { query: 'node changelog', count: 8, keyed: false })
  assert.deepEqual(parsed.sources, [{ url: 'https://raw.example/CHANGELOG.md', title: 'Node changelog', snippet: 'LTS & Current second line', publishedAt: '2026-11-03' }])
  assert.deepEqual(parseResponse('keenable', body, { query: '서울 날씨', count: 8, keyed: false }).sources, [])
})

test('Bing result pages parse, wrapped links are unwrapped and a human-check page is an error', () => {
  const real = 'https://ko.wikipedia.org/wiki/서울'
  const wrapped = `https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1${Buffer.from(real).toString('base64url')}&amp;ntb=1`
  const html = `<ol><li class="b_algo"><h2><a href="${wrapped}">서울 <strong>날씨</strong></a></h2><p>오늘 서울&nbsp;날씨 &#39;맑음&#39;</p></li>` +
    '<li class="b_algo"><h2><a href="https://weather.example/seoul">Seoul</a></h2></li></ol>'
  const parsed = parseResponse('bing', html, { query: '서울 날씨', count: 8, keyed: false })
  assert.deepEqual(parsed.sources, [
    { url: real, title: '서울 날씨', snippet: "오늘 서울 날씨 '맑음'" },
    { url: 'https://weather.example/seoul', title: 'Seoul' }
  ])
  assert.equal(decodeBingUrl('https://www.bing.com/ck/a?p=1'), undefined)
  assert.throws(() => parseResponse('bing', '<html>Please solve this captcha</html>', { query: 'q', count: 8, keyed: false }), /human-check/)
  assert.deepEqual(parseResponse('bing', '<html>nothing</html>', { query: 'q', count: 8, keyed: false }).sources, [])
})

test('the search uses a stored key when there is one and the keyless tier otherwise', async (t) => {
  const calls = stubFetch(t, () => json({ results: [{ url: 'https://t.example', title: 'T' }] }))
  const keyless = provider('tavily')
  await keyless.search({ query: 'q', maxResults: 3 })
  assert.equal(calls[0].init.headers['x-tavily-access-mode'], 'keyless')
  assert.equal(JSON.parse(calls[0].init.body).max_results, 3)
  assert.equal(calls[0].init.headers['user-agent'], 'dsh-search-free/1.0.0')

  const keyed = provider('tavily', {}, { TAVILY_API_KEY: 'secret-tavily' })
  await keyed.search({ query: 'q' })
  assert.equal(calls[1].init.headers.authorization, 'Bearer secret-tavily')
})

test('HTTP errors are reported without the key', async (t) => {
  const tavily = provider('tavily', {}, { TAVILY_API_KEY: 'secret-tavily' })
  const you = provider('you')
  stubFetch(t, (url) => (url.includes('tavily') ? new Response('bad key secret-tavily', { status: 401 }) : new Response('slow down', { status: 429 })))
  await assert.rejects(tavily.search({ query: 'q' }), (error) => /rejected the API key \(HTTP 401\)/.test(error.message) && !error.message.includes('secret-tavily'))
  await assert.rejects(you.search({ query: 'q' }), /rate limit or quota reached \(HTTP 429\)/)
  assert.equal(errorDetail('x secret y', 'secret'), 'x *** y')
})

test('server errors and network failures become provider errors', async (t) => {
  const tavily = provider('tavily')
  let mode = 'http'
  stubFetch(t, () => {
    if (mode === 'http') return new Response('oops', { status: 503 })
    throw new TypeError('fetch failed')
  })
  await assert.rejects(tavily.search({ query: 'q' }), (error) => error.code === 'WEB_PROVIDER_ERROR' && /HTTP 503: oops/.test(error.message))
  mode = 'network'
  await assert.rejects(tavily.search({ query: 'q' }), /request failed: fetch failed/)
})

test('an empty query is refused and a cancelled search stops with WEB_ABORTED', async (t) => {
  const tavily = provider('tavily')
  await assert.rejects(tavily.search({ query: '  ' }), /non-empty query/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(tavily.search({ query: 'q' }, controller.signal), (error) => error.code === 'WEB_ABORTED')

  const running = new AbortController()
  stubFetch(t, (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason))
  }))
  const pending = tavily.search({ query: 'q' }, running.signal)
  running.abort()
  await assert.rejects(pending, (error) => error.code === 'WEB_ABORTED')
})

test('a provider that does not answer in time fails with a timeout message', async (t) => {
  const tavily = provider('tavily', { timeoutMs: 1000 })
  stubFetch(t, (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason))
  }))
  await assert.rejects(tavily.search({ query: 'q' }), /did not answer within 1s/)
})

test('helpers: clip by code point and relevance by query words', () => {
  assert.equal(clip('가나다라', 3), '가나…')
  assert.equal(clip('😀😀', 5), '😀😀')
  assert.equal(looksRelevant('서울 날씨', [{ url: 'https://x.example', title: '부산 소식' }]), false)
  assert.equal(looksRelevant('서울 날씨', [{ url: 'https://x.example', title: '오늘 서울의 하늘' }]), true)
  assert.equal(looksRelevant('???', [{ url: 'https://x.example' }]), true)
})
