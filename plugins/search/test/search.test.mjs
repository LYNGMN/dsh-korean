import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Config, AutoSearchProvider, KoreaSearchProvider, KOREA_MODES, LEGACY_ORDERS, QUOTA_COOLDOWN_MS, apply, errorDetail, readKeyFile, readWebSearchProvider } from '../index.js'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PROVIDER_IDS,
  buildRequest,
  clip,
  decodeBingUrl,
  normalizeOrder,
  readVolatile,
  resultCount,
  LEGACY_KNOWN_ENGINES,
  looksRelevant,
  normalizeSettings,
  parseMcpMessage,
  parseResponse
} from '../search-core.js'

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

test('apply registers every engine, the automatic and the Korean one, the legacy orders, the tools and the commands', () => {
  const { providers, tools, commands } = register()
  assert.deepEqual(providers.map((p) => p.id), [...PROVIDER_IDS, 'auto', 'korea', 'exa-brave', 'brave-exa', 'exa-brave-auto'])
  for (const p of providers) {
    assert.equal(p.available(), true)
    assert.ok(p.title)
    assert.match(p.description.ko, /[가-힣]/)
    assert.ok(p.description.en)
  }
  assert.deepEqual(tools.map((tool) => tool.name), ['engine_search', 'exa_search', 'brave_search'])
  assert.deepEqual(tools[0].parameters.properties.engine.enum, ['auto', 'korea', 'korea-group', 'korea-seq', ...PROVIDER_IDS])
  assert.equal(tools[1].parameters.properties.engine, undefined)
  assert.deepEqual(commands.map((command) => command.name), ['search', 'exa', 'brave'])
})

test('the providers list in the config limits what is registered and the automatic order follows it', () => {
  const { providers } = register({ providers: ['bing', 'tavily', 'nope'] })
  // The fixed legacy orders need Exa or Brave; exa-brave-auto is the automatic order.
  assert.deepEqual(providers.map((p) => p.id), ['tavily', 'bing', 'auto', 'exa-brave-auto'])
  const settings = normalizeSettings({ providers: ['bing', 'naver'], autoOrder: ['bing', 'naver', 'naver', 'x'] })
  assert.deepEqual(settings.autoOrder(), ['bing', 'naver'])
  assert.deepEqual(normalizeSettings({ providers: ['bing', 'naver'] }).autoOrder(), ['naver', 'bing'])
})

test('the automatic order is a volatile setting: no language priority, read again on every search', () => {
  // The default order does not put Korean engines first; Exa, then Brave lead (2026-11-17 decision).
  assert.deepEqual(normalizeOrder(undefined), PROVIDER_IDS)
  assert.deepEqual(PROVIDER_IDS.slice(0, 3), ['exa', 'brave', 'you'])
  assert.deepEqual(normalizeOrder([]), [])
  assert.deepEqual(normalizeOrder([' kakao', 'you', 'kakao', 'google'], PROVIDER_IDS, PROVIDER_IDS), ['kakao', 'you'])
  // An order saved before Exa and Brave existed (no autoKnown) gets them at their default place.
  assert.deepEqual(normalizeOrder(['kakao', 'you']), ['kakao', 'exa', 'brave', 'you'])
  assert.deepEqual(normalizeOrder(LEGACY_KNOWN_ENGINES), PROVIDER_IDS)
  assert.deepEqual(normalizeOrder(['bing']), ['exa', 'brave', 'bing'])
  // Once the page saves autoKnown, an unchecked Exa or Brave stays out.
  assert.deepEqual(normalizeOrder(['kakao', 'you'], PROVIDER_IDS, PROVIDER_IDS), ['kakao', 'you'])
  assert.equal(readVolatile({ get: () => ['bing'] })[0], 'bing')
  assert.equal(readVolatile('plain'), 'plain')

  let current = ['kakao', 'bing']
  const settings = normalizeSettings({ autoOrder: { get: () => current }, autoKnown: { get: () => PROVIDER_IDS } })
  assert.deepEqual(settings.autoOrder(), ['kakao', 'bing'])
  current = ['you']
  assert.deepEqual(settings.autoOrder(), ['you'])

  // Per-engine counts are live too, and kept within each engine's maximum.
  let counts = { naver: 30 }
  const live = normalizeSettings({ counts: { get: () => counts } })
  assert.equal(live.countFor('naver'), 30)
  assert.equal(live.countFor('you'), 10)
  counts = { naver: 300, bing: 3 }
  assert.equal(live.countFor('naver'), 100)
  assert.equal(live.countFor('bing'), 3)

  const config = Config({})
  assert.deepEqual(readVolatile(config.autoOrder), PROVIDER_IDS)
  assert.deepEqual(config.providers, PROVIDER_IDS)
})

