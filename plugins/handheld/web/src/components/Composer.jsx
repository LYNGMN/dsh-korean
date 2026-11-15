// Message input. Enter follows the user's setting (send by default, including the Enter that
// commits a Korean syllable); Shift+Enter breaks the line. Drafts survive reloads per session.
import { useEffect, useRef, useState } from 'preact/hooks'
import { api, sessionPath } from '../api.js'
import { toast } from '../store.js'
import { storageGet, storageSet } from '../lib/util.js'
import { DEFAULT_ENTER_KEY, enterAction, lineBreakAction } from '../lib/enter-keys.js'
import { radioProps } from '../lib/radio.js'
import { Icon } from './Icon.jsx'
import { imeConfirmsWithEnter, speechLang, t } from '../lib/i18n.js'

export const ENTER_KEY_STORAGE = 'enter-key'
export const BUSY_ENTER_STORAGE = 'busy-enter'
const MODES = ['queue', 'steer']
const otherMode = (mode) => (mode === 'queue' ? 'steer' : 'queue')
// A line break this soon after an Enter keydown belongs to that keydown.
const KEY_LINE_BREAK_MS = 100

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined
export const voiceSupported = () => Boolean(Recognition)

function useVoice(onText) {
  const [listening, setListening] = useState(false)
  const rec = useRef(null)
  useEffect(() => () => rec.current?.abort(), [])
  const toggle = (base) => {
    if (listening) {
      rec.current?.stop()
      return
    }
    const r = new Recognition()
    r.lang = speechLang()
    r.interimResults = true
    r.continuous = true
    r.onresult = (event) => {
      let heard = ''
      for (const result of event.results) heard += result[0].transcript
      const glue = base && !/\s$/.test(base) ? ' ' : ''
      onText(base + glue + heard.trim())
    }
    r.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') toast(t('voice.denied'), { tone: 'error' })
      else if (event.error !== 'aborted' && event.error !== 'no-speech') toast(t('voice.failed'), { tone: 'error' })
    }
    r.onend = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }
  return { listening, toggle }
}

export function Composer({ sessionId, running }) {
  const draftKey = `draft:${sessionId}`
  const [text, setText] = useState(() => storageGet(draftKey, ''))
  const [mode, setMode] = useState(() => storageGet(BUSY_ENTER_STORAGE, 'queue'))
  const [enterKey] = useState(() => storageGet(ENTER_KEY_STORAGE, DEFAULT_ENTER_KEY))
  const [sending, setSending] = useState(false)
  const inFlight = useRef(false)
  const composing = useRef(false)
  const compositionEndAt = useRef(-Infinity)
  const lastEnterKey = useRef({ action: null, at: -Infinity })
  const sendAfterCompose = useRef(null)
  const area = useRef(null)
  const voice = useVoice((value) => setText(value))

  useEffect(() => {
    const timer = setTimeout(() => storageSet(draftKey, text), 300)
    return () => clearTimeout(timer)
  }, [text, draftKey])

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    const borders = el.offsetHeight - el.clientHeight
    el.style.height = `${String(Math.min(el.scrollHeight + borders, Math.round(window.innerHeight * 0.4)))}px`
  }, [text])

  const send = async (chosen = mode) => {
    // A Korean syllable still being composed is not in the value yet: wait for it.
    if (composing.current) {
      sendAfterCompose.current = chosen
      return
    }
    const value = (area.current?.value ?? text).trim()
    // Some IMEs deliver the committing Enter twice; the ref stops a second send of the same text.
    if (!value || inFlight.current) return
    inFlight.current = true
    setSending(true)
    try {
      await api(`${sessionPath(sessionId)}/prompt`, { method: 'POST', body: { text: value, mode: running ? chosen : 'queue' } })
      // Keep anything typed while the request was in flight.
      if ((area.current?.value ?? '').trim() === value) {
        setText('')
        storageSet(draftKey, '')
      }
    } catch (error) {
      toast(t('sendFailed', { error: error.message }), { tone: 'error' })
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  const onKeyDown = (e) => {
    const decided = enterAction({
      key: e.key, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey,
      keyCode: e.keyCode, isComposing: e.isComposing, composing: composing.current,
      msSinceCompositionEnd: performance.now() - compositionEndAt.current, enterKey, imeConfirms: imeConfirmsWithEnter(),
    })
    if (decided.action === 'none') return
    lastEnterKey.current = { action: decided.action, at: performance.now() }
    if (decided.action === 'newline') return
    const chosen = decided.other ? otherMode(mode) : mode
    // Let the IME commit the syllable; compositionend sends it.
    if (decided.afterCompose) {
      sendAfterCompose.current = chosen
      return
    }
    e.preventDefault()
    void send(chosen)
  }

  const onBeforeInput = (e) => {
    const recent = performance.now() - lastEnterKey.current.at < KEY_LINE_BREAK_MS
    const decided = lineBreakAction({ inputType: e.inputType, enterKey, keyAction: recent ? lastEnterKey.current.action : null })
    if (decided === 'allow') return
    e.preventDefault()
    if (decided === 'send') void send(mode)
  }

  return (
    <form class="composer" onSubmit={(e) => { e.preventDefault(); void send(mode) }}>
      {running ? (
        <div class="mode" style={{ '--i': MODES.indexOf(mode) }} role="radiogroup" aria-label={t('mode.label')}>
          <span class="seg-thumb" aria-hidden="true" />
          {MODES.map((value) => (
            <button key={value} type="button" {...radioProps(MODES, mode, setMode, value)} class={`mode-btn${mode === value ? ' on' : ''}`}>
              <span class="mode-name">{t(`mode.${value}`)}</span>
              <span class="mode-hint">{t(`mode.${value}Hint`)}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div class="composer-row">
        <label class="visually-hidden" for="composer-input">{t('composer.label')}</label>
        <textarea
          id="composer-input"
          ref={area}
          rows={1}
          value={text}
          placeholder={t('composer.placeholder')}
          enterKeyHint={enterKey === 'send' ? 'send' : 'enter'}
          autocomplete="off"
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onbeforeinput={onBeforeInput}
          oncompositionstart={() => { composing.current = true }}
          oncompositionend={(e) => {
            composing.current = false
            compositionEndAt.current = performance.now()
            setText(e.currentTarget.value)
            const chosen = sendAfterCompose.current
            if (chosen) {
              sendAfterCompose.current = null
              setTimeout(() => void send(chosen), 0)
            }
          }}
        />
        {voiceSupported() ? (
          <button type="button" class={`icon-btn round${voice.listening ? ' listening' : ''}`} aria-pressed={voice.listening} aria-label={voice.listening ? t('voice.stop') : t('voice.start')} onClick={() => voice.toggle(text)}>
            <Icon name={voice.listening ? 'stop' : 'mic'} />
          </button>
        ) : null}
        <button type="submit" class="icon-btn round primary" aria-label={t('send')} disabled={sending || text.trim().length === 0}>
          {sending ? <span class="spinner light" aria-hidden="true" /> : <Icon name="send" />}
        </button>
      </div>
    </form>
  )
}
