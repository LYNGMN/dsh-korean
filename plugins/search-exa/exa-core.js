/**
 * Wire-level helpers for the Exa Search API.
 *
 * This module deliberately has no DSH imports so it can be unit-tested with
 * plain Node before the bundle is installed into the Host process.
 */

const DEFAULT_ENDPOINT = 'https://api.exa.ai/search'
const DEFAULT_COUNT = 8
/** Exa bills 1–25 results at one rate; stay inside that tier. */
const MAX_COUNT = 25
const DEFAULT_SNIPPET_CHARS = 400

function text(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

/** Normalize the bundle's YAML config into stable provider settings. */
export function normalizeSettings(config = {}) {
  const rawCount = Number(config.count)
  const count = Number.isInteger(rawCount) && rawCount > 0 ? Math.min(rawCount, MAX_COUNT) : DEFAULT_COUNT
  const rawChars = Number(config.snippetChars)
  const snippetChars = Number.isInteger(rawChars) && rawChars > 0 ? rawChars : DEFAULT_SNIPPET_CHARS
  return {
    endpoint: text(config.endpoint, DEFAULT_ENDPOINT),
    apiKeyEnv: text(config.apiKeyEnv, 'EXA_API_KEY'),
    apiKeyFile: text(config.apiKeyFile, '~/.dsh/exa-api-key'),
    type: text(config.type, 'auto'),
    count,
    snippetChars
  }
}

/** Build the Exa search request body, honoring DSH's per-call result bound. */
export function buildSearchBody(settings, request) {
  const requested = Number(request?.maxResults)
  const numResults = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_COUNT) : settings.count
  return {
    query: String(request?.query ?? ''),
    numResults,
    type: settings.type,
    contents: { highlights: { maxCharacters: settings.snippetChars } }
  }
}

function clip(value, max) {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** Map Exa's `results` into DSH's normalized search sources. */
export function mapExaResponse(data, snippetChars = DEFAULT_SNIPPET_CHARS) {
  const results = Array.isArray(data?.results) ? data.results : []
  const sources = []
  const seen = new Set()
  for (const item of results) {
    if (item === null || typeof item !== 'object') continue
    if (typeof item.url !== 'string' || item.url.length === 0 || seen.has(item.url)) continue
    seen.add(item.url)
    const source = { url: item.url }
    if (typeof item.title === 'string' && item.title.trim() !== '') source.title = item.title.trim()
    const highlights = Array.isArray(item.highlights) ? item.highlights.filter((h) => typeof h === 'string' && h.trim() !== '') : []
    const snippet = highlights.length > 0
      ? highlights.join(' … ')
      : typeof item.summary === 'string' && item.summary.trim() !== ''
        ? item.summary
        : typeof item.text === 'string'
          ? item.text
          : ''
    if (snippet.trim() !== '') source.snippet = clip(snippet, snippetChars)
    if (typeof item.publishedDate === 'string' && item.publishedDate.length > 0) source.publishedAt = item.publishedDate
    sources.push(source)
  }
  return { sources, truncated: false }
}
