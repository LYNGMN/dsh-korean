import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { FreeAutoProvider, QUOTA_COOLDOWN_MS, apply, errorDetail } from '../index.js'
import {
  PROVIDER_IDS,
  buildRequest,
  clip,
  decodeBingUrl,
  isKoreanQuery,
  looksRelevant,
  normalizeSettings,
  parseMcpMessage,
  parseResponse
} from '../free-core.js'

const SETTINGS = normalizeSettings({ bingMarket: 'ko-KR' })
const PARSE = { query: 'q', count: 8, keyed: false }

function register(config = {}, credentials = {}) {
  const providers = []
  const tools = []
  const commands = []
  const ctx = {
    get: (name) => (name === 'credentials' ? { resolve: async (ref) => (credentials[ref] ? { value: credentials[ref] } : undefined) } : undefined),
    web: { registerSearchProvider: (p) => providers.push(p) },
    tools: { register: (tool) => tools.push(tool) },
    commands: { register: (command) => commands.push(command) }
  }
  apply(ctx, config)
  return { providers, tools, commands }
}

/** One registered provider by id. */
function provider(id, config, credentials) {
  return register(config, credentials).providers.find((p) => p.id === id)
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

test('apply registers ten engines plus the automatic one, the free_search tool and /search', () => {
  const { providers, tools, commands } = register()
  assert.deepEqual(providers.map((p) => p.id), [...PROVIDER_IDS, 'auto'])
  for (const p of providers) {
    assert.equal(p.available(), true)
    assert.ok(p.title)
    assert.match(p.description.ko, /[가-힣]/)
    assert.ok(p.description.en)
  }
  assert.deepEqual(tools.map((tool) => tool.name), ['free_search'])
  assert.deepEqual(tools[0].parameters.properties.engine.enum, ['auto', ...PROVIDER_IDS])
  assert.deepEqual(commands.map((command) => command.name), ['search'])
})

test('the providers list in the config limits what is registered and the automatic order follows it', () => {
  const { providers } = register({ providers: ['bing', 'tavily', 'nope'] })
  assert.deepEqual(providers.map((p) => p.id), ['tavily', 'bing', 'auto'])
  const settings = normalizeSettings({ providers: ['bing', 'naver'], freeOrder: { ko: ['bing', 'naver', 'naver', 'x'] } })
  assert.deepEqual(settings.freeOrder, { ko: ['bing', 'naver'], en: ['naver', 'bing'] })
})

test('the bundle patch does not pick web.searchProvider and names every key', async () => {
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(patch, /^- id: web\b/m)
  for (const names of Object.values(SETTINGS.keyNames)) for (const name of names) assert.match(patch, new RegExp(name))
})

test('keyless and keyed requests go to the right endpoint with the right headers', () => {
  const base = { query: 'q', count: 5, settings: SETTINGS }
  const tavilyFree = buildRequest('tavily', { ...base })
  assert.equal(tavilyFree.init.headers['x-tavily-access-mode'], 'keyless')
  assert.equal(JSON.parse(tavilyFree.init.body).max_results, 5)
  assert.equal(buildRequest('tavily', { ...base, keys: ['k1'] }).init.headers.authorization, 'Bearer k1')

  assert.match(buildRequest('you', base).url, /^https:\/\/api\.you\.com\/v1\/agents\/search\?query=q&count=5$/)
  const youKeyed = buildRequest('you', { ...base, keys: ['k2'] })
  assert.match(youKeyed.url, /^https:\/\/ydc-index\.io\/v1\/search\?/)
  assert.equal(youKeyed.init.headers['x-api-key'], 'k2')

  const parallelFree = buildRequest('parallel', base)
  assert.equal(parallelFree.url, 'https://search.parallel.ai/mcp')
  assert.deepEqual(JSON.parse(parallelFree.init.body).params, { name: 'web_search', arguments: { objective: 'q', search_queries: ['q'] } })
  assert.equal(buildRequest('parallel', { ...base, keys: ['k3'] }).url, 'https://api.parallel.ai/v1/search')

  assert.equal(JSON.parse(buildRequest('keenable', base).init.body).params.name, 'search_web_pages')
  assert.equal(buildRequest('keenable', { ...base, keys: ['k4'] }).url, 'https://api.keenable.ai/v1/search')

  const bing = new URL(buildRequest('bing', base).url)
  assert.equal(bing.searchParams.get('mkt'), 'ko-KR')
  assert.equal(bing.searchParams.get('adlt'), 'moderate')

  const firecrawl = buildRequest('firecrawl', { ...base, count: 20 })
  assert.equal(JSON.parse(firecrawl.init.body).limit, 10)
  assert.equal(firecrawl.init.headers.authorization, undefined)
  assert.equal(buildRequest('firecrawl', { ...base, keys: ['k5'] }).init.headers.authorization, 'Bearer k5')

  const tinyfish = buildRequest('tinyfish', { ...base, keys: ['k6'] })
  assert.equal(tinyfish.url, 'https://api.search.tinyfish.ai/?query=q')
  assert.equal(tinyfish.init.headers['x-api-key'], 'k6')

  const jina = buildRequest('jina', { ...base, keys: ['k7'] })
  assert.equal(jina.url, 'https://s.jina.ai/?q=q')
  assert.equal(jina.init.headers.authorization, 'Bearer k7')

  const naver = buildRequest('naver', { ...base, keys: ['id8', 'secret8'] })
  assert.equal(naver.url, 'https://openapi.naver.com/v1/search/webkr.json?query=q&display=5')
  assert.equal(naver.init.headers['x-naver-client-id'], 'id8')
  assert.equal(naver.init.headers['x-naver-client-secret'], 'secret8')

  const kakao = buildRequest('kakao', { ...base, count: 60, keys: ['k9'] })
  assert.equal(kakao.url, 'https://dapi.kakao.com/v2/search/web?query=q&size=50')
  assert.equal(kakao.init.headers.authorization, 'KakaoAK k9')
})

test('Tavily and You.com responses become sources', () => {
  const tavily = parseResponse('tavily', JSON.stringify({ results: [{ url: 'https://a.example', title: 'A', content: 'alpha' }, { url: 'https://a.example/', title: 'dup' }, { title: 'no url' }] }), PARSE)
  assert.deepEqual(tavily.sources, [{ url: 'https://a.example', title: 'A', snippet: 'alpha' }])
  const you = parseResponse('you', JSON.stringify({ results: { web: [{ url: 'https://y.example', title: 'Y', description: 'd', snippets: ['one', 'two'] }] } }), PARSE)
  assert.deepEqual(you.sources, [{ url: 'https://y.example', title: 'Y', snippet: 'one two' }])
})

test('Naver, Kakao, Firecrawl, TinyFish and Jina responses become sources', () => {
  const naver = parseResponse('naver', JSON.stringify({ items: [{ title: '<b>서울</b> 날씨', link: 'https://n.example', description: '오늘 <b>서울</b>은 맑음' }] }), { ...PARSE, query: '서울 날씨' })
  assert.deepEqual(naver.sources, [{ url: 'https://n.example', title: '서울 날씨', snippet: '오늘 서울은 맑음' }])
  const kakao = parseResponse('kakao', JSON.stringify({ documents: [{ title: '다음 <b>뉴스</b>', url: 'https://k.example', contents: '내용 &amp; 요약', datetime: '2026-11-16T09:00:00.000+09:00' }] }), PARSE)
  assert.deepEqual(kakao.sources, [{ url: 'https://k.example', title: '다음 뉴스', snippet: '내용 & 요약', publishedAt: '2026-11-16T09:00:00.000+09:00' }])
  const firecrawl = parseResponse('firecrawl', JSON.stringify({ success: true, data: { web: [{ url: 'https://f.example', title: 'F', description: 'fd' }] } }), PARSE)
  assert.deepEqual(firecrawl.sources, [{ url: 'https://f.example', title: 'F', snippet: 'fd' }])
  const tinyfish = parseResponse('tinyfish', JSON.stringify({ results: [{ position: 1, url: 'https://t.example', title: 'T', snippet: 'ts' }] }), PARSE)
  assert.deepEqual(tinyfish.sources, [{ url: 'https://t.example', title: 'T', snippet: 'ts' }])
  const jina = parseResponse('jina', JSON.stringify({ code: 200, data: [{ url: 'https://j.example', title: 'J', description: 'jd', content: 'long' }] }), PARSE)
  assert.deepEqual(jina.sources, [{ url: 'https://j.example', title: 'J', snippet: 'jd' }])
})

test('Parallel MCP answers in plain JSON and in SSE both parse, and markdown noise is cleaned', () => {
  const payload = { results: [{ url: 'https://nodejs.org/x', title: 'Node', publish_date: '2025-05-06', excerpts: ['', '[](github.com/nodejs/node)\n\n# Node.js 24\nnotes'] }] }
  const message = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } }
  const expected = [{ url: 'https://nodejs.org/x', title: 'Node', snippet: 'Node.js 24 notes', publishedAt: '2025-05-06' }]
  assert.deepEqual(parseResponse('parallel', JSON.stringify(message), { ...PARSE, query: 'node' }).sources, expected)
  const sse = `event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: ${JSON.stringify(message)}\n\n`
  assert.deepEqual(parseResponse('parallel', sse, { ...PARSE, query: 'node' }).sources, expected)
  assert.equal(parseMcpMessage('event: x\ndata: not json\n\n'), undefined)
})

