/**
 * Search Fallback for DSH.
 *
 * Each configured order becomes one web_search provider (for example
 * "Brave → Exa"). It runs the first provider and, when that one fails or finds
 * nothing, runs the same query on the next one.
 *
 * The bundle never imports another bundle: it looks the providers up by id in
 * the web service's registry at search time, so any bundle that registers a
 * search provider can take part, and the order of bundle loading does not matter.
 *
 * Log lines and the "every provider failed" error follow the DSH language
 * (host-locale.js). The pure helpers default to English.
 */
import { createText } from './host-locale.js'

export const inject = ['web']

/** User-facing log and error text, by DSH language. */
export const TEXT = Object.freeze({
  en: {
    noId: 'orders[{index}] has no id',
    repeatsId: 'orders[{index}] repeats id "{id}"',
    needsTwo: 'order "{id}" needs at least two providers',
    listedTwice: 'order "{id}" lists a provider twice',
    nested: 'order "{id}" uses fallback order "{nested}" as a step',
    notRegistered: 'provider "{id}" is not registered',
    unavailable: 'provider "{id}" is unavailable',
    stepFailed: '{id} failed: {message}',
    stepEmpty: '{id} returned no results',
    tryingNext: '{order}: {failure}; trying {next}',
    allFailed: '{title}: every provider failed. {failures}'
  },
  ko: {
    noId: 'orders[{index}]에 id가 없어요',
    repeatsId: 'orders[{index}]의 id "{id}"가 앞 항목과 겹쳐요',
    needsTwo: '순서 "{id}"에는 공급자가 두 개 이상 있어야 해요',
    listedTwice: '순서 "{id}"에 같은 공급자가 두 번 들어 있어요',
    nested: '순서 "{id}"가 다른 대체 순서 "{nested}"를 단계로 써요',
    notRegistered: '공급자 "{id}"가 등록되어 있지 않아요',
    unavailable: '공급자 "{id}"를 지금 쓸 수 없어요',
    stepFailed: '{id} 실패: {message}',
    stepEmpty: '{id} 결과 없음',
    tryingNext: '{order}: {failure} → {next}로 넘어가요',
    allFailed: '{title}: 모든 공급자가 실패했어요. {failures}'
  }
})

/** English lookup for callers without a Host context (tests, pure helpers). */
const englishText = createText(undefined, TEXT)
const ENGLISH = (key, params) => englishText(key, params, 'en')

export class SearchFallbackError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'SearchFallbackError'
    this.code = code
  }
}

const DEFAULT_ORDERS = [
  {
    id: 'brave-exa',
    title: 'Brave → Exa',
    providers: ['brave', 'exa'],
    description: {
      en: 'Searches Brave first. If Brave fails (quota, key, network) or finds nothing, the same query runs on Exa.',
      ko: '먼저 Brave로 검색해요. Brave가 실패하거나(한도·키·네트워크) 결과가 없으면 같은 검색어로 Exa를 써요.'
    }
  },
  {
    id: 'exa-brave',
    title: 'Exa → Brave',
    providers: ['exa', 'brave'],
    description: {
      en: 'Searches Exa first, which suits research and long questions. If Exa fails (credits, key, network) or finds nothing, the same query runs on Brave.',
      ko: '먼저 Exa로 검색해요. 자료 조사나 긴 질문에 잘 맞아요. Exa가 실패하거나(크레딧·키·네트워크) 결과가 없으면 같은 검색어로 Brave를 써요.'
    }
  }
]

/** Normalize the bundle config; invalid orders are dropped with a reason. */
export function normalizeSettings(config = {}, text = ENGLISH) {
  const fallbackOnEmpty = config.fallbackOnEmpty !== false
  const raw = Array.isArray(config.orders) && config.orders.length > 0 ? config.orders : DEFAULT_ORDERS
  const orders = []
  const problems = []
  const ids = new Set()
  for (const [index, entry] of raw.entries()) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : ''
    const providers = Array.isArray(entry?.providers)
      ? entry.providers.map((p) => (typeof p === 'string' ? p.trim() : '')).filter((p) => p !== '')
      : []
    if (id === '') { problems.push(text('noId', { index })); continue }
    if (ids.has(id)) { problems.push(text('repeatsId', { index, id })); continue }
    if (providers.length < 2) { problems.push(text('needsTwo', { id })); continue }
    if (new Set(providers).size !== providers.length) { problems.push(text('listedTwice', { id })); continue }
    ids.add(id)
    orders.push({
      id,
      title: typeof entry.title === 'string' && entry.title.trim() !== '' ? entry.title.trim() : providers.join(' → '),
      providers,
      ...(entry.description !== undefined ? { description: entry.description } : {})
    })
  }
  // An order must not chain through another fallback order: that could loop.
  for (const order of orders) {
    const nested = order.providers.find((p) => ids.has(p))
    if (nested !== undefined) problems.push(text('nested', { id: order.id, nested }))
  }
  return { fallbackOnEmpty, orders: orders.filter((o) => !o.providers.some((p) => ids.has(p))), problems }
}

