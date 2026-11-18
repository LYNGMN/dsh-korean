import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FOLD_CHARS, FOLD_LINES, isLongMessage } from '../web/src/lib/fold.js'

test('short messages stay whole', () => {
  assert.equal(isLongMessage('안녕'), false)
  assert.equal(isLongMessage('가'.repeat(FOLD_CHARS)), false)
  assert.equal(isLongMessage(Array.from({ length: FOLD_LINES }, () => 'a').join('\n')), false)
})

test('many characters or many lines fold the message', () => {
  assert.equal(isLongMessage('가'.repeat(FOLD_CHARS + 1)), true)
  assert.equal(isLongMessage(Array.from({ length: FOLD_LINES + 1 }, () => 'a').join('\n')), true)
})

test('a non-string text never folds', () => {
  assert.equal(isLongMessage(undefined), false)
})
