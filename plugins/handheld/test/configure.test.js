import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(import.meta.dirname, '..', 'scripts', 'configure.mjs')

function home(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-handheld-configure-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const run = (dshHome, args) => spawnSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, DSH_HOME: dshHome }, encoding: 'utf8', input: '' })

test('인자로 실행하면 묻지 않고 0600 설정 파일에 저장하고, 터널 토큰 파일은 건드리지 않는다', (t) => {
  const dshHome = home(t)
  const dir = path.join(dshHome, 'dsh-handheld')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'tunnel-token'), 'kept-token', { mode: 0o600 })
  const result = run(dshHome, ['--origin', 'https://dsh.example.test/', '--team', 'https://team.cloudflareaccess.com', '--aud', 'aud-tag', '--emails', 'Me@Example.test, you@example.test'])
  assert.equal(result.status, 0, result.stderr)
  const file = path.join(dir, 'config.json')
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    publicOrigin: 'https://dsh.example.test',
    tunnel: true,
    access: { teamDomain: 'team.cloudflareaccess.com', audience: 'aud-tag', allowedEmails: ['me@example.test', 'you@example.test'] },
  })
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.equal(fs.readFileSync(path.join(dir, 'tunnel-token'), 'utf8'), 'kept-token')
  assert.ok(!result.stdout.includes('kept-token'))
})

test('빠진 인자는 지금 설정값을 쓴다', (t) => {
  const dshHome = home(t)
  assert.equal(run(dshHome, ['--origin', 'https://dsh.example.test', '--team', 'team.cloudflareaccess.com', '--aud', 'aud-1', '--emails', 'me@example.test']).status, 0)
  assert.equal(run(dshHome, ['--aud', 'aud-2']).status, 0)
  const saved = JSON.parse(fs.readFileSync(path.join(dshHome, 'dsh-handheld', 'config.json'), 'utf8'))
  assert.equal(saved.access.audience, 'aud-2')
  assert.equal(saved.publicOrigin, 'https://dsh.example.test')
  assert.deepEqual(saved.access.allowedEmails, ['me@example.test'])
})

test('주소가 https가 아니거나 이메일이 없으면 저장하지 않는다', (t) => {
  const dshHome = home(t)
  assert.notEqual(run(dshHome, ['--origin', 'http://dsh.example.test', '--team', 't.cloudflareaccess.com', '--aud', 'a', '--emails', 'me@example.test']).status, 0)
  assert.notEqual(run(dshHome, ['--origin', 'https://dsh.example.test', '--team', 't.cloudflareaccess.com', '--aud', 'a']).status, 0)
  assert.ok(!fs.existsSync(path.join(dshHome, 'dsh-handheld', 'config.json')))
})

test('--help는 사용법만 보여 주고 아무 파일도 만들지 않는다', (t) => {
  const dshHome = home(t)
  const result = run(dshHome, ['--help'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /사용법/)
  assert.match(result.stdout, /--emails/)
  assert.deepEqual(fs.readdirSync(dshHome), [])
})
