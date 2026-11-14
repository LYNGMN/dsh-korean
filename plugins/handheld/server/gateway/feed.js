// One session as phones see it: a Host follow kept open while someone watches,
// a bounded cache of recent items, resume from a phone's last seq, and
// streaming text coalesced into small deltas.
import { MAX_FRAME_BYTES, STREAM_FLUSH_MS } from '../protocol.js'
import { SessionCache } from './session-cache.js'

const GAP_FILL_PAGES = 4
const GAP_FILL_MESSAGES = 50

/** Split items into frames of at most `budget` encoded bytes (one oversized item goes alone). */
export function chunkItems(items, budget = MAX_FRAME_BYTES - 256) {
  const chunks = []
  let current = []
  let size = 0
  for (const item of items) {
    const itemSize = Buffer.byteLength(JSON.stringify(item)) + 1
    if (current.length > 0 && size + itemSize > budget) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(item)
    size += itemSize
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current)
  return chunks
}

export class SessionFeed {
  /**
   * @param {object} options
   * @param {string} options.sessionId
   * @param {import('../dsh/api.js').DshApi} options.api
   * @param {number} [options.cacheBytes]
   * @param {number} [options.idleMs] - keep the Host follow this long after the last watcher leaves
   * @param {{info?: Function, warn?: Function}} [options.logger]
   */
  constructor({ sessionId, api, cacheBytes, idleMs = 60_000, logger = console }) {
    this.sessionId = sessionId
    this.api = api
    this.idleMs = idleMs
    this.logger = logger
    this.cache = new SessionCache({ maxBytes: cacheBytes })
    /** @type {Map<object, {cursor: number|null, syncing: boolean, stale: boolean, token: number, streamSent: {attemptId: string, text: number, reasoning: number} | null}>} */
    this.watchers = new Map()
    this.follow = null
    this.ready = null
    this.stream = null
    this.flushTimer = null
    this.idleTimer = null
    this.rejectReady = null
    this.lastUsed = Date.now()
  }

  get watched() {
    return this.watchers.size > 0
  }

  /** Start or resume delivery to one phone connection from its last seq. */
  watch(conn, since) {
    clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.lastUsed = Date.now()
    const previous = this.watchers.get(conn)
    const watcher = { cursor: since ?? null, syncing: true, stale: false, token: (previous?.token ?? 0) + 1, streamSent: null }
    this.watchers.set(conn, watcher)
    return this.#deliver(conn, watcher)
  }

  unwatch(conn) {
    if (!this.watchers.delete(conn)) return
    this.lastUsed = Date.now()
    if (this.watchers.size === 0 && this.follow) {
      this.idleTimer = setTimeout(() => this.#closeFollow(), this.idleMs)
      this.idleTimer.unref?.()
    }
  }

  /** The Host connection was replaced: reopen the follow and bring every watcher up to date. */
  restart() {
    this.#closeFollow()
    for (const watcher of this.watchers.values()) watcher.stale = true
    if (this.watchers.size > 0) this.#openFollow()
  }

  stop() {
    clearTimeout(this.idleTimer)
    this.#closeFollow()
    this.watchers.clear()
  }

  #openFollow() {
    let resolveReady
    let rejectReady
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    ready.catch(() => {})
    let handle
    try {
      handle = this.api.follow(this.sessionId, {
        snapshot: (s) => this.#onSnapshot(s, resolveReady),
        item: (item, seq) => this.#onItem(item, seq),
        stream: (update) => this.#onStream(update),
        streamEnd: (end) => this.#onStreamEnd(end),
      })
    } catch (error) {
      rejectReady(error)
      return ready
    }
    this.follow = handle
    this.ready = ready
    this.rejectReady = rejectReady
    handle.done.catch((error) => {
      this.logger.warn?.(`[dsh-handheld] follow ended for a session (${error.code ?? error.message})`)
    }).finally(() => {
      if (this.follow !== handle) return
      this.follow = null
      this.ready = null
      this.#dropStream()
      rejectReady(new Error('follow ended'))
    })
    return ready
  }

