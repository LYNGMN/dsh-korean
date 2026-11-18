// One row of a conversation. Rows are rebuilt only when their item changes.
import { Component } from 'preact'
import { Markdown } from '../lib/markdown.jsx'
import { update } from '../store.js'
import { api, sessionPath } from '../api.js'
import { Icon } from './Icon.jsx'
import { t } from '../lib/i18n.js'
import { isLongMessage } from '../lib/fold.js'

const OUTCOME = { completed: 'state.done', cancelled: 'state.stopped', interrupted: 'state.stopped', error: 'outcome.error', failed: 'outcome.error' }

function openDiff(title, files) {
  update((s) => { s.openDiff = { title, files } })
}

export function diffsOf(row) {
  return [...(row.call?.diffs ?? []), ...(row.result?.diffs ?? [])]
}

class UserMessage extends Component {
  constructor() {
    super()
    this.state = { open: false }
  }

  render({ item }, { open }) {
    const long = isLongMessage(item.text)
    const id = `msg-${String(item.seq)}`
    return (
      <div class="msg msg-user" data-seq={item.seq}>
        <p class={`user-text${long && !open ? ' folded' : ''}`} id={id}>{item.text}{item.images ? <span class="muted small">{t('msg.images', { count: item.images })}</span> : null}</p>
        {long ? (
          <button type="button" class="fold-btn" aria-expanded={open} aria-controls={id} onClick={() => this.setState({ open: !open })}>
            {t(open ? 'msg.less' : 'msg.more')}
          </button>
        ) : null}
      </div>
    )
  }
}

class ToolRow extends Component {
  constructor() {
    super()
    this.state = { open: false, full: null, fullState: 'idle', fullError: '' }
  }

  /** The list cuts a result at 4,000 characters; fetch the whole text when asked. */
  loadFull = async () => {
    const { row, sessionId } = this.props
    this.setState({ fullState: 'loading', fullError: '' })
    try {
      const full = await api(`${sessionPath(sessionId)}/items/${String(row.result.seq)}/output`)
      this.setState({ full, fullState: 'done' })
    } catch (error) {
      this.setState({ fullState: 'error', fullError: error?.message ?? '' })
    }
  }

  render({ row }, { open, full, fullState, fullError }) {
    const { call, result } = row
    const output = full?.output ?? result?.output
    const cut = full ? full.truncated : result?.truncated === true
    const status = !result ? (row.ended ? 'stopped' : 'running') : result.isError ? 'error' : 'done'
    const diffs = diffsOf(row)
    const id = `tool-${String((call ?? result).seq)}`
    return (
      <div class={`tool tool-${status}`}>
        <button type="button" class="tool-head" aria-expanded={open} aria-controls={id} onClick={() => this.setState({ open: !open })}>
          <span class="tool-icon" aria-hidden="true">{status === 'running' ? <span class="spinner" /> : <Icon name={status === 'error' ? 'alert' : status === 'stopped' ? 'stop' : 'check'} size={16} />}</span>
          <span class="tool-title one-line">{call?.title ?? t('toolcall.result')}</span>
          <span class="visually-hidden">{t(status === 'running' ? 'state.running' : status === 'error' ? 'state.error' : status === 'stopped' ? 'state.noResult' : 'state.done')}</span>
          <Icon name="chevron" size={16} class={`tool-chevron${open ? ' up' : ''}`} />
        </button>
        {diffs.length > 0 ? (
          <button type="button" class="link-btn" onClick={() => openDiff(call?.title ?? t('diff.fallback'), diffs)}>
            <Icon name="diff" size={16} />{t('diff.view', { count: diffs.length })}
          </button>
        ) : null}
        {open ? (
          <div class="tool-body" id={id}>
            {call?.input ? <pre class="pre" role="group" tabIndex={0} aria-label={t('toolcall.input')}>{call.input}</pre> : null}
            {output ? <pre class={`pre${result?.isError ? ' pre-error' : ''}`} role="group" tabIndex={0} aria-label={t('toolcall.output')}>{output}</pre> : null}
            {cut ? (
              <div class="tool-more" aria-live="polite">
                <p class="muted small">{t(full ? 'toolcall.truncatedFull' : 'toolcall.truncated')}</p>
                {!full ? (
                  <button type="button" class="link-btn" disabled={fullState === 'loading'} onClick={this.loadFull}>
                    {t(fullState === 'loading' ? 'toolcall.loading' : fullState === 'error' ? 'toolcall.retry' : 'toolcall.showAll')}
                  </button>
                ) : null}
                {fullState === 'error' && fullError ? <p class="muted small" role="alert">{fullError}</p> : null}
              </div>
            ) : null}
            {!call?.input && !output ? <p class="muted small">{t('toolcall.nothing')}</p> : null}
          </div>
        ) : null}
      </div>
    )
  }
}

