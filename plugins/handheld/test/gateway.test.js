import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { createFakeDsh } from './support/fake-dsh.js'
import { DshClient } from '../server/dsh/client.js'
import { DshApi } from '../server/dsh/api.js'
import { Hub } from '../server/gateway/hub.js'
import { createGateway } from '../server/gateway/server.js'
import { Store } from '../server/store.js'

const quiet = { info() {}, warn() {} }
const SID = 'session-a'
const PUBLIC = 'https://dsh.example.test'

async function setup(t, { devNoAuth = false } = {}) {
  const dsh = await createFakeDsh({ sessions: [{ sessionId: SID, title: '게이트웨이' }] })
  dsh.pushEvent(SID, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '안녕' }] })
  const client = new DshClient({ upstreamUrl: () => dsh.url, logger: quiet, backoff: () => 20 })
  const api = new DshApi(client)
  const hub = new Hub({ api, logger: quiet })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-handheld-gw-'))
  const staticDir = path.join(dir, 'dist')
  fs.mkdirSync(path.join(staticDir, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>t</title>')
  fs.writeFileSync(path.join(staticDir, 'assets', 'app-1.js'), 'void 0')
  const store = new Store(path.join(dir, 'data'))
  const notifier = { notify: async () => [], test: async () => [] }
  const verifier = {
    async verify(token) {
      if (token !== 'good-token') throw new Error('bad token')
      return { email: 'me@example.test' }
    },
  }
  const gateway = createGateway({ hub, store, notifier, verifier, publicOrigin: PUBLIC, devNoAuth, staticDir, version: '9.9.9', logger: quiet })
  hub.start()
  const ready = new Promise((resolve) => client.once('generation', resolve))
  client.start()
  await ready
  const port = await gateway.listen(0)
  t.after(async () => {
    hub.stop()
    client.stop()
    await gateway.close()
    await dsh.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return { dsh, hub, store, base: `http://127.0.0.1:${String(port)}`, port }
}

const asTunnel = (extra = {}) => ({ host: 'dsh.example.test', 'cf-ray': 'abc', 'cf-access-jwt-assertion': 'good-token', ...extra })

test('requests without a valid Access token are refused', async (t) => {
  const { base } = await setup(t)
  assert.equal((await fetch(`${base}/h/api/me`)).status, 401)
  assert.equal((await fetch(`${base}/h/api/me`, { headers: { 'cf-access-jwt-assertion': 'bad' } })).status, 401)
  const ok = await fetch(`${base}/h/api/me`, { headers: asTunnel() })
  assert.equal(ok.status, 200)
  const me = await ok.json()
  assert.equal(me.email, 'me@example.test')
  assert.equal(me.upstream, 'connected')
  assert.match(ok.headers.get('content-security-policy'), /frame-ancestors 'none'/)
})

test('the dev bypass only works for direct loopback requests', async (t) => {
  const { base, port } = await setup(t, { devNoAuth: true })
  assert.equal((await fetch(`${base}/h/api/me`)).status, 200)
  assert.equal((await fetch(`${base}/h/api/me`, { headers: { 'cf-ray': 'x' } })).status, 401)
  assert.equal(await statusWithHost(port, 'dsh.example.test'), 401)
  assert.equal(await statusWithHost(port, `localhost:${String(port)}`), 200)
})

function statusWithHost(port, host) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/h/api/me', headers: { host } }, (res) => {
      res.resume()
      resolve(res.statusCode)
    }).on('error', reject)
  })
}

test('writes need the public Origin and JSON', async (t) => {
  const { base, dsh } = await setup(t)
  const url = `${base}/h/api/sessions/${SID}/prompt`
  const body = JSON.stringify({ text: '계속' })
  assert.equal((await fetch(url, { method: 'POST', headers: { ...asTunnel(), 'content-type': 'application/json' }, body })).status, 403)
  assert.equal((await fetch(url, { method: 'POST', headers: { ...asTunnel(), origin: 'https://evil.test', 'content-type': 'application/json' }, body })).status, 403)
  assert.equal((await fetch(url, { method: 'POST', headers: { ...asTunnel(), origin: PUBLIC, 'content-type': 'text/plain' }, body })).status, 415)
  const ok = await fetch(url, { method: 'POST', headers: { ...asTunnel(), origin: PUBLIC, 'content-type': 'application/json' }, body })
  assert.equal(ok.status, 200)
  assert.equal(dsh.state.prompts[0].content[0].text, '계속')
})

