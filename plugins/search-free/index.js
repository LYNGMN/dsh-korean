import z from '@deepseek-ai/schemastery'
import { DEFAULT_AUTO_ORDER, PROVIDER_IDS, REQUIRES_KEY, ProviderResponseError, buildRequest, normalizeSettings, parseResponse, resultCount } from './free-core.js'
import { DEFAULT_ENGINE, createFreeSearchTool, registerSearchCommand } from './search-tool.js'

/**
 * Search for DSH (@lyngmn/dsh-search-free): free web_search providers, the automatic `auto`
 * provider, the `free_search` tool and the `/search <engine> <question>` command.
 *
 *   you        You.com (keyless, 100 searches a day; YDC_API_KEY raises it)
 *   parallel   Parallel (keyless MCP with a tight rate limit; PARALLEL_API_KEY uses the REST API)
 *   keenable   Keenable (keyless MCP; KEENABLE_API_KEY uses the REST API)
 *   tavily     Tavily (keyless tier with a very small daily cap; TAVILY_API_KEY lifts it)
 *   tinyfish   TinyFish (TINYFISH_API_KEY required; free plan)
 *   jina       Jina (JINA_API_KEY required; free tokens on sign-up)
 *   firecrawl  Firecrawl (keyless; FIRECRAWL_API_KEY raises the limit)
 *   naver      Naver web documents (NAVER_CLIENT_ID + NAVER_CLIENT_SECRET required)
 *   kakao      Kakao Daum web search (KAKAO_REST_API_KEY required)
 *   bing       Bing result page (no key)
 *   auto       tries the above in turn, in the order set on the plugin page
 *
 * Every provider is registered on its own so Search Fallback can put them in
 * any order. Nothing here selects web.searchProvider. Keys are entered on the
 * bundle's plugin page (client.js) and stored in the DSH credential store.
 */
export class FreeSearchError extends Error {
  constructor(message, code, { quota = false } = {}) {
    super(message)
    this.name = 'FreeSearchError'
    this.code = code
    this.quota = quota
  }
}

export const inject = ['web', 'tools', 'commands']

/**
 * The bundle's settings. DSH reads this schema to give the entry a settings
 * namespace; `autoOrder` is volatile, so the plugin page writes it through
 * `settings.update` and the next search uses it without a restart. The other
 * fields are set in cordis.patch.yml.
 */
export const Config = z.object({
  providers: z.array(z.string()).default([...PROVIDER_IDS]).description('Engines to register.'),
  autoOrder: z.array(z.string()).default([...DEFAULT_AUTO_ORDER]).volatile()
    .description('Engines the automatic engine uses, in order. Engines left out are not used by auto.'),
  count: z.number().default(8).description('Results per search.'),
  timeoutMs: z.number().default(20000).description('Time limit per engine, in milliseconds.'),
  bingMarket: z.string().default('ko-KR').description('Bing market and Accept-Language.'),
  safeSearch: z.union(['off', 'moderate', 'strict']).default('moderate'),
  keys: z.dict(z.union([z.string(), z.array(z.string())])).default({}).description('Credential names each engine looks up.')
})

const USER_AGENT = 'dsh-search-free/1.1.0'
/** How long the automatic order skips a provider that hit its quota or rate limit. */
export const QUOTA_COOLDOWN_MS = 10 * 60 * 1000
/** Overall time the automatic order may spend before it stops trying more providers. */
const FREE_BUDGET_MS = 50000

