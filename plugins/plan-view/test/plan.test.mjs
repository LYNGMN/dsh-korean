import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  submittedPlanOf, matchPlanEvent, planNodeOf, todoItems, todoSummary, UNTITLED_PLAN,
} from '../src/plan.js'

const call = (plan, extra = {}) => ({
  type: 'tool/call', seq: 10,
  data: { name: 'exit_plan_mode', callId: 'c1', arguments: JSON.stringify({ plan }) }, ...extra,
})

test('exit_plan_mode 호출에서 제목과 본문을 읽는다', () => {
  assert.deepEqual(submittedPlanOf(call('# 로그인 고치기\n\n- 1단계')), {
    callId: 'c1', title: '로그인 고치기', markdown: '# 로그인 고치기\n\n- 1단계', seq: 10,
  })
})

test('제목 줄이 없으면 기본 제목, 깨진 인자나 다른 도구는 무시한다', () => {
  assert.equal(submittedPlanOf(call('그냥 문단'))?.title, UNTITLED_PLAN)
  assert.equal(submittedPlanOf(call('   ')), undefined)
  assert.equal(submittedPlanOf({ type: 'tool/call', data: { name: 'exit_plan_mode', callId: 'c1', arguments: '{깨짐' } }), undefined)
  assert.equal(submittedPlanOf({ type: 'tool/call', data: { name: 'bash', callId: 'c1', arguments: '{}' } }), undefined)
  assert.equal(submittedPlanOf({ type: 'user/message', data: {} }), undefined)
  assert.equal(submittedPlanOf(null), undefined)
})

test('PTC 호출은 subCallId로 묶고, 완료 이벤트는 update다', () => {
  const start = { type: 'tool/ptc-dispatch-start', seq: 3, data: { name: 'exit_plan_mode', subCallId: 's1', arguments: { plan: '## 계획' } } }
  const done = { ...start, type: 'tool/ptc-dispatch', seq: 5 }
  assert.deepEqual(matchPlanEvent(start), { id: 's1', role: 'start' })
  assert.deepEqual(matchPlanEvent(done), { id: 's1', role: 'update' })
  assert.equal(matchPlanEvent(call('')), null)
})

test('할 일 목록은 빈 줄을 빼고 요약은 0인 칸을 뺀다', () => {
  const items = todoItems([
    { content: '구조 읽기', status: 'completed' },
    { content: '고치기', status: 'in_progress' },
    { content: '검사', status: 'pending' },
    { content: '검사 2', status: '이상한 값' },
    { content: ' ', status: 'pending' },
    'x',
  ])
  assert.equal(items.length, 4)
  assert.equal(items[3].status, 'pending')
  assert.equal(todoSummary(items), '완료 1 · 진행 중 1 · 대기 2')
  assert.equal(todoSummary(todoItems([{ content: 'a', status: 'completed' }])), '완료 1')
  assert.deepEqual(todoItems(null), [])
})