test('a Parallel rate-limit error inside HTTP 200 is a quota failure, not zero results', async (t) => {
  const parallel = provider('parallel')
  stubFetch(t, () => json({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: "You've hit the free-tier rate limit for Parallel MCP." } }))
  await assert.rejects(parallel.search({ query: 'q' }), (error) => error.code === 'WEB_PROVIDER_ERROR' && error.quota === true && /rate limit/.test(error.message))
})

test('Keenable MCP text blocks parse, HTML in snippets is removed and unrelated pages count as no results', () => {
  const text = 'Title: Node changelog\nURL: https://raw.example/CHANGELOG.md\nAcquired: 2026-11-03\nSnippets:\n<th>LTS &amp; Current</th>\nsecond line\n\nTitle: No url here\nSnippets:\nx'
  const body = JSON.stringify({ result: { content: [{ type: 'text', text }] } })
  const parsed = parseResponse('keenable', body, { ...PARSE, query: 'node changelog' })
  assert.deepEqual(parsed.sources, [{ url: 'https://raw.example/CHANGELOG.md', title: 'Node changelog', snippet: 'LTS & Current second line', publishedAt: '2026-11-03' }])
  assert.deepEqual(parseResponse('keenable', body, { ...PARSE, query: '서울 날씨' }).sources, [])
})

