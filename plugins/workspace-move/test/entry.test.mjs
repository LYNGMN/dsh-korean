import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { apply, inject, name } from '../index.js'

test('Host 진입점은 인증된 /api 정확 경로 하나를 연다', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'dwm-entry-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const routes = []
    const effects = []
    const ctx = {
      logger: () => ({ info() {}, warn() {}, error() {} }),
      effect: (factory) => { effects.push(factory()) },
      connection: {
        fetch: {
          register: (route) => {
            routes.push(route)
            return async () => {}
          },
        },
      },
      sessionPersistence: {},
      workspaceRegistry: { list: () => [] },
    }

    apply(ctx, {})

    assert.equal(name, 'dsh-workspace-move')
    assert.deepEqual(inject, ['connection', 'sessionPersistence', 'workspaceRegistry'])
    assert.equal(effects.length, 1)
    assert.equal(routes.length, 1)
    assert.equal(routes[0].path, '/api/workspace-move')
    assert.deepEqual(routes[0].methods, ['POST'])
    assert.equal(routes[0].requestBody, 'buffered')

    const response = await routes[0].fetch(new Request('http://127.0.0.1/api/workspace-move', {
      method: 'POST',
      body: 'not json',
    }))
    const payload = await response.json()
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'bad-request')
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await fsp.rm(home, { recursive: true, force: true })
  }
})
