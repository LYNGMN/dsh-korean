// DSH Desktop 입력창 Enter 규칙. 화면·타이머 없이 판단만 한다(client.template.js가 DOM에 잇는다).
//
// DSH 입력창(keymap.ts)은 한글 조합 중 Enter와 compositionend 뒤 10ms 안의 Enter를 삼킨다.
// 그래서 조합을 확정하는 Enter가 보내지지 않거나, macOS가 확정 뒤 다시 보내는 Enter가 줄바꿈이 된다.
// 이 규칙은 조합을 확정한 Enter를 기억했다가, 확정이 끝난 뒤 DSH가 받는 Enter 하나로 다시 눌러 준다.

export const ENTER_KEY_MODES = ['send', 'newline']
export const DEFAULT_ENTER_KEY = 'send'
export const STORAGE_KEY = 'dsh-enter-keys:enterKey'

// DSH는 compositionend 뒤 10ms 동안 Enter를 조합 중으로 본다. 그보다 늦게, 편집기가 글자를 확정한 뒤 다시 누른다.
export const REPLAY_DELAY_MS = 30
// 확정 직후 따라오는 진짜 Enter(macOS는 keyCode 13, Safari 계열은 229)를 이만큼 먹는다.
export const FOLLOW_UP_MS = 100
// 조합 중 Enter 뒤 이 시간 안에 compositionend가 와야 확정 Enter로 본다.
export const ARM_MS = 1000

const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힣ힰ-퟿]/

export function normalizeEnterKey(value) {
  return value === 'newline' ? 'newline' : DEFAULT_ENTER_KEY
}

export function isHangul(text) {
  return typeof text === 'string' && HANGUL.test(text)
}

/**
 * 이 규칙이 다루는 Enter 조합.
 * @returns {'plain' | 'meta' | 'ctrl' | null} Shift·Alt가 섞이거나 Cmd와 Ctrl을 함께 누르면 null(DSH·브라우저 몫).
 */
export function enterChord(e) {
  const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter'
  if (!isEnter) return null
  if (e.shiftKey || e.altKey || e.altGraph) return null
  if (e.metaKey && e.ctrlKey) return null
  if (e.metaKey) return 'meta'
  if (e.ctrlKey) return 'ctrl'
  return 'plain'
}

/**
 * 입력창 하나의 Enter 처리기.
 * @param {object} deps
 * @param {() => number} deps.now
 * @param {(fn: () => void, ms: number) => void} deps.later
 * @param {() => 'send' | 'newline'} deps.enterKey 지금 설정
 * @param {() => boolean} deps.menuOpen `/`·`@` 자동완성 메뉴가 열렸는지
 * @param {(key: { chord: 'plain' | 'meta' | 'ctrl', newline: boolean }) => void} deps.press DSH 편집기에 Enter 하나를 누른다
 */
export function createEnterController({ now, later, enterKey, menuOpen, press }) {
  let composing = false
  let armed = null
  let lastEnd = null
  let pending = false
  let swallowUntil = -Infinity

  const wantsNewline = chord => chord === 'plain' && enterKey() === 'newline' && !menuOpen()

  function replayLater(chord) {
    pending = true
    lastEnd = null
    swallowUntil = now() + FOLLOW_UP_MS
    later(() => {
      pending = false
      press({ chord, newline: wantsNewline(chord) })
    }, REPLAY_DELAY_MS)
  }

  return {
    compositionStart() {
      composing = true
    },

    compositionEnd(data) {
      composing = false
      const at = now()
      const hangul = isHangul(data)
      const arm = armed
      armed = null
      lastEnd = { at, hangul }
      if (arm !== null && hangul && at - arm.at < ARM_MS && !pending) replayLater(arm.chord)
    },

    /**
     * 입력창 안 keydown 하나(capture 단계).
     * @returns {'pass' | 'consume'} consume이면 부르는 쪽이 preventDefault·stopImmediatePropagation 한다.
     */
    keydown(e) {
      if (e.isTrusted === false) return 'pass'
      const chord = enterChord(e)
      if (chord === null) return 'pass'
      const at = now()
      if (e.isComposing || composing) {
        if (!e.repeat) armed = { at, chord }
        return 'pass'
      }
      if (at < swallowUntil) return 'consume'
      if (!e.repeat && lastEnd !== null && lastEnd.hangul && at - lastEnd.at < FOLLOW_UP_MS && !pending) {
        replayLater(chord)
        return 'consume'
      }
      if (wantsNewline(chord)) {
        press({ chord, newline: true })
        return 'consume'
      }
      return 'pass'
    },
  }
}
