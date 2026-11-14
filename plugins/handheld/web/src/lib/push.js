// Web Push on this device: what the browser supports, subscribe, unsubscribe.
import { api } from '../api.js'

function keyBytes(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

/** @returns {'unsupported' | 'needs-home-screen' | 'denied' | 'off' | 'on'} */
export async function pushStatus() {
  if (isIOS() && !isStandalone()) return 'needs-home-screen'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return subscription && Notification.permission === 'granted' ? 'on' : 'off'
}

function deviceLabel() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || isIOS()) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  return '브라우저'
}

export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? '알림이 차단되어 있습니다. 기기 설정에서 허용해 주세요' : '알림 허용을 받지 못했습니다')
  const { publicKey } = await api('/push/key')
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  if (existing) await existing.unsubscribe()
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  await api('/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON(), label: deviceLabel() } })
}

export async function disablePush() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } }).catch(() => {})
  await subscription.unsubscribe()
}
