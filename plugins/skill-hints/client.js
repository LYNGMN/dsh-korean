// 스킬 힌트 — 화면 쪽. 두 가지를 한다.
// 1. 입력창이 `/스킬이름` 하나뿐이면 그 뒤에 회색 입력 안내를 보여 준다.
//    DSH 명령이 쓰는 방법(입력칸의 CSS 변수 `--dsh-composer-hint`)을 그대로 빌려, DSH가 안내를 쓰지 않을 때만 넣는다.
// 2. 호스트가 메뉴 설명을 새 언어로 다시 썼으면 입력창 아래 띠에 "다시 시작" 알림을 띄운다.
// 안내 목록과 알림 여부는 호스트 경로 `api/dsh-skill-hints`에서 받는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-skill-hints',
  factory(require) {
    const React = require('react')
    const { useEffect, useRef, useState } = React
    const h = React.createElement

    const PLUGIN = 'dsh-skill-hints'
    const ROUTE = 'api/dsh-skill-hints'
    const CARD = '[data-composer-card]'
    const INPUT = '[data-composer-input]'
    const VAR = '--dsh-composer-hint'
    const SKILL_TOKEN = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(\s*)$/u
    const DISMISS_KEY = `${PLUGIN}:restart-dismissed`
    const TEXT = {
      ko: { restart: '스킬 메뉴를 새로 맞췄어요. DSH를 완전히 종료(⌘Q)했다가 다시 켜면 반영돼요.', close: '알림 닫기' },
      en: { restart: 'The skill menu was updated. Quit DSH (⌘Q) and open it again to see the change.', close: 'Dismiss' },
    }

    /** 입력창 글이 `/이름` 하나뿐이고 그 스킬에 안내가 있으면 붙일 글. 아니면 null. */
    function ghostHint(text, hints) {
      const m = SKILL_TOKEN.exec(String(text ?? ''))
      if (m === null) return null
      const hint = hints?.[m[1]]
      if (typeof hint !== 'string' || hint === '') return null
      return m[2] === '' ? ` ${hint}` : hint
    }

    // ── 호스트 상태(창 하나에 하나) ─────────────────────────────
    function createStore() {
      let value = { locale: 'en', hints: {}, restart: false }
      let inflight = null
      const listeners = new Set()
      const refresh = () => {
        inflight ??= fetch(ROUTE, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => {
            if (body && typeof body === 'object') {
              value = { locale: body.locale === 'ko' ? 'ko' : 'en', hints: body.hints ?? {}, restart: body.restart === true }
              for (const listener of listeners) listener()
            }
          })
          .catch(() => {})
          .finally(() => { inflight = null })
        return inflight
      }
      return {
        get: () => value,
        refresh,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }
    const store = createStore()

    function useStore() {
      const [, tick] = useState(0)
      useEffect(() => store.subscribe(() => tick((n) => n + 1)), [])
      return store.get()
    }

    // ── 1. 입력 안내 ────────────────────────────────────────────
    /** 카드 하나의 입력칸을 지켜보며 안내 변수를 넣고 뺀다. DSH가 넣은 안내는 건드리지 않는다. */
    function attachHint(card) {
      let ours = null
      const update = () => {
        const input = card.querySelector(INPUT)
        if (input === null) return
        const current = input.style.getPropertyValue(VAR)
        if (current !== '' && current !== ours) { ours = null; return } // DSH 명령 안내가 쓰는 중
        const single = input.querySelectorAll('p').length <= 1
        const hint = single ? ghostHint(input.textContent, store.get().hints) : null
        const next = hint === null ? null : JSON.stringify(hint)
        if (next === ours && current === (ours ?? '')) return
        if (next === null) input.style.removeProperty(VAR)
        else input.style.setProperty(VAR, next)
        ours = next
      }
      const observer = new MutationObserver(update)
      observer.observe(card, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] })
      const off = store.subscribe(update)
      update()
      return () => {
        observer.disconnect()
        off()
        const input = card.querySelector(INPUT)
        if (input !== null && ours !== null && input.style.getPropertyValue(VAR) === ours) input.style.removeProperty(VAR)
      }
    }

    function ComposerHint() {
      const ref = useRef(null)
      useEffect(() => {
        const card = ref.current?.closest(CARD) ?? null
        return card === null ? undefined : attachHint(card)
      }, [])
      return h('span', { ref, hidden: true, 'data-dsh-skill-hints': '' })
    }

    // ── 2. 다시 시작 알림 ───────────────────────────────────────
    function dismissed() {
      try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
    }

    function RestartNotice() {
      const { restart, locale } = useStore()
      const [closed, setClosed] = useState(dismissed)
      if (!restart || closed) return null
      const t = TEXT[locale] ?? TEXT.en
      const close = () => {
        try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* 이번 화면에서만 닫힘 */ }
        setClosed(true)
      }
      return h('div', { className: `${PLUGIN}-notice`, role: 'status' },
        h('span', { className: `${PLUGIN}-notice-text` }, t.restart),
        h('button', { type: 'button', className: `${PLUGIN}-notice-close`, 'aria-label': t.close, title: t.close, onClick: close },
          h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' },
            h('path', { d: 'M18 6 6 18M6 6l12 12' }))))
    }

    const CSS = `
.${PLUGIN}-notice{display:flex;align-items:center;gap:4px;margin:6px 0 0;padding:0 0 0 12px;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-state-business-tertiary,rgba(61,123,224,.12));color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;line-height:20px;word-break:keep-all;overflow-wrap:break-word}
.${PLUGIN}-notice-text{flex:1;min-width:0;padding:12px 0;text-wrap:pretty}
.${PLUGIN}-notice-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#646a73);cursor:pointer;border-radius:var(--dsw-radius-sm,6px)}
@media (hover:hover){.${PLUGIN}-notice-close:hover{color:var(--dsw-alias-label-primary,#1f2329)}}
.${PLUGIN}-notice-close:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,#3d7be0);outline-offset:-4px}
.${PLUGIN}-notice-close svg{display:block}
`

    function apply(ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = PLUGIN
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, `${PLUGIN}: styles`)
      ctx.effect(() => {
        void store.refresh()
        const onFocus = () => { void store.refresh() }
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
      }, `${PLUGIN}: host state`)
      ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay', id: PLUGIN, order: 1001,
      }, ComposerHint))
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock', id: PLUGIN, order: 5,
      }, RestartNotice))
    }
    // 시험용: 순수 함수와 카드 붙이기를 연다.
    apply.testing = { ghostHint, attachHint, store }

    return { inject: ['slots'], apply }
  },
})
