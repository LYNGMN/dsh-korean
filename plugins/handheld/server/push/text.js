// Notification wording in the language chosen on the phone (settings.lang).
export const LANGS = ['ko', 'en', 'ja', 'zh-CN', 'zh-TW']
export const DEFAULT_LANG = 'ko'

const TEXT = {
  ko: {
    session: '세션', tool: '도구',
    approval: '승인 요청 · {session}', approvalBody: '{tool} 실행 승인이 필요합니다',
    question: '질문 · {session}', questionBody: '답이 필요합니다',
    review: '계획 검토 · {session}', reviewBody: '계획을 검토해 주세요',
    turnEnd: '작업 끝 · {session}', turnEndBody: '답변이 끝났습니다',
    approvalStage: '{stage} 승인 필요', stages: { share: '공유', merge: '합치기', deploy: '배포' },
    test: '알림이 잘 옵니다',
    reject: '거부', allow: '허용', allowed: '허용했습니다', rejected: '거부했습니다',
    gone: '이미 답한 요청입니다', failed: '답하지 못했습니다. 앱에서 확인해 주세요.',
  },
  en: {
    session: 'Session', tool: 'Tool',
    approval: 'Approval request · {session}', approvalBody: '{tool} needs your permission to run',
    question: 'Question · {session}', questionBody: 'An answer is needed',
    review: 'Plan review · {session}', reviewBody: 'A plan needs your review',
    turnEnd: 'Work finished · {session}', turnEndBody: 'The reply is complete',
    approvalStage: '{stage} needs approval', stages: { share: 'Share', merge: 'Merge', deploy: 'Deploy' },
    test: 'Notifications are working',
    reject: 'Deny', allow: 'Allow', allowed: 'Allowed', rejected: 'Denied',
    gone: 'This request was already answered', failed: 'Could not answer. Check in the app.',
  },
  ja: {
    session: 'セッション', tool: 'ツール',
    approval: '承認リクエスト · {session}', approvalBody: '{tool} の実行には許可が必要です',
    question: '質問 · {session}', questionBody: '回答が必要です',
    review: 'プランのレビュー · {session}', reviewBody: 'プランを確認してください',
    turnEnd: '作業完了 · {session}', turnEndBody: '返信が完了しました',
    approvalStage: '{stage}の承認が必要', stages: { share: '共有', merge: 'マージ', deploy: 'デプロイ' },
    test: '通知は正常に届いています',
    reject: '拒否', allow: '許可', allowed: '許可しました', rejected: '拒否しました',
    gone: 'すでに回答済みのリクエストです', failed: '回答できませんでした。アプリで確認してください。',
  },
  'zh-CN': {
    session: '会话', tool: '工具',
    approval: '审批请求 · {session}', approvalBody: '运行 {tool} 需要你的许可',
    question: '提问 · {session}', questionBody: '需要你的回答',
    review: '计划审阅 · {session}', reviewBody: '请审阅计划',
    turnEnd: '工作完成 · {session}', turnEndBody: '回复已完成',
    approvalStage: '{stage}需要批准', stages: { share: '共享', merge: '合并', deploy: '部署' },
    test: '通知工作正常',
    reject: '拒绝', allow: '允许', allowed: '已允许', rejected: '已拒绝',
    gone: '该请求已被回答', failed: '未能回答，请在应用中查看。',
  },
  'zh-TW': {
    session: '工作階段', tool: '工具',
    approval: '核准要求 · {session}', approvalBody: '執行 {tool} 需要你的許可',
    question: '提問 · {session}', questionBody: '需要你的回答',
    review: '計畫審閱 · {session}', reviewBody: '請審閱計畫',
    turnEnd: '工作完成 · {session}', turnEndBody: '回覆已完成',
    approvalStage: '{stage}需要核准', stages: { share: '共享', merge: '合併', deploy: '部署' },
    test: '通知運作正常',
    reject: '拒絕', allow: '允許', allowed: '已允許', rejected: '已拒絕',
    gone: '這個要求已經回答過了', failed: '無法回答，請在 App 中查看。',
  },
}

const table = (lang) => TEXT[lang] ?? TEXT[DEFAULT_LANG]
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '')

function reasonIn(note, lang) {
  const own = note.reasons?.[lang] ?? note.reasons?.[lang.split('-')[0]]
  return typeof own === 'string' && own ? own : note.reason
}

/** Title and body of the notification for one hub note. */
export function noteText(note, lang) {
  const text = table(lang)
  const session = note.session || text.session
  if (note.kind === 'approval') {
    const tool = note.tool || text.tool
    const reason = reasonIn(note, lang)
    return { title: fill(text.approval, { session }), body: reason ? `${tool}: ${reason}` : fill(text.approvalBody, { tool }) }
  }
  if (note.kind === 'question') {
    if (note.review) return { title: fill(text.review, { session }), body: note.plan || text.reviewBody }
    return { title: fill(text.question, { session }), body: note.question || text.questionBody }
  }
  const stage = text.stages[note.approval]
  return { title: fill(text.turnEnd, { session }), body: stage ? `${text.turnEndBody} · ${fill(text.approvalStage, { stage })}` : text.turnEndBody }
}

/** Words the service worker needs for the notification's own buttons and their result. */
export function actionTexts(lang) {
  const { reject, allow, allowed, rejected, gone, failed } = table(lang)
  return { reject, allow, allowed, rejected, gone, failed }
}

export const testText = (lang) => table(lang).test
