/**
 * Wire-level helpers for the keyless search providers.
 *
 * This module has no DSH imports so it can be unit-tested with plain Node.
 * Endpoints and request shapes were worked out from dsh-free-search v0.9.54
 * (https://github.com/DDDMUC/dsh-free-search, MIT, lib/engines/*.js) and the
 * services' own API documents (Naver Search API webkr, Kakao Daum search
 * v2/search/web), and checked against the live services on 2026-11-17 where no
 * key was needed; the code here is new.
 */

/** Provider ids. */
export const PROVIDER_IDS = Object.freeze(['you', 'parallel', 'keenable', 'tavily', 'tinyfish', 'jina', 'firecrawl', 'naver', 'kakao', 'bing'])

/**
 * The default order of the automatic "auto" provider, the same for every
 * query language. The user changes it, and which engines it uses, on the
 * plugin page (the `autoOrder` setting).
 */
export const DEFAULT_AUTO_ORDER = PROVIDER_IDS

/** Providers that return nothing without a key; they fail fast instead of calling out. */
export const REQUIRES_KEY = Object.freeze(['tinyfish', 'jina', 'naver', 'kakao'])

export const ENDPOINTS = Object.freeze({
  tavily: 'https://api.tavily.com/search',
  youFree: 'https://api.you.com/v1/agents/search',
  youKeyed: 'https://ydc-index.io/v1/search',
  parallelMcp: 'https://search.parallel.ai/mcp',
  parallelRest: 'https://api.parallel.ai/v1/search',
  keenableMcp: 'https://api.keenable.ai/mcp',
  keenableRest: 'https://api.keenable.ai/v1/search',
  bing: 'https://www.bing.com/search',
  firecrawl: 'https://api.firecrawl.dev/v2/search',
  tinyfish: 'https://api.search.tinyfish.ai',
  jina: 'https://s.jina.ai/',
  // NAVER API HUB issues every new key since 2026-07-31; keys from the old
  // Naver Developers console keep working on openapi.naver.com until 2027-06-30.
  naverHub: 'https://naverapihub.apigw.ntruss.com/search/v1/webkr',
  naver: 'https://openapi.naver.com/v1/search/webkr.json',
  kakao: 'https://dapi.kakao.com/v2/search/web'
})

/**
 * Credential names each provider looks up. Naver needs two (client id and
 * secret); every other provider needs one. A missing optional key means the
 * keyless tier.
 */
export const DEFAULT_KEY_NAMES = Object.freeze({
  you: Object.freeze(['YDC_API_KEY']),
  parallel: Object.freeze(['PARALLEL_API_KEY']),
  keenable: Object.freeze(['KEENABLE_API_KEY']),
  tavily: Object.freeze(['TAVILY_API_KEY']),
  tinyfish: Object.freeze(['TINYFISH_API_KEY']),
  jina: Object.freeze(['JINA_API_KEY']),
  firecrawl: Object.freeze(['FIRECRAWL_API_KEY']),
  naver: Object.freeze(['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET']),
  kakao: Object.freeze(['KAKAO_REST_API_KEY']),
  bing: Object.freeze([])
})

/**
 * How many results one request to each engine can return, from the official
 * API references (checked 2026-11-17).
 * - `max`: the engine's own upper bound with a key.
 * - `keylessMax`: a lower bound without a key, where there is one.
 * - `param: false`: the API takes no count, so the results are cut after they
 *   arrive and `max` is what it returns at most. `keylessParam: false` is the
 *   same for the keyless tier only.
 * Sources: Naver HUB webkr `display` 1–100; Kakao web `size` 1–50; You.com
 * `count` 1–100 (keyless agents/search answers 402 above 50, probed); Parallel
 * `advanced_settings.max_results` up to 20 (keyless MCP has no count and
 * returns 10); Keenable `max_results` 1–50; Tavily `max_results` 0–20;
 * TinyFish has no count (10 a page); Jina `num` up to 20; Firecrawl `limit`
 * 1–100; Bing's results page ignores `count` and shows 10.
 */
