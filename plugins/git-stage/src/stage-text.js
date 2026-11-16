// 작업 단계 스냅샷 → 화면 글자(한국어, 해요체). 비개발자가 읽는 말로 쓴다.

export const STAGE_TEXT = {
  branch: { title: '작업실', step: '작업실 만들기', plain: '원본(main)은 그대로 두고, 이번 일만 담는 작업선(브랜치)을 따로 열어요.' },
  commit: { title: '저장', step: '고치고 저장', plain: '"여기까지 저장" 도장(커밋)이에요. 아직 GitHub에 올라간 것은 아니에요.' },
  verify: { title: '검증', step: '검증', plain: '테스트를 돌리거나 화면을 직접 확인해요. 확인하지 못했으면 됐다고 말하지 않아요.' },
  share: { title: '공유', step: '공유(푸시·PR)', plain: 'GitHub에 올리고(푸시) "합쳐도 될까요?" 검토 요청(PR)을 열어요.' },
  merge: { title: '합치기', step: '합치기(머지)', plain: '검토가 끝난 변경을 원본에 반영해요.' },
  deploy: { title: '배포', step: '배포', plain: '실제 서비스에 내보내요. 합치기와는 따로 승인받아요.' },
}

export const STATUS_TEXT = { done: '끝남', current: '지금', todo: '남음', unknown: '기록 없음' }

const count = (n, unit) => `${n}${unit}`

// 단계마다 지금 상태를 사실 문장 몇 개로.
export function factsOf(stage) {
  const i = stage.info
  switch (stage.key) {
    case 'branch':
      if (i.detached) return ['브랜치 없이 특정 커밋에 서 있어요.']
      if (i.isBase) return [`지금 원본 브랜치(${i.branch})에 있어요.`]
      return [`작업 브랜치: ${i.branch}`, ...(i.nameOk ? [] : ['이름이 "도구/종류/목적" 형식과 달라요.'])]
    case 'commit':
      if (i.changes > 0) return [`저장 안 된 변경 ${count(i.changes, '개')}`, `원본보다 앞선 저장 ${count(i.ahead, '개')}`]
      return i.ahead > 0 ? [`저장 ${count(i.ahead, '개')} · 저장 안 된 변경 없음`] : ['아직 바뀐 파일이 없어요.']
    case 'verify':
      if (i.by === 'todo') return [`마친 할 일: ${i.item}`]
      if (i.by === 'run') return ['마지막 저장 뒤에 테스트·빌드가 통과했어요.']
      return ['아직 검증 기록이 없어요.']
    case 'share': {
      const lines = []
      if (!i.upstream) lines.push('아직 GitHub에 올리지 않았어요.')
      else lines.push(i.unpushed > 0 ? `올리지 않은 저장 ${count(i.unpushed, '개')}` : 'GitHub에 모두 올렸어요.')
      if (i.pr) lines.push(`검토 요청 #${i.pr.number}${i.pr.draft ? ' (초안)' : ''}${i.pr.state === 'CLOSED' ? ' · 닫힘' : ''}`)
      else if (i.prError === 'auth') lines.push('GitHub 로그인이 만료돼 검토 요청을 확인하지 못했어요.')
      else if (i.prError === 'no-gh') lines.push('gh 명령이 없어 검토 요청을 확인하지 못했어요.')
      else if (i.prError) lines.push('검토 요청을 확인하지 못했어요.')
      else if (i.upstream) lines.push('검토 요청(PR)은 아직 없어요.')
      return lines
    }
    case 'merge':
      if (i.by === 'pr') return [`검토 요청 #${i.pr.number} · 원본(${i.base})에 합쳐졌어요.`]
      if (i.by === 'local') return [`이 브랜치의 저장이 원본(${i.base})에 들어 있어요.`]
      return [`아직 원본(${i.base})에 합치지 않았어요.`]
    case 'deploy':
      return i.tag ? [`완성본 표시(태그) ${i.tag}에 들어 있어요.`] : ['아직 완성본 표시(태그)가 없어요.']
    default:
      return []
  }
}

// 에이전트가 일하는 동안 사람이 할 일이 없는 단계: 기다리면 된다고 먼저 말한다.
const WHILE_RUNNING = {
  branch: '에이전트가 일하는 중이에요. 기다렸다가, 끝나면 작업 브랜치가 생겼는지 봐요.',
  commit: '에이전트가 고치는 중이에요. 기다렸다가, 끝나면 저장(커밋)을 요청해요.',
  verify: '에이전트가 일하는 중이에요. 기다렸다가, 끝나면 테스트·빌드를 요청해요.',
}

// 지금 단계에서 다음에 할 일. 승인이 필요한 일은 "승인"을 앞에 밝힌다.
export function nextOf(stage, { running = false } = {}) {
  if (stage.status !== 'current') return null
  const i = stage.info
  if (stage.blocked === 'gh-auth') return '먼저 GitHub 로그인을 다시 해야 해요. 터미널에서 gh auth login을 실행해요.'
  if (running && WHILE_RUNNING[stage.key]) return WHILE_RUNNING[stage.key]
  switch (stage.key) {
    case 'branch': return '새 작업 브랜치를 만들어 달라고 하면 돼요.'
    case 'commit': return i.changes > 0 ? '바뀐 내용을 목적 하나씩 커밋으로 저장해요.' : '고칠 것을 말하면, 고친 뒤 커밋으로 저장해요.'
    case 'verify': return '테스트를 돌리거나 화면을 확인해 달라고 해요.'
    case 'share': return i.upstream && i.unpushed === 0 ? '승인하면 검토 요청(PR)을 열어요.' : '승인하면 GitHub에 올리고(푸시) 검토 요청을 열어요.'
    case 'merge': return '검토가 끝났으면 승인하고 합쳐요(머지).'
    case 'deploy': return '배포는 합치기와 따로 승인해요. 승인하면 태그를 달거나 배포해요.'
    default: return null
  }
}

