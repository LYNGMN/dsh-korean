#!/usr/bin/env node
// Reads DSH session logs (read-only) and measures how much the agent explores before it edits.
// Usage: node scripts/measure-sessions.mjs [--dir <sessions folder>] [--cwd <text in the working folder>] [--json]
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchOf } from '../lib/search-command.js'

const median = list => {
  if (!list.length) return null
  const sorted = [...list].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** One session log (text, one JSON event per line) → per-turn counts. */
export function summarizeSession(text) {
  const turns = new Map()
  let cwd = ''
  const turnOf = number => {
    if (!turns.has(number)) turns.set(number, { turn: number, searches: 0, bashSearches: 0, reads: 0, edits: 0, beforeEdit: null, _edited: false, _pre: 0 })
    return turns.get(number)
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('{"type":"session"')) {
      try { cwd = JSON.parse(line).cwd ?? '' } catch { /* keep going */ }
    }
    if (!line.startsWith('{"type":"tool/call"')) continue
    let data
    try { data = JSON.parse(line).data } catch { continue }
    const turn = turnOf(data.turn ?? 0)
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
      explore = 1
    } else if (data.name === 'edit' || data.name === 'write') {
      turn.edits += 1
      if (!turn._edited) { turn._edited = true; turn.beforeEdit = turn._pre }
    }
    if (explore && !turn._edited) turn._pre += 1
  }
  return {
    cwd,
    turns: [...turns.values()].map(({ _edited, _pre, ...rest }) => rest),
  }
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
  const sessions = []
  for (const file of listLogs(dir)) {
    let text
    try { text = execFileSync('zstd', ['-dc', file], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8') } catch { continue }
    const summary = summarizeSession(text)
    if (only && !summary.cwd.includes(only)) continue
    sessions.push(summary)
  }
  const result = aggregate(sessions)
  if (argv.includes('--json')) { console.log(JSON.stringify(result, null, 2)); return }
  const f = value => (value === null ? '없음' : Number.isInteger(value) ? String(value) : value.toFixed(1))
  console.log(`세션 ${result.sessions}개 · 턴 ${result.turns}개 (파일을 고친 턴 ${result.turnsWithEdit}개)`)
  console.log(`첫 수정 전 탐색 호출 수: 중앙값 ${f(result.exploreBeforeFirstEdit.median)} · 평균 ${f(result.exploreBeforeFirstEdit.mean)}`)
  console.log(`검색 ${result.searches}회 (그중 bash 안 검색 ${result.searchesViaBash}회) · 읽기 ${result.reads}회 · 고치기 ${result.edits}회`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
