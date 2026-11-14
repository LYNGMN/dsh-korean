import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { build, render } from '../scripts/build.mjs'
import { ROOT } from '../scripts/dictionary.mjs'

const template = readFileSync(join(ROOT, 'src/client.template.js'), 'utf8')

function load(source) {
  let plugin
  const warnings = []
  const sandbox = {
    window: { __ModuleLoader__: { load: (module) => { plugin = module } } },
    console: { warn: (message) => warnings.push(message) }
  }
  vm.runInNewContext(source, sandbox)
  return { plugin, warnings }
}

function fakeContext(locale) {
  const disposers = []
  return { locale, disposers, plugins: [], effect: (callback) => disposers.push(callback()), plugin(definition) { this.plugins.push(definition) } }
}

const sample = render({ template, korean: { common: { ok: '확인' }, chat: { send: '보내기' }, empty: {} }, packVersion: '1.2.3', appVersion: '0.2.2' })

test('언어를 추가하고 네임스페이스마다 한국어 사전을 등록한다', () => {
  const { plugin, warnings } = load(sample)
  const calls = []
  const context = fakeContext({
    addLanguage: (language) => { calls.push(['language', language]); return () => {} },
    register: (namespace, id, dictionary) => { calls.push([namespace, id, dictionary]); return () => {} }
  })
  const module = plugin.factory()
  assert.equal(plugin.id, '@lyngmn/dsh-korean')
  assert.deepEqual([...module.inject], ['locale'])
  module.apply(context)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['language', { id: 'ko', label: '한국어', fallback: 'en' }],
    ['chat', 'ko', { send: '보내기' }],
    ['common', 'ko', { ok: '확인' }]
  ])
  assert.equal(context.disposers.every((dispose) => typeof dispose === 'function'), true)
  assert.deepEqual(warnings, [])
})

test('한 네임스페이스 등록이 실패해도 나머지는 등록하고 경고를 남긴다', () => {
  const { plugin, warnings } = load(sample)
  const registered = []
  const context = fakeContext({
    addLanguage: () => () => {},
    register: (namespace) => {
      if (namespace === 'chat') throw new Error('duplicate')
      registered.push(namespace)
      return () => {}
    }
  })
  plugin.factory().apply(context)
  assert.deepEqual(registered, ['common'])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /chat/)
})

test('언어팩 기능이 없는 앱에서는 경고만 남기고 끝낸다', () => {
  const { plugin, warnings } = load(sample)
  assert.doesNotThrow(() => plugin.factory().apply(fakeContext({ register: () => () => {} })))
  assert.equal(warnings.length, 1)
})

const withCards = render({
  template,
  korean: { common: { ok: '확인' } },
  packages: {
    english: { 'pkg:title': 'Voice input', 'pkg:description': 'Transcribe recordings.', 'brand:title': 'DSH' },
    korean: { 'pkg:title': '음성 입력', 'pkg:description': '녹음을 받아써요.', 'brand:title': 'DSH' }
  },
  packVersion: '1.2.3',
  appVersion: '0.2.2'
})

// 앱의 언어 서비스처럼, 표에서 지금 언어 칸을 고르고 없으면 영어를 돌려준다.
class FakeLocale {
  constructor(active) { this.active = active }
  getLocale() { return { active: this.active } }
  resolveText(text) { return typeof text === 'string' ? text : text[this.active] ?? text.en }
  addLanguage() { return () => {} }
  register() { return () => {} }
}

test('한국어 화면에서 한국어 칸이 없는 플러그인 카드 문구를 한국어로 돌려준다', () => {
  const { plugin, warnings } = load(withCards)
  const locale = new FakeLocale('ko')
  const context = fakeContext(locale)
  plugin.factory().apply(context)

  assert.equal(locale.resolveText({ en: 'Voice input', zh: '语音输入' }), '음성 입력')
  assert.equal(locale.resolveText({ en: 'Transcribe recordings.' }), '녹음을 받아써요.')
  assert.equal(locale.resolveText({ en: 'Voice input', ko: '직접 넣은 한국어' }), '직접 넣은 한국어', '패키지가 한국어를 갖고 있으면 그대로 둔다')
  assert.equal(locale.resolveText({ en: 'Unknown plugin' }), 'Unknown plugin')
  assert.equal(locale.resolveText('Voice input'), 'Voice input', '표가 아닌 문자열은 건드리지 않는다')
  assert.equal(locale.resolveText({ en: 'DSH' }), 'DSH')
  assert.deepEqual(warnings, [])

  locale.active = 'zh'
  assert.equal(locale.resolveText({ en: 'Voice input', zh: '语音输入' }), '语音输入', '다른 언어 화면은 원래대로다')
  locale.active = 'en'
  assert.equal(locale.resolveText({ en: 'Voice input' }), 'Voice input')

  for (const dispose of context.disposers) dispose()
  locale.active = 'ko'
  assert.equal(locale.resolveText({ en: 'Voice input' }), 'Voice input', '언어팩을 끄면 앱의 원래 동작으로 돌아간다')
  assert.equal(Object.hasOwn(locale, 'resolveText'), false)
})

