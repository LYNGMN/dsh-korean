// 이동의 전부: 확인 → 저널 → 백업 → 격리 → 새 로그 → 검증 → 레지스트리 → 정리.
// 실패하면 원래 자리로 되돌리고, 앱이 죽으면 다음 시작 때 recover()가 이어서 마무리하거나 되돌린다.
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { ERROR, MoveError, isNamedError, moveError } from './errors.js'
import { journalPath, readJournal, removeEntry, updateEntry, upsertEntry, writeJournal } from './journal.js'
import { pendingPath, readPending, writePending } from './pending.js'
import { backupStamp, decideRecovery, needsDirectoryChange, ownerOf } from './plan.js'
import { parseBody, parseRequest } from './request.js'

const READ_BATCH = 100
const APPEND_BATCH = 100
const SMALL_LOG_BYTES = 1024 * 1024

const enoent = error => error !== null && typeof error === 'object' && error.code === 'ENOENT'

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function wireError(error, logger) {
  if (error instanceof MoveError) return { code: error.code, message: error.message }
  logger?.warn(`[workspace-move] unexpected failure: ${String(error)}`)
  return { code: ERROR.storageFailed, message: 'the move did not finish; the previous state was restored' }
}

export function createMoveService(options) {
  const { persistence, registry, fs, dataDir, settings, logger } = options
  const clock = options.clock ?? (() => Date.now())
  const randomId = options.randomId ?? (() => `session-${randomUUID()}`)
  const trashRoot = options.trashDir ?? path.join(os.homedir(), '.Trash')
  const hostRevision = options.hostRevision ?? null
  const journalFile = journalPath(dataDir)
  const pendingFile = pendingPath(dataDir)
  const completedFile = path.join(dataDir, 'completed.json')
  const backupRoot = path.join(dataDir, 'backups')
  const quarantineRoot = path.join(dataDir, 'quarantine')

  let queue = Promise.resolve()
  const ready = (async () => {
    await recover()
    await processPending()
  })()

  return {
    handle, preflight, move, queue: queueMove, cancel: cancelMove, delete: deleteSession,
    pending: pendingStatus, ack: acknowledge, recover, ready,
  }

  // ── 화면 요청 ──────────────────────────────────────────────

  async function handle(request) {
    try {
      const body = parseBody(await request.text())
      const parsed = parseRequest(body)
      await ready
      const value = parsed.action === 'preflight'
        ? await preflight(parsed)
        : parsed.action === 'pending'
          ? await pendingStatus()
          : parsed.action === 'ack'
            ? await acknowledge(parsed.ids)
            : parsed.action === 'queue'
              ? await enqueue(() => queueMove(parsed))
              : parsed.action === 'cancel'
                ? await enqueue(() => cancelMove(parsed))
                : parsed.action === 'delete'
                  ? await enqueue(() => deleteSession(parsed))
                  : await enqueue(() => move(parsed))
      return json(200, { ok: true, value })
    } catch (error) {
      return json(200, { ok: false, error: wireError(error, logger) })
    }
  }

  function enqueue(operation) {
    const run = queue.then(() => operation(), () => operation())
    queue = run.then(() => {}, () => {})
    return run
  }

  // ── 미리 확인 ──────────────────────────────────────────────

  async function preflight({ sessionId }) {
    const snapshot = await requireSnapshot(sessionId)
    const header = snapshot.header
    const owner = ownerOf(registry.list(), sessionId)
    const sizeBytes = await artifactSize(snapshot)
    const open = await isOpen(sessionId)

    const oversized = sizeBytes !== undefined && sizeBytes > settings.maxArtifactBytes
    let blocked = null
    if (header.origin === 'subagent') {
      blocked = { code: ERROR.sessionSubagent, message: 'subagent sessions cannot be moved' }
    } else if (oversized) {
      blocked = { code: ERROR.tooLarge, message: `the session log is larger than ${settings.maxArtifactBytes} bytes` }
    }

    const effectiveDirectory = sizeBytes !== undefined && sizeBytes <= SMALL_LOG_BYTES
      ? await readEffectiveDirectory(sessionId)
      : undefined

    return {
      sessionId,
      hostRevision,
      sourceWorkspaceId: owner?.id ?? null,
      sizeBytes: sizeBytes ?? null,
      open,
      queue: true,
      cancel: true,
      trueMove: !oversized,
      effectiveDirectory: effectiveDirectory ?? null,
      blocked,
    }
  }

  // ── 이동 ──────────────────────────────────────────────────

  async function move({ sessionId, targetWorkspaceId }) {
    const target = registry.get(targetWorkspaceId)
    if (target === undefined) throw moveError(ERROR.workspaceNotFound, `workspace "${targetWorkspaceId}" is not registered`)
    const snapshot = await requireSnapshot(sessionId)
    const header = snapshot.header
    if (header.origin === 'subagent') throw moveError(ERROR.sessionSubagent, `session "${sessionId}" is a subagent session`)

    const source = ownerOf(registry.list(), sessionId)
    if (source !== undefined && source.id === target.id) {
      throw moveError(ERROR.sameWorkspace, `session "${sessionId}" already belongs to workspace "${target.id}"`)
    }
    if (header.cwd !== undefined && await samePath(fs, header.cwd, target.path)) {
      throw moveError(ERROR.sameWorkspace, `session "${sessionId}" already runs in "${target.path}"`)
    }
    if (!(await isDirectory(fs, target.path))) {
      throw moveError(ERROR.workspaceMissingDir, `workspace directory "${target.path}" is missing`)
    }

    if (typeof snapshot.location?.path !== 'string') {
      throw moveError(ERROR.storageFailed, `session "${sessionId}" has no stored artifact`)
    }
    const pending = await readJournal(fs, journalFile)
    if (pending.some(entry => entry.id === sessionId)) {
      throw moveError(ERROR.recoveryRequired, `an unfinished move for "${sessionId}" is waiting for recovery`)
    }

    if (await isOpen(sessionId)) {
      throw moveError(ERROR.sessionOpen, `session "${sessionId}" is open; use the restart-assisted move`)
    }
    const sizeBytes = await artifactSize(snapshot)
    if (sizeBytes !== undefined && sizeBytes > settings.maxArtifactBytes) {
      throw moveError(ERROR.tooLarge, `session "${sessionId}" is larger than ${settings.maxArtifactBytes} bytes`)
    }
    let read
    try {
      read = await readSession(sessionId)
    } catch (error) {
      if (error instanceof MoveError && error.code === ERROR.sessionOpen) {
        throw moveError(ERROR.sessionOpen, `session "${sessionId}" is open; use the restart-assisted move`)
      }
      throw error
    }
    const { events, inheritedEventCount } = read
    const originalDir = path.dirname(snapshot.location.path)
    const stamp = backupStamp(clock())
    const entry = {
      id: sessionId,
      phase: 'prepared',
      from: {
        workspaceId: source?.id ?? null,
        dir: originalDir,
        projectDir: path.dirname(originalDir),
        cwd: header.cwd ?? null,
      },
      to: { workspaceId: target.id, path: target.path },
      quarantine: path.join(quarantineRoot, `${stamp}-${sessionId}`),
      backup: path.join(backupRoot, `${stamp}-${sessionId}`),
      appendedDirectoryChange: needsDirectoryChange(events, target.path),
      eventCount: events.length,
      startedAt: clock(),
    }

    await updateJournal(entries => upsertEntry(entries, entry))
    try {
      await copyBackup(entry)
      await pruneBackups()
      await moveDirectory(originalDir, entry.quarantine)
      await updateJournal(entries => updateEntry(entries, sessionId, { phase: 'relocated' }))

      await materialize(entry, header, events, inheritedEventCount)
      await verify(entry, events.length + (entry.appendedDirectoryChange ? 1 : 0))
      await updateJournal(entries => updateEntry(entries, sessionId, { phase: 'materialized' }))

      forgetRegistryHeader(registry, sessionId)
      await handOver(entry, source, target)
    } catch (error) {
      try {
        await rollback(entry, source, target)
      } catch (rollbackError) {
        logger?.error(`[workspace-move] rollback failed for ${sessionId}: ${String(rollbackError)}`)
        throw moveError(ERROR.recoveryRequired, 'the move failed and could not be undone automatically', { cause: error })
      }
      throw normalizeFailure(error)
    }

    // 여기부터는 되돌릴 수 없다: 새 대화가 작업공간 목록에 올라갔다.
    // 마무리 저장이 실패해도 롤백하면 이동된 대화를 지우게 되므로, 저널에 남겨 두고 다음 복구에 맡긴다.
    try {
      await updateJournal(entries => updateEntry(entries, sessionId, { phase: 'registry' }))
      await cleanup(entry)
    } catch (error) {
      logger?.warn(`[workspace-move] ${sessionId} was moved; cleanup is left for recovery: ${String(error)}`)
    }
    logger?.info(`[workspace-move] moved ${sessionId} to ${target.path}`)
    return {
      moved: true,
      sessionId,
      fromWorkspaceId: entry.from.workspaceId,
      toWorkspaceId: target.id,
    }
  }

  // ── 세션 읽기·다시 쓰기 ─────────────────────────────────────

  async function readSession(sessionId) {
    let handle
    try {
      handle = await persistence.open(sessionId, 'write')
    } catch (error) {
      if (isNamedError(error, 'SessionAlreadyOwnedError')) {
        throw moveError(ERROR.sessionOpen, `session "${sessionId}" is open; close it before moving`)
      }
      throw moveError(ERROR.storageFailed, `session "${sessionId}" could not be opened`, { cause: error })
    }
    try {
      const inheritedEventCount = handle.inheritedEventCount ?? 0
      const events = []
      for (let offset = 0; ; offset += READ_BATCH) {
        const result = await handle.read(offset, READ_BATCH)
        events.push(...result.events)
        if (result.events.length < READ_BATCH) break
      }
      return { events, inheritedEventCount }
    } catch (error) {
      throw moveError(ERROR.storageFailed, `session "${sessionId}" could not be read`, { cause: error })
    } finally {
      await handle.close().catch(() => {})
    }
  }

  async function materialize(entry, header, events, inheritedEventCount) {
    const nextHeader = { ...header, cwd: entry.to.path }
    const createOptions = header.isSeeded ? { inheritedEventCount } : {}
    let handle
    try {
      handle = await persistence.create(nextHeader, createOptions)
    } catch (error) {
      if (isNamedError(error, 'SessionAlreadyExistsError')) {
        throw moveError(ERROR.storageFailed, `a stored copy of "${entry.id}" blocked the move`, { cause: error })
      }
      throw moveError(ERROR.storageFailed, `session "${entry.id}" could not be written`, { cause: error })
    }
    try {
      for (let index = 0; index < events.length; index += APPEND_BATCH) {
        await handle.append(events.slice(index, index + APPEND_BATCH))
      }
      if (entry.appendedDirectoryChange) {
        await handle.append([{
          type: 'working-directory/change',
          seq: events.length,
          time: clock(),
          data: { cwd: entry.to.path },
        }])
      }
      await handle.flush()
    } catch (error) {
      throw moveError(ERROR.storageFailed, `session "${entry.id}" could not be written`, { cause: error })
    } finally {
      await handle.close().catch(() => {})
    }
  }

  async function hasExpectedEvents(sessionId, expectedCount) {
    let handle
    try {
      handle = await persistence.open(sessionId, 'read')
    } catch {
      return false
    }
    try {
      if (expectedCount > 0) {
        const tail = await handle.read(expectedCount - 1, 1)
        if (tail.events.length !== 1 || tail.events[0].seq !== expectedCount - 1) return false
      }
      const beyond = await handle.read(expectedCount, 1)
      return beyond.events.length === 0
    } catch {
      return false
    } finally {
      await handle.close().catch(() => {})
    }
  }

  async function verify(entry, expectedCount) {
    const snapshot = await requireSnapshot(entry.id)
    if (snapshot.header.cwd !== entry.to.path) {
      throw new Error(`moved header cwd is ${JSON.stringify(snapshot.header.cwd)}, expected ${JSON.stringify(entry.to.path)}`)
    }
    if (typeof snapshot.location?.path !== 'string' || path.dirname(snapshot.location.path) === entry.from.dir) {
      throw new Error('the moved artifact was not stored at the target project directory')
    }
    let handle
    try {
      handle = await persistence.open(entry.id, 'read')
    } catch (error) {
      throw new Error(`the moved session cannot be reopened: ${String(error)}`)
    }
    try {
      if (expectedCount > 0) {
        const first = await handle.read(0, 1)
        if (first.events.length !== 1 || first.events[0].seq !== 0) throw new Error('the moved log has no first event')
        const tail = await handle.read(expectedCount - 1, 1)
        if (tail.events.length !== 1 || tail.events[0].seq !== expectedCount - 1) {
          throw new Error('the moved log is shorter than the source')
        }
      }
      const beyond = await handle.read(expectedCount, 1)
      if (beyond.events.length !== 0) throw new Error('the moved log is longer than the source')
    } finally {
      await handle.close().catch(() => {})
    }
  }

  async function handOver(entry, source, target) {
    try {
      if (source !== undefined) await source.detachSession(entry.id)
      if (!target.sessionIds.includes(entry.id)) await target.attachSession(entry.id)
    } catch (error) {
      throw moveError(ERROR.registryFailed, `the workspace list could not be updated for "${entry.id}"`, { cause: error })
    }
  }

  async function cleanup(entry) {
    await fs.rm(entry.quarantine, { recursive: true, force: true })
    await removeIfEmpty(fs, entry.from.projectDir)
    await updateJournal(entries => removeEntry(entries, entry.id))
  }

  async function rollback(entry, source, target) {
    const snapshot = await persistence.stat(entry.id).catch(() => undefined)
    if (typeof snapshot?.location?.path === 'string') {
      const dir = path.dirname(snapshot.location.path)
      if (dir !== entry.from.dir) {
        // 되살릴 격리본도 원본도 없으면 새 로그가 유일한 사본이다. 지우지 않고 사람의 복구로 넘긴다.
        if (!(await exists(fs, entry.quarantine)) && !(await exists(fs, entry.from.dir))) {
          throw new Error(`no original copy is left for "${entry.id}"; the moved log was kept`)
        }
        await fs.rm(dir, { recursive: true, force: true })
      }
    }
    if (await exists(fs, entry.quarantine)) {
      await fs.mkdir(path.dirname(entry.from.dir), { recursive: true })
      if (await exists(fs, entry.from.dir)) await fs.rm(entry.from.dir, { recursive: true, force: true })
      await fs.rename(entry.quarantine, entry.from.dir)
    }
    if (source !== undefined) {
      forgetRegistryHeader(registry, entry.id)
      if (!source.sessionIds.includes(entry.id)) await source.attachSession(entry.id)
    }
    if (target !== undefined && target.id !== source?.id) {
      if (target.sessionIds.includes(entry.id)) await target.detachSession(entry.id)
    }
    await updateJournal(entries => removeEntry(entries, entry.id))
  }

  // ── 대화 삭제 ─────────────────────────────────────────────

  async function deleteSession({ sessionId }) {
    const snapshot = await requireSnapshot(sessionId)
    if (snapshot.header.origin === 'subagent') {
      throw moveError(ERROR.sessionSubagent, `session "${sessionId}" is a subagent session`)
    }
    if (typeof snapshot.location?.path !== 'string') {
      throw moveError(ERROR.storageFailed, `session "${sessionId}" has no stored artifact`)
    }
    const source = ownerOf(registry.list(), sessionId)
    const dir = path.dirname(snapshot.location.path)
    const projectDir = path.dirname(dir)
    const live = await isOpen(sessionId)
    const stamp = backupStamp(clock())
    const trash = path.join(trashRoot, `${sessionId}-deleted-${stamp}`)
    const fallback = path.join(dataDir, 'removed', `${sessionId}-${stamp}`)

    if (source !== undefined) await source.detachSession(sessionId)
    try {
      try {
        await fs.mkdir(trashRoot, { recursive: true })
        await fs.rename(dir, trash)
      } catch (error) {
        if (error?.code !== 'EXDEV' && error?.code !== 'EACCES' && error?.code !== 'ENOENT') throw error
        await fs.mkdir(path.dirname(fallback), { recursive: true })
        try {
          await fs.rename(dir, fallback)
        } catch (second) {
          if (second?.code !== 'EXDEV') throw second
          await fs.cp(dir, fallback, { recursive: true })
          await fs.rm(dir, { recursive: true, force: true })
        }
      }
    } catch (error) {
      if (source !== undefined) {
        forgetRegistryHeader(registry, sessionId)
        await source.attachSession(sessionId).catch(() => {})
      }
      throw normalizeFailure(error)
    }

    if (live) {
      // 열려 있는 세션은 로그를 옮겨도 메모리에 남아 '그룹 없음'에 보인다. 보관 처리해 즉시 숨긴다.
      await registry.archiveSession(sessionId, { stopActivity: true }).catch(error => {
        logger?.warn(`[workspace-move] deleted ${sessionId} but could not archive it: ${String(error)}`)
      })
    } else {
      await registry.unarchiveSession?.(sessionId).catch(() => {})
      await registry.unpinSession?.(sessionId).catch(() => {})
    }
    await removeIfEmpty(fs, projectDir)
    forgetRegistryHeader(registry, sessionId)
    logger?.info(`[workspace-move] deleted ${sessionId} (live: ${String(live)})`)
    return { deleted: true, live, movedTo: trash }
  }

  // ── 앱을 다시 켠 뒤 그대로 이동 ──────────────────────────────

  async function queueMove({ sessionId, targetWorkspaceId }) {
    const target = registry.get(targetWorkspaceId)
    if (target === undefined) throw moveError(ERROR.workspaceNotFound, `workspace "${targetWorkspaceId}" is not registered`)
    const snapshot = await requireSnapshot(sessionId)
    if (snapshot.header.origin === 'subagent') throw moveError(ERROR.sessionSubagent, `session "${sessionId}" is a subagent session`)
    const source = ownerOf(registry.list(), sessionId)
    if (source !== undefined && source.id === target.id) {
      throw moveError(ERROR.sameWorkspace, `session "${sessionId}" already belongs to workspace "${target.id}"`)
    }
    if (snapshot.header.cwd !== undefined && await samePath(fs, snapshot.header.cwd, target.path)) {
      throw moveError(ERROR.sameWorkspace, `session "${sessionId}" already runs in "${target.path}"`)
    }
    if (!(await isDirectory(fs, target.path))) {
      throw moveError(ERROR.workspaceMissingDir, `workspace directory "${target.path}" is missing`)
    }
    const sizeBytes = await artifactSize(snapshot)
    if (sizeBytes !== undefined && sizeBytes > settings.maxArtifactBytes) {
      throw moveError(ERROR.tooLarge, `session "${sessionId}" is larger than ${settings.maxArtifactBytes} bytes`)
    }
    const entries = await readPending(fs, pendingFile)
    const next = entries.filter(entry => entry.sessionId !== sessionId)
    next.push({ sessionId, targetWorkspaceId, requestedAt: clock() })
    await writePending(fs, pendingFile, next)
    return { queued: true, sessionId, targetWorkspaceId }
  }

  async function cancelMove({ sessionId }) {
    const entries = await readPending(fs, pendingFile)
    const next = entries.filter(entry => entry.sessionId !== sessionId)
    if (next.length === entries.length) return { cancelled: false }
    await writePending(fs, pendingFile, next)
    return { cancelled: true }
  }

  async function pendingStatus() {
    const titleOf = workspaceId => registry.get(workspaceId)?.title ?? workspaceId
    const [pending, completed] = await Promise.all([
      readPending(fs, pendingFile),
      readPending(fs, completedFile),
    ])
    return {
      pending: pending.map(entry => ({ ...entry, targetTitle: titleOf(entry.targetWorkspaceId) })),
      completed: completed.map(entry => ({ ...entry, targetTitle: titleOf(entry.targetWorkspaceId) })),
      capabilities: { delete: true, cancel: true },
    }
  }

  async function acknowledge(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return { acked: 0 }
    const entries = await readPending(fs, completedFile)
    const keep = entries.filter(entry => !ids.includes(entry.sessionId))
    const acked = entries.length - keep.length
    if (acked > 0) await writePending(fs, completedFile, keep)
    return { acked }
  }

  async function processPending() {
    let entries
    try {
      entries = await readPending(fs, pendingFile)
    } catch (error) {
      logger?.warn(`[workspace-move] pending moves could not be read: ${String(error)}`)
      return
    }
    if (entries.length === 0) return
    const remaining = []
    for (const entry of entries) {
      try {
        const result = await move({ sessionId: entry.sessionId, targetWorkspaceId: entry.targetWorkspaceId })
        logger?.info(`[workspace-move] queued ${result.copy ? 'copy' : 'move'} finished for ${entry.sessionId}`)
        if (!result.copy) {
          const done = await readPending(fs, completedFile).catch(() => [])
          done.push({ sessionId: entry.sessionId, targetWorkspaceId: entry.targetWorkspaceId, at: clock() })
          await writePending(fs, completedFile, done.slice(-20)).catch(() => {})
        }
      } catch (error) {
        logger?.warn(`[workspace-move] queued move failed for ${entry.sessionId}: ${String(error)}`)
        if (error?.code === ERROR.recoveryRequired || error?.code === ERROR.storageFailed) remaining.push(entry)
      }
    }
    await writePending(fs, pendingFile, remaining).catch(error => {
      logger?.warn(`[workspace-move] pending moves could not be rewritten: ${String(error)}`)
    })
  }

  // ── 열린 대화: 보관 + 복사 ──────────────────────────────────

  async function reconcileCopy(entry) {
    const snapshot = await persistence.stat(entry.newId)
    const target = registry.get(entry.to.workspaceId)
    const complete = snapshot !== undefined
      && snapshot.header.cwd === entry.to.path
      && target !== undefined
      && await hasExpectedEvents(entry.newId, entry.expectedEvents ?? 0)
    if (complete) {
      if (!target.sessionIds.includes(entry.newId)) await target.attachSession(entry.newId)
      await updateJournal(entries => removeEntry(entries, entry.id))
      return
    }
    if (typeof snapshot?.location?.path === 'string') {
      await fs.rm(path.dirname(snapshot.location.path), { recursive: true, force: true }).catch(() => {})
    }
    await registry.unarchiveSession(entry.id).catch(() => {})
    await updateJournal(entries => removeEntry(entries, entry.id))
  }

  // ── 죽은 뒤 복구 ────────────────────────────────────────────

  async function recover() {
    let entries
    try {
      entries = await readJournal(fs, journalFile)
    } catch (error) {
      logger?.warn(`[workspace-move] journal could not be read: ${String(error)}`)
      return
    }
    for (const entry of entries) {
      try {
        if (entry.kind === 'copy') await reconcileCopy(entry)
        else await reconcile(entry)
      } catch (error) {
        logger?.warn(`[workspace-move] recovery for ${entry.id} needs a person: ${String(error)}`)
      }
    }
  }

  async function reconcile(entry) {
    const snapshot = await persistence.stat(entry.id)
    const storedDir = typeof snapshot?.location?.path === 'string' ? path.dirname(snapshot.location.path) : undefined
    const newArtifact = storedDir !== undefined && storedDir !== entry.from.dir
    const newArtifactMatches = newArtifact && snapshot.header.cwd === entry.to.path
    const quarantine = await exists(fs, entry.quarantine)
    const oldArtifact = await exists(fs, entry.from.dir)

    const decision = decideRecovery({ newArtifact, newArtifactMatches, quarantine, oldArtifact })
    if (decision === 'complete') {
      const expected = (entry.eventCount ?? 0) + (entry.appendedDirectoryChange ? 1 : 0)
      if (!(await hasExpectedEvents(entry.id, expected))) {
        const source = entry.from.workspaceId === null ? undefined : registry.get(entry.from.workspaceId)
        await rollback(entry, source, registry.get(entry.to.workspaceId))
        logger?.warn(`[workspace-move] discarded an incomplete moved log for ${entry.id}`)
        return
      }
      const target = registry.get(entry.to.workspaceId)
      if (target === undefined) throw new Error(`workspace "${entry.to.workspaceId}" no longer exists`)
      const source = entry.from.workspaceId === null ? undefined : registry.get(entry.from.workspaceId)
      if (source !== undefined) await source.detachSession(entry.id)
      forgetRegistryHeader(registry, entry.id)
      if (!target.sessionIds.includes(entry.id)) await target.attachSession(entry.id)
      await cleanup(entry)
      logger?.info(`[workspace-move] finished an interrupted move of ${entry.id}`)
      return
    }
    if (decision === 'restore') {
      await fs.mkdir(path.dirname(entry.from.dir), { recursive: true })
      if (await exists(fs, entry.from.dir)) await fs.rm(entry.from.dir, { recursive: true, force: true })
      await fs.rename(entry.quarantine, entry.from.dir)
      await restoreSourceOwnership(entry)
      await updateJournal(entries => removeEntry(entries, entry.id))
      logger?.info(`[workspace-move] restored ${entry.id} after an interrupted move`)
      return
    }
    if (decision === 'clear') {
      await fs.rm(entry.quarantine, { recursive: true, force: true })
      await restoreSourceOwnership(entry)
      await updateJournal(entries => removeEntry(entries, entry.id))
      return
    }
    throw new Error('both the original and the moved artifact are missing')
  }

  async function restoreSourceOwnership(entry) {
    if (entry.from.workspaceId === null) return
    const source = registry.get(entry.from.workspaceId)
    if (source === undefined) return
    if (source.sessionIds.includes(entry.id)) return
    forgetRegistryHeader(registry, entry.id)
    await source.attachSession(entry.id)
  }

  // ── 파일·저장소 도우미 ─────────────────────────────────────

  async function requireSnapshot(sessionId) {
    const snapshot = await persistence.stat(sessionId)
    if (snapshot === undefined) throw moveError(ERROR.sessionNotFound, `session "${sessionId}" is not stored`)
    return snapshot
  }

  async function artifactSize(snapshot) {
    if (typeof snapshot.sizeBytes === 'number') return snapshot.sizeBytes
    if (typeof snapshot.location?.path !== 'string') return undefined
    try {
      return (await fs.stat(snapshot.location.path)).size
    } catch {
      return undefined
    }
  }

  async function isOpen(sessionId) {
    try {
      const handle = await persistence.open(sessionId, 'write')
      await handle.close()
      return false
    } catch (error) {
      if (isNamedError(error, 'SessionAlreadyOwnedError')) return true
      if (isNamedError(error, 'SessionPersistenceNotFoundError')) {
        throw moveError(ERROR.sessionNotFound, `session "${sessionId}" is not stored`)
      }
      throw moveError(ERROR.storageFailed, `session "${sessionId}" could not be inspected`, { cause: error })
    }
  }

  async function readEffectiveDirectory(sessionId) {
    let handle
    try {
      handle = await persistence.open(sessionId, 'read')
    } catch {
      return undefined
    }
    try {
      let directory
      for (let offset = 0; ; offset += READ_BATCH) {
        const result = await handle.read(offset, READ_BATCH)
        for (const event of result.events) {
          if (event.type === 'working-directory/change' && typeof event.data?.cwd === 'string') directory = event.data.cwd
        }
        if (result.events.length < READ_BATCH) break
      }
      return directory
    } catch {
      return undefined
    } finally {
      await handle.close().catch(() => {})
    }
  }

  async function copyBackup(entry) {
    await fs.mkdir(path.dirname(entry.backup), { recursive: true, mode: 0o700 })
    await fs.cp(entry.from.dir, entry.backup, { recursive: true, force: true, errorOnExist: false })
  }

  async function pruneBackups() {
    let names
    try {
      names = await fs.readdir(backupRoot)
    } catch (error) {
      if (enoent(error)) return
      throw error
    }
    names.sort().reverse()
    for (const name of names.slice(settings.keepBackups)) {
      await fs.rm(path.join(backupRoot, name), { recursive: true, force: true })
    }
  }

  async function moveDirectory(from, to) {
    await fs.mkdir(path.dirname(to), { recursive: true })
    try {
      await fs.rename(from, to)
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error
      await fs.cp(from, to, { recursive: true })
      await fs.rm(from, { recursive: true, force: true })
    }
  }

  async function updateJournal(change) {
    const entries = await readJournal(fs, journalFile)
    await writeJournal(fs, journalFile, change(entries))
  }

  function normalizeFailure(error) {
    if (error instanceof MoveError) return error
    if (isNamedError(error, 'SessionAlreadyOwnedError')) {
      return moveError(ERROR.sessionOpen, 'the session was opened while it was being moved')
    }
    if (isNamedError(error, 'SessionAlreadyExistsError')) {
      return moveError(ERROR.storageFailed, 'another copy of the session appeared during the move')
    }
    logger?.warn(`[workspace-move] move failed: ${String(error)}`)
    return moveError(ERROR.storageFailed, 'the session could not be moved', { cause: error })
  }
}

