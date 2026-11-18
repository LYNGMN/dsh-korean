// 메뉴 행과 대화상자는 서로 다른 슬롯에 산다. 작은 저장소 하나로 요청을 넘긴다.
function createRequestStore() {
  let request = null
  const listeners = new Set()
  return {
    get: () => request,
    set(next) {
      request = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export const moveRequest = createRequestStore()
