import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { captureChanges, compareChanges } from '../lib/changes.js'

async function repo(t) {
  const root = await mkdtemp(join(tmpdir(), 'code-map-turn-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, stdio: 'pipe' })
  const commit = () => git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
  const save = (path, value) => writeFile(join(root, path), value)
  git('init', '-q')
  for (const name of ['dirty.js', 'again.js', 'removed.js', 'old.js', 'reverted.js', 'staged.js']) {
    await save(name, 'original\n')
  }
  git('add', '.')
  commit()
  return { root, git, commit, save }
}

test('요청 전부터 있던 변경은 제외하고 수정·복원·추가·삭제·이름 변경·커밋을 확인한다', async t => {
  const { root, git, commit, save } = await repo(t)
  await save('dirty.js', 'older change\n')
  await save('again.js', 'before\n')
  await save('reverted.js', 'older change\n')
  await save('staged.js', 'older change\n')
  await save('earlier-untracked.js', 'unchanged during request\n')
  const before = await captureChanges(root)
  await save('again.js', 'after!\n')
  await save('reverted.js', 'original\n')
  await rename(join(root, 'old.js'), join(root, 'new name.js'))
  await unlink(join(root, 'removed.js'))
  await save('added.js', 'committed in request\n')
  await save('untracked.js', 'created during request\n')
  git('add', '-A', '--', 'again.js', 'old.js', 'new name.js', 'removed.js', 'added.js', 'staged.js')
  commit()
  const after = await captureChanges(root, { head: before.head })
  assert.deepEqual(compareChanges(before, after), {
    files: ['added.js', 'again.js', 'new name.js', 'old.js', 'removed.js', 'reverted.js', 'untracked.js'],
    partial: false,
  })
})

test('시간이 없거나 안전하게 읽지 못한 경우에는 빈 변경으로 처리하지 않는다', async t => {
  const { root, save } = await repo(t)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(captureChanges(root, { signal: controller.signal }))
  await save('big.js', Buffer.alloc(16 * 1024 * 1024 + 1))
  await assert.rejects(captureChanges(root), /snapshot-limit/)
})

test('민감한 경로를 결과에 넣지 않으며 일부 파일을 건너뛴 사실은 전달한다', async t => {
  const { root, save } = await repo(t)
  await mkdir(join(root, '.ssh'))
  const before = await captureChanges(root)
  await save('.env', 'fixture value\n')
  await save('.ssh/demo.js', 'fixture value\n')
  await save('ordinary.js', 'ordinary\n')
  const after = await captureChanges(root, { head: before.head })
  assert.deepEqual(compareChanges(before, after), { files: ['ordinary.js'], partial: true })
})

test('이미 있던 파일이 무시 대상으로 바뀌어도 내용이 그대로면 이번 변경에 넣지 않는다', async t => {
  const { root, save } = await repo(t)
  await save('notes.tmp', 'existing notes\n')
  const before = await captureChanges(root)
  await save('.gitignore', 'notes.tmp\n')
  const after = await captureChanges(root, { head: before.head, previousPaths: before.fingerprints.keys() })
  assert.deepEqual(compareChanges(before, after), { files: ['.gitignore'], partial: false })
})
