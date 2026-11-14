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
    toast(`이전 기록을 불러오지 못했습니다: ${error.message}`, { tone: 'error' })
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

const SUBAGENT_STATE = { running: '실행 중', done: '끝남', stopped: '중단됨', idle: '대기 중' }
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
    <Sheet title="하위 에이전트" onClose={onClose}>
      <p class="muted small">이 세션이 맡긴 일의 대화입니다. 보기만 할 수 있습니다.</p>
      <ul class="list sub-list">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" class="row" data-qa-multiline onClick={() => { onClose(); go(`#/s/${encodeURIComponent(item.id)}`) }}>
              <span class="row-main">
                <span class="row-title one-line">{item.title}</span>
              </span>
              <span class={`badge ${item.state === 'running' ? 'badge-run' : 'badge-quiet'}`}>{item.state === 'running' ? <span class="dot dot-run" aria-hidden="true" /> : null}{SUBAGENT_STATE[item.state] ?? item.state}</span>
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
      {stream.text ? <Markdown text={stream.text} /> : <p class="muted">{stream.tool ? `${stream.tool} 준비 중…` : stream.reasoning ? '생각하는 중…' : '답을 쓰는 중…'}</p>}
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
    if (pending.length > was.waiting) setAnnouncement(`답을 기다리는 요청이 ${String(pending.length)}건 있습니다`)
    else if (running && !was.running) setAnnouncement('작업을 시작했습니다')
    else if (!running && was.running) setAnnouncement('작업이 끝났습니다')
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
      toast('중단을 요청했습니다')
    } catch (error) {
      toast(`중단하지 못했습니다: ${error.message}`, { tone: 'error' })
    }
  }

  const title = parentId ? subTitle ?? '하위 에이전트' : row?.title ?? '세션'
  usePageTitle(title)
  return (
    <div class="screen chat">
      <header class="topbar">
        <button type="button" class="icon-btn" aria-label={parentId ? '부모 세션으로' : '세션 목록'} onClick={() => go(parentId ? `#/s/${encodeURIComponent(parentId)}` : '#/')}><Icon name="back" /></button>
        <div class="topbar-title">
          <h1 class="one-line" tabIndex={-1}>{title}</h1>
          <p class="topbar-sub one-line">
            {parentId ? '하위 에이전트 · 보기 전용' : running ? <><span class="dot dot-run" aria-hidden="true" />실행 중</> : '대기 중'}
            {row?.cwd ? ` · ${baseName(row.cwd)}` : ''}
          </p>
        </div>
        {running ? <button type="button" class="btn btn-small btn-outline" onClick={cancel}>중단</button> : <span class="topbar-spacer" />}
      </header>

      {pending.length > 0 ? (
        <div class="pending-strip">
          {pending.map((p) => (
            <button type="button" class="pending-btn" key={p.id} onClick={() => update((s) => { s.openPending = p.id })}>
              <Icon name={p.kind === 'approval' ? 'shield' : 'question'} size={18} />
              <span class="one-line">{p.kind === 'approval' ? `승인 요청 · ${p.tool}` : '질문에 답해 주세요'}</span>
              <span class="pending-go">보기</span>
            </button>
          ))}
        </div>
      ) : null}

      {subagents.length > 0 ? (
        <div class="sub-strip">
          <button type="button" class="sub-btn" onClick={() => setShowSubagents(true)}>
            <Icon name="branch" size={18} />
            <span class="one-line">하위 에이전트 {subagents.length}개{activeSubagents > 0 ? ` · 실행 중 ${String(activeSubagents)}` : ''}</span>
            <span class="pending-go">보기</span>
          </button>
        </div>
      ) : null}

      <div class="messages-wrap">
      <main class="messages" ref={scroller} onScroll={onScroll} aria-label="대화" aria-busy={!feed.synced}>
        {feed.hasMore && feed.items.length > 0 ? (
          <div class="older">
            <button type="button" class="btn btn-small btn-ghost" disabled={feed.loadingOlder} onClick={() => loadOlder(sessionId)}>
              {feed.loadingOlder ? '불러오는 중…' : '이전 기록 더 보기'}
            </button>
          </div>
        ) : null}
        {!feed.synced ? <p class="muted center pad">불러오는 중…</p> : null}
        {feed.synced && rows.length === 0 && !feed.stream ? <p class="muted center pad">{parentId ? '아직 기록이 없습니다.' : '아직 대화가 없습니다. 아래에서 첫 글을 보내 보세요.'}</p> : null}
        {rows.map((r) => <ItemView key={r.key} row={r} />)}
        <StreamBubble stream={feed.stream} />
      </main>
      {showDown || far ? (
        <button type="button" class="down-btn" onClick={toBottom}><Icon name="down" size={18} />{showDown ? '새 내용' : '맨 아래로'}</button>
      ) : null}
      </div>

      <p class="visually-hidden" role="status">{announcement}</p>
      {parentId ? <p class="view-only">하위 에이전트 대화는 보기만 할 수 있습니다. 지시는 부모 세션에서 보내 주세요.</p> : <Composer sessionId={sessionId} running={running} />}
      {showSubagents ? <SubagentSheet items={subagents} onClose={() => setShowSubagents(false)} /> : null}
    </div>
  )
}
