window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-code-map',
  factory(require) {
    const React = require('react')
    const { createElement: h, useEffect, useId, useRef, useState } = React
    // The services DSH hands this plugin; the view falls back to plain paths without them.
    const host = { current: null }
    const CSS = `
.dcm-view {
  --cm-fg: var(--dsw-alias-label-primary, #1b2230);
  --cm-muted: var(--dsw-alias-label-secondary, #536176);
  --cm-surface: var(--dsw-alias-background-main, #fff);
  --cm-soft: var(--dsw-alias-interactive-bg-hover, #f3f6fb);
  --cm-line: var(--dsw-alias-border-l3, #d9e1eb);
  --cm-edge: #718198;
  --cm-focus: #315ac7;
  box-sizing: border-box; max-width: 44rem; width: 100%; margin-inline: auto;
  padding: clamp(16px, 4vw, 36px); color: var(--cm-fg); color-scheme: inherit;
  font: inherit; font-size: 15px; line-height: 1.6; word-break: keep-all; container-type: inline-size;
  scrollbar-width: thin; scrollbar-color: var(--cm-edge) transparent; caret-color: var(--cm-wait);
}
.dcm-view ::selection { background: color-mix(in srgb, var(--cm-wait) 26%, transparent); color: inherit; }
@media (prefers-color-scheme: dark) {
  .dcm-view { --cm-fg: var(--dsw-alias-label-primary, #f0f3f8); --cm-muted: var(--dsw-alias-label-secondary, #b7c3d4);
    --cm-surface: var(--dsw-alias-background-main, #171c27); --cm-soft: var(--dsw-alias-interactive-bg-hover, #222a38);
    --cm-line: var(--dsw-alias-border-l3, #3e4c62); --cm-edge: #8191ab; --cm-focus: #a9c2ff; }
}
:is([data-theme="dark"], .dark) .dcm-view {
  --cm-fg: var(--dsw-alias-label-primary, #f0f3f8); --cm-muted: var(--dsw-alias-label-secondary, #b7c3d4);
  --cm-surface: var(--dsw-alias-background-main, #171c27); --cm-soft: var(--dsw-alias-interactive-bg-hover, #222a38);
  --cm-line: var(--dsw-alias-border-l3, #3e4c62); --cm-edge: #8191ab; --cm-focus: #a9c2ff;
}
:is([data-theme="light"], .light) .dcm-view {
  --cm-fg: var(--dsw-alias-label-primary, #1b2230); --cm-muted: var(--dsw-alias-label-secondary, #536176);
  --cm-surface: var(--dsw-alias-background-main, #fff); --cm-soft: var(--dsw-alias-interactive-bg-hover, #f3f6fb);
  --cm-line: var(--dsw-alias-border-l3, #d9e1eb); --cm-edge: #718198; --cm-focus: #315ac7;
}
/* One hue, one meaning: wait = in progress or clickable, ok = the map read all code, warn = code may be missing,
   err = failed, idle = nothing to report. A tone is only ever a solid fill with its own readable ink on it
   (--on-*), never colored text, so no state turns into a muddy tint on either theme. Every fill also carries
   an icon and words. */
.dcm-view { --cm-wait: #1d4ed8; --on-wait: #fff; --cm-ok: #15803d; --on-ok: #fff; --cm-warn: #fbbf24; --on-warn: #1f1700;
  --cm-err: #b42318; --on-err: #fff; --cm-idle: #475467; --on-idle: #fff; }
@media (prefers-color-scheme: dark) {
  .dcm-view { --cm-wait: #8db3ff; --on-wait: #0b1530; --cm-ok: #6ee7a0; --on-ok: #052e16; --cm-warn: #fbbf24; --on-warn: #1f1700;
    --cm-err: #ff8f86; --on-err: #3b0a07; --cm-idle: #c0c7d4; --on-idle: #161b26; }
}
:is([data-theme="dark"], .dark) .dcm-view { --cm-wait: #8db3ff; --on-wait: #0b1530; --cm-ok: #6ee7a0; --on-ok: #052e16; --cm-warn: #fbbf24; --on-warn: #1f1700;
  --cm-err: #ff8f86; --on-err: #3b0a07; --cm-idle: #c0c7d4; --on-idle: #161b26; }
:is([data-theme="light"], .light) .dcm-view { --cm-wait: #1d4ed8; --on-wait: #fff; --cm-ok: #15803d; --on-ok: #fff; --cm-warn: #fbbf24; --on-warn: #1f1700;
  --cm-err: #b42318; --on-err: #fff; --cm-idle: #475467; --on-idle: #fff; }
.dcm-view [data-tone="wait"] { --tone: var(--cm-wait); --on-tone: var(--on-wait); }
.dcm-view [data-tone="ok"] { --tone: var(--cm-ok); --on-tone: var(--on-ok); }
.dcm-view [data-tone="warn"] { --tone: var(--cm-warn); --on-tone: var(--on-warn); }
.dcm-view [data-tone="err"] { --tone: var(--cm-err); --on-tone: var(--on-err); }
.dcm-view [data-tone="idle"] { --tone: var(--cm-idle); --on-tone: var(--on-idle); }
.dcm-view *, .dcm-view *::before { box-sizing: border-box; }
.dcm-view h2, .dcm-view h3, .dcm-view h4, .dcm-view p { margin: 0; }
.dcm-view h2 { font-size: 24px; line-height: 1.3; letter-spacing: -.03em; }
.dcm-view h3 { font-size: 17px; line-height: 1.4; letter-spacing: -.015em; }
.dcm-view p { text-wrap: pretty; max-width: 62ch; }
.dcm-view .dcm-muted { color: var(--cm-muted); font-size: 14px; line-height: 1.6; }
.dcm-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 16px; row-gap: 8px; align-items: center; margin-bottom: 24px; }
.dcm-head h2 { grid-column: 1; grid-row: 1; white-space: nowrap; translate: 0 .6px; }
.dcm-meta { display: flex; gap: 10px; grid-column: 1 / -1; grid-row: 2; align-items: center; min-width: 0; }
.dcm-repo { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcm-actions { grid-column: 2; grid-row: 1; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; align-items: center; gap: 8px; }
.dcm-actions > * { min-width: 0; }
.dcm-state { display: inline-flex; align-items: center; padding: 4px 12px 4px 9px; width: max-content; gap: 6px;
  border-radius: 999px; font-size: 13px; font-weight: 600; line-height: 20px; white-space: nowrap; font-variant-numeric: tabular-nums;
  color: var(--on-tone); background: var(--tone); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--on-tone) 22%, transparent); }
.dcm-icon { display: inline-flex; flex: none; align-items: center; justify-content: center; width: var(--s, 24px); height: var(--s, 24px); color: inherit; }
.dcm-icon svg { display: block; width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.dcm-badge { width: var(--b, 36px); height: var(--b, 36px); border-radius: 50%; background: var(--tone); color: var(--on-tone);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--on-tone) 22%, transparent); }
.dcm-badge svg { width: var(--s, 20px); height: var(--s, 20px); }
.dcm-stack { display: grid; gap: 0; align-items: start; }
.dcm-footer, .dcm-status, .dcm-welcome { grid-column: 1 / -1; }
/* The one boxed block: the answer. Everything below it is flat sections split by hairlines. */
.dcm-summary { display: grid; grid-template-columns: 36px minmax(0, 1fr); column-gap: 14px; row-gap: 4px; align-items: start;
  padding: 18px 20px; background: var(--cm-surface); border: 1px solid var(--cm-line); border-radius: 14px; }
.dcm-summary-icon { grid-row: 1 / span 3; }
.dcm-view .dcm-summary h3 { font-size: 20px; line-height: 28px; grid-column: 2; text-wrap: balance; margin-top: 4px; }
.dcm-view .dcm-summary p { grid-column: 2; }
.dcm-view .dcm-summary p[data-tone] { color: var(--cm-fg); font-weight: 600; }
.dcm-card { display: grid; align-content: start; gap: 14px; min-width: 0; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--cm-line); }
.dcm-summary + .dcm-card { margin-top: 28px; }
.dcm-welcome { padding: 18px 20px; border: 1px solid var(--cm-line); border-radius: 14px; margin-top: 0; }
.dcm-card-title { display: grid; gap: 4px; min-width: 0; }
.dcm-card-title h3 { white-space: nowrap; }
.dcm-view .dcm-button, .dcm-view .dcm-link {
  display: inline-flex; font: inherit; font-size: 14px; font-weight: 600; line-height: 20px; white-space: nowrap;
  align-items: center; justify-content: center; min-width: 44px; min-height: 44px; padding: 0 14px;
  background: var(--cm-surface); color: var(--cm-fg); border: 1px solid var(--cm-edge);
  border-radius: 8px; cursor: pointer; text-decoration: none; transition: background-color 160ms ease-out;
}
.dcm-view .dcm-button:hover, .dcm-view .dcm-link:hover { background: var(--cm-soft); }
.dcm-view .dcm-button:disabled { opacity: .62; cursor: default; }
.dcm-view .dcm-primary { color: var(--on-wait); background: var(--cm-wait); border-color: var(--cm-wait); }
.dcm-view .dcm-primary:hover { background: var(--cm-wait); filter: brightness(1.08); }
.dcm-view :is(button, input, a):focus-visible { outline: 2px solid var(--cm-focus); outline-offset: 2px; }
.dcm-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.dcm-form label { grid-column: 1 / -1; font-size: 14px; font-weight: 600; }
.dcm-view input { font: inherit; font-size: 16px; color: var(--cm-fg); min-width: 0; width: 100%;
  min-height: 44px; padding: 8px 12px; border: 1px solid var(--cm-edge); border-radius: 8px; background: var(--cm-surface); }
.dcm-view input::placeholder { color: var(--cm-muted); opacity: 1; }
.dcm-list { list-style: none; display: grid; margin: 0; padding: 0; gap: 0; }
.dcm-list li { min-width: 0; padding: 10px 0; display: grid; grid-template-columns: minmax(0, 1fr) auto;
  align-items: center; gap: 6px 12px; border-top: 1px solid var(--cm-line); }
.dcm-evidence { display: grid; min-width: 0; gap: 2px; }
.dcm-symbol { font-size: 15px; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* A file shows its name first and its folder second: the name is what the eye looks for. */
.dcm-path { display: grid; gap: 1px; min-width: 0; text-align: start; }
.dcm-view code { display: block; min-width: 0; line-height: 1.45; overflow-wrap: anywhere; word-break: normal; }
.dcm-name { font-size: 14px; font-weight: 600; color: var(--cm-fg); }
.dcm-dir { font-size: 13px; color: var(--cm-muted); }
.dcm-details { display: grid; gap: 6px; margin-top: 2px; }
.dcm-details h4 { font-size: 15px; line-height: 1.4; margin-bottom: 2px; }
.dcm-all { border-top: 1px solid var(--cm-line); }
.dcm-view summary { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 0; cursor: pointer; list-style: none;
  color: var(--cm-fg); font-size: 15px; font-weight: 600; }
.dcm-view summary::-webkit-details-marker { display: none; }
.dcm-view summary::before { content: ''; flex: none; width: 7px; height: 7px; margin-inline: 3px 4px; border-right: 2px solid var(--cm-muted); border-bottom: 2px solid var(--cm-muted);
  transform: rotate(-45deg); transition: transform 160ms ease-out; }
.dcm-view details[open] > summary::before { transform: rotate(45deg); }
.dcm-view summary small { margin-inline-start: auto; font-size: 13px; font-weight: 400; color: var(--cm-muted); text-align: end; text-wrap: balance; }
@container (max-width: 520px) {
  .dcm-view summary { flex-wrap: wrap; row-gap: 0; }
  .dcm-view summary small { flex: 1 0 calc(100% - 24px); margin-inline-start: 24px; margin-top: -6px; padding-bottom: 6px; text-align: start; }
}
.dcm-all[open] summary { margin-bottom: 6px; }
.dcm-view summary:focus-visible { outline: 2px solid var(--cm-focus); outline-offset: 2px; border-radius: 4px; }
.dcm-status:empty { position: absolute; width: 1px; height: 1px; overflow: hidden; }
.dcm-welcome .dcm-button, .dcm-welcome .dcm-link { justify-self: start; }
.dcm-gaps { display: grid; margin: 0; padding: 0; list-style: none; }
.dcm-gap { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 16px; align-items: center; padding: 12px 0;
  border-top: 1px solid var(--cm-line); font-size: 15px; line-height: 1.5; }
.dcm-gap strong { font-weight: 600; text-align: end; font-variant-numeric: tabular-nums; }
/* A count needs a look only when it wears the warn fill; calm rows stay plain text. */
.dcm-gap[data-tone="warn"] strong { min-width: 2.6em; padding: 1px 12px; border-radius: 999px; text-align: center; color: var(--on-tone); background: var(--tone);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--on-tone) 22%, transparent); }
.dcm-gap[data-tone="idle"] strong { color: var(--cm-fg); }
@container (max-width: 520px) {
  .dcm-gap { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .dcm-gap strong { text-align: start; justify-self: start; }
}
.dcm-gap > div { display: grid; gap: 2px; min-width: 0; }
.dcm-gap small { display: block; font-size: 13px; line-height: 1.5; color: var(--cm-muted); font-weight: 400; text-wrap: balance; }
.dcm-gap-title { margin-top: 8px; }
.dcm-files { list-style: none; margin: 0; padding: 0; display: grid; }
.dcm-view .dcm-file { display: flex; align-items: center; width: 100%; max-width: 100%; text-align: start; font: inherit; padding: 6px 0; margin: 0; min-height: 48px;
  background: none; border: 0; cursor: pointer; color: var(--cm-wait); }
.dcm-view .dcm-file .dcm-name { color: var(--cm-wait); text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 3px;
  transition: text-decoration-color 160ms ease-out; }
.dcm-view .dcm-file:hover .dcm-name { text-decoration-color: currentColor; }
.dcm-quietbox { border-top: 1px solid var(--cm-line); margin-top: 10px; }
.dcm-search { border-top: 1px solid var(--cm-line); margin-top: 32px; }
.dcm-search > div { display: grid; gap: 14px; padding: 8px 0 16px; }
.dcm-quiet { justify-self: center; display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; margin-top: 8px;
  padding: 0 12px; font: inherit; font-size: 14px; line-height: 20px; color: var(--cm-muted); background: none; border: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.dcm-quiet:hover { color: var(--cm-fg); }
.dcm-quiet:disabled { opacity: .62; cursor: default; }
.dcm-footer { margin-top: 16px; }
@media (prefers-reduced-motion: reduce) { .dcm-view * { transition: none !important; } }
@media (max-width: 470px) {
  .dcm-head { column-gap: 8px; }
  .dcm-view .dcm-actions .dcm-button { padding-inline: 10px; }
}
`
    const ROUTE = '/api/dsh-code-map'
    const RELEASES = 'https://github.com/DeusData/codebase-memory-mcp/releases/tag/v0.12.1'
    const FOCUS_NOTE = {
      'no-identifier': '최근 코딩 요청에 함수나 파일 이름이 없어서 위치를 자동으로 붙이지 않았어요. 여기서 직접 찾아 보세요.',
      'no-match': '최근 코딩 요청의 이름과 맞는 위치를 지도에서 찾지 못했어요. 여기서 다른 이름으로 찾아 보세요.',
    }

    function Button({ children, primary, ...props }) {
      return h('button', { type: 'button', className: 'dcm-button' + (primary ? ' dcm-primary' : ''), ...props }, children)
    }

    function PathText({ value, file = value, onOpen, line }) {
      const cut = value.lastIndexOf('/')
      const dir = value.slice(0, cut + 1)
      const folders = dir ? dir.split('/').slice(0, -1).flatMap((part, index) => [part, '/', h('wbr', { key: index })]) : []
      const body = h('span', { className: 'dcm-path' },
        h('code', { className: 'dcm-name' }, value.slice(cut + 1)),
        dir && h('code', { className: 'dcm-dir' }, folders))
      if (!onOpen) return body
      return h('button', { type: 'button', className: 'dcm-file', 'data-qa-multiline': '', onClick: () => onOpen(file, line),
        'aria-label': '오른쪽 사이드바에서 열기 · ' + value }, body)
    }

    // A repository-relative path becomes the address DSH's own file menu opens
    // in the right sidebar: relative to the session folder, or absolute when
    // the file lies outside it.
    const encodeSegment = segment => encodeURIComponent(segment).replace(/%3A/gi, ':')
    function fileAddress(sessionId, cwd, root, file) {
      const absolute = root ? root.replace(/\/+$/, '') + '/' + file.replace(/^(?:\.?\/)+/, '') : file
      const base = cwd ? cwd.replace(/\/+$/, '') : ''
      const path = base && absolute.startsWith(base + '/') ? absolute.slice(base.length + 1) : absolute
      return 'dsh-resource://file/session/' + encodeSegment(sessionId) + '/' + path.split('/').map(encodeSegment).join('/')
    }

    // One icon per tone, so a state is never told apart by color alone.
    const ICONS = {
      wait: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 6v6l4 2' }]],
      ok: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M8 12.5l2.7 2.7L16 9.5' }]],
      warn: [['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }],
        ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]],
      err: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M9 9l6 6M15 9l-6 6' }]],
      idle: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
    }

    function Icon({ tone, size, badge, className = '' }) {
      return h('span', { className: 'dcm-icon ' + (badge ? 'dcm-badge ' : '') + className, 'data-tone': tone, 'aria-hidden': 'true',
        style: { '--s': size + 'px', ...(badge && { '--b': badge + 'px' }) } },
        h('svg', { viewBox: '0 0 24 24', focusable: 'false' }, ICONS[tone].map(([tag, props], index) => h(tag, { key: index, ...props }))))
    }

    function amount(value) {
      if (value === null || value === undefined) return '확인 안 됨'
      return value === 0 ? '없음' : value + '개'
    }

    // The numbers say how much of the repository the map could not read, so
    // they are listed even at zero: a short result is not mistaken for a full one.
    // Files that might be code are told apart from prose, settings and media, so a
    // warning means something worth a look. `state` is none, some or unknown.
    function gapsOf(coverage) {
      if (!coverage) return { state: 'unknown', look: [], quiet: [] }
      const map = coverage.unmapped
      const look = []
      const quiet = []
      if (map) {
        const hint = map.lookTop?.length ? '주로 ' + map.lookTop.map(item => item.ext + ' ' + item.files + '개').join(', ') : ''
        look.push({ label: '지도에 없는 코드·알 수 없는 파일', value: map.look, hint })
        quiet.push({ label: '테스트 파일', short: '테스트', value: map.tests,
          hint: '지도가 건너뛴 폴더라서 테스트가 부르는 곳은 안 나와요.' })
        quiet.push({ label: '문서·설정·이미지 등', short: '문서·설정·이미지', value: map.quiet, hint: '코드가 아니라서 지도 대상이 아니에요.' })
      } else {
        // The survey failed (null) or an older code map sent only the engine's counts.
        look.push({ label: '지도에 넣지 못한 파일', value: map === null ? null : coverage.notIndexed })
        const formats = coverage.unknownFormats
        if (formats !== undefined) {
          const list = Array.isArray(formats) ? formats : null
          const text = list === null ? '' : list.slice(0, 3).map(item => item.ext + ' ' + item.files + '개').join(', ') +
            (list.length > 3 ? ' 외 ' + (list.length - 3) + '종' : '')
          look.push({ label: '형식을 몰라 건너뛴 파일', value: list === null ? null : list.length, text })
        }
      }
      look.push({ label: '일부만 읽은 파일', value: coverage.partial })
      look.push({ label: '읽지 못한 파일', value: coverage.unusable })
      const unknown = look.some(row => row.value === null || row.value === undefined)
      const some = look.some(row => row.value > 0)
      return { state: unknown ? 'unknown' : some ? 'some' : 'none', look, quiet }
    }

    // Whether the map read all the code, for the pill and the headline together.
    function readState(data) {
      const gaps = gapsOf(data.coverage).state
      return gaps === 'some' || data.partial ? 'some' : gaps
    }

    function GapRow({ row, calm }) {
      const unknown = row.value === null || row.value === undefined
      const tone = !calm && (unknown || row.value > 0) ? 'warn' : 'idle'
      return h('li', { className: 'dcm-gap', 'data-tone': tone },
        h('div', null, h('span', null, row.label), (row.hint || (row.value > 0 && row.text)) && h('small', null, row.hint || row.text)),
        h('strong', null, amount(row.value)))
    }

    function Coverage({ coverage }) {
      if (!coverage) return null
      const { look, quiet } = gapsOf(coverage)
      return h('section', { className: 'dcm-card' },
        h('div', { className: 'dcm-card-title' },
          h('h3', null, '지도가 못 읽은 범위'),
          h('p', { className: 'dcm-muted' }, '“확인이 필요한 범위”에 있는 코드는 위 결과에서 빠질 수 있어요.')),
        h('div', null,
          h('h4', { className: 'dcm-gap-title' }, '확인이 필요한 범위'),
          h('ul', { className: 'dcm-gaps', 'aria-label': '지도에서 읽지 못한 코드 범위' }, look.map(row => h(GapRow, { key: row.label, row })))),
        !!quiet.length && h('details', { className: 'dcm-quietbox' },
          h('summary', null, h('span', null, '지도 대상이 아닌 파일'), ' ',
            h('small', null, quiet.map(row => row.short + ' ' + amount(row.value)).join(' · '))),
          h('ul', { className: 'dcm-gaps', 'aria-label': '지도 대상이 아닌 파일' }, quiet.map(row => h(GapRow, { key: row.label, row, calm: true })))),
        h('p', { className: 'dcm-muted' },
          '지도에 없는 파일이나 실행할 때만 이어지는 호출은 쓰는 곳에 나오지 않아요. 안 나온다고 쓰는 곳이 없다는 뜻은 아니에요.'))
    }

    // The pill and the headline speak for the same thing: did the map read all the code.
    function pillOf(data) {
      switch (data.state) {
        case 'loading': return { tone: 'idle', text: '불러오는 중' }
        case 'off': return { tone: 'idle', text: '꺼짐' }
        case 'no-repo': return { tone: 'idle', text: '저장소 없음' }
        case 'indexing': return { tone: 'wait', text: '읽는 중' }
        case 'engine-missing': return { tone: 'err', text: '분석 도구 필요' }
        case 'analysis-failed': return { tone: 'err', text: '다시 확인 필요' }
        case 'unavailable': return { tone: 'err', text: '연결 확인 필요' }
        default: {
          const read = readState(data)
          return read === 'none' ? { tone: 'ok', text: '코드를 모두 읽었어요' }
            : read === 'some' ? { tone: 'warn', text: '코드 일부를 못 읽었어요' }
              : { tone: 'warn', text: '읽은 범위를 확인 못 했어요' }
        }
      }
    }

    function summaryOf(data) {
      if (data.state === 'indexing' || data.state === 'loading') {
        return { tone: 'wait', title: '지도를 읽는 중이에요', lines: ['끝나면 이번 요청에서 바뀐 곳과 확인할 곳을 알려 드려요.'] }
      }
      const result = data.requestImpact
      const read = readState(data)
      const lines = []
      let tone = 'idle'
      let title
      let checked = false
      if (!result) {
        title = '아직 이번 요청에서 바뀐 게 없어요'
        lines.push('코딩을 요청하면 바뀐 곳과 함께 확인할 곳을 알려 드려요.')
      } else if (result.status === 'pending') {
        tone = 'wait'
        title = '이번 요청에서 바뀐 곳을 확인하고 있어요'
      } else if (result.status === 'unavailable') {
        tone = 'warn'
        title = '이번 요청에서 바뀐 곳을 확인하지 못했어요'
      } else if (result.files.length) {
        checked = true
        title = '이번 요청에서 파일 ' + result.files.length + '개를 고쳤어요'
        lines.push(result.analyzing ? '영향 줄 수 있는 곳을 확인하고 있어요.'
          : result.candidates.length ? '영향 줄 수 있는 곳이 ' + result.candidates.length + '곳 있어요.'
            : '지도에서 영향 줄 수 있는 곳을 찾지 못했어요.')
        if (result.partial) lines.push('일부 파일의 연결은 확인하지 못했어요.')
      } else {
        title = result.partial ? '확인할 수 있는 범위에서는 바뀐 파일을 찾지 못했어요' : '이번 요청에서 바뀐 파일이 없어요'
        if (result.partial) tone = 'warn'
      }
      let warning = null
      if (checked) {
        // Green only says the map read all the code; it never says the change is right.
        if (read === 'none' && !result.partial) { tone = 'ok'; lines.push('지도가 코드를 모두 읽었어요.') } else tone = 'warn'
        if (read === 'some') warning = '지도가 읽지 못한 코드가 있어서 빠진 곳이 있을 수 있어요. 아래를 확인해 주세요.'
        else if (read === 'unknown') warning = '지도가 읽지 못한 범위를 확인하지 못했어요. 빠진 곳이 있을 수 있어요.'
      }
      return { tone, title, lines, warning }
    }

    function Summary({ data }) {
      const { tone, title, lines, warning } = summaryOf(data)
      return h('section', { className: 'dcm-summary', 'data-tone': tone, 'aria-live': 'polite', 'aria-label': '이번 요청 결과' },
        h(Icon, { tone, size: 20, badge: 36, className: 'dcm-summary-icon' }),
        h('h3', { 'data-qa-multiline': '' }, title),
        lines.map(line => h('p', { key: line, className: 'dcm-muted' }, line)),
        warning && h('p', { 'data-tone': 'warn' }, warning))
    }

    function CallersResult({ callers, onOpen }) {
      const shown = callers.candidates.length
      const total = Number.isSafeInteger(callers.total) ? callers.total : null
      return h('div', { className: 'dcm-details', 'aria-live': 'polite' },
        h('h4', { className: 'dcm-symbol', title: callers.name }, callers.name + ' 쓰는 곳'),
        shown ? h(LocationList, { rows: callers.candidates, onOpen })
          : h('p', { className: 'dcm-muted' }, total === 0
            ? '지도에서 쓰는 곳을 찾지 못했어요. 확인 안 됨과는 달라서, 읽지 못한 범위를 함께 봐 주세요.'
            : total ? '쓰는 곳이 ' + total + '곳 있지만 위치를 표시하지 못했어요.' : '지도에서 확인된 쓰는 곳을 표시할 수 없어요.'),
        total > shown && shown > 0 && h('p', { className: 'dcm-muted' }, '쓰는 곳 ' + total + '곳 중 ' + shown + '곳만 보여요.'))
    }

    function LocationList({ rows, onCallers, onDraft, busy, onOpen }) {
      return h('ul', { className: 'dcm-list' }, rows.map(row => {
        const location = row.file + (row.line ? ':' + row.line : '')
        const traceable = onCallers && (row.kind === 'Function' || row.kind === 'Method')
        return h('li', { key: row.id ?? location },
          h('div', { className: 'dcm-evidence' },
            h('strong', { className: 'dcm-symbol', title: row.name }, row.name),
            h(PathText, { value: location, file: row.file, line: row.line, onOpen }),
            row.hop && h('span', { className: 'dcm-muted' }, row.hop === 1 ? '직접 사용' : '한 곳을 거쳐 연결')),
          traceable && h(Button, { onClick: () => onCallers(row), disabled: busy,
            'aria-label': row.name + ' 쓰는 곳 찾기' }, '쓰는 곳'),
          onDraft && h(Button, { onClick: () => onDraft(row),
            'aria-label': '확인 요청 넣기 · ' + row.name }, '확인 요청 넣기'))
      }))
    }

    function ChangedFiles({ files, onOpen }) {
      const list = items => h('ul', { className: 'dcm-files' }, items.map(path => h('li', { key: path }, h(PathText, { value: path, onOpen }))))
      // The heading sits in its own block so it is not read as a title with a button beside it.
      return files.length > 0 && h('div', { className: 'dcm-details' },
        h('div', null, h('h4', null, '고친 파일')),
        h('div', null,
          list(files.slice(0, 5)),
          files.length > 5 && h('details', { className: 'dcm-more' },
            h('summary', null, '외 ' + (files.length - 5) + '개 더 보기'),
            list(files.slice(5)))))
    }

    function RepositoryImpact({ data, onOpen }) {
      const result = data.impact
      return h('details', { className: 'dcm-all' },
        h('summary', null, '마지막 저장 이후 바뀐 전체'),
        h('p', { className: 'dcm-muted' }, '마지막으로 저장한 상태에서 바뀐 파일 전체예요.'),
        result
          ? h(React.Fragment, null,
            h('p', null, result.changed
              ? '바뀐 파일 ' + result.changed + '개 · 확인할 곳 ' + result.total + '곳' + (result.more ? ' 이상' : '')
              : '분석에서 확인된 바뀐 파일이 없어요.'),
            h(ChangedFiles, { files: result.files, onOpen }),
            !!result.candidates.length && h(LocationList, { rows: result.candidates, onOpen }))
          : h('p', { className: 'dcm-muted' }, data.impactUnavailable
            ? '저장소 전체에서 바뀐 곳을 읽지 못했어요.'
            : '지도 준비가 끝나면 결과를 볼 수 있어요.'))
    }

    function RequestImpact({ result, onDraft, onOpen }) {
      if (result?.status !== 'ready') return h('p', { className: 'dcm-muted' }, '코딩 요청이 끝나고 지도가 확인하면 여기에 나와요.')
      return h(React.Fragment, null,
        h(ChangedFiles, { files: result.files, onOpen }),
        !!result.candidates.length && h(LocationList, { rows: result.candidates, onDraft, onOpen }),
        !result.analyzing && !result.partial && !!result.files.length && !result.candidates.length &&
          h('p', { className: 'dcm-muted' }, '지도에서 확인된 곳이 없어요. 읽지 못한 범위가 있으면 이어진 곳이 없다는 뜻은 아니에요.'),
        !result.files.length && h('p', { className: 'dcm-muted' }, '확인할 곳이 아직 없어요.'))
    }

    function Impact({ data, onDraft, onOpen }) {
      return h('section', { className: 'dcm-card' },
        h('div', { className: 'dcm-card-title' },
          h('h3', null, '함께 확인할 곳'),
          h('p', { className: 'dcm-muted' }, '이번 요청에서 고친 파일과 이어진 곳이에요.' + (onOpen ? ' 파일 이름을 누르면 오른쪽에서 열려요.' : ''))),
        h('div', { 'aria-live': 'polite', className: 'dcm-details' },
          h(RequestImpact, { result: data.requestImpact, onDraft, onOpen })),
        h(RepositoryImpact, { data, onOpen }))
    }

    function Welcome({ data, act, busy }) {
      const state = data.state
      if (state === 'loading') return null
      if (state === 'no-repo') return h('section', { className: 'dcm-card dcm-welcome', 'data-tone': 'idle' },
        h('h3', null, '코드 저장소를 열어 주세요'),
        h('p', null, 'Git으로 관리하는 저장소 폴더에서 대화를 열면 함수와 파일의 연결을 볼 수 있어요.'))
      if (state === 'unavailable') return h('section', { className: 'dcm-card dcm-welcome', 'data-tone': 'err' },
        h('h3', null, '코드 지도에 연결할 수 없어요'),
        h('p', null, 'DSH 플러그인 화면에서 코드 지도가 켜져 있는지 확인해 주세요.'))
      if (state === 'engine-missing') return h('section', { className: 'dcm-card dcm-welcome', 'data-tone': 'err' },
        h('h3', null, '분석 도구를 연결해 주세요'),
        h('p', null, 'Codebase Memory 실행 파일을 설치하면 이 저장소의 코드 관계를 내 컴퓨터에서 찾을 수 있어요.'),
        h('a', { className: 'dcm-link', href: RELEASES, target: '_blank', rel: 'noreferrer' }, 'Codebase Memory 내려받기'))
      if (state === 'analysis-failed') return h('section', { className: 'dcm-card dcm-welcome', 'data-tone': 'err' },
        h('h3', null, '코드 지도를 준비하지 못했어요'),
        h('p', null, 'Codebase Memory가 실행되는지 확인하고 다시 준비해 보세요.'))
      if (state === 'off' && !data.enabled) return h('section', { className: 'dcm-card dcm-welcome', 'data-tone': 'idle' },
        h('h3', null, '이 저장소에서 코드 지도 사용하기'),
        h('p', null, '코딩을 요청하면 관련 위치를 DSH가 참고하고, 작업이 끝나면 함께 확인할 곳을 여기에서 볼 수 있어요.'),
        h('p', { className: 'dcm-muted' }, '지도는 로컬에서 만들어요. 참고에 쓰인 함수명과 파일 위치는 DSH 모델 요청에 포함돼요.'),
        h(Button, { primary: true, onClick: () => act('enable'), disabled: busy }, '이 저장소에서 켜기'))
      return null
    }

    function CodeMap({ sessionId, inputActions, useInput }) {
      const hasDraft = typeof useInput === 'function' && useInput(input => Boolean(input?.draft))
      return h(SessionMap, { key: sessionId, sessionId, inputActions, hasDraft })
    }

    function SessionMap({ sessionId, inputActions, hasDraft }) {
      const [data, setData] = useState({ state: 'loading', focus: [] })
      const [query, setQuery] = useState('')
      const [found, setFound] = useState(null)
      const [callers, setCallers] = useState(null)
      const [notice, setNotice] = useState('')
      const [busy, setBusy] = useState(false)
      const revision = useRef(0)
      const live = useRef(false)
      const pending = useRef(false)
      const loadSequence = useRef(0)
      const field = useId()
      const endpoint = ROUTE + '?sessionId=' + encodeURIComponent(sessionId)

      useEffect(() => {
        live.current = true
        const controller = new AbortController()
        const sync = async () => {
          if (pending.current || controller.signal.aborted) return
          const sequence = ++loadSequence.current
          const started = revision.current
          try {
            const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal })
            if (!response.ok) throw new Error('route')
            const current = await response.json()
            if (live.current && !controller.signal.aborted && started === revision.current && sequence === loadSequence.current) setData(current)
          } catch {
            if (live.current && !controller.signal.aborted && started === revision.current && sequence === loadSequence.current) {
              setData(prev => prev.state === 'loading' ? { state: 'unavailable', focus: [] } : prev)
            }
          }
        }
        void sync()
        const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void sync() }, 2200)
        return () => { live.current = false; controller.abort(); clearInterval(timer) }
      }, [endpoint])

      useEffect(() => {
        setFound(null)
        setCallers(null)
      }, [data.worktree])

      async function action(type, value) {
        if (pending.current) return
        pending.current = true
        revision.current++
        setBusy(true)
        setNotice('')
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-dsh-code-map': '1' },
            body: JSON.stringify({ action: type, ...(value && { query: value }) }),
          })
          if (!response.ok) throw new Error('route')
          const payload = await response.json()
          if (!live.current) return
          if (type === 'search' || type === 'callers') {
            if (!payload.available) {
              setNotice('코드 지도가 준비된 뒤 다시 시도해 주세요.')
              return
            }
            return payload.result
          }
          if (type === 'disable' || type === 'refresh') { setFound(null); setCallers(null) }
          setData(payload)
        } catch {
          if (live.current) setNotice('요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
        } finally {
          pending.current = false
          if (live.current) setBusy(false)
        }
      }

      async function find(event) {
        event.preventDefault()
        const term = query.trim()
        if (!term) return
        setFound(null)
        setCallers(null)
        const rows = await action('search', term)
        if (rows && live.current) setFound(rows)
      }

      async function showCallers(row) {
        setCallers(null)
        const result = await action('callers', row.id)
        if (result && live.current) setCallers({ ...result, name: row.name })
      }

      function draftVerification(row) {
        const location = row.file + (row.line ? ':' + row.line : '')
        const verification = '코드 지도에서 찾은 ' + row.name + ' (저장소 루트 기준 ' + location +
          ')의 사용처와 관련 테스트를 확인해 줘. 변경 영향과 추가로 검증할 점을 파일 위치와 함께 알려 줘.'
        try {
          const span = inputActions.captureInsertion()
          // A selection can contain existing text or reference chips. Write
          // at its end using the same revision, leaving the selection intact.
          const inserted = inputActions.insertText(
            (span.end > 0 ? '\n\n' : '') + verification + (hasDraft ? '\n\n' : ''),
            { ...span, start: span.end })
          if (inserted) {
            setNotice('확인 요청을 입력창에 넣었어요.')
            return
          }
        } catch { /* A disposed or locked composer is reported below. */ }
        setNotice('입력창에 넣지 못했어요. 잠시 뒤 다시 눌러 주세요.')
      }

      const onOpen = host.current?.sidebarRight && data.root ? (file, line) => {
        try {
          const cwd = host.current.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd
          host.current.sidebarRight.openResource(fileAddress(sessionId, cwd, data.root, file),
            { destination: 'sidebar', ...(line ? { params: { line } } : {}) })
        } catch { setNotice('파일을 사이드바에서 열지 못했어요. 파일 탭에서 직접 열어 주세요.') }
      } : undefined
      const ready = data.state === 'ready'
      const onDraft = typeof inputActions?.captureInsertion === 'function' &&
        typeof inputActions?.insertText === 'function' ? draftVerification : undefined
      const rows = found ?? data.focus ?? []
      const pill = pillOf(data)
      const mapped = data.enabled && (ready || data.state === 'indexing')
      return h('div', { className: 'dcm-view' },
        h('header', { className: 'dcm-head' },
          h('h2', null, '코드 지도'),
          h('div', { className: 'dcm-meta' },
            data.repo && h('p', { className: 'dcm-muted dcm-repo', title: data.repo }, data.repo),
            h('span', { className: 'dcm-state', 'data-tone': pill.tone, role: 'status' }, h(Icon, { tone: pill.tone, size: 14 }), pill.text)),
          data.enabled && h('div', { className: 'dcm-actions' },
            h(Button, { onClick: () => action('refresh'), disabled: busy || data.state === 'indexing' },
              ['analysis-failed', 'engine-missing'].includes(data.state) ? '다시 준비' : '지도 갱신'))),
        h('div', { className: 'dcm-stack' },
          h(Welcome, { data, act: action, busy }),
          mapped && h(Summary, { data }),
          data.enabled && (ready || data.state === 'indexing' || data.requestImpact) && h(Impact, { data, onDraft, onOpen }),
          mapped && h(Coverage, { coverage: data.coverage }),
          mapped && h('details', { className: 'dcm-all dcm-search', 'aria-busy': data.state === 'indexing' || undefined },
            h('summary', null, '직접 찾아보기'),
            h('div', null,
              !!data.focus?.length && found === null && h('p', { className: 'dcm-muted' }, '최근 코딩 요청에서 DSH가 참고한 위치예요.'),
              !data.focus?.length && found === null && FOCUS_NOTE[data.focusNote] &&
                h('p', { className: 'dcm-muted' }, FOCUS_NOTE[data.focusNote]),
              h('form', { className: 'dcm-form', onSubmit: find },
                h('label', { htmlFor: field }, '함수나 파일 이름'),
                h('input', { id: field, type: 'text', value: query, onChange: event => setQuery(event.target.value),
                  placeholder: '예시 · sendResume', maxLength: 160, autoComplete: 'off', spellCheck: false }),
                h(Button, { primary: true, type: 'submit', disabled: !ready || busy || !query.trim() }, '찾기')),
              h('div', { 'aria-live': 'polite' }, rows.length
                ? h(LocationList, { rows, onCallers: ready ? showCallers : null, busy, onOpen })
                : found && h('p', { className: 'dcm-muted' }, '이름이 맞는 위치를 찾지 못했어요. 파일명이나 함수 이름으로 다시 찾아 보세요.')),
              callers && h(CallersResult, { callers, onOpen }))),
          data.enabled && data.indexedAt && h('p', { className: 'dcm-muted dcm-footer' },
            '마지막 갱신 ' + new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(data.indexedAt) +
            (Number.isFinite(data.indexMs) ? ' · ' + Math.max(0.1, Math.round(data.indexMs / 100) / 10) + '초 걸림' : '')),
          data.enabled && h('button', { type: 'button', className: 'dcm-quiet', onClick: () => action('disable'), disabled: busy },
            '이 저장소에서 지도 끄기'),
          h('p', { className: 'dcm-muted dcm-status', role: 'status' }, notice)))
    }

    return {
      inject: ['slots', 'sidebarRight', 'sessions'],
      apply(ctx) {
        host.current = ctx
        ctx.effect(() => () => { host.current = null }, 'dsh-code-map: host')
        const style = document.createElement('style')
        style.textContent = CSS
        document.head.append(style)
        ctx.effect(() => () => style.remove(), 'dsh-code-map: style')
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view', id: 'dsh-code-map', order: 31, label: () => '코드 지도',
        }, CodeMap))
      },
    }
  },
})
