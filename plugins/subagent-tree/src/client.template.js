// DSH 사이드바 하위 에이전트 나무 보기의 화면 쪽 번들.
// 이 파일(lib/client.js)은 scripts/build.mjs가 src/client.template.js·src/tree.js·src/style.css로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-subagent-tree',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const VERSION = __VERSION__
    const STYLE_TEXT = __CSS__

    __TREE__

    const STATE_LABEL = { running: '실행 중', done: '끝남', stopped: '중단됨', idle: '대기' }
    const REFRESH_GAP_MS = 5000

    // 아이콘은 직접 그린다(14px, 선 1.5). 앱 아이콘 모듈에 기대지 않아 DSH가 바뀌어도 그대로 보인다.
    const PATHS = {
      tree: ['M2.75 2.75h4.5v3.5h-4.5z', 'M5 6.25v6a1 1 0 0 0 1 1h3.25', 'M5 9.25h4.25', 'M9.25 7.5h4v3.5h-4z', 'M9.25 11.5h4v3.5h-4z'],
      chevron: ['M4 6l4 4 4-4'],
      done: ['M3.5 8.5l3 3 6-7'],
      stopped: ['M6 4.5v7', 'M10 4.5v7'],
      idle: ['M8 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'],
      running: ['M8 2.5a5.5 5.5 0 1 0 5.5 5.5'],
    }
    function Icon({ name, spin }) {
      return h('svg', {
        className: spin ? 'dst-icon dst-spin' : 'dst-icon', width: 14, height: 14, viewBox: '0 0 16 16',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: false,
      }, PATHS[name].map((d, i) => h('path', { key: i, d })))
    }

    // 접고 펼친 상태는 이 화면에만 둔다. 기본은 펼침.
    function createExpandStore() {
      const collapsed = new Set()
      const listeners = new Set()
      return {
        isOpen: id => !collapsed.has(id),
        toggle(id) {
          if (collapsed.has(id)) collapsed.delete(id)
          else collapsed.add(id)
          listeners.forEach(fn => fn())
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
      }
    }

    function sameRows(a, b) {
      if (a.length !== b.length) return false
      return a.every((row, i) => row.id === b[i].id && row.title === b[i].title && row.state === b[i].state && row.current === b[i].current)
    }

    function createModel(ctx) {
      const lastRefresh = new Map()
      const cache = new Map()
      function refresh(sessionId, force) {
        const now = Date.now()
        if (!force && now - (lastRefresh.get(sessionId) ?? 0) < REFRESH_GAP_MS) return
        lastRefresh.set(sessionId, now)
        Promise.resolve(ctx.sessions.refreshProjections(sessionId)).catch(() => {})
      }
      function rowsOf(sessionId) {
        const list = ctx.sessions.list.getSnapshot()
        const next = childRows(list, sessionId).map(row => ({
          ...row, current: (list.byId?.[row.id]?.retainedBy?.mainView ?? 0) > 0,
        }))
        const prev = cache.get(sessionId)
        if (prev !== undefined && sameRows(prev, next)) return prev
        cache.set(sessionId, next)
        return next
      }
      function useRows(sessionId) {
        const rows = React.useSyncExternalStore(ctx.sessions.list.subscribe, () => rowsOf(sessionId))
        const running = React.useSyncExternalStore(ctx.sessions.list.subscribe,
          () => ctx.sessions.list.getSnapshot().byId?.[sessionId]?.running === true)
        React.useEffect(() => {
          if (needsCatalog(ctx.sessions.list.getSnapshot(), sessionId) || running || rows.length > 0) refresh(sessionId, false)
        }, [sessionId, running])
        return rows
      }
      function open(row) {
        ctx.uiWorkspace.openSession(row.address)
      }
      return { useRows, refresh, open }
    }

    function KidButton({ row, onOpen, inHover, last }) {
      return h('button', {
        type: 'button', className: 'dst-kid', 'aria-current': row.current ? 'page' : undefined,
        title: row.title, 'aria-label': `${row.title}, ${STATE_LABEL[row.state]}`,
        onClick: (event) => { event.stopPropagation(); onOpen(row) },
      },
      inHover ? null : h('span', { className: 'dst-line', 'data-last': last ? '' : undefined, 'aria-hidden': true }),
      h('span', { className: 'dst-state', 'data-state': row.state },
        h(Icon, { name: row.state, spin: row.state === 'running' })),
      h('span', { className: 'dst-title' }, row.title),
      inHover ? h('span', { className: 'dst-hover-state', 'aria-hidden': true }, STATE_LABEL[row.state]) : null)
    }

    // 세션 줄(DSH 화면의 div[data-row-key="session:<id>"]) 바로 뒤에 자식 줄 상자를 붙인다.
    // 공식 자리가 아니므로 줄을 못 찾으면 아무것도 그리지 않는다.
    let warned = false
    function useRowSibling(anchorRef, sessionId, enabled) {
      const [box, setBox] = React.useState(null)
      React.useLayoutEffect(() => {
        if (!enabled) return undefined
        const row = anchorRef.current?.closest(`[data-row-key="session:${CSS_ESCAPE(sessionId)}"]`)
        const parent = row?.parentElement
        if (!row || !parent) {
          if (!warned) { warned = true; console.warn('[dsh-subagent-tree] 세션 줄을 찾지 못해 자식 줄을 그리지 않습니다. DSH 화면 구조가 바뀌었을 수 있습니다.') }
          return undefined
        }
        const el = document.createElement('div')
        el.className = 'dst-kids'
        el.dataset.dstFor = sessionId
        // 연결선은 부모 제목 첫 글자 밑에서 시작한다. 제목은 줄의 두 번째 요소(상태 칸 다음)다.
        const place = () => {
          if (row.nextSibling !== el && row.parentElement) row.after(el)
          const inset = parseFloat(getComputedStyle(row).borderInlineStartWidth || '0') || 0
          const title = row.children[1]
          const titleLeft = title ? title.getBoundingClientRect().left - row.getBoundingClientRect().left : 30
          el.style.setProperty('--dst-inset', `${inset}px`)
          el.style.setProperty('--dst-title-left', `${Math.round(titleLeft)}px`)
        }
        place()
        const watch = new MutationObserver(() => { if (row.nextSibling !== el) place() })
        watch.observe(parent, { childList: true })
        setBox(el)
        return () => { watch.disconnect(); el.remove(); setBox(null) }
      }, [sessionId, enabled])
      return box
    }
    const CSS_ESCAPE = value => (window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"'))

    return {
      inject: ['sessions', 'uiWorkspace', 'slots'],
      apply(ctx, config = {}) {
        const nested = config.nestedRows !== false
        const model = createModel(ctx)
        const expand = createExpandStore()
        const useOpen = id => React.useSyncExternalStore(expand.subscribe, () => expand.isOpen(id))

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-subagent-tree'
          tag.dataset.version = VERSION
          tag.textContent = STYLE_TEXT
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'dsh-subagent-tree: styles')

        // ① 줄 끝 아이콘(공식 자리) + ③ 자식 줄을 붙일 기준점.
        function Trailing({ sessionId }) {
          const rows = model.useRows(sessionId)
          const isOpen = useOpen(sessionId)
          const anchor = React.useRef(null)
          const box = useRowSibling(anchor, sessionId, nested && rows.length > 0)
          if (rows.length === 0) return null
          const running = rows.filter(row => row.state === 'running').length
          const label = running > 0 ? `하위 에이전트 ${rows.length}개, ${running}개 실행 중` : `하위 에이전트 ${rows.length}개`
          return h(React.Fragment, null,
            h('span', { ref: anchor, className: 'dst-count', 'data-running': running > 0 ? '' : undefined, role: 'img', 'aria-label': label, title: label },
              h(Icon, { name: 'tree' }), String(rows.length)),
            box && isOpen
              ? ReactDOM.createPortal(h('div', { role: 'group', 'aria-label': label },
                rows.map((row, i) => h(KidButton, { key: row.id, row, onOpen: model.open, last: i === rows.length - 1 }))), box)
              : null)
        }

        // ② 마우스를 올렸을 때 뜨는 카드(공식 자리).
        function Hover({ sessionId }) {
          React.useEffect(() => { model.refresh(sessionId, true) }, [sessionId])
          const rows = model.useRows(sessionId)
          if (rows.length === 0) return null
          return h('div', { className: 'dst-hover' },
            h('div', { className: 'dst-hover-head' }, `하위 에이전트 ${rows.length}개`),
            rows.map(row => h(KidButton, { key: row.id, row, onOpen: model.open, inHover: true })))
        }

        // ③을 접고 펴는 버튼. 줄에 마우스를 올리면 나오는 버튼 줄(공식 자리)에 둔다.
        function Toggle({ sessionId }) {
          const rows = model.useRows(sessionId)
          const isOpen = useOpen(sessionId)
          if (!nested || rows.length === 0) return null
          return h('button', {
            type: 'button', className: 'dst-toggle', 'aria-expanded': isOpen,
            'aria-label': isOpen ? '하위 에이전트 접기' : '하위 에이전트 펼치기',
            title: isOpen ? '하위 에이전트 접기' : '하위 에이전트 펼치기',
            onClick: () => expand.toggle(sessionId),
          }, h(Icon, { name: 'chevron' }))
        }

        ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register(
          { name: 'sidebar.session.row.trailing', id: 'dsh-subagent-tree', order: 50 }, Trailing))
        ctx.slots.inject('sidebar.session.row.hover', () => ctx.slots.register(
          { name: 'sidebar.session.row.hover', id: 'dsh-subagent-tree', order: 50 }, Hover))
        ctx.slots.inject('sidebar.workspaces.session.row.action', () => ctx.slots.register(
          { name: 'sidebar.workspaces.session.row.action', id: 'dsh-subagent-tree', order: -10 }, Toggle))
      },
    }
  },
})
