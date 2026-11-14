// App-wide strips: connection banner and toasts.
import { useStore } from '../store.js'

export function ConnectionBanner() {
  const { socket, upstream, authExpired } = useStore((s) => ({ socket: s.socket, upstream: s.upstream, authExpired: s.authExpired }))
  let message = null
  let action = null
  if (authExpired) {
    message = '로그인 시간이 끝났습니다.'
    action = <button type="button" class="btn btn-small" onClick={() => location.reload()}>다시 로그인</button>
  } else if (socket !== 'open') {
    message = '게이트웨이에 연결하는 중입니다…'
  } else if (upstream !== 'connected') {
    message = 'DSH에 연결하는 중입니다. Desktop이 켜져 있는지 확인해 주세요.'
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
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <p key={t.id} class={`toast toast-${t.tone}`}>{t.message}</p>)}
    </div>
  )
}
