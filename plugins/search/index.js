import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_AUTO_ORDER, PROVIDER_IDS, REQUIRES_KEY, RESULT_LIMITS, ProviderResponseError, buildRequest, normalizeSettings, parseResponse, resultCount } from './search-core.js'
import { DEFAULT_ENGINE, createCountGrants, createEngineSearchTool, createSingleEngineTool, registerSearchCommand, registerSingleEngineCommand } from './search-tool.js'

/**
 * Search for DSH (@lyngmn/dsh-search): web_search providers with and without keys, the automatic `auto`
 * provider, the `engine_search` tool and the `/search <engine> <question>` command.
 *
 *   exa        Exa (EXA_API_KEY required; also read from ~/.dsh/exa-api-key)
 *   brave      Brave (BRAVE_API_KEY required; also read from ~/.dsh/brave-api-key)
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
 *   korea      Naver and Kakao together
 *
 * Exa and Brave were separate bundles before 2026-11-18, and so was Search
 * Fallback. Their tools (`exa_search`, `brave_search`), commands (`/exa`,
 * `/brave`) and the fallback order ids (`exa-brave`, `brave-exa`,
 * `exa-brave-auto`) are kept under the same names, so profiles that name them
 * keep working. The order ids are automatic engines with a fixed order.
 * Keys are entered on the bundle's plugin page (client.js) and stored in the
 * DSH credential store.
 */
export class SearchError extends Error {
  constructor(message, code, { quota = false } = {}) {
    super(message)
    this.name = 'SearchError'
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
  // Left out of this bundle's patch on purpose: a profile that saved the 1.1
  // list must not inherit a 1.2 "known" list, or Exa and Brave would stay out.
  providersKnown: z.array(z.string()).default([])
    .description('Engines that existed when providers was written; an engine added later is registered too. List every engine here to leave a new one out.'),
  autoOrder: z.array(z.string()).default([...DEFAULT_AUTO_ORDER]).volatile()
    .description('Engines the automatic engine uses, in order. Engines left out are not used by auto.'),
  autoKnown: z.array(z.string()).default([]).volatile()
    .description('Engines that existed when autoOrder was saved; an engine added later joins the order at its default place.'),
  counts: z.dict(z.number()).default({}).volatile()
    .description('Results per engine, set on the plugin page. Clamped to each engine\'s own maximum.'),
  count: z.number().default(10).description('Results per engine when counts names none.'),
  timeoutMs: z.number().default(20000).description('Time limit per engine, in milliseconds.'),
  bingMarket: z.string().default('ko-KR').description('Bing market and Accept-Language.'),
  brave: z.object({
    country: z.string().description('Brave `country`, such as KR.'),
    searchLang: z.string().description('Brave `search_lang`, such as ko.'),
    uiLang: z.string().description('Brave `ui_lang`, such as ko-KR.')
  }).default({}).description('Brave request options.'),
  exa: z.object({
    type: z.union(['auto', 'fast', 'neural', 'keyword', 'deep']).default('auto'),
    snippetChars: z.number().default(400).description('Highlight length per result.')
  }).default({}).description('Exa request options.'),
  keyFiles: z.dict(z.string()).default({}).description('Key files Exa and Brave read after the credential store and the environment.'),
  safeSearch: z.union(['off', 'moderate', 'strict']).default('moderate'),
  keys: z.dict(z.union([z.string(), z.array(z.string())])).default({}).description('Credential names each engine looks up.')
})

const USER_AGENT = 'dsh-search/1.2.0'
/** How long the automatic order skips a provider that hit its quota or rate limit. */
export const QUOTA_COOLDOWN_MS = 10 * 60 * 1000
/** Overall time the automatic order may spend before it stops trying more providers. */
const AUTO_BUDGET_MS = 50000

