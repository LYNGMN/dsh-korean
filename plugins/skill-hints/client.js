/**
 * 스킬 힌트의 화면 쪽 번들(@lyngmn/dsh-skill-hints).
 *
 * DSH는 `/` 메뉴에서 사용자 전용 스킬(`disable-model-invocation: true`) 설명 앞에
 * "사용자 전용 · "을 붙인다(dsh-client-ui-skill `menu.userOnly`). 사용자 스킬 대부분이
 * 사용자 전용이라 거의 모든 줄에 같은 말이 반복되므로, 메뉴의 스킬 줄에서 그 앞부분만 지운다.
 * 스킬 이름·설명·고르기와 AI가 스킬을 부를 수 있는지는 바꾸지 않는다.
 *
 * DSH는 이 표시를 플러그인에 열어 두지 않았다. 그래서 입력창 카드 안 공식 자리
 * (`conversation.input.overlay`)에 보이지 않게 들어가, 자기 카드 안 메뉴 글자만 고친다.
 * DSH가 메뉴 구조를 바꾸면 원래 표시가 다시 보일 뿐이다.
 */
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-skill-hints',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef } = React

    const PLUGIN = 'dsh-skill-hints'
    const CARD = '[data-composer-card]'
    const MENU = '[data-trigger-menu]'
    // MenuView의 optionId(`dsh-slash-option-${source}-${index}`) 가운데 스킬 묶음 줄.
    const SKILL_ROW = '[role="option"][id^="dsh-slash-option-skill-"]'
    // DSH `menu.userOnly` 문구(zh·en·ja·es·fr·de·ru·pt)와 한국어 언어팩 번역.
    const USER_ONLY_LABELS = [
      '사용자 전용', 'user-only', '仅用户', 'ユーザー専用', 'solo usuario',
      'utilisateur uniquement', 'Nur für Benutzer', 'только для пользователей', 'somente usuário',
    ]
    const SEPARATOR = ' · '

    /** 표시를 뺀 설명. 표시로 시작하지 않으면 null. */
    function stripUserOnly(text) {
      if (typeof text !== 'string') return null
      for (const label of USER_ONLY_LABELS) {
        const prefix = label + SEPARATOR
        if (text.startsWith(prefix)) return text.slice(prefix.length)
      }
      return null
    }

    /** 메뉴의 스킬 줄에서 표시를 지운다. 고친 줄 수를 돌려준다. */
    function cleanMenu(container) {
      let changed = 0
      for (const menu of container.querySelectorAll(MENU)) {
        for (const row of menu.querySelectorAll(SKILL_ROW)) {
          for (const span of row.children) {
            const node = span.firstChild
            if (span.tagName !== 'SPAN' || node === null || node.nodeType !== 3 || span.childNodes.length !== 1) continue
            const next = stripUserOnly(node.nodeValue)
            if (next === null) continue
            node.nodeValue = next
            changed += 1
          }
        }
      }
      return changed
    }

    const watched = new WeakSet()

    // 카드 하나를 지켜본다. 메뉴가 열리거나 줄이 바뀔 때마다 다시 고친다(DSH가 글을 되돌려도 다시 지운다).
    function watchCard(card) {
      if (watched.has(card) || typeof MutationObserver !== 'function') return () => {}
      watched.add(card)
      const run = () => {
        try { cleanMenu(card) } catch (error) {
          try { console.warn(`[${PLUGIN}] 메뉴 표시를 정리하지 못했어요`, error) } catch { /* 콘솔 없음 */ }
        }
      }
      const observer = new MutationObserver(run)
      observer.observe(card, { childList: true, subtree: true, characterData: true })
      run()
      return () => {
        observer.disconnect()
        watched.delete(card)
      }
    }

    function MenuLabelCleaner() {
      const ref = useRef(null)
      useEffect(() => {
        const card = ref.current?.closest(CARD) ?? null
        if (card === null) return undefined
        return watchCard(card)
      }, [])
      return h('span', { ref, hidden: true, 'data-dsh-skill-hints': '' })
    }

    return {
      // 시험(test/client.test.mjs)이 쓴다. DSH는 읽지 않는다.
      internals: { stripUserOnly, cleanMenu, watchCard, USER_ONLY_LABELS },
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay', id: PLUGIN, order: 1001,
        }, MenuLabelCleaner))
      },
    }
  },
})
