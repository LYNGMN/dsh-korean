// 화면에서 온 작은 JSON 한 건을 검사한다. 알 수 없는 필드는 무시하고, 필수 값만 엄격하게 본다.
import { ERROR, moveError } from './errors.js'

const MAX_ID_LENGTH = 200

function text(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) {
    throw moveError(ERROR.badRequest, `"${field}" must be a non-empty string of at most ${MAX_ID_LENGTH} characters`)
  }
  return value
}

export function parseBody(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw moveError(ERROR.badRequest, 'request body is not JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw moveError(ERROR.badRequest, 'request body must be a JSON object')
  }
  return parsed
}

export function parseRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw moveError(ERROR.badRequest, 'request body must be a JSON object')
  }
  const action = body.action
  if (action === 'pending') return { action }
  if (action === 'ack') {
    const ids = Array.isArray(body.ids) ? body.ids.filter(id => typeof id === 'string') : []
    return { action, ids }
  }
  if (action !== 'preflight' && action !== 'move' && action !== 'queue' && action !== 'cancel' && action !== 'delete') {
    throw moveError(ERROR.badRequest, '"action" must be "preflight", "move", "queue", "cancel", "delete", "pending" or "ack"')
  }
  const sessionId = text(body.sessionId, 'sessionId')
  if (action === 'preflight' || action === 'cancel' || action === 'delete') return { action, sessionId }
  return { action, sessionId, targetWorkspaceId: text(body.targetWorkspaceId, 'targetWorkspaceId') }
}
