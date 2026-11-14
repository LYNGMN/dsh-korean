// Where dsh-handheld keeps its own files: $DSH_HOME/dsh-handheld (0700),
// files written owner-only (0600).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function dataDir(env = process.env) {
  const home = env.DSH_HOME && env.DSH_HOME.length > 0 ? env.DSH_HOME : path.join(os.homedir(), '.dsh')
  return path.join(home, 'dsh-handheld')
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

export function writePrivate(file, text) {
  ensureDir(path.dirname(file))
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}
