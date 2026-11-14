import { createHash } from 'node:crypto'
import {
  activeSlot, classifyFailure, describeSlots, discoverProviders, firstSlot, isVisibleChunk, nextUsableSlot, normalizeOptions
} from './failover-core.js'
import { createText, registerLocalized } from './host-locale.js'

/**
 * Model-key failover for DSH model providers.
 *
 * Every provider that authenticates with a named key (`apiKeyEnv`) is found
 * from the adapter's configurable-provider directory and the Host's settings,
 * so a provider added later needs no change here. This includes the official
 * DeepSeek single connection as well as the pi-ai provider map.
 * For a provider whose key reference is `ACME_API_KEY`, spare keys live in
 * `ACME_API_KEY_2` … `ACME_API_KEY_5` and `ACME_API_KEY_1` keeps a copy of the
 * key typed on the Models page. The provider's own reference always keeps that
 * typed key: the key in use is kept in `ACME_ACTIVE_KEY`, and the credential
 * seam answers the provider's lookup of `ACME_API_KEY` with it. A failover
 * therefore never rewrites the main key the user typed.
 *
 * When the upstream rejects the key in use before any output, the `llm/stream`
 * hook writes the next usable key to the active reference and sends the SAME
 * request again through the same provider.
 *
 * A rate-limited key only rests for a short while; a rejected or exhausted key
 * rests much longer. Rest state is kept in memory, never on disk.
 *
 * Self-contained by design: linked profile packages cannot import the
 * installation's @deepseek-ai/* packages, so this file uses only the services
 * the Host exposes on the plugin context.
 *
 * Command descriptions, hints and results follow the DSH language
 * (host-locale.js); the commands are registered again when it changes.
 */

// The model service is the one hard dependency. Settings, credentials and
// commands are looked up through ctx.get / ctx.inject so the plugin still
// activates in a composition that does not mount them.
export const inject = ['llm']

const DISCOVERY_TTL_MS = 3000

/**
 * The Host's original `credentials.resolve`, kept on the service under this
 * symbol so this plugin's own reads bypass the active-key redirection.
 */
const ORIGINAL_RESOLVE = Symbol.for('@lyngmn/dsh-model-key-failover/original-resolve')

function toError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

async function resolveKey(ctx, ref) {
  if (typeof ref !== 'string' || ref.length === 0) return undefined
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    try {
      // Read the stored layer, never the redirection installed below: this
      // plugin must see the main key and slot values exactly as they are.
      const original = credentials[ORIGINAL_RESOLVE]
      const hit = original !== undefined ? await original(ref) : await credentials.resolve(ref)
      if (typeof hit?.value === 'string' && hit.value.trim() !== '') return hit.value.trim()
    } catch {
      // A broken store falls through to the environment.
    }
  }
  const launchEnvironment = ctx.get('launchEnvironment')
  const fromEnvironment = launchEnvironment?.get?.(ref)?.value ?? process.env[ref]
  return typeof fromEnvironment === 'string' && fromEnvironment.trim() !== '' ? fromEnvironment.trim() : undefined
}

async function storeKey(ctx, ref, value) {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) throw toError('credential service is unavailable', 'MISSING_CREDENTIAL')
  if (typeof value !== 'string' || value.length === 0) {
    await credentials.unset?.(ref)
    return
  }
  await credentials.set(ref, value)
}

/** Read every slot for one provider, in order. */
async function readSlots(ctx, provider) {
  const values = []
  for (const slot of provider.keySlots) values.push(await resolveKey(ctx, slot))
  return values
}

/**
 * The failover runtime: provider discovery, rest bookkeeping, and the key
 * operations the hook and the commands share.
 */
