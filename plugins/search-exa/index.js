import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { buildSearchBody, mapExaResponse, normalizeSettings } from './exa-core.js'
import { createSearchTool, registerSearchCommand } from './search-tool.js'

/**
 * Exa Search for DSH:
 * - the `exa` web_search provider,
 * - the `exa_search` tool, so the agent can search on Exa directly,
 * - the `/exa <question>` command, which uses Exa for that one request.
 *
 * The bundle is self-contained: linked profile packages do not resolve the
 * installation's @deepseek-ai/* packages, so a local error type carrying a
 * stable `code` is enough for the web seam.
 */
export class ExaSearchError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'ExaSearchError'
    this.code = code
  }
}

export const inject = ['web', 'tools', 'commands']

const USER_AGENT = 'dsh-search-exa/0.1.0'

function expandHome(value) {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return isAbsolute(value) ? value : join(homedir(), value)
}

function errorBody(value, secret) {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (secret) text = text.split(secret).join('[redacted]')
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

async function resolveApiKey(ctx, settings) {
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve(settings.apiKeyEnv)
      if (hit?.value) return hit.value
    } catch {
      // An unusable reference or store falls through to the other sources.
    }
  }

  const launchEnvironment = ctx.get('launchEnvironment')
  const fromEnvironment = launchEnvironment?.get?.(settings.apiKeyEnv)?.value ?? process.env[settings.apiKeyEnv]
  if (fromEnvironment) return fromEnvironment

  const file = expandHome(settings.apiKeyFile)
  try {
    const value = (await readFile(file, 'utf8')).trim()
    if (value) return value
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw new ExaSearchError(`Exa could not read "${file}": ${error.message}`, 'WEB_PROVIDER_ERROR')
    }
  }

  throw new ExaSearchError(
    `Exa has no API key for "${settings.apiKeyEnv}". Set ${settings.apiKeyEnv} in ~/.dsh/.env (chmod 600), the launch environment, or the DSH credential store.`,
    'WEB_PROVIDER_CREDENTIAL_MISSING'
  )
}

export class ExaSearchProvider {
  constructor(ctx, config) {
    this.ctx = ctx
    this.settings = normalizeSettings(config)
    this.id = 'exa'
    this.title = 'Exa'
    this.description = {
      en: 'Exa neural web search. Uses EXA_API_KEY; each search spends Exa credits.',
      ko: 'Exa 신경망 웹검색이에요. EXA_API_KEY를 쓰고, 검색할 때마다 Exa 크레딧이 들어요.'
    }
  }

  available() {
    return true
  }

  async search(request, signal) {
    const query = String(request?.query ?? '').trim()
    if (query.length === 0) throw new ExaSearchError('Exa requires a non-empty query', 'WEB_PROVIDER_ERROR')
    if (signal?.aborted) throw new ExaSearchError('Exa search aborted', 'WEB_ABORTED')

    const apiKey = await resolveApiKey(this.ctx, this.settings)
    if (signal?.aborted) throw new ExaSearchError('Exa search aborted', 'WEB_ABORTED')

    let response
    try {
      response = await fetch(this.settings.endpoint, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'user-agent': USER_AGENT
        },
        body: JSON.stringify(buildSearchBody(this.settings, { ...request, query }))
      })
    } catch (error) {
      if (signal?.aborted) throw new ExaSearchError('Exa search aborted', 'WEB_ABORTED')
      throw new ExaSearchError(`Exa request failed: ${error.message}`, 'WEB_PROVIDER_ERROR')
    }

    if (!response.ok) {
      let body = ''
      try {
        body = await response.text()
      } catch {
        // Keep the status-only diagnostic when the error body cannot be read.
      }
      const detail = errorBody(body, apiKey)
      const suffix = detail.length > 0 ? `: ${detail}` : ''
      if (response.status === 401 || response.status === 403) {
        throw new ExaSearchError(`Exa rejected the API key (HTTP ${response.status}). Check the Exa key.${suffix}`, 'WEB_PROVIDER_ERROR')
      }
      if (response.status === 402 || response.status === 429) {
        throw new ExaSearchError(`Exa rate limit or credits exhausted (HTTP ${response.status}). Check the Exa plan.${suffix}`, 'WEB_PROVIDER_ERROR')
      }
      throw new ExaSearchError(`Exa returned HTTP ${response.status}.${suffix}`, 'WEB_PROVIDER_ERROR')
    }

    let data
    try {
      data = await response.json()
    } catch (error) {
      throw new ExaSearchError(`Exa returned an unreadable response: ${error.message}`, 'WEB_PROVIDER_ERROR')
    }
    return mapExaResponse(data, this.settings.snippetChars)
  }
}

export function apply(ctx, config = {}) {
  const exa = new ExaSearchProvider(ctx, config)
  ctx.web.registerSearchProvider(exa)
  ctx.tools.register(createSearchTool({ toolName: 'exa_search', engine: 'Exa', provider: exa }))
  registerSearchCommand(ctx, {
    commandName: 'exa',
    toolName: 'exa_search',
    engine: 'Exa',
    description: {
      en: 'Search the web with Exa for this request only',
      ko: '이번 요청만 Exa로 웹검색해요'
    }
  })
}
