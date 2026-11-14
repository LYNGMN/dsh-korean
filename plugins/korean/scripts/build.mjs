#!/usr/bin/env node
// ko/*.json과 src/client.template.js로 lib/client.js를 만든다. 검사가 실패하면 만들지 않는다.
// 사용법: node scripts/build.mjs [--allow-incomplete]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { check } from './check.mjs'
import { loadProject, ROOT } from './dictionary.mjs'

// 카드 문구는 영어 원문 → 한국어 표로 넣는다. 원문과 같은 값은 바꿀 것이 없으니 뺀다.
export function packageTextOf({ english = {}, korean = {} } = {}) {
  const pairs = Object.keys(english).sort()
    .filter((key) => typeof korean[key] === 'string' && korean[key] !== '' && korean[key] !== english[key])
    .map((key) => [english[key], korean[key]])
  return Object.fromEntries(pairs)
}

// 시험에서 글꼴 고르기 없이 틀만 볼 때 쓰는 빈 대역.
const NO_FONT_PICKER = 'function fontPicker() { return { inject: [], apply() {} } }'

export function render({ template, korean, packages, fontPicker = NO_FONT_PICKER, packVersion, appVersion }) {
  const dictionaries = Object.fromEntries(
    Object.keys(korean).sort().filter((name) => Object.keys(korean[name]).length > 0).map((name) => [name, korean[name]])
  )
  return template
    .replace('__PACK__', () => JSON.stringify({ version: packVersion, appVersion }))
    .replace('__DICTIONARIES__', () => JSON.stringify(dictionaries, null, 2).replace(/\n/g, '\n    '))
    .replace('__FONT_PICKER__', () => fontPicker.trimEnd().replace(/\n/g, '\n    '))
    .replace('__PACKAGE_TEXT__', () => JSON.stringify(packageTextOf(packages), null, 2).replace(/\n/g, '\n    '))
}

export function build({ root = ROOT, allowIncomplete = false } = {}) {
  const project = loadProject({ root })
  const { issues } = check({ ...project, allowIncomplete })
  if (issues.length > 0) return { ok: false, issues }
  const output = render({
    template: readFileSync(join(root, 'src/client.template.js'), 'utf8'),
    korean: project.korean,
    packages: project.packages,
    fontPicker: readFileSync(join(root, 'src/font-picker.js'), 'utf8'),
    packVersion: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
    appVersion: project.version
  })
  return { ok: true, output, project }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = build({ allowIncomplete: process.argv.includes('--allow-incomplete') })
  if (!result.ok) {
    console.error(`검사에서 문제 ${result.issues.length}건이 나와 빌드하지 않았습니다. node scripts/check.mjs 로 확인하세요.`)
    process.exitCode = 1
  } else {
    writeFileSync(join(ROOT, 'lib/client.js'), result.output)
    const namespaces = Object.keys(result.project.korean).length
    const cards = Object.keys(packageTextOf(result.project.packages)).length
    console.log(`lib/client.js 생성: 네임스페이스 ${namespaces}개, 플러그인 카드 문구 ${cards}개, ${(result.output.length / 1024).toFixed(0)}KB`)
  }
}
