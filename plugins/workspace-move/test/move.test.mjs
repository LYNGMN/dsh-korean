import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { journalPath, readJournal, writeJournal } from '../src/host/journal.js'
import { makeWorld, seedSession } from './world.mjs'

async function journalOf(world) {
  return readJournal(fsp, journalPath(world.dataDir))
}

async function eventsOf(world, id) {
  const handle = await world.persistence.open(id, 'read')
  try {
    return (await handle.read(0)).events
  } finally {
    await handle.close()
  }
}

test('세션을 다른 작업공간으로 옮기고 기록·소유·파일을 맞춘다', async () => {
  const world = await makeWorld()
  try {
    const { id, events, originalDir } = await seedSession(world)
    const result = await world.service.move({ sessionId: id, targetWorkspaceId: world.wsB.id })
    assert.deepEqual(result, { moved: true, sessionId: id, fromWorkspaceId: world.wsA.id, toWorkspaceId: world.wsB.id })

    assert.deepEqual(world.wsA.sessionIds, [])
    assert.deepEqual(world.wsB.sessionIds, [id])

    const snapshot = await world.persistence.stat(id)
    assert.equal(snapshot.header.cwd, world.workB)
    assert.notEqual(path.dirname(snapshot.location.path), originalDir)
    assert.deepEqual(await eventsOf(world, id), events)

    await assert.rejects(fsp.access(originalDir), { code: 'ENOENT' })
    assert.deepEqual(await journalOf(world), [])
    const backups = await fsp.readdir(path.join(world.dataDir, 'backups'))
    assert.equal(backups.length, 1)
  } finally {
    await world.cleanup()
  }
})

