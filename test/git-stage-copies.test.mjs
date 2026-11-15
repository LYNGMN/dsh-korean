// 작업 단계 규칙과 Git 읽기는 플러그인 사이 공용 패키지 없이 휴대폰 앱이 복사해 쓴다. 두 벌이 늘 같은지 본다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = new URL('..', import.meta.url).pathname
const read = (path) => readFileSync(join(ROOT, path), 'utf8')

const COPIES = [
  ['plugins/git-stage/src/stages.js', 'plugins/handheld/web/src/lib/stages.js'],
  ['plugins/git-stage/lib/git-read.js', 'plugins/handheld/server/gateway/git-read.js'],
]

for (const [source, copy] of COPIES) {
  test(`${copy}는 ${source}와 같다`, () => {
    assert.equal(read(copy), read(source), `${source}를 고쳤으면 ${copy}에도 그대로 복사한다`)
  })
}