function createRuntime(ctx, options, now = () => Date.now()) {
  let cache
  /** route → Map(slot index → { until, print }) */
  const resting = new Map()
  /** provider key reference → the key the provider must use when it is a spare */
  const activeKeys = new Map()

  function providers() {
    if (cache !== undefined && now() - cache.at < DISCOVERY_TTL_MS) return cache.value
    let descriptors = []
    try {
      descriptors = ctx.get('settings')?.describe?.() ?? []
    } catch {
      // Settings may still be starting; keep the last good answer.
      if (cache !== undefined) return cache.value
    }
    let directory = []
    try {
      // The route, settings address, and display name each adapter declares.
      // This is what brings in a single-connection family such as the official
      // DeepSeek route, whose settings section has no `providers` map.
      directory = ctx.llm?.listConfigurableProviders?.() ?? []
    } catch {
      // A composition without the directory falls back to the settings maps.
    }
    cache = { at: now(), value: discoverProviders(descriptors, options, directory) }
    return cache.value
  }

  function restTest(provider, values) {
    const marks = resting.get(provider.provider)
    return (index) => {
      const mark = marks?.get(index)
      if (mark === undefined) return false
      // A key replaced by the user is a new key: the old mark no longer applies.
      if (mark.until <= now() || typeof values[index] !== 'string' || mark.print !== fingerprint(values[index])) {
        marks.delete(index)
        return false
      }
      return true
    }
  }

  function rest(provider, index, value, reason) {
    if (index < 0) return
    const duration = reason === 'rate-limit' ? options.rateLimitCooldownMs : options.rejectedCooldownMs
    if (!resting.has(provider.provider)) resting.set(provider.provider, new Map())
    resting.get(provider.provider).set(index, { until: now() + duration, print: fingerprint(value) })
  }

  /** Remember which key the provider must use for this reference. */
  function remember(provider, active, main) {
    if (typeof active === 'string' && active.length > 0 && active !== main) {
      activeKeys.set(provider.keyRef, active)
    } else {
      activeKeys.delete(provider.keyRef)
    }
  }

  /** Forget the redirection for one provider, e.g. after a failed read. */
  function clear(provider) {
    activeKeys.delete(provider.keyRef)
  }

  /** Write a reference only when its stored value actually changes. */
  async function ensureKey(context, ref, current, desired) {
    if (typeof desired !== 'string' || desired.length === 0 || desired === current) return
    await storeKey(context, ref, desired)
  }

  /**
   * Bring one provider's keys into a consistent state and report it.
   *
   * The provider's own reference always keeps the key typed on the Models
   * page. The key in use lives in its `activeRef`; the credential seam is
   * redirected for that one reference, so a failover never rewrites the main
   * key. Nothing is written for a provider that has no spare key.
   */
  async function sync(provider) {
    const values = await readSlots(ctx, provider)
    let main = await resolveKey(ctx, provider.keyRef)
    let active = await resolveKey(ctx, provider.activeRef)
    let persistedActive = active
    const hasSpare = values.slice(1).some((value) => typeof value === 'string' && value.length > 0)

    if (!hasSpare) {
      clear(provider)
      return { values, active: main, enabled: false }
    }

    // Repair the earlier layout that wrote the key in use into the provider's
    // own reference. The key the user typed survives in slot 1, and the key
    // that was in use becomes the active key, so the running session keeps
    // working while the main field returns to its own value.
    if (main !== undefined && values[0] !== undefined && values[0] !== main
        && activeSlot(values, main) > 0 && (activeSlot(values, active) < 0 || active === main)) {
      const inUse = main
      const typed = values[0]
      await ensureKey(ctx, provider.keyRef, main, typed)
      main = typed
      values[0] = typed
      active = inUse
      await ensureKey(ctx, provider.activeRef, persistedActive, inUse)
      persistedActive = inUse
    }

    if (main === undefined) {
      // A provider can run on spare keys alone; do not invent a main key.
      if (activeSlot(values, active) < 0) active = values[firstSlot(values)]
      await ensureKey(ctx, provider.activeRef, persistedActive, active)
    } else if (values[0] !== main) {
      // The user typed a new main key on the Models page. Slot 1 follows it
      // and the new key becomes the one in use.
      await ensureKey(ctx, provider.keySlots[0], values[0], main)
      values[0] = main
      active = main
      await ensureKey(ctx, provider.activeRef, persistedActive, main)
    } else if (activeSlot(values, active) < 0) {
      // No saved active key, or it is no longer configured: use the main key.
      active = main
      await ensureKey(ctx, provider.activeRef, persistedActive, main)
    }

    remember(provider, active, main)
    return { values, active, enabled: true }
  }

  /** Make the key in `index` the one the provider uses. */
  async function use(provider, values, index, main) {
    const next = values[index]
    if (typeof next !== 'string' || next.length === 0) {
      throw toError(`slot ${index + 1} holds no key`, 'MISSING_KEY')
    }
    await storeKey(ctx, provider.activeRef, next)
    const currentMain = main !== undefined ? main : await resolveKey(ctx, provider.keyRef)
    remember(provider, next, currentMain)
    return next
  }

  /**
   * After `failedKey` failed for `reason`, move the provider to another key.
   * The provider's main reference is never touched.
   * @returns whether the request is worth sending again.
   */
  async function failover(provider, failedKey, reason) {
    const values = await readSlots(ctx, provider)
    const main = await resolveKey(ctx, provider.keyRef)
    const active = await resolveKey(ctx, provider.activeRef)
    const failedIndex = activeSlot(values, failedKey)
    rest(provider, failedIndex, failedKey, reason)
    const isResting = restTest(provider, values)
    // Another request already moved this provider on: just use its choice.
    if (active !== undefined && active !== failedKey && activeSlot(values, active) >= 0 && !isResting(activeSlot(values, active))) return true
    const next = nextUsableSlot(values, failedIndex, isResting)
    if (next < 0) return false
    await use(provider, values, next, main)
    return true
  }

  async function describe(provider) {
    const { values, active } = await sync(provider)
    return {
      route: provider.provider,
      displayName: provider.displayName,
      keyRef: provider.keyRef,
      activeRef: provider.activeRef,
      slots: describeSlots(provider.keySlots, values, active, restTest(provider, values))
    }
  }

  return {
    providers,
    sync,
    failover,
    describe,
    restTest,
    use,
    clear,
    activeKey: (ref) => activeKeys.get(ref),
    forget: (provider) => resting.delete(provider.provider),
    invalidate: () => { cache = undefined }
  }
}

