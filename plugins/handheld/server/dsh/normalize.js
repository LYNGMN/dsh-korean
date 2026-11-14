// DSH durable events and stream frames -> gateway items (server/protocol.js).
// The only place that knows DSH event names and payload shapes (format v4, DSH 0.2.x).

const OUTPUT_LIMIT = 4_000
const INPUT_LIMIT = 2_000
const DIFF_TEXT_LIMIT = 20_000

/** Host bookkeeping a phone never shows. */
const SILENT = new Set([
  'step/start', 'step/end', 'request/header', 'request/context', 'system/message',
  'session/title-llm-request', 'session/end-seed', 'agent/inbox/spliced', 'job/registered', 'job/settled',
  'permission/preset', 'sandbox/mode', 'approval/policy', 'agent-preset/selected', 'developer/message',
  'assistant/attempt', 'llm/retry', 'llm/retry-started', 'team/mode', 'session-log-deepseek/delivery-accepted',
])

function cap(text, limit) {
  if (typeof text !== 'string') return { text: '', truncated: false }
  return text.length > limit ? { text: text.slice(0, limit), truncated: true } : { text, truncated: false }
}

function textParts(content, type = 'text') {
  return (Array.isArray(content) ? content : []).filter((p) => p?.type === type && typeof p.text === 'string').map((p) => p.text).join('')
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

function basename(p) {
  return typeof p === 'string' ? p.split('/').filter(Boolean).at(-1) ?? p : ''
}

function toolTitle(name, args) {
  if (typeof args.description === 'string' && args.description) return args.description
  const target = args.file_path ?? args.path ?? args.url ?? args.query ?? args.pattern
  if (typeof target === 'string') return `${name} ${basename(target) || target}`
  if (typeof args.command === 'string') return args.command.split('\n')[0].slice(0, 80)
  return name
}

function toolInput(name, args) {
  if (typeof args.command === 'string') return args.command
  if (typeof args.file_path === 'string' && name !== 'write') return args.file_path
  return undefined
}

function capDiff(d) {
  return {
    path: d.path,
    oldText: d.oldText === null || d.oldText === undefined ? null : d.oldText.slice(0, DIFF_TEXT_LIMIT),
    newText: typeof d.newText === 'string' ? d.newText.slice(0, DIFF_TEXT_LIMIT) : '',
  }
}

/**
 * @param {{type: string, seq: number, time: number, data: any}} event
 * @returns {object | null}
 */
export function normalizeEvent(event) {
  const { type, seq, time } = event
  const data = event.data ?? {}
  if (SILENT.has(type)) return null
  const base = { seq, time }

  switch (type) {
    case 'user/message': {
      if (data.source?.kind !== 'user') return null
      return { ...base, kind: 'user', text: textParts(data.content), images: (data.content ?? []).filter((p) => p?.type === 'image').length }
    }
    case 'assistant/message': {
      const content = data.message?.content
      const item = { ...base, kind: 'assistant', turn: data.turn, text: textParts(content) }
      const reasoning = textParts(content, 'reasoning')
      if (reasoning) item.reasoning = reasoning
      if (!item.text && !reasoning) return null
      return item
    }
    case 'tool/call': {
      const args = parseArgs(data.arguments)
      const item = { ...base, kind: 'tool', callId: data.callId, name: data.name, title: toolTitle(data.name, args) }
      const input = toolInput(data.name, args)
      if (input) item.input = cap(input, INPUT_LIMIT).text
      if (data.name === 'write' && typeof args.file_path === 'string' && typeof args.content === 'string') {
        item.diffs = [capDiff({ path: args.file_path, oldText: null, newText: args.content })]
      }
      return item
    }
    case 'tool/result': {
      const message = data.message ?? {}
      const out = cap(textParts(message.content), OUTPUT_LIMIT)
      const item = { ...base, kind: 'toolResult', callId: message.toolCallId, isError: message.isError === true, output: out.text }
      if (out.truncated) item.truncated = true
      const diffs = data.meta?.diffs
      if (Array.isArray(diffs) && diffs.length > 0) item.diffs = diffs.map(capDiff)
      return item
    }
    case 'turn/start':
      return { ...base, kind: 'turn', phase: 'start', turn: data.turn }
    case 'turn/end':
      return { ...base, kind: 'turn', phase: 'end', turn: data.turn, outcome: data.reason?.kind ?? 'unknown' }
    case 'approval/asked':
      return { ...base, kind: 'approval', phase: 'asked', id: data.id, tool: data.toolName, reason: data.reason }
    case 'approval/decided':
      return { ...base, kind: 'approval', phase: 'decided', id: data.id, decision: data.outcome }
    case 'workspace/changes':
      return { ...base, kind: 'changes', turn: data.turn }
    case 'session/title':
      return typeof data.title === 'string' ? { ...base, kind: 'title', title: data.title } : null
    default:
      return { ...base, kind: 'other', type }
  }
}

/**
 * Builds the provisional reply text from `assistant-stream` frames. Text is
 * provisional: the committed `assistant/message` item replaces it.
 */
export class StreamAssembler {
  constructor() {
    this.active = new Map()
  }

  /**
   * @returns {{type: 'update', attemptId, text, reasoning, tool?} | {type: 'end', attemptId, committedSeq: number|null} | null}
   */
  push(frame) {
    if (!frame?.attemptId) return null
    if (frame.type === 'start') {
      this.active.set(frame.attemptId, { text: '', reasoning: '', tool: undefined })
      return null
    }
    if (frame.type === 'end') {
      this.active.delete(frame.attemptId)
      const committedSeq = frame.outcome?.kind === 'committed' && typeof frame.outcome.seq === 'number' ? frame.outcome.seq : null
      return { type: 'end', attemptId: frame.attemptId, committedSeq }
    }
    if (frame.type !== 'chunk') return null
    let state = this.active.get(frame.attemptId)
    if (!state) {
      state = { text: '', reasoning: '', tool: undefined }
      this.active.set(frame.attemptId, state)
    }
    const chunk = frame.chunk ?? {}
    if (chunk.type === 'text-delta') state.text += chunk.text ?? ''
    else if (chunk.type === 'reasoning-delta') state.reasoning += chunk.text ?? ''
    else if (chunk.type === 'tool-call-delta' && chunk.name) state.tool = chunk.name
    else return null
    return { type: 'update', attemptId: frame.attemptId, text: state.text, reasoning: state.reasoning, tool: state.tool }
  }

  reset() {
    this.active.clear()
  }
}

/** One `session/list` row -> SessionRow. */
export function summarizeSession(row) {
  const values = row.projections?.values ?? {}
  return {
    id: row.sessionId,
    title: typeof values.title === 'string' && values.title ? values.title : basename(row.cwd) || '새 세션',
    cwd: row.cwd ?? null,
    running: row.running === true,
    updatedAt: row.updatedAt ?? 0,
    parentId: row.parentSessionId ?? null,
  }
}
