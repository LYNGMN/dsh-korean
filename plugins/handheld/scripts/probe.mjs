// Protocol probe against a running DSH Host (needs devUpstreamFile: true).
//   node scripts/probe.mjs            read-only: shapes of $events, list, follow, events paging
//   node scripts/probe.mjs --live     also creates a throwaway session in .dev-home/probe-workspace,
//                                     asks for a small file write, records frames, answers the
//                                     approval with --answer (default: rejected)
// Read-only output keeps structure only (strings replaced), so no conversation text lands in fixtures.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { connectApi, rpcCall } from '../server/dsh/connection.js'
import { MuxSocket } from '../server/dsh/mux.js'
import { dataDir, readJson } from '../server/home.js'

const live = process.argv.includes('--live')
const promptArg = process.argv.indexOf('--prompt')
const answer = process.argv[process.argv.indexOf('--answer') + 1] === 'allowed-once' ? 'allowed-once' : 'rejected'
const ROOT = path.join(import.meta.dirname, '..')

const KEEP = new Set(['type', 'kind', 'mode', 'event', 'eventType', 'toolName', 'placement', 'reason', 'role', 'operation', 'name'])
function shape(value, key = '', depth = 0) {
  if (depth > 9) return '…'
  if (typeof value === 'string') return KEEP.has(key) ? value : `<s${value.length}>`
  if (Array.isArray(value)) return value.length === 0 ? [] : [`<len ${value.length}>`, ...value.slice(0, 2).map((v) => shape(v, key, depth + 1))]
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, k, depth + 1)]))
  return value
}

async function take(stream, ms, max = 200) {
  const items = []
  const deadline = Date.now() + ms
  while (items.length < max) {
    const left = deadline - Date.now()
    if (left <= 0) break
    const next = await Promise.race([stream.next(), new Promise((r) => setTimeout(() => r(null), left))])
    if (!next || next.done) break
    items.push(next.value)
  }
  return items
}

const upstream = readJson(path.join(dataDir(), 'upstream.json'))
if (!upstream?.url) throw new Error('no upstream.json: install the plugin with devUpstreamFile: true and restart DSH')
const session = await connectApi(upstream.url)
const mux = await MuxSocket.connect(session)
const report = {}

const events = mux.open('$events', {})
const ready = (await events.next()).value
report.eventsReady = shape(ready)

const list = await rpcCall(session, 'session/list', { _request: {} })
const rows = Array.isArray(list) ? list : (list.items ?? list.sessions ?? [])
report.sessionList = { topLevelKeys: Array.isArray(list) ? 'array' : Object.keys(list), count: rows.length, first: shape(rows[0]) }

const workspaces = mux.open('workspace/follow', {})
report.workspaceFollow = (await take(workspaces, 1500, 3)).map((f) => shape(f))
workspaces.cancel()

const control = mux.open('session/control', {})
report.sessionControl = (await take(control, 1500, 3)).map((f) => shape(f))
control.cancel()

const target = rows.find((r) => !r.parentSessionId) ?? rows[0]
if (target) {
  const sessionId = target.sessionId ?? target.id
  const follow = mux.open('session/follow', { request: { address: { kind: 'session', sessionId }, maxMessages: 6, assistantStream: true } })
  const frames = await take(follow, 2500, 20)
  follow.cancel()
  const snapshot = frames.find((f) => f?.type === 'snapshot')
  const seqs = (snapshot?.records ?? []).map((r) => r.event?.seq).filter((n) => typeof n === 'number')
  report.follow = {
    frameTypes: frames.map((f) => f?.type),
    snapshot: shape({ ...snapshot, records: undefined }),
    recordEventTypes: [...new Set((snapshot?.records ?? []).map((r) => r.event?.type))],
    recordShapes: Object.fromEntries((snapshot?.records ?? []).map((r) => [r.event?.type, shape(r)])),
    seqRange: [Math.min(...seqs), Math.max(...seqs)],
    cursor: snapshot?.cursor,
  }
  if (seqs.length > 0) {
    const before = Math.min(...seqs)
    const page = await rpcCall(session, 'session/events', { request: { address: { kind: 'session', sessionId }, beforeSeq: before, maxMessages: 4 } })
    const pageSeqs = (page.records ?? []).map((r) => r.event?.seq)
    report.eventsPage = { keys: Object.keys(page), beforeSeq: before, seqRange: [Math.min(...pageSeqs), Math.max(...pageSeqs)], hasMore: page.hasMore, cursor: page.cursor }
  }
}

const outDir = path.join(ROOT, 'test', 'fixtures', 'probe')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'shapes.json'), JSON.stringify(report, null, 1) + '\n')
console.log('read-only probe written: test/fixtures/probe/shapes.json')

if (live) {
  const cwd = path.join(ROOT, '.dev-home', 'probe-workspace')
  fs.mkdirSync(cwd, { recursive: true })
  const created = await rpcCall(session, 'session/create', { request: { cwd } })
  const sessionId = created.sessionId ?? created.id ?? created.session?.sessionId
  const follow = mux.open('session/follow', { request: { address: { kind: 'session', sessionId }, assistantStream: true, activate: true } })
  const recorded = { created, follow: [], events: [], answered: null }
  const pump = (async () => { for await (const f of follow) recorded.follow.push(f) })().catch((e) => { recorded.followError = e.message })
  const evPump = (async () => {
    for await (const f of events) {
      recorded.events.push(f)
      if (f?.type === 'waterfall' && f.event === 'approval/request' && f.agentId === sessionId && !recorded.answered) {
        recorded.answered = { eventId: f.eventId, value: answer }
        const result = await rpcCall(session, '$events/result', { clientId: ready.clientId, eventId: f.eventId, outcome: { kind: 'result', value: answer } })
        recorded.answerResult = result
      }
    }
  })().catch((e) => { recorded.eventsError = e.message })
  await rpcCall(session, 'session/prompt', {
    request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: promptArg > 0 ? process.argv[promptArg + 1] : 'Create a file named hello.txt in the current directory containing exactly: hi from the probe. Then edit it so the text says: hi again from the probe. Reply with one short sentence.' }] },
  })
  const until = Date.now() + 120000
  while (Date.now() < until && !recorded.follow.some((f) => f?.type === 'event' && f.event?.type === 'turn/end')) await new Promise((r) => setTimeout(r, 500))
  follow.cancel()
  fs.writeFileSync(path.join(outDir, promptArg > 0 ? 'live-approval.json' : 'live-session.json'), JSON.stringify(recorded, null, 1) + '\n')
  console.log(`live probe written: test/fixtures/probe/${promptArg > 0 ? 'live-approval' : 'live-session'}.json (answered: ${recorded.answered ? answer : 'no approval seen'})`)
  void pump
  void evPump
}

events.cancel()
mux.close()
