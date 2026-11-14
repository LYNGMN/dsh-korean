import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apply, _internals } from '../index.js'
import {
  backoffDelay,
  isRetryableError,
  isRetryableFailure,
  normalizeConfig,
  terminalChunk
} from '../core.js'

const REVIEW_OPTIONS = Object.freeze({
  purpose: 'auto-review',
  provider: 'river',
  model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
  messages: []
})

const FAILED = Object.freeze({
  kind: 'deny',
  reason: 'Auto review of tool "bash" failed; its body was not executed: auto-review: reviewer ended with error RATE_LIMIT: 429: account_rate',
  info: { name: 'AutoReviewFailedError', code: 'AUTO_REVIEW_FAILED' }
})

function host({ upstream, config = {} } = {}) {
  const listeners = { 'llm/stream': [], 'tools/pre-execute': [] }
  const ctx = {
    effect(run) { run() },
    on(event, handler) {
      listeners[event].push(handler)
      return () => {}
    },
    llm: {
      stream(options) {
        let index = -1
        const dispatch = () => {
          index += 1
          if (index >= listeners['llm/stream'].length) return upstream(options)
          return listeners['llm/stream'][index](options, dispatch)
        }
        return dispatch()
      }
    }
  }
  apply(ctx, config)
  return { ctx, listeners }
}

async function runStream(h, options) {
  const chunks = []
  for await (const chunk of h.ctx.llm.stream(options)) chunks.push(chunk)
  return chunks
}

async function runGate(h, decision) {
  let index = -1
  const dispatch = async () => {
    index += 1
    if (index >= h.listeners['tools/pre-execute'].length) return decision
    return h.listeners['tools/pre-execute'][index]({ name: 'bash' }, dispatch)
  }
  return dispatch()
}

