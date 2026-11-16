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

function fakeCtx({ configured = {}, withCommandUi = true } = {}) {
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
  assert.equal(id, '@lyngmn/dsh-search-free')
  const { ctx, calls } = fakeCtx()
  module.apply(ctx)
  assert.equal(calls.slots[0].name, 'plugins.bundle.config')
  assert.equal(calls.slots[0].key, '@lyngmn/dsh-search-free')
})

test('a bare /search opens an engine picker: auto first, Korean engines, then global ones with country and key state', async () => {
  const { module } = await loadClient()
  const { ctx, calls } = fakeCtx({ configured: { YDC_API_KEY: true } })
  module.apply(ctx)
  const [decoration] = calls.decorations
  assert.equal(decoration.name, 'search')
  assert.equal(decoration.ui.kind, 'popupSelect')
  assert.deepEqual({ ...decoration.ui.searchLabels() }, { placeholder: '엔진 찾기', empty: '엔진이 없어요', noResults: '맞는 엔진이 없어요' })

  const options = [...await decoration.ui.options({ sessionId: 's1' }, new AbortController().signal)]
  assert.deepEqual(options.map((o) => o.id), ['auto', 'naver', 'kakao', 'you', 'parallel', 'keenable', 'tavily', 'tinyfish', 'jina', 'firecrawl', 'bing'])
  assert.equal(options[0].active, true)
  assert.deepEqual(options.map((o) => o.group.name), ['auto', 'kr', 'kr', 'global', 'global', 'global', 'global', 'global', 'global', 'global', 'global'])
  const detail = Object.fromEntries(options.map((o) => [o.id, o.detail]))
  assert.equal(detail.naver, '한국 · 키 필요')
  assert.equal(detail.you, '미국 · 키 설정됨')
  assert.equal(detail.tavily, '이스라엘(네덜란드 Nebius가 인수) · 키 없이 쓰는 중')
  assert.equal(detail.jina, '독일(Elastic이 인수) · 키 필요')
  assert.equal(detail.bing, '미국 · 키를 쓰지 않아요')
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

test('picker options fall back to the sign-up note when key state cannot be read', async () => {
  const { module } = await loadClient()
  const { ctx, calls } = fakeCtx()
  ctx.remote.credentials.describe = async () => { throw new Error('offline') }
  module.apply(ctx)
  const options = await calls.decorations[0].ui.options({ sessionId: 's1' }, new AbortController().signal)
  assert.equal(options.find((o) => o.id === 'kakao').detail, '한국 · 가입하고 키를 넣어야 써요')
  assert.equal(options.find((o) => o.id === 'firecrawl').detail, '미국 · 가입하고 키를 넣으면 한도가 늘어요')
})
