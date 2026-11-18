// 이동 실패는 화면이 구분할 수 있는 코드를 달고 나간다. 코드는 바뀌지 않는다.
export class MoveError extends Error {
  constructor(code, message, options) {
    super(message, options)
    this.name = 'MoveError'
    this.code = code
  }
}

export const ERROR = {
  badRequest: 'bad-request',
  sessionNotFound: 'session-not-found',
  sessionOpen: 'session-open',
  sessionSubagent: 'session-subagent',
  sameWorkspace: 'same-workspace',
  workspaceNotFound: 'workspace-not-found',
  workspaceMissingDir: 'workspace-missing-dir',
  tooLarge: 'too-large',
  recoveryRequired: 'recovery-required',
  storageFailed: 'storage-failed',
  registryFailed: 'registry-failed',
}

export function moveError(code, message, options) {
  return new MoveError(code, message, options)
}

// 세션 저장소는 오류 클래스를 이름으로만 구분할 수 있다. 앱 내부 모듈을 import하지 않기 때문이다.
export function isNamedError(error, name) {
  return error instanceof Error && error.name === name
}
