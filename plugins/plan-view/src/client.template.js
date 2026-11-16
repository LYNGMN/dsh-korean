// DSH 대화 보기 "계획" 탭과 채팅 머리 진행 칩의 화면 쪽 번들.
// 이 파일(lib/client.js)은 scripts/build.mjs가 src/client.template.js·src/*.js·src/style.css로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-plan-view',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useRef, useId } = React
    const VERSION = __VERSION__
    const STYLE_TEXT = __CSS__

    __PURE__

    const NO_KEYS = new Set()
    const HIGHLIGHT_MS = 2500

    // ── 실시간 훅 ─────────────────────────────────────────────

    // 1초마다 지금 시각. active일 때만 돈다.
    function useNow(active) {
      const [now, setNow] = useState(() => Date.now())
      useEffect(() => {
        if (!active) return undefined
        setNow(Date.now())
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [active])
      return now
    }

    // 실시간 갱신에서 완료로 바뀐 항목·새 항목을 잠깐 표시하고, 화면 읽기용 알림 문장을 만든다.
    // 처음 그릴 때는 아무것도 표시하지 않는다.
    function useTransitions(items) {
      const seen = useRef(null)
      const timer = useRef(undefined)
      const [state, setState] = useState({ done: NO_KEYS, added: NO_KEYS, message: '' })
      const signature = items.map(item => `${item.status}\u0000${item.content}`).join('\u0001')
      useEffect(() => {
        const prev = seen.current
        const next = new Map(items.map(item => [item.content, item.status]))
        seen.current = next
        if (prev === null) return
        const done = []
        const added = []
        const started = []
        for (const [content, status] of next) {
          const before = prev.get(content)
          if (before === undefined) added.push(content)
          if (status === 'completed' && before !== undefined && before !== 'completed') done.push(content)
          if (status === 'in_progress' && before !== 'in_progress') started.push(content)
        }
        if (done.length + added.length + started.length === 0) return
        const message = [...done.map(c => `'${c}' 완료`), ...started.map(c => `'${c}' 시작`)].join(', ')
        setState({ done: new Set(done), added: new Set(added), message })
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setState(s => ({ ...s, done: NO_KEYS, added: NO_KEYS })), HIGHLIGHT_MS)
      }, [signature])
      useEffect(() => () => clearTimeout(timer.current), [])
      return state
    }

    // ── 작은 부품 ─────────────────────────────────────────────

    function svg(props, ...children) {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false, ...props }, ...children)
    }

    // 대기 = 빈 원, 진행 중 = 도는 호, 완료 = 채운 원 안의 체크.
    function TodoIcon({ status, live }) {
      if (status === 'completed') {
        return svg({ className: 'dpv-icon', 'data-status': status },
          h('circle', { cx: 8, cy: 8, r: 7, className: 'dpv-icon-fill' }),
          h('path', { d: 'M4.75 8.25l2.25 2.25 4.25-4.5', className: 'dpv-icon-check', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }))
      }
      if (status === 'in_progress') {
        return svg({ className: 'dpv-icon', 'data-status': status },
          h('circle', { cx: 8, cy: 8, r: 6.25, className: 'dpv-icon-track', strokeWidth: 1.5 }),
          h('path', { d: 'M8 1.75a6.25 6.25 0 0 1 6.25 6.25', className: live ? 'dpv-icon-arc dpv-spin' : 'dpv-icon-arc', strokeWidth: 1.5, strokeLinecap: 'round' }))
      }
      return svg({ className: 'dpv-icon', 'data-status': 'pending' },
        h('circle', { cx: 8, cy: 8, r: 6.25, className: 'dpv-icon-ring', strokeWidth: 1.5 }))
    }

    function Chevron() {
      return svg({ className: 'dpv-chevron', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M6 4l4 4-4 4' }))
    }

    function ProgressBar({ done, total }) {
      const ratio = total === 0 ? 0 : done / total
      return h('div', {
        className: 'dpv-progress', role: 'progressbar', 'aria-label': '할 일 진행',
        'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, 'aria-valuetext': `${total}개 중 ${done}개 완료`,
      }, h('span', { className: 'dpv-progress-fill', style: { width: `${Math.round(ratio * 1000) / 10}%` } }))
    }

    // ── 계획 문서 마크다운 ─────────────────────────────────────
    // 문서에서 가장 얕은 제목을 h3로 맞춘다(탭 제목 h2 아래). 체크 항목은 할 일과 같은 아이콘으로 그린다.

    function renderInline(nodes, key = 'i') {
      return nodes.map((node, n) => {
        const k = `${key}.${n}`
        if (node.type === 'text') return node.value
        if (node.type === 'break') return h('br', { key: k })
        if (node.type === 'code') return h('code', { key: k, className: 'dpv-md-code' }, node.value)
        if (node.type === 'link') {
          return h('a', { key: k, className: 'dpv-md-link', href: node.href, target: '_blank', rel: 'noopener noreferrer' }, renderInline(node.children, k))
        }
        const tag = node.type === 'strong' ? 'strong' : node.type === 'em' ? 'em' : 'del'
        return h(tag, { key: k }, renderInline(node.children, k))
      })
    }

    function renderListItem(item, k, shift) {
      const body = renderBlocks(item.children, k, shift)
      if (item.checked === null) return h('li', { key: k, className: 'dpv-md-li' }, body)
      const status = item.checked ? 'completed' : 'pending'
      return h('li', { key: k, className: 'dpv-md-li dpv-md-task', 'data-status': status },
        h(TodoIcon, { status }),
        h('span', { className: 'dpv-sr' }, item.checked ? '완료: ' : '대기: '),
        h('div', { className: 'dpv-md-task-body' }, body))
    }

    function renderBlock(block, k, shift) {
      switch (block.type) {
        case 'heading': {
          const level = Math.min(Math.max(block.level + shift, 3), 6)
          return h(`h${level}`, { key: k, className: `dpv-md-h dpv-md-h${Math.min(block.level, 4)}` }, renderInline(block.children, k))
        }
        case 'paragraph': return h('p', { key: k, className: 'dpv-md-p' }, renderInline(block.children, k))
        case 'rule': return h('hr', { key: k, className: 'dpv-md-rule' })
        case 'quote': return h('blockquote', { key: k, className: 'dpv-md-quote' }, renderBlocks(block.children, k, shift))
        case 'code':
          return h('pre', { key: k, className: 'dpv-md-pre', tabIndex: 0, 'aria-label': block.lang ? `${block.lang} 코드` : '코드' },
            h('code', null, block.text))
        case 'list': {
          const task = block.items.some(item => item.checked !== null)
          const props = { key: k, className: task ? 'dpv-md-list dpv-md-tasks' : 'dpv-md-list' }
          if (block.ordered && block.start !== 1) props.start = block.start
          return h(block.ordered ? 'ol' : 'ul', props, block.items.map((item, n) => renderListItem(item, `${k}.${n}`, shift)))
        }
        case 'table':
          return h('div', { key: k, className: 'dpv-md-table-wrap', tabIndex: 0, role: 'region', 'aria-label': '표' },
            h('table', { className: 'dpv-md-table' },
              h('thead', null, h('tr', null, block.head.map((cell, c) =>
                h('th', { key: c, scope: 'col', style: block.align[c] ? { textAlign: block.align[c] } : undefined }, renderInline(cell, `${k}h${c}`))))),
              h('tbody', null, block.rows.map((row, r) => h('tr', { key: r }, row.map((cell, c) =>
                h('td', { key: c, style: block.align[c] ? { textAlign: block.align[c] } : undefined }, renderInline(cell, `${k}r${r}c${c}`))))))))
        default: return null
      }
    }

    function renderBlocks(blocks, key, shift) {
      return blocks.map((block, n) => renderBlock(block, `${key}.${n}`, shift))
    }

    // 요약 줄에 이미 보이는 문서 첫 제목은 빼고 그린다.
    function Markdown({ text, title }) {
      const blocks = parseMarkdown(text)
      const first = blocks[0]
      const body = first?.type === 'heading' && plainText(first.children).trim() === String(title ?? '').trim() ? blocks.slice(1) : blocks
      const levels = body.filter(block => block.type === 'heading').map(block => block.level)
      const shift = levels.length === 0 ? 0 : 3 - Math.min(...levels)
      return h('div', { className: 'dpv-md' }, renderBlocks(body, 'b', shift))
    }

    // 항목 오른쪽 짧은 정보: 완료면 걸린 시간, 진행 중이면 경과 시간(세션이 멈췄으면 "멈춤").
    function itemMeta(item, now, running) {
      const elapsed = itemElapsed(item, now)
      if (item.status === 'completed') return elapsed === undefined ? '' : formatDuration(elapsed)
      if (item.status === 'in_progress') {
        if (!running) return '멈춤'
        return elapsed === undefined ? '' : `${formatDuration(elapsed)}째`
      }
      return ''
    }

    function TodoDetail({ id, item, now, inspectCall }) {
      const elapsed = itemElapsed(item, now)
      const callId = item.doneCallId ?? item.startCallId
      const rows = [
        ['시작', formatClock(item.startedAt)],
        ['완료', formatClock(item.completedAt)],
        ['걸린 시간', elapsed === undefined ? '' : formatDuration(elapsed)],
      ].filter(([, value]) => value !== '')
      return h('div', { className: 'dpv-detail', id },
        rows.length === 0
          ? h('p', { className: 'dpv-detail-empty' }, '아직 시작하지 않았어요.')
          : h('dl', { className: 'dpv-detail-list' }, rows.map(([term, value]) =>
            h('div', { key: term, className: 'dpv-detail-row' }, h('dt', null, term), h('dd', null, value)))),
        typeof inspectCall === 'function' && callId !== undefined
          ? h('button', { type: 'button', className: 'dpv-link', onClick: () => inspectCall(callId) }, '실행 흐름에서 보기')
          : null)
    }

    function TodoRow({ item, now, running, inspectCall, just, added, open, onToggle }) {
      const detailId = useId()
      const meta = itemMeta(item, now, running)
      const live = running && item.status === 'in_progress'
      return h('li', {
        className: 'dpv-todo', 'data-status': item.status,
        'data-just': just ? '' : undefined, 'data-added': added ? '' : undefined,
      },
      h('button', { type: 'button', className: 'dpv-todo-btn', 'aria-expanded': open, 'aria-controls': detailId, onClick: onToggle },
        h(TodoIcon, { status: item.status, live }),
        h('span', { className: 'dpv-todo-text' }, item.content, h('span', { className: 'dpv-sr' }, `, ${TODO_STATUS[item.status].label}`)),
        meta ? h('span', { className: 'dpv-todo-meta' }, meta) : null),
      open ? h(TodoDetail, { id: detailId, item, now, inspectCall }) : null)
    }

    // 펼침 없는 줄(창·지난 턴용).
    function CompactRow({ item, now, running }) {
      const meta = itemMeta(item, now, running)
      return h('li', { className: 'dpv-todo dpv-todo-compact', 'data-status': item.status },
        h(TodoIcon, { status: item.status, live: running && item.status === 'in_progress' }),
        h('span', { className: 'dpv-todo-text' }, item.content, h('span', { className: 'dpv-sr' }, `, ${TODO_STATUS[item.status].label}`)),
        meta ? h('span', { className: 'dpv-todo-meta' }, meta) : null)
    }

    // ── 계획 탭 ───────────────────────────────────────────────

    function TodoSection({ list, running, inspectCall }) {
      const items = list?.items ?? []
      const hasActive = items.some(item => item.status === 'in_progress')
      const now = useNow(running && hasActive)
      const transitions = useTransitions(items)
      const [openKey, setOpenKey] = useState(null)
      return h('section', { className: 'dpv-section', 'aria-labelledby': 'dpv-todo-title' },
        h('div', { className: 'dpv-head' },
          h('h2', { className: 'dpv-title', id: 'dpv-todo-title' }, '할 일'),
          list ? h('span', { className: 'dpv-meta' }, `${list.done}/${list.total} 완료`) : null,
          list?.carried ? h('span', { className: 'dpv-badge' }, '직전 턴 목록') : null),
        h('div', { className: 'dpv-sr', 'aria-live': 'polite' }, transitions.message),
        items.length === 0
          ? h('p', { className: 'dpv-empty' }, '아직 할 일 목록이 없어요. 에이전트가 할 일을 정하면 여기에 보여요.')
          : h('div', { className: 'dpv-card' },
            h('div', { className: 'dpv-card-head' }, h(ProgressBar, { done: list.done, total: list.total })),
            h('ul', { className: 'dpv-todos' }, items.map(item => h(TodoRow, {
              key: item.content, item, now, running, inspectCall,
              just: transitions.done.has(item.content), added: transitions.added.has(item.content),
              open: openKey === item.content,
              onToggle: () => setOpenKey(key => (key === item.content ? null : item.content)),
            })))))
    }

    function PastSection({ past }) {
      if (past.length === 0) return null
      return h('section', { className: 'dpv-section', 'aria-labelledby': 'dpv-past-title' },
        h('div', { className: 'dpv-head' },
          h('h2', { className: 'dpv-title', id: 'dpv-past-title' }, '지난 할 일'),
          h('span', { className: 'dpv-meta' }, `${past.length}턴`)),
        h('div', { className: 'dpv-plans' }, past.map(group => {
          const took = group.endedAt > group.startedAt ? ` · ${formatDuration(group.endedAt - group.startedAt)}` : ''
          return h('details', { key: group.lastSeq, className: 'dpv-card dpv-fold' },
            h('summary', null,
              h(Chevron),
              h('span', { className: 'dpv-fold-title' }, group.turn === null ? '이전 목록' : `턴 ${group.turn}`),
              h('span', { className: 'dpv-meta' }, `${group.done}/${group.total} 완료${took}`)),
            h('ul', { className: 'dpv-todos dpv-fold-body' }, group.items.map(item =>
              h(CompactRow, { key: item.content, item, now: 0, running: false }))))
        })))
    }

    // 계획 뒤 할 일 기록으로 실행 상태를 한 줄로 알린다. 문서 줄과 할 일 문구는 길이·모양이 달라
    // 짝이 드물기 때문에, 단계 체크가 적은 이유도 함께 밝힌다.
    function planNote(todos, done) {
      if (todos.length === 0) return '이 계획 뒤에 남긴 할 일 기록이 없어 실행 여부를 알 수 없어요.'
      if (done === todos.length) return `계획 뒤 할 일 ${todos.length}개를 모두 끝냈어요. 단계 체크는 문구가 거의 같은 줄에만 붙어요.`
      return `계획 뒤 할 일 ${done}/${todos.length} 완료 · 단계 체크는 문구가 거의 같은 줄에만 붙어요.`
    }

    // 계획을 실행한 턴(제출한 턴, 또는 승인 뒤 이어지는 다음 턴)의 할 일만 센다.
    // 그 뒤 턴은 새 요청이라 이 계획의 실행 기록이 아니다. 턴을 모르는 옛 기록은 거르지 않는다.
    function planWritesOf(plan, writes) {
      const list = writes ?? []
      if (plan.turn === undefined || plan.turn === null) return list
      return list.filter(write => write.turn === plan.turn || write.turn === plan.turn + 1)
    }

    function PlanItem({ plan, writes, latest, until }) {
      const todos = todosAfter(planWritesOf(plan, writes), plan.seq, until)
      const checked = checkPlanMarkdown(plan.markdown, todos)
      const done = todos.filter(todo => todo.status === 'completed').length
      const allDone = todos.length > 0 && done === todos.length
      return h('details', { className: 'dpv-card dpv-fold dpv-plan', open: latest },
        h('summary', null,
          h(Chevron),
          h('span', { className: 'dpv-fold-title', title: plan.title }, plan.title),
          !allDone && todos.length > 0
            ? h('span', { className: 'dpv-meta' }, `할 일 ${done}/${todos.length}`)
            : null,
          allDone ? h('span', { className: 'dpv-badge', 'data-done': '' }, '모두 완료') : null,
          latest ? h('span', { className: 'dpv-badge' }, '최신') : null),
        h('div', { className: 'dpv-doc' },
          h('p', { className: 'dpv-note' }, planNote(todos, done)),
          h(Markdown, { text: checked.markdown, title: plan.title })))
    }

    function PlanSection({ plans, writes }) {
      return h('section', { className: 'dpv-section', 'aria-labelledby': 'dpv-plan-title' },
        h('div', { className: 'dpv-head' },
          h('h2', { className: 'dpv-title', id: 'dpv-plan-title' }, '제출된 계획'),
          plans.length > 0 ? h('span', { className: 'dpv-meta' }, `${plans.length}개`) : null),
        plans.length === 0
          ? h('p', { className: 'dpv-empty' }, '/plan으로 계획을 만들면 여기에 보여요.')
          : h('div', { className: 'dpv-plans' }, plans.map((plan, i) =>
            h(PlanItem, {
              key: plan.callId, plan, writes, latest: i === 0,
              // 최신순이라 바로 앞 항목이 이 계획 다음에 제출된 계획이다. 그 앞까지만 실행 기록으로 본다.
              until: i === 0 ? undefined : plans[i - 1].seq,
            }))))
    }

    function PlanView({ useProjection, usePlanState, useSession, inspectCall }) {
      const state = usePlanState(s => s)
      const projection = useProjection('todos')
      const running = useSession(s => s?.running === true)
      const list = currentTodos(state.history, projection)
      return h('div', { className: 'dpv-root', 'data-plugin': 'dsh-plan-view' },
        h(TodoSection, { list, running, inspectCall }),
        h(PastSection, { past: state.history.past }),
        h(PlanSection, { plans: state.plans, writes: state.writes }))
    }

    // ── 채팅 머리 진행 칩과 창 ─────────────────────────────────

    const RING = 2 * Math.PI * 6

    function ProgressRing({ done, total, live }) {
      const ratio = total === 0 ? 0 : done / total
      return svg({ className: 'dpv-ring', 'data-live': live ? '' : undefined },
        h('circle', { cx: 8, cy: 8, r: 6, className: 'dpv-ring-track', strokeWidth: 1.5 }),
        h('circle', {
          cx: 8, cy: 8, r: 6, className: 'dpv-ring-fill', strokeWidth: 1.5, strokeLinecap: 'round',
          strokeDasharray: RING, strokeDashoffset: RING * (1 - ratio), transform: 'rotate(-90 8 8)',
        }))
    }

    const EDGE = 8

    function placePanel(button) {
      const rect = button.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - EDGE * 2)
      const left = Math.min(Math.max(EDGE, rect.right - width), window.innerWidth - EDGE - width)
      const top = rect.bottom + 6
      return { top, left, width, maxHeight: Math.max(120, window.innerHeight - top - EDGE) }
    }

    function ProgressChip({ useProjection, usePlanState, useSession }) {
      const state = usePlanState(s => s)
      const projection = useProjection('todos')
      const running = useSession(s => s?.running === true)
      const list = currentTodos(state.history, projection)
      const [open, setOpen] = useState(false)
      const [place, setPlace] = useState(null)
      const button = useRef(null)
      const panel = useRef(null)
      const panelId = useId()
      const items = list?.items ?? []
      const hasActive = items.some(item => item.status === 'in_progress')
      const now = useNow(open && running && hasActive)

      const close = (refocus) => {
        setOpen(false)
        if (refocus) button.current?.focus()
      }

      useEffect(() => {
        if (!open) return undefined
        const update = () => { if (button.current) setPlace(placePanel(button.current)) }
        update()
        panel.current?.focus()
        const onPointer = (event) => {
          if (button.current?.contains(event.target) || panel.current?.contains(event.target)) return
          close(false)
        }
        const onKey = (event) => { if (event.key === 'Escape') close(true) }
        window.addEventListener('resize', update)
        window.addEventListener('scroll', update, true)
        document.addEventListener('pointerdown', onPointer, true)
        document.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('resize', update)
          window.removeEventListener('scroll', update, true)
          document.removeEventListener('pointerdown', onPointer, true)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      if (list === null || list.total === 0) return null
      const live = running && hasActive
      const label = `계획 진행 ${list.done}/${list.total}${live ? ', 진행 중' : ''}`
      return h(React.Fragment, null,
        h('button', {
          type: 'button', ref: button, className: 'dpv-chip', 'aria-expanded': open, 'aria-controls': panelId,
          'aria-label': label, title: label, onClick: () => setOpen(value => !value),
        },
        h(ProgressRing, { done: list.done, total: list.total, live }),
        h('span', { className: 'dpv-chip-text' }, `${list.done}/${list.total}`)),
        open && place !== null
          ? ReactDOM.createPortal(h('div', {
            ref: panel, id: panelId, className: 'dpv-panel', role: 'dialog', 'aria-modal': false,
            'aria-labelledby': `${panelId}-title`, tabIndex: -1,
            style: { top: `${place.top}px`, left: `${place.left}px`, width: `${place.width}px`, maxHeight: `${place.maxHeight}px` },
            onKeyDown: (event) => { if (event.key === 'Tab') { event.preventDefault(); close(true) } },
          },
          h('div', { className: 'dpv-head' },
            h('h2', { className: 'dpv-title', id: `${panelId}-title` }, '계획 진행'),
            h('span', { className: 'dpv-meta' }, `${list.done}/${list.total} 완료`),
            list.carried ? h('span', { className: 'dpv-badge' }, '직전 턴 목록') : null),
          h(ProgressBar, { done: list.done, total: list.total }),
          h('ul', { className: 'dpv-todos dpv-panel-list' }, items.map(item =>
            h(CompactRow, { key: item.content, item, now, running }))),
          h('p', { className: 'dpv-note' }, '시각·지난 턴·계획 문서는 … 메뉴의 ‘계획’ 탭에서 볼 수 있어요.')), document.body)
          : null)
    }

    // ── 등록 ──────────────────────────────────────────────────

    return {
      // 미리보기 틀(test/preview.html)이 같은 함수로 가짜 스냅샷을 만들 때 쓴다. DSH는 읽지 않는다.
      internals: { foldTodoEvent, createViewBuilder, historyNodeOf, planNodeOf },
      inject: ['slots', 'uiConversation'],
      apply(ctx) {
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-plan-view'
          tag.dataset.version = VERSION
          tag.textContent = STYLE_TEXT
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'dsh-plan-view: styles')

        // 이 보기 전용 대상(dsh-plan-view)으로 계획 제출과 할 일 쓰기를 모은다. 채팅 쪽 카드는 그대로 둔다.
        ctx.effect(() => ctx.uiConversation.events.register({
          kind: PLAN_KIND,
          target: VIEW_ID,
          match: matchPlanEvent,
          // 실행 기록을 계획이 속한 턴과 견주려고, 제출된 턴도 함께 남긴다.
          start: (_context, match) => {
            const plan = submittedPlanOf(match.event)
            return plan === undefined ? undefined : { ...plan, turn: turnOf(match.location) }
          },
          update: context => context.state,
          buildViewNode: planNodeOf,
        }), 'dsh-plan-view: plan events')
        ctx.effect(() => ctx.uiConversation.events.register({
          kind: HISTORY_KIND,
          target: VIEW_ID,
          match: matchTodoEvent,
          start: (_context, match) => foldTodoEvent(undefined, match),
          update: (context, match) => foldTodoEvent(context.state, match),
          buildViewNode: historyNodeOf,
        }), 'dsh-plan-view: todo history')
        ctx.effect(() => ctx.uiConversation.views.register({ target: VIEW_ID, create: createViewBuilder }),
          'dsh-plan-view: view target')

        const planState = (sessionId) => {
          const target = ctx.uiConversation.binding(sessionId).target(VIEW_ID)
          return {
            getSnapshot: () => target.getSnapshot() ?? EMPTY_SNAPSHOT,
            subscribe: listener => target.subscribe(listener),
          }
        }
        const inject = sessionId => ({ hooks: { planState: planState(sessionId) } })

        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view', id: VIEW_ID, order: 20, label: () => '계획', inject,
        }, PlanView))
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities', id: VIEW_ID, order: -10, inject,
        }, ProgressChip))
      },
    }
  },
})
