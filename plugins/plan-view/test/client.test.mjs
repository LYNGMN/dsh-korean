import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { build } from '../scripts/build.mjs'
import { foldTodoEvent } from '../src/todo-history.js'
import { createViewBuilder, historyNodeOf } from '../src/view-builder.js'
import { planNodeOf } from '../src/plan.js'

// 가짜 React: 컴포넌트를 함수로 불러 나온 나무만 본다. 훅은 처음 값만 돌려준다.
let ids = 0
const Fragment = Symbol('Fragment')
const React = {
  Fragment,
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: init => [typeof init === 'function' ? init() : init, () => {}],
  useRef: init => ({ current: init ?? null }),
  useEffect: () => {},
  useId: () => `id${++ids}`,
}
const ReactDOM = { createPortal: (node) => ({ portal: node }) }

function loadBundle() {
  let registered
  const warnings = []
  const sandbox = {
    window: { __ModuleLoader__: { load: entry => { registered = entry } } },
    console: { warn: message => warnings.push(message) },
    document: { createElement: () => ({ dataset: {} }), head: { appendChild: () => {} } },
    setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, Intl,
  }
  vm.runInNewContext(build(), sandbox)
  const mod = registered.factory(name => {
    if (name === 'react') return React
    if (name === 'react-dom') return ReactDOM
    throw new Error(`unexpected require ${name}`)
  })
  return { id: registered.id, mod, warnings }
}

const at = turn => ({ kind: 'step', turn: { turn }, step: { step: 1 } })
const write = (seq, time, turn, todos) => ({
  event: { type: 'todo/write', seq, time, data: { todos: todos.map(([content, status]) => ({ content, status })) } },
  location: at(turn),
})

function snapshotOf({ plans = [], matches = [] }) {
  const state = matches.reduce((s, m) => foldTodoEvent(s, m), undefined)
  const nodes = plans.map(plan => planNodeOf({ key: plan.callId, id: plan.callId, state: plan }))
  const history = historyNodeOf({ key: 'h', id: 'history', state })
  if (history) nodes.push(history)
  return createViewBuilder().replace({ nodes })
}

function fakeCtx(snapshot) {
  const slots = {}
  const events = []
  const views = []
  const ctx = {
    slots: {
      inject: (_name, fn) => fn(),
      register: (opts, Component) => { slots[opts.name] = { opts, Component } },
    },
    uiConversation: {
      events: { register: definition => { events.push(definition); return () => {} } },
      views: { register: definition => { views.push(definition); return () => {} } },
      binding: () => ({ target: () => ({ getSnapshot: () => snapshot, subscribe: () => () => {} }) }),
    },
    effect: (fn) => { fn() },
  }
  return { ctx, slots, events, views }
}

const text = node => (node == null || node === false ? '' : typeof node === 'string' || typeof node === 'number' ? String(node)
  : typeof node.type === 'function' ? text(node.type(node.props))
  : node.portal ? text(node.portal)
  : [node.props?.['aria-label'] ?? '', node.props?.['aria-valuetext'] ?? '', node.props?.text ?? '', ...(node.children ?? []).map(text)].join(' '))

