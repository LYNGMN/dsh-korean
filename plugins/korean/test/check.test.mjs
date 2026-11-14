import assert from 'node:assert/strict'
import test from 'node:test'
import { check, inconsistencies, summarize } from '../scripts/check.mjs'

const glossary = {
  terms: [
    { en: 'session', ko: '세션' },
    { en: 'tool call', ko: '도구 호출' },
    { en: 'turn', ko: '턴', enforce: false }
  ],
  keep: ['DSH', 'JSON'],
  verbatimKeys: { cmd: ['token.goal'] }
}

const rulesFor = (english, korean, options = {}) =>
  check({ english: { ns: english }, korean: { ns: korean }, glossary, ...options }).issues.map((issue) => issue.rule)

test('올바른 번역은 문제 없이 통과한다', () => {
  const { issues, progress } = check({
    english: { ns: { save: 'Save', open: 'Open {name}', 'n.one': '{count} session', 'n.other': '{count} sessions', sep: '', fmt: 'JSON' } },
    korean: { ns: { save: '저장', open: '{name} 열기', 'n.one': '세션 {count}개', 'n.other': '세션 {count}개', sep: '', fmt: 'JSON' } },
    glossary
  })
  assert.deepEqual(issues, [])
  assert.deepEqual(summarize(progress), { total: 6, done: 6, percent: 100, rows: [['ns', { total: 6, done: 6 }]] })
})

test('빠진 키와 원문에 없는 키를 잡는다', () => {
  assert.deepEqual(rulesFor({ a: 'Add', b: 'Back' }, { a: '추가', c: '닫기' }), ['unknown-key', 'missing-key'])
})

test('원문에 없는 네임스페이스를 잡는다', () => {
  const { issues } = check({ english: {}, korean: { ghost: { a: '가' } }, glossary })
  assert.deepEqual(issues.map((issue) => issue.rule), ['unknown-namespace'])
})

test('플레이스홀더 이름이나 개수가 다르면 잡는다', () => {
  assert.deepEqual(rulesFor({ a: 'Open {name}' }, { a: '{path} 열기' }), ['placeholder'])
  assert.deepEqual(rulesFor({ a: '{a} of {b}' }, { a: '{b} 중 {a}' }), [])
  assert.deepEqual(rulesFor({ a: '{a} and {a}' }, { a: '{a}' }), ['placeholder'])
})

test('빈 값, 보이지 않는 문자, 줄표, 앞뒤 공백 차이를 잡는다', () => {
  assert.deepEqual(rulesFor({ a: 'Save' }, { a: '' }), ['empty'])
  assert.deepEqual(rulesFor({ a: 'Save' }, { a: '저​장' }), ['invisible-character'])
  assert.deepEqual(rulesFor({ a: 'Saved, then closed' }, { a: '저장 — 닫음' }), ['dash'])
  assert.deepEqual(rulesFor({ a: 'Size: ' }, { a: '크기:' }), ['edge-space'])
})

test('한글이 없는 값은 허용 목록에 있을 때만 통과한다', () => {
  assert.deepEqual(rulesFor({ a: 'Context window' }, { a: 'Context window' }), ['untranslated'])
  assert.deepEqual(rulesFor({ a: 'DSH {version}', b: '{n}%', c: 'OK' }, { a: 'DSH {version}', b: '{n}%', c: 'OK' }, { sameInEveryLanguage: { ns: ['c'] } }), [])
  const { issues } = check({ english: { cmd: { 'token.goal': 'goal' } }, korean: { cmd: { 'token.goal': 'goal' } }, glossary })
  assert.deepEqual(issues, [])
})

test('용어집과 다른 번역어를 잡되, 강제하지 않는 용어는 넘어간다', () => {
  assert.deepEqual(rulesFor({ a: 'Delete sessions' }, { a: '대화 삭제' }), ['glossary'])
  assert.deepEqual(rulesFor({ a: '3 tool-calls' }, { a: '도구 호출 3회' }), [])
  assert.deepEqual(rulesFor({ a: 'Turn on' }, { a: '켜기' }), [])
  assert.deepEqual(rulesFor({ a: 'Obsession' }, { a: '집착' }), [])
  assert.deepEqual(rulesFor({ a: 'Delete {session}?' }, { a: '{session} 삭제할까요?' }), [])
})

test('작업 중 모드에서는 빠진 키를 넘기되 복수형 짝이 깨진 것은 잡는다', () => {
  const english = { a: 'Add', 'n.one': '{count} file', 'n.other': '{count} files' }
  assert.deepEqual(rulesFor(english, {}, { allowIncomplete: true }), [])
  assert.deepEqual(rulesFor(english, { 'n.one': '파일 {count}개' }, { allowIncomplete: true }), ['plural-pair'])
})

test('같은 원문을 다르게 옮긴 곳을 모아 준다', () => {
  const found = inconsistencies({
    english: { a: { x: 'Retry', y: 'Close' }, b: { z: 'Retry', w: 'Close' } },
    korean: { a: { x: '다시 시도', y: '닫기' }, b: { z: '재시도', w: '닫기' } }
  })
  assert.deepEqual(found, [{ original: 'Retry', variants: { '다시 시도': ['a/x'], '재시도': ['b/z'] } }])
})

test('플러그인 카드 문구도 같은 규칙으로 검사하고, 같은 원문을 다르게 옮기면 잡는다', () => {
  const run = (korean) => check({
    english: {},
    korean: {},
    packages: { english: { 'a:title': 'Session search', 'b:title': 'Session search', 'a:description': 'Run {n} tool calls.' }, korean },
    glossary
  }).issues.map((issue) => `${issue.rule} ${issue.key}`)

  assert.deepEqual(run({ 'a:title': '세션 검색', 'b:title': '세션 검색', 'a:description': '도구 호출 {n}개를 실행해요.' }), [])
  assert.deepEqual(run({ 'a:title': '세션 검색', 'b:title': '세션 찾기', 'a:description': '도구 호출 {n}개를 실행해요.' }), ['package-conflict b:title'])
  assert.deepEqual(run({ 'a:title': '대화 검색', 'a:description': '도구 호출을 실행해요.' }), ['glossary a:title', 'missing-key b:title', 'placeholder a:description'])
})

test('앱 본체 문구도 검사하고, 문장 조각으로 등록한 키만 빈 값과 공백 차이를 허용한다', () => {
  const run = (fragments) => check({
    english: {},
    korean: {},
    desktop: { english: { before: 'Welcome to ', after: '', quit: 'Quit' }, korean: { before: '', after: '에 오신 것을 환영해요', quit: '종료' } },
    glossary: { ...glossary, fragments }
  }).issues.map((issue) => `${issue.rule} ${issue.namespace}/${issue.key}`)

  assert.deepEqual(run({ '@desktop': ['before', 'after'] }), [])
  assert.deepEqual(run({}), ['empty @desktop/before', 'edge-space @desktop/before'])
})
