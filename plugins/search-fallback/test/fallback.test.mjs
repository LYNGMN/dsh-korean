import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, FallbackSearchProvider, normalizeSettings, registryLookup, shouldMoveOn } from '../index.js'

const ok = (url) => ({ available: () => true, calls: 0, async search() { this.calls += 1; return { sources: [{ url }], truncated: false } } })
const empty = () => ({ available: () => true, calls: 0, async search() { this.calls += 1; return { sources: [], truncated: false } } })
const failing = (message, code = 'WEB_PROVIDER_ERROR') => ({
  available: () => true,
  calls: 0,
  async search() { this.calls += 1; throw Object.assign(new Error(message), { code }) }
})

function provider(steps, registry, { fallbackOnEmpty = true } = {}) {
  const warnings = []
  const p = new FallbackSearchProvider(
    { id: 'a-b', title: 'A → B', providers: steps },
    { lookup: (id) => registry[id], fallbackOnEmpty, log: { warn: (m) => warnings.push(m) } }
  )
  return { p, warnings }
}

test('normalizeSettings uses the four default orders and drops invalid ones', () => {
  const defaults = normalizeSettings({})
  assert.deepEqual(defaults.orders.map((o) => [o.id, o.providers]), [
    ['brave-exa', ['brave', 'exa']],
    ['exa-brave', ['exa', 'brave']],
    ['exa-brave-free', ['exa', 'brave', 'you', 'parallel', 'keenable', 'tavily', 'bing']],
    ['free-only', ['you', 'parallel', 'keenable', 'tavily', 'bing']]
  ])
  assert.equal(defaults.fallbackOnEmpty, true)
  const s = normalizeSettings({
    fallbackOnEmpty: false,
    orders: [
      { id: 'x', providers: ['a', 'b'] },
      { id: 'x', providers: ['c', 'd'] },
      { id: 'one', providers: ['a'] },
      { id: 'dup', providers: ['a', 'a'] },
      { providers: ['a', 'b'] },
      { id: 'loop', providers: ['x', 'b'] }
    ]
  })
  assert.equal(s.fallbackOnEmpty, false)
  assert.deepEqual(s.orders.map((o) => [o.id, o.title]), [['x', 'a → b']])
  assert.equal(s.problems.length, 5)
  assert.ok(s.problems.some((p) => p.includes('uses fallback order "x"')))
})

test('shouldMoveOn: errors and empty results move on, cancellation never does', () => {
  assert.equal(shouldMoveOn({ error: new Error('x') }), true)
  assert.equal(shouldMoveOn({ error: { code: 'WEB_ABORTED' } }), false)
  assert.equal(shouldMoveOn({ error: new Error('x'), signal: { aborted: true } }), false)
  assert.equal(shouldMoveOn({ result: { sources: [] }, fallbackOnEmpty: true }), true)
  assert.equal(shouldMoveOn({ result: { sources: [] }, fallbackOnEmpty: false }), false)
  assert.equal(shouldMoveOn({ result: { sources: [{ url: 'u' }] }, fallbackOnEmpty: true }), false)
})

test('the first provider answers and the second is never called', async () => {
  const a = ok('https://a.example'); const b = ok('https://b.example')
  const { p } = provider(['a', 'b'], { a, b })
  assert.equal((await p.search({ query: 'q' })).sources[0].url, 'https://a.example')
  assert.equal(b.calls, 0)
})

test('a failure moves on with the same request and logs why', async () => {
  const a = failing('quota exceeded (HTTP 429)')
  const seen = []
  const b = { available: () => true, async search(request) { seen.push(request); return { sources: [{ url: 'https://b.example' }], truncated: false } } }
  const { p, warnings } = provider(['a', 'b'], { a, b })
  assert.equal((await p.search({ query: 'q', maxResults: 5 })).sources[0].url, 'https://b.example')
  assert.deepEqual(seen, [{ query: 'q', maxResults: 5 }])
  assert.match(warnings[0], /^a-b: a failed: quota exceeded \(HTTP 429\); trying b$/)
})

