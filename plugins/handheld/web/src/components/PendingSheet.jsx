// Approval or question waiting for a person. Answers go out only from these buttons.
import { useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../api.js'
import { unwatchSession, watchedSession, watchSession } from '../live.js'
import { state, toast, update, useStore } from '../store.js'
import { Sheet } from './Sheet.jsx'
import { Icon } from './Icon.jsx'
import { Markdown } from '../lib/markdown.jsx'
import { pickText, t } from '../lib/i18n.js'
import { reviewOf } from '../lib/pending.js'
import { motionReduced } from '../lib/prefs.js'

// How long the approval seal stays before the sheet closes.
const SEAL_MS = 620

function sessionTitle(sessionId) {
  return state.sessions.find((s) => s.id === sessionId)?.title ?? t('session.fallback')
}

async function answer(item, body, onClose, setBusy, setError, done, beforeClose) {
  setBusy(true)
  setError(null)
  try {
    await api(`/pending/${encodeURIComponent(item.id)}`, { method: 'POST', body })
    await beforeClose?.()
    update((s) => { s.pending = s.pending.filter((p) => p.id !== item.id) })
    toast(t(done ?? (body.decision === 'reject' ? 'answer.rejected' : body.decision === 'allow' ? 'answer.allowed' : 'answer.sent')))
    onClose()
  } catch (error) {
    if (error.status === 409) {
      toast(t('answer.gone'))
      update((s) => { s.pending = s.pending.filter((p) => p.id !== item.id) })
      onClose()
    } else {
      setError(t('sendFailed', { error: error.message }))
    }
  } finally {
    setBusy(false)
  }
}

function ErrorLine({ error }) {
  return <p class="form-error" role="alert">{error ?? ''}</p>
}

/** The tool call an approval is about, once that session's items are on the phone. */
function useApprovalCall(item) {
  useEffect(() => {
    // Opened from the list or a notification: nothing is loading this session yet.
    if (watchedSession() !== null) return undefined
    watchSession(item.sessionId)
    return () => unwatchSession(item.sessionId)
  }, [item.sessionId])
  return useStore((s) => (item.callId ? s.feeds[item.sessionId]?.items.find((i) => i.kind === 'tool' && i.callId === item.callId) ?? null : null))
}

function Approval({ item, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const call = useApprovalCall(item)
  const diffs = call?.diffs ?? []
  return (
    <>
      <div class="pending-meta">
        <span class="chip"><Icon name="tool" size={16} />{item.tool ?? t('tool.fallback')}</span>
        <span class="muted one-line">{sessionTitle(item.sessionId)}</span>
      </div>
      <p class="pending-reason">{pickText(item.reasons, item.reason) ?? t('approval.defaultReason')}</p>
      {call ? (
        <section class="pending-call" aria-labelledby="pending-call-title">
          <h3 id="pending-call-title" class="pending-call-title">{t('approval.willRun')}</h3>
          <p class="pending-call-name">{call.title}</p>
          {call.input && call.input !== call.title ? <pre class="pre" role="group" tabIndex={0} aria-label={t('approval.command')}>{call.input}</pre> : null}
          {diffs.length > 0 ? (
            <button type="button" class="link-btn" onClick={() => update((s) => { s.openDiff = { title: t('approval.diffTitle'), files: diffs } })}>
              <Icon name="diff" size={16} />{t('approval.diffView', { count: diffs.length })}
            </button>
          ) : null}
        </section>
      ) : null}
      <p class="muted small">{t('approval.once')}</p>
      <div class="btn-grid">
        <button type="button" class="btn btn-danger" disabled={busy} autofocus onClick={() => answer(item, { decision: 'reject' }, onClose, setBusy, setError)}>{t('reject')}</button>
        <button type="button" class="btn btn-primary" disabled={busy} onClick={() => answer(item, { decision: 'allow' }, onClose, setBusy, setError)}>{t('allow')}</button>
      </div>
      <ErrorLine error={error} />
    </>
  )
}

function Question({ item, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [picked, setPicked] = useState(() => Object.fromEntries(item.questions.map((q) => [q.id, []])))
  const [custom, setCustom] = useState(() => Object.fromEntries(item.questions.map((q) => [q.id, ''])))
  const complete = item.questions.every((q) => picked[q.id].length > 0 || custom[q.id].trim().length > 0)
  const toggle = (q, option) => setPicked((prev) => {
    const current = prev[q.id]
    if (!q.multiSelect) return { ...prev, [q.id]: [option] }
    return { ...prev, [q.id]: current.includes(option) ? current.filter((o) => o !== option) : [...current, option] }
  })
  const submit = (e) => {
    e.preventDefault()
    const answers = item.questions.map((q) => {
      const entry = { id: q.id, selected: picked[q.id] }
      if (custom[q.id].trim()) entry.custom = custom[q.id].trim()
      return entry
    })
    void answer(item, { answers }, onClose, setBusy, setError)
  }
  return (
    <form onSubmit={submit}>
      <p class="muted one-line">{sessionTitle(item.sessionId)}</p>
      {item.questions.map((q) => (
        <fieldset class="question" key={q.id}>
          <legend class="question-text">{q.header ? <span class="chip">{q.header}</span> : null}{q.question}</legend>
          {q.detail ? <p class="muted small">{q.detail}</p> : null}
          {(q.options ?? []).map((option) => (
            <label class="choice" key={option}>
              <input type={q.multiSelect ? 'checkbox' : 'radio'} name={`q-${q.id}`} checked={picked[q.id].includes(option)} onChange={() => toggle(q, option)} />
              <span>{option}</span>
            </label>
          ))}
          <label class="field">
            <span class="field-label">{t('question.custom')}</span>
            <textarea rows={2} value={custom[q.id]} onInput={(e) => setCustom((prev) => ({ ...prev, [q.id]: e.currentTarget.value }))} />
          </label>
        </fieldset>
      ))}
      <div class="btn-grid one">
        <button type="submit" class="btn btn-primary" disabled={busy || !complete} aria-describedby="answer-hint">{t('question.send')}</button>
      </div>
      <p class="muted small form-hint" id="answer-hint">{complete ? '' : t('question.hint')}</p>
      <ErrorLine error={error} />
    </form>
  )
}

/**
 * A plan waiting for review, as Desktop shows it: the plan, then approve or ask for changes.
 * The answer is one of the two option values DSH sent; feedback rides along as the custom text.
 */
function PlanReview({ item, question, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [revising, setRevising] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [sealed, setSealed] = useState(false)
  const feedbackBox = useRef(null)
  useEffect(() => { if (revising) feedbackBox.current?.focus() }, [revising])
  const send = (selected, custom, done) => {
    const entry = { id: question.id, selected: [selected] }
    if (custom) entry.custom = custom
    void answer(item, { answers: [entry] }, onClose, setBusy, setError, done)
  }
  // The seal is stamped only after DSH took the answer; the sheet stays for it even though
  // the gateway has already dropped the request from the pending list.
  const approve = async () => {
    update((s) => { s.heldPending = item })
    await answer(item, { answers: [{ id: question.id, selected: [question.review.approve] }] }, onClose, setBusy, setError, 'answer.approved', () => {
      setSealed(true)
      return new Promise((resolve) => setTimeout(resolve, motionReduced() ? 0 : SEAL_MS))
    })
    update((s) => { s.heldPending = null })
  }
  return (
    <>
      <div class="review-head">
        <p class="muted one-line">{sessionTitle(item.sessionId)}</p>
        <div class="signoff" role="group" aria-label={t('review.signoff')}>
          <div><span class="signoff-name">{t('review.from')}</span><span class="signoff-mark">DSH</span></div>
          <div><span class="signoff-name">{t('review.sign')}</span><span class="signoff-mark">{sealed ? <span class="seal">{t('review.seal')}</span> : t('review.waiting')}</span></div>
        </div>
      </div>
      <section class="plan" aria-label={t('review.plan')}>
        <Markdown text={question.detail ?? ''} />
      </section>
      <div class="review-actions">
      {revising ? (
        <form onSubmit={(e) => { e.preventDefault(); send(question.review.revise, feedback.trim(), 'answer.reviseSent') }}>
          <label class="field">
            <span class="field-label">{t('review.feedback')}</span>
            <textarea rows={3} ref={feedbackBox} value={feedback} aria-describedby="review-hint" onInput={(e) => setFeedback(e.currentTarget.value)} />
          </label>
          <p class="muted small form-hint" id="review-hint">{t('review.feedbackHint')}</p>
          <div class="btn-grid">
            <button type="button" class="btn btn-outline" disabled={busy} onClick={() => setRevising(false)}>{t('cancel')}</button>
            <button type="submit" class="btn btn-primary" disabled={busy}>{t('review.sendRevise')}</button>
          </div>
        </form>
      ) : (
        <>
          <p class="muted small">{t('review.note')}</p>
          <div class="btn-grid">
            <button type="button" class="btn btn-outline" disabled={busy} onClick={() => setRevising(true)}>{t('review.revise')}</button>
            <button type="button" class="btn btn-primary" disabled={busy} onClick={approve}>{t('review.approve')}</button>
          </div>
        </>
      )}
      <ErrorLine error={error} />
      </div>
    </>
  )
}

export function PendingSheet({ item, onClose }) {
  const review = reviewOf(item)
  const title = item.kind === 'approval' ? t('sheet.approval') : review ? t('sheet.review') : t('sheet.question')
  return (
    <Sheet title={title} onClose={onClose} full={Boolean(review)}>
      {item.kind === 'approval' ? <Approval item={item} onClose={onClose} /> : review ? <PlanReview item={item} question={review} onClose={onClose} /> : <Question item={item} onClose={onClose} />}
    </Sheet>
  )
}
