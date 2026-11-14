import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const json = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'))

const source = readFileSync(join(ROOT, 'src/font-picker.js'), 'utf8')
// src/font-picker.js는 함수 하나만 담고 있어서, 그 함수를 꺼내 화면 없이 부른다.
const load = () => vm.runInNewContext(`${source}\nfontPicker`)
const plugin = load()(() => { throw new Error('시험에서는 모듈을 불러오지 않는다') })
const { CANDIDATES, DICTIONARIES, RECOMMENDED, applyRecommended, createDetector, createMemory, defaultLabelKey, normalize, optionsFor, platformOf } = plugin.internals
const plain = (value) => JSON.parse(JSON.stringify(value))

test('글꼴 고르기가 필요로 하는 서비스를 밝히고, 꾸러미가 테마 패키지를 먼저 불러오게 한다', () => {
  assert.deepEqual(plain(plugin.inject), ['slots', 'locale', 'theme'])
  assert.ok(json('package.json').dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-theme'))
})

test('글꼴 목록을 DSH가 저장하는 모양으로 맞춘다', () => {
  assert.equal(normalize(' Pretendard Variable ,Pretendard'), '"Pretendard Variable", "Pretendard"')
  assert.equal(normalize(`'D2Coding', monospace`), '"D2Coding", monospace')
  assert.equal(normalize(''), '')
  assert.equal(normalize(undefined), '')
  assert.equal(normalize('"><script>'), '"script"')
})

test('설치된 글꼴만 목록에 올리고 맨 앞에 기본값을 둔다', () => {
  const installed = (family) => ['Apple SD Gothic Neo', 'Pretendard'].includes(family)
  assert.deepEqual(plain(optionsFor('text', '', installed)), [
    { value: '', label: null, kind: 'default' },
    { value: '"Apple SD Gothic Neo"', label: 'Apple SD 산돌고딕 Neo', kind: 'font' },
    { value: '"Pretendard Variable", "Pretendard"', label: 'Pretendard', kind: 'font' }
  ])
  assert.deepEqual(plain(optionsFor('code', '', () => false)), [{ value: '', label: null, kind: 'default' }])
})

test('지금 쓰는 값은 설치돼 있지 않거나 목록에 없어도 보여 준다', () => {
  const none = () => false
  const removed = optionsFor('code', '"D2Coding"', none)
  assert.deepEqual(plain(removed.at(-1)), { value: '"D2Coding"', label: 'D2Coding', kind: 'font' })
  assert.equal(removed.length, 2)

  const typed = optionsFor('text', 'Comic Sans MS, sans-serif', none)
  assert.deepEqual(plain(typed.at(-1)), { value: '"Comic Sans MS", sans-serif', label: 'Comic Sans MS, sans-serif', kind: 'custom' })
  // 고른 값이 항목 가운데 정확히 하나와 같아야 선택 상자가 그 항목을 가리킨다.
  for (const [role, current] of [['text', ''], ['text', 'Pretendard Variable, Pretendard'], ['terminal', 'Menlo, D2Coding, NanumGothicCoding'], ['code', 'Nope']]) {
    const options = optionsFor(role, current, () => true)
    assert.equal(options.filter((option) => option.value === normalize(current)).length, 1, `${role}: ${current}`)
    assert.equal(new Set(options.map((option) => option.value)).size, options.length, '값이 겹치지 않는다')
  }
})

test('한글이 없는 코딩 글꼴에는 한글 고정폭 글꼴을 뒤에 붙이되, 목록에 보일지는 그 글꼴만 보고 정한다', () => {
  const only = (...names) => (family) => names.includes(family)
  const jetbrains = optionsFor('code', '', only('JetBrains Mono')).at(-1)
  assert.deepEqual(plain(jetbrains), { value: '"JetBrains Mono", "D2Coding", "NanumGothicCoding"', label: 'JetBrains Mono', kind: 'font' })
  assert.deepEqual(plain(optionsFor('code', '', only('D2Coding'))).map((option) => option.label), [null, 'D2Coding'], 'D2Coding만 있을 때 영문 글꼴이 딸려 나오지 않는다')
  assert.equal(optionsFor('terminal', '"JetBrains Mono", "D2Coding", "NanumGothicCoding"', () => false).at(-1).kind, 'font')
})

test('기본 항목은 이 기기에서 실제로 쓰이는 글꼴 이름으로 보인다', () => {
  assert.equal(platformOf({ platform: 'MacIntel' }), 'mac')
  assert.equal(platformOf({ platform: 'Win32' }), 'win')
  assert.equal(platformOf({ platform: 'Linux x86_64' }), 'other')
  assert.equal(platformOf(undefined), 'other')
  assert.equal(defaultLabelKey('text', 'mac'), 'default.text.mac')
  assert.equal(defaultLabelKey('terminal', 'win'), 'default.code.win')
  assert.equal(DICTIONARIES.ko['default.text.mac'], 'SF Pro + 산돌고딕 (기본)')
  for (const role of ['text', 'code', 'terminal']) {
    for (const platform of ['mac', 'win', 'other']) {
      const key = defaultLabelKey(role, platform)
      for (const [name, dictionary] of Object.entries(DICTIONARIES)) assert.ok(dictionary[key], `${name}: ${key}`)
    }
  }
})

test('가독성이 떨어지는 Apple 명조는 본문 후보에 없다', () => {
  assert.ok(!CANDIDATES.text.some((candidate) => candidate.families.includes('AppleMyungjo')))
})

test('후보마다 이름과 글꼴이 있고 터미널은 코드와 같은 후보를 쓴다', () => {
  assert.equal(CANDIDATES.terminal, CANDIDATES.code)
  for (const candidate of [...CANDIDATES.text, ...CANDIDATES.code]) {
    assert.ok(candidate.label.trim())
    assert.ok(candidate.families.length > 0 && candidate.families.every((family) => family === family.trim() && family !== ''))
  }
})

// 설치된 글꼴은 고유한 폭으로, 없는 글꼴은 뒤에 적힌 기본 글꼴의 폭으로 그려지는 가짜 캔버스.
function fakeCanvas(installedFonts, counter = { created: 0 }) {
  const base = { monospace: 100, 'sans-serif': 80, serif: 90 }
  return () => {
    counter.created++
    const context = {
      font: '',
      measureText() {
        const families = this.font.replace(/^72px /, '').split(',').map((name) => name.trim().replace(/"/g, ''))
        const used = families.find((name) => name in base || name in installedFonts)
        return { width: base[used] ?? installedFonts[used] }
      }
    }
    return { getContext: () => context }
  }
}

test('글자 폭으로 설치 여부를 알아보고, 기본 글꼴과 폭이 같은 글꼴도 놓치지 않는다', () => {
  const counter = { created: 0 }
  const installed = createDetector(fakeCanvas({ Pretendard: 77, Menlo: 100 }, counter))
  assert.equal(installed('Pretendard'), true)
  assert.equal(installed('Menlo'), true, 'monospace와 폭이 같아도 다른 기본 글꼴과 다르면 설치된 것이다')
  assert.equal(installed('Not A Font'), false)
  assert.equal(installed('Pretendard'), true)
  assert.equal(counter.created, 1, '캔버스는 한 번만 만든다')
})

test('캔버스를 쓸 수 없으면 설치되지 않은 것으로 본다', () => {
  const installed = createDetector(() => { throw new Error('no canvas') })
  assert.equal(installed('Pretendard'), false)
})

test('고르면 DSH 글꼴 설정에 쓰고, 설정이 바뀌면 화면에 알린다', () => {
  const calls = []
  const events = {}
  const registered = []
  let state = { fontFamilies: { text: '', code: '', terminal: '' } }
  const context = {
    theme: {
      getTheme: () => state,
      setFontFamily: (role, value) => { calls.push([role, value]) }
    },
    locale: { register: (namespace, dictionaries) => { registered.push([namespace, Object.keys(dictionaries)]); return () => {} } },
    slots: {
      inject: (name, callback) => { registered.push(['slot', name]); callback() },
      register: (definition, component) => { context.definition = definition; context.component = component; return () => {} }
    },
    on: (name, callback) => { events[name] = callback },
    effect: (callback) => { try { callback() } catch { /* 시험 환경에는 document가 없다 */ } }
  }
  const fresh = load()((name) => {
    assert.equal(name, 'react')
    return { createElement: () => null }
  })
  fresh.apply(context)

  assert.deepEqual(plain(registered), [['fontPicker', ['en', 'zh', 'ko']], ['slot', 'settings.general.item']])
  assert.equal(context.definition.id, 'font-picker')
  assert.equal(context.definition.locale, 'fontPicker')
  assert.equal(typeof context.component, 'function')

  const face = context.definition.inject()
  assert.equal(context.definition.inject(), face, '다시 그려도 같은 함수를 넘긴다')
  face.setFontFamily('text', '"Pretendard"')
  assert.deepEqual(calls, [['text', '"Pretendard"']])

  let notified = 0
  const unsubscribe = face.subscribe(() => { notified++ })
  state = { fontFamilies: { text: '"Pretendard"', code: '', terminal: '' } }
  events['theme/change']()
  assert.equal(notified, 1)
  assert.equal(face.getFamilies().text, '"Pretendard"')
  unsubscribe()
  events['theme/change']()
  assert.equal(notified, 1)
})

test('추천 글꼴은 본문 Pretendard, 코드 D2Coding, 터미널 IBM Plex Mono이고 모두 후보에 있다', () => {
  assert.deepEqual(plain(RECOMMENDED), { text: 'Pretendard', code: 'D2Coding', terminal: 'IBM Plex Mono' })
  for (const [role, label] of Object.entries(RECOMMENDED)) {
    assert.ok(CANDIDATES[role].some((candidate) => candidate.label === label), `${role}: ${label}`)
  }
})

test('처음 켤 때 기본 글꼴을 쓰는 역할만, 추천 글꼴이 설치돼 있을 때 한 번 바꾼다', () => {
  const calls = []
  const setFontFamily = (role, value) => { calls.push([role, value]) }
  const all = () => true
  const handled = applyRecommended({ families: { text: '', code: '', terminal: '' }, installed: all, setFontFamily, done: new Set() })
  assert.deepEqual(calls, [
    ['text', '"Pretendard Variable", "Pretendard"'],
    ['code', '"D2Coding"'],
    ['terminal', '"IBM Plex Mono", "D2Coding", "NanumGothicCoding"']
  ])
  assert.deepEqual(plain(handled), ['text', 'code', 'terminal'])
})

test('이미 고른 글꼴은 바꾸지 않고, 한 번 처리한 역할은 "기본"으로 돌려도 다시 바꾸지 않는다', () => {
  const calls = []
  const setFontFamily = (role, value) => { calls.push([role, value]) }
  const handled = applyRecommended({ families: { text: '"SUIT"', code: '', terminal: '' }, installed: () => true, setFontFamily, done: new Set(['code']) })
  assert.deepEqual(calls, [['terminal', '"IBM Plex Mono", "D2Coding", "NanumGothicCoding"']])
  assert.deepEqual(plain(handled), ['text', 'terminal'])
})

test('추천 글꼴이 설치돼 있지 않으면 바꾸지도 기억하지도 않아 다음에 다시 본다', () => {
  const calls = []
  const handled = applyRecommended({ families: { text: '', code: '', terminal: '' }, installed: (family) => family === 'D2Coding', setFontFamily: (...args) => calls.push(args), done: new Set() })
  assert.deepEqual(calls, [['code', '"D2Coding"']])
  assert.deepEqual(plain(handled), ['code'])
})

test('처리한 역할은 브라우저 저장소에 쌓고, 저장소가 없거나 깨져도 멈추지 않는다', () => {
  const store = new Map()
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value) } }
  const memory = createMemory(storage)
  assert.deepEqual([...memory.read()], [])
  memory.add(['text'])
  memory.add(['code', 'text'])
  assert.deepEqual([...memory.read()].sort(), ['code', 'text'])

  store.set('dsh-korean:font-picker:recommended', '{망가짐')
  assert.deepEqual([...createMemory(storage).read()], [])
  const broken = createMemory({ getItem: () => { throw new Error('막힘') }, setItem: () => { throw new Error('막힘') } })
  assert.deepEqual([...broken.read()], [])
  broken.add(['text'])
  assert.deepEqual([...createMemory(undefined).read()], [])
})

test('추천 표시 문구가 두 사전에 있다', () => {
  assert.equal(DICTIONARIES.ko.recommended, '(추천)')
  assert.equal(DICTIONARIES.en.recommended, '(recommended)')
})

test('영어·한국어 사전의 키가 같다', () => {
  const keys = (name) => [...source.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n  \\}`))[1].matchAll(/^\s+'?([\w.]+)'?:/gm)].map((match) => match[1])
  assert.deepEqual(keys('ko'), keys('en'))
  assert.equal(keys('en').length, 14)
})
