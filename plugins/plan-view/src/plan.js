// 계획 보기의 순수 함수. import 없이 써야 scripts/build.mjs가 번들에 넣는다.
// 화면·DSH 서비스는 모르고, 세션 이벤트와 할 일 목록만 다룬다.

export const VIEW_ID = 'dsh-plan-view'
export const PLAN_KIND = 'dsh-plan-view.plan'
export const UNTITLED_PLAN = '제목 없는 계획'

const PLAN_EVENT_TYPES = new Set(['tool/call', 'tool/ptc-dispatch-start', 'tool/ptc-dispatch'])

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// exit_plan_mode 호출 이벤트에서 제출된 계획(마크다운)을 읽는다. 모양이 다르면 undefined.
export function submittedPlanOf(event) {
  if (!isRecord(event) || !PLAN_EVENT_TYPES.has(event.type)) return undefined
  const data = event.data
  if (!isRecord(data) || data.name !== 'exit_plan_mode') return undefined
  const callId = event.type === 'tool/call' ? data.callId : data.subCallId
  if (typeof callId !== 'string' || callId === '') return undefined
  let args = data.arguments
  if (typeof args === 'string') {
    try { args = JSON.parse(args) } catch { return undefined }
  }
  if (!isRecord(args) || typeof args.plan !== 'string' || args.plan.trim() === '') return undefined
  const markdown = args.plan
  const heading = /^#{1,6}\s+(\S[^\r\n]*)/m.exec(markdown.trim())?.[1]?.trim()
  return { callId, title: heading || UNTITLED_PLAN, markdown, seq: typeof event.seq === 'number' ? event.seq : 0 }
}

// 대화 정의의 match: 같은 호출의 PTC 완료 이벤트는 처음 카드를 고치는 update다.
export function matchPlanEvent(event) {
  const plan = submittedPlanOf(event)
  if (plan === undefined) return null
  return { id: plan.callId, role: event.type === 'tool/ptc-dispatch' ? 'update' : 'start' }
}

export function planNodeOf(context) {
  const data = context.state
  if (data === undefined || data === null) return null
  return { key: context.key, kind: PLAN_KIND, id: context.id, target: VIEW_ID, data }
}

export const TODO_STATUS = {
  completed: { label: '완료' },
  in_progress: { label: '진행 중' },
  pending: { label: '대기' },
}

// 투영 값(배열 또는 null)을 그릴 수 있는 할 일 목록으로 고른다. 모르는 상태는 대기로 본다.
export function todoItems(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => isRecord(item) && typeof item.content === 'string' && item.content.trim() !== '')
    .map(item => ({ content: item.content, status: item.status in TODO_STATUS ? item.status : 'pending' }))
}

// "완료 2 · 진행 중 1 · 대기 3". 0인 칸은 뺀다.
export function todoSummary(items) {
  const count = status => items.filter(item => item.status === status).length
  return ['completed', 'in_progress', 'pending']
    .map(status => [TODO_STATUS[status].label, count(status)])
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n}`)
    .join(' · ')
}
