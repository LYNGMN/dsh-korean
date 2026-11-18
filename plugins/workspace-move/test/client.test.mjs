import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { moveApi, moveWithRetry } from '../src/client/api.js'
import { errorText } from '../src/client/copy.js'
import { dropTargetFor, groupMapOf, parseRowKey } from '../src/client/dnd.js'
import { applyPendingStatus, pendingStore } from '../src/client/pending-store.js'
import { targetRows, targetWorkspaces } from '../src/client/targets.js'

const workspace = (id, title, workspacePath) => ({ workspaceId: id, title, path: workspacePath })

test('현재 작업공간은 대상 목록에서 뺀다', () => {
  const items = [
    workspace('a', 'A', '/work/a'),
    workspace('b', 'B', '/work/b'),
  ]
  assert.deepEqual(targetWorkspaces(items, 'a').map(item => item.workspaceId), ['b'])
  assert.deepEqual(targetWorkspaces(items, null).map(item => item.workspaceId), ['a', 'b'])
})

test('제목이 다르면 꼬리 경로를 붙이지 않고, 겹치면 구분되는 만큼만 붙인다', () => {
  const unique = targetRows([
    workspace('a', 'A', '/work/a'),
    workspace('b', 'B', '/work/team/b'),
  ], 'a')
  assert.deepEqual(unique.map(row => row.suffix), [''])

  const duplicated = targetRows([
    workspace('x', '작업', '/work/alpha/작업'),
    workspace('y', '작업', '/work/beta/작업'),
    workspace('z', '다른', '/work/other'),
  ], null)
  assert.equal(duplicated[0].suffix, 'alpha/작업')
  assert.equal(duplicated[1].suffix, 'beta/작업')
  assert.equal(duplicated[2].suffix, '')
})

test('오류 코드를 한국어 안내로 바꾼다', () => {
  assert.match(errorText({ code: 'session-open' }), /열려 있어요/)
  assert.match(errorText({ code: 'too-large' }), /너무 커서/)
  assert.match(errorText({ code: 'unknown-code' }), /다시 시도해 주세요/)
  assert.match(errorText(undefined), /다시 시도해 주세요/)
})

test('API는 성공 값을 풀고 실패 코드를 보존한다', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, value: { moved: true } }), { status: 200 })
    assert.deepEqual(await moveApi({ action: 'preflight', sessionId: 's' }), { moved: true })

    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: { code: 'session-open', message: 'x' } }), { status: 200 })
    await assert.rejects(() => moveApi({ action: 'move' }), { code: 'session-open' })

    globalThis.fetch = async () => new Response('unauthorized', { status: 401 })
    await assert.rejects(() => moveApi({ action: 'move' }), { code: 'unauthorized' })

    globalThis.fetch = async () => { throw new TypeError('offline') }
    await assert.rejects(() => moveApi({ action: 'move' }), { code: 'network' })
  } finally {
    globalThis.fetch = original
  }
})

test('만들어진 화면 번들은 약속한 id와 두 자리를 쓴다', () => {
  const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(bundle, /^\s{0,2}id: '@lyngmn\/dsh-workspace-move',$/m)
  assert.match(bundle, /contextMenus\.register/)
  assert.match(bundle, /contextMenu\.icon/)
  assert.match(bundle, /'workspace\.delete'/)
  assert.doesNotMatch(bundle, /sidebar\.workspaces\.session\.menu\.item/)
  assert.match(bundle, /shell\.overlay/)
  assert.match(bundle, /dsh-workspace-move\.dialog/)
  assert.doesNotMatch(bundle, /^\s*(import|export)\b/m)
  assert.match(bundle, /작업공간 이동/)
  assert.match(bundle, /그대로 이동해요/)
  assert.match(bundle, /다시 켜고 그대로 이동/)
  assert.match(bundle, /세션 삭제/)
  assert.match(bundle, /기록은 휴지통으로 옮겼어요/)
  assert.match(bundle, /data-dwm-drop/)
  assert.match(bundle, /uiWorkspace/)
})

test('끌어놓기 행 키에서 작업공간과 세션을 읽는다', () => {
  assert.deepEqual(parseRowKey('workspace:ws-1'), { kind: 'workspace', group: 'ws-1' })
  assert.deepEqual(parseRowKey('session:session-1'), { kind: 'session', id: 'session-1' })
  assert.deepEqual(parseRowKey('overflow:ws-1'), { kind: 'overflow', group: 'ws-1' })
  assert.deepEqual(parseRowKey('empty'), { kind: 'empty' })
  assert.deepEqual(parseRowKey('nope'), { kind: 'other' })
})

test('행 순서에서 각 행의 작업공간을 계산한다', () => {
  const keys = ['workspace:a', 'session:s1', 'overflow:a', 'workspace:b', 'session:s2', 'workspace:', 'session:s3']
  const groups = groupMapOf(keys)
  assert.equal(groups.get('session:s1'), 'a')
  assert.equal(groups.get('overflow:a'), 'a')
  assert.equal(groups.get('session:s2'), 'b')
  assert.equal(groups.get('session:s3'), '')
})

test('다른 작업공간 위에서만 드롭을 받는다', () => {
  const groups = groupMapOf(['workspace:a', 'session:s1', 'workspace:b', 'session:s2', 'workspace:', 'session:s3'])
  assert.equal(dropTargetFor('workspace:b', 'a', groups), 'b')
  assert.equal(dropTargetFor('session:s2', 'a', groups), 'b')
  assert.equal(dropTargetFor('session:s1', 'a', groups), null)
  assert.equal(dropTargetFor('workspace:a', 'a', groups), null)
  assert.equal(dropTargetFor('session:s3', 'a', groups), null)
  assert.equal(dropTargetFor('empty', 'a', groups), null)
})

test('session-open이면 잠깐 기다렸다 다시 옮긴다', async () => {
  const original = globalThis.fetch
  try {
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      if (calls < 3) {
        return new Response(JSON.stringify({ ok: false, error: { code: 'session-open', message: 'x' } }), { status: 200 })
      }
      return new Response(JSON.stringify({ ok: true, value: { moved: true } }), { status: 200 })
    }
    assert.deepEqual(await moveWithRetry({ action: 'move' }, { attempts: 4, waitMs: 0 }), { moved: true })
    assert.equal(calls, 3)

    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: { code: 'too-large', message: 'x' } }), { status: 200 })
    await assert.rejects(() => moveWithRetry({ action: 'move' }, { attempts: 4, waitMs: 0 }), { code: 'too-large' })
  } finally {
    globalThis.fetch = original
  }
})

test('예약 목록을 받아 세션별 대상 작업공간을 기억한다', () => {
  const completed = applyPendingStatus({
    pending: [{ sessionId: 'session-queued', targetTitle: 'Dev' }],
    completed: [{ sessionId: 'session-done', targetTitle: 'RSS알리미' }],
  })
  assert.equal(pendingStore.get()['session-queued'], 'Dev')
  assert.deepEqual(completed.map(entry => entry.sessionId), ['session-done'])
})
