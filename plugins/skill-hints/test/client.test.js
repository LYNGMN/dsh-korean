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

// 실제 `~/.agents/skill-hints.json` 안내(2026-11-25)에서 가져온 것.
const REAL_HINTS = {
  cso: '[--comprehensive 정밀 | --doctor 준비 점검 | --diff 변경분만 | --code 코드 | --infra 인프라 | --supply-chain 공급망 | --owasp OWASP 기준 | --resume 이어서 | --recheck 재확인]',
  'gstack-cso': '[--diff 변경분만 | --comprehensive 정밀]',
  benchmark: '[URL] [--baseline 기준선 | --quick 빠르게 | --pages 페이지 지정 | --diff 변경분만 | --trend 추세]',
  impeccable: '[polish 다듬기 | audit 점검 | critique 평가 | layout 배치 | adapt 반응형] [대상]',
  qa: '[--quick 빠르게 | --exhaustive 전부] [--regression 회귀 비교] [URL 또는 대상]',
  'ios-qa': '[--tailnet 원격 연결 | --recording 녹화 표시 | --cold 처음부터 | demo 시연] [확인할 화면이나 기능]',
  'plan-eng-review': '[계획 파일 | branch diff 브랜치 변경분]',
  'plan-devex-review': '[계획 파일] [DX 확장 | DX 다듬기 | 급한 것만]',
  retro: '[compare 이전 비교 | global 전체 프로젝트] [기간 예: 24h 7d 14d 30d]',
  verify: '[quick 빠르게 | pre-commit 커밋 직전]',
  review: '[검토할 코드나 변경분]',
}

test('hintChoices keeps lowercase words that have a description, in hint order', () => {
  const { hintChoices } = loadBundle().mod.apply.testing
  const words = (hint) => [...hintChoices(hint).map((c) => c.word)]
  assert.deepEqual(words(REAL_HINTS['gstack-cso']), ['--diff', '--comprehensive'])
  assert.deepEqual(words(REAL_HINTS.benchmark), ['--baseline', '--quick', '--pages', '--diff', '--trend'], '[URL] has no description')
  assert.deepEqual(words(REAL_HINTS.impeccable), ['polish', 'audit', 'critique', 'layout', 'adapt'], '[대상] is a placeholder')
  assert.deepEqual(words(REAL_HINTS['plan-eng-review']), ['branch diff'])
  assert.deepEqual(words(REAL_HINTS['plan-devex-review']), [], 'Korean and capitalised labels are not words to type')
  assert.deepEqual(words(REAL_HINTS.retro), ['compare', 'global'])
  assert.deepEqual(words(REAL_HINTS.verify), ['quick', 'pre-commit'])
  assert.deepEqual(words(REAL_HINTS.review), [])
  assert.deepEqual([...hintChoices(REAL_HINTS["ios-qa"]).map((c) => c.option)], [true, true, true, false])
  assert.deepEqual(words(''), [])
  assert.deepEqual(words(null), [])
  assert.deepEqual(words('--diff 변경분만'), [], 'only inside [ ]')
})

test('completeOption fills the rest of the first matching option', () => {
  const { completeOption } = loadBundle().mod.apply.testing
  const c = (text) => completeOption(text, REAL_HINTS)
  assert.equal(c('/gstack-cso --d'), 'iff')
  assert.equal(c('/gstack-cso --c'), 'omprehensive')
  assert.equal(c('/cso --d'), 'octor', 'several match: the first in hint order')
  assert.equal(c('/cso --di'), 'ff')
  assert.equal(c('/cso --diff'), null, 'fully typed')
  assert.equal(c('/cso --diff '), null, 'ends with a space')
  assert.equal(c('/cso --doctor --d'), 'iff', 'an option already typed is not offered again')
  assert.equal(c('/cso --x'), null)
  assert.equal(c('/cso --'), null, 'needs a letter after the dashes')
  assert.equal(c('/cso -'), null)
  assert.equal(c('/cso -d'), null)
  assert.equal(c('/cso --D'), null, 'options are lowercase')
  assert.equal(c('/benchmark https://example.com --q'), 'uick', 'options match anywhere')
  assert.equal(c('/qa --quick --r'), 'egression')
  assert.equal(c('/unknown --d'), null)
  assert.equal(c('/review --d'), null)
  assert.equal(c('hello /cso --d'), null)
  assert.equal(c('/cso'), null)
  assert.equal(c(''), null)
})

