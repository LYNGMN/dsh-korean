// 임시 Git 저장소를 실제 git으로 만들어 읽는다. gh는 가짜로 바꿔 끼운다.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGitReader, findRepos, parseStatus, prErrorOf, runCommand } from '../lib/git-read.js'
import { createHandler, workingDirectoryOf } from '../lib/index.js'

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' }
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, env, stdio: 'pipe' }).toString()

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'git-stage-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  sh(dir, 'init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'a\n')
  sh(dir, 'add', '.')
  sh(dir, 'commit', '-q', '-m', 'first')
  return dir
}

// gh만 가짜로: 응답을 정해 두고, git은 진짜로 돌린다.
function readerWith(gh, calls = []) {
  return createGitReader({
    run: (file, args, cwd) => {
      if (file === 'gh') { calls.push(args); return Promise.resolve(gh) }
      return runCommand(file, args, cwd)
    },
  })
}
const NO_PR = { ok: false, out: '', err: 'no pull requests found for branch "x"', code: 1, timedOut: false }

test('parseStatus는 브랜치·추적·앞섬·변경 수를 읽는다', () => {
  const s = parseStatus('# branch.oid abc\n# branch.head claude/feat/x\n# branch.upstream origin/claude/feat/x\n# branch.ab +2 -0\n1 .M N... a\n? b\n')
  assert.deepEqual(s, { branch: 'claude/feat/x', upstream: 'origin/claude/feat/x', unpushed: 2, changes: 2 })
  assert.equal(parseStatus('# branch.head (detached)\n').branch, null)
})

test('prErrorOf는 PR 없음은 오류가 아니고, 로그인 만료·gh 없음을 가른다', () => {
  assert.equal(prErrorOf(NO_PR), null)
  assert.equal(prErrorOf({ err: 'To get started with GitHub CLI, please run:  gh auth login', code: 4 }), 'auth')
  assert.equal(prErrorOf({ err: '', code: 'ENOENT' }), 'no-gh')
  assert.equal(prErrorOf({ err: '', code: null, timedOut: true }), 'timeout')
})

test('Git 저장소가 아니면 repo: false', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'git-stage-none-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.deepEqual(await readerWith(NO_PR).read(dir), { repo: false })
  assert.deepEqual(await readerWith(NO_PR).read(''), { repo: false })
})

test('원본 브랜치에서는 PR을 묻지 않는다', async t => {
  const dir = repo(t)
  const calls = []
  const facts = await readerWith(NO_PR, calls).read(dir)
  assert.equal(facts.branch, 'main')
  assert.equal(facts.isBase, true)
  assert.equal(calls.length, 0)
})

test('작업 브랜치의 미커밋·앞선 커밋·저장 기록을 센다', async t => {
  const dir = repo(t)
  sh(dir, 'switch', '-q', '-c', 'claude/feat/x')
  writeFileSync(join(dir, 'b.txt'), 'b\n')
  let facts = await readerWith(NO_PR).read(dir)
  assert.equal(facts.changes, 1)
  assert.equal(facts.ahead, 0)
  assert.equal(facts.hadCommits, false)
  assert.equal(facts.pr, null)
  assert.equal(facts.prError, null)

  sh(dir, 'add', '.')
  sh(dir, 'commit', '-q', '-m', 'b')
  facts = await readerWith(NO_PR).read(dir)
  assert.equal(facts.changes, 0)
  assert.equal(facts.ahead, 1)
  assert.equal(facts.hadCommits, true)
  assert.equal(facts.base, 'main')
  assert.ok(facts.headTime > 0)
})

test('브랜치를 원본에 합친 뒤에는 앞선 커밋 0, 저장 기록은 남는다', async t => {
  const dir = repo(t)
  sh(dir, 'switch', '-q', '-c', 'claude/fix/y')
  writeFileSync(join(dir, 'c.txt'), 'c\n')
  sh(dir, 'add', '.')
  sh(dir, 'commit', '-q', '-m', 'c')
  sh(dir, 'switch', '-q', 'main')
  sh(dir, 'merge', '-q', '--ff-only', 'claude/fix/y')
  sh(dir, 'switch', '-q', 'claude/fix/y')
  const facts = await readerWith(NO_PR).read(dir)
  assert.equal(facts.ahead, 0)
  assert.equal(facts.hadCommits, true)
})

test('v 태그가 브랜치 끝 커밋을 담으면 태그 이름을 준다', async t => {
  const dir = repo(t)
  sh(dir, 'switch', '-q', '-c', 'claude/feat/z')
  writeFileSync(join(dir, 'd.txt'), 'd\n')
  sh(dir, 'add', '.')
  sh(dir, 'commit', '-q', '-m', 'd')
  sh(dir, 'tag', 'v1.0.0')
  assert.equal((await readerWith(NO_PR).read(dir)).tag, 'v1.0.0')
})

test('PR 답은 30초 동안 다시 묻지 않고, 로그인 만료는 prError로 준다', async t => {
  const dir = repo(t)
  sh(dir, 'switch', '-q', '-c', 'claude/feat/w')
  const calls = []
  const reader = readerWith({ ok: false, out: '', err: 'gh auth login', code: 4, timedOut: false }, calls)
  const first = await reader.read(dir)
  await reader.read(dir)
  assert.equal(first.prError, 'auth')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].slice(0, 3), ['pr', 'view', 'claude/feat/w'])
})

