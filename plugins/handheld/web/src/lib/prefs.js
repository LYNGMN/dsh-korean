// Display options kept on this device. Each one is an attribute on <html> that
// app.css reads, so changing an option never re-renders the conversation.
import { state, update } from '../store.js'
import { resolveTheme } from './theme.js'
import { storageGet, storageSet } from './util.js'

export const PREFS = {
  theme: { storage: 'theme', fallback: 'auto', values: ['auto', 'light', 'dark'] },
  accent: { storage: 'accent', fallback: 'deepseek', values: ['deepseek', 'calm', 'graphite'] },
  bubble: { storage: 'bubble', fallback: 'soft', values: ['soft', 'solid'] },
  font: { storage: 'font', fallback: 'bundled', values: ['bundled', 'system'] },
  text: { storage: 'text-size', fallback: 'normal', values: ['normal', 'large', 'xlarge'] },
  density: { storage: 'density', fallback: 'cozy', values: ['cozy', 'compact'] },
  reasoning: { storage: 'reasoning', fallback: 'show', values: ['show', 'hide'] },
}

// Page background per theme, for the browser and status bar chrome (matches --bg in app.css).
const CHROME = { light: '#f6f7fb', dark: '#0c0f16' }

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

function read(name) {
  const pref = PREFS[name]
  const value = storageGet(pref.storage, pref.fallback)
  return pref.values.includes(value) ? value : pref.fallback
}

function apply(prefs) {
  const root = document.documentElement
  const shown = resolveTheme(prefs.theme, systemDark())
  if (prefs.theme === 'auto') delete root.dataset.theme
  else root.dataset.theme = prefs.theme
  // app.css keys the accent's dark values on this, whichever way dark was reached.
  root.dataset.shown = shown
  root.dataset.accent = prefs.accent
  root.dataset.bubble = prefs.bubble
  root.dataset.font = prefs.font
  root.dataset.text = prefs.text
  root.dataset.density = prefs.density
  root.dataset.reasoning = prefs.reasoning
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const own = meta.media.includes('dark') ? 'dark' : 'light'
    meta.content = CHROME[prefs.theme === 'auto' ? own : shown]
  }
  update((s) => { s.prefs = { ...prefs, shownTheme: shown } })
}

const current = () => Object.fromEntries(Object.keys(PREFS).map((name) => [name, read(name)]))

export function startPrefs() {
  apply(current())
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(current()))
}

export function setPref(name, value) {
  const pref = PREFS[name]
  if (!pref.values.includes(value)) return
  storageSet(pref.storage, value === pref.fallback ? null : value)
  apply(current())
}

state.prefs = { theme: 'auto', accent: 'deepseek', bubble: 'soft', font: 'bundled', text: 'normal', density: 'cozy', reasoning: 'show', shownTheme: 'light' }
