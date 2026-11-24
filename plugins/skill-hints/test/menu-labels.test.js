// `/` 메뉴 스킬 줄 표시 시험("사용자 전용 · " 지우기, "AI 호출 가능 · " 붙이기). MenuView 줄 모양만 흉내 낸 작은 DOM으로 돌린다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT = readFileSync(join(here, '..', 'client.js'), 'utf8')

class Text {
  constructor(value) { this.nodeType = 3; this.nodeValue = value }
}
class El {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase()
    this.attrs = attrs
    this.childNodes = children.map((c) => (typeof c === 'string' ? new Text(c) : c))
  }
  get children() { return this.childNodes.filter((c) => c instanceof El) }
  get firstChild() { return this.childNodes[0] ?? null }
  get textContent() { return this.childNodes.map((c) => (c instanceof El ? c.textContent : c.nodeValue)).join('') }
  * descendants() {
    for (const c of this.children) { yield c; yield * c.descendants() }
  }
  matches(selector) {
    if (selector === '[data-trigger-menu]') return 'data-trigger-menu' in this.attrs
    if (selector === '[role="option"][id^="dsh-slash-option-skill-"]') {
      return this.attrs.role === 'option' && String(this.attrs.id ?? '').startsWith('dsh-slash-option-skill-')
    }
    throw new Error(`흉내 DOM이 모르는 선택자: ${selector}`)
  }
  querySelectorAll(selector) { return [...this.descendants()].filter((el) => el.matches(selector)) }
}

const row = (source, index, description) => new El('button', { role: 'option', id: `dsh-slash-option-${source}-${index}` }, [
  new El('span', {}, [`/${source}-${index}`]),
  new El('span', {}, [description]),
])
const descriptionOf = (r) => r.children[1].firstChild.nodeValue

function testing() {
  let registered
  const React = { createElement: () => null, useState: (v) => [v, () => {}], useRef: () => ({ current: null }), useEffect: () => {} }
  vm.runInNewContext(CLIENT, { window: { __ModuleLoader__: { load: (entry) => { registered = entry } } } })
  return registered.factory(() => React).apply.testing
}

test('사용자 전용 표시만 떼고 나머지 설명은 그대로', () => {
  const { stripUserOnly, USER_ONLY_LABELS } = testing()
  assert.equal(stripUserOnly('사용자 전용 · 계획을 세운다'), '계획을 세운다')
  assert.equal(stripUserOnly('user-only · Write a plan'), 'Write a plan')
  for (const label of USER_ONLY_LABELS) assert.equal(stripUserOnly(`${label} · x`), 'x', label)
  assert.equal(stripUserOnly('계획을 세운다'), null, '표시 없는 설명')
  assert.equal(stripUserOnly('설명 중간의 사용자 전용 · 은 둔다'), null)
  assert.equal(stripUserOnly('사용자 전용'), null, '구분점 없이 이 말만 있으면 설명일 수 있다')
  assert.equal(stripUserOnly(undefined), null)
})

test('설명 원문을 메뉴 글로: 사용자 전용은 떼고 나머지는 AI 표시를 붙인다', () => {
  const { relabel } = testing()
  assert.equal(relabel('사용자 전용 · 계획을 세운다', 'ko'), '계획을 세운다')
  assert.equal(relabel('Use when debugging', 'ko'), 'AI 호출 가능 · Use when debugging')
  assert.equal(relabel('Use when debugging', 'en'), 'AI-callable · Use when debugging')
  assert.equal(relabel('Use when debugging', 'fr'), 'AI-callable · Use when debugging', '모르는 언어는 영어')
  assert.equal(relabel('Use when debugging', 'ko', '원인부터 찾는 디버깅'), 'AI 호출 가능 · 원인부터 찾는 디버깅', '한국어 요약이 있으면 그것을 보인다')
  assert.equal(relabel('Use when debugging', 'ko', ''), 'AI 호출 가능 · Use when debugging', '빈 요약은 원문')
  assert.equal(relabel('사용자 전용 · 계획을 세운다', 'ko', '다른 글'), '계획을 세운다', '사용자 전용 줄은 요약을 쓰지 않는다')
})

function menuCard() {
  const userOnly = row('skill', 0, '사용자 전용 · 계획을 세운다')
  const modelSkill = row('skill', 1, 'Use when debugging')
  const command = row('command', 0, '사용자 전용 · 명령 설명')
  const outside = row('skill', 2, '사용자 전용 · 메뉴 밖 글')
  const card = new El('div', {}, [
    new El('div', { 'data-trigger-menu': '' }, [new El('div', { role: 'listbox' }, [userOnly, modelSkill, command])]),
    outside,
  ])
  return { card, userOnly, modelSkill, command, outside }
}