export const RESULT_LIMITS = Object.freeze({
  you: Object.freeze({ max: 100, keylessMax: 50, param: true }),
  parallel: Object.freeze({ max: 20, keylessMax: 10, param: true, keylessParam: false }),
  keenable: Object.freeze({ max: 50, param: true }),
  tavily: Object.freeze({ max: 20, param: true }),
  tinyfish: Object.freeze({ max: 10, param: false }),
  jina: Object.freeze({ max: 20, param: true }),
  firecrawl: Object.freeze({ max: 100, param: true }),
  naver: Object.freeze({ max: 100, param: true }),
  kakao: Object.freeze({ max: 50, param: true }),
  bing: Object.freeze({ max: 10, param: false })
})

/** Results per engine when the plugin page sets none. */
export const DEFAULT_COUNT = 10
const DEFAULT_TIMEOUT_MS = 20000
const SNIPPET_CHARS = 300

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Normalize the bundle's YAML config into stable settings. */
export function normalizeSettings(config = {}) {
  const rawCount = Number(config.count)
  const count = Number.isInteger(rawCount) && rawCount > 0 ? rawCount : DEFAULT_COUNT
  const rawTimeout = Number(config.timeoutMs)
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout >= 1000 ? Math.min(rawTimeout, 60000) : DEFAULT_TIMEOUT_MS
  const listed = Array.isArray(config.providers) ? config.providers.map((p) => String(p).trim()) : PROVIDER_IDS
  const providers = PROVIDER_IDS.filter((id) => listed.includes(id))
  const keyNames = {}
  for (const [id, names] of Object.entries(DEFAULT_KEY_NAMES)) {
    const raw = config.keys?.[id]
    const given = (Array.isArray(raw) ? raw : [raw]).map(text)
    keyNames[id] = names.map((name, index) => given[index] ?? name)
  }
  // `autoOrder` is a live setting: under DSH it is a volatile reference read on
  // every search, so a change on the plugin page applies to the next search.
  const autoOrder = () => normalizeOrder(readVolatile(config.autoOrder), providers)
  // `counts` is live as well: results per engine, set on the plugin page.
  const countFor = (id) => clampCount(id, readVolatile(config.counts)?.[id] ?? count)
  return {
    count,
    countFor,
    timeoutMs,
    providers,
    keyNames,
    autoOrder,
    bingMarket: text(config.bingMarket),
    safeSearch: ['off', 'moderate', 'strict'].includes(config.safeSearch) ? config.safeSearch : 'moderate'
  }
}

/** A result count within the engine's own bounds; anything unreadable becomes the default. */
export function clampCount(id, raw) {
  const max = RESULT_LIMITS[id]?.max ?? DEFAULT_COUNT
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1 ? Math.min(value, max) : Math.min(DEFAULT_COUNT, max)
}

/**
 * The number of results to ask an engine for. The user's per-engine setting
 * wins over the `maxResults` an agent passes (2026-11-17 decision), so that
 * bound is not read here. `userCount` is the count the user set for one search
 * with a command (a number, or "max" for the engine's own maximum);
 * buildRequest clamps it to the engine's limits, keyless ones included.
 */
export function resultCount(settings, id, userCount) {
  if (userCount === 'max') return RESULT_LIMITS[id]?.max ?? settings.countFor(id)
  if (Number.isInteger(userCount) && userCount >= 1) return clampCount(id, userCount)
  return settings.countFor(id)
}

function jsonPost(url, body, headers = {}) {
  return {
    url,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body)
    }
  }
}