test('작업 폴더를 바꾼 기록이 있으면 마지막에 대상 경로로 다시 남긴다', async () => {
  const world = await makeWorld()
  try {
    const { id } = await seedSession(world, {
      events: [
        { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
        { type: 'working-directory/change', seq: 1, time: 2, data: { cwd: world.workA } },
        { type: 'turn/end', seq: 2, time: 3, data: { turn: 1, reason: { kind: 'completed' } } },
      ],
    })
    await world.service.move({ sessionId: id, targetWorkspaceId: world.wsB.id })
    const events = await eventsOf(world, id)
    assert.equal(events.length, 4)
    assert.equal(events.at(-1).type, 'working-directory/change')
    assert.equal(events.at(-1).data.cwd, world.workB)
    assert.equal(events.at(-1).seq, 3)
  } finally {
    await world.cleanup()
  }
})

test('하위 에이전트 세션과 같은 작업공간, 없는 폴더는 거절한다', async () => {
  const world = await makeWorld()
  try {
    const sub = await seedSession(world, { header: { origin: 'subagent' } })
    await assert.rejects(
      () => world.service.move({ sessionId: sub.id, targetWorkspaceId: world.wsB.id }),
      { code: 'session-subagent' },
    )

    const normal = await seedSession(world)
    await assert.rejects(
      () => world.service.move({ sessionId: normal.id, targetWorkspaceId: world.wsA.id }),
      { code: 'same-workspace' },
    )

    const missing = await seedSession(world)
    await fsp.rm(world.workB, { recursive: true })
    await assert.rejects(
      () => world.service.move({ sessionId: missing.id, targetWorkspaceId: world.wsB.id }),
      { code: 'workspace-missing-dir' },
    )
  } finally {
    await world.cleanup()
  }
})

test('새 로그를 쓰다 실패하면 원래 상태로 되돌린다', async () => {
  const world = await makeWorld()
  try {
    const { id, originalDir } = await seedSession(world)
    const create = world.persistence.create.bind(world.persistence)
    world.persistence.create = async () => { throw new Error('disk full') }

    await assert.rejects(
      () => world.service.move({ sessionId: id, targetWorkspaceId: world.wsB.id }),
      { code: 'storage-failed' },
    )

    const snapshot = await world.persistence.stat(id)
    assert.equal(snapshot.header.cwd, world.workA)
    assert.equal(path.dirname(snapshot.location.path), originalDir)
    await fsp.access(originalDir)
    assert.deepEqual(world.wsA.sessionIds, [id])
    assert.deepEqual(world.wsB.sessionIds, [])
    assert.deepEqual(await journalOf(world), [])
    assert.equal((await eventsOf(world, id)).length, 2)
    world.persistence.create = create
  } finally {
    await world.cleanup()
  }
})

test('레지스트리 갱신이 실패하면 원래 작업공간으로 되돌린다', async () => {
  const world = await makeWorld()
  try {
    const { id } = await seedSession(world)
    const attach = world.wsB.attachSession.bind(world.wsB)
    world.wsB.attachSession = async () => { throw new Error('registry busy') }

    await assert.rejects(
      () => world.service.move({ sessionId: id, targetWorkspaceId: world.wsB.id }),
      { code: 'registry-failed' },
    )

    assert.equal((await world.persistence.stat(id)).header.cwd, world.workA)
    assert.deepEqual(world.wsA.sessionIds, [id])
    assert.deepEqual(world.wsB.sessionIds, [])
    assert.deepEqual(await journalOf(world), [])
    world.wsB.attachSession = attach
  } finally {
    await world.cleanup()
  }
})

function crashEntry(world, seed, overrides = {}) {
  return {
    id: seed.id,
    phase: 'relocated',
    from: {
      workspaceId: world.wsA.id,
      dir: seed.originalDir,
      projectDir: path.dirname(seed.originalDir),
      cwd: world.workA,
    },
    to: { workspaceId: world.wsB.id, path: world.workB },
    quarantine: path.join(world.dataDir, 'quarantine', `crash-${seed.id}`),
    backup: path.join(world.dataDir, 'backups', `crash-${seed.id}`),
    appendedDirectoryChange: false,
    eventCount: seed.events.length,
    startedAt: Date.now(),
    ...overrides,
  }
}

test('새 로그를 만들기 전에 죽으면 다음 시작 때 원래 자리로 되돌린다', async () => {
  const world = await makeWorld()
  try {
    const seed = await seedSession(world)
    const entry = crashEntry(world, seed)
    await fsp.mkdir(path.dirname(entry.quarantine), { recursive: true })
    await fsp.rename(seed.originalDir, entry.quarantine)
    await writeJournal(fsp, journalPath(world.dataDir), [entry])

    await world.service.recover()

    const snapshot = await world.persistence.stat(seed.id)
    assert.equal(snapshot.header.cwd, world.workA)
    await fsp.access(seed.originalDir)
    await assert.rejects(fsp.access(entry.quarantine), { code: 'ENOENT' })
    assert.deepEqual(world.wsA.sessionIds, [seed.id])
    assert.deepEqual(await journalOf(world), [])
  } finally {
    await world.cleanup()
  }
})

test('새 로그를 만든 뒤 죽으면 레지스트리만 마무리한다', async () => {
  const world = await makeWorld()
  try {
    const seed = await seedSession(world)
    const entry = crashEntry(world, seed)
    await fsp.mkdir(path.dirname(entry.quarantine), { recursive: true })
    await fsp.rename(seed.originalDir, entry.quarantine)
    const created = await world.persistence.create({ ...seed.snapshot.header, cwd: world.workB })
    await created.append(seed.events)
    await created.flush()
    await created.close()
    await writeJournal(fsp, journalPath(world.dataDir), [entry])

    await world.service.recover()

    assert.deepEqual(world.wsA.sessionIds, [])
    assert.deepEqual(world.wsB.sessionIds, [seed.id])
    assert.equal((await world.persistence.stat(seed.id)).header.cwd, world.workB)
    await assert.rejects(fsp.access(entry.quarantine), { code: 'ENOENT' })
    assert.deepEqual(await journalOf(world), [])
  } finally {
    await world.cleanup()
  }
})

test('원본도 새 로그도 없으면 저널을 남겨 사람이 볼 수 있게 한다', async () => {
  const world = await makeWorld()
  try {
    const seed = await seedSession(world)
    const entry = crashEntry(world, seed)
    const hidden = path.join(world.dir, 'hidden')
    await fsp.rename(seed.originalDir, hidden)
    await writeJournal(fsp, journalPath(world.dataDir), [entry])

    await world.service.recover()

    const remaining = await journalOf(world)
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].id, seed.id)
    await fsp.access(hidden)
  } finally {
    await world.cleanup()
  }
})

test('백업은 설정한 개수만 남긴다', async () => {
  const world = await makeWorld({ keepBackups: 2 })
  try {
    for (let index = 0; index < 3; index += 1) {
      const { id } = await seedSession(world)
      await world.service.move({ sessionId: id, targetWorkspaceId: world.wsB.id })
    }
    const backups = await fsp.readdir(path.join(world.dataDir, 'backups'))
    assert.equal(backups.length, 2)
  } finally {
    await world.cleanup()
  }
})

