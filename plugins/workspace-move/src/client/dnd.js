// 사이드바에서 대화 줄을 다른 작업공간 줄 위로 끌어다 놓으면 옮긴다.
// 공식 끌어놓기는 같은 작업공간 안의 순서만 바꾸므로, 다른 작업공간 위에 있을 때만 개입한다.
export function parseRowKey(key) {
  if (typeof key !== 'string') return { kind: 'other' }
  if (key === 'empty') return { kind: 'empty' }
  if (key.startsWith('workspace:')) return { kind: 'workspace', group: key.slice('workspace:'.length) }
  if (key.startsWith('session:')) return { kind: 'session', id: key.slice('session:'.length) }
  if (key.startsWith('overflow:')) return { kind: 'overflow', group: key.slice('overflow:'.length) }
  return { kind: 'other' }
}

/** 행 키 목록에서 각 행이 속한 작업공간(그룹)을 문서 순서대로 계산한다. */
export function groupMapOf(keys) {
  let group = null
  const map = new Map()
  for (const key of keys) {
    const parsed = parseRowKey(key)
    if (parsed.kind === 'workspace') group = parsed.group
    map.set(key, group)
  }
  return map
}

/** 지금 가리키는 행이 옮겨도 되는 다른 작업공간이면 그 id를, 아니면 null을 돌려준다. */
export function dropTargetFor(key, sourceGroup, groups) {
  const parsed = parseRowKey(key)
  let group = null
  if (parsed.kind === 'workspace') group = parsed.group
  else if (parsed.kind === 'session' || parsed.kind === 'overflow') group = groups?.get(key) ?? null
  if (group === null || group === undefined || group === '' || group === sourceGroup) return null
  return group
}

let currentDrag = null

function installDragMove() {
  const onDragStart = event => {
    const row = event.target instanceof Element ? event.target.closest('[data-row-key^="session:"]') : null
    if (row === null) return
    const id = parseRowKey(row.getAttribute('data-row-key')).id
    if (typeof id !== 'string' || id.length === 0) return
    const scope = row.closest('[role="tree"]') ?? document
    const rows = [...scope.querySelectorAll('[data-row-key]')]
    const groups = new Map()
    const headers = new Map()
    let group = null
    for (const element of rows) {
      const key = element.getAttribute('data-row-key') ?? ''
      const parsed = parseRowKey(key)
      if (parsed.kind === 'workspace') {
        group = parsed.group
        headers.set(parsed.group, element)
      }
      groups.set(element, group)
    }
    currentDrag = {
      sessionId: id,
      sourceGroup: groups.get(row) ?? null,
      groups,
      headers,
      target: null,
      header: null,
    }
  }

  const onDragOver = event => {
    if (currentDrag === null) return
    const element = event.target instanceof Element ? event.target.closest('[data-row-key]') : null
    const target = element === null ? null : dropTargetFor(element.getAttribute('data-row-key'), currentDrag.sourceGroup, currentDrag.groups)
    if (target === null) {
      clearDropTarget()
      return
    }
    event.preventDefault()
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
    if (currentDrag.target === target) return
    clearDropTarget()
    currentDrag.target = target
    const header = currentDrag.headers.get(target)
    if (header !== undefined) {
      header.dataset.dwmDrop = '1'
      currentDrag.header = header
    }
  }

  const onDrop = event => {
    if (currentDrag === null || currentDrag.target === null) return
    const { sessionId, target } = currentDrag
    event.preventDefault()
    event.stopPropagation()
    endDrag()
    void moveByDrop(sessionId, target)
  }

  const onDragEnd = () => { endDrag() }

  function clearDropTarget() {
    if (currentDrag?.header != null) delete currentDrag.header.dataset.dwmDrop
    if (currentDrag !== null) {
      currentDrag.target = null
      currentDrag.header = null
    }
  }

  function endDrag() {
    clearDropTarget()
    currentDrag = null
  }

  document.addEventListener('dragstart', onDragStart, true)
  document.addEventListener('dragover', onDragOver, true)
  document.addEventListener('drop', onDrop, true)
  document.addEventListener('dragend', onDragEnd, true)
  return () => {
    document.removeEventListener('dragstart', onDragStart, true)
    document.removeEventListener('dragover', onDragOver, true)
    document.removeEventListener('drop', onDrop, true)
    document.removeEventListener('dragend', onDragEnd, true)
    endDrag()
  }
}

async function moveByDrop(sessionId, targetWorkspaceId) {
  try {
    // 열린 대화는 바로 옮길 수 없다. 메뉴로 보내지 않고, 대상 작업공간을 미리 고른 확인 창을 연다.
    const info = await moveApi({ action: 'preflight', sessionId })
    if (info.blocked !== null && info.blocked !== undefined) {
      showToast(errorText(info.blocked), 'error', 8000)
      return
    }
    if (info.open === true) {
      moveRequest.set({ sessionId, title: '', targetWorkspaceId })
      return
    }
    showToast('옮기는 중…', 'progress', 0)
    await moveWithRetry({ action: 'move', sessionId, targetWorkspaceId })
    void refreshPending()
    showToast('다른 작업공간으로 옮겼어요.', 'success', 7000)
  } catch (failure) {
    showToast(errorText(failure), 'error', 8000)
  }
}