test('the bundle patch picks the automatic engine for web_search and names every key', async () => {
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /^- id: web\n  config:\n    searchProvider: auto\n    fetchProvider: http$/m)
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
  assert.equal(JSON.parse(firecrawl.init.body).limit, 20)
  assert.equal(firecrawl.init.headers.authorization, undefined)
  assert.equal(buildRequest('firecrawl', { ...base, keys: ['k5'] }).init.headers.authorization, 'Bearer k5')

  const tinyfish = buildRequest('tinyfish', { ...base, keys: ['k6'] })
  assert.equal(tinyfish.url, 'https://api.search.tinyfish.ai/?query=q')
  assert.equal(tinyfish.init.headers['x-api-key'], 'k6')

  const jina = buildRequest('jina', { ...base, keys: ['k7'] })
  assert.equal(jina.url, 'https://s.jina.ai/?q=q&num=5')
  assert.equal(jina.init.headers.authorization, 'Bearer k7')

  // NAVER API HUB first, the old Naver Developers host as the fallback.
  const naver = buildRequest('naver', { ...base, keys: ['id8', 'secret8'] })
  assert.equal(naver.url, 'https://naverapihub.apigw.ntruss.com/search/v1/webkr?query=q&display=5&format=json')
  assert.equal(naver.init.headers['x-ncp-apigw-api-key-id'], 'id8')
  assert.equal(naver.init.headers['x-ncp-apigw-api-key'], 'secret8')
  assert.equal(naver.fallback.url, 'https://openapi.naver.com/v1/search/webkr.json?query=q&display=5')
  assert.equal(naver.fallback.init.headers['x-naver-client-id'], 'id8')
  assert.equal(naver.fallback.init.headers['x-naver-client-secret'], 'secret8')

  const kakao = buildRequest('kakao', { ...base, count: 60, keys: ['k9'] })
  assert.equal(kakao.url, 'https://dapi.kakao.com/v2/search/web?query=q&size=50')
  assert.equal(kakao.init.headers.authorization, 'KakaoAK k9')
})

