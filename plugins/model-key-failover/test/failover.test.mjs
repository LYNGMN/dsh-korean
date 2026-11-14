import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'
import { activeRefFor, classifyFailure, discoverProviders, nextUsableSlot, normalizeOptions, slotRefs } from '../failover-core.js'

const SETTINGS = [{
  ns: 'llm-pi-ai',
  value: {
    providers: {
      acme: { displayName: 'Acme', apiKeyEnv: 'ACME_API_KEY' },
      newcomer: { displayName: 'Newcomer', apiKeyEnv: 'NEWCOMER_API_KEY' },
      account: { displayName: 'No key ref' }
    }
  }
}]

/** A fake Host: credentials, settings, commands, and a model service whose upstream accepts only `good` keys. */
function host(options) {
  const { store, good = [], limited = [], settings = SETTINGS, directory = [] } = options
  // The stored DSH language; `undefined` follows the system. English by default.
  let preference = 'locale' in options ? options.locale : 'en'
  const settingsListeners = []
  const listeners = []
  const commands = new Map()
  const calls = []
  let clock = 1_000_000
  // The adapter resolves apiKeyEnv through the credential seam, exactly like
  // the pi-ai adapter does; this is where the plugin's redirection is seen.
  const stored = {
    resolve: async (ref) => (store.has(ref) ? { value: store.get(ref) } : undefined),
    set: async (ref, value) => { store.set(ref, value) },
    unset: async (ref) => { store.delete(ref) }
  }
  // `ctx.get` hands out Cordis's tracing proxy: a write through the proxy lands
  // on a transient shadow, not on the service. Reproduce that here so a plugin
  // that patches the proxy fails this suite.
  const credentials = new Proxy(stored, {
    get(target, prop) {
      if (prop === Symbol.for('cordis.original')) return target
      const value = Reflect.get(target, prop)
      return typeof value === 'function' ? value.bind(target) : value
    },
    set() { return true }
  })
  const keyRefFor = (provider) => provider === 'deepseek-official'
    ? 'DEEPSEEK_API_KEY'
    : `${provider.toUpperCase()}_API_KEY`
  const upstream = async function* (options) {
    const key = (await credentials.resolve(keyRefFor(options.provider)))?.value
    calls.push(key)
    if (limited.includes(key)) { yield { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: '429' } } }; return }
    if (!good.includes(key)) { yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: '401 invalid api key' } } }; return }
    yield { type: 'start' }
    yield { type: 'text-delta', text: `ok:${key}` }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const ctx = {
    get(name) {
      if (name === 'credentials') return credentials
      if (name === 'settings') return { describe: () => [...settings, { ns: 'locale', value: preference === undefined ? {} : { preference } }] }
      return undefined
    },
    on(event, handler) {
      if (event === 'llm/stream') listeners.push(handler)
      if (event === 'settings/document-updated') settingsListeners.push(handler)
      return () => {}
    },
    effect(run) { run() },
    inject(_names, run) {
      run({
        commands: {
          register(command) {
            commands.set(command.name, command)
            return () => { if (commands.get(command.name) === command) commands.delete(command.name) }
          }
        }
      })
    },
    llm: {
      stream: (options) => (listeners[0] ? listeners[0](options, () => upstream(options)) : upstream(options)),
      listConfigurableProviders: () => directory
    }
  }
  const realNow = Date.now
  Date.now = () => clock
  apply(ctx, { rateLimitCooldownMs: 1000, rejectedCooldownMs: 100000 })
  return {
    ctx, calls, commands, store,
    advance: (ms) => { clock += ms },
    restore: () => { Date.now = realNow },
    run: async (provider) => {
      const chunks = []
      for await (const chunk of ctx.llm.stream({ provider })) chunks.push(chunk)
      return chunks
    },
    command: (name, rawInput) => commands.get(name).handler({ rawInput }),
    setLocale: async (next) => {
      preference = next
      for (const listener of settingsListeners) listener('locale', 1)
      await Promise.resolve()
    }
  }
}

const textOf = (chunks) => chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text).join('')

