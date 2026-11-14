import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchTodoEvent, foldTodoEvent, deriveHistory, todosAfter, itemElapsed, formatDuration, formatClock,
  HISTORY_ID, EMPTY_HISTORY,
} from '../src/todo-history.js'
import { createViewBuilder, historyNodeOf, EMPTY_SNAPSHOT } from '../src/view-builder.js'
import { planNodeOf, PLAN_KIND, VIEW_ID } from '../src/plan.js'

const at = turn => ({ kind: 'step', turn: { turn }, step: { step: 1 } })
const call = (seq, callId) => ({ event: { type: 'tool/call', seq, data: { name: 'todo_write', callId, arguments: '{}' } }, location: at(1) })
const write = (seq, time, turn, todos) => ({
  event: { type: 'todo/write', seq, time, data: { todos: todos.map(([content, status]) => ({ content, status })) } },
  location: at(turn),
})
const fold = matches => matches.reduce((state, match) => foldTodoEvent(state, match), undefined)

test('todo_write 호출과 todo/write 쓰기를 한 기록으로 묶는다', () => {
  assert.deepEqual(matchTodoEvent(call(1, 'a').event), { id: HISTORY_ID, role: 'start' })
  assert.deepEqual(matchTodoEvent(write(2, 0, 1, []).event), { id: HISTORY_ID, role: 'start' })
  assert.equal(matchTodoEvent({ type: 'tool/call', data: { name: 'bash', callId: 'x' } }), null)
  assert.equal(matchTodoEvent({ type: 'todo/write', data: {} }), null)
  const state = fold([call(1, 'c1'), write(2, 1000, 1, [['읽기', 'in_progress']]), write(2, 1000, 1, [['읽기', 'completed']])])
  assert.equal(state.writes.length, 1, '같은 seq는 한 번만')
  assert.equal(state.writes[0].callId, 'c1')
  assert.equal(state.writes[0].turn, 1)
  assert.equal(state.pendingCallId, undefined)
})

test('항목별 시작·완료 시각과 호출 id를 이어 붙인다', () => {
  const state = fold([
    call(1, 'c1'), write(2, 1000, 1, [['읽기', 'in_progress'], ['고치기', 'pending']]),
    call(3, 'c2'), write(4, 61000, 1, [['읽기', 'completed'], ['고치기', 'in_progress']]),
  ])
  const { current, past } = deriveHistory(state.writes)
  assert.equal(past.length, 0)
  assert.equal(current.done, 1)
  assert.equal(current.total, 2)
  const [read, fix] = current.items
  assert.equal(read.startedAt, 1000)
  assert.equal(read.completedAt, 61000)
  assert.equal(read.startCallId, 'c1')
  assert.equal(read.doneCallId, 'c2')
  assert.equal(formatDuration(itemElapsed(read, 0)), '1분')
  assert.equal(fix.startedAt, 61000)
  assert.equal(formatDuration(itemElapsed(fix, 61000 + 5000)), '5초')
})

test('턴이 바뀌면 묶음이 나뉘고, 지난 턴은 최신 먼저다', () => {
  const state = fold([
    write(1, 0, 1, [['가', 'completed']]),
    write(2, 10, 2, [['나', 'in_progress']]),
    write(3, 20, 3, [['다', 'pending']]),
  ])
  const history = deriveHistory(state.writes)
  assert.equal(history.current.turn, 3)
  assert.deepEqual(history.past.map(group => group.turn), [2, 1])
  assert.equal(deriveHistory([]), EMPTY_HISTORY)
})

test('완료였다가 다시 열린 항목은 완료 시각을 지운다', () => {
  const state = fold([write(1, 0, 1, [['가', 'completed']]), write(2, 5, 1, [['가', 'in_progress']])])
  const item = deriveHistory(state.writes).current.items[0]
  assert.equal(item.completedAt, undefined)
  assert.equal(item.status, 'in_progress')
})

test('계획 제출 뒤 쓰기의 최신 상태만 고른다', () => {
  const state = fold([write(1, 0, 1, [['옛일', 'completed']]), write(5, 0, 1, [['가', 'pending']]), write(6, 0, 1, [['가', 'completed'], ['나', 'pending']])])
  assert.deepEqual(todosAfter(state.writes, 3), [{ content: '가', status: 'completed' }, { content: '나', status: 'pending' }])
})

test('시간 표시', () => {
  assert.equal(formatDuration(59_000), '59초')
  assert.equal(formatDuration(125_000), '2분 5초')
  assert.equal(formatDuration(3_600_000 + 120_000), '1시간 2분')
  assert.equal(formatDuration(-1), '')
  assert.match(formatClock(Date.UTC(2026, 10, 14, 6, 4)), /\d+:04/)
  assert.equal(formatClock(0), '')
})

test('빌더는 계획을 최신순으로, 기록은 파생값까지 내고, 바뀐 것이 없으면 같은 스냅샷이다', () => {
  const builder = createViewBuilder()
  assert.equal(builder.empty, EMPTY_SNAPSHOT)
  const plan = (key, seq) => planNodeOf({ key, id: key, state: { callId: key, title: key, markdown: `# ${key}`, seq } })
  const writes = fold([write(1, 0, 1, [['가', 'completed'], ['나', 'pending']])]).writes
  const history = historyNodeOf({ key: 'h', id: HISTORY_ID, state: { writes } })
  const a = plan('a', 1)
  const first = builder.replace({ nodes: [a, plan('b', 7), history] })
  assert.deepEqual(first.plans.map(p => p.callId), ['b', 'a'])
  assert.equal(first.history.current.done, 1)
  assert.equal(builder.apply({ upserts: [a, history] }), first)
  assert.equal(a.kind, PLAN_KIND)
  assert.equal(history.target, VIEW_ID)
  assert.equal(historyNodeOf({ key: 'h', id: 'h', state: undefined }), null)
  assert.equal(builder.replace({ nodes: [] }), EMPTY_SNAPSHOT)
})
