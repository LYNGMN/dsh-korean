// DSH 대화 보기 "작업 단계" 탭과 채팅 머리 단계 칩의 화면 쪽 번들.
// 이 파일(lib/client.js)은 scripts/build.mjs가 src/client.template.js·src/*.js·src/style.css로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-git-stage',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useRef, useId } = React
    const VERSION = __VERSION__
    const STYLE_TEXT = __CSS__
    const VIEW_ID = 'dsh-git-stage'

    __PURE__

    // ── 세션별 Git 사실 ───────────────────────────────────────

    // 작업 폴더가 저장소 묶음(예: ~/Dev)일 때 사람이 고른 저장소. 세션마다 이 기기에 기억한다.
    const PICK_KEY = 'dsh-git-stage:repo:'
    function readPick(sessionId) {
      try { return window.localStorage.getItem(PICK_KEY + sessionId) || null } catch { return null }
    }
    function writePick(sessionId, name) {
      try {
        if (name) window.localStorage.setItem(PICK_KEY + sessionId, name)
        else window.localStorage.removeItem(PICK_KEY + sessionId)
      } catch { /* 저장이 막혀도 이번 화면에서는 고른 대로 읽는다 */ }
    }
    const memoryPicks = new Map()
    const pickOf = sessionId => (memoryPicks.has(sessionId) ? memoryPicks.get(sessionId) : readPick(sessionId))

    const sources = new Map()
    function sourceOf(sessionId) {
      let source = sources.get(sessionId)
      if (!source) {
        source = createStageSource({
          load: async () => {
            const response = await fetch(routeOf(sessionId, pickOf(sessionId)), { cache: 'no-store' })
            if (!response.ok) throw Object.assign(new Error('stage route'), { code: response.status })
            return (await response.json()).facts
          },
          every: (fn, ms) => { const timer = setInterval(fn, ms); return () => clearInterval(timer) },
          visible: () => document.visibilityState !== 'hidden',
        })
        sources.set(sessionId, source)
      }
      return source
    }

    // 사실 + 할 일 → 단계 스냅샷. 세션이 작동 중에서 멈춤으로 바뀌면 바로 다시 읽는다.
    function useStages({ sessionId, useProjection, useSession }) {
      const source = sourceOf(sessionId)
      const [state, setState] = useState(source.getSnapshot)
      useEffect(() => {
        setState(source.getSnapshot())
        return source.subscribe(() => setState(source.getSnapshot()))
      }, [source])
      const running = useSession(s => s?.running === true)
      const wasRunning = useRef(running)
      useEffect(() => {
        if (wasRunning.current && !running) void source.refresh()
        wasRunning.current = running
      }, [running])
      const todos = useProjection('todos')
      const choose = name => {
        memoryPicks.set(sessionId, name || null)
        writePick(sessionId, name || null)
        void source.reload()
      }
      return { snapshot: stagesOf(state.facts, { todos }), source: state, refresh: source.refresh, running, choose }
    }

    // 작업 폴더 이름 · 브랜치. 묶음 폴더면 저장소 이름이 상대 경로로 온다.
    function Where({ facts }) {
      if (!facts?.repo) return null
      return h('p', { className: 'dgs-where' }, `${facts.folder} · ${facts.branch ?? '브랜치 없음'}`)
    }

    // 묶음 폴더일 때만: 최근 활동을 따라갈지, 저장소 하나를 고정할지 고른다. 읽는 저장소 이름은 바로 아래 줄(Where)에 보인다.
    function RepoPicker({ within, choose }) {
      const id = useId()
      return h('div', { className: 'dgs-repo' },
        h('label', { className: 'dgs-repo-label', htmlFor: id }, `${within.folder} 안 저장소`),
        h('select', {
          id, className: 'dgs-repo-select', value: within.auto ? '' : within.picked,
          onChange: event => choose(event.target.value),
        },
        h('option', { value: '' }, '최근 활동 따라가기'),
        within.repos.map(name => h('option', { key: name, value: name }, name))))
    }

    // ── 작은 부품 ─────────────────────────────────────────────

    function svg(props, ...children) {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false, ...props }, ...children)
    }

    // 끝남 = 채운 원 안의 체크, 지금 = 고리 안 점, 남음 = 빈 고리, 기록 없음 = 점선 고리.
    function StageIcon({ status }) {
      if (status === 'done') {
        return svg({ className: 'dgs-icon', 'data-status': status },
          h('circle', { cx: 8, cy: 8, r: 7, className: 'dgs-icon-fill' }),
          h('path', { d: 'M4.75 8.25l2.25 2.25 4.25-4.5', className: 'dgs-icon-check', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }))
      }
      if (status === 'current') {
        return svg({ className: 'dgs-icon', 'data-status': status },
          h('circle', { cx: 8, cy: 8, r: 6.25, className: 'dgs-icon-ring-now', strokeWidth: 1.5 }),
          h('circle', { cx: 8, cy: 8, r: 3, className: 'dgs-icon-dot' }))
      }
      return svg({ className: 'dgs-icon', 'data-status': status },
        h('circle', { cx: 8, cy: 8, r: 6.25, className: 'dgs-icon-ring', strokeWidth: 1.5, strokeDasharray: status === 'unknown' ? '2.5 2.4' : undefined }))
    }

    function Badges({ stage }) {
      return h(React.Fragment, null,
        stage.approval ? h('span', { className: 'dgs-badge', 'data-tone': 'approval' }, '승인 필요') : null,
        stage.blocked ? h('span', { className: 'dgs-badge', 'data-tone': 'blocked' }, '로그인 필요') : null)
    }

    function StageDetail({ stage, index, id }) {
      const text = STAGE_TEXT[stage.key]
      const next = nextOf(stage)
      return h('div', { className: 'dgs-detail', id, role: 'region', 'aria-label': `${index + 1}단계 ${text.step} 자세히` },
        h('div', { className: 'dgs-detail-head' },
          h('h3', { className: 'dgs-detail-title' }, `${index + 1}. ${text.step}`),
          h('span', { className: 'dgs-status', 'data-status': stage.status }, STATUS_TEXT[stage.status]),
          h(Badges, { stage })),
        h('p', { className: 'dgs-plain' }, text.plain),
        h('ul', { className: 'dgs-facts' }, factsOf(stage).map(line => h('li', { key: line }, line))),
        next ? h('p', { className: 'dgs-next' }, h('span', { className: 'dgs-next-label' }, '다음'), h('span', { className: 'dgs-next-text' }, next)) : null)
    }

    // 6칸 단계 줄. 화살표 키로 칸을 옮기고, 누르면 아래 설명이 그 단계로 바뀐다.
    function Stepper({ snapshot, selected, onSelect, detailId }) {
      const buttons = useRef([])
      const onKey = (event, i) => {
        const last = snapshot.stages.length - 1
        const to = event.key === 'ArrowRight' ? Math.min(last, i + 1) : event.key === 'ArrowLeft' ? Math.max(0, i - 1)
          : event.key === 'Home' ? 0 : event.key === 'End' ? last : null
        if (to === null) return
        event.preventDefault()
        onSelect(to)
        buttons.current[to]?.focus()
      }
      return h('ol', { className: 'dgs-steps', 'aria-label': '작업 단계' }, snapshot.stages.map((stage, i) =>
        h('li', { key: stage.key, className: 'dgs-step', 'data-status': stage.status },
          h('button', {
            type: 'button', ref: el => { buttons.current[i] = el }, className: 'dgs-step-btn', 'data-qa-multiline': '',
            'aria-current': stage.status === 'current' ? 'step' : undefined,
            'aria-pressed': selected === i, 'aria-controls': detailId,
            tabIndex: selected === i ? 0 : -1,
            onClick: () => onSelect(i), onKeyDown: event => onKey(event, i),
          },
          h(StageIcon, { status: stage.status }),
          h('span', { className: 'dgs-step-text' },
            h('span', { className: 'dgs-step-num' }, `${i + 1}`),
            h('span', { className: 'dgs-step-title' }, STAGE_TEXT[stage.key].title)),
          h('span', { className: 'dgs-step-status' }, stage.approval ? '승인 필요' : STATUS_TEXT[stage.status])))))
    }

    function Message({ snapshot, source, onRetry }) {
      if (source.error && source.facts === null) {
        return h('div', { className: 'dgs-card dgs-message' },
          h('p', { role: 'status' }, `작업 단계를 읽지 못했어요(${source.error}).`),
          h('button', { type: 'button', className: 'dgs-link', onClick: onRetry }, '다시 읽기'))
      }
      return h('p', { className: 'dgs-empty' }, summaryOf(snapshot))
    }

    function StageView(props) {
      const { snapshot, source, refresh, choose } = useStages(props)
      const detailId = useId()
      const [picked, setPicked] = useState(null)
      const fallback = snapshot.current ?? Math.max(0, snapshot.stages.length - 1)
      const selected = picked ?? fallback
      const facts = source.facts
      return h('div', { className: 'dgs-root', 'data-plugin': VIEW_ID },
        h('section', { className: 'dgs-section', 'aria-labelledby': 'dgs-title' },
          h('div', { className: 'dgs-head' },
            h('h2', { className: 'dgs-title', id: 'dgs-title' }, '작업 단계'),
            snapshot.kind === 'ok' ? h('span', { className: 'dgs-meta', role: 'status' }, summaryOf(snapshot)) : null),
          facts?.within ? h(RepoPicker, { within: facts.within, choose }) : null,
          h(Where, { facts }),
          snapshot.doing ? h('p', { className: 'dgs-doing' }, h('span', { className: 'dgs-next-label' }, '지금 하는 일'), h('span', { className: 'dgs-next-text' }, snapshot.doing)) : null,
          snapshot.kind !== 'ok'
            ? h(Message, { snapshot, source, onRetry: () => void refresh() })
            : h(React.Fragment, null,
              h(Stepper, { snapshot, selected, onSelect: setPicked, detailId }),
              h(StageDetail, { stage: snapshot.stages[selected], index: selected, id: detailId })),
          h('p', { className: 'dgs-note' }, 'Git 상태를 10초마다 다시 읽어요. 이 화면은 보기만 하고, 푸시·합치기·배포는 사람이 승인한 뒤에만 해요.')))
    }

    // ── 채팅 머리 칩과 창 ─────────────────────────────────────

    const EDGE = 8
    function placePanel(button) {
      const rect = button.getBoundingClientRect()
      const width = Math.min(340, window.innerWidth - EDGE * 2)
      const left = Math.min(Math.max(EDGE, rect.right - width), window.innerWidth - EDGE - width)
      const top = rect.bottom + 6
      return { top, left, width, maxHeight: Math.max(120, window.innerHeight - top - EDGE) }
    }

    function StageDots({ snapshot }) {
      return h('span', { className: 'dgs-dots', 'aria-hidden': true }, snapshot.stages.map(stage =>
        h('span', { key: stage.key, className: 'dgs-dot', 'data-status': stage.status })))
    }

    function StageChip(props) {
      const { snapshot, source } = useStages(props)
      const [open, setOpen] = useState(false)
      const [place, setPlace] = useState(null)
      const button = useRef(null)
      const panel = useRef(null)
      const panelId = useId()

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

      if (snapshot.kind !== 'ok') return null
      const current = snapshot.current === null ? null : snapshot.stages[snapshot.current]
      const label = `작업 단계 ${summaryOf(snapshot)}`
      return h(React.Fragment, null,
        h('button', {
          type: 'button', ref: button, className: 'dgs-chip', 'aria-expanded': open, 'aria-controls': panelId,
          'aria-label': label, title: label, onClick: () => setOpen(value => !value),
          'data-approval': current?.approval ? '' : undefined,
        },
        h(StageDots, { snapshot }),
        h('span', { className: 'dgs-chip-text' }, current ? STAGE_TEXT[current.key].title : '끝')),
        open && place !== null
          ? ReactDOM.createPortal(h('div', {
            ref: panel, id: panelId, className: 'dgs-panel', role: 'dialog', 'aria-modal': false,
            'aria-labelledby': `${panelId}-title`, tabIndex: -1,
            style: { top: `${place.top}px`, left: `${place.left}px`, width: `${place.width}px`, maxHeight: `${place.maxHeight}px` },
            onKeyDown: (event) => { if (event.key === 'Tab') { event.preventDefault(); close(true) } },
          },
          h('div', { className: 'dgs-head' },
            h('h2', { className: 'dgs-title', id: `${panelId}-title` }, '작업 단계'),
            h('span', { className: 'dgs-meta' }, `${snapshot.done}/${snapshot.total} 끝남`)),
          h(Where, { facts: source.facts }),
          snapshot.doing ? h('p', { className: 'dgs-doing' }, h('span', { className: 'dgs-next-label' }, '지금 하는 일'), h('span', { className: 'dgs-next-text' }, snapshot.doing)) : null,
          h('ol', { className: 'dgs-compact' }, snapshot.stages.map((stage, i) =>
            h('li', { key: stage.key, className: 'dgs-compact-row', 'data-status': stage.status, 'aria-current': stage.status === 'current' ? 'step' : undefined },
              h(StageIcon, { status: stage.status }),
              h('span', { className: 'dgs-compact-title' }, `${i + 1}. ${STAGE_TEXT[stage.key].step}`),
              h('span', { className: 'dgs-step-status' }, STATUS_TEXT[stage.status]),
              h(Badges, { stage })))),
          current && nextOf(current) ? h('p', { className: 'dgs-next' }, h('span', { className: 'dgs-next-label' }, '다음'), h('span', { className: 'dgs-next-text' }, nextOf(current))) : null,
          h('p', { className: 'dgs-note' }, '단계 설명은 … 메뉴의 ‘작업 단계’ 탭에서 볼 수 있어요.')), document.body)
          : null)
    }

    // ── 등록 ──────────────────────────────────────────────────

    return {
      // 미리보기 틀(test/preview.html)이 쓰는 부품. DSH는 읽지 않는다.
      internals: { StageView, StageChip, stagesOf, sources, createStageSource },
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = VIEW_ID
          tag.dataset.version = VERSION
          tag.textContent = STYLE_TEXT
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'dsh-git-stage: styles')

        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view', id: VIEW_ID, order: 30, label: () => '작업 단계',
        }, StageView))
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities', id: VIEW_ID, order: -20,
        }, StageChip))
      },
    }
  },
})
