import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeDsh } from './support/fake-dsh.js'
import { DshClient } from '../server/dsh/client.js'
import { DshApi } from '../server/dsh/api.js'
import { parseSubagentRef, subagentRef, subagentsOf } from '../server/dsh/normalize.js'
import { Hub, HubError } from '../server/gateway/hub.js'

const quiet = { info() {}, warn() {} }

test('a subagent id carries parent, child and mode and survives the round trip', () => {
  const ref = subagentRef('parent-1', 'child-1', 'one-shot')
  assert.deepEqual(parseSubagentRef(ref), { parentId: 'parent-1', childId: 'child-1', mode: 'one-shot' })
  assert.match(ref, /^[A-Za-z0-9._:~-]+$/)
  assert.equal(parseSubagentRef('session-a'), null)
  assert.equal(parseSubagentRef('sub~a~b~made-up'), null)
  assert.equal(parseSubagentRef(subagentRef('p', 'c', 'made-up')).mode, 'unknown')
})

test('the catalog names subagents; list rows add titles and state; external ones are left out', () => {
  const projections = { values: { subagentCatalog: [
    { id: 'c2', createdAt: 2, mode: 'continuable', label: '시험 돌리기' },
    { id: 'c1', createdAt: 1, mode: 'one-shot' },
    { id: 'x1', createdAt: 3, mode: 'external', label: '바깥 실행' },
  ] } }
  const rows = [
    { sessionId: 'c1', parentSessionId: 'p', running: true, projections: { values: { title: '코드 조사' } } },
    { sessionId: 'c2', parentSessionId: 'p', running: false, projections: { values: { subagentTiming: { lastTurnCompleted: true } } } },
    { sessionId: 'other', parentSessionId: 'q', running: true },
  ]
  assert.deepEqual(subagentsOf('p', projections, rows).map((s) => [s.title, s.mode, s.state]), [
    ['코드 조사', 'one-shot', 'running'],
    ['시험 돌리기', 'continuable', 'done'],
  ])
})

test('without a catalog the list rows that point at the parent stand in', () => {
  const rows = [{ sessionId: 'c1', parentSessionId: 'p', running: false, updatedAt: 5 }]
  const [only] = subagentsOf('p', null, rows)
  assert.deepEqual([only.id, only.title, only.mode, only.state], [subagentRef('p', 'c1', 'unknown'), '하위 에이전트', 'unknown', 'idle'])
  assert.deepEqual(subagentsOf('p', { values: {} }, []), [])
})

test('the gateway lists a session\'s subagents, reads their history and refuses to write to them', async (t) => {
  const dsh = await createFakeDsh({ sessions: [
    { sessionId: 'parent', title: '부모' },
    { sessionId: 'kid', parentSessionId: 'parent', label: '자료 찾기', mode: 'one-shot', running: true },
  ] })
  dsh.pushEvent('kid', 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '자료를 찾아 줘' }] })
  const client = new DshClient({ upstreamUrl: () => dsh.url, logger: quiet, backoff: () => 20 })
  const hub = new Hub({ api: new DshApi(client), logger: quiet })
  hub.start()
  t.after(async () => {
    hub.stop()
    client.stop()
    await dsh.close()
  })
  const ready = new Promise((resolve) => client.once('generation', resolve))
  client.start()
  await ready

  assert.deepEqual((await hub.sessions()).map((r) => r.id), ['parent'], 'subagents stay out of the session list')
  const [kid] = await hub.subagents('parent')
  assert.deepEqual([kid.title, kid.mode, kid.state], ['자료 찾기', 'one-shot', 'running'])
  assert.deepEqual(await hub.subagents(kid.id), [], 'a subagent has no list of its own here')

  const page = await hub.history(kid.id)
  assert.deepEqual(page.items.map((i) => [i.kind, i.text]), [['user', '자료를 찾아 줘']])
  await assert.rejects(hub.history(subagentRef('someone-else', 'kid', 'one-shot')), 'the parent in the address must be the real one')

  assert.throws(() => hub.prompt(kid.id, '안녕', 'queue'), HubError)
  assert.throws(() => hub.cancel(kid.id), HubError)
  assert.equal(dsh.state.prompts.length, 0)
})