export const PROVIDER_TEXT = Object.freeze({
  exa: {
    title: 'Exa',
    description: {
      en: 'Exa web search, good for research and long questions. Needs EXA_API_KEY; each search uses Exa credits.',
      ko: 'Exa 웹검색이에요. 자료 조사나 긴 질문에 잘 맞아요. EXA_API_KEY가 필요하고, 검색할 때마다 Exa 크레딧을 써요.'
    }
  },
  brave: {
    title: 'Brave',
    description: {
      en: 'Brave web search. Needs BRAVE_API_KEY; each search counts toward your Brave plan.',
      ko: 'Brave 웹검색이에요. BRAVE_API_KEY가 필요하고, 검색할 때마다 Brave 요금제 사용량에 들어가요.'
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
  korea: {
    title: 'Korea (Naver + Kakao)',
    description: {
      en: 'Searches Naver and Kakao (Daum) together for Korean pages: pages both found come first, then the rest in turn, each marked with the engine that found it. Uses the keys and result counts set for each.',
      ko: '네이버와 카카오(다음)를 함께 검색해요. 둘 다 찾은 페이지를 먼저, 나머지는 번갈아 보여 주고, 어느 엔진이 찾았는지 표시해요. 키와 결과 수는 엔진마다 정한 것을 써요.'
    }
  },
  'korea-group': {
    title: 'Korea by engine (Naver, Kakao)',
    description: {
      en: 'Searches Naver and Kakao (Daum) together and lists the results engine by engine.',
      ko: '네이버와 카카오(다음)를 함께 검색해 엔진별로 묶어 보여 줘요.'
    }
  },
  'korea-seq': {
    title: 'Korea in turn (Naver → Kakao)',
    description: {
      en: 'Searches Naver first and Kakao (Daum) only when Naver fails or finds nothing.',
      ko: '네이버로 먼저 찾고, 실패하거나 결과가 없을 때만 카카오(다음)를 써요.'
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

/**
 * Names the earlier Search Fallback bundle registered. Each is now an automatic
 * engine with a fixed order (`null`: the order set on the plugin page), kept so
 * a profile whose web.searchProvider names one keeps working.
 */
export const LEGACY_ORDERS = Object.freeze({
  'exa-brave': Object.freeze({
    title: 'Exa → Brave',
    order: Object.freeze(['exa', 'brave']),
    description: {
      en: 'Former Search Fallback order: Exa, then Brave when Exa fails or finds nothing. Prefer "Auto search", whose order is set on the Search plugin page.',
      ko: '예전 검색 자동 전환 순서예요. Exa가 실패하거나 결과가 없으면 Brave를 써요. 순서를 검색 플러그인 페이지에서 정하는 "자동 검색"을 쓰세요.'
    }
  }),
  'brave-exa': Object.freeze({
    title: 'Brave → Exa',
    order: Object.freeze(['brave', 'exa']),
    description: {
      en: 'Former Search Fallback order: Brave, then Exa when Brave fails or finds nothing. Prefer "Auto search", whose order is set on the Search plugin page.',
      ko: '예전 검색 자동 전환 순서예요. Brave가 실패하거나 결과가 없으면 Exa를 써요. 순서를 검색 플러그인 페이지에서 정하는 "자동 검색"을 쓰세요.'
    }
  }),
  'exa-brave-auto': Object.freeze({
    title: 'Exa → Brave → Auto',
    order: null,
    description: {
      en: 'Former Search Fallback name for "Auto search": the engines in the order set on the Search plugin page (Exa and Brave first by default).',
      ko: '"자동 검색"의 예전 검색 자동 전환 이름이에요. 검색 플러그인 페이지에서 정한 순서로 엔진을 써요(기본은 Exa, Brave가 먼저).'
    }
  })
})

/**
 * The web_search provider the profile picks (`web.searchProvider`), read from
 * the Host settings service (`describe()` lists `{ ns, value }` per section).
 * undefined: none picked; null: it cannot be read.
 */
export function readWebSearchProvider(ctx) {
  let described
  try {
    described = ctx.get?.('settings')?.describe?.()
  } catch {
    return null
  }
  if (!Array.isArray(described)) return null
  const web = described.find((entry) => entry?.ns === 'web')
  if (web === undefined) return null
  const value = web.value?.searchProvider
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Engines that also get a tool and a command of their own, as before the merge. */
export const SINGLE_ENGINE_TOOLS = Object.freeze(['exa', 'brave'])

function expandHome(value) {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return isAbsolute(value) ? value : join(homedir(), value)
}

/** A key saved in a file (trimmed). A missing file is ''; any other read error is reported with the path. */
export async function readKeyFile(path) {
  if (!path) return ''
  const file = expandHome(path)
  try {
    return (await readFile(file, 'utf8')).trim()
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return ''
    throw new SearchError(`could not read the key file "${file}": ${error?.message ?? error}`, 'WEB_PROVIDER_ERROR')
  }
}

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

export class EngineSearchProvider {
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
    if (query.length === 0) throw new SearchError(`${title} requires a non-empty query`, 'WEB_PROVIDER_ERROR')
    if (signal?.aborted) throw new SearchError(`${title} search aborted`, 'WEB_ABORTED')

    const names = this.settings.keyNames[this.id] ?? []
    const keys = await Promise.all(names.map((name) => resolveOptionalKey(this.ctx, name)))
    // Exa and Brave also read the key file their earlier bundles documented.
    if (keys.length === 1 && !keys[0]) keys[0] = await readKeyFile(this.settings.keyFiles[this.id])
    if (signal?.aborted) throw new SearchError(`${title} search aborted`, 'WEB_ABORTED')
    const keyed = keys.length > 0 && keys.every(Boolean)
    if (REQUIRES_KEY.includes(this.id) && !keyed) {
      const missing = names.filter((_, index) => !keys[index]).join(', ')
      throw new SearchError(`${title} needs ${missing}. Add it on the Search plugin page.`, 'WEB_PROVIDER_CREDENTIAL_MISSING')
    }

    const count = resultCount(this.settings, this.id, request?.userCount)
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
      if (signal?.aborted) throw new SearchError(`${title} search aborted`, 'WEB_ABORTED')
      if (timeout.signal.aborted) throw new SearchError(`${title} did not answer within ${this.settings.timeoutMs / 1000}s`, 'WEB_PROVIDER_ERROR')
      throw new SearchError(`${title} request failed: ${errorDetail(error?.message ?? error, keys)}`, 'WEB_PROVIDER_ERROR')
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const detail = errorDetail(body, keys)
      const suffix = detail ? `: ${detail}` : ''
      if (keyed && (response.status === 401 || response.status === 403)) {
        throw new SearchError(`${title} rejected the API key (HTTP ${response.status})${suffix}`, 'WEB_PROVIDER_ERROR')
      }
      if (this.id === 'firecrawl' && !keyed && response.status === 403) {
        throw new SearchError(`Firecrawl refused the keyless tier from this network (often a VPN or proxy); add FIRECRAWL_API_KEY${suffix}`, 'WEB_PROVIDER_ERROR', { quota: true })
      }
      if (response.status === 402 || response.status === 429) {
        throw new SearchError(`${title} rate limit or quota reached (HTTP ${response.status})${suffix}`, 'WEB_PROVIDER_ERROR', { quota: true })
      }
      throw new SearchError(`${title} returned HTTP ${response.status}${suffix}`, 'WEB_PROVIDER_ERROR')
    }

    try {
      return parseResponse(this.id, body, { query, count, keyed, snippetChars: this.settings.exa.snippetChars })
    } catch (error) {
      const message = error instanceof ProviderResponseError ? error.message : `${title} returned an unreadable response`
      throw new SearchError(errorDetail(message, keys), 'WEB_PROVIDER_ERROR', { quota: error?.kind === 'quota' })
    }
  }
}

/**
 * The automatic provider: runs the engines in the order set on the plugin page for one query.
 * A provider that hit its quota is skipped for QUOTA_COOLDOWN_MS.
 */
export class AutoSearchProvider {
  /**
   * @param {{ providers: Map<string, any>, settings: any, now?: () => number, log?: any,
   *   id?: string, title?: string, description?: unknown, order?: readonly string[] | null }} options
   * `order` fixes the engines and their order (a legacy order id); without it
   * the order set on the plugin page applies.
   */
  constructor({ providers, settings, now = () => Date.now(), log, id = DEFAULT_ENGINE, title = PROVIDER_TEXT.auto.title, description = PROVIDER_TEXT.auto.description, order = null }) {
    this.id = id
    this.title = title
    this.description = description
    this.fixedOrder = order
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
    return this.wantedOrder().filter((id) => this.providers.has(id) && !((this.resting.get(id) ?? 0) > this.now()))
  }

  /** The fixed order of a legacy order id, or the order set on the plugin page. */
  wantedOrder() {
    return this.fixedOrder ?? this.settings.autoOrder()
  }

  async search(request, signal) {
    const query = String(request?.query ?? '').trim()
    if (query.length === 0) throw new SearchError('Auto search requires a non-empty query', 'WEB_PROVIDER_ERROR')
    const started = this.now()
    const failures = []
    let lastEmpty
    const order = this.orderFor()
    if (order.length === 0 && this.wantedOrder().length === 0) {
      throw new SearchError('Auto search has no engine checked. Tick at least one engine under "Automatic engine order" on the Search plugin page.', 'WEB_PROVIDER_ERROR')
    }
    for (const id of order) {
      if (signal?.aborted) throw new SearchError('Auto search aborted', 'WEB_ABORTED')
      if (this.now() - started > AUTO_BUDGET_MS) {
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
        if (error?.code !== 'WEB_PROVIDER_CREDENTIAL_MISSING') this.log?.warn?.(`search: ${id} failed: ${error?.message ?? error}`)
        failures.push(`${id}: ${error?.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' ? 'no key' : error?.message ?? error}`)
      }
    }
    if (lastEmpty !== undefined) return lastEmpty
    throw new SearchError(`Auto search: every engine failed. ${failures.join('; ') || 'no engine is enabled'}`, 'WEB_PROVIDER_ERROR')
  }
}

/** The engines the `korea` engine combines, in the order their results alternate. */
export const KOREA_MEMBERS = Object.freeze(['naver', 'kakao'])
/** The Korean engines: merged, grouped by engine, and one engine after the other. */
export const KOREA_MODES = Object.freeze({ merge: 'korea', group: 'korea-group', sequence: 'korea-seq' })

function urlKey(url) {
  return String(url).replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase()
}

/**
 * Naver and Kakao at the same time. One member failing (or lacking a key)
 * still returns the other's results.
 * - `merge` (`korea`): pages both engines found come first, then the rest in
 *   turn; each source says which engine found it (`from`).
 * - `group` (`korea-group`): Naver's results, then Kakao's that Naver did not
 *   already list, each under its engine (`group`).
 * `searchDetailed` keeps `from`, `group` and a one-line `summary` for the
 * engine_search tool; `search` (web_search) folds the engine names into the
 * snippet, since web_search sources carry only url, title, snippet and date.
 */
export class KoreaSearchProvider {
  constructor({ providers, mode = 'merge' }) {
    this.mode = mode === 'group' ? 'group' : 'merge'
    this.id = KOREA_MODES[this.mode]
    this.title = PROVIDER_TEXT[this.id].title
    this.description = PROVIDER_TEXT[this.id].description
    this.members = KOREA_MEMBERS.map((id) => providers.get(id)).filter(Boolean)
  }

  available() {
    return this.members.length > 0
  }

  async search(request, signal) {
    const result = await this.searchDetailed(request, signal)
    const sources = result.sources.map(({ from, group, ...plain }) => {
      const label = `[${from.join(' + ')}]`
      return { ...plain, snippet: plain.snippet ? `${label} ${plain.snippet}` : label }
    })
    return { sources, truncated: false, answeredBy: result.answeredBy }
  }

  async searchDetailed(request, signal) {
    const query = String(request?.query ?? '').trim()
    if (query.length === 0) throw new SearchError('Korea search requires a non-empty query', 'WEB_PROVIDER_ERROR')
    const settled = await Promise.allSettled(this.members.map((provider) => provider.search(request, signal)))
    if (signal?.aborted || settled.some((r) => r.status === 'rejected' && r.reason?.code === 'WEB_ABORTED')) {
      throw new SearchError('Korea search aborted', 'WEB_ABORTED')
    }
    const answered = []
    const failures = []
    settled.forEach((result, index) => {
      const provider = this.members[index]
      if (result.status === 'fulfilled') answered.push({ provider, sources: Array.isArray(result.value?.sources) ? result.value.sources : [] })
      else failures.push({ provider, error: result.reason })
    })
    if (answered.length === 0) {
      const missing = failures.every(({ error }) => error?.code === 'WEB_PROVIDER_CREDENTIAL_MISSING')
      const detail = failures.map(({ provider, error }) => `${provider.id}: ${error?.message ?? error}`).join('; ')
      throw new SearchError(`Korea search: both engines failed. ${detail}`, missing ? 'WEB_PROVIDER_CREDENTIAL_MISSING' : 'WEB_PROVIDER_ERROR', {
        quota: failures.some(({ error }) => error?.quota === true)
      })
    }

    // Which engines found each URL.
    const finders = new Map()
    for (const { provider, sources } of answered) {
      for (const source of sources) {
        const key = urlKey(source.url)
        const list = finders.get(key) ?? []
        if (!list.includes(provider.title)) list.push(provider.title)
        finders.set(key, list)
      }
    }
    const both = [...finders.values()].filter((list) => list.length > 1).length
    const seen = new Set()
    const take = (source, group) => {
      const key = urlKey(source.url)
      if (seen.has(key)) return undefined
      seen.add(key)
      return { ...source, from: finders.get(key), ...(group ? { group } : {}) }
    }

    let sources = []
    if (this.mode === 'group') {
      for (const { provider, sources: list } of answered) {
        for (const source of list) {
          const kept = take(source, provider.title)
          if (kept) sources.push(kept)
        }
      }
    } else {
      // One from each engine in turn; pages both found move to the front, in that same order.
      const longest = Math.max(...answered.map(({ sources: list }) => list.length))
      const turns = []
      for (let index = 0; index < longest; index += 1) {
        for (const { sources: list } of answered) if (list[index] !== undefined) turns.push(list[index])
      }
      const shared = turns.filter((source) => finders.get(urlKey(source.url)).length > 1)
      const single = turns.filter((source) => finders.get(urlKey(source.url)).length === 1)
      sources = [...shared, ...single].map((source) => take(source)).filter(Boolean)
    }

    const counts = answered.map(({ provider, sources: list }) => `${provider.title} ${list.length}`)
    const failed = failures.map(({ provider, error }) => `${provider.title} ${error?.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' ? 'has no key' : 'failed'}`)
    const summary = [...counts, ...(answered.length > 1 ? [`in both ${both}`] : []), ...failed].join(', ')
    const names = answered.filter(({ sources: list }) => list.length > 0).map(({ provider }) => provider.title)
    return {
      sources,
      truncated: false,
      answeredBy: names.length > 0 ? names.join(' + ') : this.title,
      summary,
      layout: this.mode === 'group' ? 'grouped' : 'merged'
    }
  }
}

function logger(ctx) {
  try {
    if (typeof ctx.logger === 'function') return ctx.logger('search')
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
    if (typeof host?.configure === 'function') ctx.effect(() => host.configure({ auto: false }), 'search: settings page')
  } catch {
    // An older Host without page policies shows its generated form; harmless.
  }
  const log = logger(ctx)
  // A name an older bundle still registers (the earlier Brave, Exa or Search
  // Fallback bundle) would make the Host refuse this whole bundle; skip that
  // one name instead and keep the rest.
  const taken = (id) => ctx.web?.searchProviders instanceof Map && ctx.web.searchProviders.has(id)
  const registerProvider = (provider) => {
    if (taken(provider.id)) {
      log?.warn?.(`search: web_search provider "${provider.id}" is already registered by another plugin; remove that plugin to use this one`)
      return
    }
    try {
      ctx.web.registerSearchProvider(provider)
    } catch (error) {
      log?.warn?.(`search: could not register "${provider.id}": ${error?.message ?? error}`)
    }
  }
  const registerTool = (tool) => {
    try {
      ctx.tools?.register?.(tool)
    } catch (error) {
      log?.warn?.(`search: could not register the ${tool.name} tool: ${error?.message ?? error}`)
    }
  }

  const providers = new Map()
  for (const id of settings.providers) {
    const provider = new EngineSearchProvider(ctx, id, settings)
    providers.set(id, provider)
    registerProvider(provider)
  }
  const auto = new AutoSearchProvider({ providers, settings, log })
  registerProvider(auto)
  // The Korean engines, when at least one member is registered. Only the merged
  // one is a web_search provider; the grouped and one-after-the-other ones are
  // for engine_search and /search, so the Web search settings list stays short.
  const korea = new KoreaSearchProvider({ providers })
  const koreaGroup = new KoreaSearchProvider({ providers, mode: 'group' })
  const koreaSeq = new AutoSearchProvider({
    providers, settings, log, id: KOREA_MODES.sequence, title: PROVIDER_TEXT['korea-seq'].title, description: PROVIDER_TEXT['korea-seq'].description, order: KOREA_MEMBERS
  })
  const koreaEngines = korea.available() ? { [KOREA_MODES.merge]: korea, [KOREA_MODES.group]: koreaGroup, [KOREA_MODES.sequence]: koreaSeq } : {}
  if (korea.available()) registerProvider(korea)
  // The earlier Search Fallback order ids, as automatic engines with a fixed
  // order: only the one web.searchProvider names (all of them when that cannot
  // be read), so the Web search settings list does not repeat auto three times.
  const legacyRegistered = new Set()
  const registerLegacy = (selected) => {
    for (const [id, legacy] of Object.entries(LEGACY_ORDERS)) {
      if (legacyRegistered.has(id) || (selected !== null && selected !== id)) continue
      if (legacy.order !== null && !legacy.order.some((engine) => providers.has(engine))) continue
      legacyRegistered.add(id)
      registerProvider(new AutoSearchProvider({ providers, settings, log, id, title: legacy.title, description: legacy.description, order: legacy.order }))
    }
  }
  registerLegacy(readWebSearchProvider(ctx))
  // A profile that switches to a legacy id later (the settings page cannot list it, but a patch or the CLI can) gets it.
  try {
    ctx.on?.('settings/document-updated', (ns) => {
      if (ns !== 'web') return
      const selected = readWebSearchProvider(ctx)
      if (typeof selected === 'string') registerLegacy(selected)
    })
  } catch {
    // An older Host without settings events keeps what was registered at start.
  }

  const engines = [DEFAULT_ENGINE, ...Object.keys(koreaEngines), ...settings.providers]
  const lookup = (engine) => (engine === DEFAULT_ENGINE ? auto : koreaEngines[engine] ?? providers.get(engine))
  // The count a /search, /exa or /brave command sets for one search; the tools follow only this.
  const grants = createCountGrants()
  registerTool(createEngineSearchTool({ engines, lookup, grants }))
  if (ctx.commands !== undefined) {
    const titles = Object.fromEntries(engines.map((engine) => [engine, PROVIDER_TEXT[engine].title]))
    registerSearchCommand(ctx, { engines, titles, grants, maxFor: (engine) => RESULT_LIMITS[engine]?.max })
  }
  // `exa_search`, `brave_search`, `/exa` and `/brave` keep the names of the earlier bundles.
  for (const engine of SINGLE_ENGINE_TOOLS) {
    const provider = providers.get(engine)
    if (provider === undefined) continue
    const toolName = `${engine}_search`
    const title = PROVIDER_TEXT[engine].title
    registerTool(createSingleEngineTool({ toolName, engine, title, provider, grants }))
    if (ctx.commands !== undefined) {
      registerSingleEngineCommand(ctx, {
        commandName: engine,
        toolName,
        engine,
        title,
        description: { en: `Search the web with ${title} for this request only`, ko: `이번 요청만 ${title}로 웹검색해요` },
        grants,
        max: RESULT_LIMITS[engine]?.max,
        onError: (error) => log?.warn?.(`search: could not register /${engine}: ${error?.message ?? error}`)
      })
    }
  }
}
