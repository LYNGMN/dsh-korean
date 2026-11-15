import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeEvent, StreamAssembler, summarizeSession } from '../server/dsh/normalize.js'

const load = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/0.2.2-rc.3/${name}`, import.meta.url), 'utf8'))
const edit = load('edit-session.json')
const approval = load('approval-session.json')
const events = (rec) => rec.follow.filter((f) => f.type === 'event').map((f) => f.event)
const items = (rec) => events(rec).map(normalizeEvent).filter(Boolean)

test('keeps only what a phone shows, in seq order', () => {
  const kinds = items(edit).map((i) => i.kind)
  assert.deepEqual([...new Set(kinds)].sort(), ['assistant', 'changes', 'title', 'tool', 'toolResult', 'turn', 'user'].sort())
  const seqs = items(edit).map((i) => i.seq)
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b))
})

test('user message carries the typed text only', () => {
  const user = items(edit).find((i) => i.kind === 'user')
  assert.match(user.text, /^Create a file named hello\.txt/)
  assert.equal(user.images, 0)
})

test('host-injected user/message context is dropped', () => {
  assert.equal(normalizeEvent({ type: 'user/message', seq: 3, time: 1, data: { content: [{ type: 'text', text: '<system-reminder>…' }], source: { kind: 'workspace-instructions' } } }), null)
})

test('assistant message splits reasoning and text, ignores tool-call parts', () => {
  const replies = items(edit).filter((i) => i.kind === 'assistant')
  assert.ok(replies.at(-1).text.length > 0)
  assert.ok(replies.some((i) => typeof i.reasoning === 'string' && i.reasoning.length > 0))
  assert.ok(replies.every((i) => !('stream' in i) && !i.text.includes('call_0_')))
})

test('edit result exposes the hunk diff; create synthesizes one from the call arguments', () => {
  const all = items(edit)
  const results = all.filter((i) => i.kind === 'toolResult')
  const edited = results.find((i) => i.diffs?.some((d) => d.oldText === 'hi from the probe'))
  assert.deepEqual(edited.diffs[0], { path: '/home/user/Dev/dsh-handheld/.dev-home/probe-workspace/hello.txt', oldText: 'hi from the probe', newText: 'hi again from the probe' })
  const created = all.find((i) => i.kind === 'tool' && i.name === 'write')
  assert.deepEqual(created.diffs, [{ path: '/home/user/Dev/dsh-handheld/.dev-home/probe-workspace/hello.txt', oldText: null, newText: 'hi from the probe\n' }])
  assert.match(created.title, /hello\.txt/)
})

test('tool call titles summarize the command or path', () => {
  const bash = items(edit).find((i) => i.kind === 'tool' && i.name === 'bash')
  assert.equal(bash.title, 'Inspect exact bytes of hello.txt')
  assert.match(bash.input, /xxd hello\.txt/)
})

test('tool results are capped in size', () => {
  const big = normalizeEvent({ type: 'tool/result', seq: 9, time: 1, data: { message: { toolCallId: 'c', isError: false, content: [{ type: 'text', text: 'x'.repeat(50_000) }] } } })
  assert.ok(big.output.length <= 4_100)
  assert.equal(big.truncated, true)
})

test('approval asked/decided and turn outcome', () => {
  const all = items(approval)
  const asked = all.find((i) => i.kind === 'approval' && i.phase === 'asked')
  assert.equal(asked.tool, 'write')
  assert.match(asked.reason, /danger-full-access/)
  assert.equal(all.find((i) => i.kind === 'approval' && i.phase === 'decided').decision, 'rejected')
  assert.equal(all.find((i) => i.kind === 'turn' && i.phase === 'end').outcome, 'completed')
  const failed = all.find((i) => i.kind === 'toolResult' && i.isError)
  assert.ok(failed.output.includes('sandbox'))
})

test('unknown event types become quiet markers, internal ones disappear', () => {
  assert.deepEqual(normalizeEvent({ type: 'future/thing', seq: 1, time: 2, data: {} }), { seq: 1, time: 2, kind: 'other', type: 'future/thing' })
  assert.equal(normalizeEvent({ type: 'step/start', seq: 1, time: 2, data: {} }), null)
})

test('stream assembler builds provisional text per attempt and reports the commit', () => {
  const a = new StreamAssembler()
  const out = []
  for (const f of edit.follow.filter((f) => f.type === 'assistant-stream')) { const r = a.push(f.frame); if (r) out.push(r) }
  const ends = out.filter((r) => r.type === 'end')
  assert.ok(ends.length >= 5)
  assert.equal(ends[0].committedSeq, 18)
  const lastUpdate = out.filter((r) => r.type === 'update').at(-1)
  assert.ok(lastUpdate.text.length > 0)
  assert.equal(a.active.size, 0)
})

test('summarizeSession maps a session/list row', () => {
  const row = summarizeSession({ sessionId: 's1', updatedAt: 5, running: true, cwd: '/home/user/x', projections: { values: { title: 'T', userQuestions: { active: [{}] } } } })
  assert.deepEqual(row, { id: 's1', title: 'T', cwd: '/home/user/x', running: true, updatedAt: 5, parentId: null })
})

test('a plan review question keeps its two answer values and a per-language approval reason is kept', async () => {
  const { pendingFromWaterfall } = await import('../server/dsh/api.js')
  const review = pendingFromWaterfall({ eventId: 'e1', agentId: 's1', event: 'user-questions/request', request: { questions: [{
    id: 'plan-review', header: 'Plan review', question: 'Approve this plan and leave plan mode?', detail: '# 계획',
    options: [{ label: 'Approve', description: 'x' }, { label: 'Keep planning', description: 'y' }],
    intent: { kind: 'plan-review', approve: 'Approve', callId: 'c1' },
  }] } })
  assert.deepEqual(review.questions[0].review, { approve: 'Approve', revise: 'Keep planning' })
  assert.deepEqual(review.questions[0].options, ['Approve', 'Keep planning'])
  const plain = pendingFromWaterfall({ eventId: 'e2', agentId: 's1', event: 'user-questions/request', request: { questions: [{ id: 'a', question: '?', options: ['A'] }] } })
  assert.equal(plain.questions[0].review, undefined)
  const approval = pendingFromWaterfall({ eventId: 'e3', agentId: 's1', event: 'approval/request', request: { toolName: 'bash', callId: 'c2', displayReason: { en: 'writes outside', zh: '外部写入' } } })
  assert.equal(approval.reason, 'writes outside')
  assert.deepEqual(approval.reasons, { en: 'writes outside', zh: '外部写入' })
})
