// 서버(Host) 쪽: 인증 울타리 안 주소 하나(/api/dsh-git-stage)를 연다. 화면은 세션 id만 보내고,
// 작업 폴더는 여기서 세션 기록으로 찾는다(화면이 보낸 경로로 명령을 돌리지 않는다).
import { createGitReader } from './git-read.js'

export const name = 'dsh-git-stage'
export const inject = ['connection', 'sessionQuery']

export const ROUTE_PATH = '/api/dsh-git-stage'
const SESSION_ID = /^[\w.:-]{1,200}$/

/** 세션 id → 작업 폴더. 세션이 없으면 null. */
export async function workingDirectoryOf(sessionQuery, sessionId) {
  const observation = await sessionQuery.observeSession(sessionId)
  try {
    return observation?.projections?.values?.workingDirectory ?? observation?.header?.cwd ?? null
  } finally {
    observation?.[Symbol.dispose]?.()
  }
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export function createHandler({ sessionQuery, reader, logger }) {
  return async request => {
    const sessionId = new URL(request.url, 'http://host').searchParams.get('sessionId') ?? ''
    if (!SESSION_ID.test(sessionId)) return json({ error: 'bad-session' }, 400)
    let cwd
    try {
      cwd = await workingDirectoryOf(sessionQuery, sessionId)
    } catch {
      return json({ error: 'session-not-found' }, 404)
    }
    try {
      return json({ facts: await reader.read(cwd) })
    } catch (error) {
      logger?.warn(`[dsh-git-stage] git read failed (${error?.code ?? error?.name ?? 'error'})`)
      return json({ error: 'read-failed' }, 500)
    }
  }
}

export function apply(ctx) {
  const logger = ctx.logger?.('dsh-git-stage')
  const handler = createHandler({ sessionQuery: ctx.sessionQuery, reader: createGitReader(), logger })
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE_PATH, methods: ['GET'], requestBody: 'buffered', fetch: handler,
  }), 'dsh-git-stage: route')
}
