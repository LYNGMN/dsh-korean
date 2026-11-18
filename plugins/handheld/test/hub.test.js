import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeDsh } from './support/fake-dsh.js'
import { DshClient } from '../server/dsh/client.js'
import { DshApi } from '../server/dsh/api.js'
import { Hub } from '../server/gateway/hub.js'

const quiet = { info() {}, warn() {} }
const SID = 'session-a'

function userEvent(text) {
  return ['user/message', { source: { kind: 'user' }, content: [{ type: 'text', text }] }]
}
function replyEvent(text, turn = 1) {
  return ['assistant/message', { turn, message: { content: [{ type: 'text', text }] } }]
}

function phone() {
  const frames = []
  const waiters = []
  return {
    frames,
    send(frame) {
      frames.push(frame)
      for (const w of waiters.splice(0)) w()
    },
    async waitFor(pred, ms = 3000) {
      const deadline = Date.now() + ms
      for (;;) {
        const hit = frames.find(pred)
        if (hit) return hit
        if (Date.now() > deadline) throw new Error(`timed out; got ${JSON.stringify(frames.map((f) => f.type))}`)
        await new Promise((resolve) => {
          waiters.push(resolve)
          setTimeout(resolve, 50)
        })
      }
    },
    of(type) {
      return frames.filter((f) => f.type === type)
    },
  }
}

