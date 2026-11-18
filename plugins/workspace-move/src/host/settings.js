// 플러그인 설정. schemastery를 import하지 않으므로 여기서 직접 검사하고, 잘못된 값은 로드 때 크게 실패한다.
export const DEFAULT_MAX_ARTIFACT_BYTES = 16 * 1024 * 1024
export const DEFAULT_KEEP_BACKUPS = 5

function positiveInteger(value, fallback, field) {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`workspace-move: config field "${field}" must be a positive safe integer`)
  }
  return value
}

export function resolveSettings(config) {
  const source = config ?? {}
  if (typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('workspace-move: config must be an object')
  }
  return {
    maxArtifactBytes: positiveInteger(source.maxArtifactBytes, DEFAULT_MAX_ARTIFACT_BYTES, 'maxArtifactBytes'),
    keepBackups: positiveInteger(source.keepBackups, DEFAULT_KEEP_BACKUPS, 'keepBackups'),
  }
}