export function summaryOf(snapshot) {
  if (snapshot.kind === 'loading') return '작업 단계를 읽는 중이에요.'
  if (snapshot.kind === 'no-repo') return 'Git 저장소가 아니에요.'
  if (snapshot.current === null) return `모든 단계 끝 · ${snapshot.done}/${snapshot.total}`
  const stage = snapshot.stages[snapshot.current]
  return `${STAGE_TEXT[stage.key].title} 단계 · ${snapshot.done}/${snapshot.total}${stage.approval ? ' · 승인 필요' : ''}`
}

export const KIND_TEXT = { new: '새 파일', modified: '고침', deleted: '지움', renamed: '이름 바꿈', conflict: '충돌' }

/**
 * 공유·합치기를 승인하기 전에 볼 "이번에 올라가는 것"과 "올라가지 않는 것". 끝난 단계나 올라갈 저장이 없으면 null.
 * @returns {{ title: string, summary: string, commits: string[], more: string|null, files: string|null, left: string|null, pending: string[] } | null}
 */
export function outgoingOf(stage) {
  if ((stage.key !== 'share' && stage.key !== 'merge') || stage.status === 'done') return null
  const out = stage.info.outgoing
  if (!out || out.total === 0) return null
  const hidden = out.total - out.commits.length
  return {
    title: stage.key === 'share' ? '이번에 GitHub에 올라가는 것' : `원본(${stage.info.base})에 합쳐지는 것`,
    summary: [`저장 ${out.total}개`, ...(out.files ? [`파일 ${out.files.changed}개`, `${out.files.added}줄 더함`, `${out.files.removed}줄 뺌`] : [])].join(' · '),
    commits: out.commits.map(c => c.subject),
    more: hidden > 0 ? `외 저장 ${hidden}개` : null,
    files: out.files ? `파일 ${out.files.changed}개 · ${out.files.added}줄 더함 · ${out.files.removed}줄 뺌` : null,
    left: out.changes > 0 ? `저장 안 된 변경 ${out.changes}개는 올라가지 않아요.` : null,
    pending: out.pending.map(p => `${KIND_TEXT[p.kind] ?? '바뀜'} · ${p.path}`),
  }
}

/** 묶음 폴더에서 왜 이 저장소를 보여 주는지 한 줄. 사람이 고른 경우는 설명하지 않는다. */
export function whyOf(within) {
  if (!within || within.reason === 'picked') return null
  if (within.reason === 'session') return '이 세션이 명령을 돌린 저장소예요.'
  return '이 세션의 명령에서 저장소를 찾지 못해, 가장 최근에 Git 활동이 있던 저장소를 보여 줘요.'
}

/**
 * 지금 단계에서 에이전트에게 보낼 만한 요청 한 문장. 단추가 입력창에 넣기만 하고, 보내기는 사람이 누른다.
 * 끝난 단계, 로그인부터 해야 하는 경우, 아직 저장할 것이 없는 경우는 null.
 * @param {string|null} [repo] 묶음 폴더 안 저장소 이름. 주면 어느 저장소의 일인지 문장 앞에 밝힌다.
 */
export function askOf(stage, repo = null) {
  const ask = askTextOf(stage)
  return ask !== null && repo ? `${repo} 저장소에서 ${ask}` : ask
}

function askTextOf(stage) {
  if (stage.status !== 'current' || stage.blocked) return null
  const i = stage.info
  switch (stage.key) {
    case 'branch': return '이번 일을 위한 새 작업 브랜치를 만들어 주세요.'
    case 'commit': return i.changes > 0 ? '바뀐 내용을 목적별로 나눠 커밋해 주세요. 커밋 전에 무엇을 저장하는지 알려 주세요.' : null
    case 'verify': return '테스트와 빌드를 돌리고 결과를 알려 주세요.'
    case 'share': return '푸시하고 검토 요청(PR)을 초안으로 열어 주세요.'
    // 올렸지만 검토 요청이 없거나 닫혔으면 먼저 연다.
    case 'merge': return i.pr && i.pr.state === 'OPEN' ? '검토 요청(PR)을 스쿼시 머지해 주세요.' : '검토 요청(PR)을 초안으로 열어 주세요.'
    case 'deploy': return '배포 전에 이번 배포에 포함되는 것과 포함하지 않는 것을 알려 주세요.'
    default: return null
  }
}

/** 바닥 줄의 읽은 시각. 아직 못 읽었으면 그렇게 말한다. */
export function readAtOf(at) {
  if (!at) return '아직 읽지 않았어요'
  const time = new Date(at)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(time.getHours())}:${pad(time.getMinutes())}에 읽음`
}