test('providers are found from settings, including one added later', () => {
  const found = discoverProviders(SETTINGS, normalizeOptions())
  assert.deepEqual([...found.keys()], ['acme', 'newcomer'])
  assert.deepEqual(found.get('newcomer').keySlots, slotRefs('NEWCOMER_API_KEY', 4))
  assert.equal(found.get('newcomer').keySlots[1], 'NEWCOMER_API_KEY_2')
  assert.equal(found.get('newcomer').activeRef, 'NEWCOMER_ACTIVE_KEY')
  assert.equal(activeRefFor('ACME_API_KEY'), 'ACME_ACTIVE_KEY')
  assert.equal(activeRefFor('ACME_KEY'), 'ACME_KEY_ACTIVE')
  assert.equal(discoverProviders(SETTINGS, normalizeOptions({ exclude: ['acme'] })).has('acme'), false)
})

test('the official DeepSeek route is discovered from its adapter directory', () => {
  const directory = [{ provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] }]
  const found = discoverProviders([{ ns: 'llm-deepseek', value: {} }], normalizeOptions(), directory)
  assert.equal(found.get('deepseek-official').keyRef, 'DEEPSEEK_API_KEY')
  assert.equal(found.get('deepseek-official').activeRef, 'DEEPSEEK_ACTIVE_KEY')
  assert.equal(found.get('deepseek-official').displayName, 'DeepSeek')
})

test('next usable slot goes round once and skips resting keys', () => {
  assert.equal(nextUsableSlot(['a', 'b', 'c'], 0), 1)
  assert.equal(nextUsableSlot(['a', 'b', 'c'], 2), 0)
  assert.equal(nextUsableSlot(['a', undefined, 'c'], 0), 2)
  assert.equal(nextUsableSlot(['a', 'b', 'c'], 0, (index) => index === 1), 2)
  assert.equal(nextUsableSlot(['a', undefined], 0), -1)
  assert.equal(classifyFailure({ kind: 'error', failure: { code: 'RATE_LIMIT' } }), 'rate-limit')
})

test('a provider without spare keys is left alone', async () => {
  const store = new Map([['ACME_API_KEY', 'main']])
  const h = host({ store, good: [] })
  try {
    const chunks = await h.run('acme')
    assert.equal(chunks.at(-1).reason.kind, 'error')
    assert.deepEqual(h.calls, ['main'])
    assert.deepEqual([...store.keys()], ['ACME_API_KEY'])
  } finally { h.restore() }
})

test('a rejected key is replaced and the retry really uses the next key', async () => {
  const store = new Map([['ACME_API_KEY', 'main'], ['ACME_API_KEY_2', 'spare2'], ['ACME_API_KEY_3', 'spare3']])
  const h = host({ store, good: ['spare3'] })
  try {
    const chunks = await h.run('acme')
    assert.equal(textOf(chunks), 'ok:spare3')
    assert.deepEqual(h.calls, ['main', 'spare2', 'spare3'])
    assert.equal(store.get('ACME_API_KEY'), 'main', 'the main key field is never rewritten')
    assert.equal(store.get('ACME_API_KEY_1'), 'main', 'the main key stays recoverable in slot 1')
    assert.equal(store.get('ACME_ACTIVE_KEY'), 'spare3', 'the key in use lives in its own reference')
    // The next request starts on the working key, with no wasted attempt.
    h.calls.length = 0
    await h.run('acme')
    assert.deepEqual(h.calls, ['spare3'])
  } finally { h.restore() }
})

test('when every key fails the original failure is returned once per key', async () => {
  const store = new Map([['ACME_API_KEY', 'main'], ['ACME_API_KEY_2', 'spare2']])
  const h = host({ store, good: [] })
  try {
    const chunks = await h.run('acme')
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].reason.failure.code, 'AUTH')
    assert.deepEqual(h.calls, ['main', 'spare2'])
    assert.equal(store.get('ACME_API_KEY'), 'main')
    assert.equal(store.get('ACME_ACTIVE_KEY'), 'spare2')
  } finally { h.restore() }
})

test('a rate-limited key only rests and is used again later', async () => {
  const store = new Map([['ACME_API_KEY', 'main'], ['ACME_API_KEY_2', 'spare2']])
  const limited = ['main']
  const h = host({ store, good: ['main', 'spare2'], limited })
  try {
    assert.equal(textOf(await h.run('acme')), 'ok:spare2')
    limited.length = 0
    limited.push('spare2')
    // main is still resting: no key is free, so the failure is reported.
    assert.equal((await h.run('acme')).at(-1).reason.failure.code, 'RATE_LIMIT')
    h.advance(1500)
    assert.equal(textOf(await h.run('acme')), 'ok:main')
    assert.equal(store.get('ACME_API_KEY'), 'main')
  } finally { h.restore() }
})

