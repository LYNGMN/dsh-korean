import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startTunnel } from '../server/tunnel.js'

const quiet = { info() {}, warn() {} }

function fakeSpawn(calls) {
  return (binary, args, options) => {
    calls.push({ binary, args, options })
    const child = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    return child
  }
}

function dataDirWithToken(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-handheld-tunnel-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, 'tunnel-token'), 'secret-tunnel-token\n')
  return dir
}

test('터널은 게이트웨이 포트를 --url로 가리키고 토큰은 환경변수로만 넘긴다', (t) => {
  const calls = []
  const tunnel = startTunnel({ dataDir: dataDirWithToken(t), port: 3090, logger: quiet, spawn: fakeSpawn(calls), binary: '/bin/cloudflared' })
  t.after(() => tunnel.stop())
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].args, ['tunnel', '--no-autoupdate', 'run', '--url', 'http://127.0.0.1:3090'])
  assert.equal(calls[0].options.env.TUNNEL_TOKEN, 'secret-tunnel-token')
  assert.ok(!calls[0].args.some((arg) => arg.includes('secret-tunnel-token')))
})

test('cloudflared가 없으면 터널을 띄우지 않는다', (t) => {
  const calls = []
  const tunnel = startTunnel({ dataDir: dataDirWithToken(t), port: 3090, logger: quiet, spawn: fakeSpawn(calls), binary: null })
  assert.equal(tunnel.state(), 'off')
  assert.equal(calls.length, 0)
})