test('completeOption fills bare sub-command words only as the first argument', () => {
  const { completeOption } = loadBundle().mod.apply.testing
  const c = (text) => completeOption(text, REAL_HINTS)
  assert.equal(c('/impeccable p'), 'olish')
  assert.equal(c('/impeccable a'), 'udit', 'audit comes before adapt')
  assert.equal(c('/impeccable ad'), 'apt')
  assert.equal(c('/impeccable polish'), null)
  assert.equal(c('/impeccable polish a'), null, 'second word is the target, not a sub-command')
  assert.equal(c('/impeccable 버튼 p'), null)
  assert.equal(c('/ios-qa --tailnet d'), 'emo', 'options before it are fine')
  assert.equal(c('/ios-qa d'), 'emo')
  assert.equal(c('/ios-qa --c'), 'old', 'bare words are not offered for --')
  assert.equal(c('/impeccable --p'), null, 'and options are not offered for bare words')
  assert.equal(c('/plan-eng-review b'), 'ranch diff')
  assert.equal(c('/plan-eng-review branch d'), 'iff', 'two-word choices continue')
  assert.equal(c('/verify pre'), '-commit')
  assert.equal(c('/retro 7'), null)
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

test('in a real composer Tab and → fill the option, and pass through otherwise', { skip: pw ? false : 'Playwright not found in the npx cache' }, async () => {
  const executablePath = cachedChromium()
  const browser = await pw.chromium.launch(executablePath ? { executablePath } : {})
  try {
    const page = await browser.newPage()
    await page.setContent('<div data-composer-card><div data-composer-input contenteditable="true" style="white-space:pre-wrap"><p></p></div></div><button>next</button>')
    await page.evaluate((source) => {
      window.fetch = async () => ({ ok: true, json: async () => ({ locale: 'ko', hints: { 'gstack-cso': '[--diff 변경분만 | --comprehensive 정밀]' }, restart: false }) })
      window.__ModuleLoader__ = { load: (entry) => { window.__bundle = entry.factory(() => ({ createElement() {}, useEffect() {}, useRef() {}, useState() {} })) } }
      new Function(source)()
      const input = document.querySelector('[data-composer-input]')
      // DSH 붙여넣기 대신: 커서 자리에 글을 넣고 기본 동작을 막는다.
      input.addEventListener('paste', (event) => {
        event.preventDefault()
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
      })
      // 우리가 먹지 않은 키만 여기까지 온다.
      window.__passed = []
      window.addEventListener('keydown', (event) => { window.__passed.push(event.key) })
    }, CLIENT)
    await page.evaluate(async () => {
      const { attachHint, store } = window.__bundle.apply.testing
      await store.refresh()
      window.__detach = attachHint(document.querySelector('[data-composer-card]'))
    })
    const state = () => page.evaluate(() => {
      const input = document.querySelector('[data-composer-input]')
      return { text: input.textContent, hint: input.style.getPropertyValue('--dsh-composer-hint'), focused: document.activeElement === input, passed: window.__passed.splice(0) }
    })
    const setText = (text, caret = text.length) => page.evaluate(([t, at]) => {
      const input = document.querySelector('[data-composer-input]')
      input.innerHTML = '<p></p>'
      input.firstChild.textContent = t
      input.focus()
      const range = document.createRange()
      range.setStart(input.firstChild.firstChild, at)
      range.collapse(true)
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      window.__passed = []
    }, [text, caret])
    const settled = () => page.waitForTimeout(30)

    await setText('/')
    await page.keyboard.type('gstack-cso --d')
    await settled()
    let s = await state()
    assert.equal(s.hint, '"iff"', 'the rest of --diff is shown in grey')
    await page.keyboard.press('Tab')
    await settled()
    s = await state()
    assert.equal(s.text, '/gstack-cso --diff ', 'Tab fills the rest and a space')
    assert.equal(s.focused, true, 'focus stays in the composer')
    assert.deepEqual(s.passed.filter((k) => k === 'Tab'), [], 'Tab was ours')
    assert.equal(s.hint, '')

    await page.keyboard.type('--c')
    await settled()
    assert.equal((await state()).hint, '"omprehensive"')
    await page.keyboard.press('ArrowRight')
    await settled()
    assert.equal((await state()).text, '/gstack-cso --diff --comprehensive ', '→ fills too')

    // 메뉴가 열려 있으면 Tab은 DSH 몫이다.
    await setText('/gstack-cso --d')
    await page.evaluate(() => { document.querySelector('[data-composer-card]').insertAdjacentHTML('beforeend', '<div data-trigger-menu></div>') })
    await settled()
    await page.keyboard.press('Tab')
    s = await state()
    assert.equal(s.text, '/gstack-cso --d', 'menu open: untouched')
    assert.deepEqual(s.passed, ['Tab'])
    await page.evaluate(() => document.querySelector('[data-trigger-menu]').remove())

    // 커서가 끝이 아니면 지나보낸다.
    await setText('/gstack-cso --d', 5)
    await settled()
    await page.keyboard.press('ArrowRight')
    s = await state()
    assert.equal(s.text, '/gstack-cso --d')
    assert.deepEqual(s.passed, ['ArrowRight'])

    // Shift+Tab과 한글 조합 중은 지나보낸다.
    await setText('/gstack-cso --d')
    await settled()
    await page.keyboard.press('Shift+Tab')
    s = await state()
    assert.equal(s.text, '/gstack-cso --d')
    assert.deepEqual(s.passed, ['Shift', 'Tab'])
    await setText('/gstack-cso --d')
    await page.evaluate(() => document.querySelector('[data-composer-input]').setAttribute('data-composer-composing', ''))
    await settled()
    await page.keyboard.press('Tab')
    s = await state()
    assert.equal(s.text, '/gstack-cso --d')
    assert.deepEqual(s.passed, ['Tab'])
    await page.evaluate(() => document.querySelector('[data-composer-input]').removeAttribute('data-composer-composing'))

    // DSH 명령 안내가 보이는 중이면 채우지 않는다.
    await setText('/gstack-cso --d')
    await page.evaluate(() => document.querySelector('[data-composer-input]').style.setProperty('--dsh-composer-hint', '"<objective>"'))
    await settled()
    await page.keyboard.press('Tab')
    s = await state()
    assert.equal(s.text, '/gstack-cso --d')
    assert.equal(s.hint, '"<objective>"')
    assert.deepEqual(s.passed, ['Tab'])

    // 떼어 내면 키를 더는 받지 않는다.
    await page.evaluate(() => document.querySelector('[data-composer-input]').style.removeProperty('--dsh-composer-hint'))
    await setText('/gstack-cso --d')
    await settled()
    await page.evaluate(() => window.__detach())
    await page.keyboard.press('ArrowRight')
    s = await state()
    assert.equal(s.text, '/gstack-cso --d')
    assert.deepEqual(s.passed, ['ArrowRight'])
  } finally {
    await browser.close()
  }
})