test('a newly added provider gets spare keys with no plugin change', async () => {
  const store = new Map([['NEWCOMER_API_KEY', 'n1'], ['NEWCOMER_API_KEY_2', 'n2']])
  const h = host({ store, good: ['n2'] })
  try {
    assert.equal(textOf(await h.run('newcomer')), 'ok:n2')
    assert.equal(store.get('NEWCOMER_API_KEY'), 'n1')
    assert.equal(store.get('NEWCOMER_ACTIVE_KEY'), 'n2')
  } finally { h.restore() }
})

test('the official DeepSeek route gets spare keys without moving its main key', async () => {
  const settings = [{ ns: 'llm-deepseek', value: { apiKeyEnv: 'DEEPSEEK_API_KEY' } }]
  const directory = [{ provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] }]
  const store = new Map([['DEEPSEEK_API_KEY', 'main'], ['DEEPSEEK_API_KEY_2', 'spare']])
  const h = host({ store, good: ['spare'], settings, directory })
  try {
    assert.equal(textOf(await h.run('deepseek-official')), 'ok:spare')
    assert.deepEqual(h.calls, ['main', 'spare'])
    assert.equal(store.get('DEEPSEEK_API_KEY'), 'main', 'the official main key field is never rewritten')
    assert.equal(store.get('DEEPSEEK_API_KEY_1'), 'main')
    assert.equal(store.get('DEEPSEEK_ACTIVE_KEY'), 'spare')
  } finally { h.restore() }
})

test('the old *_ACTIVE_KEY layout keeps its active key without moving the main key', async () => {
  const store = new Map([['ACME_API_KEY', 'k1'], ['ACME_API_KEY_1', 'k1'], ['ACME_API_KEY_2', 'k2'], ['ACME_ACTIVE_KEY', 'k2']])
  const h = host({ store, good: ['k2'] })
  try {
    await h.run('acme')
    assert.deepEqual(h.calls, ['k2'])
    assert.equal(store.get('ACME_API_KEY'), 'k1')
    assert.equal(store.get('ACME_ACTIVE_KEY'), 'k2')
  } finally { h.restore() }
})

test('a state that wrote the active key into the main field is repaired', async () => {
  const store = new Map([
    ['ACME_API_KEY', 'spare'], ['ACME_API_KEY_1', 'main'], ['ACME_API_KEY_2', 'spare']
  ])
  const h = host({ store, good: ['spare'] })
  try {
    assert.equal(textOf(await h.run('acme')), 'ok:spare')
    assert.deepEqual(h.calls, ['spare'])
    assert.equal(store.get('ACME_API_KEY'), 'main', 'the typed main key is restored')
    assert.equal(store.get('ACME_API_KEY_1'), 'main')
    assert.equal(store.get('ACME_ACTIVE_KEY'), 'spare', 'the key already in use keeps working')
  } finally { h.restore() }
})

test('a new main key typed while a spare is active becomes the key in use', async () => {
  const store = new Map([
    ['ACME_API_KEY', 'new-main'], ['ACME_API_KEY_1', 'old-main'],
    ['ACME_API_KEY_2', 'spare'], ['ACME_ACTIVE_KEY', 'spare']
  ])
  const h = host({ store, good: ['new-main'] })
  try {
    assert.equal(textOf(await h.run('acme')), 'ok:new-main')
    assert.deepEqual(h.calls, ['new-main'])
    assert.equal(store.get('ACME_API_KEY'), 'new-main')
    assert.equal(store.get('ACME_API_KEY_1'), 'new-main')
    assert.equal(store.get('ACME_ACTIVE_KEY'), 'new-main')
  } finally { h.restore() }
})

