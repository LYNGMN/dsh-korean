import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffLines } from '../web/src/lib/diff.js'

test('a new file is all additions', () => {
  const r = diffLines(null, 'a\nb\n')
  assert.equal(r.added, 2)
  assert.equal(r.removed, 0)
  assert.deepEqual(r.hunks[0].lines.map((l) => [l.type, l.newNo]), [['+', 1], ['+', 2]])
})

test('changes are grouped into hunks with three lines of context', () => {
  const old = Array.from({ length: 20 }, (_, i) => `line ${String(i + 1)}`).join('\n')
  const next = old.replace('line 2', 'LINE 2').replace('line 18', 'LINE 18')
  const r = diffLines(old, next)
  assert.equal(r.hunks.length, 2)
  assert.equal(r.added, 2)
  assert.equal(r.removed, 2)
  const first = r.hunks[0].lines
  assert.deepEqual(first.map((l) => l.type).join(''), ' -+   ')
  assert.equal(first.find((l) => l.type === '-').oldNo, 2)
})

test('identical text has no hunks', () => {
  assert.equal(diffLines('x\ny', 'x\ny').hunks.length, 0)
})
