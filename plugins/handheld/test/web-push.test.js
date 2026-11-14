import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createECDH, createHmac, createDecipheriv, createVerify, createPublicKey } from 'node:crypto'
import { encryptPayload, generateVapidKeys, vapidAuthorization, sendPush } from '../server/push/web-push.js'

const b = (s) => Buffer.from(s, 'base64url')

// RFC 8291 Appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

test('aes128gcm body matches RFC 8291 test vector', () => {
  const body = encryptPayload({
    plaintext: Buffer.from(RFC.plaintext), uaPublic: b(RFC.uaPublic), authSecret: b(RFC.auth),
    salt: b(RFC.salt), senderPrivate: b(RFC.asPrivate),
  })
  assert.equal(body.toString('base64url'), RFC.body)
})

function decrypt(body, uaEcdh, authSecret) {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const ct = body.subarray(21 + idlen)
  const hmac = (k, d) => createHmac('sha256', k).update(d).digest()
  const ecdh = uaEcdh.computeSecret(asPublic)
  const prkKey = hmac(authSecret, ecdh)
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaEcdh.getPublicKey(), asPublic, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12)
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(ct.subarray(ct.length - 16))
  const out = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()])
  assert.equal(out[out.length - 1], 2)
  return out.subarray(0, out.length - 1).toString()
}

test('random-key encryption decrypts back on the subscriber side', () => {
  const ua = createECDH('prime256v1'); ua.generateKeys()
  const auth = Buffer.alloc(16, 7)
  const body = encryptPayload({ plaintext: Buffer.from('{"kind":"approval"}'), uaPublic: ua.getPublicKey(), authSecret: auth })
  assert.equal(decrypt(body, ua, auth), '{"kind":"approval"}')
})

test('VAPID header carries an ES256 JWT that verifies with the public key', () => {
  const keys = generateVapidKeys()
  const header = vapidAuthorization({ endpoint: 'https://web.push.apple.com/abc', keys, subject: 'https://pocket.example.com' })
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(header)
  assert.ok(m)
  assert.equal(m[2], keys.publicKey)
  const [h, p, s] = m[1].split('.')
  const claims = JSON.parse(b(p).toString())
  assert.equal(claims.aud, 'https://web.push.apple.com')
  assert.equal(claims.sub, 'https://pocket.example.com')
  assert.ok(claims.exp > Date.now() / 1000)
  const pub = createPublicKey({ key: keys.jwk && { kty: 'EC', crv: 'P-256', x: keys.jwk.x, y: keys.jwk.y }, format: 'jwk' })
  assert.ok(createVerify('SHA256').update(`${h}.${p}`).verify({ key: pub, dsaEncoding: 'ieee-p1363' }, b(s)))
})

test('sendPush posts the encrypted body with push headers and reports gone subscriptions', async () => {
  const ua = createECDH('prime256v1'); ua.generateKeys()
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } }
  const seen = []
  const fakeFetch = async (url, init) => { seen.push({ url, init }); return new Response(null, { status: seen.length === 1 ? 201 : 410 }) }
  const keys = generateVapidKeys()
  assert.deepEqual(await sendPush(subscription, { hi: 1 }, { keys, subject: 'https://x.example', urgency: 'high', fetch: fakeFetch }), { ok: true, gone: false, status: 201 })
  assert.equal(seen[0].init.headers['content-encoding'], 'aes128gcm')
  assert.equal(seen[0].init.headers.urgency, 'high')
  assert.match(seen[0].init.headers.authorization, /^vapid t=/)
  assert.equal(decrypt(Buffer.from(seen[0].init.body), ua, Buffer.alloc(16, 1)), '{"hi":1}')
  assert.deepEqual(await sendPush(subscription, { hi: 2 }, { keys, subject: 'https://x.example', fetch: fakeFetch }), { ok: false, gone: true, status: 410 })
})
