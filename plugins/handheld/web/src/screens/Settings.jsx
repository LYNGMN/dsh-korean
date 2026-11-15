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
import { hasText, LANGS, t } from '../lib/i18n.js'
import { BUSY_ENTER_STORAGE, ENTER_KEY_STORAGE, voiceSupported } from '../components/Composer.jsx'

const PUSH_TEXT = { 'needs-home-screen': 'push.needsHome', unsupported: 'push.unsupported', denied: 'push.denied', off: 'push.off', on: 'push.on' }
const UPSTREAM_TEXT = { connected: 'conn.connected', connecting: 'conn.connecting', down: 'conn.down' }

// Choices are [value, text key or literal name, icon?]; notes map a value to its text key.
const ENTER_KEY_CHOICES = [['send', 'enter.send'], ['newline', 'enter.newline']]
const BUSY_ENTER_CHOICES = [['queue', 'mode.queue'], ['steer', 'mode.steer']]
const THEME_CHOICES = [['auto', 'theme.auto', 'auto'], ['light', 'theme.light', 'sun'], ['dark', 'theme.dark', 'moon']]
const ACCENT_CHOICES = [['deepseek', 'accent.deepseek'], ['calm', 'accent.calm'], ['graphite', 'accent.graphite']]
const BUBBLE_CHOICES = [['soft', 'bubble.soft'], ['solid', 'bubble.solid']]
const FONT_CHOICES = [['bundled', 'Pretendard'], ['system', 'font.system']]
const TEXT_CHOICES = [['normal', 'text.normal'], ['large', 'text.large'], ['xlarge', 'text.xlarge']]
const DENSITY_CHOICES = [['cozy', 'density.cozy'], ['compact', 'density.compact']]
const REASONING_CHOICES = [['show', 'reasoning.show'], ['hide', 'reasoning.hide']]
const MOTION_CHOICES = [['normal', 'motion.normal'], ['reduced', 'motion.reduced']]
const notesOf = (group, values) => Object.fromEntries(values.map((value) => [value, `${group}.${value}Note`]))