test('status of one provider reports only that provider, and describe hides values', async () => {
  const store = new Map([
    ['ACME_API_KEY', 'a2'], ['ACME_API_KEY_1', 'a1'], ['ACME_API_KEY_2', 'a2'],
    ['NEWCOMER_API_KEY', 'n1'], ['NEWCOMER_API_KEY_2', 'n2']
  ])
  const h = host({ store })
  try {
    const one = await h.command('model-keys-status', 'newcomer')
    assert.equal(one.text.split('\n').length, 1)
    assert.match(one.text, /^Newcomer \(newcomer\) → 1:active 2:ready/)
    const described = JSON.parse((await h.command('model-keys-describe', 'acme')).text)
    assert.equal(described.keyRef, 'ACME_API_KEY')
    assert.equal(described.activeRef, 'ACME_ACTIVE_KEY')
    assert.equal(described.slots.find((slot) => slot.active).slot, 2)
    assert.equal(JSON.stringify(described).includes('a2'), false)
    assert.equal((await h.command('model-keys-next', 'nope')).kind, 'error')
    await h.command('model-keys-sync', 'acme')
    assert.equal(store.get('ACME_API_KEY'), 'a1', 'sync does not move the main key')
    assert.equal(store.get('ACME_ACTIVE_KEY'), 'a1')
  } finally { h.restore() }
})

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

const LOCALE_STORE = () => new Map([['ACME_API_KEY', 'a1'], ['ACME_API_KEY_1', 'a1'], ['ACME_API_KEY_2', 'a2']])

test('command descriptions and results follow a Korean DSH language', async () => {
  const h = host({ store: LOCALE_STORE(), locale: 'ko' })
  try {
    assert.equal(h.commands.get('model-keys-next').description, '공급자를 설정된 다음 키로 바꿔요')
    assert.equal(h.commands.get('model-keys-next').input.hint, '<공급자>')
    assert.match((await h.command('model-keys-status', 'acme')).text, /^Acme \(acme\) → 1:사용 중 2:대기/)
    assert.equal((await h.command('model-keys-next', 'nope')).text, '알 수 없는 공급자 "nope"예요. 다음 가운데 하나를 쓰세요: acme, newcomer.')
    assert.equal((await h.command('model-keys-set', '')).text, 'REF=값 줄을 하나 이상 보내 주세요.')
    const saved = await h.command('model-keys-set', 'ACME_API_KEY_3=secret-value')
    assert.equal(saved.text, '키 칸 1개를 저장했어요: ACME_API_KEY_3.')
    assert.equal(saved.text.includes('secret-value'), false)
  } finally { h.restore() }
})

test('command descriptions and results follow an English DSH language', async () => {
  const h = host({ store: LOCALE_STORE(), locale: 'en' })
  try {
    assert.equal(h.commands.get('model-keys-next').description, 'Move a provider to its next configured key')
    assert.equal(h.commands.get('model-keys-next').input.hint, '<provider>')
    assert.equal((await h.command('model-keys-set', 'oops')).text, 'A line is not REF=value. Nothing was written.')
    assert.equal((await h.command('model-keys-set', 'ACME_API_KEY_9=x')).text, 'Unknown key slot "ACME_API_KEY_9". Nothing was written.')
    for (const command of h.commands.values()) assert.doesNotMatch(command.description, /[가-힣]/u)
  } finally { h.restore() }
})

test('an unset DSH language follows the system language', async () => {
  for (const [system, description] of [['ko-KR', 'REF=값 줄로 모델 예비 키를 저장해요'], ['en-US', 'Store model spare keys from REF=value lines']]) {
    await withSystemLocale(system, async () => {
      const h = host({ store: LOCALE_STORE(), locale: undefined })
      try {
        assert.equal(h.commands.get('model-keys-set').description, description, system)
      } finally { h.restore() }
    })
  }
})

test('a language change registers the commands again; describe stays JSON', async () => {
  const h = host({ store: LOCALE_STORE(), locale: 'en' })
  try {
    assert.equal(h.commands.size, 5)
    await h.setLocale('ko')
    assert.equal(h.commands.size, 5)
    assert.equal(h.commands.get('model-keys-status').description, '모델 키 칸 가운데 설정된 칸과 지금 쓰는 칸을 보여 줘요')
    assert.match((await h.command('model-keys-status', 'acme')).text, /1:사용 중/)
    assert.equal(JSON.parse((await h.command('model-keys-describe', 'acme')).text).keyRef, 'ACME_API_KEY')
    await h.setLocale('en')
    assert.match((await h.command('model-keys-status', 'acme')).text, /1:active/)
  } finally { h.restore() }
})
