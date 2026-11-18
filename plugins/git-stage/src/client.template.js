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

    // 코드 지도 플러그인이 없거나 꺼져 있으면(404·꺼짐) 조용히 null. 작업 단계 읽기는 이 일로 실패하지 않는다.
    async function readCodeMap(sessionId) {
      try {
        const response = await fetch(codeRouteOf(sessionId), { cache: 'no-store' })
        return response.ok ? codeSummaryOf(await response.json()) : null
      } catch {
        return null
      }
    }

    const sources = new Map()
    function sourceOf(sessionId) {
      let source = sources.get(sessionId)
      if (!source) {
        source = createStageSource({
          load: async () => {
            const [response, code] = await Promise.all([
              fetch(routeOf(sessionId, pickOf(sessionId)), { cache: 'no-store' }),
              readCodeMap(sessionId),
            ])
            if (!response.ok) throw Object.assign(new Error('stage route'), { code: response.status })
            const facts = (await response.json()).facts
            return facts && code ? { ...facts, code } : facts
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

    // 저장소 줄: 작업 폴더 이름 · 브랜치, 묶음 폴더면 옆에 저장소 고르기(자동으로 따라가기 / 하나 고정). 이유는 아래 작은 글씨.
    function Context({ facts, choose }) {
      const id = useId()
      if (!facts?.repo) return null
      const within = facts.within
      const why = whyOf(within)
      return h('div', { className: 'dgs-context' },
        h('div', { className: 'dgs-context-row' },
          h('p', { className: 'dgs-where' }, `${facts.folder} · ${facts.branch ?? '브랜치 없음'}`),
          within && choose
            ? h('div', { className: 'dgs-repo' },
              h('label', { className: 'dgs-repo-label', htmlFor: id }, '저장소'),
              h('select', {
                id, className: 'dgs-repo-select', value: within.auto ? '' : within.picked,
                'aria-description': `${within.folder} 안 저장소 가운데 하나`,
                onChange: event => choose(event.target.value),
              },
              h('option', { value: '' }, '자동으로 따라가기'),
              within.repos.map(name => h('option', { key: name, value: name }, name))))
            : null),
        why ? h('p', { className: 'dgs-why' }, why) : null)
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

    function Badges({ stage, running = false }) {
      return h(React.Fragment, null,
        running ? h('span', { className: 'dgs-badge', 'data-tone': 'running' }, '에이전트 작업 중') : null,
        stage.approval ? h('span', { className: 'dgs-badge', 'data-tone': 'approval' }, '승인 필요') : null,
        stage.blocked ? h('span', { className: 'dgs-badge', 'data-tone': 'blocked' }, stage.blocked === 'checks' ? '검사 실패' : '로그인 필요') : null)
    }

    // 승인 전에 보는 목록: 올라갈 저장 기록 제목, 바뀐 파일 수, 올라가지 않는 저장 안 된 변경(펼쳐 봄).
    function Outgoing({ stage }) {
      const out = outgoingOf(stage)
      if (out === null) return null
      return h('div', { className: 'dgs-out' },
        h('h4', { className: 'dgs-out-title' }, out.title),
        h('ol', { className: 'dgs-out-list' }, out.commits.map((subject, i) => h('li', { key: i }, subject))),
        out.more ? h('p', { className: 'dgs-out-more' }, out.more) : null,
        out.files ? h('p', { className: 'dgs-out-more' }, out.files) : null,
        out.left
          ? h('details', { className: 'dgs-out-left' },
            h('summary', null, out.left),
            h('ul', { className: 'dgs-out-files' }, out.pending.map(line => h('li', { key: line }, line))))
          : null)
    }

    // 지금 단계에서 할 만한 요청을 입력창에 넣는다. 보내기는 부르지 않는다. 사람이 읽고 고친 뒤 직접 보낸다.
    function Ask({ stage, facts, inputActions }) {
      const text = askOf(stage, facts?.within ? facts.folder : null)
      const [note, setNote] = useState('')
      useEffect(() => { setNote('') }, [text])
      if (text === null || !inputActions) return null
      const put = () => {
        const ok = inputActions.insertText(text, inputActions.captureInsertion())
        setNote(ok ? '입력창에 넣었어요. 읽어 보고 직접 보내 주세요.' : '지금은 입력창에 넣지 못했어요. 답이 끝난 뒤 다시 눌러 주세요.')
      }
      return h('div', { className: 'dgs-ask' },
        h('p', { className: 'dgs-ask-label' }, '이렇게 요청해 보세요'),
        h('p', { className: 'dgs-ask-text' }, text),
        h('div', { className: 'dgs-ask-row' },
          h('button', { type: 'button', className: 'dgs-ask-btn', onClick: put }, '입력창에 넣기'),
          h('p', { className: 'dgs-ask-note', role: 'status' }, note)))
    }

    // 줄 묶음은 dl 하나의 두 칸 격자다. 이름 칸은 가장 긴 이름만큼만 넓다.
    function Row({ label, value }) {
      return h('div', { className: 'dgs-row' },
        h('dt', { className: 'dgs-row-label' }, label),
        h('dd', { className: 'dgs-row-text' }, value))
    }

    // 지금 카드: 지금 단계에서 사람이 알아야 할 것과 할 일을 맨 위에 한 번만 모은다.
    function NowCard({ snapshot, facts, running, inputActions, id }) {
      const titleId = useId()
      const index = snapshot.current
      if (index === null) {
        return h('section', { className: 'dgs-now', id, 'data-tone': 'done', 'aria-label': '지금' },
          h('p', { className: 'dgs-now-done' }, '모든 단계를 마쳤어요.'))
      }
      const stage = snapshot.stages[index]
      const out = outgoingOf(stage)
      const next = nextOf(stage, { running })
      return h('section', { className: 'dgs-now', id, 'data-tone': stage.approval || stage.blocked ? 'approval' : 'info', 'aria-labelledby': titleId },
        h('div', { className: 'dgs-now-head' },
          h('span', { className: 'dgs-now-kicker' }, '지금'),
          h('h3', { className: 'dgs-now-title', id: titleId }, `${index + 1}. ${STAGE_TEXT[stage.key].step}`),
          h('span', { className: 'dgs-now-badges' }, h(Badges, { stage, running }))),
        h('p', { className: 'dgs-plain' }, STAGE_TEXT[stage.key].plain),
        h('dl', { className: 'dgs-rows' },
          snapshot.doing ? h(Row, { label: '하는 일', value: snapshot.doing }) : null,
          h(Row, { label: '상태', value: factsOf(stage).map(line => h('span', { key: line, className: 'dgs-row-line' }, line)) }),
          out ? h(Row, {
            label: '올라가는 것',
            value: h('details', { className: 'dgs-now-out' }, h('summary', null, out.summary), h(Outgoing, { stage })),
          }) : null,
          next ? h(Row, { label: '다음', value: next }) : null),
        h(Ask, { stage, facts, inputActions }))
    }

    function StageDetail({ stage, index, id }) {
      const text = STAGE_TEXT[stage.key]
      return h('div', { className: 'dgs-detail', id, role: 'region', 'aria-label': `${index + 1}단계 ${text.step} 자세히` },
        h('div', { className: 'dgs-detail-head' },
          h('h3', { className: 'dgs-detail-title' }, `${index + 1}. ${text.step}`),
          h('span', { className: 'dgs-status', 'data-status': stage.status }, STATUS_TEXT[stage.status]),
          h(Badges, { stage })),
        h('p', { className: 'dgs-plain' }, text.plain),
        h('ul', { className: 'dgs-facts' }, factsOf(stage).map(line => h('li', { key: line }, line))),
        h(Outgoing, { stage }))
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
          h('span', { className: 'dgs-step-text' },
            h(StageIcon, { status: stage.status }),
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

    // 바닥 줄: 언제 읽은 정보인지, 얼마마다 다시 읽는지, 보기 전용이라는 것. 바로 다시 읽을 수도 있다.
    function Foot({ source, refresh }) {
      const failed = source.error ? ` · 마지막 읽기 실패(${source.error})` : ''
      return h('div', { className: 'dgs-foot' },
        h('p', { className: 'dgs-foot-text', role: 'status' },
          `${readAtOf(source.at)}${failed} · 10초마다 새로 읽음 · 보기 전용`),
        h('button', { type: 'button', className: 'dgs-link', onClick: () => void refresh() }, '지금 다시 읽기'))
    }

    // 코드 지도가 켜진 저장소에서만, 코드 지도가 읽은 숫자를 빌려 보인다. 새로 분석하지 않는다.
    function CodeMapSummary({ code }) {
      const titleId = useId()
      if (!code) return null
      if (code.kind === 'message') {
        return h('section', { className: 'dgs-code', 'aria-labelledby': titleId },
          h('h3', { className: 'dgs-code-title', id: titleId }, '코드 지도'),
          h('p', { className: 'dgs-code-note' }, code.line))
      }
      return h('section', { className: 'dgs-code', 'aria-labelledby': titleId, 'aria-busy': code.indexing || undefined },
        h('div', { className: 'dgs-code-head' },
          h('h3', { className: 'dgs-code-title', id: titleId }, '코드 지도'),
          h('span', { className: 'dgs-meta' }, code.indexing ? '지도 준비 중' : '마지막 코딩 요청 기준')),
        h('p', { className: 'dgs-code-line', role: 'status' }, code.request),
        code.gaps
          ? h('ul', { className: 'dgs-code-gaps', 'aria-label': '지도에서 읽지 못한 범위' },
            code.gaps.map(gap => h('li', { key: gap.key, className: 'dgs-code-gap', 'data-warn': gap.warn ? '' : undefined }, gap.label)))
          : null,
        h('p', { className: 'dgs-code-note' },
          '지도에 없는 파일이나 실행할 때만 이어지는 호출은 빠져요. 자세한 위치와 사용처는 코드 지도 탭에서 볼 수 있어요.'))
    }

    function StageView(props) {
      const { snapshot, source, refresh, running, choose } = useStages(props)
      const detailId = useId()
      const [picked, setPicked] = useState(null)
      const fallback = snapshot.current ?? Math.max(0, snapshot.stages.length - 1)
      const selected = picked ?? fallback
      const facts = source.facts
      return h('div', { className: 'dgs-root', 'data-plugin': VIEW_ID },
        h('section', { className: 'dgs-section', 'aria-labelledby': 'dgs-title' },
          // 탭 이름이 이미 "작업 단계"이고 요약은 지금 카드가 보여 준다. 제목과 요약은 화면 읽기 프로그램에만 남긴다.
          h('div', { className: 'dgs-head dgs-sr' },
            h('h2', { className: 'dgs-title', id: 'dgs-title' }, '작업 단계'),
            snapshot.kind === 'ok' ? h('span', { className: 'dgs-meta', role: 'status' }, summaryOf(snapshot)) : null),
          h(Context, { facts, choose }),
          snapshot.kind !== 'ok'
            ? h(Message, { snapshot, source, onRetry: () => void refresh() })
            : h(React.Fragment, null,
              // 지금 단계를 고르면 지금 카드가 그 설명이다. 다른 단계를 고를 때만 아래 설명이 붙는다.
              h(NowCard, { snapshot, facts, running, inputActions: props.inputActions, id: selected === snapshot.current ? detailId : undefined }),
              h(Stepper, { snapshot, selected, onSelect: setPicked, detailId }),
              selected === snapshot.current ? null : h(StageDetail, { stage: snapshot.stages[selected], index: selected, id: detailId })),
          snapshot.kind === 'ok' ? h(CodeMapSummary, { code: facts?.code }) : null,
          snapshot.kind === 'ok' ? h(Foot, { source, refresh }) : null))
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
      const { snapshot, source, running } = useStages(props)
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

      // 창은 자리를 잰 뒤에 그려지므로, 그려진 다음에 초점을 옮긴다.
      const placed = open && place !== null
      useEffect(() => { if (placed) panel.current?.focus() }, [placed])

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
        h('span', { className: 'dgs-chip-text' }, current ? STAGE_TEXT[current.key].title : '끝'),
        current?.approval ? h('span', { className: 'dgs-chip-badge' }, '승인') : null),
        open && place !== null
          ? ReactDOM.createPortal(h('div', {
            ref: panel, id: panelId, className: 'dgs-panel', role: 'dialog', 'aria-modal': false,
            'aria-labelledby': `${panelId}-title`, tabIndex: -1,
            style: { top: `${place.top}px`, left: `${place.left}px`, width: `${place.width}px`, maxHeight: `${place.maxHeight}px` },
            // 창 안 단추 사이는 Tab으로 옮기고, 처음·끝을 넘어가면 창을 닫고 칩으로 돌아간다.
            onKeyDown: (event) => {
              if (event.key !== 'Tab') return
              const items = [...panel.current.querySelectorAll('button, select, summary')]
              const at = document.activeElement
              const out = items.length === 0 || (event.shiftKey ? at === items[0] || at === panel.current : at === items[items.length - 1])
              if (out) { event.preventDefault(); close(true) }
            },
          },
          h('div', { className: 'dgs-head' },
            h('h2', { className: 'dgs-title', id: `${panelId}-title` }, '작업 단계'),
            h('span', { className: 'dgs-meta' }, `${snapshot.done}/${snapshot.total} 끝남`)),
          h(Context, { facts: source.facts }),
          h(NowCard, { snapshot, facts: source.facts, running, inputActions: props.inputActions }),
          h('ol', { className: 'dgs-compact' }, snapshot.stages.map((stage, i) =>
            h('li', { key: stage.key, className: 'dgs-compact-row', 'data-status': stage.status, 'aria-current': stage.status === 'current' ? 'step' : undefined },
              h(StageIcon, { status: stage.status }),
              h('span', { className: 'dgs-compact-title' }, `${i + 1}. ${STAGE_TEXT[stage.key].step}`),
              h('span', { className: 'dgs-step-status' }, STATUS_TEXT[stage.status]),
              h(Badges, { stage })))),
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