/**
 * Answer the provider's lookup of its own key reference with the key in use.
 *
 * The Models page writes and reads the provider's reference directly, so it
 * keeps showing the key the user typed. Only the adapter's `resolve` sees the
 * active spare. This is the one seam that does not require rewriting either
 * the settings document or the stored main key on every failover.
 */
function installActiveResolution(ctx, runtime) {
  const service = ctx.get('credentials')
  if (service === undefined || typeof service.resolve !== 'function') return false
  // `ctx.get` returns Cordis's tracing proxy. The proxy's set trap writes to a
  // transient shadow, so the method is replaced on the original service the
  // adapter receives through its own lookup.
  const credentials = service[Symbol.for('cordis.original')] ?? service
  const prototype = Object.getPrototypeOf(credentials)
  const previous = credentials[ORIGINAL_RESOLVE]
  // Re-base on the provider's own method, not on a wrapper left by an earlier
  // load of this plugin, so a reload cannot stack two redirections.
  const base = typeof prototype?.resolve === 'function'
    ? prototype.resolve
    : typeof previous === 'function' ? previous : credentials.resolve
  const original = base.bind(credentials)
  const wrapper = async (ref) => {
    const active = runtime.activeKey(ref)
    if (active !== undefined) return { value: active, source: 'file' }
    return original(ref)
  }
  try {
    credentials[ORIGINAL_RESOLVE] = original
    credentials.resolve = wrapper
  } catch {
    delete credentials[ORIGINAL_RESOLVE]
    return false
  }
  ctx.effect(() => () => {
    if (credentials.resolve === wrapper) credentials.resolve = original
    if (credentials[ORIGINAL_RESOLVE] === original) delete credentials[ORIGINAL_RESOLVE]
  }, 'model-key-failover: active key resolution')
  return true
}

