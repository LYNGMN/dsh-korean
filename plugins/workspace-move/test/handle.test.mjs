import assert from 'node:assert/strict'
import test from 'node:test'
import { makeWorld, seedSession } from './world.mjs'

function post(service, body) {
  return service.handle(new Request('http://127.0.0.1/api/workspace-move', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

test('preflight와 move를 JSON 봉투로 답한다', async () => {
  const world = await makeWorld()
  try {
    const { id } = await seedSession(world)

    const preflight = await (await post(world.service, { action: 'preflight', sessionId: id })).json()
    assert.equal(preflight.ok, true)
    assert.equal(preflight.value.sourceWorkspaceId, world.wsA.id)

    const moved = await (await post(world.service, { action: 'move', sessionId: id, targetWorkspaceId: world.wsB.id })).json()
    assert.equal(moved.ok, true)
    assert.equal(moved.value.toWorkspaceId, world.wsB.id)
  } finally {
    await world.cleanup()
  }
})

test('실패는 ok:false와 코드로 답한다', async () => {
  const world = await makeWorld()
  try {
    const response = await post(world.service, { action: 'move', sessionId: 'session-missing', targetWorkspaceId: world.wsB.id })
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'session-not-found')
  } finally {
    await world.cleanup()
  }
})

test('잘못된 JSON도 200과 bad-request로 답한다', async () => {
  const world = await makeWorld()
  try {
    const response = await world.service.handle(new Request('http://127.0.0.1/api/workspace-move', {
      method: 'POST',
      body: 'not json',
    }))
    const payload = await response.json()
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'bad-request')
  } finally {
    await world.cleanup()
  }
})