export const PROVIDER_TEXT = Object.freeze({
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
  tavily: {
    title: 'Tavily',
    description: {
      en: 'Tavily web search. The keyless tier has a very small daily cap; a free TAVILY_API_KEY lifts it.',
      ko: 'Tavily 웹검색이에요. 키 없이는 하루 한도가 아주 작고, 무료 TAVILY_API_KEY를 넣으면 넉넉해져요.'
    }
  },
  tinyfish: {
    title: 'TinyFish',
    description: {
      en: 'TinyFish web search. Needs TINYFISH_API_KEY; the free plan covers many searches a day.',
      ko: 'TinyFish 웹검색이에요. TINYFISH_API_KEY가 필요하고, 무료 요금제로 하루에 많이 쓸 수 있어요.'
    }
  },
  jina: {
    title: 'Jina',
    description: {
      en: 'Jina web search. Needs JINA_API_KEY; new accounts get free tokens.',
      ko: 'Jina 웹검색이에요. JINA_API_KEY가 필요하고, 가입하면 무료 토큰을 줘요.'
    }
  },
  firecrawl: {
    title: 'Firecrawl',
    description: {
      en: 'Firecrawl web search. Works without a key except behind some VPNs or proxies; FIRECRAWL_API_KEY raises the limit.',
      ko: 'Firecrawl 웹검색이에요. 키 없이 쓰지만 VPN·프록시에서는 막힐 수 있고, FIRECRAWL_API_KEY를 넣으면 한도가 늘어요.'
    }
  },
  naver: {
    title: 'Naver',
    description: {
      en: 'Naver web document search, strong on Korean pages. Needs NAVER_CLIENT_ID and NAVER_CLIENT_SECRET.',
      ko: '네이버 웹문서 검색이에요. 한국어 페이지에 강해요. NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET이 필요해요.'
    }
  },
  kakao: {
    title: 'Kakao (Daum)',
    description: {
      en: 'Kakao Daum web search, strong on Korean pages. Needs KAKAO_REST_API_KEY.',
      ko: '카카오(다음) 웹검색이에요. 한국어 페이지에 강해요. KAKAO_REST_API_KEY가 필요해요.'
    }
  },
  bing: {
    title: 'Bing',
    description: {
      en: 'Bing results read from the result page. No key or quota, but Bing may answer some networks with empty or human-check pages.',
      ko: 'Bing 검색 결과 페이지를 읽어요. 키와 한도는 없지만, 네트워크에 따라 빈 결과나 사람 확인 페이지가 나올 수 있어요.'
    }
  },
  auto: {
    title: 'Auto search',
    description: {
      en: 'Tries the engines in the order set on the Search plugin page and moves on when one fails or finds nothing. Engines without a needed key are skipped.',
      ko: '검색 플러그인 페이지에서 정한 순서로 엔진을 차례로 써요. 하나가 실패하거나 결과가 없으면 다음으로 넘어가고, 키가 필요한데 없는 엔진은 건너뛰어요.'
    }
  }
})

/** Look a key up in the DSH credential store, then the launch environment. Missing is ''. */
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

/** Short, single-line error detail that never carries a key. */
export function errorDetail(value, keys = []) {
  let detail = String(value ?? '').replace(/\s+/g, ' ').trim()
  for (const key of keys) if (key) detail = detail.split(key).join('***')
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

    const names = this.settings.keyNames[this.id] ?? []
    const keys = await Promise.all(names.map((name) => resolveOptionalKey(this.ctx, name)))
    if (signal?.aborted) throw new FreeSearchError(`${title} search aborted`, 'WEB_ABORTED')
    const keyed = keys.length > 0 && keys.every(Boolean)
    if (REQUIRES_KEY.includes(this.id) && !keyed) {
      const missing = names.filter((_, index) => !keys[index]).join(', ')
      throw new FreeSearchError(`${title} needs ${missing}. Add it on the Search plugin page.`, 'WEB_PROVIDER_CREDENTIAL_MISSING')
    }

    const count = resultCount(this.settings, request)
    const planned = buildRequest(this.id, { query, count, keys: keyed ? keys : [], settings: this.settings })
    // A plain timer (not AbortSignal.timeout) so the wait also holds in a bare Node process.
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), this.settings.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal

    let response
    let body
    try {
      const send = ({ url, init }) => fetch(url, { ...init, headers: { ...init.headers, 'user-agent': USER_AGENT }, redirect: 'follow', signal: combined })
      response = await send(planned)
      // A key the primary host rejects may still belong to the fallback host (Naver's old console).
      if (planned.fallback && (response.status === 401 || response.status === 403)) {
        await response.body?.cancel?.()
        response = await send(planned.fallback)
      }
      body = await response.text()
    } catch (error) {
      if (signal?.aborted) throw new FreeSearchError(`${title} search aborted`, 'WEB_ABORTED')
      if (timeout.signal.aborted) throw new FreeSearchError(`${title} did not answer within ${this.settings.timeoutMs / 1000}s`, 'WEB_PROVIDER_ERROR')
      throw new FreeSearchError(`${title} request failed: ${errorDetail(error?.message ?? error, keys)}`, 'WEB_PROVIDER_ERROR')
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const detail = errorDetail(body, keys)
      const suffix = detail ? `: ${detail}` : ''
      if (keyed && (response.status === 401 || response.status === 403)) {
        throw new FreeSearchError(`${title} rejected the API key (HTTP ${response.status})${suffix}`, 'WEB_PROVIDER_ERROR')
      }
      if (this.id === 'firecrawl' && !keyed && response.status === 403) {
        throw new FreeSearchError(`Firecrawl refused the keyless tier from this network (often a VPN or proxy); add FIRECRAWL_API_KEY${suffix}`, 'WEB_PROVIDER_ERROR', { quota: true })
      }
      if (response.status === 402 || response.status === 429) {
        throw new FreeSearchError(`${title} rate limit or quota reached (HTTP ${response.status})${suffix}`, 'WEB_PROVIDER_ERROR', { quota: true })
      }
      throw new FreeSearchError(`${title} returned HTTP ${response.status}${suffix}`, 'WEB_PROVIDER_ERROR')
    }

    try {
      return parseResponse(this.id, body, { query, count, keyed })
    } catch (error) {
      const message = error instanceof ProviderResponseError ? error.message : `${title} returned an unreadable response`
      throw new FreeSearchError(errorDetail(message, keys), 'WEB_PROVIDER_ERROR', { quota: error?.kind === 'quota' })
    }
  }
}