/**
 * Register the failover hook. The first attempt uses the wrapped `next()`.
 * A retry calls the model service again for the same provider, because a
 * waterfall `next()` may be called only once; that call passes through this
 * hook again, which is what handles a second failing key.
 */
function installHook(ctx, runtime) {
  const handler = async function* failoverStream(options, next) {
    const provider = runtime.providers().get(options?.provider)
    if (provider === undefined) {
      yield* next()
      return
    }
    let state
    try {
      state = await runtime.sync(provider)
    } catch {
      runtime.clear(provider)
      state = { enabled: false }
    }
    if (!state.enabled) {
      yield* next()
      return
    }

    // A resting key is not worth a request while another key is free.
    const isResting = runtime.restTest(provider, state.values)
    if (isResting(activeSlot(state.values, state.active))) {
      const free = nextUsableSlot(state.values, activeSlot(state.values, state.active), isResting)
      if (free >= 0) state.active = await runtime.use(provider, state.values, free)
    }
    const usedKey = state.active

    const buffered = []
    let visible = false
    let terminal
    let failed
    try {
      for await (const chunk of next()) {
        if (visible) {
          yield chunk
          continue
        }
        if (isVisibleChunk(chunk)) {
          visible = true
          for (const held of buffered) yield held
          buffered.length = 0
          yield chunk
          continue
        }
        if (chunk?.type === 'finish') {
          terminal = chunk
          break
        }
        buffered.push(chunk)
      }
    } catch (error) {
      if (visible) throw error
      failed = error
    }

    if (visible) {
      if (terminal !== undefined) yield terminal
      return
    }

    const reason = failed !== undefined
      ? classifyFailure({ kind: 'error', failure: { code: failed.code, message: failed.message } })
      : classifyFailure(terminal?.reason)
    const giveUp = function* () {
      if (failed !== undefined) throw failed
      for (const held of buffered) yield held
      if (terminal !== undefined) yield terminal
    }
    if (reason === undefined || reason === 'network') {
      yield* giveUp()
      return
    }
    let again = false
    try {
      again = await runtime.failover(provider, usedKey, reason)
    } catch {
      again = false
    }
    if (!again) {
      yield* giveUp()
      return
    }
    yield* ctx.llm.stream(options)
  }

  ctx.effect(() => ctx.on('llm/stream', handler), 'model-key-failover: llm/stream hook')
}

