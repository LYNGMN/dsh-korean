import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

/** Load client.js the way the Web client does and return its module object. */
async function loadClient() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  let loaded
  const window = { __ModuleLoader__: { load: (m) => { loaded = m } } }
  vm.runInNewContext(source, { window })
  const React = { createElement: () => null, useState: (v) => [typeof v === 'function' ? v() : v, () => {}], useEffect: () => {} }
  return { id: loaded.id, module: loaded.factory((name) => ({ react: React })[name]) }
}

const DEFAULT = ['exa', 'brave', 'you', 'parallel', 'keenable', 'tavily', 'tinyfish', 'jina', 'firecrawl', 'naver', 'kakao', 'bing']

function fakeCtx({ configured = {}, withCommandUi = true, autoOrder } = {}) {
  const calls = { decorations: [], drafts: [], focus: 0, slots: [] }
  let dict
  const input = { setDraft: (text) => calls.drafts.push(text), focus: () => { calls.focus += 1 } }
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: (_ns, d) => { dict = d.ko }, bind: () => (key) => dict[key] ?? key },
    slots: { inject: (_n, fn) => fn(), register: (options) => calls.slots.push(options) },
    remote: {
      credentials: {
        describe: async (refs) => ({ ok: true, value: Object.fromEntries(refs.map((r) => [r, { configured: configured[r] === true, writable: true }])) })
      },
      settings: {
        describe: async () => ({
          ok: true,
          value: {
            writable: true,
            namespaces: [
              { ns: 'web', value: { searchProvider: 'exa-brave-auto' }, revision: 3 },
              ...(autoOrder === undefined ? [] : [{ ns: 'search', value: { providers: DEFAULT, autoOrder }, revision: 7 }])
            ]
          }
        })
      }
    },
    get: (name) => {
      if (name === 'sessions') return { scope: (id) => (id === 's1' ? { session: id } : undefined) }
      if (name === 'conversation') return { input: { for: () => input } }
      return undefined
    },
    inject: (deps, fn) => {
      if (!withCommandUi) return
      assert.equal(JSON.stringify(deps), '["commandUi"]')
      fn({ effect: (f) => f(), commandUi: { decorate: (d) => { calls.decorations.push(d); return () => {} } } })
    }
  }
  return { ctx, calls }
}

test('the client registers the key card for this bundle', async () => {
  const { id, module } = await loadClient()
  assert.equal(id, '@lyngmn/dsh-search')
  const { ctx, calls } = fakeCtx()
  module.apply(ctx)
  assert.equal(calls.slots[0].name, 'plugins.bundle.config')
  assert.equal(calls.slots[0].key, '@lyngmn/dsh-search')
})

test('a bare /search opens an engine picker: auto first, then the engines in the order set on the plugin page', async () => {
  const { module } = await loadClient()
  const { ctx, calls } = fakeCtx({ configured: { YDC_API_KEY: true }, autoOrder: ['bing', 'kakao', 'you', 'kakao', 'google'] })
  module.apply(ctx)
  const [decoration] = calls.decorations
  assert.equal(decoration.name, 'search')
  assert.equal(decoration.ui.kind, 'popupSelect')
  assert.deepEqual({ ...decoration.ui.searchLabels() }, { placeholder: '엔진 찾기', empty: '엔진이 없어요', noResults: '맞는 엔진이 없어요' })

  const options = [...await decoration.ui.options({ sessionId: 's1' }, new AbortController().signal)]
  // Saved before Exa and Brave existed (no autoKnown), so they join at their default place.
  assert.deepEqual(options.map((o) => o.id), ['auto', 'korea', 'bing', 'kakao', 'exa', 'brave', 'you', 'parallel', 'keenable', 'tavily', 'tinyfish', 'jina', 'firecrawl', 'naver'])
  assert.equal(options[0].active, true)
  assert.deepEqual(options.map((o) => o.group.name), ['auto', 'auto', 'used', 'used', 'used', 'used', 'used', 'unused', 'unused', 'unused', 'unused', 'unused', 'unused', 'unused'])
  assert.equal(options[2].group.label, '자동에 쓰는 순서')
  // No Naver or Kakao key is set here, so the Korean engine says so.
  assert.equal(options[1].detail, '🇰🇷 네이버나 카카오 키가 필요해요')
  // Flag, country and a short quota; the owner note stays on the plugin page.
  const detail = Object.fromEntries(options.map((o) => [o.id, o.detail]))
  assert.equal(detail.naver, '🇰🇷 한국 · 키 필요 · 하루 2.5만 회')
  assert.equal(detail.you, '🇺🇸 미국 · 키 설정됨 · 60일 약 2만 회')
  assert.equal(detail.tavily, '🇮🇱 이스라엘 · 키 없이 소량 · 키 넣으면 월 1천 회')
  assert.equal(detail.keenable, '🇺🇸 미국 · 키 없이 시간당 1천 회 · 키 넣으면 월 10만 회')
  assert.equal(detail.jina, '🇩🇪 독일 · 키 필요 · 가입 때 약 1천 회')
  assert.equal(detail.bing, '🇺🇸 미국 · 키 없음 · 정해진 한도 없음')
})

