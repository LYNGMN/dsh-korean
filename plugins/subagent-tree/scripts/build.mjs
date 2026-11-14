#!/usr/bin/env node
// src/client.template.js에 src/tree.js·src/style.css를 넣어 lib/client.js를 만든다.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

export function render({ template, tree, css, version }) {
  const body = tree
    .split('\n')
    .filter(line => !line.startsWith('//'))
    .join('\n')
    .replace(/^export /gm, '')
    .trim()
  if (/\bimport\b/.test(body)) throw new Error('src/tree.js는 import 없이 써야 번들에 들어갑니다')
  return template
    .replace('__VERSION__', () => JSON.stringify(version))
    .replace('__CSS__', () => JSON.stringify(css.trim()))
    .replace('__TREE__', () => body.replace(/\n/g, '\n    '))
}

export function build(root = ROOT) {
  const read = file => readFileSync(join(root, file), 'utf8')
  return render({
    template: read('src/client.template.js'),
    tree: read('src/tree.js'),
    css: read('src/style.css'),
    version: JSON.parse(read('package.json')).version,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = build()
  writeFileSync(join(ROOT, 'lib/client.js'), output)
  console.log(`lib/client.js 생성: ${(output.length / 1024).toFixed(1)}KB`)
}
