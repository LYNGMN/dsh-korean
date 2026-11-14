// 할 일 기록: todo/write 이벤트를 모아 턴별 목록과 항목별 시작·완료 시각을 만든다.
// DSH 투영 todos는 다음 턴이 시작되면 비워지므로, 탭은 이 기록으로 목록을 유지한다.
import { todoItems } from './plan.js'

export const HISTORY_KIND = 'dsh-plan-view.todos'
export const HISTORY_ID = 'history'
export const EMPTY_FOLD = Object.freeze({ pendingCallId: undefined, writes: Object.freeze([]) })
export const EMPTY_HISTORY = Object.freeze({ current: null, past: Object.freeze([]) })

// todo_write 도구 호출의 호출 id. 이 id로 실행 흐름에서 그 호출을 연다.
export function todoCallIdOf(event) {
  if (event === null || typeof event !== 'object') return undefined
  const data = event.data
  if (data === null || typeof data !== 'object' || data.name !== 'todo_write') return undefined
  const id = event.type === 'tool/call' ? data.callId
    : event.type === 'tool/ptc-dispatch-start' ? data.subCallId : undefined
  return typeof id === 'string' && id !== '' ? id : undefined
}

export function matchTodoEvent(event) {
  if (event?.type === 'todo/write' && Array.isArray(event.data?.todos)) return { id: HISTORY_ID, role: 'start' }
  if (todoCallIdOf(event) !== undefined) return { id: HISTORY_ID, role: 'start' }
  return null
}

function turnOf(location) {
  const turn = location?.turn?.turn
  return typeof turn === 'number' ? turn : null
}

// 이벤트 하나를 접는다. 같은 쓰기가 다시 들어오면(seq가 같거나 작음) 무시한다.
export function foldTodoEvent(state, match) {
  const prev = state ?? EMPTY_FOLD
  const event = match.event
  const callId = todoCallIdOf(event)
  if (callId !== undefined) return prev.pendingCallId === callId ? prev : { ...prev, pendingCallId: callId }
  if (event?.type !== 'todo/write') return prev
  const seq = typeof event.seq === 'number' ? event.seq : 0
  const last = prev.writes[prev.writes.length - 1]
  if (last !== undefined && seq <= last.seq) return prev
  const write = {
    seq,
    time: typeof event.time === 'number' ? event.time : 0,
    turn: turnOf(match.location),
    callId: prev.pendingCallId,
    todos: todoItems(event.data.todos),
  }
  return { pendingCallId: undefined, writes: [...prev.writes, write] }
}

function summarize(group) {
  const items = group.items
  const done = items.filter(item => item.status === 'completed').length
  return { ...group, done, total: items.length }
}

// 쓰기 목록 → { current: 가장 최근 턴 묶음, past: 이전 턴 묶음(최신 먼저) }.
// 항목 시각은 문구가 같은 항목끼리 턴을 넘어 이어진다.
export function deriveHistory(writes) {
  if (!Array.isArray(writes) || writes.length === 0) return EMPTY_HISTORY
  const timing = new Map()
  const groups = []
  let group
  for (const write of writes) {
    if (group === undefined || group.turn !== write.turn) {
      group = { turn: write.turn, startedAt: write.time, endedAt: write.time, lastSeq: write.seq, items: [] }
      groups.push(group)
    }
    group.endedAt = write.time
    group.lastSeq = write.seq
    group.items = write.todos.map(todo => {
      const prev = timing.get(todo.content) ?? { content: todo.content, firstSeenAt: write.time }
      const next = { ...prev, status: todo.status }
      if (todo.status === 'in_progress' && next.startedAt === undefined) {
        next.startedAt = write.time
        next.startCallId = write.callId
      }
      if (todo.status === 'completed' && next.completedAt === undefined) {
        next.completedAt = write.time
        next.doneCallId = write.callId
      }
      if (todo.status !== 'completed' && next.completedAt !== undefined) {
        next.completedAt = undefined
        next.doneCallId = undefined
      }
      timing.set(todo.content, next)
      return next
    })
  }
  const summarized = groups.map(summarize)
  return { current: summarized[summarized.length - 1], past: summarized.slice(0, -1).reverse() }
}

// 지금 보여 줄 목록. 투영이 null이면 새 턴이 시작돼 DSH가 목록을 비운 것이라 직전 목록을 이어 보여 준다.
// 기록이 아직 안 불러와졌으면 투영 목록을 시각 없이 쓴다.
export function currentTodos(history, projection) {
  if (history?.current) return { ...history.current, carried: projection === null }
  const items = todoItems(projection)
  if (items.length === 0) return null
  const done = items.filter(item => item.status === 'completed').length
  return { turn: null, items, done, total: items.length, carried: false }
}

// 계획이 제출된 뒤(seq가 더 큰) 쓰기에 나온 항목들의 최신 상태.
export function todosAfter(writes, seq) {
  const latest = new Map()
  for (const write of writes ?? []) {
    if (write.seq <= seq) continue
    for (const todo of write.todos) latest.set(todo.content, todo.status)
  }
  return [...latest].map(([content, status]) => ({ content, status }))
}

// 항목이 걸린 시간(밀리초). 완료 전이면 지금까지.
export function itemElapsed(item, now) {
  if (item.startedAt === undefined) return undefined
  const end = item.completedAt ?? now
  return end >= item.startedAt ? end - item.startedAt : undefined
}

export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return ''
  const total = Math.floor(ms / 1000)
  if (total < 60) return `${total}초`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) {
    const seconds = total % 60
    return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`
}

export function formatClock(time) {
  if (typeof time !== 'number' || time <= 0) return ''
  return new Date(time).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
}
