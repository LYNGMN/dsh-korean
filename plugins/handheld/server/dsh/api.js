// Gateway operations expressed as DSH calls. Outside server/dsh/ nobody sees
// DSH endpoint names, argument wrappers or event names.
import { randomUUID } from 'node:crypto'
import { normalizeEvent, StreamAssembler, summarizeSession } from './normalize.js'

const HISTORY_PAGE_MESSAGES = 20

function sessionAddress(sessionId) {
  return { kind: 'session', sessionId }
}

function itemsOf(records) {
  return (records ?? []).map((r) => r?.event).filter(Boolean).map(normalizeEvent).filter(Boolean)
}

function seqRange(records, through) {
  const seqs = (records ?? []).map((r) => r?.event?.seq).filter((n) => typeof n === 'number')
  if (seqs.length === 0) return null
  return { from: Math.min(...seqs), through: Math.max(through ?? -1, ...seqs) }
}

/** Approval or question waterfall -> Pending (server/protocol.js), or null for others. */
export function pendingFromWaterfall(frame, now = Date.now()) {
  const base = { id: frame.eventId, sessionId: frame.agentId, at: now }
  if (frame.event === 'approval/request') {
    const r = frame.request ?? {}
    const reason = r.displayReason?.ko ?? r.displayReason?.en ?? r.reason
    return { ...base, kind: 'approval', tool: r.toolName ?? '도구', reason: typeof reason === 'string' ? reason : undefined, callId: r.callId }
  }
  if (frame.event === 'user-questions/request') {
    const questions = (frame.request?.questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
      header: q.header,
      detail: q.detail,
      options: (q.options ?? []).map((o) => (typeof o === 'string' ? o : o?.label)).filter(Boolean),
      multiSelect: q.multiSelect === true,
    }))
    return { ...base, kind: 'question', questions }
  }
  return null
}

export class DshApi {
  /** @param {import('./client.js').DshClient} client */
  constructor(client) {
    this.client = client
  }

  /** 'connected' | 'connecting' | 'down' */
  get state() {
    return this.client.state
  }

  /**
   * Host notifications in gateway terms. `reconnected` means a new connection
   * generation: the Host re-sends every unanswered approval, so drop the old list.
   * @returns {() => void} unsubscribe
   */
  subscribe({ state, reconnected, pending, settled, sessionsChanged }) {
    const handlers = {
      state: (value, detail) => state?.(value, detail),
      generation: () => reconnected?.(),
      waterfall: (frame) => {
        const item = pendingFromWaterfall(frame)
        if (item) pending?.(item)
      },
      cancel: (eventId) => settled?.(eventId),
      emit: (event) => {
        if (typeof event === 'string' && event.startsWith('api-session/')) sessionsChanged?.()
      },
    }
    for (const [name, fn] of Object.entries(handlers)) this.client.on(name, fn)
    return () => {
      for (const [name, fn] of Object.entries(handlers)) this.client.off(name, fn)
    }
  }

  async listSessions() {
    const rows = []
    let cursor
    for (let page = 0; page < 10; page += 1) {
      const result = await this.client.rpc('session/list', { _request: cursor ? { cursor } : {} })
      rows.push(...(result.items ?? []))
      cursor = result.nextCursor ?? result.cursor
      if (!cursor || (result.items ?? []).length === 0) break
    }
    return rows.filter((r) => !r.blank).map(summarizeSession).filter((r) => !r.parentId)
  }

  async workspaces() {
    const stream = this.client.open('workspace/follow', {})
    try {
      const first = await stream.next()
      const items = first.value?.type === 'baseline' ? first.value.value?.items ?? [] : []
      return items.map((w) => ({ id: w.workspaceId, title: w.title, path: w.path, sessionIds: w.sessionIds ?? [] }))
    } finally {
      stream.cancel()
    }
  }

  /** Older items strictly before `beforeSeq` (or the newest page when omitted). */
  async history(sessionId, { beforeSeq, maxMessages = HISTORY_PAGE_MESSAGES } = {}) {
    const request = { address: sessionAddress(sessionId), maxMessages }
    if (typeof beforeSeq === 'number') request.beforeSeq = beforeSeq
    const page = await this.client.rpc('session/events', { request })
    return { items: itemsOf(page.records), range: seqRange(page.records), hasMore: page.hasMore === true, cursor: page.cursor }
  }

  /**
   * Follow one session. Handlers receive gateway shapes only.
   * @param {string} sessionId
   * @param {object} on
   * @param {(s: {items, range, hasMore}) => void} on.snapshot
   * @param {(item: object, seq: number) => void} on.item - item may be null for silent events (seq still advances)
   * @param {(u: {attemptId, text, reasoning, tool}) => void} on.stream
   * @param {(e: {attemptId, committedSeq}) => void} on.streamEnd
   * @returns {{ done: Promise<void>, stop: () => void }}
   */
  follow(sessionId, on) {
    const stream = this.client.open('session/follow', { request: { address: sessionAddress(sessionId), maxMessages: HISTORY_PAGE_MESSAGES, assistantStream: true } })
    const assembler = new StreamAssembler()
    const done = (async () => {
      for await (const frame of stream) {
        if (frame?.type === 'snapshot') {
          const range = seqRange(frame.records, frame.cursor) ?? { from: (frame.cursor ?? -1) + 1, through: frame.cursor ?? -1 }
          if (frame.hasMore !== true) range.from = 0
          on.snapshot({ items: itemsOf(frame.records), range, hasMore: frame.hasMore === true })
        } else if (frame?.type === 'event' && frame.event) {
          on.item(normalizeEvent(frame.event), frame.event.seq)
        } else if (frame?.type === 'assistant-stream') {
          const out = assembler.push(frame.frame)
          if (out?.type === 'update') on.stream(out)
          else if (out?.type === 'end') on.streamEnd(out)
        }
      }
    })()
    return { done, stop: () => stream.cancel() }
  }

  prompt(sessionId, text, { mode = 'queue', requestId = randomUUID(), timeZone } = {}) {
    const request = { requestId, sessionId, mode, content: [{ type: 'text', text }] }
    if (typeof timeZone === 'string' && timeZone) request.clientTimeZone = timeZone
    return this.client.rpc('session/prompt', { request })
  }

  cancel(sessionId) {
    return this.client.rpc('session/cancel', { request: { sessionId } })
  }

  createSession({ workspaceId, cwd }) {
    return this.client.rpc('session/create', { request: workspaceId ? { workspaceId } : { cwd } }).then((r) => r.sessionId)
  }

  /** @param {'allow' | 'reject'} decision */
  answerApproval(pendingId, decision) {
    return this.client.answer(pendingId, decision === 'allow' ? 'allowed-once' : 'rejected')
  }

  /** @param {Array<{id: string, selected: string[], custom?: string}>} answers */
  answerQuestion(pendingId, answers) {
    return this.client.answer(pendingId, { answers })
  }
}
