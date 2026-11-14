// 대화 보기 빌더: 계획 노드와 할 일 기록 노드를 받아 탭·칩이 읽는 스냅샷 하나를 낸다.
import { PLAN_KIND, VIEW_ID } from './plan.js'
import { HISTORY_KIND, EMPTY_FOLD, EMPTY_HISTORY, deriveHistory } from './todo-history.js'

export const EMPTY_SNAPSHOT = Object.freeze({
  plans: Object.freeze([]), writes: EMPTY_FOLD.writes, history: EMPTY_HISTORY,
})

export function historyNodeOf(context) {
  const writes = context.state?.writes
  if (!Array.isArray(writes) || writes.length === 0) return null
  return { key: context.key, kind: HISTORY_KIND, id: context.id, target: VIEW_ID, data: writes }
}

export function createViewBuilder() {
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