  #closeFollow() {
    clearTimeout(this.idleTimer)
    this.idleTimer = null
    const handle = this.follow
    this.follow = null
    this.ready = null
    this.rejectReady?.(new Error('follow closed'))
    this.rejectReady = null
    this.#dropStream()
    handle?.stop()
  }

  #onSnapshot({ items, range }, resolveReady) {
    this.cache.append(items, range)
    resolveReady()
    for (const [conn, watcher] of this.watchers) {
      if (watcher.stale && !watcher.syncing) {
        watcher.syncing = true
        watcher.token += 1
        void this.#deliver(conn, watcher)
      }
    }
  }

  #onItem(item, seq) {
    this.cache.append(item ? [item] : [], { from: seq, through: seq })
    if (!item) return
    for (const [conn, watcher] of this.watchers) {
      if (watcher.syncing || watcher.stale) continue
      watcher.cursor = item.seq
      conn.send({ type: 'items', sessionId: this.sessionId, items: [item], reset: false, more: false })
    }
  }

  async #deliver(conn, watcher) {
    const token = watcher.token
    const since = watcher.cursor
    try {
      const ready = this.ready ?? this.#openFollow()
      await ready
      if (since !== null && this.cache.since(since) === null) await this.#fillGap(since)
    } catch {
      // Offline or follow failed: the next snapshot brings this watcher up to date.
      if (this.watchers.get(conn) === watcher && watcher.token === token) {
        watcher.syncing = false
        watcher.stale = true
      }
      return
    }
    if (this.watchers.get(conn) !== watcher || watcher.token !== token) return
    // Synchronous from here: live items that arrived while we awaited are in the cache.
    let items = since === null ? null : this.cache.since(since)
    const reset = items === null
    if (reset) items = this.cache.items.slice()
    const chunks = chunkItems(items)
    chunks.forEach((chunk, index) => {
      conn.send({ type: 'items', sessionId: this.sessionId, items: chunk, reset: reset && index === 0, more: index < chunks.length - 1, hasOlder: (this.cache.coveredFrom ?? 0) > 0 })
    })
    watcher.cursor = items.length > 0 ? items[items.length - 1].seq : reset ? null : since
    watcher.syncing = false
    watcher.stale = false
    if (this.stream) this.#sendStream(conn, watcher)
  }

  /** Page older Host events into the cache until it reaches `since`, within a small budget. */
  async #fillGap(since) {
    for (let page = 0; page < GAP_FILL_PAGES; page += 1) {
      const before = this.cache.coveredFrom
      if (before === null || before <= 0) return
      const result = await this.api.history(this.sessionId, { beforeSeq: before, maxMessages: GAP_FILL_MESSAGES })
      if (!result.range) return
      this.cache.append(result.items, { from: result.hasMore ? result.range.from : 0, through: before - 1 })
      if (this.cache.since(since) !== null) return
      if (!result.hasMore || this.cache.coveredFrom >= before) return
    }
  }

  #onStream(update) {
    this.stream = update
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => this.#flush(), STREAM_FLUSH_MS)
    this.flushTimer.unref?.()
  }

  #flush() {
    clearTimeout(this.flushTimer)
    this.flushTimer = null
    if (!this.stream) return
    for (const [conn, watcher] of this.watchers) {
      if (!watcher.syncing && !watcher.stale) this.#sendStream(conn, watcher)
    }
  }

  #sendStream(conn, watcher) {
    const { attemptId, text, reasoning, tool } = this.stream
    const sent = watcher.streamSent?.attemptId === attemptId ? watcher.streamSent : { attemptId, text: 0, reasoning: 0 }
    if (sent.text === text.length && sent.reasoning === reasoning.length && watcher.streamSent === sent) return
    conn.send({
      type: 'stream',
      sessionId: this.sessionId,
      attemptId,
      textAt: sent.text,
      text: text.slice(sent.text),
      reasoningAt: sent.reasoning,
      reasoning: reasoning.slice(sent.reasoning),
      tool: tool ?? null,
    })
    watcher.streamSent = { attemptId, text: text.length, reasoning: reasoning.length }
  }

  #onStreamEnd({ attemptId }) {
    this.#flush()
    if (this.stream?.attemptId === attemptId) this.stream = null
    for (const [conn, watcher] of this.watchers) {
      if (watcher.streamSent?.attemptId !== attemptId) continue
      watcher.streamSent = null
      conn.send({ type: 'streamEnd', sessionId: this.sessionId, attemptId })
    }
  }

  #dropStream() {
    clearTimeout(this.flushTimer)
    this.flushTimer = null
    if (!this.stream) return
    const { attemptId } = this.stream
    this.stream = null
    for (const [conn, watcher] of this.watchers) {
      if (watcher.streamSent?.attemptId !== attemptId) continue
      watcher.streamSent = null
      conn.send({ type: 'streamEnd', sessionId: this.sessionId, attemptId })
    }
  }
}