function mcpCall(url, name, args) {
  const request = jsonPost(url, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  request.init.headers.accept = 'application/json, text/event-stream'
  return request
}

/**
 * Build the HTTP request for one provider.
 * @returns {{ url: string, init: { method: string, headers: Record<string,string>, body?: string }, fallback?: { url: string, init: object } }}
 */
export function buildRequest(id, { query, count: wanted, keys = [], settings }) {
  const apiKey = keys[0] ?? ''
  // The keyless tier of some engines allows fewer results than a key does.
  const keylessMax = RESULT_LIMITS[id]?.keylessMax
  const bounded = clampCount(id, wanted)
  const count = apiKey === '' && keylessMax !== undefined ? Math.min(bounded, keylessMax) : bounded
  switch (id) {
    case 'tavily':
      return jsonPost(
        ENDPOINTS.tavily,
        { query, max_results: count, search_depth: 'basic' },
        apiKey ? { authorization: `Bearer ${apiKey}` } : { 'x-tavily-access-mode': 'keyless' }
      )
    case 'you': {
      const url = new URL(apiKey ? ENDPOINTS.youKeyed : ENDPOINTS.youFree)
      url.searchParams.set('query', query)
      url.searchParams.set('count', String(count))
      return { url: url.toString(), init: { method: 'GET', headers: { accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) } } }
    }
    case 'parallel':
      if (apiKey) {
        return jsonPost(
          ENDPOINTS.parallelRest,
          { objective: query, search_queries: [query], mode: 'fast', advanced_settings: { max_results: count } },
          { 'x-api-key': apiKey }
        )
      }
      return mcpCall(ENDPOINTS.parallelMcp, 'web_search', { objective: query, search_queries: [query] })
    case 'keenable':
      if (apiKey) return jsonPost(ENDPOINTS.keenableRest, { query, mode: 'realtime', max_results: count }, { 'x-api-key': apiKey })
      return mcpCall(ENDPOINTS.keenableMcp, 'search_web_pages', { query, max_results: count })
    case 'bing': {
      const url = new URL(ENDPOINTS.bing)
      url.searchParams.set('q', query)
      if (settings.bingMarket) url.searchParams.set('mkt', settings.bingMarket)
      url.searchParams.set('adlt', settings.safeSearch)
      const language = settings.bingMarket ? `${settings.bingMarket},${settings.bingMarket.split('-')[0]};q=0.9,en;q=0.5` : 'en;q=0.9'
      return { url: url.toString(), init: { method: 'GET', headers: { accept: 'text/html', 'accept-language': language } } }
    }
    case 'firecrawl':
      return jsonPost(ENDPOINTS.firecrawl, { query, limit: count }, apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    case 'tinyfish': {
      const url = new URL(ENDPOINTS.tinyfish)
      url.searchParams.set('query', query)
      return { url: url.toString(), init: { method: 'GET', headers: { accept: 'application/json', 'x-api-key': apiKey } } }
    }
    case 'jina': {
      const url = new URL(ENDPOINTS.jina)
      url.searchParams.set('q', query)
      url.searchParams.set('num', String(count))
      return { url: url.toString(), init: { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` } } }
    }
    case 'naver': {
      // Same response shape on both hosts. HUB first; a 401/403 there retries
      // the legacy host once, for keys made in the old Naver Developers console.
      const display = String(count)
      const hub = new URL(ENDPOINTS.naverHub)
      hub.searchParams.set('query', query)
      hub.searchParams.set('display', display)
      hub.searchParams.set('format', 'json')
      const legacy = new URL(ENDPOINTS.naver)
      legacy.searchParams.set('query', query)
      legacy.searchParams.set('display', display)
      return {
        url: hub.toString(),
        init: { method: 'GET', headers: { accept: 'application/json', 'x-ncp-apigw-api-key-id': keys[0] ?? '', 'x-ncp-apigw-api-key': keys[1] ?? '' } },
        fallback: {
          url: legacy.toString(),
          init: { method: 'GET', headers: { accept: 'application/json', 'x-naver-client-id': keys[0] ?? '', 'x-naver-client-secret': keys[1] ?? '' } }
        }
      }
    }
    case 'kakao': {
      const url = new URL(ENDPOINTS.kakao)
      url.searchParams.set('query', query)
      url.searchParams.set('size', String(count))
      return { url: url.toString(), init: { method: 'GET', headers: { accept: 'application/json', authorization: `KakaoAK ${apiKey}` } } }
    }
    default:
      throw new Error(`unknown provider "${id}"`)
  }
}

/** The current value of a DSH volatile config reference, or the plain value itself. */
export function readVolatile(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

/**
 * The engines the automatic provider uses, in order: known, registered and
 * listed once. An absent list means the default order; an empty one means none.
 */
export function normalizeOrder(raw, providers = PROVIDER_IDS) {
  const wanted = Array.isArray(raw) ? raw.map((id) => String(id).trim()) : DEFAULT_AUTO_ORDER
  return [...new Set(wanted)].filter((id) => providers.includes(id))
}

/** A response that arrived but carries the service's own error. */
export class ProviderResponseError extends Error {
  constructor(message, kind = 'error') {
    super(message)
    this.name = 'ProviderResponseError'
    this.kind = kind
  }
}

/**
 * Parse a provider's response body into DSH search sources.
 * @param {string} id
 * @param {string} body raw response text
 * @param {{ query: string, count: number, keyed: boolean }} options
 */
export function parseResponse(id, body, { query, count, keyed }) {
  let sources
  switch (id) {
    case 'tavily':
      sources = (parseJson(body)?.results ?? []).map((r) => source(r?.url, r?.title, r?.content))
      break
    case 'you':
      sources = (parseJson(body)?.results?.web ?? []).map((r) =>
        source(r?.url, r?.title, Array.isArray(r?.snippets) && r.snippets.length > 0 ? r.snippets.join(' ') : r?.description)
      )
      break
    case 'parallel': {
      const payload = keyed ? parseJson(body) : parseJsonPayload(mcpText(body, 'Parallel'))
      sources = (payload?.results ?? []).map((r) =>
        source(r?.url, r?.title, (r?.excerpts ?? []).find((e) => typeof e === 'string' && e.trim() !== ''), r?.publish_date)
      )
      break
    }
    case 'keenable':
      sources = keyed
        ? (parseJson(body)?.results ?? []).map((r) => source(r?.url, r?.title, r?.snippet ?? r?.description, r?.published_at))
        : parseKeenableText(mcpText(body, 'Keenable'))
      break
    case 'bing':
      sources = parseBingHtml(body)
      break
    case 'firecrawl': {
      const data = parseJson(body)?.data
      sources = (Array.isArray(data) ? data : data?.web ?? []).map((r) => source(r?.url, r?.title, r?.description))
      break
    }
    case 'tinyfish':
      sources = (parseJson(body)?.results ?? []).map((r) => source(r?.url, r?.title, r?.snippet))
      break
    case 'jina':
      sources = (parseJson(body)?.data ?? []).map((r) => source(r?.url, r?.title, r?.description ?? r?.content))
      break
    case 'naver':
      sources = (parseJson(body)?.items ?? []).map((r) => source(r?.link, r?.title, r?.description))
      break
    case 'kakao':
      sources = (parseJson(body)?.documents ?? []).map((r) => source(r?.url, r?.title, r?.contents, r?.datetime))
      break
    default:
      throw new Error(`unknown provider "${id}"`)
  }
  const unique = dedupe(sources.filter(Boolean)).slice(0, count)
  // Bing and Keenable sometimes answer with unrelated cached pages; treat that as no results.
  if ((id === 'bing' || id === 'keenable') && !looksRelevant(query, unique)) return { sources: [], truncated: false }
  return { sources: unique, truncated: false }
}

function parseJson(body) {
  try {
    return JSON.parse(body)
  } catch {
    throw new ProviderResponseError('unreadable JSON response')
  }
}

function parseJsonPayload(value) {
  try {
    return JSON.parse(value)
  } catch {
    throw new ProviderResponseError('unreadable search results')
  }
}

/**
 * Read a JSON-RPC answer that came back as plain JSON or as an SSE stream and
 * return the joined text blocks of the tool result.
 */
export function mcpText(body, label) {
  const message = parseMcpMessage(body)
  if (message === undefined) throw new ProviderResponseError(`${label} returned an unreadable MCP response`)
  if (message.error) {
    const detail = String(message.error.message ?? 'unknown error').slice(0, 200)
    throw new ProviderResponseError(`${label}: ${detail}`, /rate limit|quota/i.test(detail) ? 'quota' : 'error')
  }
  const blocks = Array.isArray(message.result?.content)
    ? message.result.content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text)
    : []
  if (message.result?.isError) throw new ProviderResponseError(`${label}: ${blocks.join(' ').slice(0, 200) || 'tool call failed'}`)
  if (blocks.length === 0) throw new ProviderResponseError(`${label} returned no content`)
  return blocks.join('\n')
}

export function parseMcpMessage(body) {
  const trimmed = String(body ?? '').trim()
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }
  // SSE: events are separated by a blank line; data lines of one event are joined with "\n".
  let found
  for (const event of trimmed.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (data === '') continue
    try {
      const parsed = JSON.parse(data)
      if (parsed && ('result' in parsed || 'error' in parsed)) found = parsed
    } catch {
      // Skip events that are not JSON.
    }
  }
  return found
}

/** Keenable's MCP tool answers with "Title: / URL: / Published: / Snippets:" blocks. */
export function parseKeenableText(value) {
  const sources = []
  for (const block of String(value).split(/\n(?=Title:)/)) {
    const url = block.match(/^URL: (\S+)$/m)?.[1]
    if (!url) continue
    const title = block.match(/^Title: (.+)$/m)?.[1]
    const date = block.match(/^(?:Published|Acquired): (\d{4}-\d{2}-\d{2}\S*)$/m)?.[1]
    const snippet = block.split(/^Snippets:$/m)[1]?.split('\n').filter((line) => line.trim() !== '').slice(0, 3).join(' ')
    sources.push(source(url, title, snippet, date))
  }
  return sources
}

/** Parse Bing's result page. A human-check page is an error, not "no results". */
export function parseBingHtml(html) {
  const blocks = String(html).match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? []
  if (blocks.length === 0 && /captcha|\/challenge|verify you are a human/i.test(html)) {
    throw new ProviderResponseError('Bing answered with a human-check page', 'blocked')
  }
  return blocks.map((block) => {
    const heading = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''
    const href = heading.match(/<a[^>]*href="([^"]+)"/)?.[1]
    const title = heading.match(/<a[^>]*>([\s\S]*?)<\/a>/)?.[1]
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]
    return source(decodeBingUrl(href), title, snippet)
  })
}

/** Bing wraps result links as bing.com/ck/a?…&u=a1<base64url>; return the real address. */
export function decodeBingUrl(href) {
  if (!href) return undefined
  const url = decodeEntities(href)
  if (!/^https?:\/\/(www\.)?bing\.com\/ck\/a/i.test(url)) return url
  try {
    const u = new URL(url).searchParams.get('u')
    if (!u) return undefined
    const encoded = u.startsWith('a1') ? u.slice(2) : u
    const decoded = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return /^https?:\/\//i.test(decoded) ? decoded : undefined
  } catch {
    return undefined
  }
}

function source(url, title, snippet, publishedAt) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return undefined
  const result = { url }
  const cleanTitle = typeof title === 'string' ? cleanText(title) : ''
  if (cleanTitle) result.title = cleanTitle
  const cleanSnippet = typeof snippet === 'string' ? clip(cleanText(snippet), SNIPPET_CHARS) : ''
  if (cleanSnippet) result.snippet = cleanSnippet
  if (typeof publishedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(publishedAt)) result.publishedAt = publishedAt
  return result
}

/** Plain text for the model: no tags, entities, empty markdown links or heading marks. */
export function cleanText(value) {
  // Inline emphasis (Naver and Kakao mark query words with <b>) joins its text;
  // any other tag separates words.
  return decodeEntities(String(value).replace(/<\/?(?:b|strong|em|i|mark)\b[^>]*>/gi, '').replace(/<[^>]*>/g, ' '))
    .replace(/\[\]\([^)]*\)/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function safeCodePoint(code) {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : ' '
}

/** Cut by code point so an emoji or Hangul syllable is never split. */
export function clip(value, max) {
  const chars = Array.from(value)
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join('')}…`
}

function dedupe(sources) {
  const seen = new Set()
  return sources.filter((s) => {
    const key = s.url.replace(/#.*$/, '').replace(/\/$/, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Query words worth matching: Hangul/CJK words and Latin words of 2+ letters. */
export function queryTokens(query) {
  return String(query)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 || /[\p{Script=Hangul}\p{Script=Han}]/u.test(t))
}

/** True when at least one result mentions at least one query word (or the query has none). */
export function looksRelevant(query, sources) {
  if (sources.length === 0) return true
  const tokens = queryTokens(query)
  if (tokens.length === 0) return true
  return sources.some((s) => {
    const haystack = `${s.title ?? ''} ${s.snippet ?? ''} ${decodeURIComponentSafe(s.url)}`.toLowerCase()
    return tokens.some((t) => haystack.includes(t))
  })
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
