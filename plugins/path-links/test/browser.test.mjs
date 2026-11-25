// Browser tests for client.js on test/preview.html, a stand-in for DSH's markdown preview tab with
// fake sidebar, session and Host services. Driven by Playwright, looked up in the npx cache; the
// tests are skipped when it is missing.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PREVIEW = pathToFileURL(join(here, 'preview.html')).href

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) return import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  const base = join(homedir(), '.npm', '_npx')
  if (!existsSync(base)) return null
  for (const dir of readdirSync(base)) {
    const file = join(base, dir, 'node_modules', 'playwright', 'index.mjs')
    if (existsSync(file)) return import(pathToFileURL(file).href)
  }
  return null
}

/**
 * A Chromium to drive: CHROMIUM_PATH, a cached Playwright build (newest first), or an installed
 * Chrome, for when this Playwright wants a build that is not downloaded.
 */
function cachedChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const base = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (existsSync(base)) {
    const dirs = readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
    for (const d of dirs) {
      for (const sub of ['chrome-headless-shell-mac-arm64', 'chrome-mac', 'chrome-headless-shell-linux64']) {
        const exe = join(base, d, sub, 'chrome-headless-shell')
        if (existsSync(exe)) return exe
      }
    }
  }
  for (const exe of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']) {
    if (existsSync(exe)) return exe
  }
  return undefined
}

const pwMod = await loadPlaywright()
const skip = pwMod ? false : 'Playwright not found in the npx cache'
const executablePath = cachedChromium()

let browser
test.before(async () => { if (pwMod) browser = await pwMod.chromium.launch(executablePath ? { executablePath } : {}) })
test.after(async () => { await browser?.close() })

const FILE = '/Users/me/.agents/sources/pack/skills/demo/SKILL.md'
const DIR = '/Users/me/.agents/sources/pack/skills/demo'

async function open(query = '') {
  const p = await browser.newPage()
  await p.goto(PREVIEW + query)
  await p.waitForFunction(() => document.querySelectorAll('code[data-path-link]').length >= 5)
  await p.waitForTimeout(30)
  return p
}
const calls = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__calls)))
const codeIn = (id, n = 0) => `#${id} code >> nth=${n}`

test('only existing absolute paths in the preview are decorated', { skip }, async () => {
  const p = await open()
  try {
    const marks = await p.$$eval('#doc :not(pre) > code', (els) => els.map((e) => [e.textContent, e.getAttribute('data-path-link'), e.nextElementSibling?.hasAttribute('data-path-link-reveal') ?? false]))
    const byText = Object.fromEntries(marks.map(([text, kind, button]) => [text, [kind, button]]))
    assert.deepEqual(byText[FILE], ['file', true])
    assert.deepEqual(byText[DIR], ['dir', true])
    assert.deepEqual(byText['/Users/me/project/README.md'], ['file', true])
    for (const text of ['/Users/me/.agents/sources/pack/skills/<이름>/SKILL.md', '/pstack-<이름>', '/pstack-setup', 'pstack', 'references/', '/Users/me/nowhere/SKILL.md', '~/.agents/skills']) {
      assert.deepEqual(byText[text], [null, false], text)
    }
    assert.equal(await p.getAttribute('#fence', 'data-path-link'), null, 'fenced code stays as it is')
    assert.equal(await p.getAttribute('#outside code', 'data-path-link'), null, 'only the markdown preview')
    const stats = (await calls(p)).stat.map(([, path]) => path)
    assert.ok(!stats.includes('/pstack-setup') && !stats.some((s) => s.includes('<')), 'commands and placeholders are never asked about')
    assert.equal(new Set(stats).size, stats.length, 'each path is asked once')
  } finally { await p.close() }
})

test('a file path is a labelled link; a folder path only gets the button', { skip }, async () => {
  const p = await open()
  try {
    const file = await p.$eval(codeIn('file'), (e) => [e.getAttribute('role'), e.tabIndex, e.title])
    assert.deepEqual(file, ['link', 0, '본 문서 열기'])
    const dir = await p.$eval(codeIn('dir', 2), (e) => [e.getAttribute('data-path-link'), e.getAttribute('role'), e.getAttribute('tabindex')])
    assert.deepEqual(dir, ['dir', null, null])
    const buttons = await p.$$eval('[data-path-link-reveal]', (els) => els.map((b) => [b.tagName, b.type, b.getAttribute('aria-label'), b.textContent]))
    const mac = await p.evaluate(() => /Mac/i.test(navigator.platform))
    const [fileLabel, dirLabel] = mac ? ['Finder에서 보기', 'Finder에서 폴더 열기'] : ['파일 관리자에서 보기', '파일 관리자에서 폴더 열기']
    assert.deepEqual(buttons[0], ['BUTTON', 'button', fileLabel, ''])
    assert.ok(buttons.some((b) => b[2] === dirLabel))
    // Switching the language relabels what is on the page.
    await p.evaluate(() => window.__setLocale('en'))
    assert.equal(await p.getAttribute(codeIn('file'), 'title'), 'Open this file')
    assert.equal(await p.getAttribute('[data-path-link-reveal] >> nth=0', 'aria-label'), mac ? 'Show in Finder' : 'Show in file manager')
  } finally { await p.close() }
})

