// 실제 DSH 대신 쓰는 작은 세계: 진짜 파일 시스템 위에서 가짜 sessionPersistence·workspaceRegistry를 돌린다.
// 가짜 저장소는 파일이 없으면 세션이 없는 것으로 본다(실제 JSONL 백엔드와 같은 규칙).
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMoveService } from '../src/host/move.js'

export const silentLogger = {
  info() {},
  warn() {},
  error() {},
}

function named(name, message) {
  const error = new Error(message)
  error.name = name
  return error
}

export function createFakePersistence(root) {
  const records = new Map()
  const writers = new Set()
  let revision = 0

  const projectDir = cwd => path.join(root, `--${String(cwd).replace(/[^a-zA-Z0-9]+/g, '-')}--`)
  const fileOf = header => path.join(projectDir(header.cwd), header.id, 'session.v4.jsonl.zstd')

  async function writeArtifact(file, header, events) {
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await fsp.writeFile(file, JSON.stringify({ header, events }))
  }

  async function readArtifact(file) {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  }

  async function materialize(header) {
    const file = fileOf(header)
    await writeArtifact(file, header, [])
    return file
  }

  async function findFile(id) {
    let projects
    try {
      projects = await fsp.readdir(root)
    } catch {
      return undefined
    }
    for (const project of projects) {
      const file = path.join(root, project, id, 'session.v4.jsonl.zstd')
      try {
        await fsp.access(file)
        return file
      } catch {}
    }
    return undefined
  }

  // 실제 백엔드처럼 파일을 찾아 헤더와 이벤트를 읽는다. 파일이 없으면 세션이 없는 것이다.
  // 다른 파일을 찾으면 그 파일의 내용을 그대로 받아들인다(복구로 원본이 돌아온 경우).
  async function locate(id) {
    const record = records.get(id)
    if (record?.file !== undefined) {
      try {
        if (record.file === fileOf(record.header)) {
          await fsp.access(record.file)
          return { record, file: record.file, header: record.header }
        }
      } catch {}
    }
    const file = await findFile(id)
    if (file === undefined) return undefined
    const data = await readArtifact(file)
    const settled = record ?? {
      header: data.header,
      events: [],
      file,
      revision: ++revision,
      inheritedEventCount: 0,
    }
    settled.file = file
    settled.header = data.header
    settled.events = data.events
    records.set(id, settled)
    return { record: settled, file, header: data.header }
  }

  function handle(id, access) {
    const record = records.get(id)
    let closed = false
    return {
      id,
      access,
      get header() { return record.header },
      get inheritedEventCount() { return record.inheritedEventCount },
      async read(offset = 0, length) {
        const end = length === undefined ? record.events.length : offset + length
        return { events: record.events.slice(offset, end), eventState: 'detached' }
      },
      async append(events) {
        if (access !== 'write') throw named('SessionReadOnlyError', 'read handle')
        for (const event of events) {
          if (event.seq !== record.events.length) throw new Error(`non-contiguous append at ${event.seq}`)
          record.events.push(event)
        }
      },
      async flush() {
        await writeArtifact(record.file, record.header, record.events)
        record.revision = ++revision
      },
      async close() {
        if (closed) return
        closed = true
        if (access === 'write') writers.delete(id)
      },
    }
  }

  const persistence = {
    records,
    async stat(id) {
      const found = await locate(id)
      if (found === undefined) return undefined
      return {
        header: found.header,
        revision: found.record.revision,
        sizeBytes: 4,
        location: { kind: 'jsonl', path: found.file },
      }
    },
    async list() {
      const out = []
      for (const id of records.keys()) {
        const snapshot = await persistence.stat(id)
        if (snapshot !== undefined) out.push(snapshot)
      }
      return out
    },
    async create(header, options = {}) {
      if (writers.has(header.id)) throw named('SessionAlreadyExistsError', `session "${header.id}" already exists`)
      if (await persistence.stat(header.id) !== undefined) {
        throw named('SessionAlreadyExistsError', `session "${header.id}" already exists`)
      }
      const file = await materialize(header)
      records.set(header.id, {
        header: { ...header },
        events: [],
        file,
        revision: ++revision,
        inheritedEventCount: options.inheritedEventCount ?? 0,
      })
      writers.add(header.id)
      return handle(header.id, 'write')
    },
    async open(id, access) {
      const found = await locate(id)
      if (found === undefined) throw named('SessionPersistenceNotFoundError', `no session "${id}"`)
      if (access === 'write') {
        if (writers.has(id)) throw named('SessionAlreadyOwnedError', `session "${id}" is already owned`)
        writers.add(id)
      }
      return handle(id, access)
    },
  }
  return persistence
}