// 계획 카드 한 장의 글자만 고른다(같은 문자열이 다른 칸에도 있으므로).
function planCardText(tree, title) {
  const cards = []
  const walk = node => {
    if (node == null || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (typeof node.type === 'function') return walk(node.type(node.props))
    if (node.portal) return walk(node.portal)
    if (typeof node.props?.className === 'string' && node.props.className.split(' ').includes('dpv-plan')) cards.push(text(node))
    ;(node.children ?? []).forEach(walk)
  }
  walk(tree)
  return cards.find(card => card.includes(title)) ?? ''
}

function render(slot, { projection, running = true, inspectCall } = {}) {
  const injected = slot.opts.inject('s1')
  return slot.Component({
    useProjection: key => (key === 'todos' ? projection : undefined),
    usePlanState: select => select(injected.hooks.planState.getSnapshot()),
    useSession: select => select({ running }),
    inspectCall,
  })
}

const PLAN = { callId: 'p1', seq: 1, turn: 1, title: '로그인 고치기', markdown: '# 로그인 고치기\n\n- 구조 읽기\n- 탭 만들기' }
const MATCHES = [
  // 계획(seq 1)보다 앞선 턴의 목록이라 이 계획의 실행 기록으로 세지 않는다.
  write(0, 1000, 1, [['옛 일', 'completed']]),
  write(3, 2000, 2, [['구조 읽기', 'in_progress'], ['탭 만들기', 'pending']]),
  write(4, 62000, 2, [['구조 읽기', 'completed'], ['탭 만들기', 'in_progress']]),
]

test('번들은 플러그인 이름으로 등록되고 자리·대화 서비스를 받는다', () => {
  const { id, mod } = loadBundle()
  assert.equal(id, '@lyngmn/dsh-plan-view')
  assert.deepEqual([...mod.inject], ['slots', 'uiConversation'])
})

test('보기 탭과 채팅 머리 칩 두 자리, 이벤트 정의 둘, 보기 대상 하나를 등록한다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({}))
  mod.apply(f.ctx)
  assert.deepEqual(Object.keys(f.slots).sort(), ['conversation.session.header.utilities', 'conversation.view'])
  const view = f.slots['conversation.view']
  assert.equal(view.opts.id, 'dsh-plan-view')
  assert.equal(view.opts.label(), '계획')
  assert.ok(view.opts.order > 10, '실행 흐름(10) 뒤에 온다')
  assert.deepEqual(f.events.map(d => d.kind).sort(), ['dsh-plan-view.plan', 'dsh-plan-view.todos'])
  assert.ok(f.events.every(d => d.target === 'dsh-plan-view'))
  assert.deepEqual(f.views.map(v => v.target), ['dsh-plan-view'])
  const history = f.events.find(d => d.kind === 'dsh-plan-view.todos')
  // 번들은 다른 vm 영역에서 돌아 객체 원형이 달라서, 이 영역의 객체로 옮겨 비교한다.
  assert.deepEqual({ ...history.match(MATCHES[0].event) }, { id: 'history', role: 'start' })
  const folded = history.update({ state: history.start({}, MATCHES[0]) }, MATCHES[1])
  assert.equal(folded.writes.length, 2)
})

test('계획 노드는 제출된 턴을 함께 남겨 실행 범위를 가릴 수 있게 한다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({}))
  mod.apply(f.ctx)
  const planDef = f.events.find(d => d.kind === 'dsh-plan-view.plan')
  const event = { type: 'tool/call', seq: 9, data: { name: 'exit_plan_mode', callId: 'c9', arguments: JSON.stringify({ plan: '# 턴 계획' }) } }
  const state = planDef.start({}, { event, location: at(3) })
  assert.equal(state.turn, 3)
  assert.equal(state.callId, 'c9')
})

test('탭은 진행 막대·체크·경과 시간·지난 턴·계획 단계 체크를 보여 준다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({ plans: [PLAN], matches: MATCHES }))
  mod.apply(f.ctx)
  const out = text(render(f.slots['conversation.view'], { projection: [] }))
  assert.match(out, /할 일/)
  assert.match(out, /1\/2 완료/)
  assert.match(out, /2개 중 1개 완료/, '진행 막대 값')
  assert.match(out, /구조 읽기\s*, 완료\s*1분/)
  assert.match(out, /탭 만들기\s*, 진행 중\s*[^,]*째/)
  assert.match(out, /지난 할 일/)
  assert.match(out, /턴 1/)
  assert.match(out, /계획 뒤 할 일 1\/2 완료/)
  assert.match(out, /완료: \s*구조 읽기/, '계획 문서 단계가 체크된다')
  assert.match(out, /대기: \s*탭 만들기/)
  assert.doesNotMatch(out, /직전 턴 목록/)
})

test('새 턴에 투영이 비면 직전 목록을 이어 보여 주고, 멈춘 세션은 "멈춤"으로 쓴다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({ matches: MATCHES }))
  mod.apply(f.ctx)
  const out = text(render(f.slots['conversation.view'], { projection: null, running: false }))
  assert.match(out, /직전 턴 목록/)
  assert.match(out, /멈춤/)
})

