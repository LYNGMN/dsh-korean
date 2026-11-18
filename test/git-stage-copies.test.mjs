// 작업 단계 규칙과 Git 읽기는 플러그인 사이 공용 패키지 없이 휴대폰 앱이 복사해 쓴다. 두 벌이 늘 같은지 본다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { COPIES, ROOT } from '../scripts/sync-copies.mjs'

const read = (path) => readFileSync(join(ROOT, path), 'utf8')

for (const [source, copy] of COPIES) {
  test(`${copy}는 ${source}와 같다`, () => {
    assert.equal(read(copy), read(source), `${source}를 고쳤으면 루트에서 npm run sync를 돌려 ${copy}에 복사한다`)
  })
}
