// 서버(Host) 쪽: 인증 울타리 안 주소 하나(/api/dsh-git-stage)를 연다. 화면은 세션 id만 보내고,
// 작업 폴더는 여기서 세션 기록으로 찾는다(화면이 보낸 경로로 명령을 돌리지 않는다). 작업 폴더가 저장소 묶음이면 고른 저장소 이름(?repo=)만 받는다.
import { createGitReader } from './git-read.js'

export const name = 'dsh-git-stage'
export const inject = ['connection', 'sessionQuery']

export const ROUTE_PATH = '/api/dsh-git-stage'
const SESSION_ID = /^[\w.:-]{1,200}$/

const SHELL_TOOLS = new Set(['bash', 'pwsh'])
const RECENT_EVENTS = 600

function argsOf(raw) {
  if (raw && typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

/**
 * 세션 기록 → 그 세션이 돌린 셸 명령과 돈 폴더(오래된 것부터). 폴더는 도구 결과의 meta.cwd(DSH가 정한 절대 경로).
 * terminal_open의 cwd도 그 폴더로 옮겨 간 것으로 본다. 최근 기록만 본다.
 * @returns {Array<{ command: string, cwd: string | null }>}
 */
export function commandsOf(events) {
  const list = []
  const byCall = new Map()
  for (const event of (Array.isArray(events) ? events : []).slice(-RECENT_EVENTS)) {
    const data = event?.data ?? {}
    if (event?.type === 'tool/call' || event?.type === 'tool/ptc-dispatch-start') {
      const args = argsOf(data.arguments)
      const id = data.callId ?? data.subCallId
      if (SHELL_TOOLS.has(data.name) && typeof args.command === 'string') {
        const item = { command: args.command, cwd: null }
        list.push(item)
        if (id) byCall.set(id, item)
      } else if (data.name === 'terminal_open' && typeof args.cwd === 'string') {
        list.push({ command: `cd ${JSON.stringify(args.cwd)}`, cwd: null })
      }
    } else if (event?.type === 'tool/result' || event?.type === 'tool/ptc-dispatch') {
      const id = data.message?.toolCallId ?? data.subCallId
      const cwd = data.meta?.cwd
      if (id && typeof cwd === 'string' && byCall.has(id)) byCall.get(id).cwd = cwd
    }
  }
  return list
}

/** 세션 id → 작업 폴더와 그 세션이 돌린 명령. 세션이 없으면 던진다. */
export async function sessionStateOf(sessionQuery, sessionId) {
  const observation = await sessionQuery.observeSession(sessionId)
  try {
    const cwd = observation?.projections?.values?.workingDirectory ?? observation?.header?.cwd ?? null
    let commands = []
    try { commands = commandsOf(observation?.events) } catch { /* 기록을 못 읽어도 폴더만으로 읽는다 */ }
    return { cwd, commands }
  } finally {
    observation?.[Symbol.dispose]?.()
  }
}

/** 세션 id → 작업 폴더. 세션이 없으면 던진다. */
export async function workingDirectoryOf(sessionQuery, sessionId) {
  return (await sessionStateOf(sessionQuery, sessionId)).cwd
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export function createHandler({ sessionQuery, reader, logger }) {
  return async request => {
    const params = new URL(request.url, 'http://host').searchParams
    const sessionId = params.get('sessionId') ?? ''
    // 고른 저장소는 이름만 받는다. 리더가 찾은 목록에 있을 때만 쓰므로 경로로 쓰이지 않는다.
    const pick = params.get('repo')?.slice(0, 300) || null
    if (!SESSION_ID.test(sessionId)) return json({ error: 'bad-session' }, 400)
    let state
    try {
      state = await sessionStateOf(sessionQuery, sessionId)
    } catch {
      return json({ error: 'session-not-found' }, 404)
    }
    try {
      return json({ facts: await reader.read(state.cwd, { pick, commands: state.commands }) })
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
