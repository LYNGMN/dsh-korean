// DSH 대화 보기 "계획" 탭과 채팅 머리 진행 칩의 화면 쪽 번들.
// 이 파일(lib/client.js)은 scripts/build.mjs가 src/client.template.js·src/*.js·src/style.css로 만든다. 직접 고치지 않는다.
window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-plan-view',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useRef, useId } = React
    const VERSION = "1.2.0"
    const STYLE_TEXT = ".dpv-root {\n  box-sizing: border-box;\n  width: 100%;\n  max-width: calc(var(--dsh-chat-content-width, 760px) + 32px);\n  margin: 0 auto;\n  padding: 20px 16px 32px;\n  display: flex;\n  flex-direction: column;\n  gap: 28px;\n  color: var(--dsw-alias-label-primary, #1f2329);\n  word-break: keep-all;\n  overflow-wrap: break-word;\n}\n.dpv-section { display: flex; flex-direction: column; gap: 10px; min-width: 0; }\n.dpv-head { display: flex; align-items: center; gap: 10px; min-width: 0; }\n.dpv-title { margin: 0; font-size: 15px; line-height: 24px; font-weight: 600; white-space: nowrap; }\n.dpv-meta { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }\n.dpv-empty, .dpv-note { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary, #646a73); text-wrap: pretty; }\n.dpv-note { font-size: 13px; line-height: 20px; }\n.dpv-badge { flex: none; font-size: 12px; line-height: 18px; padding: 0 6px; border-radius: var(--dsw-radius-sm, 6px); color: var(--dsw-alias-label-secondary, #646a73); border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); white-space: nowrap; }\n.dpv-badge[data-done] { color: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dpv-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }\n.dpv-card {\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));\n  border-radius: var(--dsw-radius-lg, 12px);\n  background: var(--dsw-alias-card-fill, transparent);\n}\n.dpv-card-head { padding: 12px 12px 4px; }\n\n/* 진행 막대 */\n.dpv-progress { position: relative; height: 4px; border-radius: 2px; overflow: hidden; background: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); }\n.dpv-progress-fill { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: var(--dsw-alias-state-business-primary, #3d7be0); transition: width 0.4s ease; }\n\n/* 할 일 줄 */\n.dpv-todos { list-style: none; margin: 0; padding: 4px 4px; display: flex; flex-direction: column; }\n.dpv-todo { border-radius: 8px; }\n.dpv-todo-btn, .dpv-todo-compact {\n  box-sizing: border-box; width: 100%; display: flex; align-items: flex-start; gap: 10px;\n  padding: 7px 8px; font: inherit; font-size: 14px; line-height: 22px; color: inherit; text-align: left;\n}\n.dpv-todo-btn { min-height: 36px; margin: 0; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }\n@media (hover: hover) { .dpv-todo-btn:hover { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); } }\n.dpv-todo-btn:focus-visible, .dpv-link:focus-visible, .dpv-fold > summary:focus-visible, .dpv-chip:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); outline-offset: -2px;\n}\n.dpv-todo-text { flex: 1 1 auto; min-width: 0; text-wrap: pretty; }\n.dpv-todo[data-status='completed'] .dpv-todo-text { color: var(--dsw-alias-label-secondary, #646a73); text-decoration: line-through; text-decoration-thickness: 1px; }\n.dpv-todo[data-status='in_progress'] .dpv-todo-text { font-weight: 500; }\n.dpv-todo-meta { flex: none; font-size: 12px; line-height: 22px; color: var(--dsw-alias-label-secondary, #646a73); white-space: nowrap; font-variant-numeric: tabular-nums; }\n.dpv-todo[data-status='in_progress'] .dpv-todo-meta { color: var(--dsw-alias-state-business-primary, #3d7be0); }\n\n/* 상태 아이콘 */\n.dpv-icon { flex: none; width: 16px; height: 16px; margin-top: 3px; overflow: visible; }\n.dpv-icon-ring { stroke: var(--dsw-alias-label-tertiary, #8f959e); }\n.dpv-icon-track { stroke: var(--dsw-alias-label-tertiary, #8f959e); }\n.dpv-icon-arc { stroke: var(--dsw-alias-state-business-primary, #3d7be0); transform-origin: 8px 8px; }\n.dpv-icon-fill { fill: var(--dsw-alias-state-business-primary, #3d7be0); }\n.dpv-icon-check { stroke: #fff; stroke-dasharray: 12; stroke-dashoffset: 0; }\n.dpv-spin { animation: dpv-spin 0.9s linear infinite; }\n@keyframes dpv-spin { to { transform: rotate(360deg); } }\n\n/* 실시간 변화: 방금 완료된 줄은 체크를 그리고 잠깐 밝힌다, 새 줄은 서서히 나타난다 */\n.dpv-todo[data-just] { animation: dpv-flash 2.5s ease-out; }\n.dpv-todo[data-just] .dpv-icon-fill { animation: dpv-pop 0.35s ease-out; transform-origin: 8px 8px; }\n.dpv-todo[data-just] .dpv-icon-check { animation: dpv-draw 0.45s 0.15s ease-out both; }\n.dpv-todo[data-added] { animation: dpv-enter 0.4s ease-out; }\n@keyframes dpv-flash { 0%, 30% { background: var(--dsw-alias-state-business-tertiary, rgba(61, 123, 224, 0.12)); } 100% { background: transparent; } }\n@keyframes dpv-pop { 0% { transform: scale(0.4); } 70% { transform: scale(1.12); } 100% { transform: scale(1); } }\n@keyframes dpv-draw { from { stroke-dashoffset: 12; } to { stroke-dashoffset: 0; } }\n@keyframes dpv-enter { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n\n/* 펼친 자세히 */\n.dpv-detail { margin: 0 8px 8px 34px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); }\n.dpv-detail-list { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; }\n.dpv-detail-row { display: flex; gap: 6px; white-space: nowrap; }\n.dpv-detail-row dt { color: var(--dsw-alias-label-secondary, #646a73); }\n.dpv-detail-row dd { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-variant-numeric: tabular-nums; }\n.dpv-detail-empty { margin: 0; }\n.dpv-link { min-height: 28px; padding: 0 8px; margin-left: -8px; border: 0; border-radius: 6px; background: transparent; font: inherit; font-size: 13px; color: var(--dsw-alias-state-business-primary, #3d7be0); cursor: pointer; white-space: nowrap; }\n@media (hover: hover) { .dpv-link:hover { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); } }\n\n/* 접는 카드(지난 턴·계획) */\n.dpv-plans { display: flex; flex-direction: column; gap: 10px; }\n.dpv-fold > summary { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px; cursor: pointer; list-style: none; border-radius: var(--dsw-radius-lg, 12px); }\n.dpv-fold > summary::-webkit-details-marker { display: none; }\n@media (hover: hover) { .dpv-fold > summary:hover { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); } }\n.dpv-chevron { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-tertiary, #8f959e); transition: transform 0.12s; }\n.dpv-fold[open] > summary .dpv-chevron { transform: rotate(90deg); }\n.dpv-fold-title { flex: 1 1 auto; min-width: 0; font-size: 14px; line-height: 22px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.dpv-fold > summary .dpv-meta { flex: none; }\n.dpv-fold-body { border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); padding: 4px 4px 8px; }\n.dpv-doc { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 16px; border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); min-width: 0; }\n\n/* 계획 문서 마크다운 */\n.dpv-md { min-width: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary, #1f2329); }\n.dpv-note + .dpv-md { margin-top: 4px; }\n.dpv-md > :first-child { margin-top: 0; }\n.dpv-md > :last-child { margin-bottom: 0; }\n.dpv-md-h { margin: 20px 0 8px; font-weight: 600; color: var(--dsw-alias-label-primary, #1f2329); text-wrap: balance; }\n.dpv-md-h1 { font-size: 17px; line-height: 26px; }\n.dpv-md-h2 { font-size: 15px; line-height: 24px; padding-bottom: 6px; border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); }\n.dpv-md-h3 { font-size: 14px; line-height: 22px; }\n.dpv-md-h4 { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); }\n.dpv-md-p { margin: 8px 0; text-wrap: pretty; }\n.dpv-md-list { margin: 8px 0; padding-left: 22px; }\n.dpv-md-list .dpv-md-list { margin: 4px 0; }\n.dpv-md-li { margin: 4px 0; padding-left: 2px; }\n.dpv-md-li::marker { color: var(--dsw-alias-label-secondary, #646a73); font-variant-numeric: tabular-nums; }\n.dpv-md-li > .dpv-md-p, .dpv-md-task-body > .dpv-md-p { margin: 0; }\n.dpv-md-li > :first-child, .dpv-md-task-body > :first-child { margin-top: 0; }\n.dpv-md-li > :last-child, .dpv-md-task-body > :last-child { margin-bottom: 0; }\n.dpv-md-tasks { padding-left: 0; list-style: none; }\n.dpv-md-tasks > .dpv-md-li:not(.dpv-md-task) { padding-left: 26px; }\n.dpv-md-task { display: flex; align-items: flex-start; gap: 10px; padding-left: 0; }\n.dpv-md-task::marker { content: none; }\n.dpv-md-task-body { flex: 1 1 auto; min-width: 0; }\n.dpv-md-task[data-status='completed'] > .dpv-md-task-body > .dpv-md-p { color: var(--dsw-alias-label-secondary, #646a73); text-decoration: line-through; text-decoration-thickness: 1px; }\n.dpv-md-code {\n  padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em;\n  background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.05)); overflow-wrap: anywhere; word-break: normal;\n}\n.dpv-md-pre {\n  margin: 10px 0; padding: 10px 12px; overflow-x: auto; border-radius: 8px; white-space: pre; word-break: normal;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 20px;\n  background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.05)); border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));\n  scrollbar-width: thin; scrollbar-color: var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l2, rgba(0, 0, 0, 0.2))) transparent;\n}\n.dpv-md-pre > code { font: inherit; }\n.dpv-md-quote { margin: 10px 0; padding: 2px 0 2px 12px; border-left: 3px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); color: var(--dsw-alias-label-secondary, #646a73); }\n.dpv-md-rule { margin: 16px 0; border: 0; border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); }\n.dpv-md-link { color: var(--dsw-alias-state-business-primary, #3d7be0); text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }\n.dpv-md-table-wrap {\n  margin: 10px 0; overflow-x: auto; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));\n  scrollbar-width: thin; scrollbar-color: var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l2, rgba(0, 0, 0, 0.2))) transparent;\n}\n.dpv-md-table { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 20px; }\n.dpv-md-table th, .dpv-md-table td { padding: 6px 10px; text-align: left; vertical-align: top; border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); min-width: 64px; }\n.dpv-md-table th { font-weight: 600; background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); white-space: nowrap; }\n.dpv-md-table tr:last-child td { border-bottom: 0; }\n.dpv-md-pre:focus-visible, .dpv-md-table-wrap:focus-visible, .dpv-md-link:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); outline-offset: 2px;\n}\n\n/* 채팅 머리 진행 칩 */\n.dpv-chip {\n  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; margin: 0;\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: 14px; background: transparent;\n  font: inherit; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary, #646a73); cursor: pointer; white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n@media (hover: hover) { .dpv-chip:hover { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); } }\n.dpv-chip[aria-expanded='true'] { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); }\n.dpv-ring { flex: none; width: 16px; height: 16px; }\n.dpv-ring-track { stroke: var(--dsw-alias-label-tertiary, #8f959e); }\n.dpv-ring-fill { stroke: var(--dsw-alias-state-business-primary, #3d7be0); transition: stroke-dashoffset 0.4s ease; }\n.dpv-ring[data-live] .dpv-ring-fill { animation: dpv-pulse 1.6s ease-in-out infinite; }\n@keyframes dpv-pulse { 50% { opacity: 0.45; } }\n\n/* 칩을 누르면 뜨는 창 */\n.dpv-panel {\n  position: fixed; z-index: 1000; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px;\n  padding: 12px; overflow-y: auto; overscroll-behavior: contain;\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: var(--dsw-radius-lg, 12px);\n  background: var(--dsw-specific-menu, var(--dsw-alias-card-fill, #fff)); box-shadow: var(--dsw-elevation-panel, 0 8px 24px rgba(0, 0, 0, 0.16));\n  backdrop-filter: var(--dsw-menu-backdrop-filter, none);\n  color: var(--dsw-alias-label-primary, #1f2329); word-break: keep-all; overflow-wrap: break-word;\n  scrollbar-width: thin; scrollbar-color: var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l2, rgba(0, 0, 0, 0.2))) transparent;\n}\n.dpv-panel:focus { outline: none; }\n.dpv-panel:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); }\n.dpv-panel-list { padding: 0; }\n.dpv-panel .dpv-todo-compact { padding: 5px 2px; }\n\n/* 멈춘 할 일 이어서 진행. 단추는 테마 색 글자 + 카드 바탕이라 밝음·어두움 모두 대비가 남는다. */\n.dpv-resume { display: flex; flex-direction: column; gap: 4px; padding: 8px 8px 8px 12px; border-radius: var(--dsw-radius-lg, 12px); background: var(--dsw-alias-state-business-tertiary, rgba(61, 123, 224, 0.1)); }\n.dpv-resume-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; }\n.dpv-resume-text { flex: 1 1 12em; min-width: 0; margin: 0; font-size: 14px; line-height: 22px; text-wrap: pretty; }\n.dpv-resume[data-compact] .dpv-resume-text { font-size: 13px; line-height: 20px; }\n.dpv-resume-btn {\n  flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;\n  box-sizing: border-box; min-height: 44px; padding: 0 14px; margin: 0;\n  border: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: 10px;\n  background: var(--dsw-alias-card-fill, #fff); color: var(--dsw-alias-state-business-primary, #3d7be0);\n  font: inherit; font-size: 14px; line-height: 20px; font-weight: 600; white-space: nowrap; cursor: pointer;\n}\n@media (hover: hover) { .dpv-resume-btn:not(:disabled):hover { background: var(--dsw-alias-card-fill-hover, rgba(0, 0, 0, 0.04)); } }\n.dpv-resume-btn:disabled { opacity: 0.55; cursor: default; }\n.dpv-resume-btn:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #3d7be0); outline-offset: 2px; }\n.dpv-play { flex: none; width: 16px; height: 16px; }\n.dpv-resume-note { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #646a73); text-wrap: pretty; }\n.dpv-resume-note:empty { display: none; }\n.dpv-chip-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-business-primary, #3d7be0); }\n\n@media (prefers-reduced-motion: reduce) {\n  .dpv-spin, .dpv-ring[data-live] .dpv-ring-fill, .dpv-todo[data-just], .dpv-todo[data-added],\n  .dpv-todo[data-just] .dpv-icon-fill, .dpv-todo[data-just] .dpv-icon-check { animation: none; }\n  .dpv-progress-fill, .dpv-ring-fill, .dpv-chevron { transition: none; }\n}"

    const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/
    const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/
    const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
    const QUOTE = /^ {0,3}>\s?/
    const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/
    const TASK = /^\[([ xX])\](?:\s+|$)/
    const TABLE_DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
    const SAFE_LINK = /^(https?:\/\/|mailto:)/i
    
    const isBlank = line => line.trim() === ''
    
    function splitCells(line) {
      let body = line.trim()
      if (body.startsWith('|')) body = body.slice(1)
      if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
      const cells = []
      let cell = ''
      let inCode = false
      for (let i = 0; i < body.length; i++) {
        const ch = body[i]
        if (ch === '\\' && body[i + 1] === '|') { cell += '|'; i++; continue }
        if (ch === '`') inCode = !inCode
        if (ch === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue }
        cell += ch
      }
      cells.push(cell.trim())
      return cells
    }
    
    function tableAlign(cell) {
      const left = cell.startsWith(':')
      const right = cell.endsWith(':')
      return left && right ? 'center' : right ? 'right' : left ? 'left' : null
    }
    
    function isTableStart(lines, i) {
      return lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && TABLE_DIVIDER.test(lines[i + 1])
    }
    
    function startsBlock(lines, i) {
      const line = lines[i]
      return FENCE_OPEN.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line)
        || LIST_ITEM.test(line) || isTableStart(lines, i)
    }
    
    function stripIndent(line, width) {
      let n = 0
      while (n < width && line[n] === ' ') n++
      return line.slice(n)
    }
    
    function parseList(lines, start) {
      const first = LIST_ITEM.exec(lines[start])
      const ordered = /\d/.test(first[2])
      const indent = first[1].length
      const items = []
      let i = start
      while (i < lines.length) {
        const found = LIST_ITEM.exec(lines[i])
        if (found === null || found[1].length !== indent || /\d/.test(found[2]) !== ordered) break
        const offset = indent + found[2].length + Math.min(Math.max(found[3].length, 1), 4)
        const body = [found[4]]
        i++
        while (i < lines.length) {
          const line = lines[i]
          if (isBlank(line)) {
            let next = i + 1
            while (next < lines.length && isBlank(lines[next])) next++
            const resumes = next < lines.length && lines[next].length - lines[next].trimStart().length > indent
            if (!resumes) break
            for (; i < next; i++) body.push('')
            continue
          }
          const lead = line.length - line.trimStart().length
          if (lead > indent) { body.push(stripIndent(line, offset)); i++; continue }
          if (!isBlank(body[body.length - 1]) && !startsBlock(lines, i)) { body.push(line.trimStart()); i++; continue }
          break
        }
        let checked = null
        const task = TASK.exec(body[0])
        if (task !== null) {
          checked = task[1] !== ' '
          body[0] = body[0].slice(task[0].length)
        }
        items.push({ checked, children: parseBlocks(body) })
        while (i < lines.length && isBlank(lines[i])) {
          const next = LIST_ITEM.exec(lines[i + 1] ?? '')
          if (next === null || next[1].length !== indent) break
          i++
        }
      }
      const node = { type: 'list', ordered, items }
      if (ordered) node.start = Number.parseInt(first[2], 10)
      return { node, next: i }
    }
    
    function parseBlocks(input) {
      const lines = Array.isArray(input) ? input : String(input ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')
      const blocks = []
      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        if (isBlank(line)) { i++; continue }
    
        const fence = FENCE_OPEN.exec(line)
        if (fence !== null) {
          const mark = fence[1]
          const body = []
          i++
          while (i < lines.length && !new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}\\s*$`).test(lines[i])) body.push(lines[i++])
          i++
          blocks.push({ type: 'code', lang: fence[2] || '', text: body.join('\n') })
          continue
        }
    
        const heading = HEADING.exec(line)
        if (heading !== null) {
          blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2] ?? '') })
          i++
          continue
        }
    
        if (RULE.test(line)) { blocks.push({ type: 'rule' }); i++; continue }
    
        if (QUOTE.test(line)) {
          const body = []
          while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ''))
          blocks.push({ type: 'quote', children: parseBlocks(body) })
          continue
        }
    
        if (LIST_ITEM.test(line)) {
          const { node, next } = parseList(lines, i)
          blocks.push(node)
          i = next
          continue
        }
    
        if (isTableStart(lines, i)) {
          const head = splitCells(line)
          const align = splitCells(lines[i + 1]).map(tableAlign)
          const rows = []
          i += 2
          while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
            const cells = splitCells(lines[i++])
            rows.push(head.map((_, c) => parseInline(cells[c] ?? '')))
          }
          blocks.push({ type: 'table', align: head.map((_, c) => align[c] ?? null), head: head.map(cell => parseInline(cell)), rows })
          continue
        }
    
        const body = [line.trimStart()]
        i++
        while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines, i)) body.push(lines[i++].trimStart())
        blocks.push({ type: 'paragraph', children: parseInline(body.join('\n').trimEnd()) })
      }
      return blocks
    }
    
    
    const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/
    const WORD = /[\p{L}\p{N}]/u
    
    function pushText(out, value) {
      if (value === '') return
      const last = out[out.length - 1]
      if (last?.type === 'text') last.value += value
      else out.push({ type: 'text', value })
    }
    
    function findClose(text, mark, from) {
      for (let at = text.indexOf(mark, from); at !== -1; at = text.indexOf(mark, at + 1)) {
        if (at > from && !/\s/.test(text[at - 1]) && text[at - 1] !== '\\') {
          if (mark === '*' && text[at + 1] === '*') { at++; continue }
          if (mark === '_' && WORD.test(text[at + 1] ?? '')) continue
          return at
        }
      }
      return -1
    }
    
    function readLink(text, at) {
      let depth = 0
      let close = -1
      for (let j = at; j < text.length; j++) {
        if (text[j] === '\\') { j++; continue }
        if (text[j] === '[') depth++
        if (text[j] === ']' && --depth === 0) { close = j; break }
      }
      if (close === -1 || text[close + 1] !== '(') return null
      let parens = 0
      for (let j = close + 2; j < text.length; j++) {
        if (text[j] === '(') parens++
        if (text[j] === ')' && parens-- === 0) {
          const target = text.slice(close + 2, j).trim().replace(/^<|>$/g, '').split(/\s+/)[0]
          return { label: text.slice(at + 1, close), href: target, end: j + 1 }
        }
      }
      return null
    }
    
    const EMPHASIS = [['**', 'strong'], ['__', 'strong'], ['~~', 'del'], ['*', 'em'], ['_', 'em']]
    
    function parseInline(text) {
      const out = []
      let i = 0
      let plain = ''
      const flush = () => { pushText(out, plain); plain = '' }
      while (i < text.length) {
        const ch = text[i]
    
        if (ch === '\\' && text[i + 1] === '\n') { flush(); out.push({ type: 'break' }); i += 2; continue }
        if (ch === '\\' && PUNCTUATION.test(text[i + 1] ?? '')) { plain += text[i + 1]; i += 2; continue }
        if (ch === ' ' && text.startsWith('  \n', i)) {
          let end = i
          while (text[end] === ' ') end++
          if (text[end] === '\n') { flush(); out.push({ type: 'break' }); i = end + 1; continue }
        }
    
        if (ch === '`') {
          let run = 1
          while (text[i + run] === '`') run++
          const ticks = '`'.repeat(run)
          let close = text.indexOf(ticks, i + run)
          while (close !== -1 && text[close + run] === '`') close = text.indexOf(ticks, close + run + 1)
          if (close !== -1) {
            flush()
            let value = text.slice(i + run, close).replace(/\n/g, ' ')
            if (/^ .*[^ ].* $/.test(value)) value = value.slice(1, -1)
            out.push({ type: 'code', value })
            i = close + run
            continue
          }
          plain += ticks
          i += run
          continue
        }
    
        if (ch === '!' && text[i + 1] === '[') {
          const link = readLink(text, i + 1)
          if (link !== null) { plain += link.label; i = link.end; continue }
        }
    
        if (ch === '[') {
          const link = readLink(text, i)
          if (link !== null) {
            flush()
            const children = parseInline(link.label)
            if (SAFE_LINK.test(link.href)) out.push({ type: 'link', href: link.href, children })
            else out.push(...children)
            i = link.end
            continue
          }
        }
    
        if (ch === '<') {
          const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(text.slice(i))
          if (auto !== null) {
            flush()
            out.push({ type: 'link', href: auto[1], children: [{ type: 'text', value: auto[1] }] })
            i += auto[0].length
            continue
          }
        }
    
        const emphasis = EMPHASIS.find(([mark]) => text.startsWith(mark, i))
        if (emphasis !== undefined) {
          const [mark, type] = emphasis
          const opensWord = !(mark[0] === '_' && WORD.test(text[i - 1] ?? ''))
          const nextChar = text[i + mark.length] ?? ''
          if (opensWord && nextChar !== '' && !/\s/.test(nextChar)) {
            const close = findClose(text, mark, i + mark.length)
            if (close !== -1) {
              flush()
              out.push({ type, children: parseInline(text.slice(i + mark.length, close)) })
              i = close + mark.length
              continue
            }
          }
          plain += mark
          i += mark.length
          continue
        }
    
        plain += ch
        i++
      }
      flush()
      return out
    }
    
    function plainText(nodes) {
      return (nodes ?? []).map(node => (node.type === 'text' || node.type === 'code' ? node.value
        : node.type === 'break' ? ' ' : plainText(node.children))).join('')
    }
    
    function parseMarkdown(markdown) {
      return parseBlocks(markdown)
    }
    
    const VIEW_ID = 'dsh-plan-view'
    const PLAN_KIND = 'dsh-plan-view.plan'
    const UNTITLED_PLAN = '제목 없는 계획'
    
    const PLAN_EVENT_TYPES = new Set(['tool/call', 'tool/ptc-dispatch-start', 'tool/ptc-dispatch'])
    
    function isRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    }
    
    function submittedPlanOf(event) {
      if (!isRecord(event) || !PLAN_EVENT_TYPES.has(event.type)) return undefined
      const data = event.data
      if (!isRecord(data) || data.name !== 'exit_plan_mode') return undefined
      const callId = event.type === 'tool/call' ? data.callId : data.subCallId
      if (typeof callId !== 'string' || callId === '') return undefined
      let args = data.arguments
      if (typeof args === 'string') {
        try { args = JSON.parse(args) } catch { return undefined }
      }
      if (!isRecord(args) || typeof args.plan !== 'string' || args.plan.trim() === '') return undefined
      const markdown = args.plan
      const heading = /^#{1,6}\s+(\S[^\r\n]*)/m.exec(markdown.trim())?.[1]?.trim()
      return { callId, title: heading || UNTITLED_PLAN, markdown, seq: typeof event.seq === 'number' ? event.seq : 0 }
    }
    
    function matchPlanEvent(event) {
      const plan = submittedPlanOf(event)
      if (plan === undefined) return null
      return { id: plan.callId, role: event.type === 'tool/ptc-dispatch' ? 'update' : 'start' }
    }
    
    function planNodeOf(context) {
      const data = context.state
      if (data === undefined || data === null) return null
      return { key: context.key, kind: PLAN_KIND, id: context.id, target: VIEW_ID, data }
    }
    
    const TODO_STATUS = {
      completed: { label: '완료' },
      in_progress: { label: '진행 중' },
      pending: { label: '대기' },
    }
    
    function todoItems(value) {
      if (!Array.isArray(value)) return []
      return value
        .filter(item => isRecord(item) && typeof item.content === 'string' && item.content.trim() !== '')
        .map(item => ({ content: item.content, status: item.status in TODO_STATUS ? item.status : 'pending' }))
    }
    
    function todoSummary(items) {
      const count = status => items.filter(item => item.status === status).length
      return ['completed', 'in_progress', 'pending']
        .map(status => [TODO_STATUS[status].label, count(status)])
        .filter(([, n]) => n > 0)
        .map(([label, n]) => `${label} ${n}`)
        .join(' · ')
    }
    
    const HISTORY_KIND = 'dsh-plan-view.todos'
    const HISTORY_ID = 'history'
    const EMPTY_FOLD = Object.freeze({ pendingCallId: undefined, writes: Object.freeze([]) })
    const EMPTY_HISTORY = Object.freeze({ current: null, past: Object.freeze([]) })
    
    function todoCallIdOf(event) {
      if (event === null || typeof event !== 'object') return undefined
      const data = event.data
      if (data === null || typeof data !== 'object' || data.name !== 'todo_write') return undefined
      const id = event.type === 'tool/call' ? data.callId
        : event.type === 'tool/ptc-dispatch-start' ? data.subCallId : undefined
      return typeof id === 'string' && id !== '' ? id : undefined
    }
    
    function matchTodoEvent(event) {
      if (event?.type === 'todo/write' && Array.isArray(event.data?.todos)) return { id: HISTORY_ID, role: 'start' }
      if (todoCallIdOf(event) !== undefined) return { id: HISTORY_ID, role: 'start' }
      return null
    }
    
    function turnOf(location) {
      const turn = location?.turn?.turn
      return typeof turn === 'number' ? turn : null
    }
    
    function foldTodoEvent(state, match) {
      const prev = state ?? EMPTY_FOLD
      const event = match.event
      const callId = todoCallIdOf(event)
      if (callId !== undefined) return prev.pendingCallId === callId ? prev : { ...prev, pendingCallId: callId }
      if (event?.type !== 'todo/write') return prev
      const seq = typeof event.seq === 'number' ? event.seq : 0
      const last = prev.writes[prev.writes.length - 1]
      if (last !== undefined && seq <= last.seq) return prev
      const write = {
        seq,
        time: typeof event.time === 'number' ? event.time : 0,
        turn: turnOf(match.location),
        callId: prev.pendingCallId,
        todos: todoItems(event.data.todos),
      }
      return { pendingCallId: undefined, writes: [...prev.writes, write] }
    }
    
    function summarize(group) {
      const items = group.items
      const done = items.filter(item => item.status === 'completed').length
      return { ...group, done, total: items.length }
    }
    
    function deriveHistory(writes) {
      if (!Array.isArray(writes) || writes.length === 0) return EMPTY_HISTORY
      const timing = new Map()
      const groups = []
      let group
      for (const write of writes) {
        if (group === undefined || group.turn !== write.turn) {
          group = { turn: write.turn, startedAt: write.time, endedAt: write.time, lastSeq: write.seq, items: [] }
          groups.push(group)
        }
        group.endedAt = write.time
        group.lastSeq = write.seq
        group.items = write.todos.map(todo => {
          const prev = timing.get(todo.content) ?? { content: todo.content, firstSeenAt: write.time }
          const next = { ...prev, status: todo.status }
          if (todo.status === 'in_progress' && next.startedAt === undefined) {
            next.startedAt = write.time
            next.startCallId = write.callId
          }
          if (todo.status === 'completed' && next.completedAt === undefined) {
            next.completedAt = write.time
            next.doneCallId = write.callId
          }
          if (todo.status !== 'completed' && next.completedAt !== undefined) {
            next.completedAt = undefined
            next.doneCallId = undefined
          }
          timing.set(todo.content, next)
          return next
        })
      }
      const summarized = groups.map(summarize)
      return { current: summarized[summarized.length - 1], past: summarized.slice(0, -1).reverse() }
    }
    
    function currentTodos(history, projection) {
      if (history?.current) return { ...history.current, carried: projection === null }
      const items = todoItems(projection)
      if (items.length === 0) return null
      const done = items.filter(item => item.status === 'completed').length
      return { turn: null, items, done, total: items.length, carried: false }
    }
    
    function todosAfter(writes, seq, until) {
      const end = until ?? Infinity
      const latest = new Map()
      for (const write of writes ?? []) {
        if (write.seq <= seq || write.seq >= end) continue
        for (const todo of write.todos) latest.set(todo.content, todo.status)
      }
      return [...latest].map(([content, status]) => ({ content, status }))
    }
    
    function itemElapsed(item, now) {
      if (item.startedAt === undefined) return undefined
      const end = item.completedAt ?? now
      return end >= item.startedAt ? end - item.startedAt : undefined
    }
    
    function formatDuration(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return ''
      const total = Math.floor(ms / 1000)
      if (total < 60) return `${total}초`
      const minutes = Math.floor(total / 60)
      if (minutes < 60) {
        const seconds = total % 60
        return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`
      }
      const hours = Math.floor(minutes / 60)
      const rest = minutes % 60
      return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`
    }
    
    function formatClock(time) {
      if (typeof time !== 'number' || time <= 0) return ''
      return new Date(time).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
    }
    
    const MATCH_THRESHOLD = 0.5
    const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(\S.*)$/
    const FENCE = /^\s*(```|~~~)/
    
    function normalizeStep(text) {
      return String(text)
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[`*_~]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLowerCase()
    }
    
    function bigrams(text) {
      const compact = text.replace(/\s+/g, '')
      const counts = new Map()
      for (let i = 0; i < compact.length - 1; i++) {
        const pair = compact.slice(i, i + 2)
        counts.set(pair, (counts.get(pair) ?? 0) + 1)
      }
      return { counts, size: Math.max(compact.length - 1, 0), compact }
    }
    
    function similarity(a, b) {
      const x = bigrams(normalizeStep(a))
      const y = bigrams(normalizeStep(b))
      if (x.compact === '' || y.compact === '') return 0
      if (x.compact === y.compact) return 1
      let shared = 0
      for (const [pair, n] of x.counts) shared += Math.min(n, y.counts.get(pair) ?? 0)
      const dice = x.size + y.size === 0 ? 0 : (2 * shared) / (x.size + y.size)
      const [short, long] = x.compact.length <= y.compact.length ? [x.compact, y.compact] : [y.compact, x.compact]
      return short.length >= 4 && long.includes(short) ? Math.max(dice, 0.75) : dice
    }
    
    function planSteps(markdown) {
      const steps = []
      let fenced = false
      String(markdown).split('\n').forEach((line, index) => {
        if (FENCE.test(line)) { fenced = !fenced; return }
        if (fenced) return
        const found = LIST_LINE.exec(line)
        if (found === null) return
        steps.push({ index, indent: found[1], marker: found[2], checked: found[3], text: found[4] })
      })
      return steps
    }
    
    function checkPlanMarkdown(markdown, todos) {
      const steps = planSteps(markdown)
      const pairs = []
      steps.forEach((step, s) => (todos ?? []).forEach((todo, t) => {
        const score = similarity(step.text, todo.content)
        if (score >= MATCH_THRESHOLD) pairs.push({ s, t, score })
      }))
      pairs.sort((a, b) => b.score - a.score || a.s - b.s)
      const stepUsed = new Map()
      const todoUsed = new Set()
      for (const pair of pairs) {
        if (stepUsed.has(pair.s) || todoUsed.has(pair.t)) continue
        stepUsed.set(pair.s, todos[pair.t])
        todoUsed.add(pair.t)
      }
      if (stepUsed.size === 0) return { markdown, matched: 0, done: 0 }
      const lines = String(markdown).split('\n')
      let done = 0
      for (const [s, todo] of stepUsed) {
        const step = steps[s]
        const isDone = todo.status === 'completed'
        if (isDone) done++
        lines[step.index] = `${step.indent}${step.marker} [${isDone ? 'x' : ' '}] ${step.text}`
      }
      return { markdown: lines.join('\n'), matched: stepUsed.size, done }
    }
    
    const EMPTY_SNAPSHOT = Object.freeze({
      plans: Object.freeze([]), writes: EMPTY_FOLD.writes, history: EMPTY_HISTORY,
    })
    
    function historyNodeOf(context) {
      const writes = context.state?.writes
      if (!Array.isArray(writes) || writes.length === 0) return null
      return { key: context.key, kind: HISTORY_KIND, id: context.id, target: VIEW_ID, data: writes }
    }
    
    function createViewBuilder() {
      let plans = new Map()
      let writes = EMPTY_FOLD.writes
      let snapshot = EMPTY_SNAPSHOT
      const publish = () => {
        const list = [...plans.values()].sort((a, b) => b.seq - a.seq)
        snapshot = list.length === 0 && writes.length === 0
          ? EMPTY_SNAPSHOT
          : { plans: list, writes, history: deriveHistory(writes) }
        return snapshot
      }
      const take = (node) => {
        if (node.kind === PLAN_KIND) {
          if (plans.get(node.key) === node.data) return false
          plans.set(node.key, node.data)
          return true
        }
        if (node.kind === HISTORY_KIND) {
          if (writes === node.data) return false
          writes = node.data
          return true
        }
        return false
      }
      return {
        empty: EMPTY_SNAPSHOT,
        replace({ nodes }) {
          plans = new Map()
          writes = EMPTY_FOLD.writes
          for (const node of nodes) take(node)
          return publish()
        },
        apply({ upserts }) {
          let changed = false
          for (const node of upserts) changed = take(node) || changed
          return changed ? publish() : snapshot
        },
      }
    }
    
    const RESUME_LIST_MAX = 5
    
    function remainingTodos(list) {
      return (list?.items ?? []).filter(item => item.status !== 'completed')
    }
    
    function resumeStateOf({ list, running, phase, pending, subagent, lastError, canSend }) {
      if (!canSend || running || subagent) return null
      if (phase !== undefined && phase !== 'plain') return null
      if (pending > 0) return null
      const remaining = remainingTodos(list)
      if (remaining.length === 0) return null
      return { remaining, reason: typeof lastError === 'string' && lastError.trim() !== '' ? 'error' : 'stopped' }
    }
    
    function resumePromptOf(remaining) {
      const ordered = [
        ...remaining.filter(item => item.status === 'in_progress'),
        ...remaining.filter(item => item.status !== 'in_progress'),
      ]
      const shown = ordered.slice(0, RESUME_LIST_MAX)
      const lines = shown.map(item => `- ${item.content}${item.status === 'in_progress' ? ' (진행 중에 멈춤)' : ''}`)
      if (ordered.length > shown.length) lines.push(`- 외 ${ordered.length - shown.length}개`)
      return ['멈춘 곳부터 남은 할 일을 이어서 진행해 주세요.', ...lines].join('\n')
    }
    
    function sendResume(actions, hasDraft, text) {
      if (!actions) return 'failed'
      try {
        if (!hasDraft) {
          actions.setDraft(text)
          actions.submit()
          return 'sent'
        }
        return actions.insertText(`\n${text}`, actions.captureInsertion()) ? 'inserted' : 'failed'
      } catch (_error) {
        return 'failed'
      }
    }
    
    const RESUME_RESULT_TEXT = {
      sent: '이어서 진행해 달라고 보냈어요.',
      inserted: '입력창에 쓰던 글이 있어 요청을 덧붙이기만 했어요. 확인하고 직접 보내 주세요.',
      failed: '지금은 보내지 못했어요. 잠시 뒤 다시 눌러 주세요.',
    }

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

    function PlayIcon() {
      return svg({ className: 'dpv-play', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' },
        h('path', { d: 'M5 3.25v9.5L12.75 8z' }))
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

    // ── 이어서 진행 ───────────────────────────────────────────
    // 남은 할 일이 있는데 세션이 멈췄으면 단추를 보인다. 사람이 누를 때만 보내고,
    // 입력창에 쓰던 글이 있으면 지우지 않고 덧붙이기만 한다(src/resume.js).

    function useResume({ list, running, useSession, useInput, inputActions }) {
      const pending = useSession(s => s?.pendingSubmissions?.length ?? 0)
      const subagent = useSession(s => s?.subagent != null)
      const lastError = useSession(s => s?.lastAgentError ?? null)
      // useInput은 DSH 세션 자리의 표준 속성이다. 없는 틀(미리보기·시험)에서는 빈 입력창으로 본다.
      const phase = typeof useInput === 'function' ? useInput(s => s?.phase) : undefined
      const hasDraft = typeof useInput === 'function'
        ? useInput(s => String(s?.draft ?? '').trim() !== '' || (s?.attachmentIds?.length ?? 0) > 0)
        : false
      const [note, setNote] = useState('')
      const [busy, setBusy] = useState(false)
      const state = resumeStateOf({ list, running, phase, pending, subagent, lastError, canSend: inputActions != null })
      const signature = state === null ? '' : state.remaining.map(item => `${item.status}\u0000${item.content}`).join('\u0001')
      useEffect(() => {
        setBusy(false)
        if (running) setNote('')
      }, [running, signature])
      const send = () => {
        if (state === null || busy) return
        const result = sendResume(inputActions, hasDraft, resumePromptOf(state.remaining))
        setNote(RESUME_RESULT_TEXT[result])
        if (result === 'sent') setBusy(true)
      }
      return { state, note, busy, send }
    }

    function ResumeBar({ resume, compact }) {
      const { state, note, busy, send } = resume
      if (state === null) return null
      const count = state.remaining.length
      const message = state.reason === 'error'
        ? `오류로 멈췄어요. 남은 할 일 ${count}개를 이어서 할 수 있어요.`
        : `남은 할 일 ${count}개가 있는데 멈췄어요.`
      return h('div', { className: 'dpv-resume', 'data-compact': compact ? '' : undefined, 'data-reason': state.reason },
        h('div', { className: 'dpv-resume-row' },
          h('p', { className: 'dpv-resume-text' }, message),
          h('button', {
            type: 'button', className: 'dpv-resume-btn', onClick: send, disabled: busy,
            title: '남은 할 일을 이어서 진행해 달라고 보내요. 입력창에 쓰던 글이 있으면 덧붙이기만 해요.',
          }, h(PlayIcon), h('span', null, '이어서 진행'))),
        h('p', { className: 'dpv-resume-note', role: 'status' }, note))
    }

    // ── 계획 탭 ───────────────────────────────────────────────

    function TodoSection({ list, running, inspectCall, resume }) {
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
            })))),
        items.length === 0 ? null : h(ResumeBar, { resume }))
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

    function PlanView({ useProjection, usePlanState, useSession, useInput, inputActions, inspectCall }) {
      const state = usePlanState(s => s)
      const projection = useProjection('todos')
      const running = useSession(s => s?.running === true)
      const list = currentTodos(state.history, projection)
      const resume = useResume({ list, running, useSession, useInput, inputActions })
      return h('div', { className: 'dpv-root', 'data-plugin': 'dsh-plan-view' },
        h(TodoSection, { list, running, inspectCall, resume }),
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

    function ProgressChip({ useProjection, usePlanState, useSession, useInput, inputActions }) {
      const state = usePlanState(s => s)
      const projection = useProjection('todos')
      const running = useSession(s => s?.running === true)
      const list = currentTodos(state.history, projection)
      const resume = useResume({ list, running, useSession, useInput, inputActions })
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
      const stopped = resume.state !== null
      const label = `계획 진행 ${list.done}/${list.total}${live ? ', 진행 중' : stopped ? ', 멈춤 · 이어서 진행할 수 있어요' : ''}`
      return h(React.Fragment, null,
        h('button', {
          type: 'button', ref: button, className: 'dpv-chip', 'aria-expanded': open, 'aria-controls': panelId,
          'aria-label': label, title: label, onClick: () => setOpen(value => !value),
          'data-stopped': stopped ? '' : undefined,
        },
        h(ProgressRing, { done: list.done, total: list.total, live }),
        h('span', { className: 'dpv-chip-text' }, `${list.done}/${list.total}`),
        stopped ? h('span', { className: 'dpv-chip-dot', 'aria-hidden': true }) : null),
        open && place !== null
          ? ReactDOM.createPortal(h('div', {
            ref: panel, id: panelId, className: 'dpv-panel', role: 'dialog', 'aria-modal': false,
            'aria-labelledby': `${panelId}-title`, tabIndex: -1,
            style: { top: `${place.top}px`, left: `${place.left}px`, width: `${place.width}px`, maxHeight: `${place.maxHeight}px` },
            // 창 안 단추 사이는 Tab으로 옮기고, 처음·끝을 넘어가면 창을 닫고 칩으로 돌아간다.
            onKeyDown: (event) => {
              if (event.key !== 'Tab') return
              const items = [...panel.current.querySelectorAll('button:not([disabled])')]
              const at = document.activeElement
              const out = items.length === 0 || (event.shiftKey ? at === items[0] || at === panel.current : at === items[items.length - 1])
              if (out) { event.preventDefault(); close(true) }
            },
          },
          h('div', { className: 'dpv-head' },
            h('h2', { className: 'dpv-title', id: `${panelId}-title` }, '계획 진행'),
            h('span', { className: 'dpv-meta' }, `${list.done}/${list.total} 완료`),
            list.carried ? h('span', { className: 'dpv-badge' }, '직전 턴 목록') : null),
          h(ProgressBar, { done: list.done, total: list.total }),
          h('ul', { className: 'dpv-todos dpv-panel-list' }, items.map(item =>
            h(CompactRow, { key: item.content, item, now, running }))),
          h(ResumeBar, { resume, compact: true }),
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
