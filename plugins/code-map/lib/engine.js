import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, delimiter, isAbsolute, join } from 'node:path'
import { openGraph } from './mcp.js'

export const rootKey = root => createHash('sha256').update(root).digest('hex')
const text = (value, max) => typeof value === 'string' && value.length <= max &&
  !/[\p{C}\u2028\u2029]/u.test(value) ? value : ''
const regex = value => value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')
const textEnv = ['HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'TMPDIR',
  'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'LOCALAPPDATA', 'APPDATA', 'LANG', 'LC_ALL']

// Extensions the engine does not know but that hold code. Without this the
// files are skipped silently: they never show up as "not indexed" either.
export const EXTRA_EXTENSIONS = Object.freeze({ '.gs': 'javascript' })

// The engine reads extra_extensions from $XDG_CONFIG_HOME/codebase-memory-mcp,
// so the plugin points it at its own folder and leaves the user's config alone.
function prepareConfig(home) {
  const dir = join(home, 'codebase-memory-mcp')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ extra_extensions: EXTRA_EXTENSIONS }) + '\n', { mode: 0o600 })
}

const NOT_CODE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'pdf', 'zip', 'gz', 'woff', 'woff2', 'ttf',
  'otf', 'mp3', 'mp4', 'mov', 'lock', 'ds_store', 'bak', 'log', 'map', 'min'])
// Files that hold prose, data, settings or media rather than program code. A
// file the map lacks and that is not in this set might be code, so it stays in
// the "needs a look" group; only these are filed as quiet.
const QUIET = new Set([...NOT_CODE, 'md', 'markdown', 'txt', 'rst', 'json', 'jsonc', 'yml', 'yaml', 'toml', 'ini', 'cfg',
  'csv', 'tsv', 'xml', 'env', 'gitignore', 'claspignore', 'editorconfig', 'license', 'bmp', 'tif', 'tiff', 'avif', 'heic',
  'wav', 'ogg', 'm4a', 'webm', 'avi', 'rar', '7z', 'tar', 'tgz', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx'])
const extOf = path => {
  const name = basename(path).toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1) : ''
}

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

export function runGit(root, args, signal) {
  return run('git', ['-c', 'core.fsmonitor=false', ...args],
    { cwd: root, env: environment(), signal, timeout: 1500 })
}

export async function repositoryOf(cwd, signal) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) return null
  try {
    const out = await runGit(cwd, ['rev-parse', '--show-toplevel'], signal)
    const root = out.replace(/\r?\n$/, '')
    return isAbsolute(root) && text(root, 4096) ? await realpath(root) : null
  } catch {
    return null
  }
}

