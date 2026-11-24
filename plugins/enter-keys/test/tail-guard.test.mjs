import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TAIL_CHECKS_MS, lostTail, normalizeText, restoreText, watchKind } from '../src/tail-guard.js'

const key = (over = {}) => ({
  key: 'Tab', code: 'Tab', isTrusted: true, isComposing: false,
  shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...over,
})

test('메뉴가 열린 채 누른 Tab·엔터 키만 지켜본다', () => {
  assert.equal(watchKind(key(), true), 'tab')
  assert.equal(watchKind(key({ key: 'Enter', code: 'Enter' }), true), 'enter')
  assert.equal(watchKind(key({ key: 'Process', code: 'NumpadEnter' }), true), 'enter')
  assert.equal(watchKind(key(), false), null, '메뉴가 닫혔으면 손대지 않는다')
  assert.equal(watchKind(key({ shiftKey: true }), true), null, 'Shift+Tab은 메뉴 닫기')
  assert.equal(watchKind(key({ metaKey: true }), true), null)
  assert.equal(watchKind(key({ isComposing: true }), true), null, '조합 중이면 DSH가 지나보낸다')
  assert.equal(watchKind(key({ isTrusted: false }), true), null, '우리가 다시 누른 키')
  assert.equal(watchKind(key({ key: 'a', code: 'KeyA' }), true), null)
})

test('사라진 뒤 글만 잡는다', () => {
  const before = '/revi 이 코드 고쳐줘'
  const tail = ' 이 코드 고쳐줘'
  assert.equal(lostTail({ before, tail, after: '/review ' }), true, '사용자가 본 증상')
  assert.equal(lostTail({ before, tail, after: '/review  이 코드 고쳐줘' }), false, '정상 고르기')
  assert.equal(lostTail({ before, tail, after: before }), false, '아직 아무 일도 없음')
  assert.equal(lostTail({ before, tail, after: '' }), false, '보내서 빈 입력창은 되살리지 않는다')
  assert.equal(lostTail({ before, tail: '   ', after: '/review ' }), false, '뒤에 공백뿐')
  assert.equal(lostTail({ before, tail, after: '/review 이 코드 고쳐줘 ' }), false, '끝 공백만 달라도 글은 남음')
})

test('줄바꿈 없는 공백과 CRLF는 같은 글로 본다', () => {
  assert.equal(normalizeText('a b\r\nc'), 'a b\nc')
  assert.equal(lostTail({ before: '/x a', tail: ' a b', after: '/xy  a b' }), false)
})

test('되살릴 글은 앞 공백을 겹치지 않는다', () => {
  assert.equal(restoreText({ tail: ' 이 코드', after: '/review ' }), '이 코드')
  assert.equal(restoreText({ tail: ' 이 코드', after: '/review' }), ' 이 코드')
  assert.equal(restoreText({ tail: '이 코드\n둘째 줄', after: '/review' }), '이 코드\n둘째 줄')
})

test('확인 시각은 바로·조금 뒤·늦게 세 번', () => {
  assert.deepEqual(TAIL_CHECKS_MS, [0, 80, 300])
})