export function createFakeRegistry(persistence) {
  const workspaces = []
  const archived = new Set()
  // 실제 레지스트리처럼 시작할 때 읽은 헤더를 캐시하고, 저장된 헤더가 바뀌어도 다시 읽지 않는다.
  const headers = new Map()
  const sessionPaths = new Map()
  return {
    archived,
    headers,
    sessionPaths,
    list: () => [...workspaces],
    get: id => workspaces.find(workspace => workspace.id === id),
    async archiveSession(sessionId) {
      archived.add(sessionId)
    },
    async unarchiveSession(sessionId) {
      archived.delete(sessionId)
    },
    add(workspacePath) {
      const workspace = {
        id: `ws-${workspaces.length + 1}`,
        path: workspacePath,
        title: path.basename(workspacePath),
        sessionIds: [],
        async detachSession(sessionId) {
          this.sessionIds = this.sessionIds.filter(id => id !== sessionId)
        },
        async attachSession(sessionId) {
          let header = headers.get(sessionId)
          if (header === undefined) {
            const snapshot = await persistence.stat(sessionId)
            if (snapshot === undefined) throw new Error(`unknown session "${sessionId}"`)
            header = snapshot.header
            headers.set(sessionId, header)
          }
          const cwd = header.cwd
          if (typeof cwd !== 'string') throw new Error('session has no recorded cwd')
          const real = await fsp.realpath(cwd)
          if (real !== this.path) throw new Error(`session cwd ${real} is not ${this.path}`)
          sessionPaths.set(sessionId, real)
          if (!this.sessionIds.includes(sessionId)) this.sessionIds = [sessionId, ...this.sessionIds]
        },
      }
      workspaces.push(workspace)
      return workspace
    },
  }
}

export async function makeWorld({ maxArtifactBytes = 1024 * 1024, keepBackups = 2, wrapFs } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dwm-test-'))
  const root = path.join(dir, 'sessions')
  await fsp.mkdir(root, { recursive: true })
  await fsp.mkdir(path.join(dir, 'a'))
  await fsp.mkdir(path.join(dir, 'b'))
  // macOS의 /var는 /private/var로 풀린다. 실제 레지스트리처럼 정규 경로를 쓴다.
  const workA = await fsp.realpath(path.join(dir, 'a'))
  const workB = await fsp.realpath(path.join(dir, 'b'))
  const persistence = createFakePersistence(root)
  const registry = createFakeRegistry(persistence)
  const wsA = registry.add(workA)
  const wsB = registry.add(workB)
  const dataDir = path.join(dir, 'data')
  const trashDir = path.join(dir, 'trash')
  let tick = 0
  const service = createMoveService({
    persistence,
    registry,
    fs: wrapFs === undefined ? fsp : wrapFs(fsp),
    dataDir,
    settings: { maxArtifactBytes, keepBackups },
    trashDir,
    logger: silentLogger,
    clock: () => 1_700_000_000_000 + (tick += 1),
  })
  return {
    dir, root, workA, workB, dataDir, trashDir, persistence, registry, wsA, wsB, service,
    cleanup: () => fsp.rm(dir, { recursive: true, force: true }),
  }
}

export async function seedSession(world, { cwd = world.workA, workspace = world.wsA, events, header = {} } = {}) {
  const id = header.id ?? `session-test-${Math.random().toString(16).slice(2, 10)}`
  const handle = await world.persistence.create({
    version: 4,
    id,
    createdAt: 1_700_000_000_000,
    cwd,
    isSeeded: false,
    ...header,
  })
  const list = events ?? [
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  if (list.length > 0) await handle.append(list)
  await handle.flush()
  await handle.close()
  if (workspace !== undefined) await workspace.attachSession(id)
  const snapshot = await world.persistence.stat(id)
  return { id, events: list, snapshot, originalDir: path.dirname(snapshot.location.path) }
}
