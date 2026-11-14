import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ARM_MS, FOLLOW_UP_MS, REPLAY_DELAY_MS, createEnterController, enterChord, isHangul, normalizeEnterKey,
} from '../src/enter-rules.js'

const key = (over = {}) => ({
  key: 'Enter', code: 'Enter', keyCode: 13, isTrusted: true, isComposing: false, repeat: false,
  shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...over,
})

// 시계와 타이머를 손으로 돌리는 처리기.
function rig({ mode = 'send', menu = false } = {}) {
  let t = 1000
  const timers = []
  const presses = []
  const state = { mode, menu }
  const c = createEnterController({
    now: () => t,
    later: (fn, ms) => timers.push({ at: t + ms, fn }),
    enterKey: () => state.mode,
    menuOpen: () => state.menu,
    press: k => presses.push(k),
  })
  const advance = (ms) => {
    t += ms
    for (const timer of timers.splice(0)) {
      if (timer.at <= t) timer.fn()
      else timers.push(timer)
    }
  }
  return { c, presses, advance, state }
}

test('Enter 조합 이름: Shift·Alt·Cmd+Ctrl은 다루지 않는다', () => {
  assert.equal(enterChord(key()), 'plain')
  assert.equal(enterChord(key({ metaKey: true })), 'meta')
  assert.equal(enterChord(key({ ctrlKey: true })), 'ctrl')
  assert.equal(enterChord(key({ shiftKey: true })), null)
  assert.equal(enterChord(key({ altKey: true })), null)
  assert.equal(enterChord(key({ metaKey: true, ctrlKey: true })), null)
  assert.equal(enterChord(key({ key: 'a', code: 'KeyA' })), null)
  assert.equal(enterChord(key({ key: 'Process', keyCode: 229 })), 'plain', 'IME가 key를 Process로 바꿔도 물리 키로 안다')
  assert.equal(enterChord(key({ code: 'NumpadEnter' })), 'plain')
})

test('설정값은 send·newline 둘뿐이고 모르는 값은 바로 보내기다', () => {
  assert.equal(normalizeEnterKey('newline'), 'newline')
  assert.equal(normalizeEnterKey('send'), 'send')
  assert.equal(normalizeEnterKey(null), 'send')
  assert.equal(normalizeEnterKey('x'), 'send')
})

test('한글 판별', () => {
  assert.ok(isHangul('안'))
  assert.ok(isHangul('ㄱ'))
  assert.ok(!isHangul('あ'))
  assert.ok(!isHangul(''))
  assert.ok(!isHangul(undefined))
})

test('바로 보내기: 조합 중 Enter 한 번으로 확정 뒤 보낸다(macOS 순서)', () => {
  const { c, presses, advance } = rig()
  c.compositionStart()
  assert.equal(c.keydown(key({ isComposing: true, keyCode: 229 })), 'pass', '조합 확정은 IME에 맡긴다')
  c.compositionEnd('요')
  assert.equal(c.keydown(key()), 'consume', '확정 직후 다시 오는 Enter는 줄바꿈이 되지 않게 먹는다')
  advance(REPLAY_DELAY_MS - 1)
  assert.deepEqual(presses, [], 'DSH가 조합 중으로 보는 10ms가 지나기 전에는 누르지 않는다')
  advance(1)
  assert.deepEqual(presses, [{ chord: 'plain', newline: false }])
  advance(FOLLOW_UP_MS)
  assert.equal(c.keydown(key()), 'pass', '다음 Enter는 DSH가 그대로 보낸다')
  assert.equal(presses.length, 1)
})

test('바로 보내기: compositionend가 먼저 오고 Enter가 keyCode 229로 와도 한 번에 보낸다', () => {
  const { c, presses, advance } = rig()
  c.compositionStart()
  c.compositionEnd('다')
  advance(2)
  assert.equal(c.keydown(key({ keyCode: 229 })), 'consume')
  advance(REPLAY_DELAY_MS)
  assert.deepEqual(presses, [{ chord: 'plain', newline: false }])
})

test('바로 보내기: 조합이 아닐 때 Enter는 DSH 몫이다', () => {
  const { c, presses } = rig()
  assert.equal(c.keydown(key()), 'pass')
  assert.equal(c.keydown(key({ shiftKey: true })), 'pass', 'Shift+Enter는 늘 DSH 줄바꿈')
  assert.equal(c.keydown(key({ metaKey: true })), 'pass', 'Cmd+Enter는 DSH 규칙(작업 중 반대 방식)')
  assert.deepEqual(presses, [])
})

