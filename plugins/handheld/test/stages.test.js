import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeDsh } from './support/fake-dsh.js'
import { DshClient } from '../server/dsh/client.js'
import { DshApi } from '../server/dsh/api.js'
import { workStateOf } from '../server/dsh/normalize.js'
import { Hub } from '../server/gateway/hub.js'
import { stagesOf } from '../web/src/lib/stages.js'
import { stageFacts, stageNext, stageSummary } from '../web/src/lib/stage-view.js'
import { setLang } from '../web/src/lib/i18n.js'

const quiet = { info() {}, warn() {} }
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' }
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, stdio: 'pipe' })

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'handheld-stage-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  git(dir, 'init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'a\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'first')
  git(dir, 'switch', '-q', '-c', 'claude/feat/phone')
  writeFileSync(join(dir, 'b.txt'), 'b\n')
  return dir
}

async function setup(t, sessions) {
  const dsh = await createFakeDsh({ sessions })
  const client = new DshClient({ upstreamUrl: () => dsh.url, logger: quiet, backoff: () => 20 })
  // gh는 부르지 않는다: PR 없음으로 답한다.
  const gitReader = (await import('../server/gateway/git-read.js')).createGitReader({
    run: (file, args, cwd) => (file === 'gh'
      ? Promise.resolve({ ok: false, out: '', err: 'no pull requests found', code: 1, timedOut: false })
      : import('../server/gateway/git-read.js').then((m) => m.runCommand(file, args, cwd))),
  })
  const hub = new Hub({ api: new DshApi(client), logger: quiet, gitReader })
  hub.start()
  const connected = new Promise((resolve) => client.once('generation', resolve))
  client.start()
  await connected
  t.after(async () => {
    hub.stop()
    client.stop()
    await dsh.close()
  })
  return hub
}

test('workStateOf reads the working folder and keeps only well-formed todos', () => {
  assert.deepEqual(workStateOf(null), { cwd: null, todos: null })
  const state = workStateOf({ values: { workingDirectory: '/w', todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'weird' }, null] } })
  assert.deepEqual(state, { cwd: '/w', todos: [{ content: 'a', status: 'completed' }] })
})

test('stages reads Git in the folder DSH reports and returns the todo list', async (t) => {
  const dir = repo(t)
  const todos = [{ content: 'npm test 돌리기', status: 'in_progress' }]
  const hub = await setup(t, [{ sessionId: 's1', cwd: '/not-used', title: 'x', projections: { workingDirectory: dir, todos } }])
  const reply = await hub.stages('s1')
  assert.equal(reply.facts.repo, true)
  assert.equal(reply.facts.branch, 'claude/feat/phone')
  assert.equal(reply.facts.changes, 1)
  assert.deepEqual(reply.todos, todos)
  const snap = stagesOf(reply.facts, { todos: reply.todos })
  assert.equal(snap.current, 1)
  assert.equal(snap.doing, 'npm test 돌리기')
})

test('without a working-folder projection the session row folder is used; a subagent reads its parent', async (t) => {
  const dir = repo(t)
  const hub = await setup(t, [{ sessionId: 's1', cwd: dir, title: 'x' }])
  assert.equal((await hub.stages('s1')).facts.branch, 'claude/feat/phone')
  assert.equal((await hub.stages('sub~s1~child~one-shot')).facts.branch, 'claude/feat/phone')
})

test('a folder that is not a Git repository says so', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'handheld-none-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const hub = await setup(t, [{ sessionId: 's1', cwd: dir, title: 'x' }])
  const reply = await hub.stages('s1')
  assert.deepEqual(reply.facts, { repo: false })
  setLang('ko')
  assert.equal(stageSummary(stagesOf(reply.facts)), 'Git 저장소가 아닙니다')
})

test('stage text follows the language and names the approval step', (t) => {
  t.after(() => setLang('ko'))
  const facts = { repo: true, folder: 'app', branch: 'claude/feat/x', base: 'main', isBase: false, changes: 0, ahead: 2, upstream: null, unpushed: 0, hadCommits: true, headTime: 1, pr: null, prError: 'auth', tag: null }
  const snap = stagesOf(facts, { todos: [{ content: 'run tests', status: 'completed' }] })
  setLang('ko')
  assert.equal(stageSummary(snap), '공유 단계 · 3/6 · 승인 필요')
  assert.match(stageNext(snap.stages[3]), /gh auth login/)
  assert.deepEqual(stageFacts(snap.stages[1]), ['저장 안 된 변경 없음', '원본보다 앞선 저장 2개'])
  setLang('en')
  assert.equal(stageSummary(snap), 'Share · 3/6 · needs approval')
  assert.equal(stageSummary(stagesOf(null), 'boom'), 'Could not read the work stage: boom')
})
