/* global __SHELL__, __SHELL_VERSION__ */
// Service worker: app shell cache, push display, notification taps.
// Android shows 거부/허용 buttons on approval notifications; a tap on one is a
// person's answer and goes to the same endpoint the app uses.
const CACHE = `dsh-handheld-${__SHELL_VERSION__}`
const SHELL = __SHELL__

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key.startsWith('dsh-handheld-')) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (!url.pathname.startsWith('/h/') || url.pathname.startsWith('/h/api') || url.pathname.startsWith('/h/live')) return
  if (event.request.mode === 'navigate') {
    // Network first so an expired Access session can redirect to its login page.
    event.respondWith(fetch(event.request).catch(async () => (await caches.match('/h/')) ?? Response.error()))
    return
  }
  if (url.pathname.startsWith('/h/assets/')) {
    event.respondWith(caches.match(event.request).then((hit) => hit ?? fetch(event.request)))
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch { data = {} }
  const approval = data.kind === 'approval' && data.pendingId
  event.waitUntil(self.registration.showNotification(data.title ?? 'DSH', {
    body: data.body ?? '',
    tag: data.tag ?? 'dsh',
    renotify: true,
    requireInteraction: data.kind === 'approval' || data.kind === 'question',
    icon: '/h/icon-192.png',
    badge: '/h/icon-192.png',
    lang: 'ko',
    data: { url: data.url ?? '/h/', pendingId: data.pendingId ?? null, kind: data.kind ?? null },
    actions: approval ? [{ action: 'reject', title: '거부' }, { action: 'allow', title: '허용' }] : [],
  }))
})

async function answerFromNotification(pendingId, decision) {
  const res = await fetch(`/h/api/pending/${encodeURIComponent(pendingId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision }),
    credentials: 'same-origin',
    redirect: 'manual',
  })
  const message = res.ok ? (decision === 'allow' ? '허용했습니다' : '거부했습니다') : res.status === 409 ? '이미 답한 요청입니다' : '답하지 못했습니다. 앱에서 확인해 주세요.'
  await self.registration.showNotification('DSH', { body: message, tag: `answered:${pendingId}`, icon: '/h/icon-192.png', lang: 'ko' })
}

async function openApp(url, pendingId) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const existing = windows.find((w) => new URL(w.url).pathname.startsWith('/h/'))
  if (existing) {
    await existing.focus()
    existing.postMessage({ type: 'open', url, pendingId })
    return
  }
  await self.clients.openWindow(url)
}

self.addEventListener('notificationclick', (event) => {
  const { url, pendingId } = event.notification.data ?? {}
  event.notification.close()
  if ((event.action === 'allow' || event.action === 'reject') && pendingId) {
    event.waitUntil(answerFromNotification(pendingId, event.action))
    return
  }
  event.waitUntil(openApp(url ?? '/h/', pendingId))
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const res = await fetch('/h/api/push/key', { credentials: 'same-origin' })
    if (!res.ok) return
    const { publicKey } = await res.json()
    const padded = publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (publicKey.length % 4)) % 4)
    const key = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    await fetch('/h/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), label: '자동 갱신' }),
      credentials: 'same-origin',
    })
  })())
})
