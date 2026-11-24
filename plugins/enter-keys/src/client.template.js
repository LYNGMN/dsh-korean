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

    // ── 자동완성 뒤 글 지키기 ─────────────────────────────────
    // DSH 편집 루트는 줄마다 <p>, 줄 안 줄바꿈은 <br>, 빈 줄은 <p><br></p>다. 그 모양대로 글을 읽는다.

    function inlineText(node) {
      if (node.nodeType === 3) return node.nodeValue ?? ''
      if (node.nodeName === 'BR') return '\n'
      let out = ''
      for (const child of node.childNodes) out += inlineText(child)
      return out
    }

    function blockText(block) {
      if (block.nodeType === 3) return block.nodeValue ?? ''
      const kids = block.childNodes
      if (kids.length === 1 && kids[0].nodeName === 'BR') return ''
      return inlineText(block)
    }

    function composerText(container) {
      return Array.from(container.childNodes, blockText).join('\n')
    }

    // 커서 뒤 글. 커서가 한 점이 아니거나, 뒤에 칩·인용(contenteditable=false)이 섞이면 null(글로 되살리면 칩이 깨진다).
    function readTail(input) {
      const selection = window.getSelection?.()
      if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null
      const caret = selection.getRangeAt(0)
      if (!input.contains(caret.startContainer)) return null
      const range = document.createRange()
      range.setStart(caret.startContainer, caret.startOffset)
      range.setEnd(input, input.childNodes.length)
      const fragment = range.cloneContents()
      if (fragment.querySelector('[contenteditable="false"]') !== null) return null
      return composerText(fragment)
    }

    // composerText 기준 offset 자리의 DOM 점.
    function pointAt(input, offset) {
      let left = offset
      let last = [input, input.childNodes.length]
      const blocks = Array.from(input.childNodes)
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (i > 0) left -= 1
        if (left < 0) return last
        const placeholder = block.childNodes.length === 1 && block.firstChild.nodeName === 'BR'
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
        for (let node = walker.currentNode; node !== null; node = walker.nextNode()) {
          if (node.nodeType === 3) {
            const length = node.nodeValue.length
            if (left <= length) return [node, left]
            left -= length
            last = [node, length]
          } else if (node.nodeName === 'BR' && !placeholder) {
            if (left === 0) return [node.parentNode, Array.prototype.indexOf.call(node.parentNode.childNodes, node)]
            left -= 1
          }
        }
        if (left === 0) return [block, block.childNodes.length]
        last = [block, block.childNodes.length]
      }
      return last
    }

    function setCaret(node, offset) {
      const selection = window.getSelection?.()
      if (!selection) return
      const range = document.createRange()
      range.setStart(node, offset)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    // 끝에 글을 붙인다. DSH 키맵의 붙여넣기(PASTE_COMMAND → pasteText)가 받아 정리해 넣는다.
    function appendViaPaste(input, text) {
      if (typeof DataTransfer !== 'function' || typeof ClipboardEvent !== 'function') return false
      input.focus({ preventScroll: true })
      setCaret(input, input.childNodes.length)
      const data = new DataTransfer()
      data.setData('text/plain', text)
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      input.dispatchEvent(event)
      return event.defaultPrevented
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
      const later = (fn, ms, message) => {
        const id = setTimeout(() => {
          timers.delete(id)
          try { fn() } catch (error) { warn(message, error) }
        }, ms)
        timers.add(id)
        return id
      }
      const menuOpen = () => card.querySelector(MENU) !== null || document.querySelector('[data-trigger-menu]') !== null
      const controller = createEnterController({
        now: () => Date.now(),
        later: (fn, ms) => { later(fn, ms, '엔터 키를 다시 누르지 못했어요') },
        enterKey: store.get,
        menuOpen,
        press: key => pressEnter(root(), key),
      })

      // 자동완성으로 고르기 직전의 커서 뒤 글. 고른 뒤 사라졌을 때만 되살린다.
      let watch = null
      const stopWatch = () => {
        if (watch === null) return
        for (const id of watch.ids) { clearTimeout(id); timers.delete(id) }
        watch = null
      }
      const checkTail = (current, at) => {
        if (watch !== current) return
        const input = root()
        if (input === null || !input.isConnected) { stopWatch(); return }
        const after = composerText(input)
        if (!lostTail({ before: current.before, tail: current.tail, after })) return
        stopWatch()
        const caret = normalizeText(after).length
        if (!appendViaPaste(input, restoreText({ tail: current.tail, after }))) {
          warn('자동완성 뒤 사라진 글을 되살리지 못했어요', null)
          return
        }
        // 붙여넣기를 마친 DSH 편집기가 커서를 글 끝에 다시 그린 뒤, 고른 항목 바로 뒤로 옮긴다.
        later(() => {
          if (!input.isConnected) return
          const [node, offset] = pointAt(input, caret)
          setCaret(node, offset)
        }, 0, '커서를 되돌리지 못했어요')
        try { console.info(`[${PLUGIN}] ${current.kind} 고른 뒤 사라진 글 ${current.tail.length}자를 되살렸어요(${at}ms)`) } catch { /* 콘솔 없음 */ }
      }
      const startWatch = (kind) => {
        const input = root()
        if (input === null) return
        const tail = readTail(input)
        if (tail === null || tail.trim() === '') return
        const current = { kind, before: composerText(input), tail, ids: [] }
        watch = current
        for (const ms of TAIL_CHECKS_MS) {
          current.ids.push(later(() => checkTail(current, ms), ms, '자동완성 뒤 글을 확인하지 못했어요'))
        }
      }

      const onKeyDown = (event) => {
        if (!inInput(event.target)) return
        // 사람이 다음 키를 누르면 그 뒤 바뀐 글은 사람 몫이다.
        if (event.isTrusted !== false) stopWatch()
        let action = 'pass'
        try { action = controller.keydown(event) } catch (error) { warn('엔터 키 판단에 실패해 DSH 기본 동작으로 둡니다', error) }
        if (action === 'consume') {
          event.preventDefault()
          event.stopImmediatePropagation()
          return
        }
        try {
          const kind = watchKind(event, menuOpen())
          if (kind !== null) startWatch(kind === 'tab' ? 'Tab으로' : '엔터 키로')
        } catch (error) { warn('자동완성 뒤 글을 기억하지 못했어요', error) }
      }
      const onBeforeInput = (event) => { if (event.isTrusted !== false && inInput(event.target)) stopWatch() }
      const onStart = (event) => { if (inInput(event.target)) controller.compositionStart() }
      const onEnd = (event) => { if (inInput(event.target)) controller.compositionEnd(event.data) }
      card.addEventListener('keydown', onKeyDown, true)
      card.addEventListener('compositionstart', onStart, true)
      card.addEventListener('compositionend', onEnd, true)
      card.addEventListener('beforeinput', onBeforeInput, true)
      return () => {
        card.removeEventListener('keydown', onKeyDown, true)
        card.removeEventListener('compositionstart', onStart, true)
        card.removeEventListener('compositionend', onEnd, true)
        card.removeEventListener('beforeinput', onBeforeInput, true)
        watch = null
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
      internals: { store, attachComposer, createSettingStore, composerText, readTail, pointAt },
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
