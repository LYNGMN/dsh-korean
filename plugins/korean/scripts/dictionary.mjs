// 원문 스냅샷, 번역 사전, 용어집을 디스크에서 읽는다.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

function readFolder(folder) {
  const result = {}
  if (!existsSync(folder)) return result
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.json')).sort()) {
    result[file.slice(0, -'.json'.length)] = readJson(join(folder, file))
  }
  return result
}

// 버전 문자열을 비교해 가장 새 스냅샷 폴더를 고른다.
export function latestVersion(root = ROOT) {
  const versions = readdirSync(join(root, 'source'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  if (versions.length === 0) throw new Error('source/ 아래에 원문 스냅샷이 없습니다. 먼저 node scripts/extract.mjs 를 실행하세요.')
  return versions.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1)
}

const readJsonIfPresent = (path) => (existsSync(path) ? readJson(path) : {})

export function loadProject({ root = ROOT, version = latestVersion(root) } = {}) {
  const index = readJson(join(root, 'source', version, 'index.json'))
  return {
    // 메뉴 막대·업데이트 창 같은 앱 본체(메인 프로세스) 문구. 언어팩으로는 적용할 수 없고,
    // DSH 본체에 한국어를 제안할 때 쓸 번역이다.
    desktop: {
      english: readJsonIfPresent(join(root, 'source', version, 'main-en.json')),
      korean: readJsonIfPresent(join(root, 'desktop', 'ko.json'))
    },
    // 플러그인 카드의 이름·설명. 화면 사전과 달리 네임스페이스가 없고 "<패키지>:title" 같은 키를 쓴다.
    packages: {
      english: readJsonIfPresent(join(root, 'source', version, 'packages-en.json')),
      korean: readJsonIfPresent(join(root, 'packages', 'ko.json')),
      sameInEveryLanguage: index.packages?.sameInEveryLanguage ?? []
    },
    version,
    english: readFolder(join(root, 'source', version, 'en')),
    korean: readFolder(join(root, 'ko')),
    glossary: readJson(join(root, 'glossary.json')),
    sameInEveryLanguage: Object.fromEntries(
      Object.entries(index.namespaces).map(([name, entry]) => [name, entry.sameInEveryLanguage ?? []])
    )
  }
}
