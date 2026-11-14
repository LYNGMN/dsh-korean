// Browser tests for client.js on markup in the shape DSH's markdown renderer draws:
// bare `<sup>n</sup>` references and `<section data-footnotes>` definitions whose `↩` marks are
// separate text nodes (React renders each string child as its own node), driven by Playwright.
// Playwright is looked up in the npx cache; the tests are skipped when it is missing.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT = readFileSync(join(here, '..', 'client.js'), 'utf8')

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

/** A cached Chromium build, newest first, for when this Playwright wants a build that is not downloaded. */
function cachedChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const base = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(base)) return undefined
  const dirs = readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  for (const d of dirs) {
    for (const sub of ['chrome-headless-shell-mac-arm64', 'chrome-mac', 'chrome-headless-shell-linux64']) {
      const exe = join(base, d, sub, 'chrome-headless-shell')
      if (existsSync(exe)) return exe
    }
  }
  return undefined
}

const pwMod = await loadPlaywright()
const skip = pwMod ? false : 'Playwright not found in the npx cache'
const executablePath = cachedChromium()
const launch = () => pwMod.chromium.launch(executablePath ? { executablePath } : {})

/**
 * Body text with references, then the footnote section built node by node like React does:
 * footnote 1 is used three times (↩ ↩<sup>2</sup> ↩<sup>3</sup>), footnote 2 once (↩).
 */
const BUILD = `(() => {
  const root = document.querySelector('#answer')
  root.innerHTML = '<p id="p1">첫 문장<sup>1</sup>. 둘째 문장<sup>2</sup>.</p>'
    + '<div style="height:900px"></div><p id="p2">다시 인용<sup>1</sup>.</p>'
    + '<div style="height:900px"></div><p id="p3">세 번째 인용<sup>1</sup>.</p><div style="height:400px"></div>'
  const section = document.createElement('section')
  section.setAttribute('data-footnotes', 'true')
  section.innerHTML = '<h2 class="sr-only">각주</h2><ol></ol>'
  const ol = section.querySelector('ol')
  const item = (id, html, uses) => {
    const li = document.createElement('li'); li.id = 'user-content-fn-' + id
    const p = document.createElement('p'); p.innerHTML = html; p.append(' ')
    for (let k = 1; k <= uses; k++) {
      if (k > 1) p.append(' ')
      p.append('↩')
      if (k > 1) { const s = document.createElement('sup'); s.textContent = String(k); p.append(s) }
    }
    li.append(p); ol.append(li)
  }
  item('a', '<a href="https://example.kr/ev">충전 현황 — 가상 기관</a> (발표일 2026-11-01)', 3)
  item('b', '<a href="https://example.kr/fast">급속충전기 분포 — 가상 연구원</a>', 1)
  root.append(section)
  root.append(Object.assign(document.createElement('div'), { style: 'height:600px' }))
})()`

