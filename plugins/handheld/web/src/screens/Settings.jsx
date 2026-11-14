// Notifications on this device, account and connection details.
import { useEffect, useState } from 'preact/hooks'
import { api } from '../api.js'
import { toast, useStore } from '../store.js'
import { disablePush, enablePush, pushStatus } from '../lib/push.js'
import { setPref } from '../lib/prefs.js'
import { go, storageGet, storageSet, usePageTitle } from '../lib/util.js'
import { radioProps } from '../lib/radio.js'
import { DEFAULT_ENTER_KEY } from '../lib/enter-keys.js'
import { Icon } from '../components/Icon.jsx'
import { BUSY_ENTER_STORAGE, ENTER_KEY_STORAGE, voiceSupported } from '../components/Composer.jsx'

const PUSH_TEXT = {
  'needs-home-screen': 'iPhone·iPad는 홈 화면에 추가한 앱에서만 알림을 받을 수 있습니다(iOS 16.4 이상). Safari 공유 버튼 → "홈 화면에 추가" 후 그 아이콘으로 여세요.',
  unsupported: '이 브라우저는 알림을 지원하지 않습니다.',
  denied: '알림이 차단되어 있습니다. 기기 설정에서 이 앱의 알림을 허용해 주세요.',
  off: '꺼져 있습니다.',
  on: '켜져 있습니다. 승인 요청과 질문이 오면 알려 드립니다.',
}

const UPSTREAM_TEXT = { connected: '연결됨', connecting: '연결하는 중', down: '끊김' }

const ENTER_KEY_CHOICES = [['send', '바로 보내기'], ['newline', '줄바꿈']]
const BUSY_ENTER_CHOICES = [['queue', '대기열'], ['steer', '끼어들기']]

const ENTER_KEY_TEXT = {
  send: 'Enter는 보내기, Shift+Enter는 줄바꿈입니다. 한글을 쓰는 중에도 Enter 한 번이면 보냅니다.',
  newline: 'Enter는 줄바꿈입니다. 보내기는 화살표 버튼이나 Cmd/Ctrl+Enter로 합니다.',
}

const THEME_CHOICES = [['auto', '자동', 'auto'], ['light', '밝게', 'sun'], ['dark', '어둡게', 'moon']]
const ACCENT_CHOICES = [['deepseek', '딥시크'], ['calm', '남색'], ['graphite', '회색']]
const BUBBLE_CHOICES = [['soft', '은은하게'], ['solid', '선명하게']]
const ACCENT_TEXT = {
  deepseek: 'DeepSeek 파랑으로 단추와 선택을 표시합니다.',
  calm: '채도를 낮춘 남색입니다. 오래 봐도 덜 피로합니다.',
  graphite: '색을 거의 쓰지 않는 회색입니다.',
}
const BUBBLE_TEXT = {
  soft: '내 글을 옅은 바탕에 보통 글자색으로 보여 줍니다.',
  solid: '내 글을 강조 색으로 채워 또렷하게 보여 줍니다.',
}
const FONT_CHOICES = [['bundled', 'Pretendard'], ['system', '기기 글꼴']]
const FONT_TEXT = {
  bundled: '어느 기기에서나 같은 글꼴로 보입니다. 글은 Pretendard, 코드는 D2Coding입니다.',
  system: '이 기기의 기본 글꼴로 보입니다. 글꼴 파일을 내려받지 않습니다.',
}
const TEXT_CHOICES = [['normal', '보통'], ['large', '크게'], ['xlarge', '아주 크게']]
const DENSITY_CHOICES = [['cozy', '넉넉하게'], ['compact', '촘촘하게']]
const REASONING_CHOICES = [['show', '보이기'], ['hide', '숨기기']]

const THEME_TEXT = {
  auto: '기기 설정을 따라 밝음과 어두움이 바뀝니다.',
  light: '늘 밝은 화면으로 봅니다.',
  dark: '늘 어두운 화면으로 봅니다.',
}