test('Bing result pages parse, wrapped links are unwrapped and a human-check page is an error', () => {
  const real = 'https://ko.wikipedia.org/wiki/서울'
  const wrapped = `https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1${Buffer.from(real).toString('base64url')}&amp;ntb=1`
  const html = `<ol><li class="b_algo"><h2><a href="${wrapped}">서울 <strong>날씨</strong></a></h2><p>오늘 서울&nbsp;날씨 &#39;맑음&#39;</p></li>` +
    '<li class="b_algo"><h2><a href="https://weather.example/seoul">Seoul</a></h2></li></ol>'
  const parsed = parseResponse('bing', html, { ...PARSE, query: '서울 날씨' })
  assert.deepEqual(parsed.sources, [
    { url: real, title: '서울 날씨', snippet: "오늘 서울 날씨 '맑음'" },
    { url: 'https://weather.example/seoul', title: 'Seoul' }
  ])
  assert.equal(decodeBingUrl('https://www.bing.com/ck/a?p=1'), undefined)
  assert.throws(() => parseResponse('bing', '<html>Please solve this captcha</html>', PARSE), /human-check/)
  assert.deepEqual(parseResponse('bing', '<html>nothing</html>', PARSE).sources, [])
})

test('the search uses a stored key when there is one and the keyless tier otherwise', async (t) => {
  const calls = stubFetch(t, () => json({ results: [{ url: 'https://t.example', title: 'T' }] }))
  await provider('tavily').search({ query: 'q', maxResults: 3 })
  assert.equal(calls[0].init.headers['x-tavily-access-mode'], 'keyless')
  assert.equal(JSON.parse(calls[0].init.body).max_results, 3)
  assert.equal(calls[0].init.headers['user-agent'], 'dsh-search-free/1.1.0')

  await provider('tavily', {}, { TAVILY_API_KEY: 'secret-tavily' }).search({ query: 'q' })
  assert.equal(calls[1].init.headers.authorization, 'Bearer secret-tavily')
})

