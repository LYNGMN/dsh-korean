// 세션 목록 상태(ctx.sessions.list)에서 부모 세션의 자식 줄을 만든다. 화면 쪽 번들에 그대로 들어가므로 import 없이 쓴다.

const FALLBACK_TITLE = '하위 에이전트'

export function childState(summary) {
  if (summary === undefined) return 'idle'
  if (summary.running === true) return 'running'
  const completed = summary.projectionValues?.subagentTiming?.lastTurnCompleted
  if (completed === true) return 'done'
  if (completed === false) return 'stopped'
  return 'idle'
}

export function childRows(list, parentId) {
  const catalog = list?.projectionsBySession?.[parentId]?.values?.subagentCatalog
  if (!Array.isArray(catalog)) return []
  return catalog
    .filter(entry => entry.mode !== 'external')
    .map((entry) => {
      const summary = list.byId?.[entry.id]
      return {
        id: entry.id,
        title: entry.label || summary?.title || FALLBACK_TITLE,
        state: childState(summary),
        address: { kind: 'subagent', parentSessionId: parentId, childSessionId: entry.id, mode: entry.mode },
      }
    })
}

// 열지 않은 세션의 투영에는 요약 값만 있고 subagentCatalog가 빠져 있을 수 있다.
export function needsCatalog(list, parentId) {
  const projection = list?.projectionsBySession?.[parentId]
  if (projection === undefined) return true
  if (projection.state === 'loading' || projection.state === 'error' || projection.state === 'migration-required') return false
  return !Array.isArray(projection.values?.subagentCatalog)
}
