import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SessionCache } from '../server/gateway/session-cache.js'

const item = (seq, text = 'x') => ({ seq, time: seq, kind: 'assistant', text })

test('serves items after the cursor inside the covered range, even when items are sparse', () => {
  const c = new SessionCache({ maxBytes: 10_000 })
  c.append([item(5), item(8)], { from: 5, through: 9 })
  assert.deepEqual(c.since(5).map((i) => i.seq), [8])
  assert.deepEqual(c.since(4).map((i) => i.seq), [5, 8])
  assert.deepEqual(c.since(9), [])
})

test('answers null outside the covered range', () => {
  const c = new SessionCache({ maxBytes: 10_000 })
  c.append([item(5), item(6)], { from: 5, through: 6 })
  assert.equal(c.since(2), null)
  assert.equal(c.since(null), null)
  assert.equal(c.since(7), null, 'a cursor ahead of the cache means the phone knows something we lost')
})

test('live appends extend the covered range; dedupe by seq', () => {
  const c = new SessionCache({ maxBytes: 10_000 })
  c.append([item(3), item(4)], { from: 1, through: 4 })
  c.append([item(4, 'new'), item(5)], { from: 4, through: 6 })
  assert.deepEqual(c.since(0).map((i) => [i.seq, i.text]), [[3, 'x'], [4, 'new'], [5, 'x']])
  assert.equal(c.coveredThrough, 6)
})

test('a disjoint newer range replaces stale coverage; repair joins it back', () => {
  const c = new SessionCache({ maxBytes: 10_000 })
  c.append([item(1), item(2)], { from: 1, through: 2 })
  c.append([item(9)], { from: 8, through: 9 })
  assert.equal(c.since(2), null)
  assert.deepEqual(c.since(7).map((i) => i.seq), [9])
  c.append([item(4)], { from: 3, through: 7 })
  assert.deepEqual(c.since(2).map((i) => i.seq), [4, 9])
})

test('evicts oldest items past the byte limit and narrows coverage', () => {
  const c = new SessionCache({ maxBytes: 300 })
  c.append(Array.from({ length: 10 }, (_, i) => item(i + 1, 'y'.repeat(40))), { from: 1, through: 10 })
  assert.ok(c.bytes <= 300)
  assert.ok(c.coveredFrom > 1)
  assert.equal(c.since(0), null)
  assert.deepEqual(c.since(9).map((i) => i.seq), [10])
})
