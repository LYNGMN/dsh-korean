import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codeGapsOf, codeRequestLine, codeRouteOf, codeSummaryOf } from '../src/code-summary.js'

test('라우트는 세션 id만 싣는다', () => {
  assert.equal(codeRouteOf('a b'), 'api/dsh-code-map?sessionId=a%20b')
})

test('읽지 못한 범위는 0이어도 만들고, 모르는 값은 확인 안 됨으로 쓴다', () => {
  assert.deepEqual(codeGapsOf({ notIndexed: 0, partial: 3, unusable: undefined }).map(({ label, tone }) => [label, tone]), [
    ['지도에 넣지 못한 파일 없음', 'idle'], ['일부만 읽은 파일 3개', 'warn'], ['읽지 못한 파일 확인 안 됨', 'warn'],
  ])
  assert.equal(codeGapsOf(undefined), null)
  assert.equal(codeGapsOf({ notIndexed: -1 })[0].label, '지도에 넣지 못한 파일 확인 안 됨')
})

test('코드가 아닌 파일과 테스트 파일은 숫자만 보이고 주황이 아니다', () => {
  const gaps = codeGapsOf({ notIndexed: 89, partial: 0, unusable: 0, unmapped: { look: 0, tests: 76, quiet: 13, lookTop: [] } })
  assert.deepEqual(gaps.map(({ label, tone }) => [label, tone]), [
    ['지도에 없는 코드 없음', 'idle'], ['일부만 읽은 파일 없음', 'idle'], ['읽지 못한 파일 없음', 'idle'],
    ['테스트 파일 76개', 'idle'], ['문서·설정·이미지 13개', 'idle'],
  ])
  assert.equal(codeGapsOf({ partial: 0, unusable: 0, unmapped: { look: 4, tests: 0, quiet: 0 } })[0].tone, 'warn')
  assert.equal(codeGapsOf({ partial: 0, unusable: 0, unmapped: null })[0].label, '지도에 넣지 못한 파일 확인 안 됨', '조사를 못 했으면 엔진 숫자로')
})

test('요청 범위 문장은 상태마다 다르다', () => {
  assert.match(codeRequestLine(undefined), /코딩 요청이 끝나면/)
  assert.match(codeRequestLine({ status: 'pending' }), /확인하고 있어요/)
  assert.match(codeRequestLine({ status: 'unavailable' }), /확인할 수 없어요/)
  assert.match(codeRequestLine({ status: 'ready', files: [] }), /바뀐 파일이 없어요/)
  assert.match(codeRequestLine({ status: 'ready', files: [], partial: true }), /찾지 못했어요/)
  assert.equal(codeRequestLine({ status: 'ready', files: ['a'], candidates: [], analyzing: true, partial: true }),
    '이번 요청에서 바뀐 파일 1개 · 호출 관계를 확인하고 있어요 · 일부는 확인하지 못했어요')
})

test('꺼진 저장소·저장소 아님·알 수 없는 상태는 아무것도 그리지 않는다', () => {
  for (const data of [null, 'x', {}, { enabled: false, state: 'off' }, { enabled: true, state: 'loading' }, { state: 'no-repo' }]) {
    assert.equal(codeSummaryOf(data), null)
  }
  assert.equal(codeSummaryOf({ enabled: true, state: 'engine-missing' }).kind, 'message')
  assert.equal(codeSummaryOf({ enabled: true, state: 'analysis-failed' }).kind, 'message')
  const ready = codeSummaryOf({ enabled: true, state: 'indexing', coverage: {} })
  assert.equal(ready.kind, 'ready')
  assert.equal(ready.indexing, true)
})

test('지도에 한 개도 없는 형식은 칩으로 더하고, 모르면 확인 안 됨, 옛 코드 지도는 그리지 않는다', () => {
  const base = { notIndexed: 0, partial: 0, unusable: 0 }
  const labels = coverage => codeGapsOf(coverage).map(gap => gap.label)
  assert.deepEqual(labels({ ...base, unknownFormats: [{ ext: '.gs', files: 28 }, { ext: '.xyz', files: 2 }] }).slice(3),
    ['형식 모름 .gs 28개', '형식 모름 .xyz 2개'])
  assert.ok(codeGapsOf({ ...base, unknownFormats: [{ ext: '.gs', files: 28 }] }).slice(3).every(gap => gap.tone === 'warn'))
  assert.deepEqual(labels({ ...base, unknownFormats: null }).slice(3), ['형식 모름 확인 안 됨'])
  assert.equal(codeGapsOf(base).length, 3)
  assert.deepEqual(labels({ ...base, unknownFormats: [{ ext: 'a', files: 1 }, { ext: 'b', files: 1 }, { ext: 'c', files: 1 }, { ext: 'd', files: 1 }] }).at(-1),
    '형식 모름 외 1종')
  assert.equal(codeGapsOf({ ...base, unknownFormats: [{ ext: '.gs', files: -1 }] }).length, 3, '깨진 값은 건너뛴다')
})
