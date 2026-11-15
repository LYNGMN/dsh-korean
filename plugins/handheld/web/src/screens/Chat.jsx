// One session: history (older pages on demand), live updates, streaming reply,
// pending approval banner, composer. Restores the reading position per session.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api, sessionPath } from '../api.js'
import { unwatchSession, watchSession } from '../live.js'
import { feedOf, mergeItems, toast, update, useStore } from '../store.js'
import { Markdown } from '../lib/markdown.jsx'
import { baseName, go, storageGet, storageSet, subagentParent, usePageTitle } from '../lib/util.js'
import { Composer } from '../components/Composer.jsx'
import { Icon } from '../components/Icon.jsx'
import { buildRows, ItemView } from '../components/ItemView.jsx'
import { Sheet } from '../components/Sheet.jsx'
import { t } from '../lib/i18n.js'
import { pendingStripText } from '../lib/pending.js'

const NEAR_BOTTOM_PX = 120

async function loadOlder(sessionId) {
  const feed = feedOf(sessionId)
  if (feed.loadingOlder || !feed.hasMore || feed.items.length === 0) return
  update(() => { feed.loadingOlder = true })
  try {
    const page = await api(`${sessionPath(sessionId)}/history?before=${String(feed.items[0].seq)}`)
    update(() => {
      mergeItems(feed, page.items)
      feed.hasMore = page.hasMore
    })
  } catch (error) {
    toast(t('chat.olderFailed', { error: error.message }), { tone: 'error' })
  } finally {
    update(() => { feed.loadingOlder = false })
  }
}

function useRows(items) {
  const cache = useRef(new Map())
  return useMemo(() => {
    const built = buildRows(items, cache.current)
    cache.current = built.cache
    return built.rows
  }, [items])
}

const SUBAGENT_STATE = { running: 'state.running', done: 'state.done', stopped: 'state.stopped', idle: 'state.idle' }
const SUBAGENT_POLL_MS = 8000

/** Subagents of a session; asked again while it works, since new ones appear mid-turn. */
function useSubagents(sessionId, running, enabled) {
  const [items, setItems] = useState([])
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    const load = () => api(`${sessionPath(sessionId)}/subagents`).then((r) => {
      if (!alive) return
      setItems(r.items)
      update((s) => { for (const item of r.items) s.subagentTitles[item.id] = item.title })
    }).catch(() => {})
    void load()
    const timer = running ? setInterval(load, SUBAGENT_POLL_MS) : null
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [sessionId, running, enabled])
  return items
}

