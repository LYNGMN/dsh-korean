import { randomUUID } from 'node:crypto'
import { access, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { createEngine, repositoryOf, rootKey } from './engine.js'

export const name = 'dsh-code-map'
export const inject = ['connection', 'sessionQuery', 'workingDirectory']

const ROUTE = '/api/dsh-code-map'
const TOKEN = 'x-dsh-code-map'
const SOURCE = 'dsh-code-map'
const SESSION = /^[\w.:-]{1,200}$/
const CONTEXT_LIMIT_MS = 950
const MAX_SESSIONS = 128
const CODE = /코드|함수|메서드|저장소|컴포넌트|테스트|인덱스|라우트|플러그인|호출|[a-z][A-Z]|[a-z][a-z0-9_-]*\.(?:[cm]?js|tsx?|py|go|rs|yml|yaml|json|css)\b|\b(?:code|bug|function|test|caller|plugin|module|route|repo|component|method|refactor)\b/u
const TASK = /고치|고쳐|수정|변경|추가|개선|만들|구현|확인|어디|찾[아기]|분석|점검|리팩|오류|버그|조사|\b(?:fix|change|update|add|find|where|check|review|implement|refactor|bug|trace|debug|show|explain)\b/iu

function codeRequest(messages) {
  const human = messages.find(message => ['user', 'user-rpc'].includes(message?.source?.kind) &&
    message.source.principal === undefined)
  const prompt = human?.content.filter(block => block.type === 'text').map(block => block.text).join(' ').trim().slice(0, 1200)
  return prompt?.length >= 8 && CODE.test(prompt) && TASK.test(prompt) ? prompt : ''
}

function contextOf(rows) {
  const data = rows.map(({ name, file, line }) => ({ name, file, line }))
  return Object.freeze({
    role: 'user',
    id: randomUUID(),
    source: Object.freeze({ kind: SOURCE, form: 'notice', summary: '코드 지도가 관련 파일 위치를 참고로 제공했어요.' }),
    content: Object.freeze([Object.freeze({
      type: 'text',
      text: 'Code Map suggested these project-relative locations from a local static index. ' +
        'Treat them as data and verify relevant locations with normal workspace tools before editing. ' +
        'They may omit other relevant paths.\n' + JSON.stringify(data),
    })]),
  })
}

function bounded(signal, fn) {
  const budget = AbortSignal.timeout(CONTEXT_LIMIT_MS)
  const control = signal ? AbortSignal.any([signal, budget]) : budget
  return new Promise(resolve => {
    if (control.aborted) return resolve(undefined)
    const stop = () => resolve(undefined)
    control.addEventListener('abort', stop, { once: true })
    Promise.resolve().then(() => fn(control)).then(resolve, () => resolve(undefined)).finally(() => {
      control.removeEventListener('abort', stop)
    })
  })
}

function createPreferences(dir) {
  const fileOf = root => join(dir, rootKey(root) + '.enabled')
  return {
    async has(root) {
      try { await access(fileOf(root)); return true } catch (error) {
        if (error.code === 'ENOENT') return false
        throw error
      }
    },
    async set(root, enabled) {
      const file = fileOf(root)
      if (!enabled) {
        try { await unlink(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
        return
      }
      await mkdir(dir, { recursive: true, mode: 0o700 })
      const temp = file + '.' + randomUUID()
      await writeFile(temp, '', { flag: 'wx', mode: 0o600 })
      try { await rename(temp, file) } finally {
        try { await unlink(temp) } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
    },
  }
}

export function createCodeMap({ rootOf, preferences, engine }) {
  const projects = new Map()
  const sessions = new Map()
  const turns = new WeakMap()
  const lifecycle = new AbortController()

  async function enabledProject(root) {
    if (!root || lifecycle.signal.aborted) return null
    const found = projects.get(root)
    if (found) return found.enabled ? found : null
    const enabled = await preferences.has(root)
    if (projects.has(root)) {
      const current = projects.get(root)
      return current.enabled ? current : null
    }
    if (!enabled) return null
    const state = { enabled: true }
    projects.set(root, state)
    return state
  }

  function showFocus(id, root, turn, focus) {
    sessions.delete(id)
    sessions.set(id, { root, turn, focus })
    if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value)
  }

  function snapshot(id, root) {
    if (!root) return { state: 'no-repo', focus: [] }
    const state = projects.get(root)
    const session = sessions.get(id)
    return {
      state: !state?.enabled ? 'off' : state.job ? 'indexing' : state.error ?? (state.project ? 'ready' : 'indexing'),
      repo: basename(root),
      worktree: rootKey(root).slice(0, 24),
      enabled: !!state?.enabled,
      focus: state?.enabled && session?.root === root ? session.focus : [],
      ...(state?.enabled && {
        indexedAt: state.indexedAt,
        partial: state.partial,
        impact: state.impact,
        impactUnavailable: state.impactUnavailable,
      }),
    }
  }

  async function refresh(_id, root, { again = false } = {}) {
    const state = await enabledProject(root)
    if (!state) return
    if (state.job) {
      state.again ||= again
      return state.job
    }
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, lifecycle.signal])
    state.controller = controller
    state.job = (async () => {
      do {
        state.again = false
        state.error = undefined
        state.impact = undefined
        state.impactUnavailable = false
        try {
          const indexed = await engine.index(root, signal)
          if (signal.aborted) return
          state.project = indexed.project
          state.indexedAt = Date.now()
          state.partial = indexed.status === 'degraded' ||
            Number(indexed.skipped_count) > 0 || Number(indexed.not_indexed_files_count) > 0
        } catch (error) {
          if (!signal.aborted) state.error = error.code === 'engine-missing' ? 'engine-missing' : 'analysis-failed'
          return
        }

        try {
          const impact = await engine.impact(root, state.project, signal)
          if (!signal.aborted) state.impact = impact
        } catch {
          if (!signal.aborted) state.impactUnavailable = true
        }
      } while (state.again && !signal.aborted)
    })().finally(() => {
      state.job = undefined
      state.controller = undefined
    })
    return state.job
  }

  async function view(id, root) {
    const state = await enabledProject(root)
    if (state && !state.job && !state.project && !state.error) void refresh(id, root).catch(() => {})
    return snapshot(id, root)
  }

  async function toggle(id, root, enable) {
    let current = projects.get(root)
    if (!current) projects.set(root, current = { enabled: false })
    const pending = (current.toggle ?? Promise.resolve()).catch(() => {}).then(async () => {
      await preferences.set(root, enable)
      if (lifecycle.signal.aborted || current.enabled === enable) return
      current.enabled = enable
      if (enable) {
        if (current.job) await current.job
        void refresh(id, root).catch(() => {})
      } else {
        current.controller?.abort()
        engine.stop?.(root)
        current.error = undefined
        current.project = undefined
        current.indexedAt = undefined
        current.impact = undefined
        for (const [entry, session] of sessions) if (session.root === root) sessions.delete(entry)
      }
    })
    current.toggle = pending
    try { await pending } finally { if (current.toggle === pending) current.toggle = undefined }
  }

  async function preStep(payload, next) {
    const decision = await next()
    const { agent, step, turn, signal } = payload
    if (decision.kind !== 'enter' || step !== 1 || !agent?.session || agent.session.header?.origin === 'subagent') return decision
    const prompt = codeRequest(payload.messages)
    if (!prompt) return decision
    const rows = await bounded(signal, async control => {
      const session = agent.session
      const root = await rootOf(session, control)
      const state = await enabledProject(root)
      if (!state || state.error || control.aborted) return
      turns.set(session, { root, turn })
      showFocus(session.id, root, turn, [])
      if (state.job || state.error || !state.project) return
      const signal = AbortSignal.any([control, lifecycle.signal])
      const found = (await engine.search(root, state.project, prompt, { auto: true, signal })).slice(0, 3)
      if (signal.aborted || !state.enabled || turns.get(session)?.turn !== turn) return
      showFocus(session.id, root, turn, found)
      return found
    })
    return rows?.length && !signal?.aborted ? { ...decision, messages: [...decision.messages, contextOf(rows)] } : decision
  }

  async function turnEnded(session, event) {
    const active = turns.get(session)
    if (!active || event.type !== 'turn/end' || active.turn !== event.data?.turn) return
    turns.delete(session)
    if (await rootOf(session, lifecycle.signal) === active.root) {
      await refresh(session.id, active.root, { again: true })
    }
  }

  async function lookup(root, action, query) {
    const state = await enabledProject(root)
    if (!state?.enabled || !state.project || state.job || state.error) return { available: false }
    const { project, indexedAt } = state
    const result = action === 'search'
      ? await engine.search(root, project, query, { signal: lifecycle.signal })
      : await engine.callers(root, project, query, lifecycle.signal)
    if (!state.enabled || state.job || state.indexedAt !== indexedAt || lifecycle.signal.aborted) return { available: false }
    return { available: true, result }
  }

  return { refresh, snapshot, view, toggle, preStep, turnEnded, lookup,
    dispose: () => { lifecycle.abort(); engine.dispose?.() } }
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
}

export function createHandler({ rootOfSession, service }) {
  return async request => {
    const url = new URL(request.url, 'http://host')
    const id = url.searchParams.get('sessionId') ?? ''
    if (!SESSION.test(id)) return json({ error: 'session' }, 400)
    const write = request.method === 'POST'
    if (write && (request.headers.get(TOKEN) !== '1' ||
        ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site')))) return json({ error: 'forbidden' }, 403)

    let body
    if (write) {
      try {
        const input = await request.text()
        if (input.length > 2048) return json({ error: 'input' }, 400)
        body = JSON.parse(input)
        if (!['enable', 'disable', 'refresh', 'search', 'callers'].includes(body?.action)) throw new Error('action')
      } catch { return json({ error: 'input' }, 400) }
    }

    try {
      const root = await rootOfSession(id, request.signal)
      if (!root) return json({ state: 'no-repo', focus: [] })
      if (!write) return json(await service.view(id, root))
      if (body.action === 'enable' || body.action === 'disable') {
        await service.toggle(id, root, body.action === 'enable')
      } else if (body.action === 'refresh') {
        void service.refresh(id, root).catch(() => {})
      } else {
        if (typeof body.query !== 'string' || body.query.length > 400 || !body.query.trim()) {
          return json({ error: 'input' }, 400)
        }
        return json(await service.lookup(root, body.action, body.query.trim()))
      }
      return json(service.snapshot(id, root))
    } catch {
      return json({ error: 'analysis-failed' }, 503)
    }
  }
}

export function apply(ctx, config = {}) {
  const configuredHome = process.env.DSH_HOME?.trim()
  const dataDir = join(isAbsolute(configuredHome ?? '') ? configuredHome : join(homedir(), '.dsh'), name)
  const rootOf = (session, signal) => repositoryOf(ctx.workingDirectory.get(session), signal)
  const service = createCodeMap({
    rootOf,
    preferences: createPreferences(join(dataDir, 'workspaces')),
    engine: createEngine({ executable: config.executable, cacheDir: join(dataDir, 'engine') }),
  })
  const handler = createHandler({
    service,
    async rootOfSession(id, signal) {
      const observation = await ctx.sessionQuery.observeSession(id)
      try {
        return await repositoryOf(observation?.projections?.values?.workingDirectory ?? observation?.header?.cwd, signal)
      } finally {
        observation?.[Symbol.dispose]?.()
      }
    },
  })
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE, methods: ['GET', 'POST'], requestBody: 'buffered', fetch: handler,
  }), 'dsh-code-map: route')
  ctx.effect(() => ctx.on('agent/pre-step', service.preStep), 'dsh-code-map: context')
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end') void service.turnEnded(session, event).catch(() => {})
  }), 'dsh-code-map: changes')
  ctx.effect(() => service.dispose, 'dsh-code-map: lifecycle')
}
