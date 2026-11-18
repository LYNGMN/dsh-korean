import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codeGapsOf, codeRequestLine, codeRouteOf, codeSummaryOf } from '../src/code-summary.js'

test('라우트는 세션 id만 싣는다', () => {
  assert.equal(codeRouteOf('a b'), 'api/dsh-code-map?sessionId=a%20b')
})

test('읽지 못한 범위는 0이어도 만들고, 모르는 값은 확인 안 됨으로 쓴다', () => {
  assert.deepEqual(codeGapsOf({ notIndexed: 0, partial: 3, unusable: undefined }).map(({ label, warn }) => [label, warn]), [
    ['미인덱스 0개', false], ['부분 파싱 3개', true], ['파싱 불가 확인 안 됨', true],
  ])
  assert.equal(codeGapsOf(undefined), null)
  assert.equal(codeGapsOf({ notIndexed: -1 })[0].label, '미인덱스 확인 안 됨')
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
