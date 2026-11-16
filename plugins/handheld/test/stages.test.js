import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeDsh } from './support/fake-dsh.js'
import { DshClient } from '../server/dsh/client.js'
import { DshApi } from '../server/dsh/api.js'
import { commandsOf, workStateOf } from '../server/dsh/normalize.js'
import { Hub } from '../server/gateway/hub.js'
import { stagesOf } from '../web/src/lib/stages.js'
import { stageAsk, stageFacts, stageNext, stageOutgoing, stageSummary } from '../web/src/lib/stage-view.js'
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

test('a folder holding repositories follows the latest one, and a picked one when it is listed', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'handheld-ws-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [name, seconds] of [['a', 1000], ['b', 2000]]) {
    const dir = join(root, name)
    mkdirSync(dir)
    git(dir, 'init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'first')
    for (const file of ['logs/HEAD', 'index', 'HEAD']) utimesSync(join(dir, '.git', file), seconds, seconds)
  }
  const hub = await setup(t, [{ sessionId: 's1', cwd: root, title: 'x' }])
  const auto = await hub.stages('s1')
  assert.equal(auto.facts.folder, 'b')
  assert.deepEqual(auto.facts.within.repos, ['b', 'a'])
  assert.equal(auto.facts.within.auto, true)
  const picked = await hub.stages('s1', 'a')
  assert.equal(picked.facts.folder, 'a')
  assert.equal(picked.facts.within.auto, false)
  assert.equal((await hub.stages('s1', '../..')).facts.folder, 'b')
  assert.equal(auto.facts.within.reason, 'recent')
})

test('a folder holding repositories follows the one the session ran commands in', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'handheld-ws2-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const name of ['a', 'b']) {
    const dir = join(root, name)
    mkdirSync(dir)
    git(dir, 'init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'x.txt'), 'x\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'first')
  }
  utimesSync(join(root, 'b', '.git', 'index'), 9_999_999_999, 9_999_999_999)
  const events = [
    { seq: 1, time: 1, type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: JSON.stringify({ command: 'cd a && git status', description: 'x' }) } },
    { seq: 2, time: 2, type: 'tool/result', data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'c1', content: [] }, meta: { cwd: root } } },
  ]
  const hub = await setup(t, [{ sessionId: 's1', cwd: root, title: 'x', events }])
  const reply = await hub.stages('s1')
  assert.equal(reply.facts.folder, 'a')
  assert.equal(reply.facts.within.reason, 'session')
})

test('commandsOf pairs shell commands with the folder DSH resolved for them', () => {
  const records = [
    { event: { type: 'tool/call', data: { callId: 'c1', name: 'bash', arguments: JSON.stringify({ command: 'cd a && git status' }) } } },
    { event: { type: 'tool/result', data: { message: { toolCallId: 'c1' }, meta: { cwd: '/w' } } } },
    { event: { type: 'tool/call', data: { callId: 'c2', name: 'read', arguments: '{}' } } },
  ]
  assert.deepEqual(commandsOf(records), [{ command: 'cd a && git status', cwd: '/w' }])
  assert.deepEqual(commandsOf(undefined), [])
})

test('stage text follows the language and names the approval step', (t) => {
  t.after(() => setLang('ko'))
  const facts = { repo: true, folder: 'app', branch: 'claude/feat/x', base: 'main', isBase: false, changes: 0, ahead: 2, upstream: null, unpushed: 0, hadCommits: true, headTime: 1, pr: null, prError: 'auth', tag: null }
  const snap = stagesOf(facts, { todos: [{ content: 'run tests', status: 'completed' }] })
  setLang('ko')
  assert.equal(stageSummary(snap), '공유 단계 · 3/6 · 승인 필요')
  assert.match(stageNext(snap.stages[3]), /gh auth login/)
  assert.deepEqual(stageFacts(snap.stages[1]), ['저장 2개 · 저장 안 된 변경 없음'])
  const fresh = stagesOf({ ...facts, ahead: 0, hadCommits: false, prError: null })
  assert.deepEqual(stageFacts(fresh.stages[1]), ['아직 바뀐 파일이 없습니다.'])
  assert.equal(stageNext(fresh.stages[1]), '고칠 것을 말하면, 고친 뒤 커밋으로 저장합니다.')
  assert.match(stageNext(fresh.stages[1], { running: true }), /^에이전트가 고치는 중입니다\. 기다렸다가/)
  setLang('en')
  assert.equal(stageSummary(snap), 'Share · 3/6 · needs approval')
  assert.equal(stageSummary(stagesOf(null), 'boom'), 'Could not read the work stage: boom')
})

test('before share the sheet lists the commits going up and the changes that stay', (t) => {
  t.after(() => setLang('ko'))
  const facts = {
    repo: true, folder: 'app', branch: 'claude/feat/x', base: 'main', isBase: false, changes: 1, ahead: 2, upstream: null, unpushed: 0,
    hadCommits: true, headTime: 1, pr: null, prError: null, tag: null,
    commits: [{ id: 'a', subject: 'bigger button' }, { id: 'b', subject: 'fix copy' }], files: { changed: 3, added: 10, removed: 2 },
    pending: [{ path: 'notes.md', kind: 'new' }],
  }
  const share = stagesOf(facts).stages[3]
  setLang('ko')
  assert.deepEqual(stageOutgoing(share), {
    title: '이번에 GitHub에 올라가는 것', commits: ['bigger button', 'fix copy'], more: null,
    files: '파일 3개 · 10줄 더함 · 2줄 뺌', left: '저장 안 된 변경 1개는 올라가지 않습니다.', pending: ['새 파일 · notes.md'],
  })
  setLang('en')
  assert.equal(stageOutgoing(share).left, '1 unsaved changes will not go up.')
  assert.equal(stageOutgoing(stagesOf(facts).stages[1]), null)
})

test('the sheet offers one request for the current stage, naming the repository in a workspace folder', (t) => {
  t.after(() => setLang('ko'))
  const base = {
    repo: true, folder: 'app', branch: 'claude/feat/x', base: 'main', isBase: false, changes: 0, ahead: 1, upstream: null, unpushed: 0,
    hadCommits: true, headTime: 1, pr: null, prError: null, tag: null,
  }
  const current = (facts, extra) => { const snap = stagesOf(facts, extra); return snap.stages[snap.current] }
  const verified = { todos: [{ content: 'run tests', status: 'completed' }] }
  setLang('ko')
  assert.equal(stageAsk(current(base)), '테스트와 빌드를 돌리고 결과를 알려 주세요.')
  assert.equal(stageAsk(current(base), 'app'), 'app 저장소에서 테스트와 빌드를 돌리고 결과를 알려 주세요.')
  assert.equal(stageAsk(current({ ...base, upstream: 'origin/x' }, verified)), '검토 요청(PR)을 초안으로 열어 주세요.')
  assert.equal(stageAsk(current({ ...base, upstream: 'origin/x', pr: { number: 2, state: 'OPEN', draft: false, url: null, mergeCommit: null } }, verified)), '검토 요청(PR)을 스쿼시 머지해 주세요.')
  assert.equal(stageAsk(current({ ...base, prError: 'auth' }, verified)), null)
  assert.equal(stageAsk(stagesOf(base).stages[0]), null)
  setLang('en')
  assert.equal(stageAsk(current(base, verified), 'app'), 'In the app repository: Please push and open a draft pull request.')
})
