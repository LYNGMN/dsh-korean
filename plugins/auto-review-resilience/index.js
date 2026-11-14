/**
 * Auto review resilience for DSH.
 *
 * Auto review sends one extra model request before every supported tool call.
 * That request is a direct `ctx.llm.stream()` call with `purpose: 'auto-review'`,
 * so the agent-level retry executor never sees it: a transient 429 or 5xx ends
 * the review and the tool body is not executed.
 *
 * This plugin wraps that one request. It buffers the reviewer stream (the
 * reviewer's output is never shown token by token), retries transient failures
 * with bounded backoff, and — when retries are exhausted — turns the resulting
 * AUTO_REVIEW_FAILED deny into an explicit `ask` decision. A human must still
 * approve the call; this plugin never returns `allow`.
 *
 * Main-agent requests and ordinary streaming are passed through untouched.
 */
import {
  backoffDelay,
  isRetryableError,
  isRetryableFailure,
  normalizeConfig,
  terminalChunk
} from './core.js'

/** The model service is the only hard dependency. */
export const inject = ['llm']

/**
 * Options objects this plugin created for its own retry calls. The retry
 * re-enters `llm/stream` from the top; seeing its own object here makes the
 * hook pass through instead of retrying recursively.
 */
const RETRY_OPTIONS = new WeakSet()

/**
 * Reviewer options currently inside this wrapper. A downstream hook (the
 * spare-key failover) may call `ctx.llm.stream()` with the same options object;
 * that nested call passes through instead of starting a second retry loop.
 */
const ACTIVE_REVIEWS = new WeakSet()

const REVIEW_PURPOSE = 'auto-review'
const FAILED_CODE = 'AUTO_REVIEW_FAILED'

function abortError() {
  const error = new Error('auto-review-resilience: aborted')
  error.name = 'AbortError'
  error.code = 'ABORTED'
  return error
}

/** Wait for one backoff step, but never ignore cancellation. */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener?.('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

/** A fresh options object for one retry, optionally on the fallback route. */
function retryOptionsFor(base, config, attempt) {
  const useFallback = config.fallback !== null && attempt >= config.fallbackAfter
  const next = useFallback
    ? { ...base, provider: config.fallback.provider, model: config.fallback.model }
    : { ...base }
  RETRY_OPTIONS.add(next)
  return next
}

/** Consume one attempt completely so a retry never leaks partial output. */
async function collect(iterable, signal) {
  const chunks = []
  try {
    for await (const chunk of iterable) {
      if (signal?.aborted) throw abortError()
      chunks.push(chunk)
    }
    return { chunks, error: undefined }
  } catch (error) {
    return { chunks, error }
  }
}

/** Decide whether one collected attempt is a transient failure worth retrying. */
function retryableAttempt(chunks, error) {
  if (error !== undefined) return isRetryableError(error)
  const terminal = terminalChunk(chunks)
  if (terminal === undefined) return true
  return terminal.reason?.kind === 'error' && isRetryableFailure(terminal.reason.failure)
}

/**
 * Wrap only reviewer streams. Every other stream is delegated immediately.
 * The first attempt uses `next()` so downstream listeners (for example the
 * spare-key failover hook) still run; retries call the model service again,
 * because a waterfall `next()` can be used only once.
 */
async function* reviewStream(ctx, config, options, next) {
  if (options?.purpose !== REVIEW_PURPOSE || RETRY_OPTIONS.has(options) || ACTIVE_REVIEWS.has(options)) {
    yield* next()
    return
  }

  ACTIVE_REVIEWS.add(options)
  try {
    let attempt = 0
    let first = true
    let lastChunks
    let lastError

    for (;;) {
      if (!first) await sleep(backoffDelay(config, attempt), options.signal)
      if (options.signal?.aborted) throw abortError()

      let source
      try {
        source = first ? next() : ctx.llm.stream(retryOptionsFor(options, config, attempt))
      } catch (error) {
        if (!isRetryableError(error)) throw error
        lastChunks = undefined
        lastError = error
        if (attempt >= config.maxRetries) break
        attempt += 1
        first = false
        continue
      }

      const { chunks, error } = await collect(source, options.signal)
      if (options.signal?.aborted) throw abortError()

      if (!retryableAttempt(chunks, error)) {
        if (error !== undefined) throw error
        for (const chunk of chunks) yield chunk
        return
      }

      lastChunks = error === undefined ? chunks : undefined
      lastError = error
      if (attempt >= config.maxRetries) break
      attempt += 1
      first = false
    }

    // Exhausted: hand the last attempt back to Auto review unchanged so its
    // ordinary AUTO_REVIEW_FAILED message and structured code stay intact.
    if (lastChunks !== undefined) {
      for (const chunk of lastChunks) yield chunk
      return
    }
    throw lastError
  } finally {
    ACTIVE_REVIEWS.delete(options)
  }
}

/** Keep the provider's reason but drop Auto review's fixed sentence. */
function failureDetail(reason) {
  if (typeof reason !== 'string') return ''
  return reason
    .replace(/^Auto review of tool "[^"]*" failed; its body was not executed:\s*/u, '')
    .trim()
    .slice(0, 240)
}

/** Turn a reviewer failure into a human approval request, never into allow. */
function askDecision(config, decision) {
  const detail = failureDetail(decision.reason)
  const suffix = detail === '' ? '' : ` (${detail})`
  const attempts = config.maxRetries + 1
  return {
    kind: 'ask',
    reason: `Auto review was unavailable after ${attempts} attempt${attempts === 1 ? '' : 's'}; approving this call runs it without an automated review.`,
    displayReason: {
      en: `Auto review is temporarily unavailable, so this call needs your approval.${suffix}`,
      ko: `자동 검토를 재시도했지만 일시적으로 쓸 수 없어 직접 승인이 필요해요.${suffix}`
    }
  }
}

/** Ask only for a technical failure; a real reviewer denial stays a denial. */
async function gate(config, exec, next) {
  const decision = await next()
  if (decision === null || typeof decision !== 'object') return decision
  if (decision.kind !== 'deny') return decision
  if (decision.info?.code !== FAILED_CODE) return decision
  return askDecision(config, decision)
}

/** Install the stream wrapper and the failure-approval gate. */
export function apply(ctx, config = {}) {
  const settings = normalizeConfig(config)
  if (!settings.enabled) return

  ctx.effect(
    () => ctx.on('llm/stream', (options, next) => reviewStream(ctx, settings, options, next), { prepend: true }),
    'auto-review-resilience: reviewer retry'
  )

  if (settings.askOnFailure) {
    // This bundle is installed after the auto-review bundle, so this prepended
    // listener runs before Auto review's own prepended gate and can inspect its
    // AUTO_REVIEW_FAILED denial.
    ctx.effect(
      () => ctx.on('tools/pre-execute', (exec, next) => gate(settings, exec, next), { prepend: true }),
      'auto-review-resilience: failure approval'
    )
  }
}

export const _internals = { reviewStream, gate, askDecision, retryOptionsFor, RETRY_OPTIONS, ACTIVE_REVIEWS }
