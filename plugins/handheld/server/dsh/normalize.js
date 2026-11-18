// DSH durable events and stream frames -> gateway items (server/protocol.js).
// The only place that knows DSH event names and payload shapes (format v4, DSH 0.2.x).

const OUTPUT_LIMIT = 4_000
const INPUT_LIMIT = 2_000
const DIFF_TEXT_LIMIT = 20_000
/** Ceiling of the on-demand "show all" read; a result longer than this is cut again and says so. */
export const FULL_OUTPUT_LIMIT = 1_000_000

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
 * The whole text of one tool result (up to FULL_OUTPUT_LIMIT), for the phone's "show all" button.
 * @param {{type?: string, data?: any}} event
 * @returns {{output: string, truncated: boolean} | null} null when the event is not a tool result
 */
export function fullOutputOf(event) {
  if (event?.type !== 'tool/result') return null
  const out = cap(textParts(event.data?.message?.content), FULL_OUTPUT_LIMIT)
  return { output: out.text, truncated: out.truncated }
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

const SUBAGENT_MODES = new Set(['one-shot', 'continuable', 'unknown'])

/** Opaque id the phone uses for a subagent conversation; only server/dsh/ reads its parts. */
export function subagentRef(parentId, childId, mode) {
  return ['sub', parentId, childId, SUBAGENT_MODES.has(mode) ? mode : 'unknown'].join('~')
}

/** @returns {{parentId: string, childId: string, mode: string} | null} */
export function parseSubagentRef(id) {
  const parts = typeof id === 'string' ? id.split('~') : []
  if (parts.length !== 4 || parts[0] !== 'sub' || !parts[1] || !parts[2] || !SUBAGENT_MODES.has(parts[3])) return null
  return { parentId: parts[1], childId: parts[2], mode: parts[3] }
}

function subagentState(row) {
  if (row?.running === true) return 'running'
  const completed = row?.projections?.values?.subagentTiming?.lastTurnCompleted
  if (completed === true) return 'done'
  if (completed === false) return 'stopped'
  return 'idle'
}

/**
 * Subagents of one session -> Subagent[] (server/protocol.js). The parent's
 * `subagentCatalog` projection names them; `session/list` rows that point at the
 * parent fill in titles and state, and stand in when the catalog is missing.
 * Externally run subagents have no conversation to open and are left out.
 */
export function subagentsOf(parentId, projections, listRows) {
  const values = projections?.values ?? projections?.projections?.values ?? {}
  const catalog = Array.isArray(values.subagentCatalog) ? values.subagentCatalog.filter((e) => e && typeof e.id === 'string' && e.mode !== 'external') : []
  const rows = new Map((listRows ?? []).filter((r) => r?.parentSessionId === parentId).map((r) => [r.sessionId, r]))
  const entries = catalog.length > 0 ? catalog : [...rows.values()].map((r) => ({ id: r.sessionId, mode: 'unknown', createdAt: r.updatedAt }))
  return entries.map((entry) => {
    const row = rows.get(entry.id)
    const title = entry.label || row?.projections?.values?.title || '하위 에이전트'
    return { id: subagentRef(parentId, entry.id, entry.mode), title, mode: SUBAGENT_MODES.has(entry.mode) ? entry.mode : 'unknown', state: subagentState(row), createdAt: entry.createdAt ?? 0 }
  }).sort((a, b) => a.createdAt - b.createdAt)
}

const TODO_STATUS = new Set(['pending', 'in_progress', 'completed'])

/** `session/projections` reply -> working folder and todo list (each may be null). */
export function workStateOf(projections) {
  const values = projections?.values ?? projections?.projections?.values ?? {}
  const cwd = typeof values.workingDirectory === 'string' && values.workingDirectory !== '' ? values.workingDirectory : null
  const raw = Array.isArray(values.todos) ? values.todos : Array.isArray(values.todos?.todos) ? values.todos.todos : null
  const todos = raw === null ? null : raw
    .filter((t) => t && typeof t.content === 'string' && TODO_STATUS.has(t.status))
    .map((t) => ({ content: t.content.slice(0, 300), status: t.status }))
  return { cwd, todos }
}

const SHELL_TOOLS = new Set(['bash', 'pwsh'])
const EDIT_TOOLS = new Set(['edit', 'write'])
// DSH's shell tool appends "[exit code: N]" to the result text when N is not 0.
const EXIT_TAG = /exit code: (\d+)\]\s*$/

function resultText(content) {
  if (typeof content === 'string') return content
  return Array.isArray(content) ? content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n') : ''
}

/** Whether a shell result succeeded: no error flag and no non-zero exit tag. Null when unknown. */
export function resultOkOf(data) {
  const message = data?.message ?? data
  if (message?.isError === true) return false
  const text = resultText(message?.content ?? data?.content ?? data?.output)
  const tag = EXIT_TAG.exec(text)
  if (tag) return tag[1] === '0'
  return message?.isError === false || text !== '' ? true : null
}

/**
 * Shell commands a session ran and the folder each ran in (DSH puts the resolved folder in the
 * tool result's meta.cwd), oldest first. terminal_open counts as moving into its cwd.
 * ok says whether the result succeeded (null for background runs or no result), at is when it came back.
 * @param {Array<{event?: object}>} records session/events records
 * @returns {Array<{command: string, cwd: string|null, ok: boolean|null, at: number|null}>}
 */
export function commandsOf(records) {
  const list = []
  const byCall = new Map()
  const background = new Set()
  for (const record of Array.isArray(records) ? records : []) {
    const event = record?.event
    const data = event?.data ?? {}
    if (event?.type === 'tool/call' || event?.type === 'tool/ptc-dispatch-start') {
      const args = parseArgs(data.arguments)
      const id = data.callId ?? data.subCallId
      if (SHELL_TOOLS.has(data.name) && typeof args.command === 'string') {
        const item = { command: args.command, cwd: null, ok: null, at: null }
        list.push(item)
        if (id) byCall.set(id, item)
        if (id && args.run_in_background === true) background.add(id)
      } else if (data.name === 'terminal_open' && typeof args.cwd === 'string') {
        list.push({ command: `cd ${JSON.stringify(args.cwd)}`, cwd: null, ok: null, at: null })
      }
    } else if (event?.type === 'tool/result' || event?.type === 'tool/ptc-dispatch') {
      const id = data.message?.toolCallId ?? data.subCallId
      const item = id ? byCall.get(id) : undefined
      if (item === undefined) continue
      if (typeof data.meta?.cwd === 'string') item.cwd = data.meta.cwd
      if (background.has(id)) continue
      item.ok = resultOkOf(data)
      item.at = typeof event.time === 'number' ? event.time : null
    }
  }
  return list
}

/** Files the agent changed (edit, write tools) and when, to tell whether tests ran after the last edit. */
export function editsOf(records) {
  const list = []
  for (const record of Array.isArray(records) ? records : []) {
    const event = record?.event
    const data = event?.data ?? {}
    if (event?.type !== 'tool/call' || !EDIT_TOOLS.has(data.name)) continue
    const args = parseArgs(data.arguments)
    const path = args.file_path ?? args.path
    if (typeof path === 'string') list.push({ path, at: typeof event.time === 'number' ? event.time : null })
  }
  return list
}
