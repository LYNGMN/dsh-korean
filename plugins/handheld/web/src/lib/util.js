// Small helpers: relative time, file names, per-session drafts, routing.
import { useEffect, useState } from 'preact/hooks'
import { lang, t } from './i18n.js'

const PREFIX = 'dsh-handheld:'

export function storageGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function storageSet(key, value) {
  try {
    if (value === null || value === undefined || value === '') localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Private mode or full storage: drafts are a convenience only.
  }
}

export function relativeTime(ms, now = Date.now()) {
  if (!ms) return ''
  const s = Math.round((now - ms) / 1000)
  if (s < 60) return t('time.now')
  if (s < 3600) return t('time.minutes', { n: Math.floor(s / 60) })
  if (s < 86400) return t('time.hours', { n: Math.floor(s / 3600) })
  if (s < 86400 * 7) return t('time.days', { n: Math.floor(s / 86400) })
  return new Intl.DateTimeFormat(lang(), { month: 'short', day: 'numeric' }).format(new Date(ms))
}

export function baseName(p) {
  return typeof p === 'string' ? p.split('/').filter(Boolean).at(-1) ?? p : ''
}

/** Shortest unambiguous tail of a path for display, e.g. src/Login.tsx */
export function shortPath(p) {
  const parts = typeof p === 'string' ? p.split('/').filter(Boolean) : []
  return parts.slice(-2).join('/')
}

export function parseRoute(hash = location.hash) {
  const path = hash.replace(/^#/, '') || '/'
  const session = /^\/s\/([^/]+)$/.exec(path)
  if (session) return { name: 'chat', sessionId: decodeURIComponent(session[1]) }
  if (path === '/settings') return { name: 'settings' }
  return { name: 'list' }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute())
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute())
      storageSet('last-route', location.hash || '#/')
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function go(hash) {
  if (location.hash !== hash) location.hash = hash
}


/** Names the current screen in the tab and task switcher. */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${t('app.title')}` : t('app.title')
  }, [title])
}

/** Puts keyboard and screen-reader focus on the screen's heading. */
export function focusHeading() {
  document.querySelector('.screen h1')?.focus({ preventScroll: true })
}

/** Parent session of a subagent conversation id (server/protocol.js), or null for a session. */
export function subagentParent(sessionId) {
  const parts = typeof sessionId === 'string' ? sessionId.split('~') : []
  return parts.length === 4 && parts[0] === 'sub' ? parts[1] : null
}
