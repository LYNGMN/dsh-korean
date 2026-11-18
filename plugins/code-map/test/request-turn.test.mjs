import assert from 'node:assert/strict'
import test from 'node:test'
import { createCodeMap } from '../lib/index.js'

function fixture(options = {}) {
  const engine = {
    async index() { return { status: 'indexed', project: 'kit' } },
    async search() { return [] },
    async impact() { return { files: ['old.js', 'new.js'], candidates: [{ id: 'old' }] } },
    async scopedImpact(_root, _project, files) {
      assert.deepEqual(files, ['new.js'])
      return { candidates: [{ id: 'new' }], partial: false }
    },
    ...options.engine,
  }
  let taken = 0
  const service = createCodeMap({
    rootOf: async session => session.root,
    preferences: { has: async () => true },
    engine,
    capture: options.capture ?? (async () => ({
      head: 'test-head',
      fingerprints: new Map(taken++ ? [['old.js', 'earlier'], ['new.js', 'fresh']] : [['old.js', 'earlier']]),
      partial: false,
    })),
  })
  const session = (id, root = '/repos/kit') => ({ id, root, header: {} })
  const start = (session, turn = 1, text = 'readCache 함수를 수정해 줘') => service.preStep({
    agent: { session }, turn, step: 1, messages: [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] }],
  }, async () => ({ kind: 'enter', messages: [] }))
  const finish = (session, turn = 1) => service.turnEnded(session, { type: 'turn/end', data: { turn } })
  return { service, session, start, finish }
}

test('최신 요청의 파일과 후보만 보여 주고 저장소 전체 내역은 따로 유지한다', async () => {
  const { service, session, start, finish } = fixture()
  const a = session('a')
  await start(a)
  await finish(a)
  const result = service.snapshot('a', a.root)
  assert.deepEqual(result.requestImpact, { status: 'ready', files: ['new.js'], candidates: [{ id: 'new' }], partial: false })
  assert.deepEqual(result.impact.files, ['old.js', 'new.js'])
  assert.equal(service.snapshot('b', a.root).requestImpact, undefined)
})

test('같은 저장소에서 두 요청이 겹치거나 작업 폴더가 이동하면 변경 없음으로 보여 주지 않는다', async () => {
  const { service, session, start, finish } = fixture()
  const a = session('a')
  const b = session('b')
  await start(a)
  await start(b, 1, '안녕하세요')
  await finish(b)
  await finish(a)
  assert.equal(service.snapshot('a', a.root).requestImpact?.status, 'unavailable')
  assert.equal(service.snapshot('b', b.root).requestImpact, undefined)
  await start(a, 2)
  a.root = '/repos/other'
  await finish(a, 2)
  assert.equal(service.snapshot('a', a.root).requestImpact?.status, 'unavailable')
})

test('시작 파일 비교가 대기 한도를 넘으면 채팅을 이어가고 범위는 확인 불가로 남긴다', async () => {
  const { service, session, start, finish } = fixture({
    capture: async (_root, { signal }) => new Promise((_, reject) => {
      // An early cancellation is observable even while the simulated FS read waits.
      const keepAlive = setTimeout(() => reject(new Error('should be aborted')), 2500)
      signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason) }, { once: true })
    }),
  })
  const a = session('a')
  const begin = performance.now()
  const decision = await start(a)
  assert.equal(decision.kind, 'enter')
  assert.ok(performance.now() - begin < 1500)
  await finish(a)
  assert.equal(service.snapshot('a', a.root).requestImpact?.status, 'unavailable')
})
