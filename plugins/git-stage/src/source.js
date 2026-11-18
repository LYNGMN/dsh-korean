// 세션 하나의 Git 사실을 서버 주소에서 읽어 두고, 보는 화면이 있을 때만 주기적으로 다시 읽는다. React 없음.

export const POLL_MS = 10_000

export const EMPTY_SOURCE = { facts: null, error: null, at: 0 }

/**
 * @param {{ load: () => Promise<object>, now?: () => number, every?: (fn: () => void, ms: number) => () => void, visible?: () => boolean }} options
 */
export function createStageSource({ load, now = Date.now, every, visible = () => true }) {
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

export function routeOf(sessionId, pick = null) {
  const repo = pick ? `&repo=${encodeURIComponent(pick)}` : ''
  return `api/dsh-git-stage?sessionId=${encodeURIComponent(sessionId)}${repo}`
}