function SubagentSheet({ items, onClose }) {
  return (
    <Sheet title={t('sub.title')} onClose={onClose}>
      <p class="muted small">{t('sub.sheetNote')}</p>
      <ul class="list sub-list">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" class="row" data-qa-multiline onClick={() => { onClose(); go(`#/s/${encodeURIComponent(item.id)}`) }}>
              <span class="row-main">
                <span class="row-title one-line">{item.title}</span>
              </span>
              <span class={`badge ${item.state === 'running' ? 'badge-run' : 'badge-quiet'}`}>{item.state === 'running' ? <span class="dot dot-run" aria-hidden="true" /> : null}{SUBAGENT_STATE[item.state] ? t(SUBAGENT_STATE[item.state]) : item.state}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

function StreamBubble({ stream }) {
  if (!stream) return null
  return (
    <div class="msg msg-assistant msg-stream" aria-live="off">
      {stream.text ? <Markdown text={stream.text} /> : <p class="muted">{stream.tool ? t('stream.tool', { tool: stream.tool }) : stream.reasoning ? t('stream.thinking') : t('stream.writing')}</p>}
      {!stream.ended ? <span class="typing" aria-hidden="true" /> : null}
    </div>
  )
}

export function Chat({ sessionId }) {
  const parentId = subagentParent(sessionId)
  const { row, feed, pending, subTitle } = useStore((s) => ({
    row: s.sessions.find((r) => r.id === sessionId),
    subTitle: s.subagentTitles[sessionId],
    feed: s.feeds[sessionId] ?? feedOf(sessionId),
    pending: s.pending.filter((p) => p.sessionId === sessionId),
  }))
  const rows = useRows(feed.items)
  const scroller = useRef(null)
  const stick = useRef(true)
  const restored = useRef(false)
  const prevHeight = useRef(0)
  const [showDown, setShowDown] = useState(false)
  const [far, setFar] = useState(false)
  const running = row?.running === true
  const subagents = useSubagents(sessionId, running, parentId === null)
  const [showSubagents, setShowSubagents] = useState(false)
  const activeSubagents = subagents.filter((s) => s.state === 'running').length
  const [announcement, setAnnouncement] = useState('')
  const before = useRef({ running, waiting: pending.length })

  // Screen readers do not see the status dot or the request strip appear.
  useEffect(() => {
    const was = before.current
    before.current = { running, waiting: pending.length }
    if (pending.length > was.waiting) setAnnouncement(t('chat.announcePending', { count: pending.length }))
    else if (running && !was.running) setAnnouncement(t('chat.started'))
    else if (!running && was.running) setAnnouncement(t('chat.finished'))
  }, [running, pending.length])

  useEffect(() => {
    watchSession(sessionId)
    return () => unwatchSession(sessionId)
  }, [sessionId])

  // Restore where this person stopped reading, once the first items are in.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || restored.current || !feed.synced) return
    restored.current = true
    const saved = storageGet(`scroll:${sessionId}`, null)
    const target = saved && !saved.atBottom ? el.querySelector(`[data-seq="${String(saved.seq)}"]`) : null
    if (target) {
      el.scrollTop = target.offsetTop - 8
      stick.current = false
    } else {
      el.scrollTop = el.scrollHeight
    }
    prevHeight.current = el.scrollHeight
  }, [feed.synced, rows])

  // Keep the newest content in view while reading at the bottom; keep the
  // position steady when older pages are added above.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !restored.current) return
    const grew = el.scrollHeight - prevHeight.current
    if (stick.current) el.scrollTop = el.scrollHeight
    else if (feed.loadingOlder === false && grew > 0 && el.scrollTop < 200) el.scrollTop += grew
    else if (grew > 0) setShowDown(true)
    prevHeight.current = el.scrollHeight
  }, [rows, feed.stream])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = fromBottom < NEAR_BOTTOM_PX
    stick.current = atBottom
    // More than half a screen up: keep a way down to the newest content on screen.
    setFar(fromBottom > el.clientHeight / 2)
    if (atBottom) setShowDown(false)
    if (el.scrollTop < 300 && feed.hasMore && !feed.loadingOlder) void loadOlder(sessionId)
    clearTimeout(onScroll.timer)
    onScroll.timer = setTimeout(() => {
      const top = [...el.querySelectorAll('[data-seq]')].find((node) => node.offsetTop + node.offsetHeight > el.scrollTop)
      storageSet(`scroll:${sessionId}`, { atBottom, seq: top ? Number(top.dataset.seq) : null })
    }, 250)
  }

  const toBottom = () => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    stick.current = true
    setShowDown(false)
    setFar(false)
  }

  const cancel = async () => {
    try {
      await api(`${sessionPath(sessionId)}/cancel`, { method: 'POST', body: {} })
      toast(t('chat.stopAsked'))
    } catch (error) {
      toast(t('chat.stopFailed', { error: error.message }), { tone: 'error' })
    }
  }

  const title = parentId ? subTitle ?? t('sub.title') : row?.title ?? t('session.fallback')
  usePageTitle(title)
  return (
    <div class="screen chat">
      <header class="topbar">
        <button type="button" class="icon-btn" aria-label={parentId ? t('nav.toParent') : t('nav.toList')} onClick={() => go(parentId ? `#/s/${encodeURIComponent(parentId)}` : '#/')}><Icon name="back" /></button>
        <div class="topbar-title">
          <h1 class="one-line" tabIndex={-1}>{title}</h1>
          <p class="topbar-sub one-line">
            {parentId ? t('sub.badge') : running ? <><span class="dot dot-run" aria-hidden="true" />{t('state.running')}</> : t('state.idle')}
            {row?.cwd ? ` · ${baseName(row.cwd)}` : ''}
          </p>
        </div>
        {running ? <button type="button" class="btn btn-small btn-outline" onClick={cancel}>{t('chat.stop')}</button> : <span class="topbar-spacer" />}
      </header>

      {pending.length > 0 ? (
        <div class="pending-strip">
          {pending.map((p) => (
            <button type="button" class="pending-btn" key={p.id} onClick={() => update((s) => { s.openPending = p.id })}>
              <Icon name={p.kind === 'approval' ? 'shield' : 'question'} size={18} />
              <span class="one-line">{pendingStripText(p)}</span>
              <span class="pending-go">{t('view')}</span>
            </button>
          ))}
        </div>
      ) : null}

      {subagents.length > 0 ? (
        <div class="sub-strip">
          <button type="button" class="sub-btn" onClick={() => setShowSubagents(true)}>
            <Icon name="branch" size={18} />
            <span class="one-line">{activeSubagents > 0 ? t('sub.stripActive', { count: subagents.length, active: activeSubagents }) : t('sub.strip', { count: subagents.length })}</span>
            <span class="pending-go">{t('view')}</span>
          </button>
        </div>
      ) : null}

      <div class="messages-wrap">
      <main class="messages" ref={scroller} onScroll={onScroll} aria-label={t('chat.label')} aria-busy={!feed.synced}>
        {feed.hasMore && feed.items.length > 0 ? (
          <div class="older">
            <button type="button" class="btn btn-small btn-ghost" disabled={feed.loadingOlder} onClick={() => loadOlder(sessionId)}>
              {feed.loadingOlder ? t('loading') : t('chat.older')}
            </button>
          </div>
        ) : null}
        {!feed.synced ? <p class="muted center pad">{t('loading')}</p> : null}
        {feed.synced && rows.length === 0 && !feed.stream ? <p class="muted center pad">{parentId ? t('chat.emptySub') : t('chat.empty')}</p> : null}
        {rows.map((r) => <ItemView key={r.key} row={r} />)}
        <StreamBubble stream={feed.stream} />
      </main>
      {showDown || far ? (
        <button type="button" class="down-btn" onClick={toBottom}><Icon name="down" size={18} />{showDown ? t('chat.newContent') : t('chat.toBottom')}</button>
      ) : null}
      </div>

      <p class="visually-hidden" role="status">{announcement}</p>
      {parentId ? <p class="view-only">{t('sub.viewOnly')}</p> : <Composer sessionId={sessionId} running={running} />}
      {showSubagents ? <SubagentSheet items={subagents} onClose={() => setShowSubagents(false)} /> : null}
    </div>
  )
}
