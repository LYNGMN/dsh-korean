// Git 사실 + 할 일 → 작업 단계 6개. 화면·Node 어디서나 도는 순수 함수다.
// 휴대폰 앱(plugins/handheld/web/src/lib/stages.js)이 같은 파일을 복사해 쓴다. 키트 test/git-stage-copies.test.mjs가 둘이 같은지 본다.

export const STAGE_KEYS = ['branch', 'commit', 'verify', 'share', 'merge', 'deploy']

// 승인을 받아야 넘어가는 단계(푸시·머지·태그).
const APPROVAL = new Set(['share', 'merge', 'deploy'])
const BRANCH_NAME = /^[a-z0-9]+\/(feat|fix|docs|chore)\/[\w.-]+$/
const VERIFY_WORDS = /검증|테스트|시험|검수|test|verif|\bqa\b/i

function asTodos(todos) {
  return Array.isArray(todos) ? todos.filter(t => t && typeof t.content === 'string') : []
}

export function doingOf(todos) {
  return asTodos(todos).find(t => t.status === 'in_progress')?.content ?? null
}

// 검증 기록: 할 일에서 검증 낱말이 든 완료 항목, 또는 마지막 커밋 뒤에 성공한 시험 실행.
export function verifyOf(todos, verifiedAt, headTime) {
  const item = asTodos(todos).find(t => t.status === 'completed' && VERIFY_WORDS.test(t.content))
  if (item) return { by: 'todo', item: item.content }
  if (typeof verifiedAt === 'number' && (typeof headTime !== 'number' || verifiedAt >= headTime)) return { by: 'run', item: null }
  return { by: null, item: null }
}

/**
 * @param {object|null} facts git-read가 만든 사실. null이면 아직 모름.
 * @param {{ todos?: Array<{content: string, status: string}>|null, verifiedAt?: number|null }} [extra]
 */
export function stagesOf(facts, extra = {}) {
  const doing = doingOf(extra.todos)
  if (facts === null || facts === undefined) return { kind: 'loading', stages: [], current: null, done: 0, total: STAGE_KEYS.length, doing }
  if (facts.repo !== true) return { kind: 'no-repo', stages: [], current: null, done: 0, total: STAGE_KEYS.length, doing }

  const pr = facts.pr ?? null
  const prMerged = pr?.state === 'MERGED'
  const merged = prMerged || (facts.ahead === 0 && facts.hadCommits === true && !facts.isBase)
  const pushed = typeof facts.upstream === 'string' && facts.unpushed === 0
  const verify = verifyOf(extra.todos, extra.verifiedAt, facts.headTime)

  const info = {
    branch: { branch: facts.branch, base: facts.base, isBase: facts.isBase, detached: facts.branch === null, nameOk: typeof facts.branch === 'string' && BRANCH_NAME.test(facts.branch) },
    commit: { changes: facts.changes, ahead: facts.ahead },
    verify,
    share: { pushed, upstream: facts.upstream, unpushed: facts.unpushed, pr, prError: facts.prError ?? null },
    merge: { merged, by: prMerged ? 'pr' : merged ? 'local' : null, pr, base: facts.base },
    deploy: { tag: facts.tag ?? null },
  }
  const reached = {
    branch: facts.branch !== null && !facts.isBase,
    commit: (facts.changes === 0 && facts.ahead > 0) || merged,
    verify: verify.by !== null,
    share: pushed || merged || (pr !== null && pr.state !== 'CLOSED'),
    merge: merged,
    deploy: typeof facts.tag === 'string',
  }
  // 저장 단계는 미커밋이 남아 있으면 앞 단계가 다 끝나도 다시 "지금"이 된다.
  if (facts.changes > 0 && !facts.isBase) reached.commit = false

  const lastReached = STAGE_KEYS.reduce((last, key, i) => (reached[key] ? i : last), -1)
  let current = null
  const stages = STAGE_KEYS.map((key, i) => {
    let status
    if (reached[key]) status = 'done'
    else if (key === 'verify' && i < lastReached && facts.changes === 0) status = 'unknown'
    else if (current === null) { status = 'current'; current = i }
    else status = 'todo'
    const approval = status === 'current' && APPROVAL.has(key)
    const blocked = status === 'current' && (key === 'share' || key === 'merge') && facts.prError === 'auth' ? 'gh-auth' : null
    return { key, status, approval, blocked, info: info[key] }
  })
  const done = stages.filter(s => s.status === 'done').length
  return { kind: 'ok', stages, current, done, total: STAGE_KEYS.length, doing }
}
