// 작업 폴더의 Git 상태를 읽기만 해서 "사실"로 바꾼다. fetch·push 같은 네트워크·쓰기 명령은 돌리지 않는다.
// 휴대폰 앱(plugins/handheld/server/gateway/git-read.js)이 같은 파일을 복사해 쓴다. 키트 test/git-stage-copies.test.mjs가 둘이 같은지 본다.
import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const TIMEOUT_MS = 5000
const PR_TTL_MS = 30_000
const MAX_REPOS = 40
const MAX_COMMITS = 20
const MAX_PENDING = 30
const MAX_DIRS = 600
const SKIP_DIRS = new Set(['node_modules'])
const ENV = { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', LC_ALL: 'C' }

/** execFile을 약속으로. 실패해도 던지지 않고 { ok, out, err, code }를 준다. 출력 원문은 밖으로 내보내지 않는다. */
export function runCommand(file, args, cwd) {
  return new Promise(resolve => {
    execFile(file, args, { cwd, timeout: TIMEOUT_MS, maxBuffer: 1 << 20, env: { ...process.env, ...ENV }, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: error === null,
        out: String(stdout ?? ''),
        err: String(stderr ?? ''),
        code: error === null ? 0 : error.code ?? null,
        timedOut: error?.killed === true,
      })
    })
  })
}

// porcelain v2 한 줄 → 경로와 종류(새 파일·고침·지움·이름 바꿈·충돌). 경로 앞 칸 수는 줄 종류마다 다르다.
function pendingOf(line) {
  const after = (count) => line.split(' ').slice(count).join(' ')
  if (line.startsWith('? ')) return { path: line.slice(2), kind: 'new' }
  if (line.startsWith('u ')) return { path: after(10), kind: 'conflict' }
  const xy = line.slice(2, 4)
  if (line.startsWith('2 ')) return { path: after(9).split('\t')[0], kind: 'renamed' }
  if (line.startsWith('1 ')) return { path: after(8), kind: xy.includes('D') ? 'deleted' : xy.includes('A') ? 'new' : 'modified' }
  return null
}

// `git status --porcelain=v2 --branch` → 브랜치·추적 브랜치·앞섬·변경 수·저장 안 된 파일(앞 30개).
export function parseStatus(text) {
  const result = { branch: null, upstream: null, unpushed: 0, changes: 0, pending: [] }
  for (const line of text.split('\n')) {
    if (line === '') continue
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length)
      result.branch = head === '(detached)' ? null : head
    } else if (line.startsWith('# branch.upstream ')) {
      result.upstream = line.slice('# branch.upstream '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const ahead = /\+(\d+)/.exec(line)
      result.unpushed = ahead ? Number(ahead[1]) : 0
    } else if (!line.startsWith('#') && !line.startsWith('! ')) {
      result.changes += 1
      const item = pendingOf(line)
      if (item !== null && result.pending.length < MAX_PENDING) result.pending.push(item)
    }
  }
  return result
}

export function prErrorOf(result) {
  if (result.code === 'ENOENT') return 'no-gh'
  if (result.timedOut) return 'timeout'
  const text = result.err.toLowerCase()
  if (text.includes('no pull requests found')) return null
  if (text.includes('gh auth login') || text.includes('authentication') || text.includes('http 401') || text.includes('not logged')) return 'auth'
  return 'error'
}

const PASSING = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const REVIEW = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes', REVIEW_REQUIRED: 'required' }

/** gh의 statusCheckRollup → 통과·실패·진행 중 개수와 실패한 검사 이름(최대 3개). 검사가 없으면 null. */
export function checksOf(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) return null
  const checks = { passing: 0, failing: 0, pending: 0, failed: [] }
  for (const item of rollup) {
    const name = String(item?.name ?? item?.context ?? '').slice(0, 80)
    const done = item?.__typename === 'StatusContext' ? !['PENDING', 'EXPECTED'].includes(item.state) : item?.status === 'COMPLETED'
    const result = item?.__typename === 'StatusContext' ? item.state : item?.conclusion
    if (!done) checks.pending += 1
    else if (PASSING.has(result)) checks.passing += 1
    else {
      checks.failing += 1
      if (checks.failed.length < 3 && name) checks.failed.push(name)
    }
  }
  return checks
}

