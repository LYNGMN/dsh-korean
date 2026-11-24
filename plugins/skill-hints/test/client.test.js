// 화면 번들(client.js) 시험. 가짜 React로 컴포넌트 나무를 보고,
// 입력 안내는 npx 캐시의 Playwright가 있으면 실제 DOM에서 돌린다(없으면 건너뜀).
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT = readFileSync(join(here, '..', 'client.js'), 'utf8')

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useRef: (init) => ({ current: init ?? null }),
  useEffect: () => {},
}

function loadBundle({ body = { locale: 'ko', hints: {}, restart: false }, storage = {} } = {}) {
  let registered
  const required = []
  const fetches = []
  const sandbox = {
    window: { __ModuleLoader__: { load: (entry) => { registered = entry } }, addEventListener: () => {}, removeEventListener: () => {} },
    document: { createElement: () => ({ dataset: {}, remove: () => {} }), head: { appendChild: () => {} } },
    sessionStorage: { getItem: (k) => storage[k] ?? null, setItem: (k, v) => { storage[k] = String(v) } },
    fetch: async (url, init) => { fetches.push([url, init]); return { ok: true, json: async () => body } },
    MutationObserver: class { observe() {} disconnect() {} },
    JSON, Set, Promise, String,
  }
  vm.runInNewContext(CLIENT, sandbox)
  const mod = registered.factory((name) => {
    required.push(name)
    if (name === 'react') return React
    throw new Error(`unexpected require ${name}`)
  })
  return { id: registered.id, mod, required, fetches, storage }
}

function mount(mod) {
  const slots = {}
  mod.apply({
    effect: (fn) => { fn() },
    slots: { inject: (_name, fn) => fn(), register: (opts, Component) => { slots[opts.name] = { opts, Component } } },
  })
  return slots
}

const text = (node) => (node == null || node === false ? '' : typeof node === 'string' ? node
  : (node.children ?? []).map(text).join(''))
const find = (node, pred, out = []) => {
  if (node && typeof node === 'object') {
    if (pred(node)) out.push(node)
    for (const child of node.children ?? []) find(child, pred, out)
  }
  return out
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('the bundle registers under the package name and needs only react and slots', () => {
  const { id, mod, required } = loadBundle()
  assert.equal(id, '@lyngmn/dsh-skill-hints')
  assert.deepEqual([...mod.inject], ['slots'])
  assert.deepEqual(required, ['react'])
})

test('ghostHint fills in only after a lone /skill with a known hint', () => {
  const { ghostHint } = loadBundle().mod.apply.testing
  const hints = { 'gstack-cso': '[--diff 변경분만]', empty: '' }
  assert.equal(ghostHint('/gstack-cso', hints), ' [--diff 변경분만]')
  assert.equal(ghostHint('/gstack-cso ', hints), '[--diff 변경분만]')
  assert.equal(ghostHint('/gstack-cso --diff', hints), null, 'typing more removes it')
  assert.equal(ghostHint('/unknown', hints), null)
  assert.equal(ghostHint('/empty', hints), null)
  assert.equal(ghostHint('hello /gstack-cso', hints), null)
  assert.equal(ghostHint('', hints), null)
})

test('two slots: a hidden hook in the composer card and the restart notice in the dock', async () => {
  const { mod, fetches } = loadBundle()
  const slots = mount(mod)
  assert.deepEqual(Object.keys(slots).sort(), ['conversation.composer.dock', 'conversation.input.overlay'])
  assert.equal(slots['conversation.input.overlay'].opts.id, 'dsh-skill-hints')
  const hook = slots['conversation.input.overlay'].Component({})
  assert.equal(hook.type, 'span')
  assert.equal(hook.props.hidden, true)
  assert.equal(JSON.stringify(fetches[0]), JSON.stringify(['api/dsh-skill-hints', { cache: 'no-store' }]))
  await settle()
  assert.equal(slots['conversation.composer.dock'].Component({}), null, 'nothing to show without a rewrite')
})

test('the restart notice speaks the host language, is a status with a labelled close button', async () => {
  const { mod } = loadBundle({ body: { locale: 'ko', hints: {}, restart: true } })
  const slots = mount(mod)
  await settle()
  const tree = slots['conversation.composer.dock'].Component({})
  assert.equal(tree.props.role, 'status')
  assert.match(text(tree), /DSH를 완전히 종료\(⌘Q\)했다가 다시 켜면/u)
  const [button] = find(tree, (n) => n.type === 'button')
  assert.equal(button.props['aria-label'], '알림 닫기')
  assert.equal(button.props.type, 'button')

  const en = loadBundle({ body: { locale: 'en', hints: {}, restart: true } })
  const enSlots = mount(en.mod)
  await settle()
  assert.match(text(enSlots['conversation.composer.dock'].Component({})), /Quit DSH \(⌘Q\)/u)
})

test('closing the notice is remembered for this window', async () => {
  const storage = {}
  const first = loadBundle({ body: { locale: 'ko', hints: {}, restart: true }, storage })
  const slots = mount(first.mod)
  await settle()
  const [button] = find(slots['conversation.composer.dock'].Component({}), (n) => n.type === 'button')
  button.props.onClick()
  assert.equal(storage['dsh-skill-hints:restart-dismissed'], '1')
  const again = loadBundle({ body: { locale: 'ko', hints: {}, restart: true }, storage })
  const againSlots = mount(again.mod)
  await settle()
  assert.equal(againSlots['conversation.composer.dock'].Component({}), null)
})

// ── 실제 DOM에서 입력 안내 ───────────────────────────────────
async function loadPlaywright() {
  const base = join(homedir(), '.npm', '_npx')
  if (!existsSync(base)) return null
  for (const dir of readdirSync(base)) {
    const file = join(base, dir, 'node_modules', 'playwright', 'index.mjs')
    if (existsSync(file)) return import(pathToFileURL(file).href)
  }
  return null
}
function cachedChromium() {
  const base = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(base)) return undefined
  for (const d of readdirSync(base).filter((x) => x.startsWith('chromium_headless_shell-')).sort().reverse()) {
    for (const sub of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-linux64']) {
      const exe = join(base, d, sub, 'chrome-headless-shell')
      if (existsSync(exe)) return exe
    }
  }
  return undefined
}
const pw = await loadPlaywright()