// 앱의 서비스 객체처럼, 메서드를 꺼낼 때마다 새 껍데기로 싸서 돌려준다.
function wrapped(target) {
  const proxy = new Proxy(target, {
    get(inner, property, receiver) {
      const value = Reflect.get(inner, property, receiver)
      if (typeof value !== 'function') return value
      return new Proxy(value, { apply: (method, self, args) => Reflect.apply(method, self === proxy ? inner : self, args) })
    }
  })
  return proxy
}

test('서비스가 메서드를 매번 새로 싸서 주는 앱에서도 카드 문구를 바꾸고 되돌린다', () => {
  const { plugin, warnings } = load(withCards)
  const raw = new FakeLocale('ko')
  const locale = wrapped(raw)
  const context = fakeContext(locale)
  plugin.factory().apply(context)

  assert.notEqual(locale.resolveText, locale.resolveText, '꺼낼 때마다 다른 함수여야 이 시험이 뜻이 있다')
  assert.equal(wrapped(raw).resolveText({ en: 'Voice input' }), '음성 입력', '다른 플러그인이 꺼낸 서비스에서도 바뀐다')
  assert.equal(locale.resolveText({ en: 'Voice input', zh: '语音输入' }), '음성 입력')
  assert.deepEqual(warnings, [])

  for (const dispose of context.disposers) dispose()
  assert.equal(locale.resolveText({ en: 'Voice input' }), 'Voice input')
  assert.equal(Object.hasOwn(raw, 'resolveText'), false)
})

test('카드 문구를 바꿀 수 없는 앱에서도 사전은 등록하고 경고를 남긴다', () => {
  const { plugin, warnings } = load(withCards)
  const registered = []
  const locale = Object.freeze({
    getLocale: () => ({ active: 'ko' }),
    resolveText: (text) => text.en,
    addLanguage: () => () => {},
    register: (namespace) => { registered.push(namespace); return () => {} }
  })
  plugin.factory().apply(fakeContext(locale))
  assert.deepEqual(registered, ['common'])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /plugin cards/)
})

test('글꼴 고르기를 필요한 서비스가 준비될 때만 도는 하위 플러그인으로 붙인다', () => {
  const picker = `function fontPicker(require) { return { inject: ['slots', 'theme'], apply: (inner) => { inner.applied = require('react') } } }`
  const { plugin, warnings } = load(render({ template, korean: { common: { ok: '확인' } }, fontPicker: picker, packVersion: '1.2.3', appVersion: '0.2.2' }))
  const context = fakeContext({ addLanguage: () => () => {}, register: () => () => {} })
  plugin.factory((name) => `module:${name}`).apply(context)

  assert.equal(context.plugins.length, 1)
  assert.equal(context.plugins[0].name, 'dsh-korean:font-picker')
  assert.deepEqual([...context.plugins[0].inject], ['slots', 'theme'])
  const inner = {}
  context.plugins[0].apply(inner)
  assert.equal(inner.applied, 'module:react')
  assert.deepEqual(warnings, [])
})

test('하위 플러그인을 붙일 수 없는 앱에서도 번역은 등록한다', () => {
  const { plugin, warnings } = load(sample)
  const registered = []
  const context = { locale: { addLanguage: () => () => {}, register: (namespace) => { registered.push(namespace); return () => {} } }, effect: (callback) => callback() }
  assert.doesNotThrow(() => plugin.factory().apply(context))
  assert.deepEqual(registered, ['chat', 'common'])
  assert.deepEqual(warnings, [])
})

test('lib/client.js가 지금의 ko/*.json과 틀로 만든 것과 같다', { skip: !existsSync(join(ROOT, 'lib/client.js')) }, () => {
  const result = build({ allowIncomplete: true })
  assert.equal(result.ok, true, '검사를 통과해야 빌드할 수 있습니다')
  assert.equal(readFileSync(join(ROOT, 'lib/client.js'), 'utf8'), result.output, 'node scripts/build.mjs 를 다시 실행하세요')
})