function parsePr(text) {
  try {
    const value = JSON.parse(text)
    if (typeof value?.number !== 'number') return null
    return {
      number: value.number,
      state: String(value.state ?? 'OPEN').toUpperCase(),
      draft: value.isDraft === true,
      url: typeof value.url === 'string' && value.url.startsWith('https://') ? value.url : null,
      mergeCommit: typeof value.mergeCommit?.oid === 'string' ? value.mergeCommit.oid : null,
      checks: checksOf(value.statusCheckRollup),
      review: REVIEW[value.reviewDecision] ?? null,
    }
  } catch {
    return null
  }
}

// ── 저장소 묶음 폴더(예: ~/Dev) 안의 저장소 찾기 ─────────────────────
// 명령 없이 파일만 본다. 저장소가 아닌 하위 폴더는 세 단계(예: worktrees/<저장소>/<작업본>)까지 내려간다.

async function childDirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)).map(entry => entry.name).sort()
  } catch {
    return []
  }
}

// .git 폴더, 또는 작업본의 .git 파일("gitdir: …")이 가리키는 폴더.
async function gitDirOf(dir) {
  const dotGit = join(dir, '.git')
  let info
  try { info = await stat(dotGit) } catch { return null }
  if (info.isDirectory()) return dotGit
  if (!info.isFile()) return null
  const match = /^gitdir:\s*(.+)$/m.exec(await readFile(dotGit, 'utf8').catch(() => ''))
  return match ? resolve(dir, match[1].trim()) : null
}

// 마지막 Git 활동 시각: 브랜치 기록·색인·HEAD 가운데 가장 늦게 바뀐 것.
async function activityOf(gitDir) {
  let latest = 0
  for (const name of ['logs/HEAD', 'index', 'HEAD']) {
    try { latest = Math.max(latest, (await stat(join(gitDir, name))).mtimeMs) } catch { /* 없으면 건너뜀 */ }
  }
  return latest
}

/** @returns {Promise<{ name: string, activeAt: number }[]>} name은 folder 기준 상대 경로. 최근 활동 순. */
export async function findRepos(folder) {
  const found = []
  let budget = MAX_DIRS
  const visit = async rel => {
    budget -= 1
    const gitDir = await gitDirOf(join(folder, rel))
    if (gitDir !== null) found.push({ name: rel, activeAt: await activityOf(gitDir) })
    return gitDir !== null
  }
  const walk = async (rel, depth) => {
    for (const child of await childDirs(join(folder, rel))) {
      if (budget <= 0) return
      const next = rel === '' ? child : `${rel}/${child}`
      if (!(await visit(next)) && depth < 3) await walk(next, depth + 1)
    }
  }
  await walk('', 1)
  return found.sort((a, b) => b.activeAt - a.activeAt || a.name.localeCompare(b.name))
}

// ── 세션이 명령을 돌린 저장소 ─────────────────────────────────────
// 명령 글에서 폴더를 가리키는 말(cd 폴더, git -C 폴더, --prefix 폴더, 절대 경로·~/ 경로)을 찾아 절대 경로로 바꾼다.

