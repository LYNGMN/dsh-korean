// Notifications on this device, account and connection details.
import { useEffect, useState } from 'preact/hooks'
import { api } from '../api.js'
import { toast, useStore } from '../store.js'
import { disablePush, enablePush, pushStatus } from '../lib/push.js'
import { go } from '../lib/util.js'
import { Icon } from '../components/Icon.jsx'
import { voiceSupported } from '../components/Composer.jsx'

const PUSH_TEXT = {
  'needs-home-screen': 'iPhone·iPad는 홈 화면에 추가한 앱에서만 알림을 받을 수 있습니다(iOS 16.4 이상). Safari 공유 버튼 → "홈 화면에 추가" 후 그 아이콘으로 여세요.',
  unsupported: '이 브라우저는 알림을 지원하지 않습니다.',
  denied: '알림이 차단되어 있습니다. 기기 설정에서 이 앱의 알림을 허용해 주세요.',
  off: '꺼져 있습니다.',
  on: '켜져 있습니다. 승인 요청과 질문이 오면 알려 드립니다.',
}

const UPSTREAM_TEXT = { connected: '연결됨', connecting: '연결하는 중', down: '끊김' }

export function Settings() {
  const { me, socket, upstream } = useStore((s) => ({ me: s.me, socket: s.socket, upstream: s.upstream }))
  const [push, setPush] = useState(null)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    pushStatus().then(setPush).catch(() => setPush('unsupported'))
    api('/settings').then(setSettings).catch(() => {})
  }, [])

  const togglePush = async () => {
    setBusy(true)
    try {
      if (push === 'on') await disablePush()
      else await enablePush()
      setPush(await pushStatus())
    } catch (error) {
      toast(error.message, { tone: 'error' })
      setPush(await pushStatus().catch(() => 'unsupported'))
    } finally {
      setBusy(false)
    }
  }

  const testPush = async () => {
    try {
      const r = await api('/push/test', { method: 'POST', body: {} })
      toast(r.total === 0 ? '알림을 받을 기기가 없습니다' : `기기 ${String(r.sent)}/${String(r.total)}곳에 보냈습니다`)
    } catch (error) {
      toast(error.message, { tone: 'error' })
    }
  }

  const toggleTurnEnd = async () => {
    try {
      setSettings(await api('/settings', { method: 'POST', body: { notifyTurnEnd: !settings.notifyTurnEnd } }))
    } catch (error) {
      toast(error.message, { tone: 'error' })
    }
  }

  return (
    <div class="screen">
      <header class="topbar">
        <button type="button" class="icon-btn" aria-label="세션 목록" onClick={() => go('#/')}><Icon name="back" /></button>
        <div class="topbar-title"><h1 class="one-line">설정</h1></div>
        <span class="topbar-spacer" />
      </header>
      <main class="page">
        <section class="card" aria-labelledby="push-title">
          <h2 id="push-title" class="card-title">알림</h2>
          <p class="desc">{push ? PUSH_TEXT[push] : '확인하는 중…'}</p>
          {push === 'on' || push === 'off' ? (
            <div class="btn-grid">
              <button type="button" class={`btn ${push === 'on' ? 'btn-outline' : 'btn-primary'}`} disabled={busy} onClick={togglePush}>{push === 'on' ? '알림 끄기' : '알림 켜기'}</button>
              <button type="button" class="btn btn-outline" disabled={push !== 'on'} onClick={testPush}>시험 알림</button>
            </div>
          ) : null}
          {settings ? (
            <div class="switch-row">
              <span class="switch-label" id="turn-end-label">작업이 끝나면 알리기</span>
              <button type="button" role="switch" aria-checked={settings.notifyTurnEnd} aria-labelledby="turn-end-label" class={`switch${settings.notifyTurnEnd ? ' on' : ''}`} onClick={toggleTurnEnd}><span class="switch-knob" /></button>
            </div>
          ) : null}
        </section>

        <section class="card" aria-labelledby="input-title">
          <h2 id="input-title" class="card-title">입력</h2>
          <p class="desc">{voiceSupported() ? '입력창의 마이크 버튼으로 한국어 음성 입력을 쓸 수 있습니다.' : '이 브라우저에는 음성 입력 버튼이 없습니다. 키보드의 받아쓰기(마이크) 버튼을 쓰세요.'}</p>
          <p class="desc">휴대폰에서는 Enter가 줄바꿈입니다. 보내기는 화살표 버튼으로 합니다. 쓰던 글은 세션마다 저장됩니다.</p>
        </section>

        <section class="card" aria-labelledby="conn-title">
          <h2 id="conn-title" class="card-title">연결</h2>
          <dl class="facts">
            <div><dt>계정</dt><dd class="one-line">{me?.email ?? '—'}</dd></div>
            <div><dt>게이트웨이</dt><dd>{socket === 'open' ? '연결됨' : '연결하는 중'}</dd></div>
            <div><dt>DSH</dt><dd>{UPSTREAM_TEXT[upstream] ?? upstream}</dd></div>
            <div><dt>버전</dt><dd>{me?.version ?? '—'}</dd></div>
          </dl>
        </section>
      </main>
    </div>
  )
}
