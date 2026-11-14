// Small helpers: relative time, file names, per-session drafts, routing.
import { useEffect, useState } from 'preact/hooks'

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
  if (s < 60) return '방금'
  if (s < 3600) return `${String(Math.floor(s / 60))}분 전`
  if (s < 86400) return `${String(Math.floor(s / 3600))}시간 전`
  if (s < 86400 * 7) return `${String(Math.floor(s / 86400))}일 전`
  const d = new Date(ms)
  return `${String(d.getMonth() + 1)}월 ${String(d.getDate())}일`
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

export const isTouch = () => window.matchMedia('(pointer: coarse)').matches
