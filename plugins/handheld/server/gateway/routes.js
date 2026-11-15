// REST endpoints under /h/api. Each handler gets parsed JSON and returns JSON.
import { PROTOCOL_VERSION } from '../protocol.js'

export class RouteError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

// A subagent conversation's id joins three ids with `~` (see server/protocol.js).
const SESSION_ID = /^[A-Za-z0-9._:~-]{1,400}$/

function sessionIdOf(raw) {
  const id = decodeURIComponent(raw)
  if (!SESSION_ID.test(id)) throw new RouteError(400, 'bad-session', '세션 이름이 올바르지 않습니다')
  return id
}

/**
 * @param {object} deps
 * @param {import('./hub.js').Hub} deps.hub
 * @param {import('../store.js').Store} deps.store
 * @param {{notify: Function, test: Function}} deps.notifier
 * @param {string} deps.version
 * @returns {Array<{method: string, pattern: RegExp, handle: (ctx: {params: string[], body: any, query: URLSearchParams, email: string}) => Promise<any>}>}
 */
export function createRoutes({ hub, store, notifier, version }) {
  return [
    { method: 'GET', pattern: /^\/me$/, handle: async ({ email }) => ({ email, version, protocol: PROTOCOL_VERSION, upstream: hub.upstream }) },
    { method: 'GET', pattern: /^\/sessions$/, handle: async () => ({ rows: await hub.sessions() }) },
    { method: 'GET', pattern: /^\/workspaces$/, handle: async () => ({ items: await hub.workspaces() }) },
    {
      method: 'POST',
      pattern: /^\/sessions$/,
      handle: async ({ body }) => {
        if (typeof body.workspaceId !== 'string' || body.workspaceId.length === 0) throw new RouteError(400, 'bad-workspace', '작업 폴더를 골라 주세요')
        return { sessionId: await hub.createSession({ workspaceId: body.workspaceId }) }
      },
    },
    { method: 'GET', pattern: /^\/sessions\/([^/]+)\/commands$/, handle: async ({ params }) => ({ items: await hub.commands(sessionIdOf(params[0])) }) },
    { method: 'POST', pattern: /^\/sessions\/([^/]+)\/command$/, handle: async ({ params, body }) => hub.runCommand(sessionIdOf(params[0]), body.line) },
    { method: 'GET', pattern: /^\/sessions\/([^/]+)\/subagents$/, handle: async ({ params }) => ({ items: await hub.subagents(sessionIdOf(params[0])) }) },
    {
      method: 'GET',
      pattern: /^\/sessions\/([^/]+)\/history$/,
      handle: async ({ params, query }) => {
        const before = Number(query.get('before'))
        const page = await hub.history(sessionIdOf(params[0]), Number.isInteger(before) && before > 0 ? before : undefined)
        return { items: page.items, hasMore: page.hasMore }
      },
    },
    {
      method: 'POST',
      pattern: /^\/sessions\/([^/]+)\/prompt$/,
      handle: async ({ params, body }) => {
        await hub.prompt(sessionIdOf(params[0]), body.text, body.mode)
        return { ok: true }
      },
    },
    {
      method: 'POST',
      pattern: /^\/sessions\/([^/]+)\/cancel$/,
      handle: async ({ params }) => {
        await hub.cancel(sessionIdOf(params[0]))
        return { ok: true }
      },
    },
    { method: 'GET', pattern: /^\/pending$/, handle: async () => ({ items: hub.pendingList() }) },
    {
      method: 'POST',
      pattern: /^\/pending\/([^/]+)$/,
      handle: async ({ params, body }) => {
        await hub.answer(decodeURIComponent(params[0]), body)
        return { ok: true }
      },
    },
    { method: 'GET', pattern: /^\/push\/key$/, handle: async () => ({ publicKey: store.vapidKeys().publicKey }) },
    {
      method: 'POST',
      pattern: /^\/push\/subscribe$/,
      handle: async ({ body, email }) => {
        try {
          store.addSubscription(body.subscription, { email, label: body.label })
        } catch (error) {
          throw new RouteError(400, error.code ?? 'push/bad-subscription', '이 브라우저의 알림 구독을 받을 수 없습니다')
        }
        return { ok: true }
      },
    },
    {
      method: 'POST',
      pattern: /^\/push\/unsubscribe$/,
      handle: async ({ body }) => ({ removed: typeof body.endpoint === 'string' && store.removeSubscription(body.endpoint) }),
    },
    {
      method: 'POST',
      pattern: /^\/push\/test$/,
      handle: async () => {
        const results = await notifier.test()
        return { sent: results.filter((r) => r.status === 'fulfilled' && r.value.ok).length, total: results.length }
      },
    },
    { method: 'GET', pattern: /^\/settings$/, handle: async () => store.settings() },
    { method: 'POST', pattern: /^\/settings$/, handle: async ({ body }) => store.updateSettings(body) },
  ]
}
