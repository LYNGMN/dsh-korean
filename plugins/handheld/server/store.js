// dsh-handheld's own files under $DSH_HOME/dsh-handheld/, all owner-only:
//   settings.json       phone-adjustable preferences
//   vapid.json          Web Push signing key (private; never sent anywhere)
//   subscriptions.json  push subscriptions of signed-in phones
import path from 'node:path'
import { readJson, writePrivate } from './home.js'
import { generateVapidKeys } from './push/web-push.js'

const DEFAULT_SETTINGS = Object.freeze({ notifyTurnEnd: true })
const MAX_SUBSCRIPTIONS = 20
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/]

/** Only real browser push services, so a phone cannot make the gateway POST anywhere else. */
export function isPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname))
  } catch {
    return false
  }
}

export class Store {
  constructor(dir) {
    this.dir = dir
  }

  #file(name) {
    return path.join(this.dir, name)
  }

  settings() {
    return { ...DEFAULT_SETTINGS, ...readJson(this.#file('settings.json'), {}) }
  }

  updateSettings(patch) {
    const next = this.settings()
    if (typeof patch.notifyTurnEnd === 'boolean') next.notifyTurnEnd = patch.notifyTurnEnd
    writePrivate(this.#file('settings.json'), JSON.stringify(next, null, 1))
    return next
  }

  /** Signing keys, created on first use. */
  vapidKeys() {
    const existing = readJson(this.#file('vapid.json'), null)
    if (existing?.publicKey && existing?.jwk?.d) return existing
    const keys = generateVapidKeys()
    writePrivate(this.#file('vapid.json'), JSON.stringify(keys))
    return keys
  }

  subscriptions() {
    const list = readJson(this.#file('subscriptions.json'), [])
    return Array.isArray(list) ? list : []
  }

  /** @param {{endpoint: string, keys: {p256dh: string, auth: string}}} subscription */
  addSubscription(subscription, { email, label }) {
    if (!isPushEndpoint(subscription?.endpoint)) throw Object.assign(new Error('not a browser push endpoint'), { code: 'push/bad-endpoint' })
    if (typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') {
      throw Object.assign(new Error('subscription keys missing'), { code: 'push/bad-keys' })
    }
    const entry = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      email: email ?? null,
      label: typeof label === 'string' ? label.slice(0, 60) : null,
      addedAt: Date.now(),
    }
    const list = this.subscriptions().filter((s) => s.endpoint !== entry.endpoint)
    list.push(entry)
    this.#saveSubscriptions(list.slice(-MAX_SUBSCRIPTIONS))
    return entry
  }

  removeSubscription(endpoint) {
    const list = this.subscriptions()
    const next = list.filter((s) => s.endpoint !== endpoint)
    if (next.length !== list.length) this.#saveSubscriptions(next)
    return next.length !== list.length
  }

  #saveSubscriptions(list) {
    writePrivate(this.#file('subscriptions.json'), JSON.stringify(list, null, 1))
  }
}