test('an empty answer moves on unless fallbackOnEmpty is off', async () => {
  const on = provider(['a', 'b'], { a: empty(), b: ok('https://b.example') })
  assert.equal((await on.p.search({ query: 'q' })).sources[0].url, 'https://b.example')
  const b = ok('https://b.example')
  const off = provider(['a', 'b'], { a: empty(), b }, { fallbackOnEmpty: false })
  assert.deepEqual((await off.p.search({ query: 'q' })).sources, [])
  assert.equal(b.calls, 0)
})

test('cancellation stops at once', async () => {
  const b = ok('https://b.example')
  const { p } = provider(['a', 'b'], { a: failing('aborted', 'WEB_ABORTED'), b })
  await assert.rejects(p.search({ query: 'q' }), { code: 'WEB_ABORTED' })
  assert.equal(b.calls, 0)
})

test('a missing or unavailable provider is skipped like a failed one', async () => {
  const { p } = provider(['missing', 'b'], { b: ok('https://b.example') })
  assert.equal((await p.search({ query: 'q' })).sources[0].url, 'https://b.example')
  const off = { available: () => false, async search() { assert.fail('must not search') } }
  const second = provider(['off', 'b'], { off, b: ok('https://b.example') })
  assert.equal((await second.p.search({ query: 'q' })).sources[0].url, 'https://b.example')
})

test('when every provider fails the error names each one', async () => {
  const { p } = provider(['a', 'b'], { a: failing('HTTP 401'), b: failing('HTTP 429') })
  await assert.rejects(p.search({ query: 'q' }), (error) => {
    assert.equal(error.code, 'WEB_PROVIDER_ERROR')
    assert.match(error.message, /^A → B: every provider failed\. a failed: HTTP 401; b failed: HTTP 429$/)
    return true
  })
})

test('an empty answer wins over a later failure', async () => {
  const { p } = provider(['a', 'b'], { a: empty(), b: failing('HTTP 500') })
  assert.deepEqual((await p.search({ query: 'q' })).sources, [])
})

test('available() follows the registered providers', () => {
  assert.equal(provider(['a', 'b'], {}).p.available(), false)
  assert.equal(provider(['a', 'b'], { b: ok('u') }).p.available(), true)
  assert.equal(provider(['a', 'b'], { a: { available: () => { throw new Error('x') } } }).p.available(), false)
})

test('apply registers one provider per order and reads the registry at search time', async () => {
  const searchProviders = new Map()
  const registered = []
  const web = { searchProviders, registerSearchProvider: (p) => { registered.push(p); searchProviders.set(p.id, p) } }
  apply({ web }, {})
  assert.deepEqual(registered.map((p) => [p.id, p.title]), [
    ['brave-exa', 'Brave → Exa'],
    ['exa-brave', 'Exa → Brave'],
    ['exa-brave-free', 'Exa → Brave → 무료 검색'],
    ['free-only', '무료 검색만']
  ])
  assert.equal(registered[0].description.ko.startsWith('먼저 Brave로'), true)
  // Providers registered after this bundle are still found.
  searchProviders.set('brave', failing('HTTP 429'))
  searchProviders.set('exa', ok('https://exa.example'))
  assert.equal((await registered[0].search({ query: 'q' })).sources[0].url, 'https://exa.example')
  assert.equal(registryLookup(undefined)('brave'), undefined)
})

/** Fake Host with a stored DSH language (`undefined` = follow the system); `set` changes it. */
function localeHost(initial) {
  let preference = initial
  const searchProviders = new Map()
  const registered = []
  const warnings = []
  const ctx = {
    get: (name) => (name === 'settings'
      ? { describe: () => [{ ns: 'locale', value: preference === undefined ? {} : { preference } }] }
      : undefined),
    logger: () => ({ warn: (m) => warnings.push(m) }),
    web: { searchProviders, registerSearchProvider: (p) => { registered.push(p); searchProviders.set(p.id, p) } }
  }
  return { ctx, registered, searchProviders, warnings, set: (next) => { preference = next } }
}

