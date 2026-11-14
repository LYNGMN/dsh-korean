import { test } from 'node:test'
import assert from 'node:assert/strict'
import { childRows, childState, needsCatalog } from '../src/tree.js'

const list = (over = {}) => ({
  ids: ['p1'],
  byId: {
    p1: { id: 'p1', displayTitle: '부모', running: false },
    c1: { id: 'c1', title: '자막 정리', displayTitle: '자막 정리', running: true, origin: 'subagent' },
    c2: {
      id: 'c2', displayTitle: 'c2', running: false, origin: 'subagent',
      projectionValues: { subagentTiming: { settledMs: 10, lastTurnCompleted: true } },
    },
    c3: {
      id: 'c3', displayTitle: 'c3', running: false, origin: 'subagent',
      projectionValues: { subagentTiming: { settledMs: 10, lastTurnCompleted: false } },
    },
  },
  projectionsBySession: {
    p1: {
      state: 'ready',
      values: {
        subagentCatalog: [
          { id: 'c1', createdAt: 1, mode: 'continuable', label: '자막 정리 검토', name: 'reviewer' },
          { id: 'c2', createdAt: 2, mode: 'one-shot', label: '테스트 보강' },
          { id: 'c3', createdAt: 3, mode: 'one-shot' },
          { id: 'x1', createdAt: 4, mode: 'external', label: '바깥 실행' },
        ],
      },
    },
  },
  ...over,
})

test('카탈로그 순서대로 바깥 실행을 뺀 자식 줄을 만든다', () => {
  const rows = childRows(list(), 'p1')
  assert.deepEqual(rows.map(r => r.id), ['c1', 'c2', 'c3'])
})

test('제목은 만들 때 붙인 이름 → 세션 제목 → 기본 이름 순서다', () => {
  const rows = childRows(list(), 'p1')
  assert.equal(rows[0].title, '자막 정리 검토')
  assert.equal(rows[1].title, '테스트 보강')
  assert.equal(rows[2].title, '하위 에이전트')
})

test('상태: 실행 중, 끝남, 중단됨', () => {
  const rows = childRows(list(), 'p1')
  assert.deepEqual(rows.map(r => r.state), ['running', 'done', 'stopped'])
})

test('기록이 없으면 대기로 본다', () => {
  assert.equal(childState(undefined), 'idle')
  assert.equal(childState({ running: false }), 'idle')
})

test('여는 주소는 DSH 하위 에이전트 주소 모양이다', () => {
  const [row] = childRows(list(), 'p1')
  assert.deepEqual(row.address, { kind: 'subagent', parentSessionId: 'p1', childSessionId: 'c1', mode: 'continuable' })
})

test('카탈로그가 없거나 준비 전이면 빈 목록', () => {
  assert.deepEqual(childRows(list({ projectionsBySession: {} }), 'p1'), [])
  assert.deepEqual(childRows(list({ projectionsBySession: { p1: { state: 'loading', values: {} } } }), 'p1'), [])
  assert.deepEqual(childRows(undefined, 'p1'), [])
})

test('준비 전 투영은 이미 있는 값을 그대로 쓴다', () => {
  const l = list()
  l.projectionsBySession.p1 = { ...l.projectionsBySession.p1, state: 'loading' }
  assert.equal(childRows(l, 'p1').length, 3)
})

test('카탈로그 값이 없는 부모만 새로 읽는다', () => {
  assert.equal(needsCatalog(list(), 'p1'), false)
  assert.equal(needsCatalog(list({ projectionsBySession: {} }), 'p1'), true)
  assert.equal(needsCatalog(list({ projectionsBySession: { p1: { state: 'ready', values: { subagentTiming: {} } } } }), 'p1'), true)
  assert.equal(needsCatalog(list({ projectionsBySession: { p1: { state: 'ready', values: { subagentCatalog: [] } } } }), 'p1'), false)
  assert.equal(needsCatalog(list({ projectionsBySession: { p1: { state: 'loading', values: {} } } }), 'p1'), false)
  assert.equal(needsCatalog(list({ projectionsBySession: { p1: { state: 'error', values: {} } } }), 'p1'), false)
  assert.equal(needsCatalog(list({ projectionsBySession: { p1: { state: 'migration-required', values: {} } } }), 'p1'), false)
})
