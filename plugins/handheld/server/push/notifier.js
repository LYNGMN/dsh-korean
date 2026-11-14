// Turns hub notifications into Web Push messages for every stored subscription.
// Decides what is sent; server/push/web-push.js decides how.
import { createHash } from 'node:crypto'
import { BASE_PATH } from '../protocol.js'
import { sendPush } from './web-push.js'

function topicFor(tag) {
  return createHash('sha256').update(tag).digest('base64url').slice(0, 32)
}

/**
 * @param {object} options
 * @param {import('../store.js').Store} options.store
 * @param {string} options.subject - VAPID contact, `mailto:` or the public https origin
 * @param {typeof fetch} [options.fetch]
 * @param {{warn?: Function}} [options.logger]
 */
export function createNotifier({ store, subject, fetch: fetchImpl = fetch, logger = console }) {
  async function deliver(message, { urgency }) {
    const keys = store.vapidKeys()
    const results = await Promise.allSettled(store.subscriptions().map(async (subscription) => {
      const result = await sendPush(subscription, message, { keys, subject, urgency, topic: topicFor(message.tag), fetch: fetchImpl })
      if (result.gone) store.removeSubscription(subscription.endpoint)
      return result
    }))
    const failed = results.filter((r) => r.status === 'rejected' || (!r.value.ok && !r.value.gone)).length
    if (failed > 0) logger.warn?.(`[dsh-handheld] ${String(failed)} push deliveries failed`)
    return results
  }

  return {
    /** @param {{kind: 'approval'|'question'|'turnEnd', sessionId: string, pendingId?: string, title: string, body: string}} note */
    notify(note) {
      if (note.kind === 'turnEnd' && !store.settings().notifyTurnEnd) return Promise.resolve([])
      const tag = note.pendingId ? `${note.kind}:${note.pendingId}` : `${note.kind}:${note.sessionId}`
      const message = {
        kind: note.kind,
        title: note.title.slice(0, 80),
        body: note.body.slice(0, 180),
        tag,
        sessionId: note.sessionId,
        pendingId: note.pendingId ?? null,
        url: `${BASE_PATH}/#/s/${encodeURIComponent(note.sessionId)}`,
      }
      return deliver(message, { urgency: note.kind === 'turnEnd' ? 'normal' : 'high' })
    },
    test() {
      return deliver({ kind: 'test', title: 'dsh-handheld', body: '알림이 잘 옵니다', tag: 'test', sessionId: null, pendingId: null, url: `${BASE_PATH}/` }, { urgency: 'normal' })
    },
  }
}
