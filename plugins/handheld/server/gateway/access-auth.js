// Cloudflare Access JWT verification (RS256 against the team's JWKS).
// Every outside request must carry a token Access minted for this application:
// header `Cf-Access-Jwt-Assertion` (set by Access at the edge) or cookie `CF_Authorization`.
import { createPublicKey, createVerify } from 'node:crypto'

const CLOCK_SKEW_SECONDS = 60
const KEY_REFRESH_MIN_MS = 30_000
const KEY_MAX_AGE_MS = 60 * 60_000

class AccessError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AccessError'
  }
}

function decodeSegment(segment) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
  } catch {
    throw new AccessError('malformed token')
  }
}

/**
 * @param {object} options
 * @param {string} options.teamDomain - e.g. https://<team>.cloudflareaccess.com
 * @param {string} options.audience - the Access application's AUD tag
 * @param {string[]} [options.allowedEmails] - extra allowlist on top of the Access policy
 * @param {() => Promise<{keys: object[]}>} [options.fetchKeys]
 */
export function createAccessVerifier({ teamDomain, audience, allowedEmails = [], fetchKeys }) {
  if (!teamDomain) throw new Error('Access teamDomain is required')
  if (!audience) throw new Error('Access audience is required')
  const issuer = teamDomain.replace(/\/+$/, '')
  const loadKeys = fetchKeys ?? (async () => {
    const res = await fetch(`${issuer}/cdn-cgi/access/certs`)
    if (!res.ok) throw new AccessError(`could not load Access keys (${String(res.status)})`)
    return res.json()
  })
  const emails = new Set(allowedEmails.map((e) => e.toLowerCase()))
  let keys = new Map()
  let loadedAt = 0
  let lastMissRefresh = 0

  async function refresh() {
    const body = await loadKeys()
    keys = new Map((body.keys ?? []).filter((k) => k.kid).map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]))
    loadedAt = Date.now()
  }

  // An unknown kid (key rotation) triggers at most one reload per interval, so
  // garbage tokens cannot turn into a stream of requests to Cloudflare.
  async function keyFor(kid) {
    const now = Date.now()
    if (loadedAt === 0 || now - loadedAt > KEY_MAX_AGE_MS) await refresh()
    else if (!keys.has(kid) && now - lastMissRefresh > KEY_REFRESH_MIN_MS) {
      lastMissRefresh = now
      await refresh()
    }
    const key = keys.get(kid)
    if (!key) throw new AccessError('unknown key')
    return key
  }

  return {
    /**
     * @param {string | undefined} token
     * @returns {Promise<{email: string}>}
     */
    async verify(token) {
      if (typeof token !== 'string' || token.length === 0) throw new AccessError('missing token')
      const parts = token.split('.')
      if (parts.length !== 3) throw new AccessError('malformed token')
      const header = decodeSegment(parts[0])
      if (header.alg !== 'RS256') throw new AccessError('unsupported algorithm')
      const key = await keyFor(header.kid)
      const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(key, Buffer.from(parts[2], 'base64url'))
      if (!ok) throw new AccessError('bad signature')
      const claims = decodeSegment(parts[1])
      const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
      if (!auds.includes(audience)) throw new AccessError('wrong audience')
      if (claims.iss !== issuer) throw new AccessError('wrong issuer')
      const now = Math.floor(Date.now() / 1000)
      if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < now) throw new AccessError('token expired')
      if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_SECONDS > now) throw new AccessError('token not yet valid')
      const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : ''
      if (emails.size > 0 && !emails.has(email)) throw new AccessError('email not allowed')
      return { email }
    },
  }
}

/** Token from the edge header, else the Access cookie. */
export function accessTokenFrom(headers) {
  const header = headers['cf-access-jwt-assertion']
  if (typeof header === 'string' && header.length > 0) return header
  const cookie = headers.cookie ?? ''
  const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie)
  return match ? match[1] : undefined
}