/** One choice out of two or three, as a segmented radio group. */
function Choice({ id, label, value, choices, onChange, notes }) {
  const values = choices.map(([key]) => key)
  return (
    <div class="setting-choice">
      <span class="setting-choice-label" id={id}>{label}</span>
      <div class="segmented" style={{ '--segments': choices.length, '--i': Math.max(0, values.indexOf(value)) }} role="radiogroup" aria-labelledby={id}>
        <span class="seg-thumb" aria-hidden="true" />
        {choices.map(([key, text, icon]) => (
          <button key={key} type="button" {...radioProps(values, value, onChange, key)} class={`segment${value === key ? ' on' : ''}`}>
            {icon ? <Icon name={icon} size={18} /> : null}{hasText(text) ? t(text) : text}
          </button>
        ))}
      </div>
      {notes ? <p class="desc">{t(notes[value])}</p> : null}
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
  usePageTitle(t('settings.title'))

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
      toast(r.total === 0 ? t('push.testNone') : t('push.testSent', { sent: r.sent, total: r.total }))
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
        <button type="button" class="icon-btn" aria-label={t('nav.toList')} onClick={() => go('#/')}><Icon name="back" /></button>
        <div class="topbar-title"><h1 class="one-line" tabIndex={-1}>{t('settings.title')}</h1></div>
        <span class="topbar-spacer" />
      </header>
      <main class="page">
        <section class="card" aria-labelledby="push-title">
          <h2 id="push-title" class="card-title">{t('settings.push')}</h2>
          <p class="desc">{push ? t(PUSH_TEXT[push]) : t('settings.checking')}</p>
          {push === 'on' || push === 'off' ? (
            <div class="btn-grid">
              <button type="button" class={`btn ${push === 'on' ? 'btn-outline' : 'btn-primary'}`} disabled={busy} onClick={togglePush}>{push === 'on' ? t('push.turnOff') : t('push.turnOn')}</button>
              <button type="button" class="btn btn-outline" disabled={push !== 'on'} onClick={testPush}>{t('push.test')}</button>
            </div>
          ) : null}
          {settings ? (
            <div class="switch-row">
              <span class="switch-label" id="turn-end-label">{t('push.turnEnd')}</span>
              <button type="button" role="switch" aria-checked={settings.notifyTurnEnd} aria-labelledby="turn-end-label" class={`switch${settings.notifyTurnEnd ? ' on' : ''}`} onClick={toggleTurnEnd}><span class="switch-knob" /></button>
            </div>
          ) : null}
          {settings && push !== null && push !== 'on' ? <p class="desc">{t('push.needsOn')}</p> : null}
        </section>

        <section class="card" aria-labelledby="display-title">
          <h2 id="display-title" class="card-title">{t('settings.display')}</h2>
          <div class="setting-choice">
            <label class="setting-choice-label" for="lang-select">{t('lang.label')}</label>
            <div class="select-wrap">
              <select id="lang-select" class="select" value={prefs.lang} onChange={(e) => setPref('lang', e.currentTarget.value)}>
                {LANGS.map(([code, name]) => <option key={code} value={code} lang={code}>{name}</option>)}
              </select>
              <Icon name="chevron" size={18} />
            </div>
            <p class="desc">{t('lang.note')}</p>
          </div>
          <Choice id="theme-label" label={t('theme.label')} value={prefs.theme} choices={THEME_CHOICES} onChange={(v) => setPref('theme', v)} notes={notesOf('theme', ['auto', 'light', 'dark'])} />
          <Choice id="accent-label" label={t('accent.label')} value={prefs.accent} choices={ACCENT_CHOICES} onChange={(v) => setPref('accent', v)} notes={notesOf('accent', ['deepseek', 'calm', 'graphite'])} />
          <Choice id="bubble-label" label={t('bubble.label')} value={prefs.bubble} choices={BUBBLE_CHOICES} onChange={(v) => setPref('bubble', v)} notes={notesOf('bubble', ['soft', 'solid'])} />
          <Choice id="font-label" label={t('font.label')} value={prefs.font} choices={FONT_CHOICES} onChange={(v) => setPref('font', v)} notes={notesOf('font', ['bundled', 'system'])} />
          <Choice id="text-label" label={t('text.label')} value={prefs.text} choices={TEXT_CHOICES} onChange={(v) => setPref('text', v)} />
          <Choice id="density-label" label={t('density.label')} value={prefs.density} choices={DENSITY_CHOICES} onChange={(v) => setPref('density', v)} />
          <Choice id="reasoning-label" label={t('reasoning.label')} value={prefs.reasoning} choices={REASONING_CHOICES} onChange={(v) => setPref('reasoning', v)} />
          <Choice id="motion-label" label={t('motion.label')} value={prefs.motion} choices={MOTION_CHOICES} onChange={(v) => setPref('motion', v)} notes={notesOf('motion', ['normal', 'reduced'])} />
        </section>

        <section class="card" aria-labelledby="input-title">
          <h2 id="input-title" class="card-title">{t('settings.input')}</h2>
          <p class="desc">{voiceSupported() ? t('input.voiceOn') : t('input.voiceOff')}</p>
          <p class="desc">{t('input.drafts')}</p>
          <DeviceChoice id="enter-key-label" label={t('enter.label')} storageKey={ENTER_KEY_STORAGE} fallback={DEFAULT_ENTER_KEY} choices={ENTER_KEY_CHOICES} notes={notesOf('enter', ['send', 'newline'])} />
          <DeviceChoice id="busy-enter-label" label={t('mode.label')} storageKey={BUSY_ENTER_STORAGE} fallback="queue" choices={BUSY_ENTER_CHOICES} notes={notesOf('mode', ['queue', 'steer'])} />
          <p class="desc">{t('mode.keysNote')}</p>
        </section>

        <section class="card" aria-labelledby="conn-title">
          <h2 id="conn-title" class="card-title">{t('settings.conn')}</h2>
          <dl class="facts">
            <div><dt>{t('conn.account')}</dt><dd class="one-line">{me?.email ?? '—'}</dd></div>
            <div><dt>{t('conn.gateway')}</dt><dd>{socket === 'open' ? t('conn.connected') : t('conn.connecting')}</dd></div>
            <div><dt>DSH</dt><dd>{UPSTREAM_TEXT[upstream] ? t(UPSTREAM_TEXT[upstream]) : upstream}</dd></div>
            <div><dt>{t('conn.version')}</dt><dd>{me?.version ?? '—'}</dd></div>
          </dl>
        </section>
      </main>
    </div>
  )
}