test('조합 중 Cmd/Ctrl+Enter도 한 번에 같은 조합으로 다시 누른다', () => {
  const { c, presses, advance } = rig()
  c.compositionStart()
  c.keydown(key({ isComposing: true, keyCode: 229, metaKey: true }))
  c.compositionEnd('끝')
  advance(REPLAY_DELAY_MS)
  assert.deepEqual(presses, [{ chord: 'meta', newline: false }])
})

test('조합 중 Shift+Enter는 손대지 않는다', () => {
  const { c, presses, advance } = rig()
  c.compositionStart()
  assert.equal(c.keydown(key({ isComposing: true, keyCode: 229, shiftKey: true })), 'pass')
  c.compositionEnd('줄')
  advance(REPLAY_DELAY_MS)
  assert.deepEqual(presses, [])
})

test('한글이 아닌 조합(일본어 후보 고르기 등)은 예전 DSH 동작 그대로다', () => {
  const { c, presses, advance } = rig()
  c.compositionStart()
  c.keydown(key({ isComposing: true, keyCode: 229 }))
  c.compositionEnd('日本')
  assert.equal(c.keydown(key()), 'pass')
  advance(REPLAY_DELAY_MS)
  assert.deepEqual(presses, [])
})

test('조합을 취소하면(빈 확정) 보내지 않는다', () => {
  const { c, presses, advance } = rig()
  c.compositionStart()
  c.keydown(key({ isComposing: true, keyCode: 229 }))
  c.compositionEnd('')
  advance(REPLAY_DELAY_MS)
  assert.deepEqual(presses, [])
})

test('조합 중 Enter 뒤 오래 지나 끝난 조합은 Enter 확정으로 보지 않는다', () => {
  const { c, presses, advance } = rig()
  c.compositionStart()
  c.keydown(key({ isComposing: true, keyCode: 229 }))
  advance(ARM_MS)
  c.compositionEnd('가')
  advance(REPLAY_DELAY_MS)
  assert.deepEqual(presses, [])
})

test('줄바꿈: Enter는 줄을 바꾸고 Cmd/Ctrl+Enter는 DSH가 보낸다', () => {
  const { c, presses } = rig({ mode: 'newline' })
  assert.equal(c.keydown(key()), 'consume')
  assert.deepEqual(presses, [{ chord: 'plain', newline: true }])
  assert.equal(c.keydown(key({ ctrlKey: true })), 'pass')
  assert.equal(c.keydown(key({ shiftKey: true })), 'pass')
  assert.equal(c.keydown(key({ repeat: true })), 'consume', '누르고 있으면 줄이 계속 바뀐다')
  assert.equal(presses.length, 2)
})

test('줄바꿈: 조합 중 Enter 한 번이면 확정하고 줄 하나만 바꾼다', () => {
  const { c, presses, advance } = rig({ mode: 'newline' })
  c.compositionStart()
  c.keydown(key({ isComposing: true, keyCode: 229 }))
  c.compositionEnd('줄')
  assert.equal(c.keydown(key()), 'consume')
  advance(REPLAY_DELAY_MS)
  assert.deepEqual(presses, [{ chord: 'plain', newline: true }])
})

test('줄바꿈이어도 자동완성 메뉴가 열려 있으면 Enter는 DSH가 항목을 고른다', () => {
  const { c, presses, advance, state } = rig({ mode: 'newline', menu: true })
  assert.equal(c.keydown(key()), 'pass')
  c.compositionStart()
  c.keydown(key({ isComposing: true, keyCode: 229 }))
  c.compositionEnd('계')
  advance(REPLAY_DELAY_MS)
  assert.deepEqual(presses, [{ chord: 'plain', newline: false }], '확정 뒤 일반 Enter로 눌러 메뉴가 고르게 한다')
  state.menu = false
  assert.equal(c.keydown(key()), 'consume')
})

test('우리가 다시 누른 가짜 Enter는 그냥 지나간다', () => {
  const { c } = rig({ mode: 'newline' })
  assert.equal(c.keydown(key({ isTrusted: false })), 'pass')
})

test('바로 보내기에서 누르고 있는 Enter는 DSH 몫이다(연속 전송 막기)', () => {
  const { c } = rig()
  assert.equal(c.keydown(key({ repeat: true })), 'pass')
})
