// 세션 … 메뉴에 두 줄을 공식 메뉴 등록(ctx.contextMenus)으로 더한다. 아이콘·간격·키보드 이동은 DSH 메뉴가 맡는다.
function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value))
  return String(value).replace(/["\\]/g, '\\$&')
}

function focusRowBack(sessionId) {
  try {
    const row = document.querySelector(`[data-row-key="session:${cssEscape(sessionId)}"]`)
    if (row !== null && typeof row.focus === 'function') row.focus({ preventScroll: true })
  } catch {
    // 줄을 못 찾으면 포커스만 포기한다. 옮긴 결과에는 영향이 없다.
  }
}

// DSH가 이미 휴지통(IconTrashOutlineRegular)을 이 키로 등록해 둔다.
const DELETE_ICON_KEY = 'workspace.delete'
const MOVE_ICON_KEY = 'dsh-workspace-move.folder-move'

// 공식 folder-close 아이콘(16칸, 선 굵기 1) 몸통에 안쪽 가로줄 대신 오른쪽 화살표를 넣었다.
function FolderMoveIcon() {
  const line = { stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' }
  return h('svg', {
    width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', strokeWidth: 1,
    'aria-hidden': 'true', 'data-icon': 'dsh-workspace-move-folder-move',
  },
  h('path', {
    d: 'M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z',
    stroke: 'currentColor',
  }),
  h('path', { d: 'M4.6 8.95H11.1', ...line }),
  h('path', { d: 'M8.85 6.7L11.1 8.95L8.85 11.2', ...line }))
}

const deleteCapabilitySource = {
  subscribe: listener => subscribeDeleteCapability(listener),
  getSnapshot: () => deleteAvailable(),
}

function moveMenuAction({ sessionId, displayTitle }) {
  return {
    id: 'move', label: TEXT.menu, icon: { key: MOVE_ICON_KEY },
    run: () => { moveRequest.set({ sessionId, title: displayTitle || TEXT.unnamed }) },
  }
}

function deleteMenuAction({ sessionId, displayTitle }) {
  return {
    id: 'delete', label: TEXT.deleteMenu, icon: { key: DELETE_ICON_KEY }, danger: true, afterContent: true,
    run: () => { deleteRequest.set({ sessionId, title: displayTitle || TEXT.unnamed }) },
  }
}

// 순서: 공식 '다음에서 열기'(500) 바로 아래에 이동, 맨 아래 '세션 보관'(600) 다음에 삭제.
function registerSessionMenus(ctx) {
  ctx.slots.inject('contextMenu.icon', () => ctx.slots.register(
    { name: 'contextMenu.icon', key: MOVE_ICON_KEY },
    FolderMoveIcon,
  ))
  ctx.effect(() => ctx.contextMenus.register({
    id: 'dsh-workspace-move.move', target: 'session', order: 550,
    resolve: target => [moveMenuAction(target)],
  }), 'dsh-workspace-move: move menu')
  ctx.effect(() => ctx.contextMenus.register({
    id: 'dsh-workspace-move.delete', target: 'session', order: 650,
    observe: () => [deleteCapabilitySource],
    resolve: target => (deleteAvailable() ? [deleteMenuAction(target)] : []),
  }), 'dsh-workspace-move: delete menu')
}
