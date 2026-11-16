import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stagesOf, STAGE_KEYS } from '../src/stages.js'
import { askOf, factsOf, nextOf, outgoingOf, readAtOf, summaryOf } from '../src/stage-text.js'

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
  // 원본이 GitHub와 같고 지난 검증 할 일이 끝났어도 뒤 단계를 끝남으로 칠하지 않는다.
  const synced = at({ branch: 'main', isBase: true, upstream: 'origin/main' }, { todos: [{ content: 'npm test로 검증하기', status: 'completed' }] })
  assert.deepEqual(statuses(synced), ['current', 'todo', 'todo', 'todo', 'todo', 'todo'])
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

test('공유·합치기 전에는 올라가는 저장 기록·파일 수와 올라가지 않는 변경을 보여 준다', () => {
  const facts = {
    ahead: 3, changes: 2, commits: [{ id: 'a1', subject: '로그인 버튼 키우기' }, { id: 'a2', subject: '오류 문구 고치기' }],
    files: { changed: 4, added: 30, removed: 5 }, pending: [{ path: 'notes.md', kind: 'new' }, { path: 'a.js', kind: 'modified' }],
  }
  const snap = at(facts, { todos: [{ content: 'npm test', status: 'completed' }] })
  const share = outgoingOf(snap.stages[3])
  assert.deepEqual(share, {
    title: '이번에 GitHub에 올라가는 것', summary: '저장 3개 · 파일 4개 · 30줄 더함 · 5줄 뺌', commits: ['로그인 버튼 키우기', '오류 문구 고치기'], more: '외 저장 1개',
    files: '파일 4개 · 30줄 더함 · 5줄 뺌', left: '저장 안 된 변경 2개는 올라가지 않아요.', pending: ['새 파일 · notes.md', '고침 · a.js'],
  })
  assert.equal(outgoingOf(snap.stages[4]).title, '원본(main)에 합쳐지는 것')
  assert.equal(outgoingOf(snap.stages[1]), null)
  // 올라갈 저장이 없거나 끝난 단계는 목록이 없다.
  assert.equal(outgoingOf(at({ ahead: 0 }).stages[3]), null)
  assert.equal(outgoingOf(at({ ahead: 1, upstream: 'origin/x', pr: { number: 1, state: 'MERGED', draft: false, url: null, mergeCommit: 'm' } }).stages[3]), null)
})

test('다음 요청 문장은 지금 단계에만 있고, 로그인이 막히면 없다', () => {
  const current = snap => snap.stages[snap.current]
  assert.equal(askOf(current(at({ branch: 'main', isBase: true }))), '이번 일을 위한 새 작업 브랜치를 만들어 주세요.')
  assert.match(askOf(current(at({ changes: 2 }))), /목적별로 나눠 커밋/)
  assert.equal(askOf(current(at({ ahead: 1 }))), '테스트와 빌드를 돌리고, 실패하면 원인과 고칠 방법을 알려 주세요.')
  const verified = { todos: [{ content: 'npm test', status: 'completed' }] }
  assert.equal(askOf(current(at({ ahead: 1 }, verified))), '테스트와 빌드를 돌리고, 통과하면 푸시해서 검토 요청(PR)을 초안으로 열어 주세요. PR 본문에는 바뀌는 것·확인한 것·확인하지 못한 것을 적어 주세요.')
  // 올렸지만 검토 요청이 없으면 합치기 단계에서 먼저 연다.
  assert.equal(askOf(current(at({ ahead: 1, upstream: 'origin/x', unpushed: 0 }, verified))), '검토 요청(PR)을 초안으로 열어 주세요. PR 본문에는 바뀌는 것·확인한 것·확인하지 못한 것을 적어 주세요.')
  const open = { number: 2, state: 'OPEN', draft: false, url: null, mergeCommit: null }
  assert.equal(askOf(current(at({ ahead: 1, upstream: 'origin/x', unpushed: 0, pr: open }, verified))), 'PR 검사가 모두 통과했는지 확인하고, 통과했으면 스쿼시 머지해 주세요.')
  const merged = { ...open, state: 'MERGED', mergeCommit: 'm' }
  assert.match(askOf(current(at({ ahead: 1, upstream: 'origin/x', unpushed: 0, pr: merged }, verified))), /포함되는 것과 포함하지 않는 것/)
  const blocked = at({ ahead: 1, prError: 'auth' }, verified)
  assert.equal(askOf(current(blocked)), null)
  const snap = at({ ahead: 1 })
  assert.equal(snap.stages.filter(s => askOf(s) !== null).length, 1)
  // 묶음 폴더에서는 저장소 이름을 앞에 밝힌다.
  assert.equal(askOf(current(snap), 'app'), 'app 저장소에서 테스트와 빌드를 돌리고, 실패하면 원인과 고칠 방법을 알려 주세요.')
  assert.equal(askOf(snap.stages[0], 'app'), null)
})

