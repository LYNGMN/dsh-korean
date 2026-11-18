window.__ModuleLoader__.load({
  id: '@lyngmn/dsh-code-map',
  factory(require) {
    const React = require('react')
    const { createElement: h, useEffect, useId, useRef, useState } = React
    const CSS = `
.dcm-view {
  --cm-fg: var(--dsw-alias-label-primary, #1b2230);
  --cm-muted: var(--dsw-alias-label-secondary, #536176);
  --cm-surface: var(--dsw-alias-background-main, #fff);
  --cm-soft: var(--dsw-alias-interactive-bg-hover, #f3f6fb);
  --cm-line: var(--dsw-alias-border-l3, #d9e1eb);
  --cm-edge: #718198;
  --cm-focus: #315ac7;
  --cm-blue: #2650b5;
  --cm-blue-bg: #edf3ff;
  --cm-good: #206543;
  --cm-good-bg: #eaf6ee;
  box-sizing: border-box; max-width: 56rem; width: 100%; margin-inline: auto;
  padding: clamp(16px, 4vw, 36px); color: var(--cm-fg); color-scheme: inherit;
  font: inherit; word-break: keep-all; container-type: inline-size; scrollbar-width: thin; scrollbar-color: var(--cm-edge) transparent;
}
@media (prefers-color-scheme: dark) {
  .dcm-view { --cm-fg: var(--dsw-alias-label-primary, #f0f3f8); --cm-muted: var(--dsw-alias-label-secondary, #b7c3d4);
    --cm-surface: var(--dsw-alias-background-main, #171c27); --cm-soft: var(--dsw-alias-interactive-bg-hover, #222a38);
    --cm-line: var(--dsw-alias-border-l3, #3e4c62); --cm-edge: #8191ab; --cm-focus: #a9c2ff;
    --cm-blue: #bcd0ff; --cm-blue-bg: #24365e; --cm-good: #b4e5c5; --cm-good-bg: #1b382e; }
}
:is([data-theme="dark"], .dark) .dcm-view {
  --cm-fg: var(--dsw-alias-label-primary, #f0f3f8); --cm-muted: var(--dsw-alias-label-secondary, #b7c3d4);
  --cm-surface: var(--dsw-alias-background-main, #171c27); --cm-soft: var(--dsw-alias-interactive-bg-hover, #222a38);
  --cm-line: var(--dsw-alias-border-l3, #3e4c62); --cm-edge: #8191ab; --cm-focus: #a9c2ff;
  --cm-blue: #bcd0ff; --cm-blue-bg: #24365e; --cm-good: #b4e5c5; --cm-good-bg: #1b382e;
}
:is([data-theme="light"], .light) .dcm-view {
  --cm-fg: var(--dsw-alias-label-primary, #1b2230); --cm-muted: var(--dsw-alias-label-secondary, #536176);
  --cm-surface: var(--dsw-alias-background-main, #fff); --cm-soft: var(--dsw-alias-interactive-bg-hover, #f3f6fb);
  --cm-line: var(--dsw-alias-border-l3, #d9e1eb); --cm-edge: #718198; --cm-focus: #315ac7;
  --cm-blue: #2650b5; --cm-blue-bg: #edf3ff; --cm-good: #206543; --cm-good-bg: #eaf6ee;
}
.dcm-view *, .dcm-view *::before { box-sizing: border-box; }
.dcm-view h2, .dcm-view h3, .dcm-view p { margin: 0; }
.dcm-view h2 { font-size: 24px; line-height: 1.3; letter-spacing: -.035em; }
.dcm-view h3 { font-size: 17px; line-height: 1.4; letter-spacing: -.015em; }
.dcm-view p { line-height: 1.65; text-wrap: pretty; }
.dcm-view .dcm-muted { color: var(--cm-muted); font-size: 13px; }
.dcm-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 16px; row-gap: 6px; align-items: center; margin-bottom: 20px; }
.dcm-head h2 { grid-column: 1; grid-row: 1; white-space: nowrap; translate: 0 .6px; }
.dcm-meta { display: flex; gap: 8px; grid-column: 1 / -1; grid-row: 2; align-items: center; min-width: 0; }
.dcm-repo { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcm-actions { grid-column: 2; grid-row: 1; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; align-items: center; gap: 8px; }
.dcm-actions > * { min-width: 0; }
.dcm-state { display: inline-flex; align-items: center; justify-content: center; padding: 5px 11px; width: max-content;
  border-radius: 999px; font-size: 12px; line-height: 18px; color: var(--cm-blue); background: var(--cm-blue-bg); white-space: nowrap; }
.dcm-state[data-ready] { color: var(--cm-good); background: var(--cm-good-bg); }
.dcm-stack { display: grid; gap: 14px; align-items: start; }
.dcm-footer, .dcm-status, .dcm-welcome { grid-column: 1 / -1; }
@container (min-width: 740px) {
  .dcm-stack[data-ready] { grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr); }
}
.dcm-card { background: var(--cm-surface); border: 1px solid var(--cm-line); border-radius: 14px; display: grid;
  align-content: start; gap: 12px; min-width: 0; padding: clamp(14px, 3vw, 24px); }
.dcm-start { border-inline-start: 3px solid var(--cm-focus); }
.dcm-card-title { display: grid; gap: 4px; min-width: 0; }
.dcm-card-title h3 { white-space: nowrap; }
.dcm-view .dcm-button, .dcm-view .dcm-link {
  display: inline-flex; font: inherit; font-size: 13px; font-weight: 600; line-height: 20px; white-space: nowrap;
  align-items: center; justify-content: center; min-width: 44px; min-height: 44px; padding: 0 12px;
  background: var(--cm-surface); color: var(--cm-fg); border: 1px solid var(--cm-edge);
  border-radius: 8px; cursor: pointer; text-decoration: none;
}
.dcm-view .dcm-button:hover, .dcm-view .dcm-link:hover { background: var(--cm-soft); }
.dcm-view .dcm-button:disabled { opacity: .62; cursor: default; }
.dcm-view .dcm-primary { color: var(--cm-blue); background: var(--cm-blue-bg); border-color: var(--cm-focus); }
.dcm-view :is(button, input, a):focus-visible { outline: 2px solid var(--cm-focus); outline-offset: 2px; }
.dcm-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; }
.dcm-field { display: grid; gap: 6px; min-width: 0; }
.dcm-field label { font-size: 13px; font-weight: 600; }
.dcm-view input { font: inherit; font-size: 16px; color: var(--cm-fg); min-width: 0; width: 100%;
  min-height: 44px; padding: 8px 11px; border: 1px solid var(--cm-edge); border-radius: 8px; background: var(--cm-surface); }
.dcm-view input::placeholder { color: var(--cm-muted); opacity: 1; }
.dcm-list { list-style: none; display: grid; margin: 0; padding: 0; gap: 0; }
.dcm-list li { min-width: 0; padding: 10px 0; display: grid; grid-template-columns: minmax(0, 1fr) auto;
  align-items: center; gap: 6px 10px; border-top: 1px solid var(--cm-line); }
.dcm-evidence { display: grid; min-width: 0; gap: 4px; }
.dcm-symbol { font-size: 14px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dcm-view code { color: var(--cm-muted); display: block; min-width: 0; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; word-break: normal; }
.dcm-details { display: grid; gap: 8px; margin-top: 5px; }
.dcm-details h4 { margin: 0; font-size: 14px; line-height: 1.4; }
.dcm-all { border-top: 1px solid var(--cm-line); }
.dcm-all summary { display: list-item; min-height: 44px; padding: 11px 6px; cursor: pointer;
  color: var(--cm-fg); font-size: 14px; font-weight: 600; white-space: nowrap; }
.dcm-all[open] summary { margin-bottom: 8px; }
.dcm-view summary:focus-visible { outline: 2px solid var(--cm-focus); outline-offset: 2px; }
.dcm-status:empty { position: absolute; width: 1px; height: 1px; overflow: hidden; }
.dcm-start .dcm-button, .dcm-start .dcm-link { justify-self: start; }
@media (max-width: 470px) {
  .dcm-head { column-gap: 8px; }
  .dcm-view .dcm-actions .dcm-button { padding-inline: 10px; }
}
`
    const ROUTE = '/api/dsh-code-map'
    const RELEASES = 'https://github.com/DeusData/codebase-memory-mcp/releases/tag/v0.12.1'
    const STATE = {
      loading: '불러오는 중',
      off: '꺼짐',
      indexing: '준비 중',
      ready: '준비됨',
      'no-repo': '저장소 없음',
      'engine-missing': '분석 도구 필요',
      'analysis-failed': '다시 확인 필요',
      unavailable: '연결 확인 필요',
    }

    function Button({ children, primary, ...props }) {
      return h('button', { type: 'button', className: 'dcm-button' + (primary ? ' dcm-primary' : ''), ...props }, children)
    }

    function PathText({ value }) {
      return h('code', null, value.split('/').flatMap((part, index) =>
        index ? ['/', h('wbr', { key: index }), part] : [part]))
    }

    function LocationList({ rows, onCallers, onDraft, busy }) {
      return h('ul', { className: 'dcm-list' }, rows.map(row => {
        const location = row.file + (row.line ? ':' + row.line : '')
        const traceable = onCallers && (row.kind === 'Function' || row.kind === 'Method')
        return h('li', { key: row.id ?? location },
          h('div', { className: 'dcm-evidence' },
            h('strong', { className: 'dcm-symbol', title: row.name }, row.name),
            h(PathText, { value: location }),
            row.hop && h('span', { className: 'dcm-muted' }, row.hop === 1 ? '직접 사용' : '한 곳을 거쳐 연결')),
          traceable && h(Button, { onClick: () => onCallers(row), disabled: busy,
            'aria-label': row.name + ' 사용처 찾기' }, '사용처'),
          onDraft && h(Button, { onClick: () => onDraft(row),
            'aria-label': '검증 요청 넣기 · ' + row.name }, '검증 요청 넣기'))
      }))
    }

    function ChangedFiles({ files }) {
      return files.length > 0 && h('div', { className: 'dcm-details' },
        h('h4', null, '변경한 파일'),
        files.map(path => h(PathText, { key: path, value: path })))
    }

    function RepositoryImpact({ data }) {
      const result = data.impact
      return h('details', { className: 'dcm-all' },
        h('summary', null, '저장소 전체 변경'),
        h('p', { className: 'dcm-muted' }, '마지막 커밋(HEAD) 이후의 변경이에요.'),
        result
          ? h(React.Fragment, null,
            h('p', null, result.changed
              ? '변경 파일 ' + result.changed + '개 · 확인 후보 ' + result.total + '곳' + (result.more ? ' 이상' : '')
              : '분석에서 확인된 변경 파일이 없어요.'),
            h(ChangedFiles, { files: result.files }),
            !!result.candidates.length && h(LocationList, { rows: result.candidates }))
          : h('p', { className: 'dcm-muted' }, data.impactUnavailable
            ? '저장소 전체의 변경 영향을 읽지 못했어요.'
            : '지도 준비가 끝나면 결과를 볼 수 있어요.'))
    }

    function RequestImpact({ result, onDraft }) {
      if (!result) return h('p', { className: 'dcm-muted' }, '코딩 요청이 끝나면 이번에 바뀐 파일을 보여 줘요.')
      if (result.status === 'pending') return h('p', { className: 'dcm-muted' }, '이번 요청의 변경 범위를 확인하고 있어요.')
      if (result.status === 'unavailable') return h('p', { className: 'dcm-muted' }, '이번 요청의 변경 범위를 확인할 수 없어요.')
      return h(React.Fragment, null,
        h('p', null, result.files.length
          ? '변경 파일 ' + result.files.length + '개' + (result.analyzing ? '' : ' · 파일 단위 확인 후보 ' + result.candidates.length + '곳')
          : result.partial ? '확인할 수 있는 범위에서 변경 파일을 찾지 못했어요.' : '이번 요청 중 바뀐 파일이 없어요.'),
        h(ChangedFiles, { files: result.files }),
        !!result.candidates.length && h(LocationList, { rows: result.candidates, onDraft }),
        result.analyzing && h('p', { className: 'dcm-muted' }, '호출 관계를 확인하고 있어요.'),
        result.partial && h('p', { className: 'dcm-muted' }, '일부 파일의 연결은 확인하지 못했어요.'),
        !result.analyzing && !result.partial && !!result.files.length && !result.candidates.length &&
          h('p', { className: 'dcm-muted' }, '코드 지도에서 확인된 사용처가 없어요.'))
    }

    function Impact({ data, onDraft }) {
      return h('section', { className: 'dcm-card' },
        h('div', { className: 'dcm-card-title' },
          h('h3', null, '함께 확인할 곳'),
          h('p', { className: 'dcm-muted' }, '이번 요청 중 확인된 변경이에요.')),
        h('div', { 'aria-live': 'polite', className: 'dcm-details' },
          h(RequestImpact, { result: data.requestImpact, onDraft })),
        h(RepositoryImpact, { data }))
    }

    function Welcome({ data, act, busy }) {
      const state = data.state
      if (state === 'loading') return null
      if (state === 'no-repo') return h('section', { className: 'dcm-card dcm-start dcm-welcome' },
        h('h3', null, '코드 저장소를 열어 주세요'),
        h('p', null, 'Git으로 관리하는 저장소 폴더에서 대화를 열면 함수와 파일의 연결을 볼 수 있어요.'))
      if (state === 'unavailable') return h('section', { className: 'dcm-card dcm-start dcm-welcome' },
        h('h3', null, '코드 지도에 연결할 수 없어요'),
        h('p', null, 'DSH 플러그인 화면에서 코드 지도가 켜져 있는지 확인해 주세요.'))
      if (state === 'engine-missing') return h('section', { className: 'dcm-card dcm-start dcm-welcome' },
        h('h3', null, '분석 도구를 연결해 주세요'),
        h('p', null, 'Codebase Memory 실행 파일을 설치하면 이 저장소의 코드 관계를 내 컴퓨터에서 찾을 수 있어요.'),
        h('a', { className: 'dcm-link', href: RELEASES, target: '_blank', rel: 'noreferrer' }, 'Codebase Memory 내려받기'))
      if (state === 'analysis-failed') return h('section', { className: 'dcm-card dcm-start dcm-welcome' },
        h('h3', null, '코드 지도를 준비하지 못했어요'),
        h('p', null, 'Codebase Memory가 실행되는지 확인하고 다시 준비해 보세요.'))
      if (state === 'off' && !data.enabled) return h('section', { className: 'dcm-card dcm-start dcm-welcome' },
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
            setNotice('검증 요청을 입력창에 넣었어요.')
            return
          }
        } catch { /* A disposed or locked composer is reported below. */ }
        setNotice('입력창에 넣지 못했어요. 잠시 뒤 다시 눌러 주세요.')
      }

      const ready = data.state === 'ready'
      const onDraft = typeof inputActions?.captureInsertion === 'function' &&
        typeof inputActions?.insertText === 'function' ? draftVerification : undefined
      const rows = found ?? data.focus ?? []
      const displayedState = ready && data.partial ? '일부 코드 준비됨' : STATE[data.state]
      return h('div', { className: 'dcm-view' },
        h('header', { className: 'dcm-head' },
          h('h2', null, '코드 지도'),
          h('div', { className: 'dcm-meta' },
            data.repo && h('p', { className: 'dcm-muted dcm-repo', title: data.repo }, data.repo),
            h('span', { className: 'dcm-state', 'data-ready': ready || undefined, role: 'status' }, displayedState)),
          data.enabled && h('div', { className: 'dcm-actions' },
            h(Button, { onClick: () => action('refresh'), disabled: busy || data.state === 'indexing' },
              ['analysis-failed', 'engine-missing'].includes(data.state) ? '다시 준비' : '지도 갱신'),
            h(Button, { onClick: () => action('disable'), disabled: busy }, '끄기'))),
        h('div', { className: 'dcm-stack', 'data-ready': ready || undefined },
          h(Welcome, { data, act: action, busy }),
          data.enabled && (ready || data.state === 'indexing') && h('section', { className: 'dcm-card dcm-start', 'aria-busy': data.state === 'indexing' },
              h('div', { className: 'dcm-card-title' },
                h('h3', null, '어디부터 볼까요?'),
                !!data.focus?.length && found === null && h('p', { className: 'dcm-muted' }, '최근 코딩 요청에서 DSH가 참고한 위치예요.')),
              h('form', { className: 'dcm-form', onSubmit: find },
                h('div', { className: 'dcm-field' },
                  h('label', { htmlFor: field }, '함수나 파일 이름'),
                  h('input', { id: field, type: 'text', value: query, onChange: event => setQuery(event.target.value),
                    placeholder: '예시 · sendResume', maxLength: 160, autoComplete: 'off', spellCheck: false })),
                h(Button, { primary: true, type: 'submit', disabled: !ready || busy || !query.trim() }, '찾기')),
              h('div', { 'aria-live': 'polite' }, rows.length
                ? h(LocationList, { rows, onCallers: ready ? showCallers : null, busy })
                : found && h('p', { className: 'dcm-muted' }, '이름이 맞는 위치를 찾지 못했어요. 파일명이나 함수 이름으로 다시 찾아 보세요.')),
              callers && h('div', { className: 'dcm-details', 'aria-live': 'polite' },
                h('h4', { className: 'dcm-symbol', title: callers.name }, callers.name + ' 사용처'),
                callers.candidates.length
                  ? h(LocationList, { rows: callers.candidates })
                  : h('p', { className: 'dcm-muted' }, '지도에서 확인된 사용처를 표시할 수 없어요.'))),
          data.enabled && (ready || data.state === 'indexing' || data.requestImpact) && h(Impact, { data, onDraft }),
          data.enabled && data.indexedAt && h('p', { className: 'dcm-muted dcm-footer' },
            '지도 갱신 ' + new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(data.indexedAt)),
          h('p', { className: 'dcm-muted dcm-status', role: 'status' }, notice)))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
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
