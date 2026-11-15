// Sessions, newest first, with anything waiting for an answer on top.
import { useEffect, useState } from 'preact/hooks'
import { api } from '../api.js'
import { toast, update, useStore } from '../store.js'
import { setPref } from '../lib/prefs.js'
import { baseName, go, relativeTime, usePageTitle } from '../lib/util.js'
import { Icon } from '../components/Icon.jsx'
import { Sheet } from '../components/Sheet.jsx'
import { t } from '../lib/i18n.js'
import { pendingIcon, pendingRowText } from '../lib/pending.js'

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
      toast(t('list.createFailed', { error: error.message }), { tone: 'error' })
      setBusy(false)
    }
  }
  return (
    <Sheet title={t('list.new')} onClose={onClose}>
      <p class="muted small">{t('list.pickFolder')}</p>
      {workspaces === null ? <p class="muted pad">{t('loading')}</p> : null}
      {workspaces?.length === 0 ? <p class="muted pad">{t('list.noFolders')}</p> : null}
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
  const { sessions, loaded, pending, dark } = useStore((s) => ({ sessions: s.sessions, loaded: s.sessionsLoaded, pending: s.pending, dark: s.prefs.shownTheme === 'dark' }))
  const [creating, setCreating] = useState(false)
  usePageTitle(t('list.pageTitle'))
  const waiting = new Set(pending.map((p) => p.sessionId))
  const titleOf = (id) => sessions.find((s) => s.id === id)?.title ?? t('session.fallback')
  return (
    <div class="screen">
      <header class="topbar topbar-home">
        <div class="topbar-title"><h1 class="one-line" tabIndex={-1}>{t('list.heading')}</h1></div>
        <button type="button" class="icon-btn" aria-label={dark ? t('list.toLight') : t('list.toDark')} onClick={() => setPref('theme', dark ? 'light' : 'dark')}><Icon name={dark ? 'sun' : 'moon'} /></button>
        <button type="button" class="icon-btn" aria-label={t('settings.title')} onClick={() => go('#/settings')}><Icon name="settings" /></button>
        <button type="button" class="icon-btn primary round" aria-label={t('list.new')} onClick={() => setCreating(true)}><Icon name="plus" /></button>
      </header>
      <main class="page">
        {pending.length > 0 ? (
          <section class="card card-attn" aria-labelledby="pending-title">
            <h2 id="pending-title" class="card-title"><Icon name="bell" size={18} />{t('list.pendingCount', { count: pending.length })}</h2>
            <ul class="list">
              {pending.map((p) => (
                <li key={p.id}>
                  <button type="button" class="row" data-qa-multiline onClick={() => update((s) => { s.openPending = p.id })}>
                    <Icon name={pendingIcon(p)} size={20} />
                    <span class="row-main">
                      <span class="row-title one-line">{pendingRowText(p)}</span>
                      <span class="row-meta one-line">{titleOf(p.sessionId)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!loaded ? <p class="muted center pad">{t('list.loading')}</p> : null}
        {loaded && sessions.length === 0 ? <p class="muted center pad">{t('list.empty')}</p> : null}
        <ul class="list sessions">
          {sessions.map((s) => (
            <li key={s.id}>
              <a class="row" href={`#/s/${encodeURIComponent(s.id)}`}>
                <span class="row-main">
                  <span class="row-line">
                    <span class="row-title one-line">{s.title}</span>
                    <span class="row-time">{relativeTime(s.updatedAt)}</span>
                  </span>
                  <span class="row-line">
                    <span class="row-meta one-line">{baseName(s.cwd)}</span>
                    {waiting.has(s.id) ? <span class="badge badge-attn">{t('badge.needsAnswer')}</span> : s.running ? <span class="badge badge-run"><span class="dot dot-run" aria-hidden="true" />{t('state.running')}</span> : null}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </main>
      {creating ? <NewSession onClose={() => setCreating(false)} /> : null}
    </div>
  )
}
