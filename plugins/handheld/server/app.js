// Wires one running dsh-handheld: DSH client -> hub -> gateway, plus store and
// push. Used by the DSH plugin (server/plugin.js) and by `npm run dev`.
import fs from 'node:fs'
import path from 'node:path'
import { DshClient } from './dsh/client.js'
import { DshApi } from './dsh/api.js'
import { createAccessVerifier } from './gateway/access-auth.js'
import { Hub } from './gateway/hub.js'
import { createGateway } from './gateway/server.js'
import { createNotifier } from './push/notifier.js'
import { Store } from './store.js'

const ROOT = path.join(import.meta.dirname, '..')

/** Settings a person fills in once (docs/setup-cloudflare.md). None of these are secrets. */
export function loadConfig(dir, overrides = {}) {
  let file = {}
  try {
    file = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  } catch {
    file = {}
  }
  const merged = { port: 3090, devNoAuth: false, publicOrigin: null, access: null, ...file, ...overrides }
  if (typeof merged.publicOrigin === 'string') merged.publicOrigin = merged.publicOrigin.replace(/\/+$/, '')
  return merged
}

function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
  } catch {
    return '0.0.0'
  }
}

/**
 * @param {object} options
 * @param {() => string | Promise<string>} options.upstreamUrl
 * @param {string} options.dataDir
 * @param {ReturnType<typeof loadConfig>} options.config
 * @param {{info: Function, warn: Function}} [options.logger]
 */
export async function startHandheld({ upstreamUrl, dataDir, config, logger = console }) {
  const client = new DshClient({ upstreamUrl, logger })
  const api = new DshApi(client)
  const hub = new Hub({ api, logger })
  const store = new Store(dataDir)
  const notifier = createNotifier({ store, subject: config.publicOrigin ?? 'mailto:dsh-handheld@localhost', logger })
  hub.on('notify', (note) => {
    notifier.notify(note).catch((error) => logger.warn(`[dsh-handheld] push failed (${error.message})`))
  })

  const access = config.access
  const verifier = access?.teamDomain && access?.audience
    ? createAccessVerifier({ teamDomain: `https://${String(access.teamDomain).replace(/^https?:\/\//, '')}`, audience: access.audience, allowedEmails: access.allowedEmails ?? [] })
    : null
  if (!verifier && !config.devNoAuth) logger.warn('[dsh-handheld] Cloudflare Access is not configured; remote requests are refused until config.json has access settings')

  const gateway = createGateway({
    hub,
    store,
    notifier,
    verifier,
    publicOrigin: config.publicOrigin,
    devNoAuth: config.devNoAuth === true,
    staticDir: path.join(ROOT, 'web', 'dist'),
    version: version(),
    logger,
  })

  hub.start()
  client.start()
  const port = await gateway.listen(config.port)
  logger.info(`[dsh-handheld] gateway listening on http://127.0.0.1:${String(port)}/h/`)

  return {
    port,
    hub,
    async stop() {
      hub.stop()
      client.stop()
      await gateway.close()
    },
  }
}