function Assistant({ item }) {
  return (
    <div class="msg msg-assistant">
      {item.reasoning ? (
        <details class="reasoning">
          <summary>{t('reasoning.title')}</summary>
          <p class="reasoning-text">{item.reasoning}</p>
        </details>
      ) : null}
      {item.text ? <Markdown text={item.text} /> : null}
    </div>
  )
}

export class ItemView extends Component {
  shouldComponentUpdate(next) {
    return next.row !== this.props.row
  }

  render({ row, sessionId }) {
    switch (row.kind) {
      case 'user':
        return <UserMessage item={row.item} />
      case 'assistant':
        return <div data-seq={row.item.seq}><Assistant item={row.item} /></div>
      case 'tool':
        return <div data-seq={(row.call ?? row.result).seq}><ToolRow row={row} sessionId={sessionId} /></div>
      case 'approval': {
        const { phase, decision, tool } = row.item
        const allowed = decision === 'allowed-once' || decision === 'allowed'
        const state = phase === 'asked' ? 'asked' : decision === 'rejected' ? 'rejected' : allowed ? 'allowed' : 'answered'
        return (
          <p class={`note note-${state}`} data-seq={row.item.seq}>
            <Icon name={state === 'rejected' ? 'close' : state === 'allowed' ? 'check' : 'shield'} size={16} />
            {state === 'asked' ? t('note.asked', { tool: tool ?? t('tool.fallback') }) : t(state === 'rejected' ? 'note.rejected' : state === 'allowed' ? 'note.allowed' : 'note.answered')}
          </p>
        )
      }
      case 'changes':
        return row.diffs.length > 0 ? (
          <div class="note" data-seq={row.item.seq}>
            <Icon name="diff" size={16} />
            <span>{t('turn.changed', { count: row.diffs.length })}</span>
            <button type="button" class="link-btn" onClick={() => openDiff(t('turn.diffTitle'), row.diffs)}>{t('turn.viewAll')}</button>
          </div>
        ) : null
      case 'turnEnd':
        return <p class="turn-end" data-seq={row.item.seq}><span>{t(OUTCOME[row.item.outcome] ?? 'turn.end')}</span></p>
      default:
        return null
    }
  }
}

/**
 * Items -> rows: pairs tool calls with results and gathers each turn's diffs.
 * Keeps row objects stable for unchanged items so ItemView can skip them.
 */
export function buildRows(items, previous = new Map()) {
  const rows = []
  const tools = new Map()
  const next = new Map()
  const keep = (key, row, same) => {
    const old = previous.get(key)
    const value = old && same(old) ? old : row
    next.set(key, value)
    return value
  }
  for (const item of items) {
    if (item.kind === 'tool') {
      const row = { kind: 'tool', key: `t${String(item.seq)}`, call: item, result: null }
      tools.set(item.callId, row)
      rows.push(row)
    } else if (item.kind === 'toolResult') {
      const row = tools.get(item.callId)
      if (row) row.result = item
      else rows.push({ kind: 'tool', key: `r${String(item.seq)}`, call: null, result: item })
    } else if (item.kind === 'turn' && item.phase === 'end') {
      for (const open of tools.values()) if (!open.result) open.ended = true
      if (item.outcome !== 'completed') rows.push({ kind: 'turnEnd', key: `e${String(item.seq)}`, item })
    } else if (item.kind === 'changes') {
      rows.push({ kind: 'changes', key: `c${String(item.seq)}`, item })
    } else if (item.kind === 'user' || item.kind === 'assistant' || item.kind === 'approval') {
      rows.push({ kind: item.kind, key: `${item.kind[0]}${String(item.seq)}`, item })
    }
  }
  // Second pass: collect diffs per turn and stabilise identities.
  let collected = []
  const out = []
  for (const row of rows) {
    if (row.kind === 'tool') {
      collected.push(...diffsOf(row))
      out.push(keep(row.key, row, (old) => old.call === row.call && old.result === row.result && old.ended === row.ended))
    } else if (row.kind === 'changes') {
      const files = latestPerPath(collected)
      collected = []
      const value = { kind: 'changes', key: row.key, item: row.item, diffs: files }
      out.push(keep(row.key, value, (old) => old.item === row.item && old.diffs.length === files.length))
    } else {
      if (row.kind === 'user') collected = []
      out.push(keep(row.key, row, (old) => old.item === row.item))
    }
  }
  return { rows: out, cache: next }
}

/** When a file changed several times in a turn, show first-old to last-new. */
function latestPerPath(diffs) {
  const byPath = new Map()
  for (const d of diffs) {
    const prev = byPath.get(d.path)
    byPath.set(d.path, prev ? { path: d.path, oldText: prev.oldText, newText: d.newText } : d)
  }
  return [...byPath.values()]
}
