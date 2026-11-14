// DSH plugin entry: learns how to reach this Host as an API caller and starts
// the phone gateway (and, when configured, the Cloudflare tunnel). Uses only
// services the Host exposes on the context, so the linked package never imports
// @deepseek-ai/* modules.
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, startHandheld } from './app.js'
import { dataDir, ensureDir, writePrivate } from './home.js'
import { startTunnel } from './tunnel.js'

export const name = 'dsh-handheld'
export const inject = ['connection', 'webServer']

/** Root URL of this Host plus its launch token, for `/connect`. */
function upstreamUrl(ctx) {
  const origin = typeof ctx.webServer.getOrigin === 'function'
    ? ctx.webServer.getOrigin()
    : `${ctx.webServer.protocol ?? 'http:'}//127.0.0.1:${String(ctx.webServer.port)}`
  return ctx.connection.authenticatedUrl(origin)
}

function hostLogger(logger) {
  return {
    info: (message) => logger.info(message),
    warn: (message) => logger.warn(message),
  }
}

export function apply(ctx, config = {}) {
  const logger = hostLogger(ctx.logger('dsh-handheld'))
  const dir = ensureDir(dataDir())
  const settings = loadConfig(dir, typeof config.port === 'number' ? { port: config.port } : {})

  if (config.devUpstreamFile === true) {
    const file = path.join(dir, 'upstream.json')
    ctx.effect(() => {
      writePrivate(file, JSON.stringify({ url: upstreamUrl(ctx), pid: process.pid, writtenAt: Date.now() }))
      return () => fs.rmSync(file, { force: true })
    }, 'dsh-handheld: dev upstream file')
  }

  ctx.effect(() => {
    let app = null
    let stopped = false
    const started = startHandheld({ upstreamUrl: () => upstreamUrl(ctx), dataDir: dir, config: { ...settings, devNoAuth: false }, logger })
      .then((value) => {
        app = value
        if (stopped) void value.stop()
      })
      .catch((error) => logger.warn(`[dsh-handheld] gateway did not start (${error.code ?? error.message})`))
    return () => {
      stopped = true
      void started.then(() => app?.stop())
    }
  }, 'dsh-handheld: gateway')

  if (settings.tunnel === true) {
    ctx.effect(() => {
      const tunnel = startTunnel({ dataDir: dir, port: settings.port, logger })
      return () => tunnel.stop()
    }, 'dsh-handheld: tunnel')
  }
}
