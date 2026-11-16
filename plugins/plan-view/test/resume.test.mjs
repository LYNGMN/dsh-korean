import { test } from 'node:test'
import assert from 'node:assert/strict'
import { remainingTodos, resumeStateOf, resumePromptOf, sendResume, RESUME_LIST_MAX } from '../src/resume.js'

const list = (...pairs) => ({ items: pairs.map(([content, status]) => ({ content, status })) })
const STOPPED = { running: false, phase: 'plain', pending: 0, subagent: false, lastError: null, canSend: true }

test('남은 할 일은 완료가 아닌 항목이다', () => {
  assert.deepEqual(remainingTodos(list(['가', 'completed'], ['나', 'in_progress'], ['다', 'pending'])).map(i => i.content), ['나', '다'])
  assert.deepEqual(remainingTodos(null), [])
})

test('남은 할 일이 있고 세션이 멈췄을 때만 단추를 보인다', () => {
  const todos = list(['가', 'completed'], ['나', 'pending'])
  assert.equal(resumeStateOf({ ...STOPPED, list: todos }).reason, 'stopped')
  assert.equal(resumeStateOf({ ...STOPPED, list: todos, running: true }), null)
  assert.equal(resumeStateOf({ ...STOPPED, list: list(['가', 'completed']) }), null)
  assert.equal(resumeStateOf({ ...STOPPED, list: null }), null)
})

test('보내는 중·하위 에이전트·입력 동작이 없을 때는 숨긴다', () => {
  const todos = list(['나', 'pending'])
  assert.equal(resumeStateOf({ ...STOPPED, list: todos, phase: 'sending' }), null)
  assert.equal(resumeStateOf({ ...STOPPED, list: todos, pending: 1 }), null)
  assert.equal(resumeStateOf({ ...STOPPED, list: todos, subagent: true }), null)
  assert.equal(resumeStateOf({ ...STOPPED, list: todos, canSend: false }), null)
  // 입력 상태를 모르는 틀에서는 phase가 없어도 보인다.
  assert.notEqual(resumeStateOf({ ...STOPPED, list: todos, phase: undefined }), null)
})

test('오류로 멈췄으면 이유를 error로 알린다', () => {
  assert.equal(resumeStateOf({ ...STOPPED, list: list(['나', 'pending']), lastError: '요청 한도 초과' }).reason, 'error')
  assert.equal(resumeStateOf({ ...STOPPED, list: list(['나', 'pending']), lastError: '  ' }).reason, 'stopped')
})

test('보낼 요청은 진행 중이던 항목을 먼저 적고, 많으면 줄인다', () => {
  const text = resumePromptOf([{ content: '다', status: 'pending' }, { content: '나', status: 'in_progress' }])
  assert.equal(text, '멈춘 곳부터 남은 할 일을 이어서 진행해 주세요.\n- 나 (진행 중에 멈춤)\n- 다')
  const many = Array.from({ length: RESUME_LIST_MAX + 2 }, (_, i) => ({ content: `일${i}`, status: 'pending' }))
  const lines = resumePromptOf(many).split('\n')
  assert.equal(lines.length, 1 + RESUME_LIST_MAX + 1)
  assert.equal(lines.at(-1), '- 외 2개')
})

function fakeActions({ insertOk = true, throws = false } = {}) {
  const calls = []
  return {
    calls,
    setDraft: text => { if (throws) throw new Error('x'); calls.push(['setDraft', text]) },
    submit: () => calls.push(['submit']),
    captureInsertion: () => ({ draftRev: 1 }),
    insertText: (text, span) => { calls.push(['insertText', text, span]); return insertOk },
  }
}

test('입력창이 비었으면 요청을 채워 바로 보낸다', () => {
  const actions = fakeActions()
  assert.equal(sendResume(actions, false, '이어서'), 'sent')
  assert.deepEqual(actions.calls, [['setDraft', '이어서'], ['submit']])
})

test('쓰던 글이 있으면 지우거나 보내지 않고 덧붙이기만 한다', () => {
  const actions = fakeActions()
  assert.equal(sendResume(actions, true, '이어서'), 'inserted')
  assert.deepEqual(actions.calls, [['insertText', '\n이어서', { draftRev: 1 }]])
  assert.equal(actions.calls.some(([name]) => name === 'setDraft' || name === 'submit'), false)
})

test('입력 동작이 없거나 거절·오류면 실패로 알린다', () => {
  assert.equal(sendResume(undefined, false, '이어서'), 'failed')
  assert.equal(sendResume(fakeActions({ insertOk: false }), true, '이어서'), 'failed')
  assert.equal(sendResume(fakeActions({ throws: true }), false, '이어서'), 'failed')
})
