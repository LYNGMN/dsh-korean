import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stagesOf, STAGE_KEYS } from '../src/stages.js'
import { factsOf, nextOf, summaryOf } from '../src/stage-text.js'

const base = {
  repo: true, folder: 'app', branch: 'claude/feat/x', base: 'main', isBase: false,
  changes: 0, ahead: 0, upstream: null, unpushed: 0, hadCommits: false, headTime: 1000, pr: null, prError: null, tag: null,
}
const at = (overrides, extra) => stagesOf({ ...base, ...overrides }, extra)
const statuses = snap => snap.stages.map(s => s.status)

test('아직 모름·저장소 아님은 단계 없이 알린다', () => {
  assert.equal(stagesOf(null).kind, 'loading')
  assert.equal(stagesOf({ repo: false }).kind, 'no-repo')
  assert.equal(summaryOf(stagesOf({ repo: false })), 'Git 저장소가 아니에요.')
})

test('원본 브랜치에 있으면 작업실 단계가 지금이다', () => {
  const snap = at({ branch: 'main', isBase: true })
  assert.deepEqual(statuses(snap), ['current', 'todo', 'todo', 'todo', 'todo', 'todo'])
  assert.equal(snap.current, 0)
  assert.match(factsOf(snap.stages[0])[0], /원본 브랜치\(main\)/)
})

test('새 브랜치에 아직 저장이 없으면 저장 단계가 지금이다', () => {
  const snap = at({ changes: 3 })
  assert.deepEqual(statuses(snap), ['done', 'current', 'todo', 'todo', 'todo', 'todo'])
  assert.equal(nextOf(snap.stages[1]), '바뀐 내용을 목적 하나씩 커밋으로 저장해요.')
})

test('이름 형식이 다르면 작업실 사실에 주의를 붙인다', () => {
  const snap = at({ branch: 'feature/x' })
  assert.match(factsOf(snap.stages[0]).join(' '), /형식과 달라요/)
  assert.equal(at({}).stages[0].info.nameOk, true)
})

test('저장했으면 검증, 검증 낱말 할 일이 끝나면 공유가 지금이고 승인 필요다', () => {
  assert.equal(at({ ahead: 2 }).current, 2)
  const todos = [{ content: 'npm test 돌리기', status: 'completed' }, { content: 'PR 열기', status: 'in_progress' }]
  const snap = at({ ahead: 2 }, { todos })
  assert.deepEqual(statuses(snap), ['done', 'done', 'done', 'current', 'todo', 'todo'])
  assert.equal(snap.stages[3].approval, true)
  assert.equal(snap.doing, 'PR 열기')
  assert.equal(summaryOf(snap), '공유 단계 · 3/6 · 승인 필요')
})

test('"확인"만 든 할 일은 검증으로 치지 않는다', () => {
  const snap = at({ ahead: 1 }, { todos: [{ content: '구조 확인', status: 'completed' }] })
  assert.equal(snap.stages[2].status, 'current')
})

test('마지막 저장 뒤 시험 실행 성공도 검증으로 친다', () => {
  assert.equal(at({ ahead: 1, headTime: 1000 }, { verifiedAt: 2000 }).stages[2].status, 'done')
  assert.equal(at({ ahead: 1, headTime: 3000 }, { verifiedAt: 2000 }).stages[2].status, 'current')
})

test('푸시했지만 검증 기록이 없으면 검증은 "기록 없음"이고 합치기로 넘어간다', () => {
  const snap = at({ ahead: 2, upstream: 'origin/claude/feat/x', pr: { number: 7, state: 'OPEN', draft: true, url: null, mergeCommit: null } })
  assert.deepEqual(statuses(snap), ['done', 'done', 'unknown', 'done', 'current', 'todo'])
  assert.equal(snap.stages[4].approval, true)
  assert.match(factsOf(snap.stages[3]).join(' '), /#7 \(초안\)/)
})

test('올리지 않은 저장이 남으면 공유가 지금이다', () => {
  const snap = at({ ahead: 3, upstream: 'origin/claude/feat/x', unpushed: 1 }, { verifiedAt: 5000 })
  assert.equal(snap.current, 3)
  assert.match(factsOf(snap.stages[3])[0], /올리지 않은 저장 1개/)
})

test('PR이 합쳐졌으면 저장·공유·합치기가 끝나고 배포가 지금이다', () => {
  const pr = { number: 9, state: 'MERGED', draft: false, url: null, mergeCommit: 'abc' }
  const snap = at({ ahead: 2, upstream: 'origin/claude/feat/x', pr }, { verifiedAt: 5000 })
  assert.deepEqual(statuses(snap), ['done', 'done', 'done', 'done', 'done', 'current'])
  assert.equal(snap.stages[5].approval, true)
  assert.equal(at({ ahead: 2, upstream: 'o', pr, tag: 'v1.2.0' }, { verifiedAt: 5000 }).current, null)
})

test('PR 없이 로컬에서 합쳐진 브랜치(앞선 저장 0, 저장 기록 있음)도 합치기 끝으로 본다', () => {
  const snap = at({ ahead: 0, hadCommits: true, upstream: 'origin/claude/feat/x' })
  assert.equal(snap.stages[4].status, 'done')
  assert.equal(snap.stages[4].info.by, 'local')
})

test('미커밋이 남으면 앞 단계가 끝나도 저장이 다시 지금이다', () => {
  const snap = at({ ahead: 2, changes: 1, upstream: 'origin/claude/feat/x' })
  assert.equal(snap.current, 1)
})

test('GitHub 로그인이 만료되면 공유 단계에 막힘을 붙이고 다음 할 일로 로그인을 안내한다', () => {
  const snap = at({ ahead: 1, prError: 'auth' }, { verifiedAt: 5000 })
  assert.equal(snap.stages[3].blocked, 'gh-auth')
  assert.match(nextOf(snap.stages[3]), /gh auth login/)
  assert.match(factsOf(snap.stages[3]).join(' '), /로그인이 만료/)
})

test('단계 이름은 여섯 개이고 지금 단계만 다음 할 일이 있다', () => {
  assert.deepEqual(STAGE_KEYS, ['branch', 'commit', 'verify', 'share', 'merge', 'deploy'])
  const snap = at({ ahead: 1 })
  assert.equal(snap.stages.filter(s => nextOf(s) !== null).length, 1)
})
