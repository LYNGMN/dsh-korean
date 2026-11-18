#!/usr/bin/env node
// src/client.template.js에 순수 모듈(src/*.js)과 src/style.css를 넣어 lib/client.js를 만든다.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

// 의존 순서대로. 모듈끼리의 import는 이어 붙이면서 지운다.
export const PURE_MODULES = ['src/stages.js', 'src/stage-text.js', 'src/code-summary.js', 'src/source.js']
const LOCAL_IMPORT = /^import [^\n]* from '\.\/[\w-]+\.js'\n/gm

export function inline(source, file) {
  const body = source
    .replace(LOCAL_IMPORT, '')
    .split('\n')
    .filter(line => !line.startsWith('//'))
    .join('\n')
    .replace(/^export /gm, '')
    .trim()
  if (/^\s*import\b/m.test(body)) throw new Error(`${file}: 같은 폴더 모듈 말고는 import 없이 써야 번들에 들어갑니다`)
  return body
}

export function render({ template, modules, css, version }) {
  const pure = modules.map(({ file, source }) => inline(source, file)).join('\n\n')
  return template
    .replace('__VERSION__', () => JSON.stringify(version))
    .replace('__CSS__', () => JSON.stringify(css.trim()))
    .replace('__PURE__', () => pure.replace(/\n/g, '\n    '))
}

export function build(root = ROOT) {
  const read = file => readFileSync(join(root, file), 'utf8')
  return render({
    template: read('src/client.template.js'),
    modules: PURE_MODULES.map(file => ({ file, source: read(file) })),
    css: read('src/style.css'),
    version: JSON.parse(read('package.json')).version,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = build()
  writeFileSync(join(ROOT, 'lib/client.js'), output)
  console.log(`lib/client.js 생성: ${(output.length / 1024).toFixed(1)}KB`)
}
