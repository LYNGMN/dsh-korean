import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEngine, repositoryOf } from '../lib/engine.js'

const executable = process.env.DSH_CODE_MAP_TEST_ENGINE

test('공식 바이너리로 검색, 호출 경로 및 변경 영향을 읽는다', { skip: !executable }, async () => {
  const temp = await mkdtemp(join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'cbm-test-'))
  const runtimeDir = join(temp, 'rt')
  const cacheDir = join(temp, 'engine')
  let engine
  try {
    await mkdir(runtimeDir, { mode: 0o700 })
    const source = join(temp, 'repo')
    await mkdir(source)
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: source, stdio: 'ignore' })
    git('init', '-q')
    const exported = 'export function readCache(key) { return key }\n'
    await writeFile(join(source, 'cache.js'), exported)
    await writeFile(join(source, 'user.js'), [
      'import { readCache } from "./cache.js"',
      'export function loadUser(key) { return readCache(key) }',
      '',
    ].join('\n'))
    await writeFile(join(source, 'other.js'), 'export function unrelated(key) { return key }\n')
    await writeFile(join(source, 'otherUser.js'), [
      'import { unrelated } from "./other.js"',
      'export function otherCaller(key) { return unrelated(key) }',
      '',
    ].join('\n'))
    git('add', 'cache.js', 'user.js', 'other.js', 'otherUser.js')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false',
      'commit', '-qm', 'fixture')

    const root = await repositoryOf(source)
    engine = createEngine({ executable, cacheDir, runtimeDir })
    const { project, coverage } = await engine.index(root)
    for (const key of ['notIndexed', 'partial', 'unusable', 'skipped']) assert.equal(coverage[key], 0, key)
    assert.deepEqual(await engine.impact(root, project), { files: [], candidates: [], changed: 0, total: 0, more: false })

    const hits = await engine.search(root, project, 'readCache 함수를 확인해 줘', { auto: true })
    assert.equal(hits[0].file, 'cache.js')
    assert.equal(hits[0].kind, 'Function')
    assert.equal(hits[0].line, 1)
    const callers = await engine.callers(root, project, hits[0].id)
    assert.deepEqual(callers.candidates.map(({ name, file, line }) => ({ name, file, line })),
      [{ name: 'loadUser', file: 'user.js', line: 2 }])

    await writeFile(join(source, 'cache.js'), exported.replace('return key', 'return String(key)'))
    await writeFile(join(source, 'other.js'), 'export function unrelated(key) { return Number(key) }\n')
    await engine.index(root)
    const impact = await engine.impact(root, project)
    assert.deepEqual([...impact.files].sort(), ['cache.js', 'other.js'])
    assert.deepEqual(impact.candidates.map(row => row.file).sort(), ['otherUser.js', 'user.js'])
    const scoped = await engine.scopedImpact(root, project, ['cache.js'])
    assert.deepEqual(scoped.candidates.map(({ name, file, line }) => ({ name, file, line })),
      [{ name: 'loadUser', file: 'user.js', line: 2 }])
  } finally {
    engine?.dispose()
    if (engine) {
      // Only stop the daemon attached to this fixture's private socket.
      try {
        execFileSync(executable, ['daemon', 'stop'], {
          env: { ...process.env, CBM_RUNTIME_DIR: runtimeDir, CBM_CACHE_DIR: cacheDir }, stdio: 'ignore', timeout: 3000,
        })
      } catch { /* The fixture's last client may already have stopped it. */ }
    }
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 })
  }
})
