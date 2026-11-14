import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'web', 'dist')

function files(dir) {
  return fs.readdirSync(dir, { recursive: true })
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .map((name) => name.split(path.sep).join('/'))
    .sort()
}

// The kit installs by linking this folder, so the committed web/dist is what phones get.
test('저장소에 든 휴대폰 화면 빌드물이 지금 소스로 다시 빌드한 것과 같다', (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-handheld-dist-'))
  t.after(() => fs.rmSync(out, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [path.join(ROOT, 'web', 'build.mjs'), out], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'web/dist가 없으면 npm run build 뒤 커밋한다')
  assert.deepEqual(files(DIST), files(out), '빌드물이 오래됐으면 npm run build 뒤 web/dist를 커밋한다')
  for (const name of files(out)) {
    assert.ok(fs.readFileSync(path.join(DIST, name)).equals(fs.readFileSync(path.join(out, name))), `${name}이 소스와 다르다: npm run build 뒤 커밋한다`)
  }
})
