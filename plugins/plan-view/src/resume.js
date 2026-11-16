// 남은 할 일이 있는데 세션이 멈췄을 때 "이어서 진행" 단추를 보일지, 무엇을 보낼지 정한다.
// 화면·DSH 호출은 없다. 보내기는 사람이 단추를 누를 때만 화면 쪽이 부른다.

// 보낼 문장에 이름을 적는 남은 할 일 개수. 더 많으면 "외 N개"로 줄인다.
export const RESUME_LIST_MAX = 5

export function remainingTodos(list) {
  return (list?.items ?? []).filter(item => item.status !== 'completed')
}

// 단추를 보일 때만 { remaining, reason }을 돌려준다. reason은 'error'(오류로 멈춤) 또는 'stopped'.
// 세션이 돌고 있거나, 보내는 중이거나(입력 phase가 plain이 아님, 받아들여지길 기다리는 메시지가 있음),
// 하위 에이전트 세션이거나, 입력 동작을 받지 못했으면 숨긴다.
export function resumeStateOf({ list, running, phase, pending, subagent, lastError, canSend }) {
  if (!canSend || running || subagent) return null
  if (phase !== undefined && phase !== 'plain') return null
  if (pending > 0) return null
  const remaining = remainingTodos(list)
  if (remaining.length === 0) return null
  return { remaining, reason: typeof lastError === 'string' && lastError.trim() !== '' ? 'error' : 'stopped' }
}

// 에이전트에게 보낼 요청. 멈춘 자리를 알 수 있게 진행 중이던 항목을 먼저, 남은 항목 이름을 함께 적는다.
export function resumePromptOf(remaining) {
  const ordered = [
    ...remaining.filter(item => item.status === 'in_progress'),
    ...remaining.filter(item => item.status !== 'in_progress'),
  ]
  const shown = ordered.slice(0, RESUME_LIST_MAX)
  const lines = shown.map(item => `- ${item.content}${item.status === 'in_progress' ? ' (진행 중에 멈춤)' : ''}`)
  if (ordered.length > shown.length) lines.push(`- 외 ${ordered.length - shown.length}개`)
  return ['멈춘 곳부터 남은 할 일을 이어서 진행해 주세요.', ...lines].join('\n')
}

// 단추를 눌렀을 때. 입력창이 비어 있으면 요청을 채워 바로 보낸다.
// 사람이 쓰던 글이나 붙인 파일이 있으면(hasDraft) 지우거나 함께 보내지 않고, 커서 자리에 요청을 넣기만 한다.
// 사람이 읽고 직접 보낸다. 'sent' | 'inserted' | 'failed'
export function sendResume(actions, hasDraft, text) {
  if (!actions) return 'failed'
  try {
    if (!hasDraft) {
      actions.setDraft(text)
      actions.submit()
      return 'sent'
    }
    return actions.insertText(`\n${text}`, actions.captureInsertion()) ? 'inserted' : 'failed'
  } catch (_error) {
    return 'failed'
  }
}

export const RESUME_RESULT_TEXT = {
  sent: '이어서 진행해 달라고 보냈어요.',
  inserted: '입력창에 쓰던 글이 있어 요청을 덧붙이기만 했어요. 확인하고 직접 보내 주세요.',
  failed: '지금은 보내지 못했어요. 잠시 뒤 다시 눌러 주세요.',
}
