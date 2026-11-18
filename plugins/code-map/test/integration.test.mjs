import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'

const backend = await (existsSync(new URL('../lib/index.js', import.meta.url))
  ? import('../lib/index.js')
  : Promise.resolve({}))

test('등록한 탭이 작업 단계 바로 다음 순서로 들어간다', async () => {
  const { readFile } = await import('node:fs/promises')
  const url = new URL('../lib/client.js', import.meta.url)
  const script = existsSync(url) ? await readFile(url, 'utf8') : ''
  assert.match(script, /name: 'conversation.view', id: 'dsh-code-map', order: 31/)
})

test('꺼진 저장소에서는 일상 대화나 코드 요청이 들어와도 분석하지 않는다', async () => {
  assert.equal(typeof backend.createCodeMap, 'function')
  let calls = 0
  const service = backend.createCodeMap({
    rootOf: async () => '/repos/kit',
    preferences: { has: async () => false },
    engine: { index: async () => { ++calls } },
  })
  const before = { kind: 'enter', messages: [{ role: 'user', content: [] }] }
  const decision = await service.preStep(userStep('sendResume 함수를 고쳐 줘'), async () => before)
  assert.equal(decision, before)
  assert.equal(calls, 0)
})

test('코딩 요청에만 위치를 세 개까지 붙이고 원래 메시지를 보존한다', async () => {
  assert.equal(typeof backend.createCodeMap, 'function')
  const rows = Array.from({ length: 6 }, (_, index) => ({ name: 'sendResume', file: 'src/' + index + '.js', line: index + 1 }))
  const service = configured({
    search: async () => rows,
    impact: async () => ({ files: [], candidates: [], total: 0 }),
  })
  await service.refresh('session-1', '/repos/kit')
  const conversation = userStep('sendResume 함수를 고쳐 줘')
  const decision = { kind: 'enter', messages: conversation.messages }
  const smallTalk = await service.preStep(userStep('좋아요, 감사합니다'), async () => decision)
  assert.equal(smallTalk, decision)
  const coded = await service.preStep(conversation, async () => decision)
  assert.equal(coded.messages[0], decision.messages[0])
  assert.equal(coded.messages[1].source.kind, 'dsh-code-map')
  assert.match(coded.messages[1].content[0].text, /src\/2\.js/)
  assert.doesNotMatch(coded.messages[1].content[0].text, /src\/3\.js/)
  assert.equal(service.snapshot('session-1', '/repos/kit').focus.length, 3)
})

test('코딩 턴 종료 후 작업 폴더의 변경 영향이 표시된다', async () => {
  assert.equal(typeof backend.createCodeMap, 'function')
  const impact = { files: ['src/cache.js'], candidates: [{ name: 'load', file: 'src/read.js', hop: 1 }], total: 1 }
  const service = configured({ search: async () => [], impact: async () => impact })
  const step = userStep('readCache 함수를 변경해 줘')
  await service.preStep(step, async () => ({ kind: 'enter', messages: step.messages }))
  await service.turnEnded(step.agent.session, { type: 'turn/end', data: { turn: 1 } })
  assert.deepEqual(service.snapshot('session-1', '/repos/kit').impact, impact)
  assert.deepEqual(service.snapshot('session-1', '/repos/other').focus, [])
  assert.equal(service.snapshot('session-1', '/repos/other').impact, undefined)
})

test('엔진 오류는 DSH의 계속 진행을 방해하지 않는다', async () => {
  assert.equal(typeof backend.createCodeMap, 'function')
  const service = configured({ search: async () => { throw new Error('private diagnostic') } })
  await service.refresh('session-1', '/repos/kit')
  const step = userStep('findTotal 함수를 수정해 줘')
  const before = { kind: 'enter', messages: step.messages }
  assert.equal(await service.preStep(step, async () => before), before)
})

test('사용자가 세션 경로를 넘겨도 분석 범위는 호스트가 확인한 저장소다', async () => {
  assert.equal(typeof backend.createHandler, 'function')
  const actions = []
  const handler = backend.createHandler({
    rootOfSession: async (id) => id === 'session-1' ? '/repos/kit' : null,
    service: {
      toggle: async (...args) => { actions.push(args) },
      snapshot: () => ({ state: 'off' }),
    },
  })
  const request = new Request('http://host/api/dsh-code-map?sessionId=session-1&root=/elsewhere', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-code-map': '1' },
    body: JSON.stringify({ action: 'enable', root: '/elsewhere' }),
  })
  assert.equal((await handler(request)).status, 200)
  assert.deepEqual(actions, [['session-1', '/repos/kit', true]])
  const wrongOrigin = new Request('http://host/api/dsh-code-map?sessionId=session-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-code-map': '1', 'sec-fetch-site': 'cross-site' },
    body: JSON.stringify({ action: 'disable' }),
  })
  assert.equal((await handler(wrongOrigin)).status, 403)
  assert.equal(actions.length, 1)
})

function configured(engine) {
  return backend.createCodeMap({
    rootOf: async () => '/repos/kit',
    preferences: { has: async () => true },
    engine: { index: async () => ({ project: 'kit', status: 'indexed' }), ...engine },
  })
}

function userStep(text) {
  return {
    agent: { session: { id: 'session-1', header: {} } },
    turn: 1,
    step: 1,
    signal: new AbortController().signal,
    messages: [{ role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }],
  }
}
