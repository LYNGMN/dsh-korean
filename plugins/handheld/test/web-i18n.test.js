import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorText, fill, LANGS, pickText, setLang, t, TABLES } from '../web/src/lib/i18n.js'
import { enterAction } from '../web/src/lib/enter-keys.js'
import { pendingRowText, pendingStripText, reviewOf } from '../web/src/lib/pending.js'

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../web/src')
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

test('every language has the same keys and placeholders as Korean', () => {
  assert.deepEqual(LANGS.map(([code]) => code), Object.keys(TABLES))
  for (const [code, table] of Object.entries(TABLES)) {
    assert.deepEqual(Object.keys(table), Object.keys(TABLES.ko), code)
    for (const [key, text] of Object.entries(table)) {
      assert.ok(text.length > 0, `${code} ${key}`)
      assert.deepEqual(placeholders(text), placeholders(TABLES.ko[key]), `${code} ${key}`)
    }
  }
})

test('t follows the chosen language and falls back to Korean for an unknown one', (ctx) => {
  ctx.after(() => setLang('ko'))
  setLang('en')
  assert.equal(t('review.approve'), 'Approve')
  assert.equal(t('time.minutes', { n: 3 }), '3m ago')
  setLang('xx')
  assert.equal(t('review.approve'), '승인')
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}')
})

test('every key the screens ask for exists', () => {
  const used = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'locale') walk(file) } else if (/\.jsx?$/.test(entry.name)) {
        for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bt\('([^'`$]+)'/g)) used.add(m[1])
      }
    }
  }
  walk(SRC)
  assert.ok(used.size > 100)
  assert.deepEqual([...used].filter((key) => !Object.hasOwn(TABLES.ko, key)), [])
})

test('screen text lives in the tables, not in the screens', () => {
  const stray = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'locale') walk(file) } else if (/\.jsx$/.test(entry.name)) {
        fs.readFileSync(file, 'utf8').split('\n').forEach((line, n) => {
          if (/[가-힣]/.test(line.replace(/\/\/.*$/, ''))) stray.push(`${entry.name}:${String(n + 1)}`)
        })
      }
    }
  }
  walk(SRC)
  assert.deepEqual(stray, [])
})

test('a gateway error is worded from its code', (ctx) => {
  ctx.after(() => setLang('ko'))
  setLang('en')
  assert.equal(errorText('prompt/empty', 400, '보낼 글이 비어 있습니다'), 'There is nothing to send')
  assert.equal(errorText('session/unknown', 502, 'x'), 'DSH could not handle the request')
  assert.equal(errorText('odd', 400, 'as sent'), 'as sent')
  assert.equal(pickText({ en: 'outside write', zh: '写' }, 'fallback'), 'outside write')
  setLang('zh-TW')
  assert.equal(pickText({ en: 'outside write', zh: '写' }, 'fallback'), '写')
  assert.equal(pickText(undefined, 'fallback'), 'fallback')
})

test('a plan review is named as one, not as an English question', () => {
  const plan = { id: 'p', sessionId: 's', kind: 'question', questions: [{ id: 'plan-review', question: 'Approve this plan and leave plan mode?', detail: '# 설정 개선 계획\n\n본문', options: ['Approve', 'Keep planning'], multiSelect: false, review: { approve: 'Approve', revise: 'Keep planning' } }] }
  const plain = { id: 'q', sessionId: 's', kind: 'question', questions: [{ id: 'a', question: '어느 쪽?', options: ['A', 'B'], multiSelect: false }] }
  assert.equal(reviewOf(plan).id, 'plan-review')
  assert.equal(reviewOf(plain), null)
  assert.equal(pendingRowText(plan), '계획 검토 · 설정 개선 계획')
  assert.equal(pendingStripText(plan), '계획을 검토해 주세요')
  assert.equal(pendingRowText(plain), '질문 · 어느 쪽?')
  assert.equal(pendingRowText({ kind: 'approval', tool: 'bash' }), '승인 · bash')
})

test('an Enter that confirms a Japanese or Chinese conversion does not send', () => {
  const key = { key: 'Enter', enterKey: 'send', msSinceCompositionEnd: 5 }
  assert.equal(enterAction({ ...key, isComposing: true, imeConfirms: true }).action, 'none')
  assert.equal(enterAction({ ...key, keyCode: 229, imeConfirms: true }).action, 'none')
  assert.equal(enterAction({ ...key, keyCode: 13, imeConfirms: true }).action, 'send')
  assert.equal(enterAction({ ...key, isComposing: true }).afterCompose, true)
})

test('every icon a screen asks for is in the icon set', async () => {
  const source = fs.readFileSync(path.join(SRC, 'components/Icon.jsx'), 'utf8')
  const defined = new Set([...source.slice(0, source.indexOf('const OPTICAL')).matchAll(/^ {2}(\w+): /gm)].map((m) => m[1]))
  const used = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (/\.jsx?$/.test(entry.name)) {
        const text = fs.readFileSync(file, 'utf8')
        for (const m of text.matchAll(/<Icon name="(\w+)"/g)) used.add(m[1])
        for (const line of text.split('\n').filter((l) => /<Icon name=\{|pendingIcon|_CHOICES = /.test(l) || /return item\.kind === 'approval'/.test(l))) for (const m of line.matchAll(/'(\w+)'/g)) if (defined.has(m[1]) || /^(shield|review|question|sun|moon|auto|stop|mic|alert|check|close)$/.test(m[1])) used.add(m[1])
      }
    }
  }
  walk(SRC)
  assert.ok(used.size >= 20)
  assert.deepEqual([...used].filter((name) => !defined.has(name)), [])
})