test('메뉴 안 스킬 줄만 고친다', () => {
  const { cleanMenu } = testing()
  const { card, userOnly, modelSkill, command, outside } = menuCard()
  assert.equal(cleanMenu(card, 'ko'), 2)
  assert.equal(descriptionOf(userOnly), '계획을 세운다')
  assert.equal(descriptionOf(modelSkill), 'AI 호출 가능 · Use when debugging')
  assert.equal(descriptionOf(command), '사용자 전용 · 명령 설명', '스킬이 아닌 묶음은 손대지 않는다')
  assert.equal(descriptionOf(outside), '사용자 전용 · 메뉴 밖 글', '메뉴 밖은 손대지 않는다')
  assert.equal(cleanMenu(card, 'ko'), 0, '두 번 고치지 않는다(뗀 설명에 AI 표시를 붙이지 않는다)')
  assert.equal(descriptionOf(userOnly), '계획을 세운다')
})

test('DSH가 원문을 다시 쓰면 그 원문으로 다시 고친다', () => {
  const { cleanMenu } = testing()
  const { card, userOnly, modelSkill } = menuCard()
  cleanMenu(card, 'ko')
  userOnly.children[1].firstChild.nodeValue = '사용자 전용 · 계획을 세운다'
  modelSkill.children[1].firstChild.nodeValue = 'Use when testing'
  assert.equal(cleanMenu(card, 'ko'), 2)
  assert.equal(descriptionOf(userOnly), '계획을 세운다')
  assert.equal(descriptionOf(modelSkill), 'AI 호출 가능 · Use when testing')
  // 같은 칸을 DSH가 다른 스킬 줄로 다시 쓸 때(사용자 전용 칸에 AI 스킬 원문)
  userOnly.children[1].firstChild.nodeValue = 'Use when reviewing'
  cleanMenu(card, 'ko')
  assert.equal(descriptionOf(userOnly), 'AI 호출 가능 · Use when reviewing')
})

test('언어가 바뀌면 AI 표시만 그 언어로 바꾸고 겹치지 않는다', () => {
  const { cleanMenu } = testing()
  const { card, userOnly, modelSkill } = menuCard()
  cleanMenu(card, 'en')
  assert.equal(descriptionOf(modelSkill), 'AI-callable · Use when debugging')
  assert.equal(cleanMenu(card, 'ko'), 1)
  assert.equal(descriptionOf(modelSkill), 'AI 호출 가능 · Use when debugging')
  assert.equal(descriptionOf(userOnly), '계획을 세운다')
})

test('AI 스킬 줄은 이름으로 찾은 한국어 요약을 보이고, 요약이 늦게 와도 바꾼다', () => {
  const { cleanMenu } = testing()
  const { card, userOnly, modelSkill } = menuCard()
  cleanMenu(card, 'ko')
  assert.equal(descriptionOf(modelSkill), 'AI 호출 가능 · Use when debugging')
  const labels = { 'skill-1': '원인부터 찾는 디버깅 · [증상]', 'skill-0': '쓰이면 안 됨' }
  assert.equal(cleanMenu(card, 'ko', labels), 1)
  assert.equal(descriptionOf(modelSkill), 'AI 호출 가능 · 원인부터 찾는 디버깅 · [증상]')
  assert.equal(descriptionOf(userOnly), '계획을 세운다')
  assert.equal(cleanMenu(card, 'ko', labels), 0)
  const slashed = row('skill', 3, 'Use when x')
  slashed.children[0].childNodes[0].nodeValue = '/x-skill'
  const card2 = new El('div', {}, [new El('div', { 'data-trigger-menu': '' }, [slashed])])
  cleanMenu(card2, 'ko', { 'x-skill': '엑스' })
  assert.equal(descriptionOf(slashed), 'AI 호출 가능 · 엑스', '이름 앞 / 는 떼고 찾는다')
})

test('설명 칸이 없거나 모양이 다른 줄은 건너뛴다', () => {
  const { cleanMenu } = testing()
  const nameOnly = new El('button', { role: 'option', id: 'dsh-slash-option-skill-0' }, [new El('span', {}, ['/a'])])
  const mixed = new El('button', { role: 'option', id: 'dsh-slash-option-skill-1' }, [
    new El('span', {}, ['/b']),
    new El('span', {}, ['사용자 전용 · ', new El('mark', {}, ['강조'])]),
  ])
  const withIcon = new El('button', { role: 'option', id: 'dsh-slash-option-skill-2' }, [
    new El('span', {}, [new El('svg')]),
    new El('span', {}, ['/c']),
    new El('span', {}, ['Use when c']),
  ])
  const card = new El('div', {}, [new El('div', { 'data-trigger-menu': '' }, [nameOnly, mixed, withIcon])])
  assert.equal(cleanMenu(card, 'ko'), 0)
  assert.equal(descriptionOf(withIcon), '/c', '아이콘이 앞에 있으면 어느 칸이 이름인지 몰라 손대지 않는다')
})
