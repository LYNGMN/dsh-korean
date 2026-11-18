import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { openGraph } from './mcp.js'

export const rootKey = root => createHash('sha256').update(root).digest('hex')
const text = (value, max) => typeof value === 'string' && value.length <= max &&
  !/[\p{C}\u2028\u2029]/u.test(value) ? value : ''
const regex = value => value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')
const textEnv = ['HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'TMPDIR',
  'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'LOCALAPPDATA', 'APPDATA', 'LANG', 'LC_ALL']

function environment() {
  const env = Object.fromEntries(textEnv.flatMap(key => process.env[key] ? [[key, process.env[key]]] : []))
  env.PATH = [...(process.env.PATH ?? process.env.Path ?? '').split(delimiter).filter(isAbsolute),
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', join(homedir(), '.local', 'bin'),
  ].join(delimiter)
  env.GIT_OPTIONAL_LOCKS = '0'
  env.GIT_TERMINAL_PROMPT = '0'
  return env
}

function run(executable, args, { cwd, env, signal, timeout }) {
  return new Promise((resolve, reject) => {
    const control = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
    if (control.aborted) return reject(control.reason)
    const child = spawn(executable, args, { cwd, env, signal: control, killSignal: 'SIGKILL',
      windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    const chunks = []
    let size = 0
    child.stdout.on('data', chunk => {
      size += chunk.length
      if (size > 128 * 1024) child.kill('SIGKILL')
      else chunks.push(chunk)
    })
    child.stdin.on('error', () => {})
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0 && size <= 128 * 1024) resolve(Buffer.concat(chunks).toString('utf8'))
      else reject(new Error('analysis-failed'))
    })
    child.stdin.end()
  })
}

export async function repositoryOf(cwd, signal) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) return null
  try {
    const out = await run('git', ['-c', 'core.fsmonitor=false', 'rev-parse', '--show-toplevel'],
      { cwd, env: environment(), signal, timeout: 600 })
    const root = out.replace(/\r?\n$/, '')
    return isAbsolute(root) && text(root, 4096) ? await realpath(root) : null
  } catch {
    return null
  }
}

function safeFile(value) {
  const path = text(value, 400).replaceAll('\\', '/')
  if (!path || path.startsWith('/') || path.includes(':')) return ''
  if (path.split('/').some(part => !part || part === '.' || part === '..' ||
    /^(?:\.env(?:$|\.)|\.git$|\.aws$|\.ssh$|\.npmrc$|credentials(?:$|\.)|secrets?(?:$|\.)|.*\.(?:pem|key|p12)$)/iu.test(part))) return ''
  return path
}

function records(table) {
  if (!Array.isArray(table?.cols)) return []
  const unpack = (row, group) => {
    const fields = Object.fromEntries(table.cols.map((key, index) => [key, row[index]]))
    return { ...fields, file: fields.file ?? group?.file,
      qn: fields.qn ?? [group?.qn_prefix, fields.name].filter(Boolean).join('.') }
  }
  if (Array.isArray(table.groups)) {
    return table.groups.flatMap(group => (group.rows ?? []).filter(Array.isArray).map(row => unpack(row, group)))
  }
  return (table.rows ?? []).filter(Array.isArray).map(row => unpack(row))
}

function location(row) {
  const file = safeFile(row.file)
  const id = text(row.qn, 380)
  const name = text(row.name || id.split('.').at(-1), 120)
  const line = Number.parseInt(row.lines, 10)
  return file && id && name ? { id, file, name, kind: text(row.label, 50), ...(line > 0 && { line }) } : null
}

function locations(result) {
  return records(result).map(location).filter(Boolean)
}

