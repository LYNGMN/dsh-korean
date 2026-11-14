// Sessions, newest first, with anything waiting for an answer on top.
import { useEffect, useState } from 'preact/hooks'
import { api } from '../api.js'
import { toast, update, useStore } from '../store.js'
import { baseName, go, relativeTime } from '../lib/util.js'
import { Icon } from '../components/Icon.jsx'
import { Sheet } from '../components/Sheet.jsx'

function NewSession({ onClose }) {
  const [workspaces, setWorkspaces] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api('/workspaces').then((r) => setWorkspaces(r.items)).catch((error) => {
      toast(error.message, { tone: 'error' })
      onClose()
    })
  }, [])
  const create = async (workspaceId) => {
    setBusy(true)
    try {
      const { sessionId } = await api('/sessions', { method: 'POST', body: { workspaceId } })
      onClose()
      go(`#/s/${encodeURIComponent(sessionId)}`)
    } catch (error) {
      toast(`세션을 만들지 못했습니다: ${error.message}`, { tone: 'error' })
      setBusy(false)
    }
  }
  return (
    <Sheet title="새 세션" onClose={onClose}>
      <p class="muted small">작업할 폴더를 고르세요.</p>
      {workspaces === null ? <p class="muted pad">불러오는 중…</p> : null}
      {workspaces?.length === 0 ? <p class="muted pad">작업 폴더가 없습니다. Desktop에서 먼저 폴더를 여세요.</p> : null}
      <ul class="list">
        {(workspaces ?? []).map((w) => (
          <li key={w.id}>
            <button type="button" class="row" data-qa-multiline disabled={busy} onClick={() => create(w.id)}>
              <span class="row-main">
                <span class="row-title one-line">{w.title || baseName(w.path)}</span>
                <span class="row-meta one-line">{w.path}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

export function SessionList() {
  const { sessions, loaded, pending } = useStore((s) => ({ sessions: s.sessions, loaded: s.sessionsLoaded, pending: s.pending }))
  const [creating, setCreating] = useState(false)
  const waiting = new Set(pending.map((p) => p.sessionId))
  const titleOf = (id) => sessions.find((s) => s.id === id)?.title ?? '세션'
  return (
    <div class="screen">
      <header class="topbar">
        <div class="topbar-title"><h1 class="one-line">DSH 세션</h1></div>
        <button type="button" class="icon-btn" aria-label="새 세션" onClick={() => setCreating(true)}><Icon name="plus" /></button>
        <button type="button" class="icon-btn" aria-label="설정" onClick={() => go('#/settings')}><Icon name="settings" /></button>
      </header>
      <main class="page">
        {pending.length > 0 ? (
          <section class="card card-attn" aria-labelledby="pending-title">
            <h2 id="pending-title" class="card-title"><Icon name="bell" size={18} />답을 기다리는 요청 {pending.length}건</h2>
            <ul class="list">
              {pending.map((p) => (
                <li key={p.id}>
                  <button type="button" class="row" data-qa-multiline onClick={() => update((s) => { s.openPending = p.id })}>
                    <Icon name={p.kind === 'approval' ? 'shield' : 'question'} size={20} />
                    <span class="row-main">
                      <span class="row-title one-line">{p.kind === 'approval' ? `승인 · ${p.tool}` : `질문 · ${p.questions[0]?.question ?? ''}`}</span>
                      <span class="row-meta one-line">{titleOf(p.sessionId)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!loaded ? <p class="muted center pad">세션을 불러오는 중…</p> : null}
        {loaded && sessions.length === 0 ? <p class="muted center pad">세션이 없습니다. 오른쪽 위 + 로 새 세션을 만드세요.</p> : null}
        <ul class="list sessions">
          {sessions.map((s) => (
            <li key={s.id}>
              <a class="row" href={`#/s/${encodeURIComponent(s.id)}`}>
                <span class="row-main">
                  <span class="row-title one-line">{s.title}</span>
                  <span class="row-meta one-line">{[baseName(s.cwd), relativeTime(s.updatedAt)].filter(Boolean).join(' · ')}</span>
                </span>
                {waiting.has(s.id) ? <span class="badge badge-attn">답 필요</span> : s.running ? <span class="badge badge-run"><span class="dot dot-run" aria-hidden="true" />실행 중</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </main>
      {creating ? <NewSession onClose={() => setCreating(false)} /> : null}
    </div>
  )
}