/** One choice out of two or three, as a segmented radio group. */
function Choice({ id, label, value, choices, onChange, notes }) {
  const values = choices.map(([key]) => key)
  return (
    <div class="setting-choice">
      <span class="setting-choice-label" id={id}>{label}</span>
      <div class="segmented" style={{ '--segments': choices.length }} role="radiogroup" aria-labelledby={id}>
        {choices.map(([key, text, icon]) => (
          <button key={key} type="button" {...radioProps(values, value, onChange, key)} class={`segment${value === key ? ' on' : ''}`}>
            {icon ? <Icon name={icon} size={18} /> : null}{text}
          </button>
        ))}
      </div>
      {notes ? <p class="desc">{notes[value]}</p> : null}
    </div>
  )
}

/** A choice stored under its own key and read where it is used (the composer). */
function DeviceChoice({ storageKey, fallback, ...rest }) {
  const [value, setValue] = useState(() => storageGet(storageKey, fallback))
  const choose = (next) => {
    setValue(next)
    storageSet(storageKey, next)
  }
  return <Choice {...rest} value={value} onChange={choose} />
}

export function Settings() {
  const { me, socket, upstream, prefs } = useStore((s) => ({ me: s.me, socket: s.socket, upstream: s.upstream, prefs: s.prefs }))
  const [push, setPush] = useState(null)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState(null)
  usePageTitle('설정')

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
        <div class="topbar-title"><h1 class="one-line" tabIndex={-1}>설정</h1></div>
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
          {settings && push !== null && push !== 'on' ? <p class="desc">이 기기의 알림을 켜야 받을 수 있습니다.</p> : null}
        </section>

        <section class="card" aria-labelledby="display-title">
          <h2 id="display-title" class="card-title">화면</h2>
          <Choice id="theme-label" label="테마" value={prefs.theme} choices={THEME_CHOICES} onChange={(v) => setPref('theme', v)} notes={THEME_TEXT} />
          <Choice id="accent-label" label="강조 색" value={prefs.accent} choices={ACCENT_CHOICES} onChange={(v) => setPref('accent', v)} notes={ACCENT_TEXT} />
          <Choice id="bubble-label" label="내 글 말풍선" value={prefs.bubble} choices={BUBBLE_CHOICES} onChange={(v) => setPref('bubble', v)} notes={BUBBLE_TEXT} />
          <Choice id="font-label" label="글꼴" value={prefs.font} choices={FONT_CHOICES} onChange={(v) => setPref('font', v)} notes={FONT_TEXT} />
          <Choice id="text-label" label="대화 글자 크기" value={prefs.text} choices={TEXT_CHOICES} onChange={(v) => setPref('text', v)} />
          <Choice id="density-label" label="대화 간격" value={prefs.density} choices={DENSITY_CHOICES} onChange={(v) => setPref('density', v)} />
          <Choice id="reasoning-label" label="생각 과정" value={prefs.reasoning} choices={REASONING_CHOICES} onChange={(v) => setPref('reasoning', v)} />
        </section>

        <section class="card" aria-labelledby="input-title">
          <h2 id="input-title" class="card-title">입력</h2>
          <p class="desc">{voiceSupported() ? '입력창의 마이크 버튼으로 한국어 음성 입력을 쓸 수 있습니다.' : '이 브라우저에는 음성 입력 버튼이 없습니다. 키보드의 받아쓰기(마이크) 버튼을 쓰세요.'}</p>
          <p class="desc">쓰던 글은 세션마다 저장됩니다.</p>
          <DeviceChoice id="enter-key-label" label="Enter를 누르면" storageKey={ENTER_KEY_STORAGE} fallback={DEFAULT_ENTER_KEY} choices={ENTER_KEY_CHOICES} notes={ENTER_KEY_TEXT} />
          <DeviceChoice id="busy-enter-label" label="작업 중에 보내는 방식" storageKey={BUSY_ENTER_STORAGE} fallback="queue" choices={BUSY_ENTER_CHOICES} />
          <p class="desc">작업 중에는 Enter가 고른 방식으로, Cmd/Ctrl+Enter가 반대 방식으로 보냅니다. 입력창 위 단추로 그때그때 바꿀 수도 있습니다.</p>
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
