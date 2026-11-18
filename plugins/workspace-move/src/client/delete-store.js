// 삭제 확인 창의 요청. 메뉴 행과 오버레이 대화상자를 잇는다.
function createDeleteRequestStore() {
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

const deleteRequest = createDeleteRequestStore()
