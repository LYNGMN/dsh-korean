/**
 * Auto review resilience: configuration and failure classification.
 *
 * The plugin only reacts to reviewer streams (`purpose: 'auto-review'`). It
 * retries transient failures, and when retries are exhausted it turns the
 * failure into a user-approval request. It never approves a tool by itself.
 */

/** Defaults for every tunable value. */
export const DEFAULTS = Object.freeze({
  enabled: true,
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 8000,
  jitterRatio: 0.2,
  askOnFailure: true,
  fallback: null,
  fallbackAfter: 2
})

/** Failure codes a retry can plausibly fix. */
const RETRYABLE_CODES = new Set([
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
  'EMPTY_RESPONSE'
])

/** Adapters may report an HTTP status as the failure code. */
const RETRYABLE_HTTP = /^HTTP_(?:429|500|502|503|504)$/u

/** Messages that identify a transient provider condition when the code is unknown. */
const TRANSIENT_MESSAGE = /\b429\b|rate.?limit|too many requests|timed?\s*out|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|temporar|overloaded|unavailable/iu

/** Messages a retry cannot fix, even when they look transient at first. */
const PERMANENT_MESSAGE = /\b(?:auth|unauthori[sz]ed|forbidden|invalid (?:api )?key|quota|context (?:window|length)|prompt (?:is )?too long|abort|cancel)/iu

/** One retryable failure description, or false for anything else. */
export function isRetryableFailure(failure) {
  if (failure === null || typeof failure !== 'object') return false
  const code = typeof failure.code === 'string' ? failure.code : ''
  if (RETRYABLE_CODES.has(code) || RETRYABLE_HTTP.test(code)) return true
  const message = typeof failure.message === 'string' ? failure.message : ''
  if (message === '' || PERMANENT_MESSAGE.test(message)) return false
  return TRANSIENT_MESSAGE.test(message)
}

/** Classify a thrown stream error without retrying cancellation. */
export function isRetryableError(error) {
  if (error === null || typeof error !== 'object') return false
  if (error.name === 'AbortError' || error.code === 'ABORTED') return false
  if (error.failure !== undefined) return isRetryableFailure(error.failure)
  return isRetryableFailure({ code: error.code, message: error.message })
}

/** The last terminal chunk of a collected stream, if any. */
export function terminalChunk(chunks) {
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index]
    if (chunk !== null && typeof chunk === 'object' && chunk.type === 'finish') return chunk
  }
  return undefined
}

/** Bounded exponential backoff with symmetric jitter around each local delay. */
export function backoffDelay(config, attempt, random = Math.random) {
  const exponent = Math.max(0, attempt - 1)
  const base = Math.min(config.maxDelayMs, config.initialDelayMs * 2 ** exponent)
  const jitter = 1 + (random() * 2 - 1) * config.jitterRatio
  return Math.max(0, Math.round(base * jitter))
}

function boolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function integer(value, fallback, min, max) {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function decimal(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function normalizeFallback(value) {
  if (value === null || typeof value !== 'object') return null
  const provider = typeof value.provider === 'string' ? value.provider.trim() : ''
  const model = typeof value.model === 'string' ? value.model.trim() : ''
  return provider !== '' && model !== ''
    ? Object.freeze({ provider, model })
    : null
}

/** Clamp user configuration into the range the retry loop can honor. */
export function normalizeConfig(config = {}) {
  const source = config !== null && typeof config === 'object' ? config : {}
  const initialDelayMs = integer(source.initialDelayMs, DEFAULTS.initialDelayMs, 10, 60_000)
  const maxRetries = integer(source.maxRetries, DEFAULTS.maxRetries, 0, 10)
  return {
    enabled: boolean(source.enabled, DEFAULTS.enabled),
    maxRetries,
    initialDelayMs,
    maxDelayMs: integer(source.maxDelayMs, Math.max(DEFAULTS.maxDelayMs, initialDelayMs), initialDelayMs, 120_000),
    jitterRatio: decimal(source.jitterRatio, DEFAULTS.jitterRatio, 0, 1),
    askOnFailure: boolean(source.askOnFailure, DEFAULTS.askOnFailure),
    fallback: normalizeFallback(source.fallback),
    fallbackAfter: integer(source.fallbackAfter, DEFAULTS.fallbackAfter, 1, Math.max(1, maxRetries))
  }
}
