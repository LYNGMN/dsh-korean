// 작업 폴더의 Git 상태를 읽기만 해서 "사실"로 바꾼다. fetch·push 같은 네트워크·쓰기 명령은 돌리지 않는다.
// 휴대폰 앱(plugins/handheld/server/gateway/git-read.js)이 같은 파일을 복사해 쓴다. 키트 test/git-stage-copies.test.mjs가 둘이 같은지 본다.
import { execFile } from 'node:child_process'

const TIMEOUT_MS = 5000
const PR_TTL_MS = 30_000
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

// `git status --porcelain=v2 --branch` → 브랜치·추적 브랜치·앞섬·변경 수.
export function parseStatus(text) {
  const result = { branch: null, upstream: null, unpushed: 0, changes: 0 }
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
    } else if (!line.startsWith('#')) {
      result.changes += 1
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
    }
  } catch {
    return null
  }
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
    const result = await run('gh', ['pr', 'view', branch, '--json', 'number,state,isDraft,url,mergeCommit'], cwd)
    const value = result.ok ? { pr: parsePr(result.out), prError: null } : { pr: null, prError: prErrorOf(result) }
    prCache.set(key, { at: now(), value })
    return value
  }

  /** @returns {Promise<object>} stagesOf가 읽는 사실. Git 저장소가 아니면 { repo: false }. */
  async function read(cwd) {
    if (typeof cwd !== 'string' || cwd === '') return { repo: false }
    const top = await git(cwd, 'rev-parse', '--show-toplevel')
    if (!top.ok) return { repo: false }

    const status = parseStatus((await git(cwd, 'status', '--porcelain=v2', '--branch')).out)
    const base = await baseOf(cwd)
    const remoteBase = await git(cwd, 'show-ref', '--verify', '--quiet', `refs/remotes/origin/${base}`)
    const baseRef = remoteBase.ok ? `origin/${base}` : base
    const isBase = status.branch === base
    const aheadResult = await git(cwd, 'rev-list', '--count', `${baseRef}..HEAD`)
    const ahead = aheadResult.ok ? Number(aheadResult.out.trim()) || 0 : 0
    const headTime = Number((await git(cwd, 'log', '-1', '--format=%ct', 'HEAD')).out.trim()) * 1000 || null

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
      folder: top.out.trim().split('/').pop() ?? '',
      branch: status.branch,
      base,
      isBase,
      changes: status.changes,
      ahead,
      upstream: status.upstream,
      unpushed: status.unpushed,
      hadCommits,
      headTime,
      pr,
      prError,
      tag: isBase && pr === null ? null : tag,
    }
  }

  return { read }
}
