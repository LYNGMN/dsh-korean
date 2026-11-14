// Approval or question waiting for a person. Answers go out only from these buttons.
import { useEffect, useState } from 'preact/hooks'
import { api } from '../api.js'
import { unwatchSession, watchedSession, watchSession } from '../live.js'
import { state, toast, update, useStore } from '../store.js'
import { Sheet } from './Sheet.jsx'
import { Icon } from './Icon.jsx'

function sessionTitle(sessionId) {
  return state.sessions.find((s) => s.id === sessionId)?.title ?? '세션'
}

async function answer(item, body, onClose, setBusy, setError) {
  setBusy(true)
  setError(null)
  try {
    await api(`/pending/${encodeURIComponent(item.id)}`, { method: 'POST', body })
    update((s) => { s.pending = s.pending.filter((p) => p.id !== item.id) })
    toast(body.decision === 'reject' ? '거부했습니다' : body.decision === 'allow' ? '허용했습니다' : '답을 보냈습니다')
    onClose()
  } catch (error) {
    if (error.status === 409) {
      toast('이미 다른 곳에서 답한 요청입니다')
      update((s) => { s.pending = s.pending.filter((p) => p.id !== item.id) })
      onClose()
    } else {
      setError(`보내지 못했습니다: ${error.message}`)
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
        <span class="chip"><Icon name="tool" size={16} />{item.tool}</span>
        <span class="muted one-line">{sessionTitle(item.sessionId)}</span>
      </div>
      <p class="pending-reason">{item.reason ?? '이 도구를 실행하려면 허용이 필요합니다.'}</p>
      {call ? (
        <section class="pending-call" aria-labelledby="pending-call-title">
          <h3 id="pending-call-title" class="pending-call-title">허용하면 실행할 내용</h3>
          <p class="pending-call-name">{call.title}</p>
          {call.input && call.input !== call.title ? <pre class="pre" role="group" tabIndex={0} aria-label="실행할 명령">{call.input}</pre> : null}
          {diffs.length > 0 ? (
            <button type="button" class="link-btn" onClick={() => update((s) => { s.openDiff = { title: '바뀔 내용', files: diffs } })}>
              <Icon name="diff" size={16} />바뀔 내용 보기 · 파일 {diffs.length}개
            </button>
          ) : null}
        </section>
      ) : null}
      <p class="muted small">허용은 이번 한 번만 적용됩니다. Desktop 창에서 먼저 답하면 그 답이 쓰입니다.</p>
      <div class="btn-grid">
        <button type="button" class="btn btn-danger" disabled={busy} autofocus onClick={() => answer(item, { decision: 'reject' }, onClose, setBusy, setError)}>거부</button>
        <button type="button" class="btn btn-primary" disabled={busy} onClick={() => answer(item, { decision: 'allow' }, onClose, setBusy, setError)}>허용</button>
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
            <span class="field-label">직접 입력</span>
            <textarea rows={2} value={custom[q.id]} onInput={(e) => setCustom((prev) => ({ ...prev, [q.id]: e.currentTarget.value }))} />
          </label>
        </fieldset>
      ))}
      <div class="btn-grid one">
        <button type="submit" class="btn btn-primary" disabled={busy || !complete} aria-describedby="answer-hint">답 보내기</button>
      </div>
      <p class="muted small form-hint" id="answer-hint">{complete ? '' : '질문마다 하나를 고르거나 직접 입력하면 보낼 수 있습니다.'}</p>
      <ErrorLine error={error} />
    </form>
  )
}

export function PendingSheet({ item, onClose }) {
  return (
    <Sheet title={item.kind === 'approval' ? '승인 요청' : '질문'} onClose={onClose}>
      {item.kind === 'approval' ? <Approval item={item} onClose={onClose} /> : <Question item={item} onClose={onClose} />}
    </Sheet>
  )
}