test('engines that need a key fail fast without one and never call out', async (t) => {
  const calls = stubFetch(t, () => json({}))
  for (const id of ['tinyfish', 'jina', 'kakao']) {
    await assert.rejects(provider(id).search({ query: 'q' }), (error) => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING')
  }
  // Naver needs both its id and its secret.
  await assert.rejects(provider('naver', {}, { NAVER_CLIENT_ID: 'only-id' }).search({ query: 'q' }), /NAVER_CLIENT_SECRET/)
  assert.equal(calls.length, 0)
})

test('HTTP errors are reported without the key; Firecrawl keyless 403 says why', async (t) => {
  const tavily = provider('tavily', {}, { TAVILY_API_KEY: 'secret-tavily' })
  const you = provider('you')
  const firecrawl = provider('firecrawl')
  stubFetch(t, (url) => {
    if (url.includes('tavily')) return new Response('bad key secret-tavily', { status: 401 })
    if (url.includes('firecrawl')) return new Response('forbidden', { status: 403 })
    return new Response('slow down', { status: 429 })
  })
  await assert.rejects(tavily.search({ query: 'q' }), (error) => /rejected the API key \(HTTP 401\)/.test(error.message) && !error.message.includes('secret-tavily'))
  await assert.rejects(you.search({ query: 'q' }), (error) => error.quota === true && /rate limit or quota reached \(HTTP 429\)/.test(error.message))
  await assert.rejects(firecrawl.search({ query: 'q' }), /VPN or proxy/)
  assert.equal(errorDetail('x secret y', ['secret']), 'x *** y')
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

// ---- automatic order ------------------------------------------------------

function fake(id, behaviour) {
  return {
    id,
    title: id.toUpperCase(),
    calls: 0,
    async search() {
      this.calls += 1
      return behaviour()
    }
  }
}
const found = (url) => () => ({ sources: [{ url }], truncated: false })
const nothing = () => ({ sources: [], truncated: false })
const fails = (message, extra = {}) => () => { throw Object.assign(new Error(message), { code: 'WEB_PROVIDER_ERROR', ...extra }) }

function auto(map, { now = () => 0, order } = {}) {
  const providers = new Map(Object.entries(map).map(([id, behaviour]) => [id, fake(id, behaviour)]))
  const settings = normalizeSettings({ freeOrder: order })
  return { auto: new FreeAutoProvider({ providers, settings, now }), providers }
}

test('the automatic order starts with Naver for Korean queries and with You.com otherwise', async () => {
  assert.equal(isKoreanQuery('서울 날씨'), true)
  assert.equal(isKoreanQuery('Seoul weather'), false)
  const { auto: a, providers } = auto({ naver: found('https://n.example'), you: found('https://y.example') })
  assert.deepEqual(await a.search({ query: '서울 날씨' }), { sources: [{ url: 'https://n.example' }], truncated: false, answeredBy: 'NAVER' })
  assert.equal((await a.search({ query: 'Seoul weather' })).sources[0].url, 'https://y.example')
  assert.equal(providers.get('naver').calls, 1)
})

test('the automatic order moves on after a failure, a missing key or no results', async () => {
  const { auto: a, providers } = auto({
    naver: fails('no key', { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' }),
    kakao: nothing,
    you: fails('HTTP 500'),
    parallel: found('https://p.example'),
    bing: found('https://b.example')
  })
  const result = await a.search({ query: '한국어 질문' })
  assert.equal(result.sources[0].url, 'https://p.example')
  assert.equal(result.answeredBy, 'PARALLEL')
  assert.equal(providers.get('bing').calls, 0)
})

test('a provider that hit its quota rests for ten minutes, then is tried again', async () => {
  let clock = 0
  const { auto: a, providers } = auto({ you: fails('HTTP 429', { quota: true }), bing: found('https://b.example') }, { now: () => clock })
  await a.search({ query: 'q' })
  await a.search({ query: 'q' })
  assert.equal(providers.get('you').calls, 1)
  clock = QUOTA_COOLDOWN_MS + 1
  await a.search({ query: 'q' })
  assert.equal(providers.get('you').calls, 2)
})

test('when every engine fails the error lists why; an empty answer still wins', async () => {
  const { auto: a } = auto({ you: fails('HTTP 500'), naver: fails('x', { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' }) })
  await assert.rejects(a.search({ query: 'q' }), /every engine failed\. you: HTTP 500; naver: no key/)
  const { auto: b } = auto({ you: nothing, bing: fails('HTTP 500') })
  assert.deepEqual((await b.search({ query: 'q' })).sources, [])
  const { auto: c } = auto({})
  await assert.rejects(c.search({ query: 'q' }), /no engine is enabled/)
})

test('a cancelled automatic search stops at once', async () => {
  const { auto: a, providers } = auto({ you: fails('aborted', { code: 'WEB_ABORTED' }), bing: found('https://b.example') })
  await assert.rejects(a.search({ query: 'q' }), (error) => error.code === 'WEB_ABORTED')
  assert.equal(providers.get('bing').calls, 0)
})

test('helpers: clip by code point and relevance by query words', () => {
  assert.equal(clip('가나다라', 3), '가나…')
  assert.equal(clip('😀😀', 5), '😀😀')
  assert.equal(looksRelevant('서울 날씨', [{ url: 'https://x.example', title: '부산 소식' }]), false)
  assert.equal(looksRelevant('서울 날씨', [{ url: 'https://x.example', title: '오늘 서울의 하늘' }]), true)
  assert.equal(looksRelevant('???', [{ url: 'https://x.example' }]), true)
})
