// Message input. Never sends while an IME is composing; on touch devices Enter
// is a newline and only the button sends. Drafts survive reloads per session.
import { useEffect, useRef, useState } from 'preact/hooks'
import { api, sessionPath } from '../api.js'
import { toast } from '../store.js'
import { isTouch, storageGet, storageSet } from '../lib/util.js'
import { Icon } from './Icon.jsx'

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
    r.lang = 'ko-KR'
    r.interimResults = true
    r.continuous = true
    r.onresult = (event) => {
      let heard = ''
      for (const result of event.results) heard += result[0].transcript
      const glue = base && !/\s$/.test(base) ? ' ' : ''
      onText(base + glue + heard.trim())
    }
    r.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') toast('마이크 사용이 허용되지 않았습니다', { tone: 'error' })
      else if (event.error !== 'aborted' && event.error !== 'no-speech') toast('음성을 알아듣지 못했습니다', { tone: 'error' })
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
  const [mode, setMode] = useState('queue')
  const [sending, setSending] = useState(false)
  const composing = useRef(false)
  const sendAfterCompose = useRef(false)
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

  const send = async () => {
    // A Korean syllable still being composed is not in the value yet: wait for it.
    if (composing.current) {
      sendAfterCompose.current = true
      return
    }
    const value = (area.current?.value ?? text).trim()
    if (!value || sending) return
    setSending(true)
    try {
      await api(`${sessionPath(sessionId)}/prompt`, { method: 'POST', body: { text: value, mode: running ? mode : 'queue' } })
      setText('')
      storageSet(draftKey, '')
    } catch (error) {
      toast(`보내지 못했습니다: ${error.message}`, { tone: 'error' })
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.isComposing || e.keyCode === 229 || composing.current) return
    if (e.key === 'Enter' && !e.shiftKey && !isTouch()) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <form class="composer" onSubmit={(e) => { e.preventDefault(); void send() }}>
      {running ? (
        <div class="mode" role="radiogroup" aria-label="보내는 방식">
          {[['queue', '대기열', '지금 일이 끝난 뒤 이어서'], ['steer', '끼어들기', '지금 하는 일에 바로 반영']].map(([value, label, hint]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} class={`mode-btn${mode === value ? ' on' : ''}`} onClick={() => setMode(value)} title={hint}>
              {label}
            </button>
          ))}
          <span class="mode-hint muted small">{mode === 'queue' ? '지금 일이 끝난 뒤 이어서 보냅니다' : '지금 하는 일에 바로 반영합니다'}</span>
        </div>
      ) : null}
      <div class="composer-row">
        <label class="visually-hidden" for="composer-input">보낼 글</label>
        <textarea
          id="composer-input"
          ref={area}
          rows={1}
          value={text}
          placeholder="DSH에게 보낼 글"
          enterKeyHint="enter"
          autocomplete="off"
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={(e) => {
            composing.current = false
            setText(e.currentTarget.value)
            if (sendAfterCompose.current) {
              sendAfterCompose.current = false
              setTimeout(() => void send(), 0)
            }
          }}
        />
        {voiceSupported() ? (
          <button type="button" class={`icon-btn round${voice.listening ? ' listening' : ''}`} aria-pressed={voice.listening} aria-label={voice.listening ? '음성 입력 멈추기' : '음성으로 입력'} onClick={() => voice.toggle(text)}>
            <Icon name={voice.listening ? 'stop' : 'mic'} />
          </button>
        ) : null}
        <button type="submit" class="icon-btn round primary" aria-label="보내기" disabled={sending || text.trim().length === 0}>
          {sending ? <span class="spinner light" aria-hidden="true" /> : <Icon name="send" />}
        </button>
      </div>
    </form>
  )
}
