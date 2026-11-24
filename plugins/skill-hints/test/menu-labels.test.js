// `/` 메뉴의 "사용자 전용 · " 표시 숨기기 시험. MenuView 줄 모양만 흉내 낸 작은 DOM으로 돌린다.
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

test('메뉴 안 스킬 줄만 고친다', () => {
  const { cleanMenu } = testing()
  const skill = row('skill', 0, '사용자 전용 · 계획을 세운다')
  const modelSkill = row('skill', 1, 'AI도 부를 수 있는 스킬')
  const command = row('command', 0, '사용자 전용 · 명령 설명')
  const outside = row('skill', 2, '사용자 전용 · 메뉴 밖 글')
  const card = new El('div', {}, [
    new El('div', { 'data-trigger-menu': '' }, [new El('div', { role: 'listbox' }, [skill, modelSkill, command])]),
    outside,
  ])
  assert.equal(cleanMenu(card), 1)
  assert.equal(descriptionOf(skill), '계획을 세운다')
  assert.equal(descriptionOf(modelSkill), 'AI도 부를 수 있는 스킬')
  assert.equal(descriptionOf(command), '사용자 전용 · 명령 설명', '스킬이 아닌 묶음은 손대지 않는다')
  assert.equal(descriptionOf(outside), '사용자 전용 · 메뉴 밖 글', '메뉴 밖은 손대지 않는다')
  assert.equal(cleanMenu(card), 0, '두 번 고치지 않는다')
})

test('글자 사이에 다른 요소가 낀 칸은 건너뛴다', () => {
  const { cleanMenu } = testing()
  const mixed = new El('button', { role: 'option', id: 'dsh-slash-option-skill-0' }, [
    new El('span', {}, ['사용자 전용 · ', new El('mark', {}, ['강조'])]),
  ])
  assert.equal(cleanMenu(new El('div', {}, [new El('div', { 'data-trigger-menu': '' }, [mixed])])), 0)
})