test('채팅 머리 칩은 진행을 보여 주고, 할 일이 없으면 그리지 않는다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({ matches: MATCHES }))
  mod.apply(f.ctx)
  const chip = f.slots['conversation.session.header.utilities']
  const out = text(render(chip, { projection: [] }))
  assert.match(out, /계획 진행 1\/2, 진행 중/)
  const empty = fakeCtx(snapshotOf({}))
  mod.apply(empty.ctx)
  assert.equal(render(empty.slots['conversation.session.header.utilities'], { projection: null }), null)
})

test('기록이 아직 없으면 투영 목록을 쓴다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({}))
  mod.apply(f.ctx)
  const out = text(render(f.slots['conversation.session.header.utilities'], { projection: [{ content: '가', status: 'completed' }] }))
  assert.match(out, /계획 진행 1\/1/)
})

test('비어 있으면 안내 문구를 내고, DSH 공용 부품을 불러오지 않는다', () => {
  const { mod, warnings } = loadBundle()
  const f = fakeCtx(snapshotOf({}))
  mod.apply(f.ctx)
  const out = text(render(f.slots['conversation.view'], { projection: null }))
  assert.match(out, /아직 할 일 목록이 없어요/)
  assert.match(out, /\/plan으로 계획을 만들면/)
  assert.equal(warnings.length, 0)
})

// 계획 문서의 줄과 할 일 문구가 달라도, "이 계획 뒤 할 일"이 얼마나 끝났는지는 보여 준다.
const LONG_PLAN = {
  callId: 'p3', seq: 10, turn: 1, title: '긴 계획',
  markdown: '# 긴 계획\n\n## A. RSS 파서 (`12_RSSService.gs`)\n\n- `media:starRating@count`를 좋아요로 옮기고 빈칸을 채운다\n- 설명 승격 규칙을 정리한다\n',
}

test('계획 줄과 문구가 달라 체크가 없어도, 계획 뒤 할 일이 모두 끝났으면 완료로 보여 준다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({
    plans: [LONG_PLAN],
    matches: [write(11, 1000, 1, [['RSS 파서 정리', 'completed'], ['회귀 테스트', 'completed']])],
  }))
  mod.apply(f.ctx)
  const out = text(render(f.slots['conversation.view'], { projection: null }))
  assert.match(out, /모두 완료/)
  assert.match(out, /계획 뒤 할 일 2개를 모두 끝냈어요/)
  assert.doesNotMatch(out, /단계 \d+\/\d+/, '짝이 없으면 단계 수를 말하지 않는다')
})

test('일부만 끝났으면 진행 수치만 보여 주고 완료 배지는 붙이지 않는다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({
    plans: [LONG_PLAN],
    matches: [write(11, 1000, 1, [['RSS 파서 정리', 'completed'], ['회귀 테스트', 'in_progress']])],
  }))
  mod.apply(f.ctx)
  const card = planCardText(render(f.slots['conversation.view'], { projection: null }), '긴 계획')
  assert.match(card, /할 일 1\/2/, '계획 카드 머리에 진행 수치가 붙는다')
  assert.match(card, /계획 뒤 할 일 1\/2 완료/)
  assert.doesNotMatch(card, /모두 완료/)
})

test('계획 뒤에 남은 할 일 기록이 없으면 그 사실을 알린다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({
    plans: [LONG_PLAN],
    matches: [write(5, 1000, 0, [['계획 전 할 일', 'completed']])],
  }))
  mod.apply(f.ctx)
  const out = text(render(f.slots['conversation.view'], { projection: null }))
  assert.match(out, /계획 뒤에 남긴 할 일 기록이 없어/)
  assert.doesNotMatch(out, /모두 완료/)
  assert.doesNotMatch(out, /할 일 0\/0/)
})

