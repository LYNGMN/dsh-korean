// DSH Desktop 입력창 Enter 설정의 화면 쪽 번들.
// 이 파일(lib/client.js)은 scripts/build.mjs가 src/client.template.js·src/*.js·src/style.css로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-enter-keys',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState, useId } = React
    const VERSION = __VERSION__
    const STYLE_TEXT = __CSS__

    __PURE__

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
