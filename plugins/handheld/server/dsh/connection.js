// DSH API-caller transport: `/connect` cookie exchange and unary RPC over
// `POST /api/<endpoint>`. Wire format: dsh-client-connection (DSH 0.2.x).
import { randomUUID } from 'node:crypto'
import { DshError } from './errors.js'

/**
 * Exchange the launch-token URL for an API cookie. Each cookie owns one
 * WebSocket; reconnecting after that socket closes needs a fresh exchange.
 * @param {string} upstreamUrl - Host root URL carrying `?token=`.
 * @param {{fetch?: typeof fetch}} [deps]
 * @returns {Promise<{origin: string, cookie: string}>}
 */
export async function connectApi(upstreamUrl, { fetch: fetchImpl = fetch } = {}) {
  const url = new URL(upstreamUrl)
  const token = url.searchParams.get('token')
  if (!token) throw new DshError('connect/no-token', 'upstream URL has no launch token')
  const target = new URL('/connect', url.origin)
  target.searchParams.set('token', token)
  target.searchParams.set('interactions', 'answer')
  const res = await fetchImpl(target, { redirect: 'manual' })
  if (res.status !== 302) throw new DshError('connect/refused', `Host answered ${String(res.status)} to /connect`)
  const cookie = res.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  if (!cookie) throw new DshError('connect/no-cookie', 'Host set no API cookie')
  return { origin: url.origin, cookie }
}

/**
 * Call one unary Remote endpoint.
 * @param {{origin: string, cookie: string}} session
 * @param {string} endpoint - e.g. `session/list`.
 * @param {Record<string, unknown>} args - named arguments.
 * @param {{signal?: AbortSignal, fetch?: typeof fetch}} [options]
 */
export async function rpcCall(session, endpoint, args, { signal, fetch: fetchImpl = fetch } = {}) {
  const rpcId = randomUUID()
  const res = await fetchImpl(`${session.origin}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie },
    body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
    signal,
  })
  if (res.status === 401 || res.status === 403) throw new DshError('rpc/unauthorized', `Host answered ${String(res.status)}`)
  if (!res.ok) throw new DshError('rpc/http', `Host answered ${String(res.status)} to ${endpoint}`)
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    throw new DshError('rpc/binary-unsupported', `${endpoint} returned a non-JSON result`)
  }
  const message = await res.json()
  if (message?.type !== 'server-response' || message.rpcId !== rpcId) throw new DshError('rpc/protocol', `bad response envelope from ${endpoint}`)
  if (message.result?.ok === true) return message.result.value
  const error = message.result?.error ?? {}
  throw new DshError(error.code ?? 'rpc/failed', error.message ?? `${endpoint} failed`, error.details)
}