test('in a real composer the hint follows typing and leaves DSH command hints alone', { skip: pw ? false : 'Playwright not found in the npx cache' }, async () => {
  const executablePath = cachedChromium()
  const browser = await pw.chromium.launch(executablePath ? { executablePath } : {})
  try {
    const page = await browser.newPage()
    await page.setContent('<div data-composer-card><div data-composer-input contenteditable><p></p></div></div>')
    await page.evaluate((source) => {
      window.fetch = async () => ({ ok: true, json: async () => ({ locale: 'ko', hints: { 'gstack-cso': '[--diff 변경분만]' }, restart: false }) })
      window.__ModuleLoader__ = { load: (entry) => { window.__bundle = entry.factory(() => ({ createElement() {}, useEffect() {}, useRef() {}, useState() {} })) } }
      new Function(source)()
    }, CLIENT)
    const hint = () => page.evaluate(() => document.querySelector('[data-composer-input]').style.getPropertyValue('--dsh-composer-hint'))
    const type = (html) => page.evaluate((h) => { document.querySelector('[data-composer-input]').innerHTML = h }, html)
    await page.evaluate(async () => {
      const { attachHint, store } = window.__bundle.apply.testing
      await store.refresh()
      window.__detach = attachHint(document.querySelector('[data-composer-card]'))
    })

    await type('<p>/gstack-cso</p>')
    await page.waitForFunction(() => document.querySelector('[data-composer-input]').style.getPropertyValue('--dsh-composer-hint') !== '')
    assert.equal(await hint(), '" [--diff 변경분만]"')
    await type('<p>/gstack-cso --diff</p>')
    await page.waitForFunction(() => document.querySelector('[data-composer-input]').style.getPropertyValue('--dsh-composer-hint') === '')
    await type('<p>/gstack-cso</p><p>more</p>')
    await page.waitForTimeout(30)
    assert.equal(await hint(), '', 'two paragraphs: no hint')

    // DSH 명령 안내가 먼저 있으면 그대로 둔다.
    await page.evaluate(() => {
      const input = document.querySelector('[data-composer-input]')
      input.style.setProperty('--dsh-composer-hint', '"<objective>"')
      input.innerHTML = '<p>/gstack-cso</p>'
    })
    await page.waitForTimeout(30)
    assert.equal(await hint(), '"<objective>"')

    // 떼어 내면 자기가 넣은 값만 지운다.
    await page.evaluate(() => {
      const input = document.querySelector('[data-composer-input]')
      input.style.removeProperty('--dsh-composer-hint')
      input.innerHTML = '<p>/gstack-cso </p>'
    })
    await page.waitForFunction(() => document.querySelector('[data-composer-input]').style.getPropertyValue('--dsh-composer-hint') !== '')
    assert.equal(await hint(), '"[--diff 변경분만]"')
    await page.evaluate(() => window.__detach())
    assert.equal(await hint(), '')
  } finally {
    await browser.close()
  }
})