test('계획을 실행한 턴과 바로 다음 턴의 할 일만 세고, 뒤에 온 새 요청은 세지 않는다', () => {
  const { mod } = loadBundle()
  // 계획(턴 1) → 같은 턴 실행 → 승인 뒤 턴 2 실행 → 한참 뒤 턴 5의 다른 요청
  const f = fakeCtx(snapshotOf({
    plans: [LONG_PLAN],
    matches: [
      write(11, 1000, 1, [['RSS 파서 정리', 'completed']]),
      write(12, 2000, 2, [['RSS 파서 정리', 'completed'], ['회귀 테스트', 'completed']]),
      write(50, 3000, 5, [['다른 요청 일', 'pending']]),
    ],
  }))
  mod.apply(f.ctx)
  const card = planCardText(render(f.slots['conversation.view'], { projection: null }), '긴 계획')
  assert.match(card, /계획 뒤 할 일 2개를 모두 끝냈어요/)
  assert.doesNotMatch(card, /3개/)
  assert.doesNotMatch(card, /할 일 2\/3/)
})

test('옛 계획은 다음 계획을 실행한 할 일을 자기 것으로 세지 않는다', () => {
  const oldPlan = { callId: 'old', seq: 10, turn: 1, title: '옛 계획', markdown: '# 옛 계획\n\n- 옛 작업' }
  const newPlan = { callId: 'new', seq: 30, turn: 3, title: '새 계획', markdown: '# 새 계획\n\n- 새 작업' }
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({
    plans: [oldPlan, newPlan],
    matches: [
      write(11, 1000, 1, [['옛 작업', 'completed']]),
      write(31, 2000, 3, [['새 작업', 'completed']]),
      write(32, 3000, 4, [['새 작업', 'completed'], ['새 뒤 작업', 'pending']]),
    ],
  }))
  mod.apply(f.ctx)
  const tree = render(f.slots['conversation.view'], { projection: null })
  const oldCard = planCardText(tree, '옛 계획')
  const newCard = planCardText(tree, '새 계획')
  assert.match(oldCard, /계획 뒤 할 일 1개를 모두 끝냈어요/)
  assert.doesNotMatch(oldCard, /2\/2/, '다음 계획의 실행 기록을 세지 않는다')
  assert.match(newCard, /할 일 1\/2/)
  assert.doesNotMatch(newCard, /모두 완료/)
})

test('턴을 모르는 옛 계획은 seq만으로 실행 기록을 고른다', () => {
  const old = { callId: 'old', seq: 10, title: '옛 계획', markdown: '# 옛 계획' }
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({ plans: [old], matches: [write(11, 1000, 4, [['옛 작업', 'completed']])] }))
  mod.apply(f.ctx)
  const card = planCardText(render(f.slots['conversation.view'], { projection: null }), '옛 계획')
  assert.match(card, /계획 뒤 할 일 1개를 모두 끝냈어요/)
})

test('계획 문서는 원문 표시 없이 제목·굵게·코드·목록 요소로 그린다', () => {
  const plan = { callId: 'p2', seq: 1, title: '마크다운 고치기', markdown: '# 마크다운 고치기\n\n**배경**: `MarkdownText`가 없어요.\n\n## 단계\n\n1. 해석기 만들기\n2. 스타일 맞추기\n\n| 파일 | 할 일 |\n|---|---|\n| a.js | 고침 |' }
  const { mod } = loadBundle()
  const f = fakeCtx(snapshotOf({ plans: [plan] }))
  mod.apply(f.ctx)
  const tree = render(f.slots['conversation.view'], { projection: null })
  const tags = new Set()
  const walk = node => {
    if (node == null || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (typeof node.type === 'function') return walk(node.type(node.props))
    if (node.portal) return walk(node.portal)
    if (typeof node.type === 'string') tags.add(node.type)
    ;(node.children ?? []).forEach(walk)
  }
  walk(tree)
  for (const tag of ['h3', 'strong', 'code', 'ol', 'li', 'table', 'th', 'td']) assert.ok(tags.has(tag), `${tag} 요소가 있다`)
  assert.ok(!tags.has('h4'), '요약 줄과 같은 첫 제목은 빼고, 남은 가장 얕은 제목을 h3로 맞춘다')
  const out = text(tree)
  assert.doesNotMatch(out, /\*\*|^#|\n#|\|---/)
  assert.match(out, /배경/)
})
