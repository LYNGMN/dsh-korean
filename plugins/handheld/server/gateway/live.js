// One phone WebSocket on /h/live: hello/watch/unwatch/ping in, hub frames out.
import { PING_INTERVAL_SECONDS, PROTOCOL_VERSION } from '../protocol.js'

const SILENT_LIMIT_MS = PING_INTERVAL_SECONDS * 3 * 1000

/**
 * @param {import('ws').WebSocket} ws
 * @param {{hub: import('./hub.js').Hub, email: string, logger?: {warn?: Function}}} context
 */
export function serveLive(ws, { hub, email, logger = console }) {
  let lastSeen = Date.now()
  const conn = {
    send(frame) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame))
    },
  }
  conn.send({ type: 'welcome', v: PROTOCOL_VERSION, upstream: hub.upstream, email })
  const handle = hub.connect(conn)

  const timer = setInterval(() => {
    if (Date.now() - lastSeen > SILENT_LIMIT_MS) {
      ws.terminate()
      return
    }
    ws.ping()
  }, PING_INTERVAL_SECONDS * 1000)
  timer.unref?.()

  function watch(sessionId, since) {
    handle.watch(sessionId, since).catch((error) => {
      logger.warn?.(`[dsh-handheld] watch failed (${error.code ?? error.message})`)
      conn.send({ type: 'error', code: error.code ?? 'watch/failed', message: '세션을 불러오지 못했습니다' })
    })
  }

  ws.on('pong', () => { lastSeen = Date.now() })
  ws.on('message', (data, isBinary) => {
    lastSeen = Date.now()
    if (isBinary) return
    let frame
    try { frame = JSON.parse(data.toString()) } catch { return }
    switch (frame?.type) {
      case 'hello':
        if (frame.v !== PROTOCOL_VERSION) {
          conn.send({ type: 'error', code: 'protocol/version', message: '앱을 새로 고쳐 주세요' })
          ws.close(4000, 'protocol version')
          return
        }
        for (const [sessionId, since] of Object.entries(frame.watch ?? {}).slice(0, 4)) watch(sessionId, typeof since === 'number' ? since : null)
        break
      case 'watch':
        watch(frame.sessionId, typeof frame.since === 'number' ? frame.since : null)
        break
      case 'unwatch':
        handle.unwatch(frame.sessionId)
        break
      case 'ping':
        conn.send({ type: 'pong', at: frame.at ?? null })
        break
      default:
        break
    }
  })
  ws.on('close', () => {
    clearInterval(timer)
    handle.close()
  })
  ws.on('error', () => ws.terminate())
}
