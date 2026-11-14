// A small stand-in for the DSH Host API-caller surface, enough for gateway tests
// and `npm run dev`: /connect cookie, POST /api/<endpoint>, /api/remote.mux.
// Sessions hold durable events; tests push live events, stream frames and
// waterfalls and read back what the gateway sent (answers, prompts).
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'

const TOKEN = 'fake-launch-token'
const COOKIE = 'dsh-auth-fake'

export async function createFakeDsh({ sessions = [], workspaces = [], onPrompt } = {}) {
  const state = {
    sessions: new Map(sessions.map((s) => [s.sessionId, { running: false, title: null, events: [], ...s }])),
    answers: [],
    prompts: [],
    cancels: [],
    pendingWaterfalls: new Map(),
    sockets: new Set(),
    eventStreams: new Set(),
    follows: new Set(),
  }
  let generationClientId = null

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/connect') {
      if (url.searchParams.get('token') !== TOKEN) { res.writeHead(401).end(); return }
      res.writeHead(302, { location: '/', 'set-cookie': `${COOKIE}=${randomUUID()}; HttpOnly; Path=/` }).end()
      return
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (!(req.headers.cookie ?? '').includes(COOKIE)) { res.writeHead(401).end(); return }
      let body = ''
      for await (const chunk of req) body += chunk
      const message = JSON.parse(body)
      const endpoint = url.pathname.slice('/api/'.length)
      let result
      try {
        result = { ok: true, value: await unary(endpoint, message.payload?.args ?? {}) }
      } catch (error) {
        result = { ok: false, error: { code: error.code ?? 'fake/error', message: error.message } }
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result }))
      return
    }
    res.writeHead(404).end()
  })

  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true })
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/api/remote.mux') || !(req.headers.cookie ?? '').includes(COOKIE)) { socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, (ws) => onMux(ws))
  })

  // A subagent address must name its real parent, as the Host checks.
  function addressedSession(address) {
    if (address.kind !== 'subagent') return address.sessionId
    const child = state.sessions.get(address.childSessionId)
    if (!child || child.parentSessionId !== address.parentSessionId) throw Object.assign(new Error('unknown subagent'), { code: 'session/not-found' })
    return address.childSessionId
  }

  function sessionOf(id) {
    const s = state.sessions.get(id)
    if (!s) throw Object.assign(new Error(`unknown session ${id}`), { code: 'session/not-found' })
    return s
  }

  function recordsOf(events) {
    return events.map((event) => ({ type: 'event', event }))
  }

  /** Last `maxMessages` user/assistant messages and everything after the first of them. */
  function tail(events, maxMessages) {
    let count = 0
    let start = events.length
    for (let i = events.length - 1; i >= 0; i -= 1) {
      start = i
      if (events[i].type === 'user/message' || events[i].type === 'assistant/message') count += 1
      if (count >= maxMessages) break
    }
    return { slice: events.slice(start), hasMore: start > 0 }
  }

  async function unary(endpoint, args) {
    switch (endpoint) {
      case 'session/list':
        return {
          items: [...state.sessions.values()].map((s) => ({
            sessionId: s.sessionId, cwd: s.cwd ?? '/home/user/project', running: s.running, blank: false,
            ...(s.parentSessionId ? { parentSessionId: s.parentSessionId } : {}),
            updatedAt: s.events.at(-1)?.time ?? 0,
            projections: { values: { title: s.events.findLast((e) => e.type === 'session/title')?.data.title ?? s.title } },
          })),
        }
      case 'session/projections':
        sessionOf(args.request.sessionId)
        return {
          values: {
            subagentCatalog: [...state.sessions.values()].filter((s) => s.parentSessionId === args.request.sessionId)
              .map((s, n) => ({ id: s.sessionId, createdAt: n + 1, mode: s.mode ?? 'continuable', label: s.label })),
          },
        }
      case 'session/events': {
        const { address, beforeSeq, maxMessages = 20 } = args.request
        const s = sessionOf(addressedSession(address))
        const before = typeof beforeSeq === 'number' ? s.events.filter((e) => e.seq < beforeSeq) : s.events
        const { slice, hasMore } = tail(before, maxMessages)
        return { cursor: s.events.at(-1)?.seq ?? -1, records: recordsOf(slice), hasMore }
      }
      case 'session/prompt':
        sessionOf(args.request.sessionId)
        state.prompts.push(args.request)
        if (onPrompt) setTimeout(() => onPrompt(args.request), 0)
        return { accepted: true }
      case 'session/cancel':
        state.cancels.push(args.request.sessionId)
        return {}
      case 'session/create': {
        const sessionId = `session-${randomUUID()}`
        state.sessions.set(sessionId, { sessionId, cwd: args.request.cwd ?? '/home/user/new', running: false, title: null, events: [] })
        return { sessionId, agentPreset: 'standard' }
      }
      case '$events/result': {
        if (args.clientId !== generationClientId) throw Object.assign(new Error('stale client'), { code: 'events/stale-client' })
        if (!state.pendingWaterfalls.has(args.eventId)) throw Object.assign(new Error('already answered'), { code: 'events/settled' })
        state.pendingWaterfalls.delete(args.eventId)
        state.answers.push({ eventId: args.eventId, value: args.outcome?.value })
        for (const stream of state.eventStreams) stream.send({ type: 'cancel', eventId: args.eventId })
        return {}
      }
      default:
        throw Object.assign(new Error(`fake does not serve ${endpoint}`), { code: 'fake/unsupported' })
    }
  }

  function onMux(ws) {
    state.sockets.add(ws)
    const streams = new Map()
    ws.on('close', () => {
      state.sockets.delete(ws)
      for (const s of streams.values()) s.close()
    })
    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString())
      if (frame.type === 'open') {
        const send = (value) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value })) }
        const end = () => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'end', streamId: frame.streamId })) }
        const stream = { send, end, close: () => {} }
        streams.set(frame.streamId, stream)
        openStream(frame.endpoint, frame.payload?.args ?? {}, stream)
      } else if (frame.type === 'cancel') {
        streams.get(frame.streamId)?.close()
        streams.delete(frame.streamId)
      }
    })
  }

  function openStream(endpoint, args, stream) {
    if (endpoint === '$events') {
      generationClientId = randomUUID()
      state.eventStreams.add(stream)
      stream.close = () => state.eventStreams.delete(stream)
      stream.send({ type: 'ready', clientId: generationClientId, host: { home: '/home/user/.dsh' } })
      for (const frame of state.pendingWaterfalls.values()) stream.send(frame)
      return
    }
    if (endpoint === 'session/follow') {
      const { address, maxMessages = 20 } = args.request
      const s = state.sessions.get(addressedSession(address))
      if (!s) { stream.end(); return }
      const { slice, hasMore } = tail(s.events, maxMessages)
      const follow = { sessionId: s.sessionId, stream }
      state.follows.add(follow)
      stream.close = () => state.follows.delete(follow)
      stream.send({ type: 'snapshot', header: { id: s.sessionId, cwd: s.cwd }, cursor: s.events.at(-1)?.seq ?? -1, records: recordsOf(slice), hasMore })
      return
    }
    if (endpoint === 'workspace/follow') {
      stream.send({ type: 'baseline', value: { items: workspaces } })
      return
    }
    stream.end()
  }

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${String(server.address().port)}`

  return {
    url: `${origin}/?token=${TOKEN}`,
    state,
    /** Append a durable event and send it to followers. Returns the event. */
    pushEvent(sessionId, type, data = {}) {
      const s = sessionOf(sessionId)
      const event = { type, seq: (s.events.at(-1)?.seq ?? -1) + 1, time: Date.now(), data }
      s.events.push(event)
      for (const f of state.follows) if (f.sessionId === sessionId) f.stream.send({ type: 'event', event })
      return event
    },
    /** Send an `assistant-stream` frame to followers of a session. */
    pushStream(sessionId, frame) {
      for (const f of state.follows) if (f.sessionId === sessionId) f.stream.send({ type: 'assistant-stream', frame })
    },
    waterfall(frame) {
      const full = { type: 'waterfall', eventId: randomUUID(), ...frame }
      state.pendingWaterfalls.set(full.eventId, full)
      for (const stream of state.eventStreams) stream.send(full)
      return full
    },
    emit(event, args = []) {
      for (const stream of state.eventStreams) stream.send({ type: 'emit', event, args })
    },
    setRunning(sessionId, running) {
      sessionOf(sessionId).running = running
      this.emit('api-session/status')
    },
    /** Drop every mux socket, as a Host restart would. */
    dropSockets() {
      for (const ws of state.sockets) ws.terminate()
    },
    close() {
      for (const ws of state.sockets) ws.terminate()
      const closed = new Promise((resolve) => server.close(() => resolve()))
      server.closeAllConnections()
      return closed
    },
  }
}
