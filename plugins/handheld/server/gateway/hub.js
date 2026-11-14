// Everything phones share: Host connection status, the session list, the
// unanswered approvals and questions, one SessionFeed per watched session, and
// the moments worth a push notification. Speaks only gateway shapes.
import { EventEmitter } from 'node:events'
import { SessionFeed } from './feed.js'

const SESSION_REFRESH_MS = 300
const MAX_IDLE_FEEDS = 30
const MAX_WATCHES_PER_CONN = 4
const NOTIFIED_MEMORY = 200

export class HubError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export class Hub extends EventEmitter {
  /**
   * @param {object} options
   * @param {import('../dsh/api.js').DshApi} options.api
   * @param {number} [options.cacheBytes]
   * @param {number} [options.idleFollowMs]
   * @param {{info?: Function, warn?: Function}} [options.logger]
   */
  constructor({ api, cacheBytes, idleFollowMs, logger = console }) {
    super()
    this.api = api
    this.cacheBytes = cacheBytes
    this.idleFollowMs = idleFollowMs
    this.logger = logger
    this.conns = new Set()
    this.feeds = new Map()
    this.pending = new Map()
    this.rows = null
    this.notified = []
    this.refreshTimer = null
    this.refreshing = null
    this.unsubscribe = null
  }

  get upstream() {
    return this.api.state
  }

  start() {
    this.unsubscribe = this.api.subscribe({
      state: (state, detail) => this.#broadcast({ type: 'status', upstream: state, detail: detail ?? null }),
      reconnected: () => {
        this.pending.clear()
        this.#broadcastPending()
        this.#scheduleRefresh(0)
        for (const feed of this.feeds.values()) feed.restart()
      },
      pending: (item) => {
        this.pending.set(item.id, item)
        this.#broadcastPending()
        this.#notifyPending(item)
      },
      settled: (id) => {
        if (this.pending.delete(id)) this.#broadcastPending()
      },
      sessionsChanged: () => this.#scheduleRefresh(SESSION_REFRESH_MS),
    })
  }

  stop() {
    this.unsubscribe?.()
    clearTimeout(this.refreshTimer)
    for (const feed of this.feeds.values()) feed.stop()
    this.feeds.clear()
  }

