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
    const STYLE_TEXT = ".dgs-root {\n  box-sizing: border-box;\n  width: 100%;\n  max-width: calc(var(--dsh-chat-content-width, 760px) + 32px);\n  margin: 0 auto;\n  padding: 20px 16px 32px;\n  color: var(--dsw-alias-label-primary, #1f2329);\n  word-break: keep-all;\n  overflow-wrap: break-word;\n  container-type: inline-size;\n  position: relative;\n}\n.dgs-section { display: flex; flex-direction: column; gap: 12px; min-width: 0; }\n.dgs-head { display: flex; align-items: center; gap: 10px; min-width: 0; }\n.dgs-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 600; white-space: nowrap; }\n.dgs-meta { min-width: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }\n.dgs-context { display: flex; flex-direction: column; gap: 2px; min-width: 0; }\n.dgs-panel .dgs-context { margin-top: -4px; }\n.dgs-context-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; min-width: 0; }\n.dgs-where { flex: 1 1 160px; min-width: 0; margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); overflow-wrap: anywhere; word-break: normal; text-wrap: balance; }\n.dgs-repo { flex: none; display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }\n.dgs-repo-label { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #646a73); white-space: nowrap; }\n.dgs-repo-select {\n  box-sizing: border-box; width: auto; min-width: 0; max-width: 240px; min-height: 32px; margin: 0; padding: 4px 8px;\n  border: 1px solid var(--dsw-alias-label-tertiary, #8f959e); border-radius: 8px;\n  background: transparent; color: inherit; font: inherit; font-size: 13px; line-height: 20px; cursor: pointer;\n}\n.dgs-repo-select:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); outline-offset: 1px; }\n.dgs-why { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #646a73); text-wrap: pretty; }\n/* 화면에는 숨기고 화면 읽기 프로그램에만 읽힌다. */\n.dgs-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }\n.dgs-empty, .dgs-note { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary, #646a73); text-wrap: pretty; }\n.dgs-note { font-size: 13px; line-height: 20px; }\n.dgs-card, .dgs-detail {\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));\n  border-radius: var(--dsw-radius-lg, 12px);\n  background: var(--dsw-alias-card-fill, transparent);\n}\n.dgs-message { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px 14px; font-size: 14px; line-height: 22px; }\n.dgs-message p { margin: 0; }\n\n/* 지금 카드: 지금 단계의 상태·다음·요청을 한 곳에. 승인 차례면 경고색 테두리(배지 글자가 먼저, 색은 보조). */\n.dgs-now {\n  display: flex; flex-direction: column; gap: 10px; padding: 12px 14px 14px; min-width: 0;\n  border: 1px solid var(--dsw-alias-state-business-primary, #3d7be0); border-radius: var(--dsw-radius-lg, 12px);\n  background: var(--dsw-alias-card-fill, transparent);\n}\n.dgs-now[data-tone='approval'] { border-color: var(--dsw-alias-state-warning-primary, #b26a00); }\n.dgs-now[data-tone='done'] { border-color: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); }\n.dgs-now-done { margin: 0; font-size: 14px; line-height: 22px; }\n.dgs-now .dgs-plain { margin-top: -6px; font-size: 13px; line-height: 20px; }\n.dgs-now-head { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; }\n.dgs-now-kicker { flex: none; font-size: 12px; line-height: 18px; font-weight: 600; color: var(--dsw-alias-state-business-primary, #3d7be0); white-space: nowrap; }\n.dgs-now[data-tone='approval'] .dgs-now-kicker { color: var(--dsw-alias-state-warning-primary, #b26a00); }\n.dgs-now-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 600; white-space: nowrap; }\n.dgs-now-badges { display: inline-flex; flex-wrap: wrap; gap: 4px 6px; }\n.dgs-rows { margin: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; align-items: baseline; min-width: 0; }\n.dgs-row { display: contents; }\n@container (max-width: 420px) { .dgs-rows { grid-template-columns: minmax(0, 1fr); row-gap: 0; } .dgs-row + .dgs-row .dgs-row-label { margin-top: 6px; } }\n.dgs-panel .dgs-rows { grid-template-columns: minmax(0, 1fr); row-gap: 0; }\n.dgs-panel .dgs-row + .dgs-row .dgs-row-label { margin-top: 6px; }\n.dgs-row-label { margin: 0; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); white-space: nowrap; }\n.dgs-row-text { margin: 0; min-width: 0; font-size: 14px; line-height: 22px; text-wrap: pretty; }\n.dgs-row-line { display: block; }\n.dgs-now-out > summary { cursor: pointer; min-height: 24px; line-height: 24px; }\n.dgs-now-out > summary:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); outline-offset: 1px; border-radius: 4px; }\n.dgs-now-out[open] > summary { margin-bottom: 6px; }\n\n/* 바닥 줄: 읽은 시각·다시 읽기 */\n.dgs-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 0 12px; min-width: 0; }\n.dgs-foot-text { flex: 1 1 240px; margin: 0; min-width: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #646a73); text-wrap: pretty; font-variant-numeric: tabular-nums; }\n.dgs-foot .dgs-link { margin-left: -8px; font-size: 13px; }\n\n/* 단계 줄: 넓으면 6칸, 좁으면 3칸 두 줄. 칸 폭은 모두 같다. */\n.dgs-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }\n@container (max-width: 520px) { .dgs-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }\n.dgs-step { min-width: 0; }\n.dgs-step-btn {\n  box-sizing: border-box; width: 100%; min-height: 52px; margin: 0; padding: 6px 4px;\n  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: 10px; background: transparent;\n  font: inherit; color: inherit; cursor: pointer; text-align: center;\n}\n@media (hover: hover) { .dgs-step-btn:hover { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); } }\n.dgs-step-btn[aria-pressed='true'] { border-color: var(--dsw-alias-state-business-primary, #3d7be0); background: var(--dsw-alias-state-business-tertiary, rgba(61, 123, 224, 0.08)); }\n.dgs-step-btn:focus-visible, .dgs-link:focus-visible, .dgs-chip:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); outline-offset: 1px;\n}\n.dgs-step-text { display: flex; align-items: center; gap: 4px; max-width: 100%; }\n.dgs-step-text .dgs-icon { margin-right: 2px; }\n.dgs-step-num { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #646a73); font-variant-numeric: tabular-nums; }\n.dgs-step-title { font-size: 14px; line-height: 20px; font-weight: 500; white-space: nowrap; }\n.dgs-step-status { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary, #646a73); white-space: nowrap; }\n.dgs-step[data-status='current'] .dgs-step-status { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; }\n.dgs-step[data-status='todo'] .dgs-step-title { color: var(--dsw-alias-label-secondary, #646a73); }\n\n/* 상태 아이콘 */\n.dgs-icon { flex: none; width: 16px; height: 16px; overflow: visible; }\n.dgs-icon-ring { stroke: var(--dsw-alias-label-secondary, #646a73); }\n.dgs-icon-ring-now { stroke: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dgs-icon-dot { fill: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dgs-icon-fill { fill: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dgs-icon-check { stroke: #fff; }\n\n/* 설명 칸 */\n.dgs-detail { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; min-width: 0; }\n.dgs-detail-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }\n.dgs-detail-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 600; }\n.dgs-plain { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary, #646a73); text-wrap: pretty; }\n.dgs-facts { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; font-size: 14px; line-height: 22px; }\n.dgs-facts li { text-wrap: balance; }\n.dgs-facts li::marker { color: var(--dsw-alias-label-tertiary, #8f959e); }\n.dgs-status, .dgs-badge {\n  flex: none; font-size: 12px; line-height: 18px; padding: 0 6px; border-radius: var(--dsw-radius-sm, 6px); white-space: nowrap;\n  color: var(--dsw-alias-label-secondary, #646a73); border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));\n}\n.dgs-status[data-status='current'] { color: var(--dsw-alias-state-business-primary, #3d7be0); border-color: currentColor; }\n.dgs-badge[data-tone='approval'] { color: var(--dsw-alias-state-warning-primary, #b26a00); border-color: currentColor; }\n.dgs-badge[data-tone='running'] { color: var(--dsw-alias-state-business-primary, #3d7be0); border-color: currentColor; }\n.dgs-badge[data-tone='blocked'] { color: var(--dsw-alias-state-danger-primary, #d83931); border-color: currentColor; }\n.dgs-link { min-height: 44px; padding: 0 8px; margin-left: -8px; border: 0; border-radius: 6px; background: transparent; font: inherit; font-size: 14px; color: var(--dsw-alias-state-business-primary, #3d7be0); cursor: pointer; white-space: nowrap; }\n\n/* 승인 전에 보는 목록 */\n.dgs-out { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.03)); min-width: 0; }\n.dgs-out-title { margin: 0; font-size: 13px; line-height: 20px; font-weight: 600; }\n.dgs-out-list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 2px; font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }\n.dgs-out-more { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); }\n.dgs-out-left > summary { cursor: pointer; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); min-height: 24px; }\n.dgs-out-left > summary:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); outline-offset: 1px; border-radius: 4px; }\n.dgs-out-files { margin: 4px 0 0; padding-left: 18px; font-size: 12px; line-height: 18px; font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); overflow-wrap: anywhere; word-break: normal; text-wrap: balance; }\n\n/* 다음에 할 요청: 입력창에 넣기만 한다 */\n.dgs-ask { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.03)); min-width: 0; }\n.dgs-ask-label { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #646a73); white-space: nowrap; }\n.dgs-ask-text { margin: 0; font-size: 14px; line-height: 22px; text-wrap: pretty; }\n.dgs-ask-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }\n.dgs-ask-btn {\n  display: inline-flex; align-items: center; justify-content: center; min-height: 32px; padding: 0 12px; margin: 0;\n  border: 0; border-radius: 8px; font: inherit; font-size: 13px; line-height: 20px; font-weight: 500; white-space: nowrap; cursor: pointer;\n  color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-state-business-tertiary, rgba(61, 123, 224, 0.12));\n}\n@media (hover: hover) { .dgs-ask-btn:hover { background: var(--dsw-alias-state-business-secondary, rgba(61, 123, 224, 0.2)); } }\n.dgs-ask-btn:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); outline-offset: 1px; }\n.dgs-ask-note { margin: 0; min-width: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #646a73); text-wrap: pretty; }\n\n/* 채팅 머리 칩 */\n.dgs-chip {\n  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; margin: 0;\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: 14px; background: transparent;\n  font: inherit; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary, #646a73); cursor: pointer; white-space: nowrap;\n}\n@media (hover: hover) { .dgs-chip:hover { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); } }\n.dgs-chip[aria-expanded='true'] { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); }\n.dgs-chip-text { color: var(--dsw-alias-label-primary, #1f2329); }\n/* 승인 차례는 색만이 아니라 글자 배지로도 보인다. */\n.dgs-chip-badge {\n  font-size: 11px; line-height: 16px; padding: 0 5px; border-radius: 8px; font-weight: 600;\n  color: var(--dsw-alias-state-warning-primary, #b26a00); border: 1px solid currentColor;\n}\n/* 점: 끝남 = 채움, 지금 = 굵은 고리, 남음·기록 없음 = 빈 점(칩에서는 점선을 쓰지 않는다). */\n.dgs-dots { display: inline-flex; align-items: center; gap: 4px; }\n.dgs-dot { width: 7px; height: 7px; border-radius: 50%; box-sizing: border-box; border: 1.5px solid var(--dsw-alias-label-tertiary, #8f959e); }\n.dgs-dot[data-status='done'] { border-color: var(--dsw-alias-state-business-primary, #3d7be0); background: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dgs-dot[data-status='current'] { width: 9px; height: 9px; border: 2.5px solid var(--dsw-alias-state-business-primary, #3d7be0); }\n\n/* 칩을 누르면 뜨는 창 */\n.dgs-panel {\n  position: fixed; z-index: 1000; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px;\n  padding: 12px; overflow-y: auto; overscroll-behavior: contain;\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: var(--dsw-radius-lg, 12px);\n  background: var(--dsw-specific-menu, var(--dsw-alias-card-fill, #fff)); box-shadow: var(--dsw-elevation-panel, 0 8px 24px rgba(0, 0, 0, 0.16));\n  backdrop-filter: var(--dsw-menu-backdrop-filter, none);\n  color: var(--dsw-alias-label-primary, #1f2329); word-break: keep-all; overflow-wrap: break-word;\n  scrollbar-width: thin; scrollbar-color: var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l2, rgba(0, 0, 0, 0.2))) transparent;\n}\n.dgs-panel:focus { outline: none; }\n.dgs-panel:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); }\n.dgs-compact { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }\n.dgs-compact-row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; min-height: 30px; font-size: 14px; line-height: 20px; }\n.dgs-compact-title { flex: 1 0 auto; white-space: nowrap; }\n.dgs-compact-row[data-status='current'] .dgs-compact-title { font-weight: 600; }\n.dgs-compact-row[data-status='todo'] .dgs-compact-title { color: var(--dsw-alias-label-secondary, #646a73); }"
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
    
    function verifyOf(todos, verifiedAt, headTime, run = null) {
      if (run && typeof run.at === 'number') return { by: run.editedAfter ? null : 'run', item: null, run }
      const item = asTodos(todos).find(t => t.status === 'completed' && VERIFY_WORDS.test(t.content))
      if (item) return { by: 'todo', item: item.content, run: null }
      if (typeof verifiedAt === 'number' && (typeof headTime !== 'number' || verifiedAt >= headTime)) return { by: 'run', item: null, run: null }
      return { by: null, item: null, run: null }
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
      const verify = verifyOf(extra.todos, extra.verifiedAt, facts.headTime, facts.verify ?? null)
      // 승인 전에 보여 줄 "이번에 올라가는 것"(원본에 없는 저장 기록·바뀐 파일)과 "올라가지 않는 것"(저장 안 된 변경).
      const outgoing = {
        commits: Array.isArray(facts.commits) ? facts.commits : [],
        total: facts.ahead ?? 0,
        files: facts.files ?? null,
        pending: Array.isArray(facts.pending) ? facts.pending : [],
        changes: facts.changes ?? 0,
      }
    
      const info = {
        branch: { branch: facts.branch, base: facts.base, isBase: facts.isBase, detached: facts.branch === null, nameOk: typeof facts.branch === 'string' && BRANCH_NAME.test(facts.branch) },
        commit: { changes: facts.changes, ahead: facts.ahead },
        verify,
        share: { pushed, upstream: facts.upstream, unpushed: facts.unpushed, pr, prError: facts.prError ?? null, outgoing },
        merge: { merged, by: prMerged ? 'pr' : merged ? 'local' : null, pr, base: facts.base, outgoing },
        deploy: { tag: facts.tag ?? null, kind: facts.deploy ?? 'tag' },
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
      // 원본 브랜치에 있으면 이번 일의 작업실이 아직 없다. 원본이 GitHub와 같거나 지난 할 일이 끝났어도 뒤 단계는 시작 전이다.
      if (facts.isBase) for (const key of STAGE_KEYS) reached[key] = false
    
      const lastReached = STAGE_KEYS.reduce((last, key, i) => (reached[key] ? i : last), -1)
      let current = null
      const stages = STAGE_KEYS.map((key, i) => {
        let status
        if (reached[key]) status = 'done'
        else if (key === 'verify' && i < lastReached && facts.changes === 0) status = 'unknown'
        else if (current === null) { status = 'current'; current = i }
        else status = 'todo'
        const approval = status === 'current' && APPROVAL.has(key)
        // 막힘: GitHub 로그인 만료(공유·합치기), PR 검사 실패(합치기).
        const blocked = status !== 'current' ? null
          : (key === 'share' || key === 'merge') && facts.prError === 'auth' ? 'gh-auth'
            : key === 'merge' && pr?.state === 'OPEN' && pr.checks?.failing > 0 ? 'checks' : null
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
          if (i.changes > 0) return [`저장 안 된 변경 ${count(i.changes, '개')}`, ...(i.ahead > 0 ? [`원본보다 앞선 저장 ${count(i.ahead, '개')}`] : [])]
          return i.ahead > 0 ? [`저장 ${count(i.ahead, '개')} · 저장 안 된 변경 없음`] : ['아직 바뀐 파일이 없어요.']
        case 'verify':
          if (i.run) return [`${clockOf(i.run.at)} ${i.run.command} 통과`, i.run.editedAfter ? '그 뒤에 파일을 고쳤어요. 다시 돌려야 해요.' : '그 뒤로 고친 파일 없음']
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
          return [...lines, ...prChecksOf(i.pr)]
        }
        case 'merge':
          if (i.by === 'pr') return [`검토 요청 #${i.pr.number} · 원본(${i.base})에 합쳐졌어요.`]
          if (i.by === 'local') return [`이 브랜치의 저장이 원본(${i.base})에 들어 있어요.`]
          return [`아직 원본(${i.base})에 합치지 않았어요.`, ...prChecksOf(i.pr)]
        case 'deploy': {
          const tag = i.tag ? `완성본 표시(태그) ${i.tag}에 들어 있어요.` : '아직 완성본 표시(태그)가 없어요.'
          // 끝남은 태그로만 본다. wrangler·스크립트 배포는 기록이 Git에 남지 않는다.
          return i.kind === 'tag' ? [tag] : [DEPLOY_HOW[i.kind], tag, '배포 기록은 여기서 확인하지 못해요.']
        }
        default:
          return []
      }
    }
    
    const DEPLOY_HOW = { wrangler: '배포 방식: Wrangler(Cloudflare Worker)', script: '배포 방식: npm run deploy' }
    
    const PR_BODY = 'PR 본문에는 바뀌는 것·확인한 것·확인하지 못한 것을 적어 주세요.'
    const DEPLOY_ASK = {
      wrangler: '배포 전에 이번 배포에 포함되는 것·포함하지 않는 것과 Worker 코드가 바뀌는지 알려 주세요.',
      script: '배포 전에 이번 배포에 포함되는 것·포함하지 않는 것과 npm run deploy가 하는 일을 알려 주세요.',
      tag: '배포 전에 이번 배포에 포함되는 것과 포함하지 않는 것을 알려 주세요.',
    }
    
    const REVIEW_TEXT = { approved: '검토 승인됨', changes: '고칠 점 요청됨', required: '검토 기다림' }
    
    function prChecksOf(pr) {
      if (!pr || pr.state !== 'OPEN') return []
      const c = pr.checks
      const parts = c ? [
        ...(c.passing ? [`검사 ${c.passing}개 통과`] : []),
        ...(c.failing ? [`${c.failing}개 실패`] : []),
        ...(c.pending ? [`${c.pending}개 진행 중`] : []),
      ] : []
      if (pr.review) parts.push(REVIEW_TEXT[pr.review])
      const lines = parts.length ? [parts.join(' · ')] : []
      if (c?.failed?.length) lines.push(`실패한 검사: ${c.failed.join(', ')}`)
      return lines
    }
    
    const WHILE_RUNNING = {
      branch: '에이전트가 일하는 중이에요. 기다렸다가, 끝나면 작업 브랜치가 생겼는지 봐요.',
      commit: '에이전트가 고치는 중이에요. 기다렸다가, 끝나면 저장(커밋)을 요청해요.',
      verify: '에이전트가 일하는 중이에요. 기다렸다가, 끝나면 테스트·빌드를 요청해요.',
    }
    
    function nextOf(stage, { running = false } = {}) {
      if (stage.status !== 'current') return null
      const i = stage.info
      if (stage.blocked === 'gh-auth') return '먼저 GitHub 로그인을 다시 해야 해요. 터미널에서 gh auth login을 실행해요.'
      if (stage.blocked === 'checks') return '실패한 검사를 고쳐야 합칠 수 있어요. 원인을 찾아 고쳐 달라고 해요.'
      if (running && WHILE_RUNNING[stage.key]) return WHILE_RUNNING[stage.key]
      switch (stage.key) {
        case 'branch': return '새 작업 브랜치를 만들어 달라고 하면 돼요.'
        case 'commit': return i.changes > 0 ? '바뀐 내용을 목적 하나씩 커밋으로 저장해요.' : '고칠 것을 말하면, 고친 뒤 커밋으로 저장해요.'
        case 'verify': return i.run?.editedAfter ? '고친 뒤라 테스트·빌드를 다시 돌려 달라고 해요.' : '테스트를 돌리거나 화면을 확인해 달라고 해요.'
        case 'share': return i.upstream && i.unpushed === 0 ? '승인하면 검토 요청(PR)을 열어요.' : '승인하면 GitHub에 올리고(푸시) 검토 요청을 열어요.'
        case 'merge': return '검토가 끝났으면 승인하고 합쳐요(머지).'
        case 'deploy': return i.kind === 'wrangler' ? '배포는 합치기와 따로 승인해요. 승인하면 Wrangler로 Worker를 배포해요.'
          : i.kind === 'script' ? '배포는 합치기와 따로 승인해요. 승인하면 npm run deploy로 배포해요.'
            : '배포는 합치기와 따로 승인해요. 승인하면 완성본 표시(태그)를 달아요.'
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
    
    const KIND_TEXT = { new: '새 파일', modified: '고침', deleted: '지움', renamed: '이름 바꿈', conflict: '충돌' }
    
    /**
     * 공유·합치기를 승인하기 전에 볼 "이번에 올라가는 것"과 "올라가지 않는 것". 끝난 단계나 올라갈 저장이 없으면 null.
     * @returns {{ title: string, summary: string, commits: string[], more: string|null, files: string|null, left: string|null, pending: string[] } | null}
     */
    function outgoingOf(stage) {
      if ((stage.key !== 'share' && stage.key !== 'merge') || stage.status === 'done') return null
      const out = stage.info.outgoing
      if (!out || out.total === 0) return null
      const hidden = out.total - out.commits.length
      return {
        title: stage.key === 'share' ? '이번에 GitHub에 올라가는 것' : `원본(${stage.info.base})에 합쳐지는 것`,
        summary: [`저장 ${out.total}개`, ...(out.files ? [`파일 ${out.files.changed}개`, `${out.files.added}줄 더함`, `${out.files.removed}줄 뺌`] : [])].join(' · '),
        commits: out.commits.map(c => c.subject),
        more: hidden > 0 ? `외 저장 ${hidden}개` : null,
        files: out.files ? `파일 ${out.files.changed}개 · ${out.files.added}줄 더함 · ${out.files.removed}줄 뺌` : null,
        left: out.changes > 0 ? `저장 안 된 변경 ${out.changes}개는 올라가지 않아요.` : null,
        pending: out.pending.map(p => `${KIND_TEXT[p.kind] ?? '바뀜'} · ${p.path}`),
      }
    }
    
    /** 묶음 폴더에서 왜 이 저장소를 보여 주는지 한 줄. 사람이 고른 경우는 설명하지 않는다. */
    function whyOf(within) {
      if (!within || within.reason === 'picked') return null
      if (within.reason === 'session') return '이 세션이 명령을 돌린 저장소예요.'
      return '이 세션의 명령에서 저장소를 찾지 못해, 가장 최근에 Git 활동이 있던 저장소를 보여 줘요.'
    }
    
    /**
     * 지금 단계에서 에이전트에게 보낼 만한 요청 한 문장. 단추가 입력창에 넣기만 하고, 보내기는 사람이 누른다.
     * 끝난 단계, 로그인부터 해야 하는 경우, 아직 저장할 것이 없는 경우는 null.
     * @param {string|null} [repo] 묶음 폴더 안 저장소 이름. 주면 어느 저장소의 일인지 문장 앞에 밝힌다.
     */
    function askOf(stage, repo = null) {
      const ask = askTextOf(stage)
      return ask !== null && repo ? `${repo} 저장소에서 ${ask}` : ask
    }
    
    function askTextOf(stage) {
      if (stage.status !== 'current') return null
      if (stage.blocked === 'checks') return 'PR 검사 가운데 실패한 것의 원인을 찾아 고쳐 주세요. 고친 뒤 테스트와 빌드를 다시 돌려 주세요.'
      if (stage.blocked) return null
      const i = stage.info
      switch (stage.key) {
        case 'branch': return '이번 일을 위한 새 작업 브랜치를 만들어 주세요.'
        case 'commit': return i.changes > 0 ? '바뀐 내용을 목적별로 나눠 커밋해 주세요. 커밋 전에 무엇을 저장하는지 알려 주세요.' : null
        case 'verify': return '테스트와 빌드를 돌리고, 실패하면 원인과 고칠 방법을 알려 주세요.'
        case 'share': return `테스트와 빌드를 돌리고, 통과하면 푸시해서 검토 요청(PR)을 초안으로 열어 주세요. ${PR_BODY}`
        // 올렸지만 검토 요청이 없거나 닫혔으면 먼저 연다.
        case 'merge': return i.pr && i.pr.state === 'OPEN' ? 'PR 검사가 모두 통과했는지 확인하고, 통과했으면 스쿼시 머지해 주세요.' : `검토 요청(PR)을 초안으로 열어 주세요. ${PR_BODY}`
        case 'deploy': return DEPLOY_ASK[i.kind] ?? DEPLOY_ASK.tag
        default: return null
      }
    }
    
    /** 시각(ms) → 이 기기 시간대의 "시:분". */
    function clockOf(at) {
      const time = new Date(at)
      const pad = n => String(n).padStart(2, '0')
      return `${pad(time.getHours())}:${pad(time.getMinutes())}`
    }
    
    /** 바닥 줄의 읽은 시각. 아직 못 읽었으면 그렇게 말한다. */
    function readAtOf(at) {
      return at ? `${clockOf(at)}에 읽음` : '아직 읽지 않았어요'
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
        // 읽는 조건(고른 저장소)이 바뀌었을 때: 이미 떠난 요청이 끝난 뒤 새로 한 번 더 읽는다.
        reload: () => (inflight ? inflight.then(refresh) : refresh()),
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
    
    function routeOf(sessionId, pick = null) {
      const repo = pick ? `&repo=${encodeURIComponent(pick)}` : ''
      return `api/dsh-git-stage?sessionId=${encodeURIComponent(sessionId)}${repo}`
    }

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