/** User-facing command text, by DSH language. Key values never appear here. */
export const TEXT = Object.freeze({
  en: {
    statusDescription: 'Show which model key slots are configured and which one is in use',
    describeDescription: 'Describe one provider\'s key slots as JSON, without key values',
    nextDescription: 'Move a provider to its next configured key',
    syncDescription: 'Use a provider\'s first configured key again and clear resting keys',
    setDescription: 'Store model spare keys from REF=value lines',
    optionalProviderHint: '[provider]',
    providerHint: '<provider>',
    slotActive: 'active',
    slotResting: 'resting',
    slotReady: 'ready',
    noProvider: 'No model provider with a named key was found.',
    unknownProvider: 'Unknown provider "{route}". Use one of: {list}.',
    none: '(none)',
    noOtherKey: '{name}: no other key is configured.',
    noSpareKey: '{name}: no spare key is configured.',
    noLines: 'Send at least one REF=value line.',
    notRefValue: 'A line is not REF=value. Nothing was written.',
    unknownSlot: 'Unknown key slot "{ref}". Nothing was written.',
    badValue: 'The value for "{ref}" contains characters no HTTP header can carry. Nothing was written.',
    saved: 'Saved {count} key slot(s): {refs}.'
  },
  ko: {
    statusDescription: '모델 키 칸 가운데 설정된 칸과 지금 쓰는 칸을 보여 줘요',
    describeDescription: '공급자 하나의 키 칸을 JSON으로 보여 줘요(키 값은 빼고)',
    nextDescription: '공급자를 설정된 다음 키로 바꿔요',
    syncDescription: '공급자를 첫 번째 설정 키로 되돌리고 쉬는 키를 풀어요',
    setDescription: 'REF=값 줄로 모델 예비 키를 저장해요',
    optionalProviderHint: '[공급자]',
    providerHint: '<공급자>',
    slotActive: '사용 중',
    slotResting: '쉬는 중',
    slotReady: '대기',
    noProvider: '이름 붙은 키를 쓰는 모델 공급자를 찾지 못했어요.',
    unknownProvider: '알 수 없는 공급자 "{route}"예요. 다음 가운데 하나를 쓰세요: {list}.',
    none: '(없음)',
    noOtherKey: '{name}: 설정된 다른 키가 없어요.',
    noSpareKey: '{name}: 설정된 예비 키가 없어요.',
    noLines: 'REF=값 줄을 하나 이상 보내 주세요.',
    notRefValue: 'REF=값 형식이 아닌 줄이 있어요. 아무것도 저장하지 않았어요.',
    unknownSlot: '알 수 없는 키 칸 "{ref}"예요. 아무것도 저장하지 않았어요.',
    badValue: '"{ref}" 값에 HTTP 헤더로 보낼 수 없는 글자가 있어요. 아무것도 저장하지 않았어요.',
    saved: '키 칸 {count}개를 저장했어요: {refs}.'
  }
})

const englishText = createText(undefined, TEXT)
const ENGLISH = (key, params) => englishText(key, params, 'en')

function slotWord(slot, text) {
  if (!slot.configured) return '—'
  if (slot.active) return text('slotActive')
  return text(slot.resting ? 'slotResting' : 'slotReady')
}

/** Read the current state as plain text for a command result. */
async function statusText(runtime, list, text = ENGLISH) {
  const lines = []
  for (const provider of list) {
    const state = await runtime.describe(provider)
    lines.push(`${state.displayName} (${state.route}) → ${state.slots.map((slot) => `${slot.slot}:${slotWord(slot, text)}`).join(' ')}`)
  }
  return lines.length === 0 ? text('noProvider') : lines.join('\n')
}