async function until(check, ms = 2000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function setup(t, { events = [], gitReader } = {}) {
  const dsh = await createFakeDsh({ sessions: [{ sessionId: SID, cwd: '/home/user/proj', title: '테스트' }] })
  for (const [type, data] of events) dsh.pushEvent(SID, type, data)
  const client = new DshClient({ upstreamUrl: () => dsh.url, logger: quiet, backoff: () => 20 })
  const api = new DshApi(client)
  const hub = new Hub({ api, logger: quiet, idleFollowMs: 50, ...(gitReader ? { gitReader } : {}) })
  hub.start()
  const connected = new Promise((resolve) => client.once('generation', resolve))
  client.start()
  await connected
  t.after(async () => {
    hub.stop()
    client.stop()
    await dsh.close()
  })
  return { dsh, client, api, hub }
}

test('a new phone gets status, sessions and pending, then history on watch', async (t) => {
  const { hub } = await setup(t, { events: [userEvent('안녕'), ['step/start', {}], replyEvent('반가워요')] })
  const p = phone()
  const handle = hub.connect(p)
  await p.waitFor((f) => f.type === 'sessions')
  assert.equal(p.of('status')[0].upstream, 'connected')
  assert.deepEqual(p.of('pending')[0].items, [])
  assert.equal(p.of('sessions').at(-1).rows[0].title, '테스트')
  await handle.watch(SID, null)
  const items = p.of('items')[0]
  assert.equal(items.reset, true)
  assert.deepEqual(items.items.map((i) => i.kind), ['user', 'assistant'])
})

test('live events reach watchers; resume sends only what the phone lacks', async (t) => {
  const { dsh, hub } = await setup(t, { events: [userEvent('하나'), replyEvent('둘')] })
  const p = phone()
  const handle = hub.connect(p)
  await handle.watch(SID, null)
  const last = p.of('items')[0].items.at(-1).seq
  dsh.pushEvent(SID, ...replyEvent('셋', 2))
  const live = await p.waitFor((f) => f.type === 'items' && f.items[0]?.text === '셋')
  assert.equal(live.reset, false)
  handle.close()

  dsh.pushEvent(SID, ...replyEvent('넷', 3))
  const again = phone()
  const h2 = hub.connect(again)
  await new Promise((r) => setTimeout(r, 100))
  await h2.watch(SID, last)
  const resumed = again.of('items')[0]
  assert.equal(resumed.reset, false)
  assert.deepEqual(resumed.items.map((i) => i.text), ['셋', '넷'])
})

test('a cursor older than the cache is filled from Host history', async (t) => {
  const events = []
  for (let i = 0; i < 30; i += 1) events.push(userEvent(`q${String(i)}`), replyEvent(`a${String(i)}`, i))
  const { hub } = await setup(t, { events })
  const p = phone()
  const handle = hub.connect(p)
  await handle.watch(SID, 9)
  const frames = p.of('items')
  assert.equal(frames[0].reset, false)
  const seqs = frames.flatMap((f) => f.items.map((i) => i.seq))
  assert.equal(seqs[0], 10)
  assert.equal(seqs.at(-1), 59)
  assert.equal(new Set(seqs).size, seqs.length)
})

test('streaming text arrives as coalesced deltas and ends cleanly', async (t) => {
  const { dsh, hub } = await setup(t)
  const p = phone()
  const handle = hub.connect(p)
  await handle.watch(SID, null)
  dsh.pushStream(SID, { type: 'start', attemptId: 'a1' })
  for (const piece of ['안', '녕', '하세요']) dsh.pushStream(SID, { type: 'chunk', attemptId: 'a1', chunk: { type: 'text-delta', text: piece } })
  const first = await p.waitFor((f) => f.type === 'stream')
  assert.equal(first.textAt, 0)
  assert.equal(first.text, '안녕하세요')
  dsh.pushStream(SID, { type: 'chunk', attemptId: 'a1', chunk: { type: 'text-delta', text: '!' } })
  dsh.pushStream(SID, { type: 'end', attemptId: 'a1', outcome: { kind: 'committed', seq: 1 } })
  await p.waitFor((f) => f.type === 'streamEnd')
  const deltas = p.of('stream')
  assert.equal(deltas.at(-1).textAt, 5)
  assert.equal(deltas.at(-1).text, '!')
})

test('approvals become pending, notify once, and are answered only through answer()', async (t) => {
  const { dsh, hub } = await setup(t)
  const notes = []
  hub.on('notify', (n) => notes.push(n))
  const p = phone()
  hub.connect(p)
  const frame = dsh.waterfall({ event: 'approval/request', agentId: SID, request: { toolName: 'write', callId: 'c1', reason: '폴더 밖 쓰기' } })
  const pending = await p.waitFor((f) => f.type === 'pending' && f.items.length === 1)
  assert.equal(pending.items[0].kind, 'approval')
  assert.equal(pending.items[0].reason, '폴더 밖 쓰기')
  assert.equal(dsh.state.answers.length, 0)
  assert.equal(notes.length, 1)
  assert.equal(notes[0].kind, 'approval')

  await hub.answer(frame.eventId, { decision: 'reject' })
  assert.deepEqual(dsh.state.answers, [{ eventId: frame.eventId, value: 'rejected' }])
  assert.deepEqual(hub.pendingList(), [])
  await assert.rejects(hub.answer(frame.eventId, { decision: 'allow' }), { code: 'answer/gone' })
})

test('after the Host connection drops, pending is rebuilt without a second notification and watchers catch up', async (t) => {
  const { dsh, client, hub } = await setup(t, { events: [userEvent('처음')] })
  const notes = []
  hub.on('notify', (n) => notes.push(n))
  const p = phone()
  const handle = hub.connect(p)
  await handle.watch(SID, null)
  dsh.waterfall({ event: 'approval/request', agentId: SID, request: { toolName: 'bash', callId: 'c9' } })
  await p.waitFor((f) => f.type === 'pending' && f.items.length === 1)

  const reconnected = new Promise((resolve) => client.once('generation', resolve))
  dsh.dropSockets()
  dsh.pushEvent(SID, ...replyEvent('끊긴 사이'))
  await reconnected
  await p.waitFor((f) => f.type === 'items' && f.items.some((i) => i.text === '끊긴 사이'))
  await p.waitFor((f) => f.type === 'pending' && f.items.length === 1 && p.frames.indexOf(f) > 3)
  assert.equal(notes.filter((n) => n.kind === 'approval').length, 1)
  const texts = p.of('items').flatMap((f) => f.items.map((i) => i.text))
  assert.equal(texts.filter((x) => x === '처음').length, 1)
})

test('a session that stops running sends a turn-end notification', async (t) => {
  const { dsh, hub } = await setup(t)
  const notes = []
  hub.on('notify', (n) => notes.push(n))
  const p = phone()
  hub.connect(p)
  await p.waitFor((f) => f.type === 'sessions')
  dsh.setRunning(SID, true)
  const running = await p.waitFor((f) => f.type === 'sessions' && f.rows[0].running)
  dsh.setRunning(SID, false)
  await p.waitFor((f) => f.type === 'sessions' && !f.rows[0].running && p.frames.indexOf(f) > p.frames.indexOf(running))
  await until(() => notes.length > 0)
  assert.deepEqual(notes.map((n) => n.kind), ['turnEnd'])
})

test('the turn-end notification names the stage waiting for approval', async (t) => {
  // Pushed work branch with tests done and no PR yet: the merge step (open a PR first) waits for approval.
  const facts = { repo: true, folder: 'proj', branch: 'claude/feat/x', base: 'main', isBase: false, changes: 0, ahead: 1, upstream: 'origin/claude/feat/x', unpushed: 0, hadCommits: true, headTime: 1, pr: null, prError: null, tag: null, verify: { at: 2, command: 'npm test', editedAfter: false } }
  const { dsh, hub } = await setup(t, { gitReader: { read: async () => facts } })
  const notes = []
  hub.on('notify', (n) => notes.push(n))
  const p = phone()
  hub.connect(p)
  await p.waitFor((f) => f.type === 'sessions')
  dsh.setRunning(SID, true)
  await p.waitFor((f) => f.type === 'sessions' && f.rows[0].running)
  dsh.setRunning(SID, false)
  await until(() => notes.length > 0)
  assert.equal(notes[0].kind, 'turnEnd')
  assert.equal(notes[0].approval, 'merge')
})

test('prompt checks text and passes the mode through', async (t) => {
  const { dsh, hub } = await setup(t)
  assert.throws(() => hub.prompt(SID, '   '), { code: 'prompt/empty' })
  await hub.prompt(SID, '이어서 해 줘', 'steer')
  assert.equal(dsh.state.prompts[0].mode, 'steer')
  assert.equal(dsh.state.prompts[0].content[0].text, '이어서 해 줘')
})
