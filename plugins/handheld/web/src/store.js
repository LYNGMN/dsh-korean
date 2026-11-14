// App state in one object. Components read it with useStore() and rerender on
// any change; long lists keep cost down by memoizing per item (ItemView).
import { useEffect, useState } from 'preact/hooks'

const listeners = new Set()

export const state = {
  me: null,
  authExpired: false,
  socket: 'connecting',
  upstream: 'connecting',
  sessions: [],
  sessionsLoaded: false,
  pending: [],
  /** @type {Record<string, Feed>} */
  feeds: {},
  toasts: [],
}

/**
 * @typedef {object} Feed
 * @property {Array<object>} items     ascending by seq
 * @property {number | null} lastSeq   resume cursor
 * @property {boolean} synced          first items frame arrived
 * @property {boolean} hasMore         older history may exist
 * @property {boolean} loadingOlder
 * @property {{attemptId: string, text: string, reasoning: string, tool: string|null, ended: boolean} | null} stream
 */

export function feedOf(sessionId) {
  if (!state.feeds[sessionId]) {
    state.feeds[sessionId] = { items: [], lastSeq: null, synced: false, hasMore: true, loadingOlder: false, stream: null }
  }
  return state.feeds[sessionId]
}

let scheduled = false
let version = 0
export function update(mutate) {
  mutate(state)
  version += 1
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    for (const listener of [...listeners]) listener()
  })
}

export function useStore(select) {
  const [, force] = useState(0)
  const seen = version
  useEffect(() => {
    const listener = () => force((n) => n + 1)
    listeners.add(listener)
    // Effects run after paint; catch up on changes made before we subscribed.
    if (version !== seen) listener()
    return () => listeners.delete(listener)
  }, [])
  return select(state)
}

/** Merge items into a feed, dropping duplicates by seq. */
export function mergeItems(feed, items, { reset = false } = {}) {
  const bySeq = new Map((reset ? [] : feed.items).map((i) => [i.seq, i]))
  for (const item of items) bySeq.set(item.seq, item)
  feed.items = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
  const last = feed.items.at(-1)
  if (last && (feed.lastSeq === null || last.seq > feed.lastSeq || reset)) feed.lastSeq = last.seq
  if (reset && !last) feed.lastSeq = null
}

let toastId = 0
export function toast(message, { tone = 'info', ms = 4000 } = {}) {
  const id = ++toastId
  update((s) => { s.toasts = [...s.toasts, { id, message, tone }] })
  setTimeout(() => update((s) => { s.toasts = s.toasts.filter((t) => t.id !== id) }), ms)
}
