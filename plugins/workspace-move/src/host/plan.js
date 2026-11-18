// 이동에 쓰는 순수 판단: 누가 소유자인지, 작업 폴더 기록이 무엇인지, 죽은 뒤 무엇을 할지.
export function ownerOf(workspaces, sessionId) {
  for (const workspace of workspaces) {
    if (workspace.sessionIds.includes(sessionId)) return workspace
  }
  return undefined
}

/** 마지막 working-directory/change의 cwd. 그 기록이 없으면 undefined. */
export function lastWorkingDirectory(events) {
  let directory
  for (const event of events) {
    if (event.type === 'working-directory/change' && typeof event.data?.cwd === 'string') {
      directory = event.data.cwd
    }
  }
  return directory
}

export function needsDirectoryChange(events, targetPath) {
  const current = lastWorkingDirectory(events)
  return current !== undefined && current !== targetPath
}

/** 파일 이름으로도 정렬되는 시각 표기. 같은 밀리초에 두 번 옮겨도 이름이 겹치지 않게 세션 id를 붙인다. */
export function backupStamp(now) {
  return new Date(now).toISOString().replace(/[:.]/g, '-')
}

/**
 * 저널 한 건과 지금 파일 상태를 보고 다음 행동을 고른다.
 * complete: 새 로그가 유효하다 → 레지스트리 마무리와 정리
 * restore: 새 로그가 없고 격리본이 있다 → 원래 자리로 되돌리기
 * clear: 원본이 그대로다 → 저널만 지우기
 * manual: 사람이 봐야 한다(둘 다 없거나, 새 로그가 다른 cwd다)
 */
export function decideRecovery({ newArtifact, newArtifactMatches, quarantine, oldArtifact }) {
  if (newArtifact) return newArtifactMatches ? 'complete' : 'manual'
  if (quarantine) return oldArtifact ? 'clear' : 'restore'
  if (oldArtifact) return 'clear'
  return 'manual'
}