async function withSystemLocale(id, run) {
  const original = Intl.DateTimeFormat
  const lang = process.env.LANG
  Intl.DateTimeFormat = function () { return { resolvedOptions: () => ({ locale: id }) } }
  process.env.LANG = `${id.replace('-', '_')}.UTF-8`
  try {
    return await run()
  } finally {
    Intl.DateTimeFormat = original
    if (lang === undefined) delete process.env.LANG
    else process.env.LANG = lang
  }
}

async function failAll(host) {
  host.searchProviders.set('brave', failing('HTTP 429'))
  host.searchProviders.set('exa', failing('HTTP 401'))
  return host.registered[0].search({ query: 'q' }).then(() => undefined, (error) => error)
}

test('logs and the final error follow a Korean DSH language', async () => {
  const host = localeHost('ko')
  apply(host.ctx, { orders: [{ id: 'solo', providers: ['brave'] }, { id: 'brave-exa', providers: ['brave', 'exa'] }] })
  assert.equal(host.warnings[0], 'search-fallback: 순서 "solo"에는 공급자가 두 개 이상 있어야 해요')
  const error = await failAll(host)
  assert.equal(error.message, 'brave → exa: 모든 공급자가 실패했어요. brave 실패: HTTP 429; exa 실패: HTTP 401')
  assert.equal(error.code, 'WEB_PROVIDER_ERROR')
  assert.equal(host.warnings[1], 'brave-exa: brave 실패: HTTP 429 → exa로 넘어가요')
})

test('logs and the final error follow an English DSH language', async () => {
  const host = localeHost('en')
  apply(host.ctx, { orders: [{ id: 'solo', providers: ['brave'] }, { id: 'brave-exa', providers: ['brave', 'exa'] }] })
  assert.equal(host.warnings[0], 'search-fallback: order "solo" needs at least two providers')
  const error = await failAll(host)
  assert.equal(error.message, 'brave → exa: every provider failed. brave failed: HTTP 429; exa failed: HTTP 401')
  assert.equal(host.warnings[1], 'brave-exa: brave failed: HTTP 429; trying exa')
})

test('an unset DSH language follows the system language', async () => {
  for (const [system, expected] of [['ko-KR', /모든 공급자가 실패했어요/], ['en-US', /every provider failed/]]) {
    await withSystemLocale(system, async () => {
      const host = localeHost(undefined)
      apply(host.ctx, {})
      assert.match((await failAll(host)).message, expected, system)
    })
  }
})

test('a language change applies to the next search without reloading', async () => {
  const host = localeHost('en')
  apply(host.ctx, {})
  assert.match((await failAll(host)).message, /every provider failed/)
  host.set('ko')
  assert.match((await failAll(host)).message, /모든 공급자가 실패했어요/)
  // The provider picker text is already { en, ko }.
  assert.equal(typeof host.registered[0].description.en, 'string')
})

test('the patch file declares the same orders as the built-in defaults', async () => {
  const { readFile } = await import('node:fs/promises')
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const ids = [...patch.matchAll(/^\s+- id: (\S+)$/gm)].map((m) => m[1]).filter((id) => id !== 'search-fallback')
  assert.deepEqual(ids, normalizeSettings({}).orders.map((o) => o.id))
})

test('Exa → Brave → Free search: paid steps fail, a missing free step is skipped and the next free one answers', async () => {
  const searchProviders = new Map()
  const registered = []
  const web = { searchProviders, registerSearchProvider: (p) => { registered.push(p); searchProviders.set(p.id, p) } }
  apply({ web }, {})
  const order = registered.find((p) => p.id === 'exa-brave-free')
  searchProviders.set('exa', failing('credits exhausted'))
  searchProviders.set('brave', empty())
  // "you" is not registered (Free Search not installed or the provider turned off).
  const parallel = ok('https://parallel.example')
  searchProviders.set('parallel', parallel)
  searchProviders.set('bing', ok('https://bing.example'))
  assert.equal((await order.search({ query: 'q' })).sources[0].url, 'https://parallel.example')
  assert.equal(parallel.calls, 1)
  assert.equal(searchProviders.get('bing').calls, 0)
})