test('clicking a file path opens its session address in a sidebar tab', { skip }, async () => {
  const p = await open()
  try {
    await p.click(codeIn('file'))
    await p.click(codeIn('workspace'))
    const { open: opened } = await calls(p)
    assert.deepEqual(opened, [
      ['dsh-resource://file/session/sess-1//Users/me/.agents/sources/pack/skills/demo/SKILL.md', { destination: 'sidebar', revealIfOpened: true }],
      ['dsh-resource://file/session/sess-1/README.md', { destination: 'sidebar', revealIfOpened: true }]
    ])
    await p.click(codeIn('dir', 2))
    assert.equal((await calls(p)).open.length, 2, 'a folder path is not a link')
  } finally { await p.close() }
})

test('the ↗ button shows a file in Finder, and opens a folder', { skip }, async () => {
  const p = await open()
  try {
    await p.click('#file [data-path-link-reveal]')
    await p.click('#dir [data-path-link-reveal]')
    await p.waitForTimeout(20)
    assert.deepEqual((await calls(p)).reveal, [{ path: FILE, action: 'reveal' }, { path: DIR }])
    assert.equal((await calls(p)).open.length, 0, 'the button does not also open the tab')
  } finally { await p.close() }
})

test('behind a symlinked folder, Finder gets the real file and folder', { skip }, async () => {
  const p = await open()
  try {
    await p.click('#linked [data-path-link-reveal] >> nth=0')
    await p.click('#linked [data-path-link-reveal] >> nth=1')
    await p.waitForTimeout(20)
    assert.deepEqual((await calls(p)).reveal, [
      { path: '/Users/me/.agents/sources/cloud/skills/demo/SKILL.md', action: 'reveal' },
      { path: '/Users/me/.agents/sources/cloud/skills/demo' }
    ])
  } finally { await p.close() }
})

test('keyboard: Tab reaches the link and the button, Enter opens the file', { skip }, async () => {
  const p = await open()
  try {
    await p.focus(codeIn('file'))
    await p.keyboard.press('Enter')
    assert.equal((await calls(p)).open.length, 1)
    await p.keyboard.press('Tab')
    assert.equal(await p.evaluate(() => document.activeElement.getAttribute('data-path-link-reveal')), 'file')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(20)
    assert.equal((await calls(p)).reveal.length, 1)
  } finally { await p.close() }
})

test('a failure is announced and marked, without retrying', { skip }, async () => {
  const p = await open()
  try {
    await p.evaluate(() => { window.__fail.open = true; window.__fail.reveal = true })
    await p.click(codeIn('file'))
    await p.waitForTimeout(60)
    assert.equal(await p.getAttribute(codeIn('file'), 'data-path-link-failed'), '')
    assert.equal(await p.textContent('#local-path-links-live'), `열 수 없어요: ${FILE}`)
    await p.click('#file [data-path-link-reveal]')
    await p.waitForTimeout(60)
    assert.equal(await p.getAttribute('#file [data-path-link-reveal]', 'data-path-link-failed'), '')
    assert.equal(await p.getAttribute(codeIn('file'), 'data-path-link-failed'), null, 'one mark at a time')
    const c = await calls(p)
    assert.equal(c.open.length, 1)
    assert.equal(c.reveal.length, 1)
  } finally { await p.close() }
})

test('a Host that cannot open paths gets links but no buttons', { skip }, async () => {
  const p = await open('?noreveal')
  try {
    assert.equal(await p.locator('[data-path-link-reveal]').count(), 0)
    assert.equal(await p.getAttribute(codeIn('file'), 'data-path-link'), 'file')
  } finally { await p.close() }
})

test('redrawn and new text is picked up, stray buttons go, and dispose removes everything', { skip }, async () => {
  const p = await open()
  try {
    // React redraws a list item: the old code and its button are gone, a new code arrives.
    await p.evaluate((file) => { document.querySelector('#file').innerHTML = `<code>${file}</code>를 다시 읽는다.` }, FILE)
    await p.waitForFunction(() => document.querySelector('#file code').hasAttribute('data-path-link'))
    assert.equal(await p.locator('#file [data-path-link-reveal]').count(), 1)
    // Only the code is replaced; the button left behind must not stay.
    await p.evaluate(() => { const old = document.querySelector('#dir code:nth-of-type(3)'); old.replaceWith(Object.assign(document.createElement('code'), { textContent: 'plain' })) })
    await p.waitForTimeout(60)
    assert.equal(await p.locator('#dir [data-path-link-reveal]').count(), 0)
    // A code whose text changes to a path that is not there loses its decoration.
    await p.evaluate(() => { document.querySelector('#workspace code').textContent = '/Users/me/project/GONE.md' })
    await p.waitForTimeout(80)
    assert.equal(await p.getAttribute('#workspace code', 'data-path-link'), null)
    assert.equal(await p.locator('#workspace [data-path-link-reveal]').count(), 0)

    await p.evaluate(() => window.__dispose())
    const left = await p.evaluate(() => ({
      buttons: document.querySelectorAll('[data-path-link-reveal]').length,
      marked: document.querySelectorAll('[data-path-link],[data-path-link-path],code[role],code[tabindex],code[title]').length,
      style: !!document.getElementById('local-path-links-style'),
      live: !!document.getElementById('local-path-links-live')
    }))
    assert.deepEqual(left, { buttons: 0, marked: 0, style: false, live: false })
    await p.click(codeIn('file'))
    assert.equal((await calls(p)).open.length, 0, 'no listeners left')
  } finally { await p.close() }
})

test('without a locale service the labels are English', { skip }, async () => {
  const p = await open('?nolocale')
  try {
    assert.equal(await p.getAttribute(codeIn('file'), 'title'), 'Open this file')
  } finally { await p.close() }
})