const PATH_WORD = `("[^"]+"|'[^']+'|[^\\s;&|()]+)`
const PATH_PATTERNS = [
  new RegExp(`(?:^|[\\s;&|(])cd\\s+${PATH_WORD}`, 'g'),
  new RegExp(`\\s-C\\s+${PATH_WORD}`, 'g'),
  new RegExp(`--prefix[=\\s]+${PATH_WORD}`, 'g'),
  /(?:^|[\s=(])((?:~\/|\/)[^\s;&|()'"]+)/g,
]

/** 명령 하나가 가리키는 폴더들(나온 순서). cwd는 그 명령이 돈 폴더. */
export function pathsOfCommand(command, cwd, home = homedir()) {
  if (typeof command !== 'string' || typeof cwd !== 'string') return []
  const found = []
  for (const pattern of PATH_PATTERNS) {
    for (const match of command.matchAll(pattern)) {
      let word = match[1].replace(/^(["'])(.*)\1$/, '$2')
      if (word === '-' || word.startsWith('$')) continue
      if (word === '~' || word.startsWith('~/')) word = home + word.slice(1)
      found.push({ at: match.index, path: resolve(cwd, word) })
    }
  }
  return found.sort((a, b) => a.at - b.at).map(item => item.path)
}

/** 경로가 묶음 폴더 안 어느 저장소에 드는지. 긴 이름(작업본)부터 본다. */
function repoOfPath(path, folder, names) {
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const root = join(folder, name)
    if (path === root || path.startsWith(`${root}/`)) return name
  }
  return null
}

/** 가장 최근 명령부터 거슬러 보며, 그 세션이 마지막으로 다룬 저장소 이름. 없으면 null. */
export function repoOfCommands(commands, folder, names) {
  const list = Array.isArray(commands) ? commands.slice(-60) : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const { command, cwd } = list[i] ?? {}
    const where = typeof cwd === 'string' ? cwd : folder
    for (const path of [...pathsOfCommand(command, where), where]) {
      const name = repoOfPath(path, folder, names)
      if (name !== null) return name
    }
  }
  return null
}

// 테스트·빌드·검사 명령. 파이프(|)·세미콜론 뒤에 오면 종료 코드가 그 명령 것이 아니므로 마지막 && 조각만 본다.
export const VERIFY_COMMAND = /^(?:npm (?:run )?test|npm run (?:build|check|lint|typecheck)|npx (?:vitest|jest|playwright test|tsc)\b|node --test|pnpm (?:run )?(?:test|build|check)|yarn (?:test|build)|bun test|pytest|python3? -m pytest|go (?:test|build|vet)|cargo (?:test|build|check)|make (?:test|check))\b/

/** 명령에서 검증 부분: && 로 이은 마지막 조각이 검증 명령이고 파이프·세미콜론이 없을 때만. */
export function verifyCommandOf(command) {
  if (typeof command !== 'string' || /[|;]/.test(command)) return null
  const last = command.split('&&').pop().trim().replace(/^(?:nice(?: -n \d+)? |timeout \d+ |env (?:\w+=\S+ )+)+/, '')
  return VERIFY_COMMAND.test(last) ? last.slice(0, 80) : null
}

const inside = (path, root) => typeof path === 'string' && (path === root || path.startsWith(`${root}/`))

/**
 * 이 저장소에서 마지막으로 통과한 검증 명령과, 그 뒤에 에이전트가 이 저장소 파일을 고쳤는지.
 * @returns {{ at: number, command: string, editedAfter: boolean } | null}
 */
export function verifyRunOf(commands, edits, topLevel) {
  const list = Array.isArray(commands) ? commands : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const { command, cwd, ok, at } = list[i] ?? {}
    if (ok !== true || typeof at !== 'number' || typeof cwd !== 'string') continue
    const verify = verifyCommandOf(command)
    if (verify === null) continue
    if (![...pathsOfCommand(command, cwd), cwd].some(path => inside(path, topLevel))) continue
    const editedAfter = (Array.isArray(edits) ? edits : []).some(edit => typeof edit?.at === 'number' && edit.at > at && inside(resolve(cwd, edit.path), topLevel))
    return { at, command: verify, editedAfter }
  }
  return null
}

/**
 * @param {{ run?: typeof runCommand, now?: () => number }} [options] run은 시험에서 바꿔 끼운다.
 */
export function createGitReader({ run = runCommand, now = Date.now } = {}) {
  const prCache = new Map()

  const git = (cwd, ...args) => run('git', args, cwd)

  async function baseOf(cwd) {
    const head = await git(cwd, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
    if (head.ok && head.out.trim().startsWith('origin/')) return head.out.trim().slice('origin/'.length)
    for (const name of ['main', 'master']) {
      const local = await git(cwd, 'show-ref', '--verify', '--quiet', `refs/heads/${name}`)
      if (local.ok) return name
      const remote = await git(cwd, 'show-ref', '--verify', '--quiet', `refs/remotes/origin/${name}`)
      if (remote.ok) return name
    }
    return 'main'
  }

  async function prOf(cwd, branch) {
    const key = `${cwd}\u0000${branch}`
    const cached = prCache.get(key)
    if (cached && now() - cached.at < PR_TTL_MS) return cached.value
    const result = await run('gh', ['pr', 'view', branch, '--json', 'number,state,isDraft,url,mergeCommit,statusCheckRollup,reviewDecision'], cwd)
    const value = result.ok ? { pr: parsePr(result.out), prError: null } : { pr: null, prError: prErrorOf(result) }
    prCache.set(key, { at: now(), value })
    return value
  }

  /**
   * @param {string} cwd 세션 작업 폴더
   * @param {{ pick?: string | null, commands?: Array<{ command: string, cwd?: string | null, ok?: boolean | null, at?: number | null }>, edits?: Array<{ path: string, at: number | null }> }} [options]
   *   pick: 저장소 묶음 폴더일 때 사람이 고른 저장소(상대 경로). 목록에 없으면 무시.
   *   commands: 그 세션이 돌린 명령(오래된 것부터). 고른 저장소가 없으면 마지막으로 다룬 저장소를 따라간다.
   * @returns {Promise<object>} stagesOf가 읽는 사실. 저장소도, 안에 저장소도 없으면 { repo: false }.
   *   묶음 폴더면 가장 최근에 Git 활동이 있던 저장소(또는 고른 저장소)를 읽고 within에 목록을 붙인다.
   */
  async function read(cwd, { pick = null, commands = [], edits = [] } = {}) {
    if (typeof cwd !== 'string' || cwd === '') return { repo: false }
    const top = await git(cwd, 'rev-parse', '--show-toplevel')
    if (top.ok) return readRepo(cwd, top.out.trim(), { commands, edits })

    const repos = await findRepos(cwd)
    const picked = repos.find(item => item.name === pick)
    const touched = picked ? null : repoOfCommands(commands, cwd, repos.map(item => item.name))
    const chosen = picked ?? repos.find(item => item.name === touched) ?? repos[0]
    if (chosen === undefined) return { repo: false }
    const reason = picked ? 'picked' : touched === chosen.name ? 'session' : 'recent'
    const path = join(cwd, chosen.name)
    const inner = await git(path, 'rev-parse', '--show-toplevel')
    if (!inner.ok) return { repo: false }
    const names = repos.slice(0, MAX_REPOS).map(item => item.name)
    if (!names.includes(chosen.name)) names.push(chosen.name)
    return {
      ...(await readRepo(path, inner.out.trim(), { commands, edits })),
      folder: chosen.name,
      within: { folder: basename(cwd), repos: names, picked: chosen.name, auto: reason !== 'picked', reason },
    }
  }

  async function readRepo(cwd, topLevel, { commands = [], edits = [] } = {}) {

    const status = parseStatus((await git(cwd, 'status', '--porcelain=v2', '--branch')).out)
    const base = await baseOf(cwd)
    const remoteBase = await git(cwd, 'show-ref', '--verify', '--quiet', `refs/remotes/origin/${base}`)
    const baseRef = remoteBase.ok ? `origin/${base}` : base
    const isBase = status.branch === base
    const aheadResult = await git(cwd, 'rev-list', '--count', `${baseRef}..HEAD`)
    const ahead = aheadResult.ok ? Number(aheadResult.out.trim()) || 0 : 0
    const headTime = Number((await git(cwd, 'log', '-1', '--format=%ct', 'HEAD')).out.trim()) * 1000 || null

    // 원본에 없는 저장 기록(제목)과 바뀐 파일 수: 공유·합치기 때 "이번에 올라가는 것".
    let commits = []
    let files = null
    if (ahead > 0) {
      const log = await git(cwd, 'log', `--max-count=${MAX_COMMITS}`, '--format=%h%x09%s', `${baseRef}..HEAD`)
      if (log.ok) {
        commits = log.out.split('\n').filter(line => line !== '').map(line => {
          const [id, ...rest] = line.split('\t')
          return { id, subject: rest.join('\t').slice(0, 200) }
        })
      }
      const stat = await git(cwd, 'diff', '--shortstat', `${baseRef}...HEAD`)
      const changed = /(\d+) files? changed/.exec(stat.out)
      if (stat.ok && changed) {
        files = { changed: Number(changed[1]), added: Number(/(\d+) insertion/.exec(stat.out)?.[1] ?? 0), removed: Number(/(\d+) deletion/.exec(stat.out)?.[1] ?? 0) }
      }
    }

    let hadCommits = ahead > 0
    if (!hadCommits && status.branch !== null && !isBase) {
      const reflog = await git(cwd, 'log', '-g', '--format=%gs', `refs/heads/${status.branch}`)
      hadCommits = reflog.ok && reflog.out.split('\n').some(line => line.startsWith('commit'))
    }

    let pr = null
    let prError = null
    if (status.branch !== null && !isBase) ({ pr, prError } = await prOf(cwd, status.branch))

    const target = pr?.mergeCommit ?? 'HEAD'
    const tags = await git(cwd, 'tag', '--contains', target, '--list', 'v*', '--sort=v:refname')
    const tag = tags.ok ? tags.out.split('\n').find(line => line.trim() !== '')?.trim() ?? null : null

    return {
      repo: true,
      folder: topLevel.split('/').pop() ?? '',
      branch: status.branch,
      base,
      isBase,
      changes: status.changes,
      pending: status.pending,
      ahead,
      commits,
      files,
      upstream: status.upstream,
      unpushed: status.unpushed,
      hadCommits,
      headTime,
      pr,
      prError,
      tag: isBase && pr === null ? null : tag,
      verify: verifyRunOf(commands, edits, topLevel),
    }
  }

  return { read }
}
