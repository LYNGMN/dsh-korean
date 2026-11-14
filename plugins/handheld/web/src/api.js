// REST calls to /h/api. The browser sends the Access cookie and Origin itself.
import { update } from './store.js'

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`/h/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      redirect: 'manual',
      cache: 'no-store',
    })
  } catch {
    throw new ApiError('network', '네트워크에 연결할 수 없습니다', 0)
  }
  if (res.type === 'opaqueredirect' || res.status === 401) {
    update((s) => { s.authExpired = true })
    throw new ApiError('unauthenticated', '다시 로그인해야 합니다', 401)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.code ?? 'failed', data.message ?? '요청이 실패했습니다', res.status)
  return data
}

export const sessionPath = (id) => `/sessions/${encodeURIComponent(id)}`
