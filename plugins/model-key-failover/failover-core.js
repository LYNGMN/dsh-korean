/**
 * Pure helpers for the model-key failover bundle.
 *
 * No DSH imports, so these functions run under plain Node for tests and inside
 * the desktop Host process unchanged.
 */

/** Human-readable labels for the failure classes a key can cause. */
const REASON_LABELS = {
  AUTH: 'auth',
  QUOTA: 'quota',
  RATE_LIMIT: 'rate-limit',
  NETWORK: 'network'
}

/** Options of the whole bundle, with defaults applied. */
export function normalizeOptions(config = {}) {
  const spareSlots = Number.isInteger(config.spareSlots) && config.spareSlots >= 1 && config.spareSlots <= 9 ? config.spareSlots : 4
  const positive = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback)
  return {
    spareSlots,
    exclude: Array.isArray(config.exclude) ? config.exclude.filter((entry) => typeof entry === 'string') : [],
    // A rate-limited key is only resting; a rejected or exhausted key rests
    // much longer but is tried again later, because quotas reset.
    rateLimitCooldownMs: positive(config.rateLimitCooldownMs, 60 * 1000),
    rejectedCooldownMs: positive(config.rejectedCooldownMs, 6 * 60 * 60 * 1000)
  }
}

const REF_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Key slot names for one provider. Slot 1 keeps a copy of the key the user
 * typed on the Models page; the rest are spare keys.
 *
 * @param keyRef - the provider's own credential reference (`apiKeyEnv`).
 * @param spareSlots - how many spare keys a provider may hold.
 */
export function slotRefs(keyRef, spareSlots = 4) {
  return Array.from({ length: spareSlots + 1 }, (_, index) => `${keyRef}_${index + 1}`)
}

/**
 * The credential reference that holds the key currently in use. It is kept
 * apart from the provider's own reference so a failover never rewrites the
 * key the user typed on the Models page.
 *
 * The `*_API_KEY` spelling matches the layout the earlier sibling-route
 * version of this bundle used, so an active key saved then is adopted as is.
 *
 * @param keyRef - the provider's own credential reference (`apiKeyEnv`).
 */
export function activeRefFor(keyRef) {
  return keyRef.endsWith('_API_KEY')
    ? `${keyRef.slice(0, -'_API_KEY'.length)}_ACTIVE_KEY`
    : `${keyRef}_ACTIVE`
}

/**
 * Find every model provider that authenticates with a named key.
 *
 * Two sources are combined:
 * - the configurable-provider directory an adapter registers (route, display
 *   name, settings namespace, and the path of its profile). This covers a
 *   single-connection family such as the official DeepSeek route as well as
 *   the pi-ai routes; and
 * - the `{ providers: { <route>: { apiKeyEnv } } }` sections that older
 *   compositions and the pi-ai family carry in settings, so a provider added
 *   later is still picked up without touching this plugin.
 *
 * @param descriptors - `ctx.settings.describe()` rows.
 * @param options - normalized bundle options.
 * @param directory - `ctx.llm.listConfigurableProviders()` entries.
 */
export function discoverProviders(descriptors, options = normalizeOptions(), directory = []) {
  const found = new Map()
  const namespaces = new Map()
  for (const descriptor of Array.isArray(descriptors) ? descriptors : []) {
    if (typeof descriptor?.ns === 'string') namespaces.set(descriptor.ns, descriptor.value)
  }

  const add = (route, displayName, keyRef) => {
    if (typeof route !== 'string') return
    const name = route.trim()
    if (name === '' || !REF_NAME.test(keyRef) || options.exclude.includes(name) || found.has(name)) return
    found.set(name, {
      provider: name,
      displayName: typeof displayName === 'string' && displayName.trim() !== '' ? displayName.trim() : name,
      keyRef,
      activeRef: activeRefFor(keyRef),
      keySlots: slotRefs(keyRef, options.spareSlots)
    })
  }

  // The adapter's own declaration is the most accurate source: it names the
  // route whose requests the `llm/stream` hook receives, even when the profile
  // is a single connection rather than a `providers` map.
  for (const entry of Array.isArray(directory) ? directory : []) {
    const route = typeof entry?.provider === 'string' ? entry.provider : ''
    if (route === '' || found.has(route) || options.exclude.includes(route)) continue
    let node = namespaces.get(entry?.settingsNs)
    for (const segment of Array.isArray(entry?.settingsPath) ? entry.settingsPath : []) {
      node = node === null || typeof node !== 'object' ? undefined : node[segment]
    }
    let keyRef = typeof node?.apiKeyEnv === 'string' ? node.apiKeyEnv.trim() : ''
    // The official adapter's schema default; a descriptor that carries no
    // explicit apiKeyEnv still resolves this reference.
    if (!REF_NAME.test(keyRef) && route === 'deepseek-official') keyRef = 'DEEPSEEK_API_KEY'
    add(route, entry?.displayName, keyRef)
  }

  // Settings-map fallback: pi-ai profiles and compositions that predate the
  // configurable-provider directory.
  for (const descriptor of Array.isArray(descriptors) ? descriptors : []) {
    const providers = descriptor?.value?.providers
    if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) continue
    for (const [route, profile] of Object.entries(providers)) {
      const keyRef = typeof profile?.apiKeyEnv === 'string' ? profile.apiKeyEnv.trim() : ''
      if (!REF_NAME.test(keyRef) || options.exclude.includes(route) || found.has(route)) continue
      add(route, profile?.displayName, keyRef)
    }
  }
  return found
}