function scriptedUpstream({ fail = 0, failure = { code: 'RATE_LIMIT', message: '429 account_rate' } } = {}) {
  const seen = []
  let calls = 0
  async function* upstream(options) {
    seen.push(options)
    calls += 1
    if (calls <= fail) {
      yield { type: 'finish', reason: { kind: 'error', failure } }
      return
    }
    yield { type: 'text-delta', text: '{"risk":"low","decision":"allow"}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  return { upstream, seen, calls: () => calls }
}

function noopUpstream() {
  async function* upstream() {
    yield { type: 'text-delta', text: '{"risk":"low","decision":"allow"}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  return upstream
}

test('transient reviewer failures are retried and only the successful stream is yielded', async () => {
  const script = scriptedUpstream({ fail: 2 })
  const h = host({
    upstream: script.upstream,
    config: { maxRetries: 2, initialDelayMs: 10, jitterRatio: 0 }
  })
  const chunks = await runStream(h, { ...REVIEW_OPTIONS, signal: new AbortController().signal })
  assert.equal(script.calls(), 3)
  assert.equal(chunks.at(-1).reason.kind, 'stop')
  assert.equal(chunks.filter((chunk) => chunk.type === 'text-delta').length, 1)
  assert.deepEqual(script.seen.map((options) => options.provider), ['river', 'river', 'river'])
})

test('exhausted retries return the last standard failure chunk', async () => {
  const script = scriptedUpstream({ fail: 99 })
  const h = host({
    upstream: script.upstream,
    config: { maxRetries: 2, initialDelayMs: 10, jitterRatio: 0 }
  })
  const chunks = await runStream(h, { ...REVIEW_OPTIONS, signal: new AbortController().signal })
  assert.equal(script.calls(), 3)
  assert.equal(chunks.at(-1).type, 'finish')
  assert.equal(chunks.at(-1).reason.kind, 'error')
  assert.equal(chunks.at(-1).reason.failure.code, 'RATE_LIMIT')
})

test('permanent failures are not retried', async () => {
  const script = scriptedUpstream({ fail: 1, failure: { code: 'AUTH', message: '401 invalid api key' } })
  const h = host({ upstream: script.upstream, config: { maxRetries: 3, initialDelayMs: 10 } })
  const chunks = await runStream(h, { ...REVIEW_OPTIONS, signal: new AbortController().signal })
  assert.equal(script.calls(), 1)
  assert.equal(chunks.at(-1).reason.failure.code, 'AUTH')
})

test('streams that are not Auto review pass through untouched', async () => {
  const script = scriptedUpstream({ fail: 1 })
  const h = host({ upstream: script.upstream, config: { maxRetries: 3, initialDelayMs: 10 } })
  const chunks = await runStream(h, { provider: 'river', model: 'm', messages: [] })
  assert.equal(script.calls(), 1)
  assert.equal(chunks.at(-1).reason.kind, 'error')
})

test('the fallback route is used from the configured attempt', async () => {
  const script = scriptedUpstream({ fail: 99 })
  const h = host({
    upstream: script.upstream,
    config: {
      maxRetries: 2,
      initialDelayMs: 10,
      jitterRatio: 0,
      fallback: { provider: 'altare', model: 'deepseek-v4.1-flash' },
      fallbackAfter: 2
    }
  })
  await runStream(h, { ...REVIEW_OPTIONS, signal: new AbortController().signal })
  assert.deepEqual(script.seen.map((options) => options.provider), ['river', 'river', 'altare'])
  assert.deepEqual(script.seen.map((options) => options.model), [
    'deepseek-ai/DeepSeek-V4.1-Flash-1017',
    'deepseek-ai/DeepSeek-V4.1-Flash-1017',
    'deepseek-v4.1-flash'
  ])
})

test('cancellation interrupts the backoff instead of retrying', async () => {
  const script = scriptedUpstream({ fail: 99 })
  const h = host({
    upstream: script.upstream,
    config: { maxRetries: 5, initialDelayMs: 100, jitterRatio: 0 }
  })
  const controller = new AbortController()
  const running = runStream(h, { ...REVIEW_OPTIONS, signal: controller.signal })
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(running, (error) => error.name === 'AbortError')
  assert.equal(script.calls(), 1)
})

test('an already-active review passes through instead of retrying again', async () => {
  const options = { ...REVIEW_OPTIONS }
  _internals.ACTIVE_REVIEWS.add(options)
  try {
    let calls = 0
    async function* downstream() {
      calls += 1
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT' } } }
    }
    const chunks = []
    for await (const chunk of _internals.reviewStream(
      {},
      normalizeConfig({ maxRetries: 3, initialDelayMs: 10 }),
      options,
      downstream
    )) {
      chunks.push(chunk)
    }
    assert.equal(calls, 1)
    assert.equal(chunks.at(-1).reason.failure.code, 'RATE_LIMIT')
  } finally {
    _internals.ACTIVE_REVIEWS.delete(options)
  }
})

test('AUTO_REVIEW_FAILED becomes a user approval request, never allow', async () => {
  const h = host({ upstream: noopUpstream(), config: {} })
  const decision = await runGate(h, FAILED)
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason, /without an automated review/)
  assert.match(decision.displayReason.en, /needs your approval/)
  assert.match(decision.displayReason.ko, /직접 승인/)
  assert.notEqual(decision.kind, 'allow')
})

test('a real reviewer denial is not converted', async () => {
  const h = host({ upstream: noopUpstream(), config: {} })
  const denied = {
    kind: 'deny',
    reason: 'Auto review rejected tool "bash"; its body was not executed',
    info: { name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED' }
  }
  assert.equal((await runGate(h, denied)).kind, 'deny')
})

test('allow and ask decisions pass through unchanged', async () => {
  const h = host({ upstream: noopUpstream(), config: {} })
  assert.equal((await runGate(h, { kind: 'allow' })).kind, 'allow')
  assert.equal((await runGate(h, { kind: 'ask', reason: 'other' })).kind, 'ask')
})

test('askOnFailure false leaves the failure deny in place', async () => {
  const h = host({ upstream: noopUpstream(), config: { askOnFailure: false } })
  assert.equal(h.listeners['tools/pre-execute'].length, 0)
  assert.equal((await runGate(h, FAILED)).kind, 'deny')
})

test('disabled plugin installs no listeners', () => {
  const h = host({ upstream: noopUpstream(), config: { enabled: false } })
  assert.equal(h.listeners['llm/stream'].length, 0)
  assert.equal(h.listeners['tools/pre-execute'].length, 0)
})

test('configuration is clamped and invalid fallbacks are ignored', () => {
  assert.equal(normalizeConfig().maxRetries, 3)
  assert.equal(normalizeConfig({ maxRetries: 99 }).maxRetries, 10)
  assert.equal(normalizeConfig({ maxRetries: -1 }).maxRetries, 0)
  assert.equal(normalizeConfig({ initialDelayMs: 1 }).initialDelayMs, 10)
  assert.equal(normalizeConfig({ jitterRatio: 5 }).jitterRatio, 1)
  assert.equal(normalizeConfig({ fallback: { provider: 'only-provider' } }).fallback, null)
  assert.deepEqual(normalizeConfig({ fallback: { provider: 'a', model: 'b' } }).fallback, { provider: 'a', model: 'b' })
  assert.equal(normalizeConfig({ fallbackAfter: 0 }).fallbackAfter, 1)
})

test('retry classification separates transient from permanent failures', () => {
  assert.equal(isRetryableFailure({ code: 'RATE_LIMIT' }), true)
  assert.equal(isRetryableFailure({ code: 'HTTP_503' }), true)
  assert.equal(isRetryableFailure({ code: 'PROVIDER', message: '429 too many requests' }), true)
  assert.equal(isRetryableFailure({ code: 'AUTH', message: '401 invalid api key' }), false)
  assert.equal(isRetryableFailure({ code: 'QUOTA', message: 'quota exceeded' }), false)
  assert.equal(isRetryableFailure({ code: 'CONTEXT_WINDOW_EXCEEDED', message: 'context length exceeded' }), false)
  assert.equal(isRetryableFailure({ code: 'ABORTED', message: 'aborted' }), false)
  assert.equal(isRetryableError(Object.assign(new Error('socket hang up'), { code: 'TRANSPORT' })), true)
  assert.equal(isRetryableError(Object.assign(new Error('aborted'), { name: 'AbortError' })), false)
})

test('backoff doubles and respects the cap and jitter', () => {
  const config = normalizeConfig({ initialDelayMs: 100, maxDelayMs: 1000, jitterRatio: 0 })
  assert.equal(backoffDelay(config, 1), 100)
  assert.equal(backoffDelay(config, 2), 200)
  assert.equal(backoffDelay(config, 3), 400)
  assert.equal(backoffDelay(config, 10), 1000)
  const jittered = normalizeConfig({ initialDelayMs: 100, maxDelayMs: 1000, jitterRatio: 0.5 })
  assert.equal(backoffDelay(jittered, 1, () => 0), 50)
  assert.equal(backoffDelay(jittered, 1, () => 1), 150)
})

test('terminalChunk finds the last finish chunk', () => {
  assert.equal(terminalChunk([]), undefined)
  assert.equal(terminalChunk([{ type: 'text-delta' }]), undefined)
  assert.equal(terminalChunk([{ type: 'finish', reason: { kind: 'stop' } }, { type: 'text-delta' }]).reason.kind, 'stop')
})

test('the plugin never returns allow on its own', () => {
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  assert.equal(/kind:\s*'allow'/u.test(source), false)
})
