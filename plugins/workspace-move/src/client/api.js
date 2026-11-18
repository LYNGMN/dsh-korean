// 인증된 /api 정확 경로. 같은 출처 쿠키를 그대로 보내고, 서버는 소유자 Peer만 받는다.
class MoveFailure extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MoveFailure'
    this.code = code
  }
}

export async function moveApi(body, signal) {
  let response
  try {
    response = await fetch('/api/workspace-move', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (error && error.name === 'AbortError') throw error
    throw new MoveFailure('network', 'network')
  }
  if (response.status === 401 || response.status === 403) throw new MoveFailure('unauthorized', 'unauthorized')
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new MoveFailure('network', 'bad response')
  }
  if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
    const failure = payload && typeof payload === 'object' ? payload.error : undefined
    throw new MoveFailure(failure?.code ?? 'failed', failure?.message ?? 'failed')
  }
  return payload.value
}

/** 호스트가 로그를 놓는 데 잠깐 걸릴 수 있어, session-open일 때만 몇 번 더 시도한다. */
export async function moveWithRetry(body, options = {}) {
  const attempts = options.attempts ?? 10
  const waitMs = options.waitMs ?? 300
  let last
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await moveApi(body)
    } catch (failure) {
      last = failure
      if (failure?.code !== 'session-open') throw failure
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }
  throw last
}
