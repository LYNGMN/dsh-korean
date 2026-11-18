// 플러그인 사이 공용 패키지 없이 휴대폰 앱이 복사해 쓰는 파일을 원본에서 다시 복사한다. `npm run sync`.
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** [원본, 사본] — 원본만 고치고 이 스크립트로 맞춘다. */
export const COPIES = [
  ['plugins/git-stage/src/stages.js', 'plugins/handheld/web/src/lib/stages.js'],
  ['plugins/git-stage/src/stages.js', 'plugins/handheld/server/gateway/stages.js'],
  ['plugins/git-stage/lib/git-read.js', 'plugins/handheld/server/gateway/git-read.js'],
]

export function syncCopies(root = ROOT) {
  const changed = []
  for (const [source, copy] of COPIES) {
    const from = join(root, source)
    const to = join(root, copy)
    if (existsSync(to) && readFileSync(from, 'utf8') === readFileSync(to, 'utf8')) continue
    copyFileSync(from, to)
    changed.push(copy)
  }
  return changed
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const changed = syncCopies()
  console.log(changed.length ? `사본을 맞췄어요: ${changed.join(', ')}` : '사본이 모두 원본과 같아요.')
}
