// App-wide strips: connection banner and toasts.
import { useStore } from '../store.js'
import { t } from '../lib/i18n.js'

export function ConnectionBanner() {
  const { socket, upstream, authExpired } = useStore((s) => ({ socket: s.socket, upstream: s.upstream, authExpired: s.authExpired }))
  let message = null
  let action = null
  if (authExpired) {
    message = t('banner.expired')
    action = <button type="button" class="btn btn-small" onClick={() => location.reload()}>{t('banner.relogin')}</button>
  } else if (socket !== 'open') {
    message = t('banner.gateway')
  } else if (upstream !== 'connected') {
    message = t('banner.dsh')
  }
  return (
    <div class="banner-slot" role="status" aria-live="polite">
      {message ? (
        <div class={`banner${authExpired ? ' banner-warn' : ''}`}>
          <span class="dot dot-wait" aria-hidden="true" />
          <span class="banner-text">{message}</span>
          {action}
        </div>
      ) : null}
    </div>
  )
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div class="toasts">
      <div class="toast-group" role="status" aria-live="polite">
        {toasts.filter((t) => t.tone !== 'error').map((t) => <p key={t.id} class={`toast toast-${t.tone}`}>{t.message}</p>)}
      </div>
      <div class="toast-group" role="alert">
        {toasts.filter((t) => t.tone === 'error').map((t) => <p key={t.id} class={`toast toast-${t.tone}`}>{t.message}</p>)}
      </div>
    </div>
  )
}
