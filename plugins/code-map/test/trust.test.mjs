import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { EXTRA_EXTENSIONS, coverageOf, hasIdentifier } from '../lib/engine.js'
import { createCodeMap } from '../lib/index.js'

const rootPath = '/repos/kit'

test('색인 결과의 개수를 그대로 읽고, 없는 값은 0이 아니라 모름으로 둔다', () => {
  assert.deepEqual(coverageOf({
    not_indexed_files_count: 88, parse_partial_count: 8, parse_unusable_count: 2, skipped_count: 0,
  }), { notIndexed: 88, partial: 8, unusable: 2, skipped: 0 })
  assert.deepEqual(coverageOf({ not_indexed_files_count: -1, parse_partial_count: '8' }),
    { notIndexed: null, partial: null, unusable: null, skipped: null })
  assert.equal(coverageOf(undefined).notIndexed, null)
})

test('이름이나 경로가 있는 요청만 자동으로 위치를 찾는다', () => {
  assert.equal(hasIdentifier('로그인 오류 고쳐줘'), false)
  assert.equal(hasIdentifier('이 함수 좀 개선해 줘'), false)
  assert.equal(hasIdentifier('sendResume 함수를 고쳐 줘'), true)
  assert.equal(hasIdentifier('src/cache.js를 확인해 줘'), true)
  assert.equal(hasIdentifier('`load` 호출을 봐 줘'), true)
  assert.equal(hasIdentifier(undefined), false)
})

test('색인 때 읽지 못한 범위와 걸린 시간이 화면용 정보에 담긴다', async () => {
  const coverage = { notIndexed: 88, partial: 8, unusable: 2, skipped: 0 }
  const service = configured({ index: async () => ({ project: 'kit', status: 'indexed', coverage, parse_partial_count: 8 }) })
  await service.refresh('session-1', rootPath)
  const view = service.snapshot('session-1', rootPath)
  assert.deepEqual(view.coverage, coverage)
  assert.equal(view.partial, true)
  assert.equal(typeof view.indexMs, 'number')
  await service.toggle('session-1', rootPath, false)
  assert.equal(service.snapshot('session-1', rootPath).coverage, undefined)
})

test('부분 파싱만 있어도 일부 코드 준비됨으로 알린다', async () => {
  const service = configured({ index: async () => ({ project: 'kit', status: 'indexed', parse_unusable_count: 1,
    coverage: coverageOf({ parse_unusable_count: 1 }) }) })
  await service.refresh('session-1', rootPath)
  assert.equal(service.snapshot('session-1', rootPath).partial, true)
})

test('한국어 문장 요청은 억지로 찾지 않고 이유를 남긴다', async () => {
  const service = configured({ search: async () => { throw new Error('should not match prose') } })
  await service.refresh('session-1', rootPath)
  const step = userStep('로그인 오류를 고쳐 줘 코드가 이상해')
  await service.preStep(step, async () => ({ kind: 'enter', messages: step.messages }))
  const view = service.snapshot('session-1', rootPath)
  assert.deepEqual(view.focus, [])
  assert.equal(view.focusNote, 'no-identifier')
})

test('이름은 있는데 맞는 위치가 없으면 그 사실을 남긴다', async () => {
  const service = configured({ search: async () => [] })
  await service.refresh('session-1', rootPath)
  const step = userStep('sendResume 함수를 고쳐 줘')
  await service.preStep(step, async () => ({ kind: 'enter', messages: step.messages }))
  assert.equal(service.snapshot('session-1', rootPath).focusNote, 'no-match')
})

test('턴이 끝나도 요청 범위의 안내는 유지된다', async () => {
  const service = configured({ search: async () => [], impact: async () => ({ files: [], candidates: [], total: 0 }) },
    { capture: async () => ({ head: 'h', fingerprints: new Map(), partial: false }) })
  await service.refresh('session-1', rootPath)
  const step = userStep('로그인 오류를 고쳐 줘 코드가 이상해')
  await service.preStep(step, async () => ({ kind: 'enter', messages: step.messages }))
  await service.turnEnded(step.agent.session, { type: 'turn/end', data: { turn: 1 } })
  assert.equal(service.snapshot('session-1', rootPath).focusNote, 'no-identifier')
})

