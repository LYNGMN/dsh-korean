import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readlink, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { runGit, safeFile } from './engine.js'

const MAX_PATHS = 256
const MAX_BYTES = 16 * 1024 * 1024
const missing = error => error.code === 'ENOENT' || error.code === 'ENOTDIR'

// Read only entries in this worktree. A symlink is fingerprinted by its text,
// and a changed directory component must never redirect a regular-file read.
async function fingerprint(root, file, budget, signal) {
  const path = join(root, file)
  let observed = false
  try {
    if (await realpath(dirname(path)) !== dirname(path)) return undefined
    const info = await lstat(path, { bigint: true })
    observed = true
    signal.throwIfAborted()
    if (info.isSymbolicLink()) {
      return 'link:' + createHash('sha256').update(await readlink(path, 'buffer')).digest('hex')
    }
    if (!info.isFile()) return undefined
    if (info.size > BigInt(budget.remaining)) throw new Error('snapshot-limit')
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    try {
      const initial = await handle.stat({ bigint: true })
      if (!initial.isFile() || initial.ino !== info.ino || initial.dev !== info.dev) {
        throw new Error('snapshot-changed')
      }
      const hash = createHash('sha256')
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, Number(info.size) || 1))
      let total = 0
      while (true) {
        signal.throwIfAborted()
        const { bytesRead } = await handle.read(chunk)
        if (!bytesRead) break
        total += bytesRead
        budget.remaining -= bytesRead
        if (budget.remaining < 0) throw new Error('snapshot-limit')
        hash.update(chunk.subarray(0, bytesRead))
      }
      const end = await handle.stat({ bigint: true })
      const current = await lstat(path, { bigint: true })
      if (BigInt(total) !== end.size || initial.mtimeNs !== end.mtimeNs || initial.ctimeNs !== end.ctimeNs ||
          current.dev !== end.dev || current.ino !== end.ino || current.ctimeNs !== end.ctimeNs) {
        throw new Error('snapshot-changed')
      }
      return String(initial.mode & 0o111n) + ':' + hash.digest('hex')
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (!observed && missing(error)) return 'missing'
    throw error
  }
}

export async function captureChanges(root, { head, previousPaths = [], signal = AbortSignal.timeout(2500) } = {}) {
  signal.throwIfAborted()
  root = await realpath(root)
  const baseline = head ?? (await runGit(root, ['rev-parse', '--verify', 'HEAD'], signal)).trim()
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(baseline)) throw new Error('no-baseline')

  const names = await Promise.all([
    runGit(root, ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', '--no-textconv',
      '--ignore-submodules=dirty', baseline, '--'], signal),
    runGit(root, ['ls-files', '--others', '--exclude-standard', '-z', '--'], signal),
  ])
  const paths = new Set([...previousPaths, ...names.flatMap(output => output.split('\0').filter(Boolean))])
  if (paths.size > MAX_PATHS) throw new Error('snapshot-limit')
  const budget = { remaining: MAX_BYTES }
  const fingerprints = new Map()
  let partial = false
  for (const file of paths) {
    signal.throwIfAborted()
    if (safeFile(file) !== file || file.includes('\uFFFD')) { partial = true; continue }
    const state = await fingerprint(root, file, budget, signal)
    if (state === undefined) partial = true
    else fingerprints.set(file, state)
  }
  signal.throwIfAborted()
  return { head: baseline, fingerprints, partial }
}

export function compareChanges(before, after) {
  if (before.head !== after.head) throw new Error('baseline-changed')
  const paths = new Set([...before.fingerprints.keys(), ...after.fingerprints.keys()])
  return {
    files: [...paths].filter(path => before.fingerprints.get(path) !== after.fingerprints.get(path)).sort(),
    partial: before.partial || after.partial,
  }
}
