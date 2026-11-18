#!/usr/bin/env node
// Reads DSH session logs (read-only) and measures how much the agent explores before it edits,
// and what each session costs: tokens, tool calls, characters read and returned by tools.
// Sessions are grouped into arms by the map tools they called, so "no map tools",
// "Codebase Memory MCP" and "Trail MCP" runs can be compared on the same task.
// Usage: node scripts/measure-sessions.mjs [--dir <sessions folder>] [--cwd <text in the working folder>]
//        [--since <ISO date>] [--rows] [--json]
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchOf } from '../lib/search-command.js'

const median = list => {
  if (!list.length) return null
  const sorted = [...list].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Which map tools a session used: the arm it belongs to. `plugin` means this
 * kit's code-map plugin attached notes to the session (it is on for the folder).
 */
export function armOf(toolNames, plugin = false) {
  const parts = []
  if (toolNames.some(name => /^mcp__(cbm|codebase[-_]?memory)/i.test(name))) parts.push('cbm')
  if (toolNames.some(name => /^mcp__(trail|graft)/i.test(name))) parts.push('trail')
  if (plugin) parts.push('plugin')
  return parts.length ? parts.join('+') : 'none'
}

const MAP_TOOL = /^mcp__(cbm|codebase[-_]?memory|trail|graft)/i
const textLength = content => (Array.isArray(content) ? content : [])
  .reduce((total, part) => total + (part?.type === 'text' && typeof part.text === 'string' ? part.text.length : 0), 0)

/** One session log (text, one JSON event per line) → per-turn counts and session totals. */
export function summarizeSession(text) {
  const turns = new Map()
  let cwd = ''
  let startedAt = null
  const calls = new Map()
  const totals = {
    toolCalls: 0, reads: 0, readChars: 0, resultChars: 0, mapCalls: 0, readsAfterMap: 0, mapNotes: 0,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, steps: 0, stepsWithUsage: 0,
  }
  const mapTurns = new Set()
  const turnOf = number => {
    if (!turns.has(number)) turns.set(number, { turn: number, searches: 0, bashSearches: 0, reads: 0, edits: 0, beforeEdit: null, _edited: false, _pre: 0 })
    return turns.get(number)
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('{"type":"session"')) {
      try { cwd = JSON.parse(line).cwd ?? '' } catch { /* keep going */ }
    }
    if (startedAt === null && line.startsWith('{')) {
      const time = /"time":(\d{10,})/.exec(line)
      if (time) startedAt = Number(time[1])
    }
    if (line.startsWith('{"type":"assistant/message"')) {
      let event
      try { event = JSON.parse(line) } catch { continue }
      totals.steps += 1
      const usage = event.data?.usage
      if (usage && Number.isFinite(usage.totalTokens) && usage.totalTokens > 0) {
        totals.stepsWithUsage += 1
        totals.inputTokens += usage.inputTokens ?? 0
        totals.outputTokens += usage.outputTokens ?? 0
        totals.cacheReadTokens += usage.cacheReadTokens ?? 0
      }
      continue
    }
    if (line.startsWith('{"type":"user/message"') && line.includes('"dsh-code-map"')) {
      // The code-map plugin's notes (prompt-time or after a search) are logged as user messages from this source.
      try { if (JSON.parse(line).data?.source?.kind === 'dsh-code-map') totals.mapNotes += 1 } catch { /* keep going */ }
      continue
    }
    if (line.startsWith('{"type":"tool/result"')) {
      let event
      try { event = JSON.parse(line) } catch { continue }
      const message = event.data?.message
      const chars = textLength(message?.content)
      totals.resultChars += chars
      const call = calls.get(message?.toolCallId)
      if (call?.name === 'read') totals.readChars += chars
      continue
    }
    if (!line.startsWith('{"type":"tool/call"')) continue
    let data
    try { data = JSON.parse(line).data } catch { continue }
    totals.toolCalls += 1
    calls.set(data.callId, { name: data.name })
    const turn = turnOf(data.turn ?? 0)
    if (MAP_TOOL.test(data.name ?? '')) { totals.mapCalls += 1; mapTurns.add(data.turn ?? 0) }
    let explore = 0
    if (data.name === 'bash') {
      let command = ''
      try { command = JSON.parse(data.arguments).command ?? '' } catch { /* not JSON */ }
      if (searchOf(command)) { turn.searches += 1; turn.bashSearches += 1; explore = 1 }
    } else if (data.name === 'grep' || data.name === 'glob') {
      turn.searches += 1
      explore = 1
    } else if (data.name === 'read') {
      turn.reads += 1
      totals.reads += 1
      if (mapTurns.has(data.turn ?? 0)) totals.readsAfterMap += 1
      explore = 1
    } else if (data.name === 'edit' || data.name === 'write') {
      turn.edits += 1
      if (!turn._edited) { turn._edited = true; turn.beforeEdit = turn._pre }
    }
    if (explore && !turn._edited) turn._pre += 1
  }
  const toolNames = [...calls.values()].map(call => call.name)
  return {
    cwd,
    startedAt,
    arm: armOf(toolNames, totals.mapNotes > 0),
    totals,
    turns: [...turns.values()].map(({ _edited, _pre, ...rest }) => rest),
  }
}

