import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPlanMarkdown, planSteps, similarity, normalizeStep } from '../src/plan-check.js'

const PLAN = [
  '# 로그인 고치기',
  '',
  '## 단계',
  '',
  '1. **세션 쿠키** 만료 처리 확인',
  '2. 로그인 폼에 오류 문구 추가',
  '- [ ] 테스트 보강',
  '- 배포 전 점검',
  '',
  '```',
  '- 코드 안 목록은 건드리지 않음',
  '```',
].join('\n')

test('정규화는 마크다운 표시와 문장 부호를 뺀다', () => {
  assert.equal(normalizeStep('**세션 쿠키** `만료` 처리!'), '세션 쿠키 만료 처리')
  assert.equal(normalizeStep('[문서](https://x) 보기'), '문서 보기')
})

test('비슷한 문구는 높게, 다른 문구는 낮게 잰다', () => {
  assert.ok(similarity('세션 쿠키 만료 처리 확인', '세션 쿠키 만료 처리를 확인') >= 0.7)
  assert.ok(similarity('테스트 보강', '테스트 보강하기') >= 0.75, '포함 관계')
  assert.ok(similarity('로그인 폼 오류 문구', '배포 전 점검') < 0.3)
  assert.equal(similarity('', '가나다'), 0)
})

test('코드 울타리 안의 목록 줄은 단계로 보지 않는다', () => {
  assert.deepEqual(planSteps(PLAN).map(step => step.text), [
    '**세션 쿠키** 만료 처리 확인', '로그인 폼에 오류 문구 추가', '테스트 보강', '배포 전 점검',
  ])
})

test('짝이 된 단계만 체크 목록으로 바꾸고, 나머지는 그대로 둔다', () => {
  const result = checkPlanMarkdown(PLAN, [
    { content: '세션 쿠키 만료 처리를 확인', status: 'completed' },
    { content: '테스트 보강하기', status: 'in_progress' },
    { content: '전혀 상관없는 일', status: 'completed' },
  ])
  const lines = result.markdown.split('\n')
  assert.equal(lines[4], '1. [x] **세션 쿠키** 만료 처리 확인')
  assert.equal(lines[5], '2. 로그인 폼에 오류 문구 추가')
  assert.equal(lines[6], '- [ ] 테스트 보강')
  assert.equal(lines[7], '- 배포 전 점검')
  assert.equal(lines[10], '- 코드 안 목록은 건드리지 않음')
  assert.equal(result.matched, 2)
  assert.equal(result.done, 1)
})

test('할 일 하나는 가장 비슷한 단계 하나에만 붙는다', () => {
  const result = checkPlanMarkdown('- 테스트 보강\n- 테스트 보강 다시', [{ content: '테스트 보강', status: 'completed' }])
  assert.equal(result.markdown, '- [x] 테스트 보강\n- 테스트 보강 다시')
  assert.equal(result.matched, 1)
})

test('짝이 없으면 원문을 그대로 돌려준다', () => {
  const result = checkPlanMarkdown(PLAN, [])
  assert.equal(result.markdown, PLAN)
  assert.equal(result.matched, 0)
})