// ── 작은 파일 도우미 (시험에서 그대로 쓴다) ───────────────────

async function exists(fs, target) {
  try {
    await fs.stat(target)
    return true
  } catch (error) {
    if (enoent(error)) return false
    throw error
  }
}

async function isDirectory(fs, target) {
  try {
    return (await fs.stat(target)).isDirectory()
  } catch (error) {
    if (enoent(error)) return false
    throw error
  }
}

async function samePath(fs, left, right) {
  const read = async value => {
    try {
      return await fs.realpath(value)
    } catch {
      return path.resolve(value)
    }
  }
  return await read(left) === await read(right)
}

async function removeIfEmpty(fs, target) {
  try {
    const entries = await fs.readdir(target)
    if (entries.length === 0) await fs.rmdir(target)
  } catch {
    // 이미 없거나 비어 있지 않다. 정리 실패는 이동 결과를 바꾸지 않는다.
  }
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}


/**
 * The workspace registry caches each Session header from startup and does not refresh it
 * when the stored header changes. Drop the cached entry so attachSession reads the new one.
 * This touches private fields deliberately; when the shape changes, return false and let the
 * caller report the failure instead of corrupting anything.
 */
function forgetRegistryHeader(registry, sessionId) {
  try {
    const headers = registry.headers
    if (!(headers instanceof Map)) return false
    headers.delete(sessionId)
    if (registry.sessionPaths instanceof Map) registry.sessionPaths.delete(sessionId)
    if (registry.missingSessionPaths instanceof Set) registry.missingSessionPaths.delete(sessionId)
    if (registry.invalidSessionPaths instanceof Map) registry.invalidSessionPaths.delete(sessionId)
    return true
  } catch {
    return false
  }
}