/** Per-arm medians of what a session costs. A missing value means the log never recorded it. */
export function compareArms(sessions) {
  const arms = new Map()
  for (const session of sessions) {
    if (!session.totals) continue
    if (!arms.has(session.arm)) arms.set(session.arm, [])
    arms.get(session.arm).push(session)
  }
  const pick = (list, key) => median(list.map(session => session.totals[key]))
  return Object.fromEntries([...arms].map(([arm, list]) => {
    const withUsage = list.filter(session => session.totals.stepsWithUsage > 0)
    return [arm, {
      sessions: list.length,
      toolCalls: pick(list, 'toolCalls'),
      reads: pick(list, 'reads'),
      readChars: pick(list, 'readChars'),
      resultChars: pick(list, 'resultChars'),
      mapCalls: pick(list, 'mapCalls'),
      mapNotes: pick(list, 'mapNotes'),
      readsAfterMap: pick(list, 'readsAfterMap'),
      sessionsWithUsage: withUsage.length,
      inputTokens: withUsage.length ? median(withUsage.map(session => session.totals.inputTokens)) : null,
      cacheReadTokens: withUsage.length ? median(withUsage.map(session => session.totals.cacheReadTokens)) : null,
      outputTokens: withUsage.length ? median(withUsage.map(session => session.totals.outputTokens)) : null,
    }]
  }))
}

export function aggregate(sessions) {
  const turns = sessions.flatMap(session => session.turns)
  const edited = turns.filter(turn => turn.beforeEdit !== null)
  const sum = key => turns.reduce((total, turn) => total + turn[key], 0)
  return {
    sessions: sessions.length,
    turns: turns.length,
    turnsWithEdit: edited.length,
    exploreBeforeFirstEdit: {
      median: median(edited.map(turn => turn.beforeEdit)),
      mean: edited.length ? edited.reduce((total, turn) => total + turn.beforeEdit, 0) / edited.length : null,
    },
    searches: sum('searches'),
    searchesViaBash: sum('bashSearches'),
    reads: sum('reads'),
    edits: sum('edits'),
  }
}

function listLogs(dir) {
  const files = []
  const visit = path => {
    for (const name of readdirSync(path)) {
      const full = join(path, name)
      if (statSync(full).isDirectory()) visit(full)
      else if (name === 'session.v4.jsonl.zstd') files.push(full)
    }
  }
  visit(dir)
  return files
}

function main(argv) {
  const option = name => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined }
  const dir = option('--dir') ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sessions')
  const only = option('--cwd')
  const sinceText = option('--since')
  const since = sinceText ? Date.parse(sinceText) : null
  if (sinceText && Number.isNaN(since)) { console.error('--since 값은 2026-11-18 같은 날짜여야 해요.'); process.exit(2) }
  const sessions = []
  for (const file of listLogs(dir)) {
    let text
    try { text = execFileSync('zstd', ['-dc', file], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8') } catch { continue }
    const summary = summarizeSession(text)
    if (only && !summary.cwd.includes(only)) continue
    if (since !== null && (summary.startedAt ?? 0) < since) continue
    summary.id = basename(dirname(file)).replace(/^session-/, '').slice(0, 8)
    sessions.push(summary)
  }
  const result = { ...aggregate(sessions), arms: compareArms(sessions) }
  if (argv.includes('--json')) { console.log(JSON.stringify(argv.includes('--rows') ? { ...result, rows: rowsOf(sessions) } : result, null, 2)); return }
  const f = value => (value === null ? '없음' : Number.isInteger(value) ? String(value) : value.toFixed(1))
  console.log(`세션 ${result.sessions}개 · 턴 ${result.turns}개 (파일을 고친 턴 ${result.turnsWithEdit}개)`)
  console.log(`첫 수정 전 탐색 호출 수: 중앙값 ${f(result.exploreBeforeFirstEdit.median)} · 평균 ${f(result.exploreBeforeFirstEdit.mean)}`)
  console.log(`검색 ${result.searches}회 (그중 bash 안 검색 ${result.searchesViaBash}회) · 읽기 ${result.reads}회 · 고치기 ${result.edits}회`)
  console.log('')
  console.log('방식별 한 세션의 중앙값 (같은 일을 시킨 세션끼리만 비교하세요. 표본이 작으면 배수로 말하지 않아요.)')
  const head = ['방식', '세션', '도구호출', '읽기', '읽은글자', '결과글자', '지도호출', '덧붙임', '지도뒤읽기', '입력토큰', '캐시읽기', '출력토큰']
  const table = [head, ...Object.entries(result.arms).map(([arm, row]) => [arm, row.sessions, row.toolCalls, row.reads, row.readChars,
    row.resultChars, row.mapCalls, row.mapNotes, row.readsAfterMap,
    row.inputTokens === null ? '기록없음' : row.inputTokens, row.cacheReadTokens === null ? '기록없음' : row.cacheReadTokens,
    row.outputTokens === null ? '기록없음' : row.outputTokens].map(String))]
  const widths = head.map((_, column) => Math.max(...table.map(row => [...String(row[column])].length)))
  for (const row of table) console.log(row.map((cell, column) => String(cell).padEnd(widths[column])).join('  ').trimEnd())
  if (argv.includes('--rows')) {
    console.log('')
    for (const row of rowsOf(sessions)) console.log(row.join('  '))
  }
}

function rowsOf(sessions) {
  return sessions.filter(session => session.totals).map(session => [session.id ?? '', session.arm,
    new Date(session.startedAt ?? 0).toISOString().slice(0, 16), '호출 ' + session.totals.toolCalls,
    '읽기 ' + session.totals.reads + '회/' + session.totals.readChars + '자', '입력 ' + (session.totals.stepsWithUsage ? session.totals.inputTokens : '기록없음'),
    session.cwd.split('/').slice(-2).join('/')])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
