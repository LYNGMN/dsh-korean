// REST calls to /h/api. The browser sends the Access cookie and Origin itself.
import { update } from './store.js'
import { errorText, t } from './lib/i18n.js'

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
    throw new ApiError('network', t('err.network'), 0)
  }
  if (res.type === 'opaqueredirect' || res.status === 401) {
    update((s) => { s.authExpired = true })
    throw new ApiError('unauthenticated', t('err.unauthenticated'), 401)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.code ?? 'failed', errorText(data.code, res.status, data.message), res.status)
  return data
}

export const sessionPath = (id) => `/sessions/${encodeURIComponent(id)}`
