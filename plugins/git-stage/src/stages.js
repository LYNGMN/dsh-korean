// Git 사실 + 할 일 → 작업 단계 6개. 화면·Node 어디서나 도는 순수 함수다.
// 휴대폰 앱이 화면(web/src/lib/stages.js)과 알림 서버(server/gateway/stages.js)에 복사해 쓴다. 고친 뒤 루트에서 npm run sync를 돌린다.

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

// 검증 기록. 세션이 실제로 돌린 시험 기록(run: git-read의 verify)이 있으면 그것만 본다:
// 통과한 뒤 에이전트가 파일을 고치지 않았으면 끝남, 고쳤으면 다시 돌려야 한다.
// 기록이 없으면 할 일에서 검증 낱말이 든 완료 항목, 또는 마지막 커밋 뒤에 성공한 시험 시각(verifiedAt)으로 본다.
export function verifyOf(todos, verifiedAt, headTime, run = null) {
  if (run && typeof run.at === 'number') return { by: run.editedAfter ? null : 'run', item: null, run }
  const item = asTodos(todos).find(t => t.status === 'completed' && VERIFY_WORDS.test(t.content))
  if (item) return { by: 'todo', item: item.content, run: null }
  if (typeof verifiedAt === 'number' && (typeof headTime !== 'number' || verifiedAt >= headTime)) return { by: 'run', item: null, run: null }
  return { by: null, item: null, run: null }
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
  const verify = verifyOf(extra.todos, extra.verifiedAt, facts.headTime, facts.verify ?? null)
  // 승인 전에 보여 줄 "이번에 올라가는 것"(원본에 없는 저장 기록·바뀐 파일)과 "올라가지 않는 것"(저장 안 된 변경).
  const outgoing = {
    commits: Array.isArray(facts.commits) ? facts.commits : [],
    total: facts.ahead ?? 0,
    files: facts.files ?? null,
    pending: Array.isArray(facts.pending) ? facts.pending : [],
    changes: facts.changes ?? 0,
  }

  const info = {
    branch: { branch: facts.branch, base: facts.base, isBase: facts.isBase, detached: facts.branch === null, nameOk: typeof facts.branch === 'string' && BRANCH_NAME.test(facts.branch) },
    commit: { changes: facts.changes, ahead: facts.ahead },
    verify,
    share: { pushed, upstream: facts.upstream, unpushed: facts.unpushed, pr, prError: facts.prError ?? null, outgoing },
    merge: { merged, by: prMerged ? 'pr' : merged ? 'local' : null, pr, base: facts.base, outgoing },
    deploy: { tag: facts.tag ?? null, kind: facts.deploy ?? 'tag' },
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
  // 원본 브랜치에 있으면 이번 일의 작업실이 아직 없다. 원본이 GitHub와 같거나 지난 할 일이 끝났어도 뒤 단계는 시작 전이다.
  if (facts.isBase) for (const key of STAGE_KEYS) reached[key] = false

  const lastReached = STAGE_KEYS.reduce((last, key, i) => (reached[key] ? i : last), -1)
  let current = null
  const stages = STAGE_KEYS.map((key, i) => {
    let status
    if (reached[key]) status = 'done'
    else if (key === 'verify' && i < lastReached && facts.changes === 0) status = 'unknown'
    else if (current === null) { status = 'current'; current = i }
    else status = 'todo'
    const approval = status === 'current' && APPROVAL.has(key)
    // 막힘: GitHub 로그인 만료(공유·합치기), PR 검사 실패(합치기).
    const blocked = status !== 'current' ? null
      : (key === 'share' || key === 'merge') && facts.prError === 'auth' ? 'gh-auth'
        : key === 'merge' && pr?.state === 'OPEN' && pr.checks?.failing > 0 ? 'checks' : null
    return { key, status, approval, blocked, info: info[key] }
  })
  const done = stages.filter(s => s.status === 'done').length
  return { kind: 'ok', stages, current, done, total: STAGE_KEYS.length, doing }
}