function patterns(query, auto) {
  const words = (query.match(/[\p{L}\p{N}_$./-]+/gu) ?? []).slice(0, 30)
  const paths = [...new Set(words.map(word => word.replace(/^\.\//, '')).filter(word => safeFile(word) && /[./]/.test(word) && /\p{L}/u.test(word)))].slice(0, 5)
  const names = words.filter(word => !periodOrSlash(word) && /^[\p{L}_$][\p{L}\p{N}_$-]{1,79}$/u.test(word))
  const identifiers = names.filter(word => /[a-z][A-Z]|[_$-]|^[A-Z].*[A-Z]/u.test(word) || query.includes('\x60' + word + '\x60'))
  return { paths, names: [...new Set(auto ? identifiers : names)].slice(0, 6) }
}

const periodOrSlash = word => /[./]/.test(word)
const uniqueLocations = rows => [...new Map(rows.map(row => [row.id, row])).values()]

export function createEngine({ executable, cacheDir } = {}) {
  if (executable !== undefined && (typeof executable !== 'string' || !isAbsolute(executable))) {
    throw new TypeError('code-map executable must be an absolute path')
  }
  const baseEnv = environment()
  const workers = new Map()

  function stop(root) {
    workers.get(root)?.close()
  }

  function workerOf(root) {
    let worker = workers.get(root)
    if (worker) return worker
    const env = { ...baseEnv, CBM_ALLOWED_ROOT: root, ...(cacheDir && { CBM_CACHE_DIR: cacheDir }) }
    worker = openGraph(executable ?? 'codebase-memory-mcp', { cwd: root, env }, () => workers.delete(root))
    workers.set(root, worker)
    return worker
  }

  async function call(root, tool, args, { signal, timeout = 6000 } = {}) {
    try {
      const json = await workerOf(root).call(tool, args, { signal, timeout })
      if (!json || typeof json !== 'object' || json.error || json.status === 'error') throw new Error('analysis-failed')
      return json
    } catch (error) {
      if (error.code === 'ENOENT') throw Object.assign(new Error('engine-missing'), { code: 'engine-missing' })
      throw new Error('analysis-failed')
    }
  }

  return {
    stop,
    dispose: () => { for (const root of workers.keys()) stop(root) },
    async index(root, signal) {
      const result = await call(root, 'index_repository', {
        repo_path: root, name: 'dsh-code-map-' + rootKey(root).slice(0, 32), mode: 'fast',
        persistence: false, index_worktree: true,
      }, { signal, timeout: 120_000 })
      if (!['indexed', 'degraded'].includes(result.status) || typeof result.project !== 'string') {
        throw new Error('analysis-failed')
      }
      return result
    },
    async search(root, project, query, { auto = false, signal } = {}) {
      const terms = patterns(query, auto)
      const common = { project, limit: 8, max_output_tokens: 2400, format: 'json' }
      const options = { signal }
      const rows = []
      if (terms.paths.length) {
        const result = await call(root, 'search_graph', { ...common,
          file_pattern: '(^|/)(' + terms.paths.map(regex).join('|') + ')$' }, options)
        rows.push(...locations(result))
      }
      if (terms.names.length) {
        const result = await call(root, 'search_graph', { ...common,
          name_pattern: (auto ? '^(' : '(') + terms.names.map(regex).join('|') + (auto ? ')$' : ')'),
        }, options)
        rows.push(...locations(result))
      }
      return uniqueLocations(rows).slice(0, auto ? 3 : 8)
    },
    async callers(root, project, id, signal) {
      const graph = await call(root, 'trace_path', { project, function_name: id, direction: 'inbound',
        depth: 2, limit: 8, include_tests: true, format: 'json' }, { signal })
      if (!Number.isSafeInteger(graph.callers_total)) throw new Error('analysis-failed')
      const hits = records(graph.callers).filter(row => text(row.qn, 380)).slice(0, 8)
      if (!hits.length) return { candidates: [], total: graph.callers_total }
      const graphRows = await call(root, 'search_graph', { project, format: 'json', limit: 8,
        qn_pattern: '^(' + hits.map(hit => regex(hit.qn)).join('|') + ')$' }, { signal })
      const byId = new Map(locations(graphRows).map(row => [row.id, row]))
      return { total: graph.callers_total, candidates: hits.flatMap(hit => {
        const row = byId.get(hit.qn)
        return row ? [{ ...row, hop: hit.hop }] : []
      }) }
    },
    async impact(root, project, signal) {
      const result = await call(root, 'detect_changes', { project, base_branch: 'HEAD',
        scope: 'impact', module_limit: 0, changed_limit: 12, depth: 2, limit: 8,
        max_output_tokens: 3200, format: 'json' }, { signal })
      if (!Array.isArray(result.changed_files) || !Array.isArray(result.impacted)) throw new Error('analysis-failed')
      return {
        changed: result.changed_total,
        files: result.changed_files.map(safeFile).filter(Boolean),
        total: result.impacted_total,
        more: result.impacted_total_relation === 'gte',
        candidates: result.impacted.filter(item => item.hop > 0).map(item => {
          const place = location(item)
          return place && { ...place, hop: item.hop }
        }).filter(Boolean),
      }
    },
  }
}
