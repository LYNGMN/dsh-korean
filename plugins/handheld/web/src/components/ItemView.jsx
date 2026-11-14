// One row of a conversation. Rows are rebuilt only when their item changes.
import { Component } from 'preact'
import { Markdown } from '../lib/markdown.jsx'
import { update } from '../store.js'
import { Icon } from './Icon.jsx'

const OUTCOME = { completed: '끝남', cancelled: '중단됨', interrupted: '중단됨', error: '오류로 멈춤', failed: '오류로 멈춤' }

function openDiff(title, files) {
  update((s) => { s.openDiff = { title, files } })
}

export function diffsOf(row) {
  return [...(row.call?.diffs ?? []), ...(row.result?.diffs ?? [])]
}

class ToolRow extends Component {
  constructor() {
    super()
    this.state = { open: false }
  }

  render({ row }, { open }) {
    const { call, result } = row
    const status = !result ? (row.ended ? 'stopped' : 'running') : result.isError ? 'error' : 'done'
    const diffs = diffsOf(row)
    const id = `tool-${String((call ?? result).seq)}`
    return (
      <div class={`tool tool-${status}`}>
        <button type="button" class="tool-head" aria-expanded={open} aria-controls={id} onClick={() => this.setState({ open: !open })}>
          <span class="tool-icon" aria-hidden="true">{status === 'running' ? <span class="spinner" /> : <Icon name={status === 'error' ? 'alert' : status === 'stopped' ? 'stop' : 'check'} size={16} />}</span>
          <span class="tool-title one-line">{call?.title ?? '도구 결과'}</span>
          <span class="visually-hidden">{status === 'running' ? '실행 중' : status === 'error' ? '오류' : status === 'stopped' ? '결과 없음' : '끝남'}</span>
          <Icon name="chevron" size={16} class={`tool-chevron${open ? ' up' : ''}`} />
        </button>
        {diffs.length > 0 ? (
          <button type="button" class="link-btn" onClick={() => openDiff(call?.title ?? '변경', diffs)}>
            <Icon name="diff" size={16} />변경 보기 · 파일 {diffs.length}개
          </button>
        ) : null}
        {open ? (
          <div class="tool-body" id={id}>
            {call?.input ? <pre class="pre" tabIndex={0} aria-label="입력">{call.input}</pre> : null}
            {result?.output ? <pre class={`pre${result.isError ? ' pre-error' : ''}`} tabIndex={0} aria-label="결과">{result.output}</pre> : null}
            {result?.truncated ? <p class="muted small">결과가 길어 앞부분만 보입니다.</p> : null}
            {!call?.input && !result?.output ? <p class="muted small">표시할 내용이 없습니다.</p> : null}
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
          <summary>생각 과정</summary>
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

  render({ row }) {
    switch (row.kind) {
      case 'user':
        return <div class="msg msg-user" data-seq={row.item.seq}><p class="user-text">{row.item.text}{row.item.images ? <span class="muted small"> · 이미지 {row.item.images}장</span> : null}</p></div>
      case 'assistant':
        return <div data-seq={row.item.seq}><Assistant item={row.item} /></div>
      case 'tool':
        return <div data-seq={(row.call ?? row.result).seq}><ToolRow row={row} /></div>
      case 'approval':
        return (
          <p class="note" data-seq={row.item.seq}>
            <Icon name="shield" size={16} />
            {row.item.phase === 'asked' ? `승인 요청: ${row.item.tool ?? '도구'}` : row.item.decision === 'rejected' ? '거부됨' : row.item.decision === 'allowed-once' || row.item.decision === 'allowed' ? '허용됨' : '승인 답 받음'}
          </p>
        )
      case 'changes':
        return row.diffs.length > 0 ? (
          <div class="note" data-seq={row.item.seq}>
            <Icon name="diff" size={16} />
            <span>이번 턴에서 파일 {row.diffs.length}개가 바뀌었습니다</span>
            <button type="button" class="link-btn" onClick={() => openDiff('이번 턴 변경', row.diffs)}>모두 보기</button>
          </div>
        ) : null
      case 'turnEnd':
        return <p class="turn-end" data-seq={row.item.seq}><span>{OUTCOME[row.item.outcome] ?? '턴 끝'}</span></p>
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
