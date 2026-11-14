import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const pkg = JSON.parse(read('package.json'))

test('플러그인 카드 아이콘은 출처를 밝힌 36칸 SVG다', () => {
  assert.equal(pkg.exports['./icon'], './icon.svg')
  const svg = read('icon.svg')
  assert.match(svg, /viewBox="0 0 36 36"/)
  assert.match(svg, /<!-- (Lucide "[a-z0-9-]+" \(ISC License|.*official)/i, '아이콘 출처(Lucide 또는 공식 로고)를 주석으로 남긴다')
})

test('플러그인 카드 제목과 설명은 한국어가 기본이다', () => {
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  const ko = JSON.parse(read('locale/ko.json')).meta
  assert.match(ko.title, /[가-힣]/)
  assert.match(ko.description, /[가-힣]/)
  const en = JSON.parse(read('locale/en.json')).meta
  assert.ok(en.title && en.description)
})