/** Whether a step's outcome should move on to the next provider. Cancellation never does. */
export function shouldMoveOn({ error, result, signal, fallbackOnEmpty }) {
  if (signal?.aborted) return false
  if (error !== undefined) return error?.code !== 'WEB_ABORTED'
  return fallbackOnEmpty === true && (!Array.isArray(result?.sources) || result.sources.length === 0)
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

export class FallbackSearchProvider {
  /**
   * @param {{ id: string, title: string, providers: string[], description?: unknown }} order
   * @param {{ lookup: (id: string) => any, fallbackOnEmpty: boolean, log?: { warn?: Function }, text?: Function }} options
   */
  constructor(order, { lookup, fallbackOnEmpty, log, text = ENGLISH }) {
    this.id = order.id
    this.title = order.title
    if (order.description !== undefined) this.description = order.description
    this.steps = order.providers
    this.lookup = lookup
    this.fallbackOnEmpty = fallbackOnEmpty
    this.log = log
    this.text = text
  }

  /** Usable while at least one step is registered and available. */
  available() {
    return this.steps.some((id) => {
      const provider = this.lookup(id)
      try {
        return provider !== undefined && provider.available() === true
      } catch {
        return false
      }
    })
  }

  async search(request, signal) {
    const failures = []
    let lastEmpty
    for (const [index, id] of this.steps.entries()) {
      const last = index === this.steps.length - 1
      const provider = this.lookup(id)
      let error
      let result
      if (provider === undefined) {
        error = new SearchFallbackError(this.text('notRegistered', { id }), 'WEB_PROVIDER_CONFIGURED_MISSING')
      } else {
        try {
          if (!provider.available()) throw new SearchFallbackError(this.text('unavailable', { id }), 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
          result = await provider.search(request, signal)
        } catch (caught) {
          error = caught
        }
      }
      if (!shouldMoveOn({ error, result, signal, fallbackOnEmpty: this.fallbackOnEmpty })) {
        if (error !== undefined) throw error
        return result
      }
      if (error !== undefined) failures.push(this.text('stepFailed', { id, message: messageOf(error) }))
      else { failures.push(this.text('stepEmpty', { id })); lastEmpty = result }
      if (!last) this.log?.warn?.(this.text('tryingNext', { order: this.id, failure: failures.at(-1), next: this.steps[index + 1] }))
    }
    // Every step was tried. A provider that answered "no results" still answered.
    if (lastEmpty !== undefined) return lastEmpty
    throw new SearchFallbackError(this.text('allFailed', { title: this.title, failures: failures.join('; ') }), 'WEB_PROVIDER_ERROR')
  }
}

function logger(ctx) {
  try {
    if (typeof ctx.logger === 'function') return ctx.logger('search-fallback')
    if (typeof ctx.logger?.warn === 'function') return ctx.logger
  } catch {
    // Logging is best effort.
  }
  return undefined
}

/** Find a provider by id in the web service's registry, read at search time. */
export function registryLookup(web) {
  return (id) => {
    const registry = web?.searchProviders
    return registry instanceof Map ? registry.get(id) : undefined
  }
}

export function apply(ctx, config = {}) {
  // Read the language each time a line is written, so a change applies at once.
  const localized = createText(ctx, TEXT)
  const text = (key, params) => localized(key, params)
  const settings = normalizeSettings(config, text)
  const log = logger(ctx)
  for (const problem of settings.problems) log?.warn?.(`search-fallback: ${problem}`)
  const lookup = registryLookup(ctx.web)
  for (const order of settings.orders) {
    ctx.web.registerSearchProvider(new FallbackSearchProvider(order, { lookup, fallbackOnEmpty: settings.fallbackOnEmpty, log, text }))
  }
}