test('바뀐 파일이 없고 지도가 최근 것이면 다시 색인하지 않는다', async () => {
  let indexed = 0
  let changed = false
  const service = configured({
    index: async () => { indexed++; return { project: 'kit', status: 'indexed', coverage: coverageOf({}) } },
    search: async () => [],
    impact: async () => ({ files: [], candidates: [], total: 0 }),
  }, {
    capture: async () => ({ head: 'h', fingerprints: new Map([['a.js', changed ? '2' : '1']]), partial: false }),
  })
  await service.refresh('session-1', rootPath)
  assert.equal(indexed, 1)

  const quiet = userStep('readCache 함수를 설명해 줘')
  await service.preStep(quiet, async () => ({ kind: 'enter', messages: quiet.messages }))
  await service.turnEnded(quiet.agent.session, { type: 'turn/end', data: { turn: 1 } })
  assert.equal(indexed, 1, '바뀐 것이 없으면 그대로 둔다')

  const edit = userStep('readCache 함수를 수정해 줘', 2)
  await service.preStep(edit, async () => ({ kind: 'enter', messages: edit.messages }))
  changed = true
  await service.turnEnded(edit.agent.session, { type: 'turn/end', data: { turn: 2 } })
  assert.equal(indexed, 2, '파일이 바뀌면 다시 색인한다')
})

function configured(engine, extra = {}) {
  return createCodeMap({
    rootOf: async () => rootPath,
    preferences: { has: async () => true, set: async () => {} },
    engine: { index: async () => ({ project: 'kit', status: 'indexed' }), ...engine },
    ...extra,
  })
}

function userStep(text, turn = 1) {
  return {
    agent: { session: { id: 'session-1', header: {} } },
    turn,
    step: 1,
    signal: new AbortController().signal,
    messages: [{ role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }],
  }
}

test('엔진이 모르는 형식을 읽지 못한 범위에 더하고 낡은 지도처럼 일부로 알린다', async () => {
  const service = configured({
    index: async () => ({ project: 'kit', status: 'indexed', coverage: coverageOf({ not_indexed_files_count: 0 }) }),
    unknownFormats: async () => [{ ext: '.gs', files: 28 }],
  })
  await service.refresh('session-1', rootPath)
  const view = service.snapshot('session-1', rootPath)
  assert.deepEqual(view.coverage.unknownFormats, [{ ext: '.gs', files: 28 }])
  assert.equal(view.partial, true)
})

test('형식을 알아내지 못하면 없다고 하지 않고 null로 둔다', async () => {
  const service = configured({
    index: async () => ({ project: 'kit', status: 'indexed', coverage: coverageOf({}) }),
    unknownFormats: async () => null,
  })
  await service.refresh('session-1', rootPath)
  assert.equal(service.snapshot('session-1', rootPath).coverage.unknownFormats, null)
})

test('구글스크립트 확장자를 자바스크립트로 읽도록 엔진 설정에 둔다', () => {
  assert.equal(EXTRA_EXTENSIONS['.gs'], 'javascript')
  assert.equal(Object.isFrozen(EXTRA_EXTENSIONS), true)
})

test('코드 후보 공백이 있으면 일부만 읽은 것으로 알리고 문서·이미지만 빠졌으면 알리지 않는다', async () => {
  const run = async unmapped => {
    const service = configured({
      index: async () => ({ project: 'kit', status: 'indexed', coverage: coverageOf({ not_indexed_files_count: 89 }), not_indexed_files_count: 89 }),
      gaps: async () => ({ unknownFormats: [], unmapped }),
    })
    await service.refresh('session-1', rootPath)
    return service.snapshot('session-1', rootPath)
  }
  const quiet = await run({ look: 0, tests: 76, quiet: 13, lookTop: [] })
  assert.equal(quiet.partial, false, '엔진이 89개라고 해도 코드가 아닌 파일이면 경고하지 않는다')
  assert.deepEqual({ ...quiet.coverage.unmapped }, { look: 0, tests: 76, quiet: 13, lookTop: [] })
  const code = await run({ look: 3, tests: 0, quiet: 0, lookTop: [{ ext: '.gs', files: 3 }] })
  assert.equal(code.partial, true)
  const failed = await run(null)
  assert.equal(failed.partial, true, '조사를 못 했으면 엔진 숫자(89)로 판단해 경고한다')
  assert.equal(failed.coverage.unmapped, null)
})
