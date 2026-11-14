// The gateway's HTTP side on 127.0.0.1: who is asking (Access JWT, or the
// loopback-only dev bypass), Origin checks, security headers, the PWA files,
// /h/api routes and the /h/live upgrade. Knows nothing about DSH.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { API_PATH, BASE_PATH, LIVE_PATH, MAX_FRAME_BYTES } from '../protocol.js'
import { accessTokenFrom } from './access-auth.js'
import { serveLive } from './live.js'
import { createRoutes, RouteError } from './routes.js'

const MAX_BODY_BYTES = 256 * 1024
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const EDGE_HEADERS = ['cf-ray', 'cf-connecting-ip', 'cf-access-jwt-assertion', 'cf-visitor', 'x-forwarded-for']
const DEV_EMAIL = 'dev@localhost'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

const SECURITY_HEADERS = {
  'content-security-policy': csp(null),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'microphone=(self), camera=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
}

/** Older Safari does not let 'self' cover ws:/wss:, so the socket origin is named. */
function csp(host) {
  const socket = typeof host === 'string' && /^[A-Za-z0-9.:[\]-]+$/.test(host) ? ` wss://${host} ws://${host}` : ''
  return `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'${socket}; font-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
}

function hostnameOf(hostHeader) {
  if (typeof hostHeader !== 'string') return ''
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1)
  return hostHeader.split(':')[0]
}

/** Direct loopback request that never passed through the tunnel. */
export function isDirectLoopback(req) {
  return LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '')
    && LOOPBACK_HOSTS.has(hostnameOf(req.headers.host).toLowerCase())
    && EDGE_HEADERS.every((h) => req.headers[h] === undefined)
}

/**
 * @param {object} options
 * @param {import('./hub.js').Hub} options.hub
 * @param {import('../store.js').Store} options.store
 * @param {{notify: Function, test: Function}} options.notifier
 * @param {{verify(token: string): Promise<{email: string}>} | null} options.verifier - null refuses every non-dev request
 * @param {string | null} options.publicOrigin - e.g. https://dsh.example.com
 * @param {boolean} [options.devNoAuth]
 * @param {string} options.staticDir - built PWA (web/dist)
 * @param {string} options.version
 */
export function createGateway({ hub, store, notifier, verifier, publicOrigin, devNoAuth = false, staticDir, version, logger = console }) {
  const routes = createRoutes({ hub, store, notifier, version })
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: { threshold: 512 }, maxPayload: MAX_FRAME_BYTES })

  async function identify(req) {
    if (devNoAuth && isDirectLoopback(req)) return { email: DEV_EMAIL, dev: true }
    if (!verifier) return null
    const token = accessTokenFrom(req.headers)
    if (!token) return null
    try {
      const { email } = await verifier.verify(token)
      return { email, dev: false }
    } catch {
      return null
    }
  }

  function originAllowed(req, who) {
    const origin = req.headers.origin
    if (typeof origin !== 'string') return false
    if (who.dev) return origin === `http://${req.headers.host}`
    return publicOrigin !== null && origin === publicOrigin
  }

  function send(res, status, body, headers = {}) {
    const isJson = typeof body !== 'string' && !Buffer.isBuffer(body)
    const payload = isJson ? JSON.stringify(body) : body
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    })
    res.end(payload)
  }

  async function readBody(req) {
    let size = 0
    const chunks = []
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) throw new RouteError(413, 'body-too-large', '보낸 내용이 너무 큽니다')
      chunks.push(chunk)
    }
    if (size === 0) return {}
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      return value && typeof value === 'object' ? value : {}
    } catch {
      throw new RouteError(400, 'bad-json', '요청 형식이 올바르지 않습니다')
    }
  }

  async function serveApi(req, res, url, who) {
    const sub = url.pathname.slice(API_PATH.length) || '/'
    for (const route of routes) {
      if (route.method !== req.method) continue
      const match = route.pattern.exec(sub)
      if (!match) continue
      if (req.method !== 'GET' && !originAllowed(req, who)) throw new RouteError(403, 'bad-origin', '허용되지 않은 출처입니다')
      if (req.method === 'POST' && !(req.headers['content-type'] ?? '').startsWith('application/json')) {
        throw new RouteError(415, 'json-only', 'JSON으로 보내 주세요')
      }
      const body = req.method === 'POST' ? await readBody(req) : {}
      const value = await route.handle({ params: match.slice(1), body, query: url.searchParams, email: who.email })
      send(res, 200, value)
      return
    }
    throw new RouteError(404, 'not-found', '없는 주소입니다')
  }

  function serveStatic(req, res, url) {
    let rel = url.pathname.slice(BASE_PATH.length + 1)
    if (rel === '' || !path.extname(rel)) rel = 'index.html'
    const file = path.resolve(staticDir, rel)
    if (!file.startsWith(path.resolve(staticDir) + path.sep)) {
      send(res, 404, '없는 파일입니다')
      return
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? '없는 파일입니다' : '파일을 읽지 못했습니다')
        return
      }
      const immutable = rel.startsWith('assets/')
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-security-policy': csp(req.headers.host),
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
      res.end(data)
    })
  }

  function mapError(error) {
    if (error instanceof RouteError) return { status: error.status, code: error.code, message: error.message }
    if (typeof error?.status === 'number') return { status: error.status, code: error.code, message: error.message }
    if (error?.code === 'client/offline') return { status: 503, code: 'upstream/offline', message: 'DSH에 연결되어 있지 않습니다' }
    if (typeof error?.code === 'string') return { status: 502, code: error.code, message: 'DSH가 요청을 처리하지 못했습니다' }
    return { status: 500, code: 'internal', message: '게이트웨이 오류가 났습니다' }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://gateway.invalid')
    try {
      if (url.pathname === '/' || url.pathname === BASE_PATH) {
        res.writeHead(302, { ...SECURITY_HEADERS, location: `${BASE_PATH}/` })
        res.end()
        return
      }
      if (!url.pathname.startsWith(`${BASE_PATH}/`)) {
        send(res, 404, '없는 주소입니다')
        return
      }
      const who = await identify(req)
      if (!who) {
        send(res, 401, { code: 'unauthenticated', message: '로그인이 필요합니다' })
        return
      }
      if (url.pathname.startsWith(`${API_PATH}/`) || url.pathname === API_PATH) {
        await serveApi(req, res, url, who)
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(res, 405, '허용되지 않은 방법입니다')
        return
      }
      serveStatic(req, res, url)
    } catch (error) {
      const mapped = mapError(error)
      if (mapped.status >= 500) logger.warn?.(`[dsh-handheld] ${req.method ?? ''} ${url.pathname} failed (${mapped.code})`)
      if (!res.headersSent) send(res, mapped.status, { code: mapped.code, message: mapped.message })
      else res.destroy()
    }
  })

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://gateway.invalid')
    const refuse = (status) => {
      socket.write(`HTTP/1.1 ${String(status)} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
      socket.destroy()
    }
    if (url.pathname !== LIVE_PATH) return refuse(404)
    const who = await identify(req)
    if (!who) return refuse(401)
    if (!originAllowed(req, who)) return refuse(403)
    wss.handleUpgrade(req, socket, head, (ws) => serveLive(ws, { hub, email: who.email, logger }))
  })

  return {
    server,
    listen(port) {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject)
          resolve(server.address().port)
        })
      })
    },
    close() {
      for (const ws of wss.clients) ws.terminate()
      const closed = new Promise((resolve) => server.close(() => resolve()))
      server.closeAllConnections()
      return closed
    },
  }
}
