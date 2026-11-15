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
import { pendingIcon, pendingStripText } from '../lib/pending.js'
import { stagesOf } from '../lib/stages.js'
import { stageAsk, stageFacts, stageNext, stageOutgoing, stagePlain, stageStep, stageSummary, statusText } from '../lib/stage-view.js'

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

const STAGE_POLL_RUNNING_MS = 8000
const STAGE_POLL_IDLE_MS = 30_000

/** Git work stage of the session's folder; asked again while it works and once more when it stops. */
function useStages(sessionId, running) {
  const [state, setState] = useState({ facts: null, todos: null, error: null })
  // When the session's folder holds several repositories, the one picked here (remembered per session).
  const [pick, setPick] = useState(() => storageGet(`stage-repo:${sessionId}`))
  useEffect(() => { setPick(storageGet(`stage-repo:${sessionId}`)) }, [sessionId])
  useEffect(() => {
    let alive = true
    const query = pick ? `?repo=${encodeURIComponent(pick)}` : ''
    const load = () => api(`${sessionPath(sessionId)}/stages${query}`).then((r) => {
      if (alive) setState({ facts: r.facts, todos: r.todos, error: null })
    }).catch((error) => {
      if (alive) setState((s) => ({ ...s, error: error.message }))
    })
    void load()
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, running ? STAGE_POLL_RUNNING_MS : STAGE_POLL_IDLE_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [sessionId, running, pick])
  useEffect(() => { setState({ facts: null, todos: null, error: null }) }, [sessionId])
  const choose = (name) => {
    storageSet(`stage-repo:${sessionId}`, name || null)
    setPick(name || null)
  }
  return { snapshot: stagesOf(state.facts, { todos: state.todos }), facts: state.facts, error: state.error, choose }
}

// The repository being read is named on the line right below, so the follow option carries no name.
function RepoPicker({ within, choose }) {
  return (
    <div class="stage-repo">
      <label class="setting-choice-label" for="stage-repo-select">{t('stage.repoIn', { folder: within.folder })}</label>
      <div class="select-wrap">
        <select id="stage-repo-select" class="select" value={within.auto ? '' : within.picked} onChange={(e) => choose(e.currentTarget.value)}>
          <option value="">{t('stage.repoAuto')}</option>
          {within.repos.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <Icon name="chevron" size={18} />
      </div>
    </div>
  )
}

function StageDots({ snapshot }) {
  return (
    <span class="stage-dots" aria-hidden="true">
      {snapshot.stages.map((stage) => <span key={stage.key} class="stage-dot" data-status={stage.status} />)}
    </span>
  )
}

/** Before approving share or merge: commit titles going up, and unsaved changes that stay behind. */
function StageOutgoing({ stage }) {
  const out = stageOutgoing(stage)
  if (!out) return null
  return (
    <div class="stage-out">
      <h4 class="stage-out-title">{out.title}</h4>
      <ol class="stage-out-list">{out.commits.map((subject, i) => <li key={i}>{subject}</li>)}</ol>
      {out.more ? <p class="muted small">{out.more}</p> : null}
      {out.files ? <p class="muted small">{out.files}</p> : null}
      {out.left ? (
        <details class="stage-out-left">
          <summary class="muted small">{out.left}</summary>
          <ul class="stage-out-files mono-line">{out.pending.map((line) => <li key={line}>{line}</li>)}</ul>
        </details>
      ) : null}
    </div>
  )
}

/** A request for the current stage. The button puts it in the message box and never sends it. */
function StageAsk({ stage, facts, onAsk }) {
  const ask = onAsk ? stageAsk(stage, facts?.within ? facts.folder : null) : null
  if (!ask) return null
  return (
    <div class="stage-ask">
      <p class="muted small">{t('stage.ask.label')}</p>
      <p class="stage-ask-text">{ask}</p>
      <button type="button" class="btn btn-ghost btn-small stage-ask-btn" onClick={() => onAsk(ask)}>{t('stage.ask.put')}</button>
    </div>
  )
}

function StageSheet({ snapshot, facts, choose, onAsk, onClose }) {
  return (
    <Sheet title={t('stage.title')} onClose={onClose} labelId="stage-sheet-title">
      {facts?.within ? <RepoPicker within={facts.within} choose={choose} /> : null}
      {facts?.repo ? <p class="muted small mono-line">{`${facts.folder} · ${facts.branch ?? t('stage.noBranch')}`}</p> : null}
      {facts?.within && facts.within.reason !== 'picked' ? <p class="muted small stage-why">{t(`stage.why.${facts.within.reason === 'session' ? 'session' : 'recent'}`)}</p> : null}
      {snapshot.doing ? <p class="stage-doing"><span class="stage-label">{t('stage.doing')}</span><span>{snapshot.doing}</span></p> : null}
      <ol class="stage-list">
        {snapshot.stages.map((stage, i) => {
          const next = stageNext(stage)
          return (
            <li key={stage.key} class="stage-item" data-status={stage.status} aria-current={stage.status === 'current' ? 'step' : undefined}>
              <details open={stage.status === 'current'}>
                <summary class="stage-summary">
                  <span class="stage-mark" data-status={stage.status} aria-hidden="true">{stage.status === 'done' ? '✓' : String(i + 1)}</span>
                  <span class="stage-name one-line">{stageStep(stage.key)}</span>
                  {stage.approval ? <span class="badge badge-attn">{t('stage.approval')}</span> : null}
                  {stage.blocked ? <span class="badge badge-danger">{t('stage.blocked')}</span> : null}
                  <span class="badge badge-quiet">{statusText(stage.status)}</span>
                </summary>
                <div class="stage-detail">
                  <p class="muted small">{stagePlain(stage.key)}</p>
                  <ul class="stage-facts">{stageFacts(stage).map((line) => <li key={line}>{line}</li>)}</ul>
                  <StageOutgoing stage={stage} />
                  {next ? <p class="stage-next"><span class="stage-label">{t('stage.next')}</span><span>{next}</span></p> : null}
                  <StageAsk stage={stage} facts={facts} onAsk={onAsk} />
                </div>
              </details>
            </li>
          )
        })}
      </ol>
      <p class="muted small">{t('stage.note')}</p>
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
  const stages = useStages(sessionId, running)
  const [showStages, setShowStages] = useState(false)
  const activeSubagents = subagents.filter((s) => s.state === 'running').length
  const [announcement, setAnnouncement] = useState('')
  // A stage request waiting to go into the message box; n changes on every tap so the same text can go in twice.
  const [fill, setFill] = useState(null)
  const askInBox = (text) => {
    setFill((prev) => ({ text, n: (prev?.n ?? 0) + 1 }))
    setShowStages(false)
    setAnnouncement(t('stage.ask.done'))
  }
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
              <Icon name={pendingIcon(p)} size={18} />
              <span class="one-line">{pendingStripText(p)}</span>
              <span class="pending-go">{t('view')}</span>
            </button>
          ))}
        </div>
      ) : null}

      {stages.snapshot.kind !== 'no-repo' && !(stages.snapshot.kind === 'loading' && stages.error) ? (
        <div class="sub-strip stage-strip">
          <button type="button" class="sub-btn stage-btn" disabled={stages.snapshot.kind !== 'ok'} onClick={() => setShowStages(true)}>
            <Icon name="stages" size={18} />
            {stages.snapshot.kind === 'ok' ? <StageDots snapshot={stages.snapshot} /> : null}
            <span class="one-line">{stageSummary(stages.snapshot, stages.error)}</span>
            {stages.snapshot.kind === 'ok' ? <span class="pending-go">{t('view')}</span> : null}
          </button>
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
      {parentId ? <p class="view-only">{t('sub.viewOnly')}</p> : <Composer sessionId={sessionId} running={running} fill={fill} />}
      {showSubagents ? <SubagentSheet items={subagents} onClose={() => setShowSubagents(false)} /> : null}
      {showStages && stages.snapshot.kind === 'ok' ? <StageSheet snapshot={stages.snapshot} facts={stages.facts} choose={stages.choose} onAsk={parentId ? null : askInBox} onClose={() => setShowStages(false)} /> : null}
    </div>
  )
}
