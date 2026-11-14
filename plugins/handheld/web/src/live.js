// The /h/live socket: reconnects with backoff, resumes the open session from
// its last seq, and turns server frames into state changes.
import { api } from './api.js'
import { feedOf, mergeItems, state, update } from './store.js'

const PROTOCOL_VERSION = 1
const PING_MS = 25_000
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 10000]
const STREAM_LINGER_MS = 4000

let socket = null
let attempt = 0
let retryTimer = null
let pingTimer = null
let watching = null

function backoff() {
  const cap = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
  return cap / 2 + Math.random() * (cap / 2)
}

function send(frame) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame))
}

function setSocket(value) {
  if (state.socket !== value) update((s) => { s.socket = value })
}

function connect() {
  clearTimeout(retryTimer)
  if (socket && socket.readyState <= WebSocket.OPEN) return
  setSocket('connecting')
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/h/live`)
  socket = ws
  ws.onopen = () => {
    attempt = 0
    setSocket('open')
    const watch = watching ? { [watching]: feedOf(watching).lastSeq } : {}
    send({ type: 'hello', v: PROTOCOL_VERSION, watch })
    clearInterval(pingTimer)
    pingTimer = setInterval(() => send({ type: 'ping', at: Date.now() }), PING_MS)
  }
  ws.onmessage = (event) => {
    let frame
    try { frame = JSON.parse(event.data) } catch { return }
    receive(frame)
  }
  ws.onclose = () => {
    if (socket !== ws) return
    socket = null
    clearInterval(pingTimer)
    setSocket('down')
    attempt += 1
    if (attempt >= 3) void api('/me').catch(() => {})
    retryTimer = setTimeout(connect, backoff())
  }
}

function receive(frame) {
  switch (frame.type) {
    case 'welcome':
      update((s) => {
        s.upstream = frame.upstream
        s.authExpired = false
      })
      break
    case 'status':
      update((s) => { s.upstream = frame.upstream })
      break
    case 'sessions':
      update((s) => {
        s.sessions = frame.rows
        s.sessionsLoaded = true
      })
      break
    case 'pending':
      update((s) => { s.pending = frame.items })
      break
    case 'items':
      update(() => {
        const feed = feedOf(frame.sessionId)
        mergeItems(feed, frame.items, { reset: frame.reset })
        if (frame.reset) feed.hasMore = frame.hasOlder !== false
        if (!frame.more) feed.synced = true
        if (feed.stream?.ended && frame.items.some((i) => i.kind === 'assistant')) feed.stream = null
      })
      break
    case 'stream':
      // A frame already on its way when this tab stopped watching: its end would never come.
      if (frame.sessionId !== watching) break
      update(() => {
        const feed = feedOf(frame.sessionId)
        let stream = feed.stream
        if (!stream || stream.attemptId !== frame.attemptId) {
          if (frame.textAt !== 0 || frame.reasoningAt !== 0) return
          stream = { attemptId: frame.attemptId, text: '', reasoning: '', tool: null, ended: false }
        }
        if (frame.textAt > stream.text.length || frame.reasoningAt > stream.reasoning.length) return
        feed.stream = {
          ...stream,
          text: stream.text.slice(0, frame.textAt) + frame.text,
          reasoning: stream.reasoning.slice(0, frame.reasoningAt) + frame.reasoning,
          tool: frame.tool,
          ended: false,
        }
      })
      break
    case 'streamEnd':
      update(() => {
        const feed = feedOf(frame.sessionId)
        if (feed.stream?.attemptId !== frame.attemptId) return
        feed.stream = { ...feed.stream, ended: true }
      })
      setTimeout(() => update(() => {
        const feed = feedOf(frame.sessionId)
        if (feed.stream?.attemptId === frame.attemptId && feed.stream.ended) feed.stream = null
      }), STREAM_LINGER_MS)
      break
    default:
      break
  }
}

export function startLive() {
  connect()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      attempt = 0
      connect()
    }
  })
  window.addEventListener('online', () => {
    attempt = 0
    connect()
  })
}

export const watchedSession = () => watching

/** Follow one session (the one on screen); resumes from what this tab already holds. */
export function watchSession(sessionId) {
  if (watching && watching !== sessionId) send({ type: 'unwatch', sessionId: watching })
  watching = sessionId
  send({ type: 'watch', sessionId, since: feedOf(sessionId).lastSeq })
}

export function unwatchSession(sessionId) {
  if (watching !== sessionId) return
  send({ type: 'unwatch', sessionId })
  // Its end frame will not arrive any more; the finished reply comes back as an item.
  update(() => { feedOf(sessionId).stream = null })
  watching = null
}