export function safeFile(value) {
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
  const incoming = row.in === '' || row.in === undefined || row.in === null ? NaN : Number(row.in)
  return file && id && name ? { id, file, name, kind: text(row.label, 50), ...(line > 0 && { line }),
    ...(Number.isSafeInteger(incoming) && incoming >= 0 && { callers: incoming }) } : null
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

// Counts come straight from the index result. A missing field stays null, so
// the screen can say "unknown" instead of showing a reassuring zero.
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null

function top(counts, limit) {
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
    .map(([ext, files]) => ({ ext: '.' + ext, files }))
}

function formatsOf(survey) {
  if (!survey) return null
  const counts = new Map()
  for (const file of survey.tracked) {
    const ext = extOf(file)
    if (ext && !survey.exts.has(ext) && !NOT_CODE.has(ext)) counts.set(ext, (counts.get(ext) ?? 0) + 1)
  }
  return top(counts, 5)
}

// The engine leaves test folders out of the map on purpose, so they get their own count: calls from
// tests are missing from "who uses this", which is worth saying, but it is not a read failure.
const isTestPath = file => /(^|\/)(tests?|__tests__|specs?|e2e)\//i.test(file) || /\.(test|spec)\.[a-z0-9]+$/i.test(file)

// Files without an extension are settings or prose (.gitignore, LICENSE) unless they are well-known build files.
const BUILD_NAMES = new Set(['dockerfile', 'makefile', 'jenkinsfile', 'procfile', 'rakefile', 'gemfile', 'brewfile', 'vagrantfile', 'justfile'])
const isQuietFile = file => {
  const ext = extOf(file)
  if (ext) return QUIET.has(ext)
  return !BUILD_NAMES.has(basename(file).toLowerCase())
}

const FILE_LIMIT = 12

function unmappedOf(survey) {
  if (!survey) return null
  const counts = new Map()
  const lookFiles = []
  let look = 0
  let tests = 0
  let quiet = 0
  for (const file of survey.tracked) {
    if (survey.files.has(file)) continue
    if (isQuietFile(file)) quiet += 1
    else if (isTestPath(file)) tests += 1
    else {
      look += 1
      if (lookFiles.length < FILE_LIMIT) lookFiles.push(file)
      const key = extOf(file) ? '.' + extOf(file) : basename(file)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const lookTop = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([ext, files]) => ({ ext, files }))
  return { look, tests, quiet, lookFiles, lookTop }
}

// The index result names the files it read only partly or not at all, with the lines it choked on.
function firstLine(ranges) {
  const line = Number.parseInt(String(ranges ?? ''), 10)
  return Number.isSafeInteger(line) && line > 0 ? line : undefined
}

function filesOf(group) {
  if (!group || !Array.isArray(group.files)) return null
  const files = group.files.flatMap(item => typeof item?.path === 'string' && item.path && !item.path.includes('\0')
    ? [{ file: item.path.slice(0, 300), ...(firstLine(item.error_ranges) && { line: firstLine(item.error_ranges) }) }] : [])
  return { files: files.slice(0, FILE_LIMIT), more: group.truncated === true || files.length > FILE_LIMIT }
}

export function coverageOf(result) {
  return {
    notIndexed: count(result?.not_indexed_files_count),
    partial: count(result?.parse_partial_count),
    unusable: count(result?.parse_unusable_count),
    skipped: count(result?.skipped_count),
    partialFiles: filesOf(result?.parse_partial),
    unusableFiles: filesOf(result?.parse_unusable),
  }
}

// True when the request names something the index can look up exactly: a
// path or an identifier-shaped word. Plain Korean sentences do not.
export function hasIdentifier(query) {
  if (typeof query !== 'string') return false
  const terms = patterns(query, true)
  return terms.paths.length + terms.names.length > 0
}
const uniqueLocations = rows => [...new Map(rows.map(row => [row.id, row])).values()]

export function createEngine({ executable, cacheDir, runtimeDir } = {}) {
  if (executable !== undefined && (typeof executable !== 'string' || !isAbsolute(executable))) {
    throw new TypeError('code-map executable must be an absolute path')
  }
  const configHome = cacheDir && join(cacheDir, 'xdg-config')
  if (configHome) prepareConfig(configHome)
  const baseEnv = { ...environment(), ...(configHome && { XDG_CONFIG_HOME: configHome }) }
  const workers = new Map()

  function stop(root) {
    workers.get(root)?.close()
  }

  function workerOf(root) {
    let worker = workers.get(root)
    if (worker) return worker
    const env = { ...baseEnv, CBM_ALLOWED_ROOT: root,
      ...(cacheDir && { CBM_CACHE_DIR: cacheDir }), ...(runtimeDir && { CBM_RUNTIME_DIR: runtimeDir }) }
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

  async function callers(root, project, id, signal) {
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
  }

  // Which tracked files the map holds: every tracked path, the paths and extensions the map has.
  // null means it could not be worked out (large repo, git or engine failure).
  async function survey(root, project, signal) {
      try {
        const tracked = (await runGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--'], signal))
          .split('\0').filter(Boolean)
        const files = new Set()
        const exts = new Set()
        for (let offset = 0; ; offset += 500) {
          if (offset >= 3000) return null
          const page = await call(root, 'search_graph', { project, label: 'File', format: 'json', limit: 500, offset,
            max_output_tokens: 60000 }, { signal, timeout: 10_000 })
          for (const row of records(page)) if (typeof row.file === 'string') { files.add(row.file); exts.add(extOf(row.file)) }
          if (!page.has_more) break
        }
        return { tracked, files, exts }
      } catch {
        return null
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
      return { ...result, coverage: coverageOf(result) }
    },
    async search(root, project, query, { auto = false, signal, limit } = {}) {
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
      return uniqueLocations(rows).slice(0, limit ?? (auto ? 3 : 8))
    },
    // What the map knows about one file right now: parsed fully, partly, or not at all.
    async fileStatus(root, project, file, signal) {
      if (safeFile(file) !== file || !file) throw new Error('analysis-failed')
      const result = await call(root, 'check_index_coverage', { project, paths: [file], format: 'json' }, { signal, timeout: 2000 })
      const entry = Array.isArray(result.paths) ? result.paths[0] : undefined
      if (!entry || typeof entry.status !== 'string') throw new Error('analysis-failed')
      const ranges = (Array.isArray(entry.coverage) ? entry.coverage : []).flatMap(item => Array.isArray(item?.ranges) ? item.ranges : [])
        .map(range => [Number(range?.start), Number(range?.end)]).filter(([a, b]) => Number.isSafeInteger(a) && Number.isSafeInteger(b)).slice(0, 3)
      return { status: text(entry.status, 40), freshness: text(entry.freshness, 40), ranges }
    },
    callers,
    // Extensions the map holds no file of at all, with how many tracked files use them.
    async unknownFormats(root, project, signal) {
      return formatsOf(await survey(root, project, signal))
    },
    // Tracked files missing from the map, split into ones that might be code (or unknown) and
    // ones that are prose, data or media. null when the survey failed.
    async unmapped(root, project, signal) {
      return unmappedOf(await survey(root, project, signal))
    },
    // Both answers from one survey of the repository.
    async gaps(root, project, signal) {
      const found = await survey(root, project, signal)
      return { unknownFormats: formatsOf(found), unmapped: unmappedOf(found) }
    },
    async scopedImpact(root, project, files, signal) {
      const paths = [...new Set(files)].filter(file => safeFile(file) === file && file).slice(0, 8)
      if (!paths.length) return { candidates: [], partial: files.length > 0 }
      const byFile = new Map()
      let partial = paths.length !== files.length
      for (const file of paths) {
        // CBM treats file_pattern as a glob/substring. Check the returned
        // path too, so a similarly named file can never supply seeds.
        const tables = await Promise.all(['Function', 'Method'].map(label => call(root, 'search_graph',
          { project, label, file_pattern: file, format: 'json', limit: 12 }, { signal })))
        const definitions = tables.flatMap(locations).filter(row => row.file === file)
        byFile.set(file, definitions)
        partial ||= !definitions.length || tables.some(table => table.has_more || table.truncated)
      }
      // Give each changed file a chance before picking additional definitions.
      const seeds = [0, 1].flatMap(offset => paths.map(file => byFile.get(file)[offset]).filter(Boolean)).slice(0, 8)
      partial ||= [...byFile.values()].reduce((count, definitions) => count + definitions.length, 0) > seeds.length
      const selected = new Map()
      for (const seed of seeds) {
        signal?.throwIfAborted()
        try {
          const result = await callers(root, project, seed.id, signal)
          partial ||= result.total > result.candidates.length
          for (const row of result.candidates) {
            if (row.hop > 0 && (!selected.has(row.id) || row.hop < selected.get(row.id).hop)) {
              selected.set(row.id, row)
            }
          }
        } catch {
          partial = true
        }
      }
      const candidates = [...selected.values()].sort((a, b) => a.hop - b.hop || a.file.localeCompare(b.file))
      return { candidates: candidates.slice(0, 8), partial: partial || candidates.length > 8 }
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
