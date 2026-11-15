// Turns hub notifications into Web Push messages for every stored subscription.
// Decides what is sent; server/push/web-push.js decides how.
import { createHash } from 'node:crypto'
import { BASE_PATH } from '../protocol.js'
import { sendPush } from './web-push.js'
import { actionTexts, noteText, testText } from './text.js'

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
    /** @param {{kind: 'approval'|'question'|'turnEnd', sessionId: string, pendingId?: string, session?: string}} note - plus the kind's own fields (server/push/text.js) */
    notify(note) {
      if (note.kind === 'turnEnd' && !store.settings().notifyTurnEnd) return Promise.resolve([])
      const { lang } = store.settings()
      const { title, body } = noteText(note, lang)
      const tag = note.pendingId ? `${note.kind}:${note.pendingId}` : `${note.kind}:${note.sessionId}`
      const message = {
        kind: note.kind,
        title: title.slice(0, 80),
        body: body.slice(0, 180),
        lang,
        ...(note.kind === 'approval' ? { texts: actionTexts(lang) } : {}),
        tag,
        sessionId: note.sessionId,
        pendingId: note.pendingId ?? null,
        url: `${BASE_PATH}/#/s/${encodeURIComponent(note.sessionId)}`,
      }
      return deliver(message, { urgency: note.kind === 'turnEnd' ? 'normal' : 'high' })
    },
    test() {
      return deliver({ kind: 'test', title: 'dsh-handheld', body: testText(store.settings().lang), lang: store.settings().lang, tag: 'test', sessionId: null, pendingId: null, url: `${BASE_PATH}/` }, { urgency: 'normal' })
    },
  }
}
