import { render } from 'preact'
import './app.css'
import { api } from './api.js'
import { startLive } from './live.js'
import { state, update, useStore } from './store.js'
import { storageGet, useRoute } from './lib/util.js'
import { ConnectionBanner, Toasts } from './components/Chrome.jsx'
import { DiffSheet } from './components/DiffSheet.jsx'
import { PendingSheet } from './components/PendingSheet.jsx'
import { Chat } from './screens/Chat.jsx'
import { SessionList } from './screens/SessionList.jsx'
import { Settings } from './screens/Settings.jsx'

state.openPending = null
state.openDiff = null

function Overlays() {
  const { pendingItem, diff } = useStore((s) => ({ pendingItem: s.pending.find((p) => p.id === s.openPending) ?? null, diff: s.openDiff }))
  return (
    <>
      {pendingItem ? <PendingSheet key={pendingItem.id} item={pendingItem} onClose={() => update((s) => { s.openPending = null })} /> : null}
      {diff ? <DiffSheet title={diff.title} files={diff.files} onClose={() => update((s) => { s.openDiff = null })} /> : null}
    </>
  )
}

function App() {
  const route = useRoute()
  return (
    <div class="app">
      <ConnectionBanner />
      {route.name === 'chat' ? <Chat key={route.sessionId} sessionId={route.sessionId} /> : route.name === 'settings' ? <Settings /> : <SessionList />}
      <Overlays />
      <Toasts />
    </div>
  )
}

// Keep the layout above the on-screen keyboard (iOS Safari does not resize the page).
function trackViewport() {
  const vv = window.visualViewport
  if (!vv) return
  const apply = () => document.documentElement.style.setProperty('--app-height', `${String(Math.round(vv.height))}px`)
  vv.addEventListener('resize', apply)
  apply()
}

// Reopen where the person left off, including a notification's target.
if (!location.hash) {
  const last = storageGet('last-route', '#/')
  if (typeof last === 'string' && last.startsWith('#/')) history.replaceState(null, '', last)
}

trackViewport()
render(<App />, document.getElementById('app'))
startLive()
api('/me').then((me) => update((s) => { s.me = me })).catch(() => {})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/h/sw.js', { scope: '/h/' }).catch(() => {})
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'open' && typeof event.data.url === 'string') {
      const hash = new URL(event.data.url, location.href).hash
      if (hash) location.hash = hash
      if (event.data.pendingId) update((s) => { s.openPending = event.data.pendingId })
    }
  })
}