/**
 * The next usable slot after `current`, going round once. A resting key is
 * skipped, so a rate-limited key is used again after its rest.
 *
 * @param values - resolved key values per slot.
 * @param current - index of the key that just failed, or -1.
 * @param isResting - whether the slot at an index must be skipped for now.
 * @returns the slot index, or -1 when no other key can be used.
 */
export function nextUsableSlot(values, current, isResting = () => false) {
  const count = values.length
  for (let step = 1; step <= count; step += 1) {
    const index = (((current < 0 ? -1 : current) + step) % count + count) % count
    if (index === current) continue
    if (typeof values[index] === 'string' && values[index].length > 0 && !isResting(index)) return index
  }
  return -1
}

/**
 * Classify one terminal failure. Only key problems allow a switch; context
 * overflow, bad requests, and cancellation are properties of the request.
 *
 * @param failure - terminal reason from the model service.
 * @returns the reason for key problems, or `undefined` when another key cannot help.
 */
export function classifyFailure(failure) {
  if (failure === undefined || failure === null) return undefined
  if (failure.kind === 'aborted') return undefined
  const code = String(failure.failure?.code ?? '')
  const message = String(failure.failure?.message ?? '')
  if (code === 'AUTH' || /\b401\b|\b403\b|unauthori[sz]ed|forbidden|invalid.*(api.?)?key/i.test(message)) return REASON_LABELS.AUTH
  if (code === 'QUOTA' || /quota|insufficient.*(balance|credit)|payment required|\b402\b/i.test(message)) return REASON_LABELS.QUOTA
  if (code === 'RATE_LIMIT' || /\b429\b|rate.?limit|too many requests/i.test(message)) return REASON_LABELS.RATE_LIMIT
  if (code === 'TRANSPORT' || code === 'TIMEOUT' || code === 'STREAM_CLOSED') return REASON_LABELS.NETWORK
  return undefined
}

/** Whether a chunk already put model-visible content on the wire. */
export function isVisibleChunk(chunk) {
  return chunk?.type === 'text-delta'
    || chunk?.type === 'reasoning-delta'
    || chunk?.type === 'tool-call-start'
    || chunk?.type === 'tool-call-delta'
}

/**
 * Resolve which slot holds the active key, by value, without exposing keys.
 *
 * @param values - resolved key values per slot.
 * @param active - the active key value.
 * @returns the slot index, or -1 when the active key matches no slot.
 */
export function activeSlot(values, active) {
  if (typeof active !== 'string' || active.length === 0) return -1
  return values.findIndex((value) => value === active)
}

/** First configured slot, used when no active key is stored yet. */
export function firstSlot(values) {
  return values.findIndex((value) => typeof value === 'string' && value.length > 0)
}

/** Describe the key state for the settings panel without revealing values. */
export function describeSlots(slots, values, active, isResting = () => false) {
  const current = activeSlot(values, active)
  return slots.map((name, index) => {
    const configured = typeof values[index] === 'string' && values[index].length > 0
    return { slot: index + 1, name, configured, active: index === current, resting: configured && isResting(index) }
  })
}
