import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBody, parseRequest } from '../src/host/request.js'

test('본문은 JSON 객체만 받는다', () => {
  assert.deepEqual(parseBody('{"a":1}'), { a: 1 })
  assert.throws(() => parseBody('not json'), { code: 'bad-request' })
  assert.throws(() => parseBody('[]'), { code: 'bad-request' })
  assert.throws(() => parseBody('null'), { code: 'bad-request' })
})

test('preflight와 move 요청만 받는다', () => {
  assert.deepEqual(parseRequest({ action: 'preflight', sessionId: 'session-1' }), { action: 'preflight', sessionId: 'session-1' })
  assert.deepEqual(
    parseRequest({ action: 'move', sessionId: 'session-1', targetWorkspaceId: 'ws-2' }),
    { action: 'move', sessionId: 'session-1', targetWorkspaceId: 'ws-2' },
  )
  assert.deepEqual(
    parseRequest({ action: 'queue', sessionId: 'session-1', targetWorkspaceId: 'ws-2' }),
    { action: 'queue', sessionId: 'session-1', targetWorkspaceId: 'ws-2' },
  )
  assert.deepEqual(
    parseRequest({ action: 'cancel', sessionId: 'session-1' }),
    { action: 'cancel', sessionId: 'session-1' },
  )
  assert.deepEqual(
    parseRequest({ action: 'delete', sessionId: 'session-1' }),
    { action: 'delete', sessionId: 'session-1' },
  )
  assert.throws(() => parseRequest({ action: 'remove', sessionId: 'session-1' }), { code: 'bad-request' })
  assert.throws(() => parseRequest({ action: 'move', sessionId: 'session-1' }), { code: 'bad-request' })
  assert.throws(() => parseRequest({ action: 'move', targetWorkspaceId: 'ws-2' }), { code: 'bad-request' })
  assert.throws(() => parseRequest({ action: 'preflight', sessionId: '' }), { code: 'bad-request' })
  assert.throws(() => parseRequest({ action: 'preflight', sessionId: 'x'.repeat(201) }), { code: 'bad-request' })
  assert.throws(() => parseRequest({ action: 'preflight', sessionId: 7 }), { code: 'bad-request' })
})
