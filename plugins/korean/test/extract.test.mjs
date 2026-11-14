import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openAsar } from '../scripts/asar.mjs'
import { balanced, extract, splitTopLevel } from '../scripts/extract.mjs'
import { writeAsar } from './fake-asar.mjs'

const PKG = 'dsh/node_modules/@deepseek-ai'

function fakeApp() {
  const app = mkdtempSync(join(tmpdir(), 'dsh-korean-app-'))
  const resources = join(app, 'Contents/Resources')
  mkdirSync(join(resources, 'runtime/primary-runtime'), { recursive: true })
  writeFileSync(join(resources, 'runtime/primary-runtime/runtime.json'), JSON.stringify({ desktopVersion: '9.9.9' }))
  writeAsar(join(resources, 'app.asar'), {
    'lib/main.js': 'const zh={quit:"退出"};const en={quit:"Quit",about:"About {name}"};start(en)',
    [`${PKG}/ui-a/src/client/locales.ts`]: `
      export const zh = { save: '保存', 'count.one': '{count} 个', 'count.other': '{count} 个', id: 'ID' } satisfies Record<string, string>
      export type Key = keyof typeof zh
      export const en: Record<Key, string> = { save: 'Save', 'count.one': '{count} item', 'count.other': '{count} items', id: 'ID' }
      export const ja = { save: '保存', 'count.one': '{count} 件', 'count.other': '{count} 件', id: 'ID' }
      export const de = { save: 'Speichern', 'count.one': '{count} Element', 'count.other': '{count} Elemente', id: 'ID' }
    `,
    [`${PKG}/ui-a/src/client/index.ts`]: `
      import type { Context } from '@deepseek-ai/cordis'
      import { View } from './View.tsx'
      import { en, ja, de, zh } from './locales.ts'
      const NS = 'alpha'
      export function apply(ctx: Context) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, de }), 'alpha: dictionaries')
      }
    `,
    [`${PKG}/ui-a/lib/client.js`]: 'const en={save:`Save`,"count.one":`{count} item`,"count.other":`{count} items`,id:`ID`}',
    [`${PKG}/tokens/package.json`]: JSON.stringify({ exports: { './builtin': { default: './lib/types/builtin.js' } } }),
    [`${PKG}/tokens/src/builtin.ts`]: `export const tokens = { en: { goal: 'goal' }, zh: { goal: '目标' } }`,
    [`${PKG}/ui-b/src/client/locales.ts`]: `
      import { tokens } from '@deepseek-ai/tokens/builtin'
      const shared = { close: 'Close' }
      export const en = { ...shared, 'token.goal': tokens.en.goal }
      export const zh = { close: '关闭', 'token.goal': tokens.zh.goal }
    `,
    [`${PKG}/ui-b/src/client/index.ts`]: `
      import { en as bEn, zh as bZh } from './locales.ts'
      const dictionaries = { zh: bZh, en: bEn }
      export function apply(ctx) {
        ctx.effect(() => ctx.locale.register('beta.menu', dictionaries))
      }
    `,
    [`${PKG}/dsh-voice/locale/en.json`]: JSON.stringify({ meta: { title: 'Voice input', description: 'Transcribe recordings.', detail: 'docs/DETAIL.md' } }),
    [`${PKG}/dsh-voice/locale/zh.json`]: JSON.stringify({ meta: { title: '语音输入', description: '转写录音。' } }),
    [`${PKG}/dsh-badge/locale/en.json`]: JSON.stringify({ meta: { title: 'DSH' } }),
    [`${PKG}/dsh-badge/locale/zh.json`]: JSON.stringify({ meta: { title: 'DSH' } }),
    [`${PKG}/dsh-badge/locale/ja.json`]: JSON.stringify({ meta: { title: 'DSH' } }),
    [`${PKG}/dsh-client-ui-chat/locale/en.json`]: JSON.stringify({ meta: { title: 'ui-chat' } }),
    [`${PKG}/dsh-client-ui-chat/locale/zh.json`]: JSON.stringify({ meta: { title: '聊天' } }),
    [`${PKG}/dsh-voice/templates/demo/locale/en.json`]: JSON.stringify({ meta: { title: 'Demo' } }),
    [`node_modules/@deepseek-ai/dsh-voice/locale/en.json`]: JSON.stringify({ meta: { title: 'Voice input', description: 'Older text.' } }),
    [`${PKG}/ui-c/src/client/index.ts`]: `
      import { mystery } from '@deepseek-ai/not-installed'
      export function apply(ctx) {
        ctx.effect(() => ctx.locale.register('gamma', mystery))
      }
    `
  })
  return app
}

test('괄호 짝과 최상위 쉼표를 문자열 안팎으로 구분한다', () => {
  assert.equal(balanced("f(a, ')', {b: [1, 2]}) + g()", 1), "a, ')', {b: [1, 2]}")
  assert.deepEqual(splitTopLevel("NS, { a, b: 'x,y' }, [1, 2]"), ['NS', "{ a, b: 'x,y' }", '[1, 2]'])
})

test('asar를 풀지 않고 파일을 읽는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-korean-asar-'))
  writeAsar(join(dir, 'a.asar'), { 'x/한글.txt': '가나다', 'y.txt': 'second' })
  const asar = openAsar(join(dir, 'a.asar'))
  assert.deepEqual(asar.paths(), ['/x/한글.txt', '/y.txt'])
  assert.equal(asar.read('/x/한글.txt'), '가나다')
  assert.equal(asar.read('/y.txt'), 'second')
  assert.throws(() => asar.read('/none'), /없는 파일/)
  asar.close()
})

test('앱에서 네임스페이스별 영어 원문을 뽑고, 못 읽은 등록은 숨기지 않고 보고한다', async () => {
  const out = mkdtempSync(join(tmpdir(), 'dsh-korean-out-'))
  const { version, index, problems } = await extract({ app: fakeApp(), out })
  const read = (name) => JSON.parse(readFileSync(join(out, '9.9.9', name), 'utf8'))

  assert.deepEqual(problems.filter((p) => !p.file.startsWith("ui-c/")), [])
  assert.equal(version, "9.9.9")
  assert.deepEqual(Object.keys(index.namespaces), ['alpha', 'beta.menu'])
  assert.deepEqual(read('en/alpha.json'), { save: 'Save', 'count.one': '{count} item', 'count.other': '{count} items', id: 'ID' })
  assert.deepEqual(read('en/beta.menu.json'), { close: 'Close', 'token.goal': 'goal' })
  assert.deepEqual(index.namespaces.alpha.sameInEveryLanguage, ['id'])
  assert.equal(index.namespaces.alpha.notFoundInBuiltBundle, undefined)
  assert.deepEqual(read('main-en.json'), { quit: 'Quit', about: 'About {name}' })
  assert.deepEqual(read('packages-en.json'), {
    '@deepseek-ai/dsh-badge:title': 'DSH',
    '@deepseek-ai/dsh-voice:title': 'Voice input',
    '@deepseek-ai/dsh-voice:description': 'Transcribe recordings.',
    '@deepseek-ai/dsh-voice/templates/demo:title': 'Demo',
    '@deepseek-ai/dsh-voice@2:description': 'Older text.'
  })
  assert.deepEqual(index.packages, { keys: 5, identifierTitles: 1, sameInEveryLanguage: ['@deepseek-ai/dsh-badge:title'] })
  assert.equal(problems.length, 1)
  assert.match(problems[0].file, /^ui-c\//)
})