test('each engine gets the count within its own bounds, and lower ones without a key', () => {
  const ask = (id, count, keys = []) => buildRequest(id, { query: 'q', count, keys, settings: SETTINGS })
  // You.com: 100 with a key, 50 without one.
  assert.equal(new URL(ask('you', 80).url).searchParams.get('count'), '50')
  assert.equal(new URL(ask('you', 80, ['k']).url).searchParams.get('count'), '80')
  assert.equal(new URL(ask('you', 500, ['k']).url).searchParams.get('count'), '100')
  // Parallel: up to 20 with a key; the keyless MCP takes no count.
  assert.equal(JSON.parse(ask('parallel', 30, ['k']).init.body).advanced_settings.max_results, 20)
  assert.equal(JSON.parse(ask('parallel', 30).init.body).params.arguments.max_results, undefined)
  // Keenable passes max_results on both tiers, up to 50.
  assert.equal(JSON.parse(ask('keenable', 70).init.body).params.arguments.max_results, 50)
  assert.equal(JSON.parse(ask('keenable', 30, ['k']).init.body).max_results, 30)
  assert.equal(JSON.parse(ask('tavily', 50).init.body).max_results, 20)
  assert.equal(new URL(ask('jina', 50, ['k']).url).searchParams.get('num'), '20')
  assert.equal(JSON.parse(ask('firecrawl', 500).init.body).limit, 100)
  assert.equal(new URL(ask('naver', 500, ['i', 's']).url).searchParams.get('display'), '100')
  assert.equal(new URL(ask('kakao', 500, ['k']).url).searchParams.get('size'), '50')
  // A count that is not a whole number of 1 or more falls back to the default.
  assert.equal(new URL(ask('kakao', 0, ['k']).url).searchParams.get('size'), '10')
  // Engines without a count parameter: the results are cut to the count after they arrive.
  assert.equal(new URL(ask('tinyfish', 5, ['k']).url).searchParams.get('count'), null)
  const many = JSON.stringify({ results: Array.from({ length: 10 }, (_, i) => ({ url: `https://t.example/${i}`, title: `T${i}` })) })
  assert.equal(parseResponse('tinyfish', many, { query: 'q', count: 4, keyed: true }).sources.length, 4)
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
  // The count set on the plugin page wins over the maxResults an agent passes.
  await provider('tavily', { counts: { tavily: 3 } }).search({ query: 'q', maxResults: 15 })
  assert.equal(calls[0].init.headers['x-tavily-access-mode'], 'keyless')
  assert.equal(JSON.parse(calls[0].init.body).max_results, 3)
  assert.equal(calls[0].init.headers['user-agent'], 'dsh-search/1.2.0')

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

test('a Naver key the HUB rejects is tried once on the old host', async (t) => {
  const keys = { NAVER_CLIENT_ID: 'id8', NAVER_CLIENT_SECRET: 'secret8' }
  const body = json({ items: [{ title: '<b>서울</b>', link: 'https://n.example', description: 'd' }] })
  let hubStatus = 401
  const calls = stubFetch(t, (url) => (url.includes('naverapihub') ? new Response('denied', { status: hubStatus }) : body.clone()))
  const result = await provider('naver', {}, keys).search({ query: '서울' })
  assert.equal(result.sources[0].url, 'https://n.example')
  assert.deepEqual(calls.map((call) => new URL(call.url).host), ['naverapihub.apigw.ntruss.com', 'openapi.naver.com'])

  // Any other HUB failure is reported as it is, without a second request.
  hubStatus = 429
  await assert.rejects(provider('naver', {}, keys).search({ query: '서울' }), (error) => error.quota === true)
  assert.equal(calls.length, 3)
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
    async search(request) {
      this.calls += 1
      return behaviour(request)
    }
  }
}
const found = (url) => () => ({ sources: [{ url }], truncated: false })
const nothing = () => ({ sources: [], truncated: false })
const fails = (message, extra = {}) => () => { throw Object.assign(new Error(message), { code: 'WEB_PROVIDER_ERROR', ...extra }) }

function auto(map, { now = () => 0, order } = {}) {
  const providers = new Map(Object.entries(map).map(([id, behaviour]) => [id, fake(id, behaviour)]))
  // An order saved now knows every engine, so none is added to it.
  const settings = normalizeSettings({ autoOrder: order, autoKnown: order === undefined ? undefined : PROVIDER_IDS })
  return { auto: new AutoSearchProvider({ providers, settings, now }), providers }
}

test('the automatic order is the one the user set, whatever the query language', async () => {
  const both = { naver: found('https://n.example'), you: found('https://y.example') }
  const { auto: a, providers } = auto(both)
  assert.deepEqual(await a.search({ query: '서울 날씨' }), { sources: [{ url: 'https://y.example' }], truncated: false, answeredBy: 'YOU' })
  assert.equal(providers.get('naver').calls, 0)
  const { auto: b } = auto(both, { order: ['naver', 'you'] })
  assert.equal((await b.search({ query: 'Seoul weather' })).sources[0].url, 'https://n.example')
  // An engine left out of the order is never used by auto.
  const { auto: c, providers: cp } = auto({ ...both, bing: found('https://b.example') }, { order: ['bing'] })
  assert.equal((await c.search({ query: 'q' })).answeredBy, 'BING')
  assert.equal(cp.get('you').calls, 0)
  const { auto: d } = auto(both, { order: [] })
  await assert.rejects(d.search({ query: 'q' }), /no engine checked/)
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

test('korea searches Naver and Kakao together, alternating results and merging URLs', async () => {
  const two = (urls) => () => ({ sources: urls.map((url) => ({ url })), truncated: false })
  const providers = new Map([
    ['naver', fake('naver', two(['https://a.kr', 'https://b.kr/', 'https://c.kr']))],
    ['kakao', fake('kakao', two(['https://x.kr', 'https://b.kr']))]
  ])
  const korea = new KoreaSearchProvider({ providers })
  const result = await korea.search({ query: '서울' })
  // A page both engines found comes first; the rest alternate, one from each engine.
  assert.deepEqual(result.sources.map((s) => s.url), ['https://b.kr/', 'https://a.kr', 'https://x.kr', 'https://c.kr'])
  assert.deepEqual(result.sources.map((s) => s.snippet), ['[NAVER + KAKAO]', '[NAVER]', '[KAKAO]', '[NAVER]'])
  assert.equal(result.answeredBy, 'NAVER + KAKAO')
  assert.equal(providers.get('naver').calls, 1)
  assert.equal(providers.get('kakao').calls, 1)

  // One engine failing still returns the other's results.
  const half = new KoreaSearchProvider({ providers: new Map([
    ['naver', fake('naver', fails('no key', { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' }))],
    ['kakao', fake('kakao', two(['https://x.kr']))]
  ]) })
  assert.equal((await half.search({ query: 'q' })).answeredBy, 'KAKAO')

  // Both without a key: a missing-key error that names both.
  const none = new KoreaSearchProvider({ providers: new Map([
    ['naver', fake('naver', fails('naver needs a key', { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' }))],
    ['kakao', fake('kakao', fails('kakao needs a key', { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' }))]
  ]) })
  await assert.rejects(none.search({ query: 'q' }), (error) => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' && /naver needs a key; kakao: kakao needs a key/.test(error.message))
})

test('korea modes: the detailed answer marks finders and counts, korea-group lists by engine, korea-seq goes in turn', async () => {
  const two = (urls) => () => ({ sources: urls.map((url) => ({ url, snippet: 's' })), truncated: false })
  const map = () => new Map([
    ['naver', fake('naver', two(['https://a.kr', 'https://b.kr/', 'https://c.kr']))],
    ['kakao', fake('kakao', two(['https://x.kr', 'https://B.kr']))]
  ])
  const merged = await new KoreaSearchProvider({ providers: map() }).searchDetailed({ query: '서울' })
  assert.equal(merged.layout, 'merged')
  assert.equal(merged.summary, 'NAVER 3, KAKAO 2, in both 1')
  assert.deepEqual(merged.sources[0].from, ['NAVER', 'KAKAO'])
  assert.equal(merged.sources[0].snippet, 's')

  const grouped = await new KoreaSearchProvider({ providers: map(), mode: 'group' }).searchDetailed({ query: '서울' })
  assert.equal(grouped.layout, 'grouped')
  assert.deepEqual(grouped.sources.map((s) => [s.group, s.url]), [
    ['NAVER', 'https://a.kr'], ['NAVER', 'https://b.kr/'], ['NAVER', 'https://c.kr'], ['KAKAO', 'https://x.kr']
  ])
  assert.equal(new KoreaSearchProvider({ providers: map(), mode: 'group' }).id, KOREA_MODES.group)

  // One engine without a key: the summary says so.
  const half = new KoreaSearchProvider({ providers: new Map([
    ['naver', fake('naver', fails('no key', { code: 'WEB_PROVIDER_CREDENTIAL_MISSING' }))],
    ['kakao', fake('kakao', two(['https://x.kr']))]
  ]) })
  assert.equal((await half.searchDetailed({ query: 'q' })).summary, 'KAKAO 1, NAVER has no key')

  // korea-seq is an automatic engine over Naver then Kakao: Kakao only when Naver finds nothing.
  const { tools, providers } = register()
  assert.ok(!providers.some((p) => p.id === 'korea-group' || p.id === 'korea-seq'), 'only korea is a web_search provider')
  assert.ok(tools[0].parameters.properties.engine.enum.includes('korea-seq'))
  const seqMap = new Map([['naver', fake('naver', nothing)], ['kakao', fake('kakao', found('https://k.kr'))]])
  const seq = new AutoSearchProvider({ providers: seqMap, settings: normalizeSettings({}), now: () => 0, id: KOREA_MODES.sequence, order: ['naver', 'kakao'] })
  const answer = await seq.search({ query: 'q' })
  assert.deepEqual(answer.sources.map((s) => s.url), ['https://k.kr'])
  assert.equal(seqMap.get('naver').calls, 1)
})

test('the legacy order names follow web.searchProvider: only the picked one, or all when it cannot be read', () => {
  const describe = (value) => ({ get: (name) => (name === 'settings' ? { describe: () => [{ ns: 'search', value: {} }, { ns: 'web', value }] } : undefined) })
  assert.equal(readWebSearchProvider(describe({ searchProvider: 'exa-brave' })), 'exa-brave')
  assert.equal(readWebSearchProvider(describe({})), undefined)
  assert.equal(readWebSearchProvider({ get: () => undefined }), null)
  assert.equal(readWebSearchProvider({ get: () => { throw new Error('not ready') } }), null)

  const ids = (value) => {
    const found = []
    const listeners = []
    const onUpdate = (...args) => listeners.forEach((listener) => listener(...args))
    apply({
      ...describe(value),
      on: (name, listener) => { if (name === 'settings/document-updated') listeners.push(listener) },
      web: { registerSearchProvider: (p) => found.push(p.id) },
      tools: { register() {} },
      commands: { register() {} }
    }, {})
    return { found, onUpdate }
  }
  const picked = ids({ searchProvider: 'brave-exa' })
  assert.deepEqual(picked.found.filter((id) => id in LEGACY_ORDERS), ['brave-exa'])
  const plain = ids({ searchProvider: 'auto' })
  assert.deepEqual(plain.found.filter((id) => id in LEGACY_ORDERS), [])
  // Switching later (a patch or the CLI) registers the one now picked.
  const later = { searchProvider: 'auto' }
  const live = ids(later)
  later.searchProvider = 'exa-brave'
  live.onUpdate('web', 2)
  live.onUpdate('web', 3)
  assert.deepEqual(live.found.filter((id) => id in LEGACY_ORDERS), ['exa-brave'])
})

test('korea is registered as a provider and an engine of the tool, but not part of auto', () => {
  const { providers, tools } = register()
  assert.ok(providers.some((p) => p.id === 'korea'))
  assert.deepEqual(tools[0].parameters.properties.engine.enum.slice(0, 2), ['auto', 'korea'])
  assert.equal(normalizeSettings({}).autoOrder().includes('korea'), false)
  // Without Naver and Kakao registered there is no korea engine.
  const { providers: few } = register({ providers: ['bing'] })
  assert.equal(few.some((p) => p.id === 'korea'), false)
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

test('a count set with a command overrides the page setting and stays inside each engine\'s limits', () => {
  const settings = normalizeSettings({ counts: { naver: 7 } })
  assert.equal(resultCount(settings, 'naver'), 7)
  assert.equal(resultCount(settings, 'naver', 30), 30)
  assert.equal(resultCount(settings, 'naver', 'max'), 100)
  assert.equal(resultCount(settings, 'kakao', 'max'), 50)
  assert.equal(resultCount(settings, 'kakao', 80), 50)
  // The keyless bound still applies when the request is built.
  const url = new URL(buildRequest('you', { query: 'q', count: resultCount(settings, 'you', 'max'), settings }).url)
  assert.equal(url.searchParams.get('count'), '50')
})

test('korea hands the per-search count to both members', async () => {
  const seen = []
  const member = (id) => fake(id, (request) => { seen.push([id, request.userCount]); return { sources: [], truncated: false } })
  const korea = new KoreaSearchProvider({ providers: new Map([['naver', member('naver')], ['kakao', member('kakao')]]) })
  await korea.search({ query: '서울', userCount: 'max' })
  assert.deepEqual(seen.sort(), [['kakao', 'max'], ['naver', 'max']])
})

test('Exa and Brave requests: headers, options and their own result limits', () => {
  const exa = buildRequest('exa', { query: 'q', count: 500, keys: ['ek'], settings: SETTINGS })
  assert.equal(exa.url, 'https://api.exa.ai/search')
  assert.equal(exa.init.method, 'POST')
  assert.equal(exa.init.headers['x-api-key'], 'ek')
  assert.deepEqual(JSON.parse(exa.init.body), { query: 'q', numResults: 100, type: 'auto', contents: { highlights: { maxCharacters: 400 } } })

  const options = normalizeSettings({ safeSearch: 'strict', brave: { country: 'KR', searchLang: 'ko', uiLang: 'ko-KR' }, exa: { type: 'fast', snippetChars: 200 } })
  const brave = buildRequest('brave', { query: '서울', count: 50, keys: ['bk'], settings: options })
  const url = new URL(brave.url)
  assert.equal(url.origin + url.pathname, 'https://api.search.brave.com/res/v1/web/search')
  assert.equal(brave.init.headers['x-subscription-token'], 'bk')
  assert.deepEqual(Object.fromEntries(url.searchParams), { q: '서울', count: '20', text_decorations: 'false', safesearch: 'strict', country: 'KR', search_lang: 'ko', ui_lang: 'ko-KR' })
  assert.equal(JSON.parse(buildRequest('exa', { query: 'q', count: 5, keys: ['ek'], settings: options }).init.body).type, 'fast')
  assert.equal(normalizeSettings({ exa: { type: 'nope' } }).exa.type, 'auto')
})

test('Exa and Brave responses become sources with snippets, dates and no duplicates', () => {
  const exa = parseResponse('exa', JSON.stringify({ results: [
    { url: 'https://a.example', title: ' A ', highlights: ['first', '', 'second'], publishedDate: '2026-01-02T00:00:00Z' },
    { url: 'https://a.example/', title: 'dup' },
    { url: 'https://b.example', summary: 'x'.repeat(500) },
    { url: 'ftp://c.example' }
  ] }), { query: 'q', count: 10, keyed: true, snippetChars: 50 })
  assert.deepEqual(exa.sources[0], { url: 'https://a.example', title: 'A', snippet: 'first … second', publishedAt: '2026-01-02T00:00:00Z' })
  assert.equal(exa.sources.length, 2)
  assert.equal(Array.from(exa.sources[1].snippet).length, 50)

  const brave = parseResponse('brave', JSON.stringify({ web: { results: [
    { url: 'https://d.example', title: 'D', description: 'a <strong>bold</strong> &amp; plain', page_age: '2025-12-01T10:00:00' }
  ] } }), { query: 'q', count: 10, keyed: true })
  assert.deepEqual(brave.sources, [{ url: 'https://d.example', title: 'D', snippet: 'a bold & plain', publishedAt: '2025-12-01T10:00:00' }])
  assert.deepEqual(parseResponse('brave', '{}', { query: 'q', count: 10, keyed: true }).sources, [])
})

test('Exa and Brave need a key; they also read the key file their earlier bundles documented', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-search-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'brave-api-key')
  await writeFile(file, '  file-key\n')
  assert.equal(await readKeyFile(file), 'file-key')
  assert.equal(await readKeyFile(join(dir, 'missing')), '')
  assert.equal(await readKeyFile(undefined), '')
  await assert.rejects(readKeyFile(dir), (error) => error.code === 'WEB_PROVIDER_ERROR' && error.message.includes(dir))

  const calls = stubFetch(t, () => json({ web: { results: [{ url: 'https://k.example', title: 'K' }] } }))
  const none = provider('exa', { keyFiles: { exa: join(dir, 'missing') } })
  await assert.rejects(none.search({ query: 'q' }), (error) => error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' && /EXA_API_KEY/.test(error.message))
  assert.equal(calls.length, 0)
  const brave = provider('brave', { keyFiles: { brave: file } })
  const result = await brave.search({ query: 'q' })
  assert.equal(result.sources[0].url, 'https://k.example')
  assert.equal(calls[0].init.headers['x-subscription-token'], 'file-key')
  // The credential store wins over the file.
  await provider('brave', { keyFiles: { brave: file } }, { BRAVE_API_KEY: 'store-key' }).search({ query: 'q' })
  assert.equal(calls[1].init.headers['x-subscription-token'], 'store-key')
})

test('the earlier Search Fallback names still answer: fixed Exa → Brave orders and the automatic order', async () => {
  const { providers } = register({}, {})
  const byId = Object.fromEntries(providers.map((p) => [p.id, p]))
  for (const id of Object.keys(LEGACY_ORDERS)) {
    assert.ok(byId[id], id)
    assert.match(byId[id].description.ko, /예전 검색 자동 전환/)
  }
  assert.deepEqual(byId['exa-brave'].wantedOrder(), ['exa', 'brave'])
  assert.deepEqual(byId['brave-exa'].wantedOrder(), ['brave', 'exa'])
  assert.deepEqual(byId['exa-brave-auto'].wantedOrder(), PROVIDER_IDS)

  const map = new Map([['exa', fake('exa', fails('credits', { quota: true }))], ['brave', fake('brave', found('https://brave.example'))], ['you', fake('you', found('https://you.example'))]])
  const exaBrave = new AutoSearchProvider({ providers: map, settings: normalizeSettings({}), now: () => 0, id: 'exa-brave', order: LEGACY_ORDERS['exa-brave'].order })
  const result = await exaBrave.search({ query: 'q' })
  assert.equal(result.answeredBy, 'BRAVE')
  assert.equal(map.get('you').calls, 0, 'a fixed order never reaches other engines')
})

test('names an older bundle still registers are skipped one by one, and the rest still loads', () => {
  const warnings = []
  const existing = new Map([['brave', { id: 'brave' }], ['exa-brave', { id: 'exa-brave' }]])
  const registered = []
  const tools = []
  const commands = []
  const ctx = {
    get: () => undefined,
    logger: () => ({ warn: (line) => warnings.push(line) }),
    web: {
      searchProviders: existing,
      registerSearchProvider: (p) => { if (existing.has(p.id)) throw new Error('duplicate'); existing.set(p.id, p); registered.push(p.id) }
    },
    tools: { register: (tool) => { if (tool.name === 'brave_search') throw new Error('tool "brave_search" is already registered'); tools.push(tool.name) } },
    commands: { register: (command) => { if (command.name === 'brave') throw new Error('command "brave" is already registered'); commands.push(command.name) } }
  }
  apply(ctx, {})
  assert.ok(!registered.includes('brave') && !registered.includes('exa-brave'))
  assert.ok(registered.includes('exa') && registered.includes('auto') && registered.includes('brave-exa'))
  assert.deepEqual(tools, ['engine_search', 'exa_search'])
  assert.deepEqual(commands, ['search', 'exa'])
  assert.equal(warnings.length, 4, warnings.join('\n'))
})
