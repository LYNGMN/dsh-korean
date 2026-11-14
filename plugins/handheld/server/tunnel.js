// Keeps `cloudflared tunnel run` alive for the named tunnel in front of the
// gateway. The tunnel token is read from $DSH_HOME/dsh-handheld/tunnel-token
// (0600) and handed over in the environment, never on the command line or in logs.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const CANDIDATES = ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared']
const RESTART_CAPS_MS = [1000, 2000, 5000, 10000, 30000, 60000]

export function findCloudflared(env = process.env) {
  const fromPath = (env.PATH ?? '').split(path.delimiter).map((dir) => path.join(dir, 'cloudflared'))
  return [...fromPath, ...CANDIDATES].find((file) => {
    try {
      fs.accessSync(file, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }) ?? null
}

export function readTunnelToken(dir) {
  try {
    const token = fs.readFileSync(path.join(dir, 'tunnel-token'), 'utf8').trim()
    return token.length > 0 ? token : null
  } catch {
    return null
  }
}

/** Short, token-free summary of a cloudflared log line worth keeping. */
function summarize(line) {
  if (/Registered tunnel connection/.test(line)) return 'tunnel connection registered'
  if (/\bERR\b/.test(line)) return `cloudflared error: ${line.replace(/\S*token\S*/gi, '[redacted]').slice(0, 160)}`
  return null
}

/**
 * @param {{dataDir: string, port: number, logger: {info: Function, warn: Function}, spawn?: typeof spawn, binary?: string | null}} options
 * @returns {{stop(): void, state: () => string}}
 */
export function startTunnel({ dataDir, port, logger, spawn: spawnImpl = spawn, binary = findCloudflared() }) {
  const token = readTunnelToken(dataDir)
  if (!binary || !token) {
    logger.warn(`[dsh-handheld] tunnel not started (${!binary ? 'cloudflared not found' : 'no tunnel-token file'})`)
    return { stop() {}, state: () => 'off' }
  }
  let child = null
  let stopped = false
  let failures = 0
  let timer = null
  let state = 'starting'

  function run() {
    if (stopped) return
    state = 'starting'
    const startedAt = Date.now()
    // --url serves tunnels created from the command line; a tunnel configured in
    // the Cloudflare dashboard uses its own published route instead.
    child = spawnImpl(binary, ['tunnel', '--no-autoupdate', 'run', '--url', `http://127.0.0.1:${String(port)}`], {
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TUNNEL_TOKEN: token },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let buffer = ''
    child.stderr?.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const note = summarize(line)
        if (!note) continue
        if (note === 'tunnel connection registered') {
          state = 'connected'
          failures = 0
        }
        logger.info(`[dsh-handheld] ${note}`)
      }
    })
    child.on('exit', (code) => {
      child = null
      state = 'down'
      if (stopped) return
      if (Date.now() - startedAt > 60_000) failures = 0
      const delay = RESTART_CAPS_MS[Math.min(failures, RESTART_CAPS_MS.length - 1)]
      failures += 1
      logger.warn(`[dsh-handheld] cloudflared exited (${String(code)}); restarting in ${String(delay / 1000)} s`)
      timer = setTimeout(run, delay)
      timer.unref?.()
    })
    child.on('error', (error) => logger.warn(`[dsh-handheld] cloudflared failed to start (${error.code ?? error.message})`))
  }

  run()
  return {
    stop() {
      stopped = true
      clearTimeout(timer)
      child?.kill('SIGTERM')
    },
    state: () => state,
  }
}