/**
 * The automatic provider: runs the free engines in turn for one query.
 * A provider that hit its quota is skipped for QUOTA_COOLDOWN_MS.
 */
export class FreeAutoProvider {
  constructor({ providers, settings, now = () => Date.now(), log }) {
    this.id = DEFAULT_ENGINE
    this.title = PROVIDER_TEXT.auto.title
    this.description = PROVIDER_TEXT.auto.description
    this.providers = providers
    this.settings = settings
    this.now = now
    this.log = log
    this.resting = new Map()
  }

  available() {
    return this.providers.size > 0
  }

  /** The order set on the plugin page, without providers that are resting. */
  orderFor() {
    return this.settings.autoOrder().filter((id) => this.providers.has(id) && !((this.resting.get(id) ?? 0) > this.now()))
  }

  async search(request, signal) {
    const query = String(request?.query ?? '').trim()
    if (query.length === 0) throw new FreeSearchError('Free search requires a non-empty query', 'WEB_PROVIDER_ERROR')
    const started = this.now()
    const failures = []
    let lastEmpty
    const order = this.orderFor()
    if (order.length === 0 && this.settings.autoOrder().length === 0) {
      throw new FreeSearchError('Auto search has no engine checked. Tick at least one engine under "Automatic engine order" on the Search plugin page.', 'WEB_PROVIDER_ERROR')
    }
    for (const id of order) {
      if (signal?.aborted) throw new FreeSearchError('Free search aborted', 'WEB_ABORTED')
      if (this.now() - started > FREE_BUDGET_MS) {
        failures.push('time budget used up')
        break
      }
      const provider = this.providers.get(id)
      try {
        const result = await provider.search(request, signal)
        if (Array.isArray(result?.sources) && result.sources.length > 0) return { ...result, answeredBy: provider.title }
        failures.push(`${id}: no results`)
        lastEmpty = { ...result, answeredBy: provider.title }
      } catch (error) {
        if (signal?.aborted || error?.code === 'WEB_ABORTED') throw error
        if (error?.quota) this.resting.set(id, this.now() + QUOTA_COOLDOWN_MS)
        // A missing key is expected for key-only engines; keep it out of the warning log.
        if (error?.code !== 'WEB_PROVIDER_CREDENTIAL_MISSING') this.log?.warn?.(`search-free: ${id} failed: ${error?.message ?? error}`)
        failures.push(`${id}: ${error?.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' ? 'no key' : error?.message ?? error}`)
      }
    }
    if (lastEmpty !== undefined) return lastEmpty
    throw new FreeSearchError(`Free search: every engine failed. ${failures.join('; ') || 'no engine is enabled'}`, 'WEB_PROVIDER_ERROR')
  }
}

function logger(ctx) {
  try {
    if (typeof ctx.logger === 'function') return ctx.logger('search-free')
    if (typeof ctx.logger?.warn === 'function') return ctx.logger
  } catch {
    // Logging is best effort.
  }
  return undefined
}

export function apply(ctx, config = {}) {
  const settings = normalizeSettings(config)
  // The plugin page carries its own order editor (client.js), so DSH need not
  // generate a second form for this entry.
  try {
    const host = ctx.get?.('settings')
    if (typeof host?.configure === 'function') ctx.effect(() => host.configure({ auto: false }), 'search-free: settings page')
  } catch {
    // An older Host without page policies shows its generated form; harmless.
  }
  const providers = new Map()
  for (const id of settings.providers) {
    const provider = new FreeSearchProvider(ctx, id, settings)
    providers.set(id, provider)
    ctx.web.registerSearchProvider(provider)
  }
  const auto = new FreeAutoProvider({ providers, settings, log: logger(ctx) })
  ctx.web.registerSearchProvider(auto)

  const engines = [DEFAULT_ENGINE, ...settings.providers]
  const lookup = (engine) => (engine === DEFAULT_ENGINE ? auto : providers.get(engine))
  ctx.tools?.register?.(createFreeSearchTool({ engines, lookup }))
  if (ctx.commands !== undefined) {
    const titles = Object.fromEntries(engines.map((engine) => [engine, PROVIDER_TEXT[engine].title]))
    registerSearchCommand(ctx, { engines, titles })
  }
}
