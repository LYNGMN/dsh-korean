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
      return [
        i.changes > 0 ? `저장 안 된 변경 ${count(i.changes, '개')}` : '저장 안 된 변경 없음',
        `원본보다 앞선 저장 ${count(i.ahead, '개')}`,
      ]
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

// 지금 단계에서 다음에 할 일. 승인이 필요한 일은 "승인"을 앞에 밝힌다.
export function nextOf(stage) {
  if (stage.status !== 'current') return null
  const i = stage.info
  if (stage.blocked === 'gh-auth') return '먼저 GitHub 로그인을 다시 해야 해요. 터미널에서 gh auth login을 실행해요.'
  switch (stage.key) {
    case 'branch': return '새 작업 브랜치를 만들어 달라고 하면 돼요.'
    case 'commit': return i.changes > 0 ? '바뀐 내용을 목적 하나씩 커밋으로 저장해요.' : '고칠 것을 고친 뒤 커밋으로 저장해요.'
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