test('저장 단계 사실은 0을 늘어놓지 않고, 고칠 것이 없을 때 다음 할 일을 말한다', () => {
  const empty = at({})
  assert.deepEqual(factsOf(empty.stages[1]), ['아직 바뀐 파일이 없어요.'])
  assert.equal(nextOf(empty.stages[1]), '고칠 것을 말하면, 고친 뒤 커밋으로 저장해요.')
  assert.deepEqual(factsOf(at({ ahead: 2, hadCommits: true }).stages[1]), ['저장 2개 · 저장 안 된 변경 없음'])
  assert.deepEqual(factsOf(at({ changes: 3 }).stages[1]), ['저장 안 된 변경 3개'])
})

test('에이전트가 일하는 중이면 작업실·저장·검증 단계의 다음 할 일은 기다리기다', () => {
  assert.match(nextOf(at({ changes: 3 }).stages[1], { running: true }), /^에이전트가 고치는 중이에요\. 기다렸다가/)
  const share = at({ ahead: 1, hadCommits: true }, { todos: [{ content: 'npm test', status: 'completed' }] })
  assert.match(nextOf(share.stages[3], { running: true }), /^승인하면/, '승인 차례 단계는 그대로 말한다')
})

test('읽은 시각은 시:분으로, 아직 못 읽었으면 그렇게 쓴다', () => {
  assert.equal(readAtOf(0), '아직 읽지 않았어요')
  assert.equal(readAtOf(new Date(2026, 10, 16, 9, 5).getTime()), '09:05에 읽음')
})

test('세션이 실제로 돌린 시험 기록이 있으면 그것으로 검증을 보고, 그 뒤에 고쳤으면 다시 돌리라고 한다', () => {
  const at9 = new Date(2026, 10, 16, 14, 2).getTime()
  const fresh = at({ ahead: 1, hadCommits: true, verify: { at: at9, command: 'npm test', editedAfter: false } })
  assert.equal(fresh.stages[2].status, 'done')
  assert.deepEqual(factsOf(fresh.stages[2]), ['14:02 npm test 통과', '그 뒤로 고친 파일 없음'])
  const stale = at({ ahead: 1, hadCommits: true, verify: { at: at9, command: 'npm test', editedAfter: true } }, { todos: [{ content: 'npm test', status: 'completed' }] })
  assert.equal(stale.stages[2].status, 'current', '할 일이 끝났다고 해도 실제 기록이 우선')
  assert.match(nextOf(stale.stages[2]), /다시 돌려/)
})

test('열린 PR의 검사가 실패하면 합치기 단계가 막히고, 검사·검토 상태를 한 줄로 보여 준다', () => {
  const pr = { number: 7, state: 'OPEN', draft: false, url: null, mergeCommit: null, review: 'required', checks: { passing: 3, failing: 1, pending: 0, failed: ['lint'] } }
  const snap = at({ ahead: 1, hadCommits: true, upstream: 'origin/claude/feat/x', pr }, { todos: [{ content: 'npm test', status: 'completed' }] })
  const merge = snap.stages[4]
  assert.equal(merge.status, 'current')
  assert.equal(merge.blocked, 'checks')
  assert.deepEqual(factsOf(merge).slice(1), ['검사 3개 통과 · 1개 실패 · 검토 기다림', '실패한 검사: lint'])
  assert.match(nextOf(merge), /실패한 검사를 고쳐야/)
  assert.match(askOf(merge), /^PR 검사 가운데 실패한 것/)
  const green = at({ ahead: 1, hadCommits: true, upstream: 'origin/claude/feat/x', pr: { ...pr, checks: { passing: 3, failing: 0, pending: 0, failed: [] } } }, { todos: [{ content: 'npm test', status: 'completed' }] })
  assert.equal(green.stages[4].blocked, null)
})

test('배포 단계는 프로젝트 배포 방식에 맞춰 말하고, 태그가 아닌 배포는 기록을 확인하지 못한다고 밝힌다', () => {
  const merged = { ahead: 1, hadCommits: true, upstream: 'origin/x', unpushed: 0, pr: { number: 3, state: 'MERGED', draft: false, url: null, mergeCommit: 'm' } }
  const deployOf = kind => at({ ...merged, deploy: kind }).stages[5]
  assert.deepEqual(factsOf(deployOf('wrangler')), ['배포 방식: Wrangler(Cloudflare Worker)', '아직 완성본 표시(태그)가 없어요.', '배포 기록은 여기서 확인하지 못해요.'])
  assert.match(askOf(deployOf('wrangler')), /Worker 코드가 바뀌는지/)
  assert.match(nextOf(deployOf('script')), /npm run deploy/)
  assert.deepEqual(factsOf(deployOf(undefined)), ['아직 완성본 표시(태그)가 없어요.'])
  assert.match(askOf(deployOf('tag')), /^배포 전에 이번 배포에 포함되는 것과/)
})
