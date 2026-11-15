import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeDsh } from './support/fake-dsh.js'
import { DshClient } from '../server/dsh/client.js'
import { DshApi } from '../server/dsh/api.js'
import { Hub } from '../server/gateway/hub.js'
import { commandNameOf, matchingCommands } from '../web/src/lib/commands.js'

const quiet = { info() {}, warn() {} }
const SID = 'session-a'
const COMMANDS = [
  { definitionId: 'plan', name: 'plan', description: 'Enter plan mode', input: { hint: 'what to plan' } },
  { name: 'compact', description: 'Compact the history' },
  { name: 'fail', description: 'Always fails' },
]

async function setup(t) {
  const dsh = await createFakeDsh({ sessions: [{ sessionId: SID, cwd: '/home/user/proj', title: '테스트' }], commands: COMMANDS })
  const client = new DshClient({ upstreamUrl: () => dsh.url, logger: quiet, backoff: () => 20 })
  const hub = new Hub({ api: new DshApi(client), logger: quiet, idleFollowMs: 50 })
  hub.start()
  const connected = new Promise((resolve) => client.once('generation', resolve))
  client.start()
  await connected
  t.after(async () => {
    hub.stop()
    client.stop()
    await dsh.close()
  })
  return { dsh, hub }
}

test('a session lists its commands with name, description and input hint', async (t) => {
  const { hub } = await setup(t)
  assert.deepEqual(await hub.commands(SID), [
    { name: 'plan', description: 'Enter plan mode', hint: 'what to plan' },
    { name: 'compact', description: 'Compact the history' },
    { name: 'fail', description: 'Always fails' },
  ])
  assert.deepEqual(await hub.commands('sub~session-a~child~one-shot'), [])
})

test('a command line runs in DSH as typed and reports what DSH answered', async (t) => {
  const { dsh, hub } = await setup(t)
  assert.deepEqual(await hub.runCommand(SID, ' /plan 로그인 고치기 '), { ran: true, ok: true, text: 'ran plan' })
  assert.deepEqual(dsh.state.commandLines, [{ sessionId: SID, line: '/plan 로그인 고치기' }])
  assert.deepEqual(await hub.runCommand(SID, '/fail'), { ran: true, ok: false, text: 'nope' })
  assert.deepEqual(await hub.runCommand(SID, '/unknown thing'), { ran: false })
  assert.equal(dsh.state.prompts.length, 0)
})

test('only a slash line is a command, and a subagent conversation takes none', async (t) => {
  const { hub } = await setup(t)
  assert.throws(() => hub.runCommand(SID, 'plan'), { code: 'command/bad-line' })
  assert.throws(() => hub.runCommand(SID, '/ '), { code: 'command/bad-line' })
  assert.throws(() => hub.runCommand('sub~session-a~child~one-shot', '/plan'), { code: 'command/view-only' })
})

test('the composer recognises a command line and suggests while the name is typed', () => {
  const commands = [{ name: 'plan', description: '' }, { name: 'compact', description: '' }, { name: 'clear', description: '' }]
  assert.equal(commandNameOf('/plan 로그인', commands), 'plan')
  assert.equal(commandNameOf('  /compact', commands), 'compact')
  assert.equal(commandNameOf('/etc/hosts 를 봐 주세요', commands), null)
  assert.equal(commandNameOf('계획 /plan', commands), null)
  assert.deepEqual(matchingCommands('/c', commands).map((c) => c.name), ['compact', 'clear'])
  assert.deepEqual(matchingCommands('/', commands).length, 3)
  assert.deepEqual(matchingCommands('/plan ', commands), [])
  assert.deepEqual(matchingCommands('안녕', commands), [])
})