test('without the order setting the picker lists every engine in the default order, Korean engines not first', async () => {
  const { module } = await loadClient()
  const { ctx, calls } = fakeCtx()
  module.apply(ctx)
  const options = [...await calls.decorations[0].ui.options({ sessionId: 's1' }, new AbortController().signal)]
  assert.equal(JSON.stringify(options.map((o) => o.id)), JSON.stringify(['auto', 'korea', ...DEFAULT]))
  assert.deepEqual([...new Set(options.slice(2).map((o) => o.group.name))], ['engines'])
})

test('picking an engine puts "/search <engine> " in that session\'s composer', async () => {
  const { module } = await loadClient()
  const { ctx, calls } = fakeCtx()
  module.apply(ctx)
  const [decoration] = calls.decorations
  decoration.ui.onSelect({ id: 'naver', label: 'Naver' }, { sessionId: 's1' })
  assert.deepEqual(calls.drafts, ['/search naver '])
  assert.equal(calls.focus, 1)
  // An unknown session leaves every composer alone.
  decoration.ui.onSelect({ id: 'auto', label: '자동' }, { sessionId: 'gone' })
  assert.deepEqual(calls.drafts, ['/search naver '])
})

test('without the command UI service the card still loads and no picker is hung', async () => {
  const { module } = await loadClient()
  const { ctx, calls } = fakeCtx({ withCommandUi: false })
  module.apply(ctx)
  assert.equal(calls.decorations.length, 0)
  assert.equal(calls.slots.length, 1)
})

test('picker options still show both quotas when the key state or the settings cannot be read', async () => {
  const { module } = await loadClient()
  const { ctx, calls } = fakeCtx()
  ctx.remote.credentials.describe = async () => { throw new Error('offline') }
  ctx.remote.settings.describe = async () => { throw new Error('offline') }
  module.apply(ctx)
  const options = await calls.decorations[0].ui.options({ sessionId: 's1' }, new AbortController().signal)
  assert.equal(options.find((o) => o.id === 'kakao').detail, '🇰🇷 한국 · 키 필요 · 하루 3만 회')
  assert.equal(options.find((o) => o.id === 'firecrawl').detail, '🇺🇸 미국 · 키 없이 소량 · 키 넣으면 월 500회')
})

test('the card shows the same result limits the server uses', async () => {
  const { RESULT_LIMITS } = await import('../search-core.js')
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  for (const [id, limit] of Object.entries(RESULT_LIMITS)) {
    const line = source.split('\n').find((l) => l.includes(`{ id: '${id}',`))
    const shown = line.match(/results: (\{[^}]*\})/)[1].replace(/(\w+):/g, '"$1":')
    assert.deepEqual(JSON.parse(shown), { ...limit }, id)
  }
})

test('every engine has both quotas, a pricing link and, except Bing, a key link in Korean and English', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  for (const id of DEFAULT) {
    assert.match(source, new RegExp(`'free\\.${id}': '`), `free.${id}`)
    if (id === 'bing') continue
    assert.match(source, new RegExp(`'keyed\\.${id}': '[^']+'[\\s\\S]*'keyed\\.${id}': '`), `keyed.${id} in both dictionaries`)
    assert.match(source, new RegExp(`id: '${id}'[^\\n]*keyLink: 'https://[^']+', priceLink: 'https://`), `links for ${id}`)
  }
})

test('the card lists engines one kind per line and explains the per-search count, in both dictionaries', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /engineList: '/)
  for (const key of ['engineKeyless', 'engineKeyed', 'engineCombined', 'commandCount']) {
    assert.equal(source.match(new RegExp(`\\b${key}: '`, 'g'))?.length, 2, key)
  }
})