test('미리 확인은 소유·열림·차단 이유를 알려 준다', async () => {
  const world = await makeWorld()
  try {
    const { id } = await seedSession(world)
    const info = await world.service.preflight({ sessionId: id })
    assert.equal(info.sourceWorkspaceId, world.wsA.id)
    assert.equal(info.open, false)
    assert.equal(info.blocked, null)

    const writer = await world.persistence.open(id, 'write')
    const busy = await world.service.preflight({ sessionId: id })
    assert.equal(busy.open, true)
    assert.equal(busy.blocked, null)
    await writer.close()
  } finally {
    await world.cleanup()
  }
})

test('알 수 없는 세션은 session-not-found로 답한다', async () => {
  const world = await makeWorld()
  try {
    await assert.rejects(
      () => world.service.move({ sessionId: 'session-missing', targetWorkspaceId: world.wsB.id }),
      { code: 'session-not-found' },
    )
  } finally {
    await world.cleanup()
  }
})

test('새 로그가 일부만 쓰인 채 죽으면 그 로그를 버리고 원본을 되살린다', async () => {
  const world = await makeWorld()
  try {
    const seed = await seedSession(world)
    const entry = crashEntry(world, seed)
    await fsp.mkdir(path.dirname(entry.quarantine), { recursive: true })
    await fsp.rename(seed.originalDir, entry.quarantine)
    const partial = await world.persistence.create({ ...seed.snapshot.header, cwd: world.workB })
    await partial.append([seed.events[0]])
    await partial.flush()
    await partial.close()
    await writeJournal(fsp, journalPath(world.dataDir), [entry])

    await world.service.recover()

    const snapshot = await world.persistence.stat(seed.id)
    assert.equal(snapshot.header.cwd, world.workA)
    assert.equal(path.dirname(snapshot.location.path), seed.originalDir)
    assert.deepEqual(world.wsA.sessionIds, [seed.id])
    assert.deepEqual(world.wsB.sessionIds, [])
    assert.deepEqual(await journalOf(world), [])
    assert.equal((await eventsOf(world, seed.id)).length, 2)
  } finally {
    await world.cleanup()
  }
})

test('한도를 넘는 로그는 이동도 예약도 거절한다', async () => {
  const world = await makeWorld({ maxArtifactBytes: 1 })
  try {
    const { id } = await seedSession(world)
    await assert.rejects(
      () => world.service.move({ sessionId: id, targetWorkspaceId: world.wsB.id }),
      { code: 'too-large' },
    )
    await assert.rejects(
      () => world.service.queue({ sessionId: id, targetWorkspaceId: world.wsB.id }),
      { code: 'too-large' },
    )
  } finally {
    await world.cleanup()
  }
})
test('열린 대화는 바로 이동하지 않고 예약을 안내한다', async () => {
  const world = await makeWorld()
  try {
    const { id } = await seedSession(world)
    const writer = await world.persistence.open(id, 'write')
    await assert.rejects(
      () => world.service.move({ sessionId: id, targetWorkspaceId: world.wsB.id }),
      { code: 'session-open' },
    )
    await writer.close()
  } finally {
    await world.cleanup()
  }
})

test('다시 켠 뒤 그대로 이동: 예약한 이동을 다음 시작 때 같은 id로 끝낸다', async () => {
  const world = await makeWorld()
  try {
    const { id, originalDir } = await seedSession(world)
    const writer = await world.persistence.open(id, 'write')
    const queued = await world.service.queue({ sessionId: id, targetWorkspaceId: world.wsB.id })
    assert.equal(queued.queued, true)
    await writer.close()

    // 앱 재시작을 흉내 낸다: 같은 데이터 폴더로 새 서비스를 만든다.
    const restarted = (await import('../src/host/move.js')).createMoveService({
      persistence: world.persistence,
      registry: world.registry,
      fs: fsp,
      dataDir: world.dataDir,
      settings: { maxArtifactBytes: 1024 * 1024, keepBackups: 2 },
      logger: { info() {}, warn() {}, error() {} },
      clock: () => Date.now(),
    })
    await restarted.ready

    const snapshot = await world.persistence.stat(id)
    assert.equal(snapshot.header.cwd, world.workB)
    assert.equal(path.dirname(snapshot.location.path) === originalDir, false)
    assert.deepEqual(world.wsB.sessionIds, [id])
    assert.deepEqual(world.wsA.sessionIds, [])
    assert.equal(world.registry.archived.has(id), false)
    await assert.rejects(fsp.access(originalDir), { code: 'ENOENT' })
  } finally {
    await world.cleanup()
  }
})

