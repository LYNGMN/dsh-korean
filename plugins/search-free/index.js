import { ProviderResponseError, buildRequest, normalizeSettings, parseResponse, resultCount } from './free-core.js'

/**
 * Free Search for DSH: keyless web_search providers.
 *
 *   you       You.com (keyless tier, 100 searches a day; YDC_API_KEY raises it)
 *   parallel  Parallel (keyless MCP with a tight rate limit; PARALLEL_API_KEY uses the REST API)
 *   keenable  Keenable (keyless MCP; KEENABLE_API_KEY uses the REST API)
 *   tavily    Tavily Search (keyless tier with a very small daily cap; TAVILY_API_KEY lifts it)
 *   bing      Bing result page (no key; the market comes from bingMarket)
 *
 * Each provider is registered on its own so the Search Fallback bundle can put
 * them in any order. Nothing here selects web.searchProvider.
 *
 * Like the other search bundles this one is self-contained: a local error
 * type with a stable `code` is all the web seam needs.
 */
export class FreeSearchError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'FreeSearchError'
    this.code = code
  }
}

export const inject = ['web']

const USER_AGENT = 'dsh-search-free/1.0.0'

export const PROVIDER_TEXT = Object.freeze({
  tavily: {
    title: 'Tavily',
    description: {
      en: 'Tavily web search. The keyless tier has a very small daily cap; a free TAVILY_API_KEY lifts it.',
      ko: 'Tavily 웹검색이에요. 키 없이는 하루 한도가 아주 작고, 무료 TAVILY_API_KEY를 넣으면 넉넉해져요.'
    }
  },
  you: {
    title: 'You.com',
    description: {
      en: 'You.com web search. Works without a key up to 100 searches a day; YDC_API_KEY raises the limit.',
      ko: 'You.com 웹검색이에요. 키 없이 하루 100번까지 쓰고, YDC_API_KEY를 넣으면 한도가 늘어요.'
    }
  },
  parallel: {
    title: 'Parallel',
    description: {
      en: 'Parallel web search, strong on official documentation. The keyless tier allows only a few searches in a row; PARALLEL_API_KEY lifts that.',
      ko: 'Parallel 웹검색이에요. 공식 문서를 잘 찾아요. 키 없이는 연달아 몇 번만 쓸 수 있고, PARALLEL_API_KEY를 넣으면 풀려요.'
    }
  },
  keenable: {
    title: 'Keenable',
    description: {
      en: 'Keenable web search. Works without a key; KEENABLE_API_KEY raises the limit.',
      ko: 'Keenable 웹검색이에요. 키 없이 쓰고, KEENABLE_API_KEY를 넣으면 한도가 늘어요.'
    }
  },
  bing: {
    title: 'Bing',
    description: {
      en: 'Bing results read from the result page. No key or quota, but Bing may answer some networks with empty or human-check pages.',
      ko: 'Bing 검색 결과 페이지를 읽어요. 키와 한도는 없지만, 네트워크에 따라 빈 결과나 사람 확인 페이지가 나올 수 있어요.'
    }
  }
})

/** Look a key up in the DSH credential store, then the launch environment. Missing means keyless. */
export async function resolveOptionalKey(ctx, name) {
  if (!name) return ''
  const credentials = ctx.get?.('credentials')
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve(name)
      if (hit?.value) return hit.value
    } catch {
      // An unusable reference or store falls through to the environment.
    }
  }
  const launchEnvironment = ctx.get?.('launchEnvironment')
  return launchEnvironment?.get?.(name)?.value ?? process.env[name] ?? ''
}

/** Short, single-line error detail that never carries the key. */
export function errorDetail(value, apiKey) {
  let detail = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (apiKey) detail = detail.split(apiKey).join('***')
  return detail.length > 200 ? `${detail.slice(0, 200)}…` : detail
}

export class FreeSearchProvider {
  constructor(ctx, id, settings) {
    this.ctx = ctx
    this.id = id
    this.settings = settings
    this.title = PROVIDER_TEXT[id].title
    this.description = PROVIDER_TEXT[id].description
  }

  available() {
    return true
  }

  async search(request, signal) {
    const title = this.title
    const query = String(request?.query ?? '').trim()
    if (query.length === 0) throw new FreeSearchError(`${title} requires a non-empty query`, 'WEB_PROVIDER_ERROR')
    if (signal?.aborted) throw new FreeSearchError(`${title} search aborted`, 'WEB_ABORTED')

    const apiKey = await resolveOptionalKey(this.ctx, this.settings.keyNames[this.id])
    if (signal?.aborted) throw new FreeSearchError(`${title} search aborted`, 'WEB_ABORTED')

    const count = resultCount(this.settings, request)
    const { url, init } = buildRequest(this.id, { query, count, apiKey, settings: this.settings })
    // A plain timer (not AbortSignal.timeout) so the wait also holds in a bare Node process.
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), this.settings.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal

    let response
    let body
    try {
      response = await fetch(url, { ...init, headers: { ...init.headers, 'user-agent': USER_AGENT }, redirect: 'follow', signal: combined })
      body = await response.text()
    } catch (error) {
      if (signal?.aborted) throw new FreeSearchError(`${title} search aborted`, 'WEB_ABORTED')
      if (timeout.signal.aborted) throw new FreeSearchError(`${title} did not answer within ${this.settings.timeoutMs / 1000}s`, 'WEB_PROVIDER_ERROR')
      throw new FreeSearchError(`${title} request failed: ${errorDetail(error?.message ?? error, apiKey)}`, 'WEB_PROVIDER_ERROR')
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const detail = errorDetail(body, apiKey)
      const suffix = detail ? `: ${detail}` : ''
      if (apiKey && (response.status === 401 || response.status === 403)) {
        throw new FreeSearchError(`${title} rejected the API key (HTTP ${response.status})${suffix}`, 'WEB_PROVIDER_ERROR')
      }
      if (response.status === 402 || response.status === 429) {
        throw new FreeSearchError(`${title} rate limit or quota reached (HTTP ${response.status})${suffix}`, 'WEB_PROVIDER_ERROR')
      }
      throw new FreeSearchError(`${title} returned HTTP ${response.status}${suffix}`, 'WEB_PROVIDER_ERROR')
    }

    try {
      return parseResponse(this.id, body, { query, count, keyed: Boolean(apiKey) })
    } catch (error) {
      const message = error instanceof ProviderResponseError ? error.message : `${title} returned an unreadable response`
      throw new FreeSearchError(errorDetail(message, apiKey), 'WEB_PROVIDER_ERROR')
    }
  }
}

export function apply(ctx, config = {}) {
  const settings = normalizeSettings(config)
  for (const id of settings.providers) {
    ctx.web.registerSearchProvider(new FreeSearchProvider(ctx, id, settings))
  }
}
