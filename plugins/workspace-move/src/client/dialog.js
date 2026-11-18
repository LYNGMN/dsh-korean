// 옮길 작업공간을 고르는 대화상자. shell.overlay에 살고, 요청이 없으면 아무것도 그리지 않는다.
// 열려 있는 대화는 호스트가 원본을 보관하고 대상 작업공간에 복사본을 만든 뒤, 그 복사본을 열어 준다.
function MoveDialog({ useWorkspaces }) {
  const request = React.useSyncExternalStore(moveRequest.subscribe, moveRequest.get, moveRequest.get)
  if (request === null) return null
  return h(MoveDialogBody, { key: request.sessionId, request, useWorkspaces })
}

function MoveDialogBody({ request, useWorkspaces }) {
  const workspaces = useWorkspaces(state => state.items)
  const dialogRef = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState('loading')
  const [info, setInfo] = useState(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const sourceWorkspaceId = info === null ? null : info.sourceWorkspaceId
  const sourceTitle = workspaces.find(workspace => workspace.workspaceId === sourceWorkspaceId)?.title ?? null
  const rows = targetRows(workspaces, sourceWorkspaceId)
  const blocked = info === null ? null : info.blocked
  const canQueue = info !== null && info.open === true && info.queue === true && info.trueMove === true
  const staleHost = info !== null && (info.hostRevision === undefined || info.hostRevision === null)
  const listVisible = blocked === null && !staleHost
  const moving = phase === 'moving'

  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    moveApi({ action: 'preflight', sessionId: request.sessionId }, controller.signal)
      .then(value => {
        if (!alive) return
        setInfo(value)
        setPhase('ready')
      })
      .catch(failure => {
        if (!alive || failure?.name === 'AbortError') return
        setError(failure)
        setPhase('error')
      })
    return () => { alive = false; controller.abort() }
  }, [request.sessionId, attempt])

  useEffect(() => {
    const node = dialogRef.current
    if (node !== null && typeof node.focus === 'function') node.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (phase !== 'ready' || selected !== '' || rows.length === 0) return
    const wanted = request.targetWorkspaceId
    setSelected(rows.some(row => row.id === wanted) ? wanted : rows[0].id)
  }, [phase, selected, rows.length, request.targetWorkspaceId])

  const close = () => {
    if (moving) return
    moveRequest.set(null)
    focusRowBack(request.sessionId)
  }

  const retryPreflight = () => {
    setInfo(null)
    setSelected('')
    setError(null)
    setPhase('loading')
    setAttempt(value => value + 1)
  }

  const run = async () => {
    if (selected === '' || moving || blocked !== null) return
    setPhase('moving')
    setError(null)
    try {
      const value = await moveWithRetry({ action: 'move', sessionId: request.sessionId, targetWorkspaceId: selected })
      const workspaceTitle = rows.find(row => row.id === selected)?.title ?? value.toWorkspaceId
      setResult({ kind: 'done', workspaceTitle, openId: request.sessionId, reopened: false })
      setPhase('done')
    } catch (failure) {
      setError(failure)
      setPhase('ready')
    }
  }

  const queueRun = async () => {
    if (selected === '' || moving || blocked !== null) return
    setPhase('moving')
    setError(null)
    try {
      await moveWithRetry({ action: 'queue', sessionId: request.sessionId, targetWorkspaceId: selected })
      void refreshPending()
      const workspaceTitle = rows.find(row => row.id === selected)?.title ?? selected
      setResult({ kind: 'queued', workspaceTitle })
      setPhase('queued')
    } catch (failure) {
      setError(failure)
      setPhase('ready')
    }
  }

  const cancelQueue = async () => {
    if (moving) return
    setPhase('moving')
    setError(null)
    try {
      await moveApi({ action: 'cancel', sessionId: request.sessionId })
      void refreshPending()
      setResult({ kind: 'cancelled' })
      setPhase('cancelled')
    } catch (failure) {
      setError(failure)
      setPhase('queued')
    }
  }

  const undo = async () => {
    if (sourceWorkspaceId === null || moving) return
    setPhase('moving')
    setError(null)
    try {
      await moveWithRetry({ action: 'move', sessionId: request.sessionId, targetWorkspaceId: sourceWorkspaceId })
      setResult({ kind: 'undone', workspaceTitle: sourceTitle ?? sourceWorkspaceId })
      setPhase('undone')
    } catch (failure) {
      setError(failure)
      setPhase('done')
    }
  }

  const openMoved = () => {
    const id = result?.openId ?? request.sessionId
    moveRequest.set(null)
    openSessionById(id)
  }

  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const node = dialogRef.current
    if (node === null) return
    const focusable = [...node.querySelectorAll('button:not([disabled]), input:not([disabled])')]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const warning = message => h('div', { className: 'dwm-warning', role: 'alert' }, message)
  const errorBox = (message, code) => h('div', { className: 'dwm-error', role: 'alert' },
    h('span', { className: 'dwm-error-text' }, message),
    typeof code === 'string' && code !== '' ? h('span', { className: 'dwm-code' }, TEXT.errorCode(code)) : null)

  let body
  if (phase === 'loading') {
    body = h('p', { className: 'dwm-status', role: 'status' }, TEXT.loading)
  } else if (phase === 'error') {
    body = h(React.Fragment, null,
      errorBox(errorText(error), error?.code),
      h('div', { className: 'dwm-actions' },
        h('button', { type: 'button', className: 'dwm-button', onClick: close }, TEXT.confirm),
        h('button', { type: 'button', className: 'dwm-button dwm-primary', onClick: retryPreflight }, TEXT.retry)
      )
    )
  } else if (phase === 'queued') {
    body = h(React.Fragment, null,
      h('p', { className: 'dwm-done', role: 'status' }, TEXT.queuedDone(result.workspaceTitle)),
      h('p', { className: 'dwm-current' }, TEXT.queuedTarget(result.workspaceTitle)),
      h('p', { className: 'dwm-hint' }, TEXT.queuedHint),
      error !== null ? errorBox(errorText(error), error.code) : null,
      h('div', { className: 'dwm-actions' },
        h('button', { type: 'button', className: 'dwm-button', disabled: moving, onClick: close }, TEXT.confirm),
        info !== null && info.cancel === true && !moving
          ? h('button', { type: 'button', className: 'dwm-button', onClick: cancelQueue }, TEXT.cancelQueued)
          : null
      )
    )
  } else if (phase === 'cancelled') {
    body = h(React.Fragment, null,
      h('p', { className: 'dwm-done', role: 'status' }, TEXT.cancelledQueued),
      h('div', { className: 'dwm-actions' },
        h('button', { type: 'button', className: 'dwm-button dwm-primary', onClick: close }, TEXT.confirm)
      )
    )
  } else if (phase === 'done' || phase === 'undone') {
    body = h(React.Fragment, null,
      h('p', { className: 'dwm-done', role: 'status' }, result.kind === 'undone'
        ? TEXT.undone(result.workspaceTitle)
        : TEXT.done(result.workspaceTitle)),
      h('p', { className: 'dwm-hint' }, TEXT.doneHint),
      error !== null ? errorBox(errorText(error), error.code) : null,
      h('div', { className: 'dwm-actions' },
        h('button', { type: 'button', className: 'dwm-button', onClick: close }, TEXT.confirm),
        result.kind === 'done' && sourceWorkspaceId !== null
          ? h('button', { type: 'button', className: 'dwm-button', disabled: moving, onClick: undo },
            moving ? TEXT.undoing : TEXT.undo)
          : null,
        result.kind === 'done' && result.reopened !== true
          ? h('button', { type: 'button', className: 'dwm-button dwm-primary', onClick: openMoved }, TEXT.openMoved)
          : null
      )
    )
  } else {
    body = h(React.Fragment, null,
      staleHost ? warning(TEXT.staleHost) : blocked !== null ? errorBox(errorText(blocked), blocked.code) : null,
      !staleHost && blocked === null
        ? canQueue ? warning(TEXT.queueNote) : h('p', { className: 'dwm-note' }, TEXT.moveNote)
        : null,
      listVisible && rows.length === 0 ? warning(TEXT.empty) : null,
      listVisible && rows.length > 0
        ? h('div', { className: 'dwm-list', role: 'radiogroup', 'aria-label': TEXT.targetLabel },
          rows.map(row => h('label', { key: row.id, className: 'dwm-option' },
            h('input', {
              type: 'radio',
              name: `dwm-target-${request.sessionId}`,
              value: row.id,
              checked: selected === row.id,
              disabled: moving,
              onChange: () => setSelected(row.id),
            }),
            h('span', { className: 'dwm-option-text' },
              h('span', { className: 'dwm-option-title' }, row.title),
              row.suffix !== '' ? h('span', { className: 'dwm-option-path' }, row.suffix) : null
            )
          ))
        )
        : null,
      h('p', { className: 'dwm-note' }, TEXT.noteDirectory),
      error !== null ? errorBox(errorText(error), error.code) : null,
      moving ? h('p', { className: 'dwm-status', role: 'status' }, TEXT.moving) : null,
      h('div', { className: 'dwm-actions' },
        h('button', { type: 'button', className: 'dwm-button', disabled: moving, onClick: close }, TEXT.cancel),
        moving || staleHost ? null : canQueue
          ? h('button', {
            type: 'button',
            className: 'dwm-button dwm-primary',
            disabled: selected === '' || blocked !== null,
            onClick: queueRun,
          }, TEXT.queueAction)
          : h('button', {
            type: 'button',
            className: 'dwm-button dwm-primary',
            disabled: selected === '' || blocked !== null,
            onClick: run,
          }, TEXT.move)
      )
    )
  }

  return h('div', {
    className: 'dwm-backdrop',
    onMouseDown: event => { if (event.target === event.currentTarget) close() },
  }, h('div', {
    className: 'dwm-dialog',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'dwm-title',
    'aria-describedby': 'dwm-desc',
    tabIndex: -1,
    ref: dialogRef,
    onKeyDown,
  },
  h('h2', { className: 'dwm-title', id: 'dwm-title' }, TEXT.title),
  h('p', { className: 'dwm-desc', id: 'dwm-desc' }, phase === 'ready' || phase === 'loading' || phase === 'error' || phase === 'moving'
    ? TEXT.desc(request.title)
    : TEXT.resultDesc),
  h('p', { className: 'dwm-current' }, sourceTitle === null ? TEXT.currentNone : TEXT.current(sourceTitle)),
  body
  ))
}