function page({ lang = 'ko' } = {}) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:16px;font:15px/1.6 -apple-system,sans-serif}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style>
</head><body><div class="md" id="answer"></div><div class="md" id="plain"><p>각주가 없는 답<sup>3</sup></p></div></body></html>`
}

/** Loads client.js through a stand-in module loader; `locale` mimics DSH's ctx.locale (or none). */
async function boot(p, { locale = 'ko', build = true } = {}) {
  if (build) await p.evaluate(BUILD)
  await p.addScriptTag({ content: 'window.__ModuleLoader__={load(d){window.__fnMod=d.factory(()=>{})}};' })
  await p.addScriptTag({ content: CLIENT })
  await p.evaluate((active) => {
    const mod = window.__fnMod
    let ctxLocale
    if (active) {
      const dicts = {}
      const listeners = new Set()
      window.__setLocale = (id) => { window.__active = id; for (const fn of listeners) fn() }
      window.__active = active
      ctxLocale = {
        register(ns, d) { dicts[ns] = d; return () => {} },
        bind(ns) { return (key, params) => (dicts[ns][window.__active]?.[key] ?? dicts[ns].en[key]).replace(/\{(\w+)\}/g, (m, n) => (params && n in params ? String(params[n]) : m)) },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
      }
    }
    mod.apply({ locale: ctxLocale, effect(fn) { const out = fn(); if (typeof out === 'function') window.__fnDispose = out } })
  }, locale)
  await p.waitForTimeout(60)
}

const tip = (p) => p.locator('#local-footnote-hover-tip')
const back = (p) => p.locator('#local-footnote-hover-back')
const activeInfo = (p) => p.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id || '', marked: document.activeElement.hasAttribute('data-fn-arrived') }))
const focusIn = (p, sel) => p.evaluate((sel) => !!document.activeElement.closest(sel), sel)
const glyphPoint = (p, sel) => p.evaluate((sel) => {
  const walker = document.createTreeWalker(document.querySelector(sel), 4)
  while (walker.nextNode()) {
    const i = walker.currentNode.nodeValue.indexOf('↩')
    if (i >= 0) { const r = document.createRange(); r.setStart(walker.currentNode, i); r.setEnd(walker.currentNode, i + 1); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }
  }
}, sel)

test('references get link semantics and labels in the DSH language', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage()
    await p.setContent(page({ lang: 'en' })) // the html lang is not what counts; the DSH setting is
    await boot(p, { locale: 'ko' })
    const marked = await p.$$eval('sup[data-fn-hover]', (els) => els.map((e) => [e.textContent, e.getAttribute('role'), e.tabIndex, e.getAttribute('aria-label')]))
    assert.deepEqual(marked, [['1', 'link', 0, '각주 1'], ['2', 'link', 0, '각주 2'], ['1', 'link', 0, '각주 1'], ['1', 'link', 0, '각주 1']])
    assert.equal(await p.locator('#plain sup[data-fn-hover]').count(), 0, 'no section, no decoration')
    // Switching the language relabels what is already on the page.
    await p.evaluate(() => window.__setLocale('en'))
    assert.equal(await p.getAttribute('sup[data-fn-hover] >> nth=0', 'aria-label'), 'Footnote 1')
    assert.equal(await p.getAttribute('sup[data-fn-backref="2"]', 'aria-label'), 'Back to reference 2')
    await p.evaluate(() => window.__setLocale('zh'))
    assert.equal(await p.getAttribute('sup[data-fn-hover] >> nth=0', 'aria-label'), '脚注 1')
  } finally { await browser.close() }
})

test('without a locale service the labels are English', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage()
    await p.setContent(page())
    await boot(p, { locale: null })
    assert.equal(await p.getAttribute('sup[data-fn-hover] >> nth=0', 'aria-label'), 'Footnote 1')
  } finally { await browser.close() }
})

test('a footnote used more than once gets ↩1, once only, and labelled back-references', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage()
    await p.setContent(page())
    await boot(p)
    const text = (await p.locator('#user-content-fn-a p').innerText()).replace(/\s+/g, ' ')
    assert.match(text, /↩1 ↩2 ↩3$/)
    assert.match((await p.locator('#user-content-fn-b p').innerText()).trim(), /연구원 ↩$/, 'used once: plain ↩')
    const backs = await p.$$eval('#user-content-fn-a sup[data-fn-backref]', (els) => els.map((e) => [e.textContent, e.getAttribute('role'), e.getAttribute('aria-label')]))
    assert.deepEqual(backs, [['1', 'link', '본문 1번째 위치로 돌아가기'], ['2', 'link', '본문 2번째 위치로 돌아가기'], ['3', 'link', '본문 3번째 위치로 돌아가기']])
    // A re-render touching the paragraph keeps a single 1.
    await p.evaluate(() => { document.querySelector('#user-content-fn-a p').append(' ') })
    await p.waitForTimeout(80)
    assert.equal(await p.locator('#user-content-fn-a sup[data-fn-backnum]').count(), 1)
  } finally { await browser.close() }
})

test('hover waits a moment, shows the footnote without ↩ marks, and a pass-over shows nothing', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage()
    await p.setContent(page())
    await boot(p)
    await p.hover('#p1 sup >> nth=0')
    await p.waitForTimeout(60)
    await p.mouse.move(5, 5)
    await p.waitForTimeout(300)
    assert.equal(await tip(p).isVisible(), false, 'a pass-over shows nothing')
    await p.hover('#p1 sup >> nth=0')
    await tip(p).waitFor({ state: 'visible' })
    const text = (await tip(p).innerText()).replace(/\s+/g, ' ').trim()
    assert.equal(text, '각주 1 충전 현황 — 가상 기관 (발표일 2026-11-01) 각주로 가기')
    assert.equal(await tip(p).locator('a').getAttribute('href'), 'https://example.kr/ev')
    await tip(p).hover()
    await p.waitForTimeout(350)
    assert.equal(await tip(p).isVisible(), true, 'the card stays while the pointer is on it')
    await p.mouse.move(5, 5)
    await p.waitForTimeout(350)
    assert.equal(await tip(p).isVisible(), false)
  } finally { await browser.close() }
})

test('click jumps to the footnote, marks it, and the back button returns to the same use', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await p.setContent(page())
    await boot(p)
    await p.evaluate(() => document.querySelector('#p2').scrollIntoView({ block: 'center' }))
    await p.click('#p2 sup')
    await p.waitForTimeout(700)
    assert.deepEqual(await activeInfo(p), { tag: 'LI', id: 'user-content-fn-a', marked: true })
    const li = await p.locator('#user-content-fn-a').boundingBox()
    assert.ok(li.y >= 0 && li.y + li.height <= 700, 'footnote scrolled into view')
    await back(p).waitFor({ state: 'visible' })
    assert.equal((await back(p).innerText()).trim(), '본문으로')
    assert.equal(await back(p).getAttribute('aria-label'), '본문 2번째 위치로 돌아가기')
    const bb = await back(p).boundingBox()
    assert.ok(bb.x >= 8 && bb.y >= 8 && bb.x + bb.width <= 900 - 8 && bb.y + bb.height <= 700 - 8)
    await back(p).click()
    await p.waitForTimeout(700)
    assert.equal(await focusIn(p, '#p2'), true)
    assert.equal(await p.evaluate(() => document.activeElement.hasAttribute('data-fn-arrived')), true)
    assert.equal(await back(p).isVisible(), false)
    await p.waitForTimeout(1700)
    assert.equal(await p.locator('[data-fn-arrived]').count(), 0, 'the mark goes away')
  } finally { await browser.close() }
})

test('↩ marks go back to the matching use: the bare first ↩ and the numbered ones', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage({ viewport: { width: 900, height: 700 } })
    await p.setContent(page())
    await boot(p)
    await p.evaluate(() => document.querySelector('#user-content-fn-a').scrollIntoView({ block: 'center' }))
    await p.click('#user-content-fn-a sup[data-fn-backref="3"]')
    await p.waitForTimeout(700)
    assert.equal(await focusIn(p, '#p3'), true, '↩3 goes to the third use')
    await p.evaluate(() => document.querySelector('#user-content-fn-a').scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(200)
    const glyph = await glyphPoint(p, '#user-content-fn-a')
    await p.mouse.move(glyph.x, glyph.y)
    await tip(p).waitFor({ state: 'visible' })
    assert.equal((await tip(p).innerText()).trim(), '본문 1번째 위치로 돌아가기')
    await p.mouse.click(glyph.x, glyph.y)
    await p.waitForTimeout(700)
    assert.equal(await focusIn(p, '#p1'), true, 'the bare ↩ goes to the first use')
    await p.evaluate(() => document.querySelector('#user-content-fn-b').scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(200)
    const once = await glyphPoint(p, '#user-content-fn-b')
    await p.mouse.move(once.x, once.y)
    await tip(p).waitFor({ state: 'visible' })
    assert.equal((await tip(p).innerText()).trim(), '본문으로 돌아가기')
  } finally { await browser.close() }
})

test('keyboard: Tab shows the card, Enter jumps, Enter on the footnote goes back, Esc closes', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage()
    await p.setContent(page())
    await boot(p)
    await p.keyboard.press('Tab')
    await tip(p).waitFor({ state: 'visible' })
    assert.match(await tip(p).innerText(), /각주 1/)
    await p.keyboard.press('Escape')
    assert.equal(await tip(p).isVisible(), false)
    assert.equal(await p.evaluate(() => document.activeElement.hasAttribute('data-fn-hover')), true)
    await p.keyboard.press('Enter')
    await p.waitForTimeout(600)
    assert.equal((await activeInfo(p)).id, 'user-content-fn-a')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(600)
    assert.equal(await focusIn(p, '#p1'), true)
    await p.focus('#user-content-fn-a sup[data-fn-backref="2"]')
    await p.keyboard.press('Enter')
    await p.waitForTimeout(600)
    assert.equal(await focusIn(p, '#p2'), true)
  } finally { await browser.close() }
})

test('touch: the first tap previews, the card button jumps', { skip }, async () => {
  const browser = await launch()
  try {
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 700 } })
    const p = await ctx.newPage()
    await p.setContent(page())
    await boot(p)
    await p.tap('#p1 sup >> nth=0')
    await tip(p).waitFor({ state: 'visible' })
    assert.notEqual((await activeInfo(p)).id, 'user-content-fn-a', 'no jump on the first tap')
    await p.tap('#local-footnote-hover-tip [data-fn-go]')
    await p.waitForTimeout(700)
    assert.equal((await activeInfo(p)).id, 'user-content-fn-a')
  } finally { await browser.close() }
})

test('the card stays inside a narrow window near the edges', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage({ viewport: { width: 320, height: 568 } })
    await p.setContent(page())
    const long = '아주 긴 출처 설명 '.repeat(30)
    await p.evaluate((long) => {
      document.querySelector('#answer').innerHTML = `<p style="text-align:right;margin:0">맨 위 오른쪽 끝<sup>1</sup></p><section data-footnotes="true"><ol><li><p>${long} ↩</p></li></ol></section>`
    }, long)
    await boot(p, { build: false })
    await p.hover('#answer sup')
    await tip(p).waitFor({ state: 'visible' })
    const box = await tip(p).boundingBox()
    assert.ok(box.x >= 8 && box.x + box.width <= 320 - 8 + 0.5, `x ${box.x} w ${box.width}`)
    assert.ok(box.y >= 8 && box.y + box.height <= 568 - 8 + 0.5, `y ${box.y} h ${box.height}`)
    assert.equal(await tip(p).getAttribute('data-side'), 'below', 'no room above the first line')
    assert.ok(box.height <= 568 * 0.6 + 1, `long footnotes scroll inside: h ${box.height}`)
  } finally { await browser.close() }
})

test('a card opened far right, then shown in a narrow window, is measured afresh', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage({ viewport: { width: 1000, height: 600 } })
    await p.setContent(page())
    await p.evaluate(() => {
      document.querySelector('#answer').innerHTML = `<p style="margin:120px 0 0">왼쪽<sup>1</sup></p><p style="text-align:right">오른쪽<sup>1</sup></p><section data-footnotes="true"><ol><li><p>${'여러 줄로 늘어나는 긴 출처 설명 '.repeat(8)} ↩</p></li></ol></section>`
    })
    await boot(p, { build: false })
    await p.hover('#answer sup >> nth=1')
    await tip(p).waitFor({ state: 'visible' })
    await p.setViewportSize({ width: 375, height: 600 })
    await p.mouse.move(1, 590)
    await p.waitForTimeout(350)
    await p.hover('#answer sup >> nth=0')
    await tip(p).waitFor({ state: 'visible' })
    const [t, s] = [await tip(p).boundingBox(), await p.locator('#answer sup >> nth=0').boundingBox()]
    assert.ok(t.x >= 8 && t.x + t.width <= 375 - 8 + 0.5, `x ${t.x} w ${t.width}`)
    const side = await tip(p).getAttribute('data-side')
    const gap = side === 'above' ? s.y - (t.y + t.height) : t.y - (s.y + s.height)
    assert.ok(Math.abs(gap - 6) <= 1, `${side} gap ${gap}`)
  } finally { await browser.close() }
})

test('footnotes rendered later (streaming) are picked up; dispose removes everything', { skip }, async () => {
  const browser = await launch()
  try {
    const p = await browser.newPage()
    await p.setContent(page())
    await boot(p, { build: false })
    await p.evaluate(BUILD)
    await p.waitForTimeout(120)
    assert.equal(await p.locator('sup[data-fn-hover]').count(), 4)
    assert.equal(await p.locator('sup[data-fn-backnum]').count(), 1)
    await p.evaluate(() => window.__fnDispose())
    assert.equal(await p.locator('[data-fn-hover], [data-fn-backref], [data-fn-backnum], [data-fn-li], [tabindex], [role]').count(), 0)
    assert.equal(await p.locator('#local-footnote-hover-tip, #local-footnote-hover-back, #local-footnote-hover-style').count(), 0)
    assert.match((await p.locator('#user-content-fn-a p').innerText()).replace(/\s+/g, ' '), /↩ ↩2 ↩3$/, 'the renderer’s text is untouched')
  } finally { await browser.close() }
})
