// DSH 대화 보기 "작업 단계" 탭과 채팅 머리 단계 칩의 화면 쪽 번들.
// 이 파일(lib/client.js)은 scripts/build.mjs가 src/client.template.js·src/*.js·src/style.css로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-git-stage',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useRef, useId } = React
    const VERSION = "1.0.0"
    const STYLE_TEXT = ".dgs-root {\n  box-sizing: border-box;\n  width: 100%;\n  max-width: calc(var(--dsh-chat-content-width, 760px) + 32px);\n  margin: 0 auto;\n  padding: 20px 16px 32px;\n  color: var(--dsw-alias-label-primary, #1f2329);\n  word-break: keep-all;\n  overflow-wrap: break-word;\n  container-type: inline-size;\n}\n.dgs-section { display: flex; flex-direction: column; gap: 12px; min-width: 0; }\n.dgs-head { display: flex; align-items: center; gap: 10px; min-width: 0; }\n.dgs-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 600; white-space: nowrap; }\n.dgs-meta { min-width: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }\n.dgs-where { margin: -6px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); overflow-wrap: anywhere; word-break: normal; }\n.dgs-empty, .dgs-note { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary, #646a73); text-wrap: pretty; }\n.dgs-note { font-size: 13px; line-height: 20px; }\n.dgs-card, .dgs-detail {\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));\n  border-radius: var(--dsw-radius-lg, 12px);\n  background: var(--dsw-alias-card-fill, transparent);\n}\n.dgs-message { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px 14px; font-size: 14px; line-height: 22px; }\n.dgs-message p { margin: 0; }\n\n/* 지금 하는 일 · 다음 */\n.dgs-doing, .dgs-next { margin: 0; display: flex; align-items: baseline; gap: 8px; font-size: 14px; line-height: 22px; text-wrap: pretty; }\n.dgs-next-label {\n  flex: none; font-size: 12px; line-height: 18px; padding: 0 6px; border-radius: var(--dsw-radius-sm, 6px); white-space: nowrap; font-weight: 500;\n  color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-state-business-tertiary, rgba(61, 123, 224, 0.1));\n}\n.dgs-next-text { min-width: 0; text-wrap: balance; }\n\n/* 단계 줄: 넓으면 6칸, 좁으면 3칸 두 줄. 칸 폭은 모두 같다. */\n.dgs-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }\n@container (max-width: 520px) { .dgs-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }\n.dgs-step { min-width: 0; }\n.dgs-step-btn {\n  box-sizing: border-box; width: 100%; min-height: 64px; margin: 0; padding: 8px 6px;\n  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: 10px; background: transparent;\n  font: inherit; color: inherit; cursor: pointer; text-align: center;\n}\n@media (hover: hover) { .dgs-step-btn:hover { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); } }\n.dgs-step-btn[aria-pressed='true'] { border-color: var(--dsw-alias-state-business-primary, #3d7be0); background: var(--dsw-alias-state-business-tertiary, rgba(61, 123, 224, 0.08)); }\n.dgs-step-btn:focus-visible, .dgs-link:focus-visible, .dgs-chip:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); outline-offset: 1px;\n}\n.dgs-step-text { display: flex; align-items: baseline; gap: 4px; max-width: 100%; }\n.dgs-step-num { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #646a73); font-variant-numeric: tabular-nums; }\n.dgs-step-title { font-size: 14px; line-height: 20px; font-weight: 500; white-space: nowrap; }\n.dgs-step-status { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary, #646a73); white-space: nowrap; }\n.dgs-step[data-status='current'] .dgs-step-status { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; }\n.dgs-step[data-status='todo'] .dgs-step-title { color: var(--dsw-alias-label-secondary, #646a73); }\n\n/* 상태 아이콘 */\n.dgs-icon { flex: none; width: 16px; height: 16px; overflow: visible; }\n.dgs-icon-ring { stroke: var(--dsw-alias-label-tertiary, #8f959e); }\n.dgs-icon-ring-now { stroke: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dgs-icon-dot { fill: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dgs-icon-fill { fill: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dgs-icon-check { stroke: #fff; }\n\n/* 설명 칸 */\n.dgs-detail { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; min-width: 0; }\n.dgs-detail-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }\n.dgs-detail-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 600; }\n.dgs-plain { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary, #646a73); text-wrap: pretty; }\n.dgs-facts { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; font-size: 14px; line-height: 22px; }\n.dgs-facts li { text-wrap: balance; }\n.dgs-facts li::marker { color: var(--dsw-alias-label-tertiary, #8f959e); }\n.dgs-status, .dgs-badge {\n  flex: none; font-size: 12px; line-height: 18px; padding: 0 6px; border-radius: var(--dsw-radius-sm, 6px); white-space: nowrap;\n  color: var(--dsw-alias-label-secondary, #646a73); border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));\n}\n.dgs-status[data-status='current'] { color: var(--dsw-alias-state-business-primary, #3d7be0); border-color: currentColor; }\n.dgs-badge[data-tone='approval'] { color: var(--dsw-alias-state-warning-primary, #b26a00); border-color: currentColor; }\n.dgs-badge[data-tone='blocked'] { color: var(--dsw-alias-state-danger-primary, #d83931); border-color: currentColor; }\n.dgs-link { min-height: 44px; padding: 0 8px; margin-left: -8px; border: 0; border-radius: 6px; background: transparent; font: inherit; font-size: 14px; color: var(--dsw-alias-state-business-primary, #3d7be0); cursor: pointer; white-space: nowrap; }\n\n/* 채팅 머리 칩 */\n.dgs-chip {\n  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; margin: 0;\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: 14px; background: transparent;\n  font: inherit; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary, #646a73); cursor: pointer; white-space: nowrap;\n}\n@media (hover: hover) { .dgs-chip:hover { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); } }\n.dgs-chip[aria-expanded='true'] { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); }\n.dgs-chip[data-approval] .dgs-chip-text { color: var(--dsw-alias-state-warning-primary, #b26a00); }\n.dgs-dots { display: inline-flex; align-items: center; gap: 3px; }\n.dgs-dot { width: 6px; height: 6px; border-radius: 50%; box-sizing: border-box; border: 1px solid var(--dsw-alias-label-tertiary, #8f959e); }\n.dgs-dot[data-status='done'] { border-color: var(--dsw-alias-state-business-primary, #3d7be0); background: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dgs-dot[data-status='current'] { width: 8px; height: 8px; border: 2px solid var(--dsw-alias-state-business-primary, #3d7be0); }\n.dgs-dot[data-status='unknown'] { border-style: dashed; }\n\n/* 칩을 누르면 뜨는 창 */\n.dgs-panel {\n  position: fixed; z-index: 1000; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px;\n  padding: 12px; overflow-y: auto; overscroll-behavior: contain;\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: var(--dsw-radius-lg, 12px);\n  background: var(--dsw-specific-menu, var(--dsw-alias-card-fill, #fff)); box-shadow: var(--dsw-elevation-panel, 0 8px 24px rgba(0, 0, 0, 0.16));\n  backdrop-filter: var(--dsw-menu-backdrop-filter, none);\n  color: var(--dsw-alias-label-primary, #1f2329); word-break: keep-all; overflow-wrap: break-word;\n  scrollbar-width: thin; scrollbar-color: var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l2, rgba(0, 0, 0, 0.2))) transparent;\n}\n.dgs-panel:focus { outline: none; }\n.dgs-panel:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); }\n.dgs-compact { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }\n.dgs-compact-row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; min-height: 30px; font-size: 14px; line-height: 20px; }\n.dgs-compact-title { flex: 1 0 auto; white-space: nowrap; }\n.dgs-compact-row[data-status='current'] .dgs-compact-title { font-weight: 600; }\n.dgs-compact-row[data-status='todo'] .dgs-compact-title { color: var(--dsw-alias-label-secondary, #646a73); }"
    const VIEW_ID = 'dsh-git-stage'

    const STAGE_KEYS = ['branch', 'commit', 'verify', 'share', 'merge', 'deploy']
    
    const APPROVAL = new Set(['share', 'merge', 'deploy'])
    const BRANCH_NAME = /^[a-z0-9]+\/(feat|fix|docs|chore)\/[\w.-]+$/
    const VERIFY_WORDS = /검증|테스트|시험|검수|test|verif|\bqa\b/i
    
    function asTodos(todos) {
      return Array.isArray(todos) ? todos.filter(t => t && typeof t.content === 'string') : []
    }
    
    function doingOf(todos) {
      return asTodos(todos).find(t => t.status === 'in_progress')?.content ?? null
    }
    
    function verifyOf(todos, verifiedAt, headTime) {
      const item = asTodos(todos).find(t => t.status === 'completed' && VERIFY_WORDS.test(t.content))
      if (item) return { by: 'todo', item: item.content }
      if (typeof verifiedAt === 'number' && (typeof headTime !== 'number' || verifiedAt >= headTime)) return { by: 'run', item: null }
      return { by: null, item: null }
    }
    
    /**
     * @param {object|null} facts git-read가 만든 사실. null이면 아직 모름.
     * @param {{ todos?: Array<{content: string, status: string}>|null, verifiedAt?: number|null }} [extra]
     */
    function stagesOf(facts, extra = {}) {
      const doing = doingOf(extra.todos)
      if (facts === null || facts === undefined) return { kind: 'loading', stages: [], current: null, done: 0, total: STAGE_KEYS.length, doing }
      if (facts.repo !== true) return { kind: 'no-repo', stages: [], current: null, done: 0, total: STAGE_KEYS.length, doing }
    
      const pr = facts.pr ?? null
      const prMerged = pr?.state === 'MERGED'
      const merged = prMerged || (facts.ahead === 0 && facts.hadCommits === true && !facts.isBase)
      const pushed = typeof facts.upstream === 'string' && facts.unpushed === 0
      const verify = verifyOf(extra.todos, extra.verifiedAt, facts.headTime)
    
      const info = {
        branch: { branch: facts.branch, base: facts.base, isBase: facts.isBase, detached: facts.branch === null, nameOk: typeof facts.branch === 'string' && BRANCH_NAME.test(facts.branch) },
        commit: { changes: facts.changes, ahead: facts.ahead },
        verify,
        share: { pushed, upstream: facts.upstream, unpushed: facts.unpushed, pr, prError: facts.prError ?? null },
        merge: { merged, by: prMerged ? 'pr' : merged ? 'local' : null, pr, base: facts.base },
        deploy: { tag: facts.tag ?? null },
      }
      const reached = {
        branch: facts.branch !== null && !facts.isBase,
        commit: (facts.changes === 0 && facts.ahead > 0) || merged,
        verify: verify.by !== null,
        share: pushed || merged || (pr !== null && pr.state !== 'CLOSED'),
        merge: merged,
        deploy: typeof facts.tag === 'string',
      }
      // 저장 단계는 미커밋이 남아 있으면 앞 단계가 다 끝나도 다시 "지금"이 된다.
      if (facts.changes > 0 && !facts.isBase) reached.commit = false
    
      const lastReached = STAGE_KEYS.reduce((last, key, i) => (reached[key] ? i : last), -1)
      let current = null
      const stages = STAGE_KEYS.map((key, i) => {
        let status
        if (reached[key]) status = 'done'
        else if (key === 'verify' && i < lastReached && facts.changes === 0) status = 'unknown'
        else if (current === null) { status = 'current'; current = i }
        else status = 'todo'
        const approval = status === 'current' && APPROVAL.has(key)
        const blocked = status === 'current' && (key === 'share' || key === 'merge') && facts.prError === 'auth' ? 'gh-auth' : null
        return { key, status, approval, blocked, info: info[key] }
      })
      const done = stages.filter(s => s.status === 'done').length
      return { kind: 'ok', stages, current, done, total: STAGE_KEYS.length, doing }
    }
    
    const STAGE_TEXT = {
      branch: { title: '작업실', step: '작업실 만들기', plain: '원본(main)은 그대로 두고, 이번 일만 담는 작업선(브랜치)을 따로 열어요.' },
      commit: { title: '저장', step: '고치고 저장', plain: '"여기까지 저장" 도장(커밋)이에요. 아직 GitHub에 올라간 것은 아니에요.' },
      verify: { title: '검증', step: '검증', plain: '테스트를 돌리거나 화면을 직접 확인해요. 확인하지 못했으면 됐다고 말하지 않아요.' },
      share: { title: '공유', step: '공유(푸시·PR)', plain: 'GitHub에 올리고(푸시) "합쳐도 될까요?" 검토 요청(PR)을 열어요.' },
      merge: { title: '합치기', step: '합치기(머지)', plain: '검토가 끝난 변경을 원본에 반영해요.' },
      deploy: { title: '배포', step: '배포', plain: '실제 서비스에 내보내요. 합치기와는 따로 승인받아요.' },
    }
    
    const STATUS_TEXT = { done: '끝남', current: '지금', todo: '남음', unknown: '기록 없음' }
    
    const count = (n, unit) => `${n}${unit}`
    
    function factsOf(stage) {
      const i = stage.info
      switch (stage.key) {
        case 'branch':
          if (i.detached) return ['브랜치 없이 특정 커밋에 서 있어요.']
          if (i.isBase) return [`지금 원본 브랜치(${i.branch})에 있어요.`]
          return [`작업 브랜치: ${i.branch}`, ...(i.nameOk ? [] : ['이름이 "도구/종류/목적" 형식과 달라요.'])]
        case 'commit':
          return [
            i.changes > 0 ? `저장 안 된 변경 ${count(i.changes, '개')}` : '저장 안 된 변경 없음',
            `원본보다 앞선 저장 ${count(i.ahead, '개')}`,
          ]
        case 'verify':
          if (i.by === 'todo') return [`마친 할 일: ${i.item}`]
          if (i.by === 'run') return ['마지막 저장 뒤에 테스트·빌드가 통과했어요.']
          return ['아직 검증 기록이 없어요.']
        case 'share': {
          const lines = []
          if (!i.upstream) lines.push('아직 GitHub에 올리지 않았어요.')
          else lines.push(i.unpushed > 0 ? `올리지 않은 저장 ${count(i.unpushed, '개')}` : 'GitHub에 모두 올렸어요.')
          if (i.pr) lines.push(`검토 요청 #${i.pr.number}${i.pr.draft ? ' (초안)' : ''}${i.pr.state === 'CLOSED' ? ' · 닫힘' : ''}`)
          else if (i.prError === 'auth') lines.push('GitHub 로그인이 만료돼 검토 요청을 확인하지 못했어요.')
          else if (i.prError === 'no-gh') lines.push('gh 명령이 없어 검토 요청을 확인하지 못했어요.')
          else if (i.prError) lines.push('검토 요청을 확인하지 못했어요.')
          else if (i.upstream) lines.push('검토 요청(PR)은 아직 없어요.')
          return lines
        }
        case 'merge':
          if (i.by === 'pr') return [`검토 요청 #${i.pr.number} · 원본(${i.base})에 합쳐졌어요.`]
          if (i.by === 'local') return [`이 브랜치의 저장이 원본(${i.base})에 들어 있어요.`]
          return [`아직 원본(${i.base})에 합치지 않았어요.`]
        case 'deploy':
          return i.tag ? [`완성본 표시(태그) ${i.tag}에 들어 있어요.`] : ['아직 완성본 표시(태그)가 없어요.']
        default:
          return []
      }
    }
    
    function nextOf(stage) {
      if (stage.status !== 'current') return null
      const i = stage.info
      if (stage.blocked === 'gh-auth') return '먼저 GitHub 로그인을 다시 해야 해요. 터미널에서 gh auth login을 실행해요.'
      switch (stage.key) {
        case 'branch': return '새 작업 브랜치를 만들어 달라고 하면 돼요.'
        case 'commit': return i.changes > 0 ? '바뀐 내용을 목적 하나씩 커밋으로 저장해요.' : '고칠 것을 고친 뒤 커밋으로 저장해요.'
        case 'verify': return '테스트를 돌리거나 화면을 확인해 달라고 해요.'
        case 'share': return i.upstream && i.unpushed === 0 ? '승인하면 검토 요청(PR)을 열어요.' : '승인하면 GitHub에 올리고(푸시) 검토 요청을 열어요.'
        case 'merge': return '검토가 끝났으면 승인하고 합쳐요(머지).'
        case 'deploy': return '배포는 합치기와 따로 승인해요. 승인하면 태그를 달거나 배포해요.'
        default: return null
      }
    }
    
    function summaryOf(snapshot) {
      if (snapshot.kind === 'loading') return '작업 단계를 읽는 중이에요.'
      if (snapshot.kind === 'no-repo') return 'Git 저장소가 아니에요.'
      if (snapshot.current === null) return `모든 단계 끝 · ${snapshot.done}/${snapshot.total}`
      const stage = snapshot.stages[snapshot.current]
      return `${STAGE_TEXT[stage.key].title} 단계 · ${snapshot.done}/${snapshot.total}${stage.approval ? ' · 승인 필요' : ''}`
    }
    
    const POLL_MS = 10_000
    
    const EMPTY_SOURCE = { facts: null, error: null, at: 0 }
    
    /**
     * @param {{ load: () => Promise<object>, now?: () => number, every?: (fn: () => void, ms: number) => () => void, visible?: () => boolean }} options
     */
    function createStageSource({ load, now = Date.now, every, visible = () => true }) {
      let snapshot = EMPTY_SOURCE
      let stopTimer = null
      let inflight = null
      const listeners = new Set()
      const notify = () => { for (const listener of listeners) listener() }
    
      function refresh() {
        if (inflight) return inflight
        inflight = load()
          .then(facts => { snapshot = { facts: facts ?? null, error: null, at: now() } })
          .catch(error => { snapshot = { ...snapshot, error: String(error?.code ?? 'network'), at: now() } })
          .finally(() => { inflight = null; notify() })
        return inflight
      }
    
      return {
        getSnapshot: () => snapshot,
        refresh,
        subscribe(listener) {
          listeners.add(listener)
          if (listeners.size === 1) {
            void refresh()
            stopTimer = every?.(() => { if (visible()) void refresh() }, POLL_MS) ?? null
          }
          return () => {
            listeners.delete(listener)
            if (listeners.size === 0) { stopTimer?.(); stopTimer = null }
          }
        },
      }
    }
    
    function routeOf(sessionId) {
      return `api/dsh-git-stage?sessionId=${encodeURIComponent(sessionId)}`
    }

    // ── 세션별 Git 사실 ───────────────────────────────────────

    const sources = new Map()
    function sourceOf(sessionId) {
      let source = sources.get(sessionId)
      if (!source) {
        source = createStageSource({
          load: async () => {
            const response = await fetch(routeOf(sessionId), { cache: 'no-store' })
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
      return { snapshot: stagesOf(state.facts, { todos }), source: state, refresh: source.refresh, running }
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
      const { snapshot, source, refresh } = useStages(props)
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
          facts?.repo ? h('p', { className: 'dgs-where' }, `${facts.folder} · ${facts.branch ?? '브랜치 없음'}`) : null,
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
      const { snapshot } = useStages(props)
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
