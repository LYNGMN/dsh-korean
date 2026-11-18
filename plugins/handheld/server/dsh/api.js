// Gateway operations expressed as DSH calls. Outside server/dsh/ nobody sees
// DSH endpoint names, argument wrappers or event names.
import { randomUUID } from 'node:crypto'
import { commandsOf, editsOf, fullOutputOf, normalizeEvent, parseSubagentRef, StreamAssembler, subagentsOf, summarizeSession, workStateOf } from './normalize.js'

const HISTORY_PAGE_MESSAGES = 20
const WORK_HISTORY_MESSAGES = 30

function sessionAddress(sessionId) {
  const sub = parseSubagentRef(sessionId)
  if (sub) return { kind: 'subagent', parentSessionId: sub.parentId, childSessionId: sub.childId, mode: sub.mode }
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

const optionLabels = (q) => (q.options ?? []).map((o) => (typeof o === 'string' ? o : o?.label)).filter(Boolean)

/** Per-language strings of a DSH display text, or undefined when it is not one. */
function textsByLang(value) {
  if (!value || typeof value !== 'object') return undefined
  const entries = Object.entries(value).filter(([, text]) => typeof text === 'string' && text)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/**
 * DSH asks for a plan review as a question with two options whose labels are also the
 * answer values (`intent.kind: 'plan-review'`); the plan itself is the question's detail.
 */
function reviewOf(q) {
  if (q.intent?.kind !== 'plan-review' || typeof q.intent.approve !== 'string') return {}
  const revise = optionLabels(q).find((label) => label !== q.intent.approve)
  return revise ? { review: { approve: q.intent.approve, revise } } : {}
}

/** Approval or question waterfall -> Pending (server/protocol.js), or null for others. */
export function pendingFromWaterfall(frame, now = Date.now()) {
  const base = { id: frame.eventId, sessionId: frame.agentId, at: now }
  if (frame.event === 'approval/request') {
    const r = frame.request ?? {}
    const reason = r.displayReason?.ko ?? r.displayReason?.en ?? r.reason
    const reasons = textsByLang(r.displayReason)
    return { ...base, kind: 'approval', tool: r.toolName, reason: typeof reason === 'string' ? reason : undefined, ...(reasons ? { reasons } : {}), callId: r.callId }
  }
  if (frame.event === 'user-questions/request') {
    const questions = (frame.request?.questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
      header: q.header,
      detail: q.detail,
      options: optionLabels(q),
      multiSelect: q.multiSelect === true,
      ...reviewOf(q),
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

  /** Conversations a session started for its subagents, oldest first. */
  async subagents(sessionId) {
    if (parseSubagentRef(sessionId)) return []
    const [projections, rows] = await Promise.all([
      // Older Hosts may not answer this; the list rows alone still name the children.
      this.client.rpc('session/projections', { request: { sessionId } }).catch(() => null),
      this.#listRows(),
    ])
    return subagentsOf(sessionId, projections, rows)
  }

  /**
   * Working folder and todo list of a session, for the work-stage strip. A subagent
   * conversation reads its parent's folder and todos.
   * Also the shell commands of its recent history, so a folder holding many repositories can follow
   * the one the session worked in.
   * And the files the agent edited, so a test run before the last edit does not count as verified.
   * @returns {Promise<{sessionId: string, cwd: string|null, todos: Array<{content: string, status: string}>|null, commands: Array<{command: string, cwd: string|null, ok: boolean|null, at: number|null}>, edits: Array<{path: string, at: number|null}>}>}
   */
  async workState(sessionId) {
    const own = parseSubagentRef(sessionId)?.parentId ?? sessionId
    const [projections, page] = await Promise.all([
      this.client.rpc('session/projections', { request: { sessionId: own } }).catch(() => null),
      this.client.rpc('session/events', { request: { address: sessionAddress(own), maxMessages: WORK_HISTORY_MESSAGES } }).catch(() => null),
    ])
    return { sessionId: own, ...workStateOf(projections), commands: commandsOf(page?.records), edits: editsOf(page?.records) }
  }

  async listSessions() {
    return (await this.#listRows()).map(summarizeSession).filter((r) => !r.parentId)
  }

  async #listRows() {
    const rows = []
    let cursor
    for (let page = 0; page < 10; page += 1) {
      const result = await this.client.rpc('session/list', { _request: cursor ? { cursor } : {} })
      rows.push(...(result.items ?? []))
      cursor = result.nextCursor ?? result.cursor
      if (!cursor || (result.items ?? []).length === 0) break
    }
    return rows.filter((r) => !r.blank)
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
   * The whole text of the tool result at `seq` (the list view cuts results short).
   * Reads the few events up to and including `seq`; widens the window once when it is not in the first page.
   * @returns {Promise<{output: string, truncated: boolean} | null>} null when `seq` is not a tool result
   */
  async toolOutput(sessionId, seq) {
    for (const maxMessages of [1, 4]) {
      const page = await this.client.rpc('session/events', { request: { address: sessionAddress(sessionId), beforeSeq: seq + 1, maxMessages } })
      const record = (page.records ?? []).find((r) => r?.event?.seq === seq)
      if (record) return fullOutputOf(record.event)
      if (page.hasMore !== true) break
    }
    return null
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

  /** Slash commands this session accepts -> Command[] (server/protocol.js). */
  async commands(sessionId) {
    const list = await this.client.rpc('commands/list', { agentId: sessionId })
    return (Array.isArray(list) ? list : [])
      .filter((c) => typeof c?.name === 'string' && c.name)
      .map((c) => ({
        name: c.name,
        description: typeof c.description === 'string' ? c.description : '',
        ...(typeof c.input?.hint === 'string' ? { hint: c.input.hint } : {}),
      }))
  }

  /**
   * Runs one complete command line ("/plan fix the login") without sending it to the model.
   * `ran: false` means DSH knows no such command; the caller may send the line as a message.
   * @returns {Promise<{ran: boolean, ok?: boolean, text?: string}>}
   */
  async runCommand(sessionId, line) {
    const execution = await this.client.rpc('commands/execute', { agentId: sessionId, line, submittedAttachments: [] })
    if (!execution?.result) return { ran: false }
    const { kind, text } = execution.result
    return { ran: true, ok: kind !== 'error', ...(typeof text === 'string' && text ? { text } : {}) }
  }

  /** @param {Array<{id: string, selected: string[], custom?: string}>} answers */
  answerQuestion(pendingId, answers) {
    return this.client.answer(pendingId, { answers })
  }
}
