// 다음 시작 때 옮길 예약을 사이드바 줄에 보여 주고, 시작할 때 완료된 이동을 알린다.
function createPendingStore() {
  let byId = {}
  const listeners = new Set()
  return {
    get: () => byId,
    set(next) {
      byId = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export const pendingStore = createPendingStore()

let deleteCapability = false
const capabilityListeners = new Set()

export function applyPendingStatus(value) {
  const next = {}
  for (const entry of value.pending ?? []) next[entry.sessionId] = entry.targetTitle
  pendingStore.set(next)
  const nextCapability = value.capabilities?.delete === true
  if (nextCapability !== deleteCapability) {
    deleteCapability = nextCapability
    for (const listener of [...capabilityListeners]) listener()
  }
  return value.completed ?? []
}

export function deleteAvailable() {
  return deleteCapability
}

export function subscribeDeleteCapability(listener) {
  capabilityListeners.add(listener)
  return () => { capabilityListeners.delete(listener) }
}

export async function refreshPending() {
  try {
    const value = await moveApi({ action: 'pending' })
    const completed = applyPendingStatus(value)
    if (completed.length > 0) {
      for (const entry of completed) {
        showToast(`‘${entry.targetTitle}’ 작업공간으로 이동을 마쳤어요.`, 'success', 9000)
      }
      await moveApi({ action: 'ack', ids: completed.map(entry => entry.sessionId) }).catch(() => {})
    }
  } catch {
    // 예전 Host이거나 잠깐 실패한 경우. 배지 없이 나머지 기능은 그대로 동작한다.
  }
}

function usePendingTarget(sessionId) {
  return React.useSyncExternalStore(
    pendingStore.subscribe,
    () => pendingStore.get()[sessionId] ?? null,
    () => null,
  )
}

function MoveBadge({ sessionId }) {
  const target = usePendingTarget(sessionId)
  if (target === null || target === undefined) return null
  const label = `다음 시작 때 ${target} 작업공간으로 이동 예약됨`
  return h('span', {
    className: 'dwm-badge',
    title: label,
    role: 'img',
    'aria-label': label,
  }, `→ ${target}`)
}