test('PR JSON을 읽고 https 주소만 남긴다', async t => {
  const dir = repo(t)
  sh(dir, 'switch', '-q', '-c', 'claude/feat/v')
  const out = JSON.stringify({ number: 12, state: 'OPEN', isDraft: true, url: 'javascript:alert(1)', mergeCommit: null })
  const facts = await readerWith({ ok: true, out, err: '', code: 0, timedOut: false }).read(dir)
  assert.deepEqual(facts.pr, { number: 12, state: 'OPEN', draft: true, url: null, mergeCommit: null })
})

test('주소 처리기는 세션 id를 검사하고 작업 폴더를 세션 기록에서 찾는다', async () => {
  let disposed = 0
  const sessionQuery = {
    observeSession: async id => {
      if (id !== 's1') throw new Error('nope')
      return { header: { cwd: '/from-header' }, projections: { values: { workingDirectory: '/moved' } }, [Symbol.dispose]: () => { disposed += 1 } }
    },
  }
  assert.equal(await workingDirectoryOf(sessionQuery, 's1'), '/moved')
  assert.equal(disposed, 1)
  const seen = []
  const handler = createHandler({ sessionQuery, reader: { read: async (cwd, options) => { seen.push([cwd, options.pick]); return { repo: false } } } })
  assert.equal((await handler(new Request('http://h/api/dsh-git-stage?sessionId=../etc'))).status, 400)
  assert.equal((await handler(new Request('http://h/api/dsh-git-stage?sessionId=zz'))).status, 404)
  const ok = await handler(new Request('http://h/api/dsh-git-stage?sessionId=s1&cwd=/evil'))
  assert.deepEqual(await ok.json(), { facts: { repo: false } })
  await handler(new Request('http://h/api/dsh-git-stage?sessionId=s1&repo=app'))
  assert.deepEqual(seen, [['/moved', null], ['/moved', 'app']])
})

// 저장소 묶음 폴더: 바로 아래 저장소 둘(old·app), 저장소가 아닌 docs, worktrees/app/feat 작업본.
function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'git-stage-ws-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const name of ['old', 'app']) {
    const dir = join(root, name)
    mkdirSync(dir)
    sh(dir, 'init', '-q', '-b', 'main')
    writeFileSync(join(dir, 'a.txt'), 'a\n')
    sh(dir, 'add', '.')
    sh(dir, 'commit', '-q', '-m', 'first')
  }
  mkdirSync(join(root, 'docs', 'deep'), { recursive: true })
  mkdirSync(join(root, 'worktrees', 'app'), { recursive: true })
  sh(join(root, 'app'), 'worktree', 'add', '-q', '-b', 'claude/feat/x', join(root, 'worktrees', 'app', 'feat'))
  const at = (name, seconds) => {
    const gitDir = name === 'feat' ? join(root, 'app', '.git', 'worktrees', 'feat') : join(root, name, '.git')
    for (const file of ['logs/HEAD', 'index', 'HEAD']) {
      try { utimesSync(join(gitDir, file), seconds, seconds) } catch { /* 없는 파일 */ }
    }
  }
  at('old', 1_000)
  at('app', 2_000)
  at('feat', 3_000)
  return root
}

test('findRepos는 묶음 폴더 안 저장소와 작업본을 최근 활동 순으로 찾는다', async t => {
  const root = workspace(t)
  assert.deepEqual((await findRepos(root)).map(item => item.name), ['worktrees/app/feat', 'app', 'old'])
})

test('묶음 폴더 세션은 가장 최근 저장소를 읽고, 고른 저장소가 목록에 있을 때만 그것을 읽는다', async t => {
  const root = workspace(t)
  const reader = readerWith(NO_PR)
  const auto = await reader.read(root)
  assert.equal(auto.repo, true)
  assert.equal(auto.folder, 'worktrees/app/feat')
  assert.equal(auto.branch, 'claude/feat/x')
  assert.deepEqual(auto.within, { folder: root.split('/').pop(), repos: ['worktrees/app/feat', 'app', 'old'], picked: 'worktrees/app/feat', auto: true })
  const picked = await reader.read(root, { pick: 'old' })
  assert.equal(picked.folder, 'old')
  assert.equal(picked.branch, 'main')
  assert.equal(picked.within.auto, false)
  // 목록에 없는 이름(경로 넘기기 포함)은 무시하고 자동으로 고른다.
  for (const pick of ['../..', '/etc', 'docs']) {
    const fallback = await reader.read(root, { pick })
    assert.equal(fallback.folder, 'worktrees/app/feat')
    assert.equal(fallback.within.auto, true)
  }
})

test('안에 저장소도 없는 폴더는 repo: false', async t => {
  const root = mkdtempSync(join(tmpdir(), 'git-stage-empty-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'a', 'b'), { recursive: true })
  assert.deepEqual(await readerWith(NO_PR).read(root), { repo: false })
})