  /**
   * A phone connected. `conn.send(frame)` delivers one live frame.
   * @returns {{watch(sessionId: string, since: number|null): Promise<void>, unwatch(sessionId: string): void, close(): void}}
   */
  connect(conn) {
    this.conns.add(conn)
    const watched = new Set()
    conn.send({ type: 'status', upstream: this.upstream, detail: null })
    if (this.rows) conn.send({ type: 'sessions', rows: this.rows })
    else this.#scheduleRefresh(0)
    conn.send({ type: 'pending', items: this.pendingList() })
    return {
      watch: (sessionId, since) => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) throw new HubError('watch/bad-session', 'sessionId required')
        if (!watched.has(sessionId) && watched.size >= MAX_WATCHES_PER_CONN) {
          const oldest = watched.values().next().value
          watched.delete(oldest)
          this.feeds.get(oldest)?.unwatch(conn)
        }
        watched.add(sessionId)
        return this.#feed(sessionId).watch(conn, typeof since === 'number' ? since : null)
      },
      unwatch: (sessionId) => {
        watched.delete(sessionId)
        this.feeds.get(sessionId)?.unwatch(conn)
      },
      close: () => {
        this.conns.delete(conn)
        for (const sessionId of watched) this.feeds.get(sessionId)?.unwatch(conn)
        watched.clear()
      },
    }
  }

  pendingList() {
    return [...this.pending.values()].sort((a, b) => a.at - b.at)
  }

  async sessions() {
    if (!this.rows) await this.#refresh()
    return this.rows ?? []
  }

  history(sessionId, beforeSeq) {
    return this.api.history(sessionId, { beforeSeq })
  }

  prompt(sessionId, text, mode) {
    if (typeof text !== 'string' || text.trim().length === 0) throw new HubError('prompt/empty', '보낼 글이 비어 있습니다')
    if (text.length > 100_000) throw new HubError('prompt/too-long', '글이 너무 깁니다')
    return this.api.prompt(sessionId, text, { mode: mode === 'steer' ? 'steer' : 'queue' })
  }

  cancel(sessionId) {
    return this.api.cancel(sessionId)
  }

  createSession({ workspaceId, cwd }) {
    return this.api.createSession({ workspaceId, cwd })
  }

  workspaces() {
    return this.api.workspaces()
  }

  /**
   * Answer one pending approval or question. Only called from a request a person made.
   * @param {string} id
   * @param {{decision?: 'allow'|'reject', answers?: Array<{id: string, selected: string[], custom?: string}>}} body
   */
  async answer(id, body) {
    const item = this.pending.get(id)
    if (!item) throw new HubError('answer/gone', '이미 답했거나 사라진 요청입니다', 409)
    if (item.kind === 'approval') {
      if (body.decision !== 'allow' && body.decision !== 'reject') throw new HubError('answer/bad-decision', 'decision must be allow or reject')
      await this.api.answerApproval(id, body.decision)
    } else {
      if (!Array.isArray(body.answers)) throw new HubError('answer/bad-answers', 'answers required')
      await this.api.answerQuestion(id, body.answers)
    }
    if (this.pending.delete(id)) this.#broadcastPending()
  }

  #feed(sessionId) {
    let feed = this.feeds.get(sessionId)
    if (!feed) {
      this.#evictIdleFeeds()
      feed = new SessionFeed({ sessionId, api: this.api, cacheBytes: this.cacheBytes, idleMs: this.idleFollowMs, logger: this.logger })
      this.feeds.set(sessionId, feed)
    }
    return feed
  }

  #evictIdleFeeds() {
    if (this.feeds.size < MAX_IDLE_FEEDS) return
    const idle = [...this.feeds.values()].filter((f) => !f.watched).sort((a, b) => a.lastUsed - b.lastUsed)
    for (const feed of idle.slice(0, this.feeds.size - MAX_IDLE_FEEDS + 1)) {
      feed.stop()
      this.feeds.delete(feed.sessionId)
    }
  }

  #broadcast(frame) {
    for (const conn of this.conns) conn.send(frame)
  }

  #broadcastPending() {
    this.#broadcast({ type: 'pending', items: this.pendingList() })
  }

  #scheduleRefresh(delay) {
    if (this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      void this.#refresh()
    }, delay)
    this.refreshTimer.unref?.()
  }

  async #refresh() {
    if (this.refreshing) return this.refreshing
    this.refreshing = (async () => {
      try {
        const rows = (await this.api.listSessions()).sort((a, b) => b.updatedAt - a.updatedAt)
        const before = this.rows
        this.rows = rows
        this.#broadcast({ type: 'sessions', rows })
        if (before) this.#notifyTurnEnds(before, rows)
      } catch (error) {
        this.logger.warn?.(`[dsh-handheld] session list refresh failed (${error.code ?? error.message})`)
      } finally {
        this.refreshing = null
      }
    })()
    return this.refreshing
  }

  #title(sessionId) {
    return this.rows?.find((r) => r.id === sessionId)?.title ?? '세션'
  }

  #remember(key) {
    if (this.notified.includes(key)) return false
    this.notified.push(key)
    if (this.notified.length > NOTIFIED_MEMORY) this.notified.shift()
    return true
  }

  #notifyPending(item) {
    // The Host re-sends unanswered requests after a reconnect; notify once per request.
    const key = `${item.kind}:${item.sessionId}:${item.callId ?? item.questions?.map((q) => q.id).join(',') ?? item.id}`
    if (!this.#remember(key)) return
    const title = this.#title(item.sessionId)
    if (item.kind === 'approval') {
      this.emit('notify', { kind: 'approval', sessionId: item.sessionId, pendingId: item.id, title: `승인 요청 · ${title}`, body: item.reason ? `${item.tool}: ${item.reason}` : `${item.tool} 실행 승인이 필요합니다` })
    } else {
      this.emit('notify', { kind: 'question', sessionId: item.sessionId, pendingId: item.id, title: `질문 · ${title}`, body: item.questions?.[0]?.question ?? '답이 필요합니다' })
    }
  }

  #notifyTurnEnds(before, after) {
    const wasRunning = new Set(before.filter((r) => r.running).map((r) => r.id))
    for (const row of after) {
      if (!wasRunning.has(row.id) || row.running) continue
      this.emit('notify', { kind: 'turnEnd', sessionId: row.id, title: `작업 끝 · ${row.title}`, body: '답변이 끝났습니다' })
    }
  }
}