export function apply(ctx, config = {}) {
  const options = normalizeOptions(config)
  const runtime = createRuntime(ctx, options)
  installActiveResolution(ctx, runtime)
  installHook(ctx, runtime)

  // A changed provider set must be seen by the next request and the next
  // settings page read, not only after the cache runs out.
  for (const event of ['loader/volatile-update', 'settings/document-updated', 'llm/adapters-updated']) {
    try {
      ctx.effect(() => ctx.on(event, () => runtime.invalidate()), `model-key-failover: ${event}`)
    } catch {
      // An event this composition does not declare is simply not listened to.
    }
  }

  // Results read the language when they are produced.
  const localized = createText(ctx, TEXT)
  const t = (key, params) => localized(key, params)

  const pick = (rawInput) => {
    const route = String(rawInput ?? '').trim()
    const all = runtime.providers()
    const provider = all.get(route)
    if (provider !== undefined) return { provider }
    return { error: t('unknownProvider', { route, list: [...all.keys()].join(', ') || t('none') }) }
  }

  ctx.inject(['commands'], (scope) => {
    // Settings are read from the plugin context; the language listener lives
    // in this scope so it leaves together with the commands it re-registers.
    const host = {
      get: (name) => ctx.get(name),
      on: (event, listener) => (typeof scope.on === 'function' ? scope.on(event, listener) : ctx.on(event, listener))
    }
    registerLocalized(host, (locale) => {
      const d = (key) => localized(key, undefined, locale)
      return [
        scope.commands.register({
          name: 'model-keys-status',
          description: d('statusDescription'),
          input: { hint: d('optionalProviderHint') },
          recordInput: false,
          handler: async (invocation) => {
            const route = String(invocation?.rawInput ?? '').trim()
            if (route === '') return { kind: 'success', text: await statusText(runtime, [...runtime.providers().values()], t) }
            const { provider, error } = pick(route)
            if (error !== undefined) return { kind: 'error', text: error }
            return { kind: 'success', text: await statusText(runtime, [provider], t) }
          }
        }),
        scope.commands.register({
          name: 'model-keys-describe',
          description: d('describeDescription'),
          input: { hint: d('providerHint') },
          recordInput: false,
          handler: async (invocation) => {
            const { provider, error } = pick(invocation?.rawInput)
            if (error !== undefined) return { kind: 'error', text: error }
            // Machine-readable on purpose: the JSON keeps its field names.
            return { kind: 'success', text: JSON.stringify(await runtime.describe(provider)) }
          }
        }),
        scope.commands.register({
          name: 'model-keys-next',
          description: d('nextDescription'),
          input: { hint: d('providerHint') },
          recordInput: false,
          handler: async (invocation) => {
            const { provider, error } = pick(invocation?.rawInput)
            if (error !== undefined) return { kind: 'error', text: error }
            const { values, active, enabled } = await runtime.sync(provider)
            const next = enabled ? nextUsableSlot(values, activeSlot(values, active)) : -1
            if (next < 0) return { kind: 'error', text: t('noOtherKey', { name: provider.displayName }) }
            await runtime.use(provider, values, next)
            return { kind: 'success', text: await statusText(runtime, [provider], t) }
          }
        }),
        scope.commands.register({
          name: 'model-keys-sync',
          description: d('syncDescription'),
          input: { hint: d('providerHint') },
          recordInput: false,
          handler: async (invocation) => {
            const { provider, error } = pick(invocation?.rawInput)
            if (error !== undefined) return { kind: 'error', text: error }
            const { values, enabled } = await runtime.sync(provider)
            const first = firstSlot(values)
            if (!enabled || first < 0) return { kind: 'error', text: t('noSpareKey', { name: provider.displayName }) }
            runtime.forget(provider)
            await runtime.use(provider, values, first)
            return { kind: 'success', text: await statusText(runtime, [provider], t) }
          }
        }),
        scope.commands.register({
          name: 'model-keys-set',
          description: d('setDescription'),
          input: { hint: '<ACME_API_KEY_2=...>' },
          recordInput: false,
          handler: async (invocation) => {
            const lines = String(invocation?.rawInput ?? '')
              .replace(/\\n/g, '\n')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter((line) => line.length > 0 && !line.startsWith('#'))
            if (lines.length === 0) return { kind: 'error', text: t('noLines') }
            const known = new Set([...runtime.providers().values()].flatMap((provider) => provider.keySlots))
            const accepted = []
            for (const line of lines) {
              const separator = line.indexOf('=')
              if (separator <= 0) return { kind: 'error', text: t('notRefValue') }
              const ref = line.slice(0, separator).trim()
              const value = line.slice(separator + 1).trim()
              if (!known.has(ref)) return { kind: 'error', text: t('unknownSlot', { ref }) }
              if (!/^[\x21-\x7E]+$/.test(value)) return { kind: 'error', text: t('badValue', { ref }) }
              accepted.push([ref, value])
            }
            for (const [ref, value] of accepted) await storeKey(ctx, ref, value)
            return { kind: 'success', text: t('saved', { count: accepted.length, refs: accepted.map(([ref]) => ref).join(', ') }) }
          }
        })
      ]
    })
  }, 'model-key-failover: commands')
}

export const _internals = { resolveKey, storeKey, readSlots, createRuntime, installActiveResolution, installHook, statusText }