test('approvals are answered through POST /h/api/pending/:id', async (t) => {
  const { base, dsh, hub } = await setup(t)
  const frame = dsh.waterfall({ event: 'approval/request', agentId: SID, request: { toolName: 'write', callId: 'c1' } })
  for (let i = 0; i < 50 && hub.pendingList().length === 0; i += 1) await new Promise((r) => setTimeout(r, 20))
  const list = await (await fetch(`${base}/h/api/pending`, { headers: asTunnel() })).json()
  assert.equal(list.items[0].id, frame.eventId)
  const headers = { ...asTunnel(), origin: PUBLIC, 'content-type': 'application/json' }
  const res = await fetch(`${base}/h/api/pending/${frame.eventId}`, { method: 'POST', headers, body: JSON.stringify({ decision: 'reject' }) })
  assert.equal(res.status, 200)
  assert.deepEqual(dsh.state.answers, [{ eventId: frame.eventId, value: 'rejected' }])
  const again = await fetch(`${base}/h/api/pending/${frame.eventId}`, { method: 'POST', headers, body: JSON.stringify({ decision: 'allow' }) })
  assert.equal(again.status, 409)
})

test('push subscriptions only accept browser push services', async (t) => {
  const { base, store } = await setup(t)
  const headers = { ...asTunnel(), origin: PUBLIC, 'content-type': 'application/json' }
  const keys = { p256dh: 'BPk', auth: 'x' }
  const bad = await fetch(`${base}/h/api/push/subscribe`, { method: 'POST', headers, body: JSON.stringify({ subscription: { endpoint: 'http://169.254.169.254/latest', keys } }) })
  assert.equal(bad.status, 400)
  const good = await fetch(`${base}/h/api/push/subscribe`, { method: 'POST', headers, body: JSON.stringify({ subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys } }) })
  assert.equal(good.status, 200)
  assert.equal(store.subscriptions()[0].email, 'me@example.test')
  const key = await (await fetch(`${base}/h/api/push/key`, { headers: asTunnel() })).json()
  assert.match(key.publicKey, /^[A-Za-z0-9_-]{80,}$/)
  const stat = fs.statSync(path.join(store.dir, 'vapid.json'))
  assert.equal(stat.mode & 0o777, 0o600)
})

test('static files: index fallback, immutable assets, no traversal', async (t) => {
  const { base } = await setup(t)
  const index = await fetch(`${base}/h/`, { headers: asTunnel() })
  assert.equal(index.status, 200)
  assert.equal(index.headers.get('cache-control'), 'no-cache')
  const asset = await fetch(`${base}/h/assets/app-1.js`, { headers: asTunnel() })
  assert.match(asset.headers.get('cache-control'), /immutable/)
  assert.equal((await fetch(`${base}/h/..%2f..%2fpackage.json`, { headers: asTunnel() })).status, 404)
  assert.equal((await fetch(`${base}/elsewhere`, { headers: asTunnel() })).status, 404)
})

function openLive(port, headers) {
  const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/h/live`, { headers })
  const frames = []
  ws.on('message', (data) => frames.push(JSON.parse(data.toString())))
  return {
    ws,
    frames,
    opened: new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('unexpected-response', (_req, res) => reject(new Error(String(res.statusCode))))
      ws.once('error', reject)
    }),
    async waitFor(pred) {
      for (let i = 0; i < 100; i += 1) {
        const hit = frames.find(pred)
        if (hit) return hit
        await new Promise((r) => setTimeout(r, 20))
      }
      throw new Error(`timed out; got ${frames.map((f) => f.type).join(',')}`)
    },
  }
}

test('live socket: Origin and token checked, then hello resumes a session', async (t) => {
  const { port } = await setup(t)
  await assert.rejects(openLive(port, asTunnel()).opened, /403/)
  await assert.rejects(openLive(port, { ...asTunnel({ 'cf-access-jwt-assertion': 'bad' }), origin: PUBLIC }).opened, /401/)
  const live = openLive(port, { ...asTunnel(), origin: PUBLIC })
  await live.opened
  t.after(() => live.ws.terminate())
  const welcome = await live.waitFor((f) => f.type === 'welcome')
  assert.equal(welcome.email, 'me@example.test')
  live.ws.send(JSON.stringify({ type: 'hello', v: 1, watch: { [SID]: null } }))
  const items = await live.waitFor((f) => f.type === 'items')
  assert.equal(items.items[0].text, '안녕')
  live.ws.send(JSON.stringify({ type: 'ping', at: 5 }))
  assert.equal((await live.waitFor((f) => f.type === 'pong')).at, 5)
})
