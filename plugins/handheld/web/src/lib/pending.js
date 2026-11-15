// How a waiting approval, question or plan review is named in lists and strips.
import { t } from './i18n.js'

/** The question that asks to review a plan, or null for an ordinary question. */
export function reviewOf(item) {
  const first = item.kind === 'question' && item.questions.length === 1 ? item.questions[0] : null
  return first?.review ? first : null
}

/** First markdown heading of a plan, or '' when it has none. */
export function planTitle(markdown) {
  return /^#{1,6}\s+(.+?)\s*$/m.exec(markdown ?? '')?.[1] ?? ''
}

export function pendingRowText(item) {
  if (item.kind === 'approval') return t('pending.approvalRow', { tool: item.tool ?? t('tool.fallback') })
  const review = reviewOf(item)
  if (review) return t('pending.reviewRow', { title: planTitle(review.detail) })
  return t('pending.questionRow', { question: item.questions[0]?.question ?? '' })
}

export function pendingStripText(item) {
  if (item.kind === 'approval') return t('pending.approvalStrip', { tool: item.tool ?? t('tool.fallback') })
  return t(reviewOf(item) ? 'pending.reviewStrip' : 'pending.questionStrip')
}
