import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createSign } from 'node:crypto'
import { createAccessVerifier } from '../server/gateway/access-auth.js'

const TEAM = 'https://demo.cloudflareaccess.com'
const AUD = 'aud-tag-123'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }

function b64url(value) { return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url') }
function sign(payload, { kid = 'k1', key = privateKey, alg = 'RS256' } = {}) {
  const head = b64url({ alg, kid, typ: 'JWT' })
  const body = b64url(payload)
  const s = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url')
  return `${head}.${body}.${s}`
}
const now = () => Math.floor(Date.now() / 1000)
const good = () => ({ aud: [AUD], iss: TEAM, email: 'me@example.com', exp: now() + 600, iat: now() - 5, nbf: now() - 5, type: 'app' })
const fetchKeys = async () => ({ keys: [jwk] })
const verifier = (opts = {}) => createAccessVerifier({ teamDomain: TEAM, audience: AUD, allowedEmails: ['me@example.com'], fetchKeys, ...opts })

test('accepts a valid Access token and returns the email', async () => {
  assert.deepEqual(await verifier().verify(sign(good())), { email: 'me@example.com' })
})

test('rejects missing, malformed and unsigned tokens', async () => {
  const v = verifier()
  await assert.rejects(v.verify(undefined), /missing/)
  await assert.rejects(v.verify('a.b'), /malformed/)
  const [h, p] = sign(good()).split('.')
  await assert.rejects(v.verify(`${b64url({ alg: 'none', kid: 'k1' })}.${p}.`), /algorithm/)
  await assert.rejects(v.verify(`${h}.${p}.AAAA`), /signature/)
})

test('rejects wrong audience, issuer, expiry and email', async () => {
  const v = verifier()
  await assert.rejects(v.verify(sign({ ...good(), aud: ['other'] })), /audience/)
  await assert.rejects(v.verify(sign({ ...good(), iss: 'https://evil.cloudflareaccess.com' })), /issuer/)
  await assert.rejects(v.verify(sign({ ...good(), exp: now() - 120 })), /expired/)
  await assert.rejects(v.verify(sign({ ...good(), nbf: now() + 600 })), /not yet/)
  await assert.rejects(v.verify(sign({ ...good(), email: 'someone@else.com' })), /email/)
})

test('rejects a token signed by another key even with a known kid', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  await assert.rejects(verifier().verify(sign(good(), { key: other })), /signature/)
})

test('refreshes keys once for an unknown kid, then refuses', async () => {
  let calls = 0
  const v = verifier({ fetchKeys: async () => { calls += 1; return { keys: [jwk] } } })
  await v.verify(sign(good()))
  await assert.rejects(v.verify(sign(good(), { kid: 'k2' })), /unknown key/)
  assert.equal(calls, 2)
})

test('refuses to start without team domain or audience', () => {
  assert.throws(() => createAccessVerifier({ teamDomain: '', audience: AUD, fetchKeys }), /teamDomain/)
  assert.throws(() => createAccessVerifier({ teamDomain: TEAM, audience: '', fetchKeys }), /audience/)
})
