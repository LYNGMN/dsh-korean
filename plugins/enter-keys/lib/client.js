// DSH Desktop 입력창 Enter 설정의 화면 쪽 번들.
// 이 파일(lib/client.js)은 scripts/build.mjs가 src/client.template.js·src/*.js·src/style.css로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-enter-keys',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState, useId } = React
    const VERSION = "1.0.0"
    const STYLE_TEXT = "/* 일반 설정의 \"Enter를 누르면\" 줄. DSH 설정 줄과 같은 색 토큰을 쓰고, 토큰이 없으면 괄호 안 값으로 그린다. */\n.dek-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 12px 16px;\n  padding: 16px 0;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));\n  word-break: keep-all;\n  overflow-wrap: break-word;\n}\n.dek-text {\n  flex: 1 1 240px;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.dek-title {\n  font-size: 14px;\n  line-height: 22px;\n  color: var(--dsw-alias-label-primary, #1f2329);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dek-desc {\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary, #646a73);\n  text-wrap: pretty;\n}\n.dek-line { display: block; }\n\n/* 두 칸 고르기. 진짜 라디오 단추라 화살표 키·화면 읽기가 그대로 된다. */\n.dek-segment {\n  flex: none;\n  display: inline-grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 2px;\n  padding: 2px;\n  border-radius: var(--dsw-radius-md, 10px);\n  background: var(--dsw-alias-bg-module-platform, rgba(0, 0, 0, 0.05));\n}\n.dek-option {\n  position: relative;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 88px;\n  height: 40px;\n  padding: 0 12px;\n  box-sizing: border-box;\n  border-radius: calc(var(--dsw-radius-md, 10px) - 2px);\n  font-size: 14px;\n  line-height: 22px;\n  color: var(--dsw-alias-label-secondary, #646a73);\n  white-space: nowrap;\n  cursor: pointer;\n  user-select: none;\n}\n.dek-radio {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  margin: 0;\n  opacity: 0;\n  cursor: pointer;\n}\n.dek-option:has(.dek-radio:checked) {\n  color: var(--dsw-alias-label-primary, #1f2329);\n  background: var(--dsw-alias-bg-base, #ffffff);\n  box-shadow: 0 0 0 0.5px var(--dsw-elevation-stroke-color, rgba(0, 0, 0, 0.12)), 0 1px 2px rgba(0, 0, 0, 0.06);\n}\n.dek-option:has(.dek-radio:focus-visible) {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3f77d8);\n  outline-offset: 1px;\n}\n@media (hover: hover) {\n  .dek-option:not(:has(.dek-radio:checked)):hover {\n    background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));\n  }\n}\n\n/* 좁은 설정 창: 고르기를 설명 아래 줄로 내린다. */\n@media (max-width: 520px) {\n  .dek-segment { width: 100%; }\n  .dek-option { min-width: 0; }\n}"

    const ENTER_KEY_MODES = ['send', 'newline']
    const DEFAULT_ENTER_KEY = 'send'
    const STORAGE_KEY = 'dsh-enter-keys:enterKey'
    
    const REPLAY_DELAY_MS = 30
    const FOLLOW_UP_MS = 100
    const ARM_MS = 1000
    
    const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힣ힰ-퟿]/
    
    function normalizeEnterKey(value) {
      return value === 'newline' ? 'newline' : DEFAULT_ENTER_KEY
    }
    
    function isHangul(text) {
      return typeof text === 'string' && HANGUL.test(text)
    }
    
    /**
     * 이 규칙이 다루는 Enter 조합.
     * @returns {'plain' | 'meta' | 'ctrl' | null} Shift·Alt가 섞이거나 Cmd와 Ctrl을 함께 누르면 null(DSH·브라우저 몫).
     */
    function enterChord(e) {
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
    function createEnterController({ now, later, enterKey, menuOpen, press }) {
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

    const PLUGIN = 'dsh-enter-keys'
    const CARD = '[data-composer-card]'
    const INPUT = '[data-composer-input]'
    // `/`·`@` 자동완성 메뉴와 명령 인자 고르기 창.
    const MENU = '[data-trigger-menu], [data-composer-overlay] [role="listbox"]'
    const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || '')
    const SEND_CHORD = IS_APPLE ? 'Cmd+엔터' : 'Ctrl+엔터'

    function warn(message, error) {
      try { console.warn(`[${PLUGIN}] ${message}`, error) } catch { /* 콘솔이 없어도 입력은 계속된다 */ }
    }

    // ── 설정 ──────────────────────────────────────────────────
    // Desktop은 고정된 자체 주소로 화면을 열어 브라우저 저장소가 재시작 뒤에도 남는다.

    function browserStorage() {
      try { return window.localStorage ?? null } catch { return null }
    }

    function createSettingStore(storage) {
      const read = () => {
        try {
          const saved = storage?.getItem(STORAGE_KEY)
          return normalizeEnterKey(saved)
        } catch { return DEFAULT_ENTER_KEY }
      }
      let value = read()
      const listeners = new Set()
      const publish = (next) => {
        if (next === value) return
        value = next
        for (const listener of listeners) listener()
      }
      return {
        get: () => value,
        set(next) {
          const normalized = normalizeEnterKey(next)
          try { storage?.setItem(STORAGE_KEY, normalized) } catch (error) { warn('설정을 저장하지 못했어요', error) }
          publish(normalized)
        },
        refresh: () => publish(read()),
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    const store = createSettingStore(browserStorage())

    function useEnterKey() {
      const [value, setValue] = useState(store.get)
      useEffect(() => {
        setValue(store.get())
        return store.subscribe(() => setValue(store.get()))
      }, [])
      return value
    }

    // ── 입력창 잇기 ───────────────────────────────────────────

    // DSH 편집기(Lexical)는 입력창 루트의 keydown을 받는다. 그 루트에 Enter 하나를 다시 누른다.
    function pressEnter(root, { chord, newline }) {
      if (root === null || !root.isConnected || root.getAttribute('contenteditable') !== 'true') return
      root.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
        composed: true,
        shiftKey: newline,
        metaKey: chord === 'meta',
        ctrlKey: chord === 'ctrl',
      }))
    }

    const attached = new WeakSet()

    // 입력창 카드 하나에 capture 단계 듣기를 건다. 카드 밖 DOM은 건드리지 않는다.
    function attachComposer(card) {
      if (attached.has(card)) return () => {}
      attached.add(card)
      const timers = new Set()
      const root = () => card.querySelector(INPUT)
      const inInput = (target) => {
        const input = root()
        return input !== null && target instanceof Node && input.contains(target)
      }
      const controller = createEnterController({
        now: () => Date.now(),
        later: (fn, ms) => {
          const id = setTimeout(() => {
            timers.delete(id)
            try { fn() } catch (error) { warn('엔터 키를 다시 누르지 못했어요', error) }
          }, ms)
          timers.add(id)
        },
        enterKey: store.get,
        menuOpen: () => card.querySelector(MENU) !== null || document.querySelector('[data-trigger-menu]') !== null,
        press: key => pressEnter(root(), key),
      })
      const onKeyDown = (event) => {
        if (!inInput(event.target)) return
        let action = 'pass'
        try { action = controller.keydown(event) } catch (error) { warn('엔터 키 판단에 실패해 DSH 기본 동작으로 둡니다', error) }
        if (action === 'consume') {
          event.preventDefault()
          event.stopImmediatePropagation()
        }
      }
      const onStart = (event) => { if (inInput(event.target)) controller.compositionStart() }
      const onEnd = (event) => { if (inInput(event.target)) controller.compositionEnd(event.data) }
      card.addEventListener('keydown', onKeyDown, true)
      card.addEventListener('compositionstart', onStart, true)
      card.addEventListener('compositionend', onEnd, true)
      return () => {
        card.removeEventListener('keydown', onKeyDown, true)
        card.removeEventListener('compositionstart', onStart, true)
        card.removeEventListener('compositionend', onEnd, true)
        for (const id of timers) clearTimeout(id)
        timers.clear()
        attached.delete(card)
      }
    }

    // 입력창 카드 안(conversation.input.overlay)에 보이지 않게 들어가 자기 카드를 찾는다.
    function ComposerEnterKeys() {
      const ref = useRef(null)
      useEffect(() => {
        const card = ref.current?.closest(CARD) ?? null
        if (card === null) return undefined
        return attachComposer(card)
      }, [])
      return h('span', { ref, hidden: true, 'data-dsh-enter-keys': VERSION })
    }

    // ── 설정 항목 ─────────────────────────────────────────────

    const OPTIONS = [
      { id: 'send', label: '바로 보내기' },
      { id: 'newline', label: '줄바꿈' },
    ]

    function EnterKeyRow() {
      const mode = useEnterKey()
      const id = useId()
      return h('div', { className: 'dek-row' },
        h('div', { className: 'dek-text' },
          h('div', { className: 'dek-title', id: `${id}-title` }, '엔터 키를 누르면'),
          h('div', { className: 'dek-desc', id: `${id}-desc` },
            h('span', { className: 'dek-line' }, '한글을 치다가 누른 엔터 키도 한 번에 처리해요.'),
            h('span', { className: 'dek-line' }, `Shift+엔터는 늘 줄을 바꾸고, 줄바꿈을 고르면 ${SEND_CHORD}로 보내요.`))),
        h('div', {
          className: 'dek-segment', role: 'radiogroup',
          'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-desc`,
        }, OPTIONS.map(option => h('label', { key: option.id, className: 'dek-option' },
          h('input', {
            type: 'radio', className: 'dek-radio', name: `${id}-enter`, value: option.id,
            checked: mode === option.id, onChange: () => store.set(option.id),
          }),
          h('span', { className: 'dek-option-label' }, option.label)))))
    }

    // ── 등록 ──────────────────────────────────────────────────

    return {
      // 시험(test/client.test.mjs)과 미리보기 틀(test/preview.html)이 쓴다. DSH는 읽지 않는다.
      internals: { store, attachComposer, createSettingStore },
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = PLUGIN
          tag.dataset.version = VERSION
          tag.textContent = STYLE_TEXT
          document.head.appendChild(tag)
          return () => tag.remove()
        }, `${PLUGIN}: styles`)

        ctx.effect(() => {
          const onStorage = (event) => { if (event.key === null || event.key === STORAGE_KEY) store.refresh() }
          window.addEventListener('storage', onStorage)
          return () => window.removeEventListener('storage', onStorage)
        }, `${PLUGIN}: other windows`)

        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay', id: PLUGIN, order: 1000,
        }, ComposerEnterKeys))
        // DSH "작업 중 보내기 방식"(composer-enter, 20) 바로 다음 줄.
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item', id: PLUGIN, order: 21,
        }, EnterKeyRow))
      },
    }
  },
})
