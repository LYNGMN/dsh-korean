// 대화를 완전히 지우는 확인 창. 기록은 휴지통으로 옮긴다.
function DeleteDialog() {
  const request = React.useSyncExternalStore(deleteRequest.subscribe, deleteRequest.get, deleteRequest.get)
  if (request === null) return null
  return h(DeleteDialogBody, { key: request.sessionId, request })
}

function DeleteDialogBody({ request }) {
  const dialogRef = useRef(null)
  const [phase, setPhase] = useState('ready')
  const [error, setError] = useState(null)
  const busy = phase === 'deleting'

  useEffect(() => {
    const node = dialogRef.current
    if (node !== null && typeof node.focus === 'function') node.focus({ preventScroll: true })
  }, [])

  const close = () => {
    if (busy) return
    deleteRequest.set(null)
    focusRowBack(request.sessionId)
  }

  const confirm = async () => {
    if (busy) return
    setPhase('deleting')
    setError(null)
    try {
      await moveApi({ action: 'delete', sessionId: request.sessionId })
      await refreshSessions()
      setPhase('done')
    } catch (failure) {
      setError(failure)
      setPhase('ready')
    }
  }

  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
    }
  }

  const errorBox = (message, code) => h('div', { className: 'dwm-error', role: 'alert' },
    h('span', { className: 'dwm-error-text' }, message),
    typeof code === 'string' && code !== '' ? h('span', { className: 'dwm-code' }, TEXT.errorCode(code)) : null)

  let body
  if (phase === 'done') {
    body = h(React.Fragment, null,
      h('p', { className: 'dwm-done', role: 'status' }, TEXT.deletedDone),
      h('div', { className: 'dwm-actions' },
        h('button', { type: 'button', className: 'dwm-button dwm-primary', onClick: close }, TEXT.confirm)
      )
    )
  } else {
    body = h(React.Fragment, null,
      h('div', { className: 'dwm-warning', role: 'alert' }, TEXT.deleteWarn),
      error !== null ? errorBox(errorText(error), error.code) : null,
      busy ? h('p', { className: 'dwm-status', role: 'status' }, TEXT.deleting) : null,
      h('div', { className: 'dwm-actions' },
        h('button', { type: 'button', className: 'dwm-button', disabled: busy, onClick: close }, TEXT.cancel),
        h('button', { type: 'button', className: 'dwm-button dwm-danger', disabled: busy, onClick: confirm }, TEXT.deleteAction)
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
    'aria-labelledby': 'dwm-delete-title',
    tabIndex: -1,
    ref: dialogRef,
    onKeyDown,
  },
  h('h2', { className: 'dwm-title', id: 'dwm-delete-title' }, TEXT.deleteTitle),
  h('p', { className: 'dwm-desc' }, TEXT.deleteDesc(request.title)),
  body
  ))
}
