/**
 * Footnote Preview for DSH — browser half.
 *
 * DSH's markdown renderer (chat answers and the markdown preview) draws a
 * footnote reference `[^1]` as a bare `<sup>1</sup>` and collects the
 * definitions at the end in `<section data-footnotes><ol><li>…`, each closed by
 * plain-text `↩` marks (`↩ ↩<sup>2</sup> ↩<sup>3</sup>` when it is used three
 * times). Nothing there is a link. This module leaves the renderer alone and
 * adds on top of what it drew:
 *
 * - pointer rests on a number → the footnote's text appears beside it;
 * - click / Enter on a number → scroll to the footnote, mark it, move focus;
 * - click on a `↩` (or its number) → back to that use of the reference;
 * - after a jump, a "back to text" button returns to where you left;
 * - touch: the first tap shows the card, its "go to footnote" button jumps;
 * - the first `↩` of a footnote used more than once gets a `1`, to match the rest.
 *
 * Labels follow the DSH language setting (`ctx.locale`). React's own nodes are
 * never moved or wrapped; the plugin only adds attributes and its own elements.
 */
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-footnote-hover',
  factory() {
    const NS = 'footnote-hover'
    const ATTR = 'data-fn-hover'          // a reference number in the text
    const LI_ATTR = 'data-fn-li'          // a footnote item with references
    const BACK_ATTR = 'data-fn-backref'   // a back-reference number in a footnote item (value k)
    const NUM_ATTR = 'data-fn-backnum'    // the `1` this plugin adds after the first ↩
    const MARK_ATTR = 'data-fn-arrived'   // briefly marks where a jump landed
    const STYLE_ID = 'local-footnote-hover-style'
    const TIP_ID = 'local-footnote-hover-tip'
    const BACK_ID = 'local-footnote-hover-back'
    const EDGE = 8          // keep cards and buttons this far from the window edges
    const GAP = 6           // space between the number and the card
    const SHOW_DELAY = 180  // ms the pointer must rest before the card appears
    const HIDE_DELAY = 250  // ms; lets the pointer travel from the number into the card
    const MARK_TIME = 1600  // ms the landing mark stays
    const ARROW = '↩'

    const en = {
      label: 'Footnote {n}',
      goTo: 'Go to footnote',
      backToText: 'Back to text',
      backTo: 'Back to reference {k}',
      backToOnly: 'Back to reference'
    }
    const ko = {
      label: '각주 {n}',
      goTo: '각주로 가기',
      backToText: '본문으로',
      backTo: '본문 {k}번째 위치로 돌아가기',
      backToOnly: '본문으로 돌아가기'
    }
    const zh = {
      label: '脚注 {n}',
      goTo: '跳到脚注',
      backToText: '返回正文',
      backTo: '返回正文第 {k} 处',
      backToOnly: '返回正文'
    }
    const fill = (template, params) => template.replace(/\{(\w+)\}/g, (m, name) => (params && name in params ? String(params[name]) : m))
    const fallbackT = (key, params) => fill(en[key] ?? key, params)

    const ICON_BACK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>'
    const ICON_DOWN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>'

    const CSS = `
sup[${ATTR}]{cursor:pointer;color:inherit;text-decoration:underline dotted currentColor;text-decoration-thickness:1px;text-underline-offset:2px;border-radius:3px;padding:0 1px}
sup[${ATTR}]:hover,sup[${ATTR}][aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}
sup[${ATTR}]:focus-visible,sup[${BACK_ATTR}]:focus-visible,#${BACK_ID}:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,Highlight));outline-offset:1px}
sup[${BACK_ATTR}]{cursor:pointer;border-radius:3px}
sup[${BACK_ATTR}]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}
li[${LI_ATTR}]{scroll-margin:72px 0}
li[${LI_ATTR}]:focus{outline:none}
li[${LI_ATTR}][data-fn-hot]{cursor:pointer}
sup[${ATTR}]{scroll-margin:72px 0}
[${MARK_ATTR}]{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,Highlight))!important;outline-offset:4px;border-radius:6px}
sup[${MARK_ATTR}]{outline-offset:2px;border-radius:3px}
@media (prefers-reduced-motion:no-preference){[${MARK_ATTR}]{transition:outline-color .3s ease}}
#${TIP_ID}{position:fixed;z-index:2147483000;box-sizing:border-box;left:0;top:0;max-width:min(360px,calc(100vw - ${EDGE * 2}px));max-height:min(60vh,calc(100vh - ${EDGE * 2}px));overflow:auto;overscroll-behavior:contain;padding:10px 12px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-hovercard-bg,#1f2329);color:var(--dsw-alias-hovercard-label-primary,#fff);box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.2));font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;line-height:1.55;text-align:left;word-break:keep-all;overflow-wrap:anywhere;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-hovercard-label-secondary,rgba(255,255,255,.4)) transparent}
#${TIP_ID}[hidden]{display:none}
#${TIP_ID}[data-kind=hint]{padding:4px 8px;font-size:12px;white-space:nowrap}
#${TIP_ID} p{margin:0}
#${TIP_ID} p+p{margin-top:6px}
#${TIP_ID} a{color:inherit;text-decoration:underline;text-underline-offset:2px}
#${TIP_ID} a:focus-visible{outline:2px solid currentColor;outline-offset:1px;border-radius:2px}
#${TIP_ID} .fn-hover-label{display:block;margin-bottom:2px;font-size:12px;color:var(--dsw-alias-hovercard-label-secondary,rgba(255,255,255,.72))}
#${TIP_ID} .fn-hover-go{display:flex;justify-content:flex-end;margin-top:6px}
#${TIP_ID} .fn-hover-go button,#${BACK_ID}{display:inline-flex;align-items:center;justify-content:center;gap:4px;margin:0;font:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer;border-radius:6px}
#${TIP_ID} .fn-hover-go button{min-height:24px;padding:0 8px;border:1px solid var(--dsw-alias-hovercard-label-secondary,rgba(255,255,255,.4));background:transparent;color:inherit}
#${TIP_ID} .fn-hover-go button:hover{background:rgba(255,255,255,.12)}
#${TIP_ID} svg,#${BACK_ID} svg{display:block;flex:none}
#${BACK_ID}{position:fixed;z-index:2147483000;left:0;top:0;box-sizing:border-box;height:24px;padding:0 8px;border:1px solid transparent;background:var(--dsw-alias-hovercard-bg,#1f2329);color:var(--dsw-alias-hovercard-label-primary,#fff);box-shadow:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.2));font-family:var(--dsw-font-family,system-ui,sans-serif)}
#${BACK_ID}[hidden]{display:none}
@media (prefers-reduced-motion:no-preference){#${TIP_ID},#${BACK_ID}{transition:opacity .12s ease}}
`

    /** Footnote definition list items of one rendered markdown block. */
    function definitionItems(section) {
      const list = Array.from(section.children).find((el) => el.tagName === 'OL')
      return list ? Array.from(list.children).filter((el) => el.tagName === 'LI') : []
    }

    /** Reference numbers (`<sup>n</sup>`) that belong to this footnote section's block. */
    function referenceNumbers(section) {
      const root = section.parentElement
      if (!root) return []
      return Array.from(root.querySelectorAll('sup')).filter((sup) => {
        if (section.contains(sup) || sup.closest('section[data-footnotes]')) return false
        if (sup.children.length > 0 || !/^\d{1,3}$/.test(sup.textContent.trim())) return false
        // Skip numbers that sit inside a nested block with its own footnotes.
        let el = sup.parentElement
        while (el && el !== root) {
          if (Array.from(el.children).some((c) => c.matches('section[data-footnotes]'))) return false
          el = el.parentElement
        }
        return true
      })
    }

    /** Pair each reference with its definition: reference n → n-th list item. */
    function pairFootnotes(doc) {
      const pairs = []
      for (const section of doc.querySelectorAll('section[data-footnotes]')) {
        const items = definitionItems(section)
        if (items.length === 0) continue
        for (const sup of referenceNumbers(section)) {
          const li = items[Number(sup.textContent.trim()) - 1]
          if (li) pairs.push([sup, li])
        }
      }
      return pairs
    }

    /** Text nodes of `root` that hold a back-reference mark, in document order. */
    function arrowNodes(root, doc) {
      const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */)
      const nodes = []
      while (walker.nextNode()) if (walker.currentNode.nodeValue.includes(ARROW)) nodes.push(walker.currentNode)
      return nodes
    }

    /** `<sup>k</sup>` right after a `↩` mark: the renderer's (k ≥ 2) or this plugin's `1`. */
    function isBackNumber(sup) {
      if (sup.hasAttribute(NUM_ATTR)) return true
      const prev = sup.previousSibling
      return !!(prev && prev.nodeType === 3 && /↩\s*$/.test(prev.nodeValue))
    }

    /** The definition's content for the card: no back-reference marks or their numbers. */
    function cardContent(li, doc) {
      const copy = li.cloneNode(true)
      copy.removeAttribute('id')
      for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id')
      for (const sup of Array.from(copy.querySelectorAll('sup'))) if (isBackNumber(sup)) sup.remove()
      for (const node of arrowNodes(copy, doc)) node.nodeValue = node.nodeValue.replace(/\s*↩/g, '')
      for (const el of copy.querySelectorAll(`[${ATTR}],[${BACK_ATTR}]`)) {
        for (const a of [ATTR, BACK_ATTR, 'tabindex', 'role', 'aria-label']) el.removeAttribute(a)
      }
      const frag = doc.createDocumentFragment()
      while (copy.firstChild) frag.appendChild(copy.firstChild)
      return frag
    }

    /** Where the card goes: above the anchor, or below when there is no room; inside the window. */
    function placeCard(anchor, card, view) {
      const width = Math.min(card.width, view.width - EDGE * 2)
      const height = Math.min(card.height, view.height - EDGE * 2)
      let left = anchor.left + anchor.width / 2 - width / 2
      left = Math.max(EDGE, Math.min(left, view.width - EDGE - width))
      let top = anchor.top - GAP - height
      let side = 'above'
      if (top < EDGE) {
        top = anchor.bottom + GAP
        side = 'below'
        if (top + height > view.height - EDGE) {
          // Neither side fits: use whichever side has more room and let the card scroll.
          const roomAbove = anchor.top - GAP - EDGE
          const roomBelow = view.height - EDGE - (anchor.bottom + GAP)
          if (roomAbove > roomBelow) { side = 'above'; top = EDGE; return { left, top, side, maxHeight: Math.max(48, roomAbove) } }
          return { left, top, side, maxHeight: Math.max(48, roomBelow) }
        }
      }
      return { left, top, side, maxHeight: null }
    }

    /**
     * @param {Window} win
     * @param {{ t?: (key: string, params?: object) => string, subscribe?: (fn: () => void) => () => void }} [i18n]
     */
    function install(win, i18n = {}) {
      const doc = win.document
      const t = i18n.t || fallbackT
      const owners = new WeakMap()   // reference sup → li
      const uses = new WeakMap()     // li → its reference sups in document order
      const reduceMotion = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches

      const style = doc.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      doc.head.appendChild(style)

      const tip = doc.createElement('div')
      tip.id = TIP_ID
      tip.setAttribute('role', 'tooltip')
      tip.hidden = true
      doc.body.appendChild(tip)

      const backButton = doc.createElement('button')
      backButton.id = BACK_ID
      backButton.type = 'button'
      backButton.hidden = true
      doc.body.appendChild(backButton)

      let current = null        // what the card belongs to: a reference sup, or a back-reference anchor (hint)
      let showTimer = 0
      let hideTimer = 0
      let markTimer = 0
      let marked = null
      let lastPointer = 'mouse'
      let openAtDown = null     // the number whose card was already open when the finger went down
      let trip = null           // { from: reference sup, to: li } after a jump to a footnote

      // ---------- decoration ----------
      function labelReference(sup) { sup.setAttribute('aria-label', t('label', { n: sup.textContent.trim() })) }
      function labelBack(sup, k, only) {
        sup.setAttribute('aria-label', only ? t('backToOnly') : t('backTo', { k }))
      }

      /** Back-reference numbers of a footnote item, in order: [{ el, k }]. Adds the `1` when the item has repeats. */
      function decorateItem(li) {
        if (!li.hasAttribute(LI_ATTR)) { li.setAttribute(LI_ATTR, ''); li.tabIndex = -1 }
        const repeats = Array.from(li.querySelectorAll('sup')).filter((s) => !s.hasAttribute(NUM_ATTR) && isBackNumber(s))
        const ours = li.querySelector(`sup[${NUM_ATTR}]`)
        if (repeats.length === 0) { ours?.remove(); return }
        if (!ours) {
          // The first ↩ must end its own text node; never split or move the renderer's nodes.
          const first = arrowNodes(li, doc)[0]
          if (first && /↩\s*$/.test(first.nodeValue) && first.parentNode) {
            const one = doc.createElement('sup')
            one.setAttribute(NUM_ATTR, '')
            one.textContent = '1'
            first.parentNode.insertBefore(one, first.nextSibling)
          }
        }
        const numbers = Array.from(li.querySelectorAll('sup')).filter(isBackNumber)
        numbers.forEach((sup, i) => {
          const k = i + 1
          if (sup.getAttribute(BACK_ATTR) !== String(k)) {
            sup.setAttribute(BACK_ATTR, String(k))
            sup.setAttribute('role', 'link')
            sup.tabIndex = 0
          }
          labelBack(sup, k, false)
        })
      }

      function decorate() {
        const byItem = new Map()
        for (const [sup, li] of pairFootnotes(doc)) {
          owners.set(sup, li)
          if (!byItem.has(li)) byItem.set(li, [])
          byItem.get(li).push(sup)
          if (!sup.hasAttribute(ATTR)) {
            sup.setAttribute(ATTR, '')
            sup.tabIndex = 0
            sup.setAttribute('role', 'link')
            labelReference(sup)
          }
        }
        for (const [li, sups] of byItem) { uses.set(li, sups); decorateItem(li) }
      }

      function relabel() {
        for (const sup of doc.querySelectorAll(`sup[${ATTR}]`)) labelReference(sup)
        for (const sup of doc.querySelectorAll(`sup[${BACK_ATTR}]`)) labelBack(sup, Number(sup.getAttribute(BACK_ATTR)), false)
        if (!backButton.hidden) fillBackButton()
        if (current instanceof win.Element && !tip.hidden && tip.dataset.kind === 'card') show(current)
      }

      // ---------- card and hint ----------
      function position(anchorRect) {
        tip.style.maxHeight = ''
        // Measure at the corner: left where it last was, a fixed card shrinks to the room on its right.
        tip.style.left = '0px'
        tip.style.top = '0px'
        const r = tip.getBoundingClientRect()
        const view = { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight }
        const spot = placeCard(anchorRect, { width: r.width, height: r.height }, view)
        tip.style.left = `${Math.round(spot.left)}px`
        tip.style.top = `${Math.round(spot.top)}px`
        if (spot.maxHeight !== null) tip.style.maxHeight = `${Math.floor(spot.maxHeight)}px`
        tip.dataset.side = spot.side
      }

      function release() {
        if (current instanceof win.Element) {
          current.setAttribute('aria-expanded', 'false')
          current.removeAttribute('aria-describedby')
        }
      }

      function show(sup) {
        const li = owners.get(sup)
        if (!li || !sup.isConnected) return
        win.clearTimeout(hideTimer)
        win.clearTimeout(showTimer)
        if (current !== sup) release()
        current = sup
        {
          const label = doc.createElement('span')
          label.className = 'fn-hover-label'
          label.textContent = t('label', { n: sup.textContent.trim() })
          const go = doc.createElement('div')
          go.className = 'fn-hover-go'
          const button = doc.createElement('button')
          button.type = 'button'
          button.tabIndex = -1 // keyboard users press Enter on the number itself
          button.dataset.fnGo = ''
          button.innerHTML = `<span>${escapeHtml(t('goTo'))}</span>${ICON_DOWN}`
          go.appendChild(button)
          tip.replaceChildren(label, cardContent(li, doc), go)
        }
        tip.dataset.kind = 'card'
        tip.hidden = false
        sup.setAttribute('aria-expanded', 'true')
        sup.setAttribute('aria-describedby', TIP_ID)
        position(sup.getBoundingClientRect())
      }

      /** A one-line hint over a back-reference mark: where it goes. */
      function showHint(anchorRect, text, key) {
        win.clearTimeout(hideTimer)
        win.clearTimeout(showTimer)
        release()
        current = key
        tip.replaceChildren(doc.createTextNode(text))
        tip.dataset.kind = 'hint'
        tip.hidden = false
        position(anchorRect)
      }

      function hide() {
        win.clearTimeout(hideTimer)
        win.clearTimeout(showTimer)
        release()
        current = null
        tip.hidden = true
        tip.replaceChildren()
      }

      function hideSoon() {
        win.clearTimeout(showTimer)
        win.clearTimeout(hideTimer)
        hideTimer = win.setTimeout(hide, HIDE_DELAY)
      }

      function showSoon(sup) {
        win.clearTimeout(hideTimer)
        if (current === sup && !tip.hidden) return
        win.clearTimeout(showTimer)
        // A card already open moves straight to the next number; otherwise wait for the pointer to rest.
        if (!tip.hidden && tip.dataset.kind === 'card') return show(sup)
        showTimer = win.setTimeout(() => show(sup), SHOW_DELAY)
      }

      // ---------- jumps ----------
      function mark(el) {
        if (marked) marked.removeAttribute(MARK_ATTR)
        win.clearTimeout(markTimer)
        marked = el
        el.setAttribute(MARK_ATTR, '')
        markTimer = win.setTimeout(() => { el.removeAttribute(MARK_ATTR); if (marked === el) marked = null }, MARK_TIME)
      }

      function land(el) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' })
        mark(el)
        el.focus({ preventScroll: true })
      }

      function jumpToFootnote(sup) {
        const li = owners.get(sup)
        if (!li) return
        hide()
        trip = { from: sup, to: li }
        land(li)
        showBackButton()
      }

      function jumpBack(target) {
        hide()
        hideBackButton()
        if (target && target.isConnected) land(target)
      }

      /** Which use of a footnote a back-reference points to (k counts from 1). */
      function useOf(li, k) {
        const list = (uses.get(li) || []).filter((s) => s.isConnected)
        return list[k - 1] || list[0] || null
      }

      // ---------- back button ----------
      function fillBackButton() {
        backButton.innerHTML = `${ICON_BACK}<span>${escapeHtml(t('backToText'))}</span>`
        backButton.setAttribute('aria-label', trip ? t('backTo', { k: indexOfUse(trip.from) }) : t('backToText'))
      }

      function indexOfUse(sup) {
        const li = owners.get(sup)
        const list = li ? uses.get(li) || [] : []
        return Math.max(1, list.indexOf(sup) + 1)
      }

      function showBackButton() {
        fillBackButton()
        backButton.hidden = false
        placeBackButton()
      }

      /** Rectangles of the text around a footnote item: the button must not cover any of them. */
      function textRects(li) {
        const rects = []
        for (const el of [li.previousElementSibling, li, li.nextElementSibling]) {
          if (!el) continue
          // Text and small inline pictures only: block boxes span the whole width and would block every spot.
          const walker = doc.createTreeWalker(el, 4 /* SHOW_TEXT */)
          while (walker.nextNode()) {
            if (!walker.currentNode.nodeValue.trim()) continue
            const range = doc.createRange()
            range.selectNodeContents(walker.currentNode)
            for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r)
          }
          for (const pic of el.querySelectorAll('svg, img')) {
            const r = pic.getBoundingClientRect()
            if (r.width > 0 && r.height > 0) rects.push(r)
          }
        }
        return rects
      }

      function placeBackButton() {
        if (backButton.hidden || !trip) return
        if (!trip.to.isConnected || !(trip.from && trip.from.isConnected)) return hideBackButton()
        const li = trip.to.getBoundingClientRect()
        const view = { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight }
        if (li.bottom < 0 || li.top > view.height) { backButton.style.visibility = 'hidden'; return }
        backButton.style.visibility = ''
        backButton.style.left = '0px'
        backButton.style.top = '0px'
        const b = backButton.getBoundingClientRect()
        const rects = textRects(trip.to)
        const clear = (x, y) => x >= EDGE && y >= EDGE && x + b.width <= view.width - EDGE && y + b.height <= view.height - EDGE &&
          rects.every((r) => x + b.width + 4 <= r.left || x - 4 >= r.right || y + b.height + 2 <= r.top || y - 2 >= r.bottom)
        const own = rects.filter((r) => r.top >= li.top - 1 && r.bottom <= li.bottom + 1).sort((a, b) => a.top - b.top || a.left - b.left)
        const firstLine = own[0] || li
        const lastTop = own.length ? own[own.length - 1].top : li.top
        const lastRow = own.filter((r) => Math.abs(r.top - lastTop) < 4)
        const lastLine = lastRow.length ? { top: Math.min(...lastRow.map((r) => r.top)), height: Math.max(...lastRow.map((r) => r.height)), right: Math.max(...lastRow.map((r) => r.right)) } : li
        const right = Math.min(li.right, view.width - EDGE) - b.width - 4
        // Prefer the free end of the item's own lines, then just past its last word, then below or above it.
        const spots = [
          [right, firstLine.top + (firstLine.height - b.height) / 2],
          [right, lastLine.top + (lastLine.height - b.height) / 2],
          [lastLine.right + 12, lastLine.top + (lastLine.height - b.height) / 2],
          [li.left, li.bottom + GAP],
          [li.left, li.top - GAP - b.height]
        ]
        let spot = spots.find(([x, y]) => clear(x, y))
        if (!spot) {
          const [x, y] = spots[3]
          spot = [Math.max(EDGE, Math.min(x, view.width - EDGE - b.width)), Math.max(EDGE, Math.min(y, view.height - EDGE - b.height))]
        }
        backButton.style.left = `${Math.round(spot[0])}px`
        backButton.style.top = `${Math.round(spot[1])}px`
      }

      function hideBackButton() {
        backButton.hidden = true
        trip = null
      }

      // ---------- back-reference hit testing ----------
      /** The back-reference under a point inside a footnote item: { k, rect } or null. */
      function backrefAt(li, x, y) {
        let k = 0
        const pad = 3
        for (const node of arrowNodes(li, doc)) {
          const text = node.nodeValue
          for (let i = text.indexOf(ARROW); i >= 0; i = text.indexOf(ARROW, i + 1)) {
            k++
            const range = doc.createRange()
            range.setStart(node, i)
            range.setEnd(node, i + ARROW.length)
            const r = range.getBoundingClientRect()
            if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return { k, rect: r }
          }
        }
        return null
      }

      const supOf = (target) => (target instanceof win.Element ? target.closest(`sup[${ATTR}]`) : null)
      const backSupOf = (target) => (target instanceof win.Element ? target.closest(`sup[${BACK_ATTR}]`) : null)
      const itemOf = (target) => (target instanceof win.Element ? target.closest(`li[${LI_ATTR}]`) : null)
      const backLabel = (li, k) => ((uses.get(li) || []).length > 1 ? t('backTo', { k }) : t('backToOnly'))

      // ---------- events ----------
      const listeners = [
        ['pointerdown', (e) => {
          lastPointer = e.pointerType || 'mouse'
          const sup = supOf(e.target)
          openAtDown = sup && current === sup && !tip.hidden ? sup : null
        }],
        ['pointerover', (e) => {
          if (e.pointerType === 'touch') return
          const sup = supOf(e.target)
          if (sup) return showSoon(sup)
          const back = backSupOf(e.target)
          if (back) {
            const li = itemOf(back)
            return showHint(back.getBoundingClientRect(), backLabel(li, Number(back.getAttribute(BACK_ATTR))), back)
          }
          if (tip.contains(e.target)) win.clearTimeout(hideTimer)
        }],
        ['pointerout', (e) => {
          if (e.pointerType === 'touch') return
          const from = supOf(e.target) || backSupOf(e.target) || (tip.contains(e.target) ? tip : null)
          if (!from) return
          const to = e.relatedTarget
          if (to && (tip.contains(to) || (current instanceof win.Element && current.contains(to)))) return
          if (tip.dataset.kind === 'hint') return hide()
          hideSoon()
        }],
        ['pointermove', (e) => {
          if (e.pointerType === 'touch') return
          const li = itemOf(e.target)
          if (!li || backSupOf(e.target)) return
          const hit = backrefAt(li, e.clientX, e.clientY)
          if (hit) {
            li.setAttribute('data-fn-hot', '')
            const key = `${hit.k}@${Math.round(hit.rect.left)},${Math.round(hit.rect.top)}`
            if (current !== key) showHint(hit.rect, backLabel(li, hit.k), key)
          } else {
            li.removeAttribute('data-fn-hot')
            if (typeof current === 'string') hide()
          }
        }],
        ['focusin', (e) => {
          const sup = supOf(e.target)
          if (sup) return show(sup)
          const back = backSupOf(e.target)
          if (back) showHint(back.getBoundingClientRect(), backLabel(itemOf(back), Number(back.getAttribute(BACK_ATTR))), back)
        }],
        ['focusout', (e) => {
          const to = e.relatedTarget
          if (to && (tip.contains(to) || (current instanceof win.Element && current.contains(to)))) return
          if (supOf(e.target) || backSupOf(e.target) || tip.contains(e.target)) hideSoon()
        }],
        ['click', (e) => {
          if (e.target instanceof win.Element && e.target.closest('[data-fn-go]')) {
            e.preventDefault()
            const sup = current instanceof win.Element ? current : null
            if (sup) jumpToFootnote(sup)
            return
          }
          if (backButton.contains(e.target)) { e.preventDefault(); return jumpBack(trip && trip.from) }
          const sup = supOf(e.target)
          if (sup) {
            e.preventDefault()
            // Touch has no hover: the first tap previews, a tap on the open card's number jumps.
            if (lastPointer === 'touch' && openAtDown !== sup) return show(sup)
            return jumpToFootnote(sup)
          }
          const back = backSupOf(e.target)
          if (back) { e.preventDefault(); return jumpBack(useOf(itemOf(back), Number(back.getAttribute(BACK_ATTR)))) }
          const li = itemOf(e.target)
          if (li) {
            const hit = backrefAt(li, e.clientX, e.clientY)
            if (hit) { e.preventDefault(); return jumpBack(useOf(li, hit.k)) }
          }
          if (current && !tip.contains(e.target)) hide()
          if (!backButton.hidden && !(trip && trip.to.contains(e.target))) hideBackButton()
        }],
        ['keydown', (e) => {
          if (e.key === 'Escape') {
            if (current) {
              const back = current instanceof win.Element ? current : null
              hide()
              if (back && (doc.activeElement === back || tip.contains(doc.activeElement))) back.focus()
              return
            }
            if (!backButton.hidden) hideBackButton()
            return
          }
          if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Backspace') return
          const sup = supOf(e.target)
          if (sup && e.key === 'Enter') { e.preventDefault(); return jumpToFootnote(sup) }
          const back = backSupOf(e.target)
          if (back && e.key === 'Enter') { e.preventDefault(); return jumpBack(useOf(itemOf(back), Number(back.getAttribute(BACK_ATTR)))) }
          // On the footnote item a jump landed on: Enter or Backspace goes back.
          if (trip && e.target === trip.to && (e.key === 'Enter' || e.key === 'Backspace')) { e.preventDefault(); jumpBack(trip.from) }
        }]
      ]
      for (const [type, fn] of listeners) doc.addEventListener(type, fn, true)
      const onMove = () => {
        if (current) hide()
        placeBackButton()
      }
      win.addEventListener('scroll', onMove, true)
      win.addEventListener('resize', onMove)
      const unsubscribe = typeof i18n.subscribe === 'function' ? i18n.subscribe(relabel) : null

      // Markdown is rendered (and re-rendered while it streams) after load.
      let frame = 0
      const ownNode = (n) => tip.contains(n) || n === tip || backButton.contains(n) || n === backButton
      const observer = new win.MutationObserver((records) => {
        if (records.every((r) => ownNode(r.target) || (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every((n) => n.nodeType === 1 && n.hasAttribute?.(NUM_ATTR))))) return
        if (frame) return
        frame = win.requestAnimationFrame(() => {
          frame = 0
          decorate()
          if (current instanceof win.Element && !current.isConnected) hide()
          placeBackButton()
        })
      })
      observer.observe(doc.body, { childList: true, subtree: true, characterData: true })
      decorate()

      return () => {
        observer.disconnect()
        if (frame) win.cancelAnimationFrame(frame)
        for (const id of [hideTimer, showTimer, markTimer]) win.clearTimeout(id)
        unsubscribe?.()
        for (const [type, fn] of listeners) doc.removeEventListener(type, fn, true)
        win.removeEventListener('scroll', onMove, true)
        win.removeEventListener('resize', onMove)
        for (const el of doc.querySelectorAll(`sup[${NUM_ATTR}]`)) el.remove()
        for (const el of doc.querySelectorAll(`sup[${ATTR}],sup[${BACK_ATTR}]`)) {
          for (const a of [ATTR, BACK_ATTR, 'tabindex', 'role', 'aria-label', 'aria-expanded', 'aria-describedby']) el.removeAttribute(a)
        }
        for (const el of doc.querySelectorAll(`li[${LI_ATTR}]`)) {
          for (const a of [LI_ATTR, 'tabindex', 'data-fn-hot']) el.removeAttribute(a)
        }
        for (const el of doc.querySelectorAll(`[${MARK_ATTR}]`)) el.removeAttribute(MARK_ATTR)
        tip.remove()
        backButton.remove()
        style.remove()
      }
    }

    function escapeHtml(text) {
      return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
    }

    return {
      inject: ['locale'],
      apply(ctx) {
        if (typeof window === 'undefined' || !window.document) return
        const locale = ctx.locale
        let i18n = {}
        if (locale && typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, { en, zh, ko }), 'footnote-hover: dictionaries')
          const bound = locale.bind(NS)
          i18n = { t: bound, subscribe: typeof locale.subscribe === 'function' ? (fn) => locale.subscribe(fn) : undefined }
        }
        ctx.effect(() => install(window, i18n), 'footnote-hover: hover cards and jumps')
      },
      // For tests only.
      internals: { pairFootnotes, cardContent, placeCard, install, dictionaries: { en, ko, zh } }
    }
  }
})