test('예약을 취소하면 대기열에서 빠진다', async () => {
  const world = await makeWorld()
  try {
    const { id } = await seedSession(world)
    const writer = await world.persistence.open(id, 'write')
    await world.service.queue({ sessionId: id, targetWorkspaceId: world.wsB.id })
    const status = await world.service.pending()
    assert.equal(status.pending.length, 1)
    assert.equal(status.pending[0].targetTitle, 'b')
    const cancelled = await world.service.cancel({ sessionId: id })
    assert.deepEqual(cancelled, { cancelled: true })
    assert.deepEqual(await world.service.cancel({ sessionId: id }), { cancelled: false })
    await writer.close()
  } finally {
    await world.cleanup()
  }
})

test('대화를 삭제하면 작업공간에서 빼고 로그를 휴지통으로 옮긴다', async () => {
  const world = await makeWorld()
  try {
    const { id, originalDir } = await seedSession(world)
    await world.registry.archiveSession(id)

    const result = await world.service.delete({ sessionId: id })

    assert.equal(result.deleted, true)
    assert.equal(result.live, false)
    assert.equal(await world.persistence.stat(id), undefined)
    assert.deepEqual(world.wsA.sessionIds, [])
    assert.equal(world.registry.archived.has(id), false)
    await assert.rejects(fsp.access(originalDir), { code: 'ENOENT' })
    const trash = await fsp.readdir(world.trashDir)
    assert.equal(trash.length, 1)
    assert.match(trash[0], new RegExp(`^${id}-deleted-`))
  } finally {
    await world.cleanup()
  }
})

test('열린 대화도 삭제할 수 있고, 아직 살아 있음을 알려 준다', async () => {
  const world = await makeWorld()
  try {
    const { id } = await seedSession(world)
    const writer = await world.persistence.open(id, 'write')
    const result = await world.service.delete({ sessionId: id })
    assert.equal(result.deleted, true)
    assert.equal(result.live, true)
    assert.equal(await world.persistence.stat(id), undefined)
    assert.equal(world.registry.archived.has(id), true)
    await writer.close()
  } finally {
    await world.cleanup()
  }
})

// 저널 파일을 n번째로 쓸 때부터 state.broken이 true인 동안 실패하게 만든다
// (1=prepared, 2=relocated, 3=materialized, 4=registry, 5=마지막 삭제).
function failingJournalFs(failFrom, state) {
  return base => {
    let writes = 0
    return {
      ...base,
      async open(file, ...rest) {
        if (String(file).includes('journal.json') && state.broken && ++writes >= failFrom) {
          throw new Error('disk full')
        }
        return base.open(file, ...rest)
      },
    }
  }
}

for (const failFrom of [4, 5]) {
  test(`저널 ${failFrom}번째 저장이 실패해도 이동한 대화는 열리고, 다음 복구가 정리한다`, async () => {
    const state = { broken: true }
    const world = await makeWorld({ wrapFs: failingJournalFs(failFrom, state) })
    try {
      const { id, events, originalDir } = await seedSession(world)
      const result = await world.service.move({ sessionId: id, targetWorkspaceId: world.wsB.id })
      assert.equal(result.moved, true)

      const snapshot = await world.persistence.stat(id)
      assert.equal(snapshot.header.cwd, world.workB)
      assert.notEqual(path.dirname(snapshot.location.path), originalDir)
      assert.deepEqual(await eventsOf(world, id), events)
      assert.deepEqual(world.wsA.sessionIds, [])
      assert.deepEqual(world.wsB.sessionIds, [id])
      assert.equal((await journalOf(world)).length, 1)

      // 저장소가 다시 정상이 된 뒤의 복구는 대화를 그대로 두고 정리만 끝낸다.
      state.broken = false
      await world.service.recover()
      assert.deepEqual(await journalOf(world), [])
      assert.deepEqual(await eventsOf(world, id), events)
      assert.deepEqual(world.wsB.sessionIds, [id])
      await assert.rejects(fsp.access(originalDir), { code: 'ENOENT' })
    } finally {
      await world.cleanup()
    }
  })
}
