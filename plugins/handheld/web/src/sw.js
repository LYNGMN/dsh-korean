/* global __SHELL__, __SHELL_VERSION__ */
// Service worker: app shell cache, push display, notification taps.
// Android shows 거부/허용 buttons on approval notifications; a tap on one is a
// person's answer and goes to the same endpoint the app uses.
const CACHE = `dsh-handheld-${__SHELL_VERSION__}`
const SHELL = __SHELL__
const FONTS = 'dsh-handheld-fonts'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key !== FONTS && key.startsWith('dsh-handheld-')) await caches.delete(key)
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
  if (url.pathname.startsWith('/h/assets/fonts/')) {
    // Font pieces arrive as the text on screen needs them; keep each one so the
    // letters look the same offline. Their folder name carries the font version.
    event.respondWith(caches.open(FONTS).then(async (cache) => {
      const hit = await cache.match(event.request)
      if (hit) return hit
      const response = await fetch(event.request)
      if (response.ok) void cache.put(event.request, response.clone())
      return response
    }))
    return
  }
  if (url.pathname.startsWith('/h/assets/')) {
    event.respondWith(caches.match(event.request).then((hit) => hit ?? fetch(event.request)))
  }
})

// Used when a notification carries no wording of its own (sent by an older gateway).
const FALLBACK_TEXTS = { reject: '거부', allow: '허용', allowed: '허용했습니다', rejected: '거부했습니다', gone: '이미 답한 요청입니다', failed: '답하지 못했습니다. 앱에서 확인해 주세요.' }

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
    lang: data.lang ?? 'ko',
    data: { url: data.url ?? '/h/', pendingId: data.pendingId ?? null, kind: data.kind ?? null, lang: data.lang ?? 'ko', texts: data.texts ?? FALLBACK_TEXTS },
    actions: approval ? [{ action: 'reject', title: data.texts?.reject ?? FALLBACK_TEXTS.reject }, { action: 'allow', title: data.texts?.allow ?? FALLBACK_TEXTS.allow }] : [],
  }))
})

async function answerFromNotification(pendingId, decision, texts, lang) {
  const res = await fetch(`/h/api/pending/${encodeURIComponent(pendingId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision }),
    credentials: 'same-origin',
    redirect: 'manual',
  })
  const message = res.ok ? (decision === 'allow' ? texts.allowed : texts.rejected) : res.status === 409 ? texts.gone : texts.failed
  await self.registration.showNotification('DSH', { body: message, tag: `answered:${pendingId}`, icon: '/h/icon-192.png', lang })
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
  const { url, pendingId, texts = FALLBACK_TEXTS, lang = 'ko' } = event.notification.data ?? {}
  event.notification.close()
  if ((event.action === 'allow' || event.action === 'reject') && pendingId) {
    event.waitUntil(answerFromNotification(pendingId, event.action, texts, lang))
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
      body: JSON.stringify({ subscription: subscription.toJSON(), label: 'auto-renewed' }),
      credentials: 'same-origin',
    })
  })())
})
