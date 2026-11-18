// 화면 서비스는 apply에서 넣어 준다. 옮긴 대화를 열고, 삭제한 대화를 목록에서 지우는 데 쓴다.
let services = { uiWorkspace: null, sessions: null }

export function bindServices(uiWorkspace, sessions) {
  services = { uiWorkspace, sessions }
}

export function openSessionById(sessionId) {
  try {
    services.uiWorkspace?.openSession(sessionId)
    return true
  } catch {
    return false
  }
}

export async function refreshSessions() {
  try {
    await services.sessions?.refresh()
  } catch {
    // 목록 새로 고침 실패는 삭제 결과를 되돌리지 않는다.
  }
}
