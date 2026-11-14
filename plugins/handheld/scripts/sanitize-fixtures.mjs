// Turns raw probe recordings (test/fixtures/probe/, never committed) into
// committed test fixtures: drops Host-injected context (personal AGENTS.md,
// skills, request headers), shortens reasoning, and replaces the home path.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const RAW = path.join(ROOT, 'test', 'fixtures', 'probe')
const version = process.argv[2]
if (!version) throw new Error('usage: node scripts/sanitize-fixtures.mjs <dsh version>')
const OUT = path.join(ROOT, 'test', 'fixtures', version)
const HOME = os.homedir()
const DROP_EVENTS = new Set(['request/header', 'request/context', 'system/message', 'session/title-llm-request'])

function keepEvent(event) {
  if (DROP_EVENTS.has(event.type)) return false
  if (event.type === 'user/message' && event.data?.source?.kind !== 'user') return false
  return true
}

function trimEvent(event) {
  if (event.type !== 'assistant/message') return event
  const message = event.data.message
  const content = message.content.map((part) => part.type === 'reasoning' ? { ...part, text: part.text.slice(0, 120) } : part)
  return { ...event, data: { ...event.data, stream: undefined, message: { ...message, content, source: { kind: 'model' } } } }
}

function sanitizeFollow(frame) {
  if (frame.type === 'snapshot') {
    return { ...frame, projections: { asOfSeq: frame.projections?.asOfSeq, values: {} }, records: frame.records.filter((r) => keepEvent(r.event)).map((r) => ({ ...r, event: trimEvent(r.event) })) }
  }
  if (frame.type === 'event') return keepEvent(frame.event) ? { ...frame, event: trimEvent(frame.event) } : null
  if (frame.type === 'assistant-stream' && frame.frame?.type === 'chunk') {
    const chunk = frame.frame.chunk
    if (chunk?.type === 'reasoning-delta') return null
    if (chunk?.type === 'block-end' && chunk.block?.type === 'reasoning') {
      return { ...frame, frame: { ...frame.frame, chunk: { ...chunk, block: { ...chunk.block, text: chunk.block.text.slice(0, 120) } } } }
    }
  }
  return frame
}

function scrub(text) {
  return text.split(HOME).join('/home/user')
}

fs.mkdirSync(OUT, { recursive: true })
for (const [from, to] of [['live-session.json', 'edit-session.json'], ['live-approval.json', 'approval-session.json']]) {
  const raw = JSON.parse(fs.readFileSync(path.join(RAW, from), 'utf8'))
  const clean = {
    created: raw.created,
    follow: raw.follow.map(sanitizeFollow).filter(Boolean),
    events: raw.events.filter((e) => e.type !== 'emit' || e.event.startsWith('api-session/')).map((e) => (e.type === 'emit' ? { type: 'emit', event: e.event, args: [] } : e)),
    answered: raw.answered,
  }
  fs.writeFileSync(path.join(OUT, to), scrub(JSON.stringify(clean, null, 1)) + '\n')
  console.log(`${to}: ${clean.follow.length} follow frames`)
}
