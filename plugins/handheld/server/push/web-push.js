// Web Push without dependencies: RFC 8291 message encryption (aes128gcm,
// RFC 8188) and RFC 8292 VAPID. Works for Apple, Google and Mozilla push services.
import { createECDH, createHmac, createCipheriv, randomBytes, createPrivateKey, createSign } from 'node:crypto'

const RECORD_SIZE = 4096

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest()
}

/**
 * Encrypt one push message for a subscription.
 * @param {object} input
 * @param {Buffer} input.plaintext
 * @param {Buffer} input.uaPublic - subscription p256dh (65-byte uncompressed point)
 * @param {Buffer} input.authSecret - subscription auth (16 bytes)
 * @param {Buffer} [input.salt] - fixed only in tests
 * @param {Buffer} [input.senderPrivate] - fixed only in tests
 * @returns {Buffer} request body
 */
export function encryptPayload({ plaintext, uaPublic, authSecret, salt = randomBytes(16), senderPrivate }) {
  if (plaintext.length > RECORD_SIZE - 17 - 86) throw new Error('push payload too large')
  const sender = createECDH('prime256v1')
  if (senderPrivate) sender.setPrivateKey(senderPrivate)
  else sender.generateKeys()
  const asPublic = sender.getPublicKey()
  const ecdhSecret = sender.computeSecret(uaPublic)
  const prkKey = hmac(authSecret, ecdhSecret)
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12)
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const sealed = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header[20] = asPublic.length
  return Buffer.concat([header, asPublic, sealed])
}

/** New VAPID key pair; `publicKey` is the base64url application server key for PushManager. */
export function generateVapidKeys() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const pub = ecdh.getPublicKey()
  return {
    publicKey: pub.toString('base64url'),
    jwk: {
      kty: 'EC', crv: 'P-256',
      x: pub.subarray(1, 33).toString('base64url'),
      y: pub.subarray(33, 65).toString('base64url'),
      d: ecdh.getPrivateKey().toString('base64url'),
    },
  }
}

/** `Authorization` header value for one push endpoint (RFC 8292). */
export function vapidAuthorization({ endpoint, keys, subject, ttlSeconds = 12 * 3600 }) {
  const head = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url')
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + ttlSeconds, sub: subject }
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const key = createPrivateKey({ key: keys.jwk, format: 'jwk' })
  const signature = createSign('SHA256').update(`${head}.${body}`).sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `vapid t=${head}.${body}.${signature}, k=${keys.publicKey}`
}

/**
 * Deliver one JSON message.
 * @returns {Promise<{ok: boolean, gone: boolean, status: number}>} `gone` means drop the subscription.
 */
export async function sendPush(subscription, message, { keys, subject, urgency = 'normal', ttlSeconds = 3600, topic, fetch: fetchImpl = fetch }) {
  const body = encryptPayload({
    plaintext: Buffer.from(JSON.stringify(message)),
    uaPublic: Buffer.from(subscription.keys.p256dh, 'base64url'),
    authSecret: Buffer.from(subscription.keys.auth, 'base64url'),
  })
  const headers = {
    'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream',
    ttl: String(ttlSeconds),
    urgency,
    authorization: vapidAuthorization({ endpoint: subscription.endpoint, keys, subject }),
  }
  if (topic) headers.topic = topic
  const res = await fetchImpl(subscription.endpoint, { method: 'POST', headers, body })
  return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status }
}
