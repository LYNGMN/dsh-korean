import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { build } from '../scripts/build.mjs'
import { createStageSource, routeOf } from '../src/source.js'

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
const ReactDOM = { createPortal: node => ({ portal: node }) }

function loadBundle(facts) {
  let registered
  const sandbox = {
    window: { __ModuleLoader__: { load: entry => { registered = entry } } },
    document: { createElement: () => ({ dataset: {} }), head: { appendChild: () => {} }, visibilityState: 'visible' },
    fetch: async () => ({ ok: true, json: async () => ({ facts }) }),
    setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, encodeURIComponent, Promise, Error, Object, String,
  }
  vm.runInNewContext(build(), sandbox)
  const mod = registered.factory(name => {
    if (name === 'react') return React
    if (name === 'react-dom') return ReactDOM
    throw new Error(`unexpected require ${name}`)
  })
  return { id: registered.id, mod }
}

function slotsOf(mod) {
  const slots = {}
  mod.apply({
    slots: { inject: (_name, fn) => fn(), register: (opts, Component) => { slots[opts.name] = { opts, Component } } },
    effect: fn => { fn() },
  })
  return slots
}

const text = node => (node == null || node === false ? '' : typeof node === 'string' || typeof node === 'number' ? String(node)
  : typeof node.type === 'function' ? text(node.type(node.props))
  : node.portal ? text(node.portal)
  : [node.props?.['aria-label'] ?? '', ...(node.children ?? []).map(text)].join(' '))

const FACTS = {
  repo: true, folder: 'app', branch: 'claude/feat/x', base: 'main', isBase: false, changes: 0, ahead: 2,
  upstream: null, unpushed: 0, hadCommits: true, headTime: 1, pr: null, prError: null, tag: null,
}

function render(slot, mod, facts, todos) {
  // 시험에서는 화면이 구독하기 전에 사실을 채워 둔다(가짜 useState는 처음 값만 준다).
  const source = mod.internals.sources.get('s1') ?? null
  if (source === null) {
    slot.Component({ sessionId: 's1', useSession: s => s({ running: false }), useProjection: () => todos })
  }
  return slot.Component({ sessionId: 's1', useSession: s => s({ running: false }), useProjection: key => (key === 'todos' ? todos : undefined) })
}

test('번들은 플러그인 이름으로 등록되고 자리 서비스만 받는다', () => {
  const { id, mod } = loadBundle(FACTS)
  assert.equal(id, '@lyngmn/dsh-git-stage')
  assert.deepEqual([...mod.inject], ['slots'])
  assert.doesNotMatch(build(), /require\('@deepseek-ai/, 'Harness Client 패키지를 require하지 않는다')
})

test('보기 탭(계획 뒤)과 채팅 머리 칩 두 자리를 등록한다', () => {
  const { mod } = loadBundle(FACTS)
  const slots = slotsOf(mod)
  assert.deepEqual(Object.keys(slots).sort(), ['conversation.session.header.utilities', 'conversation.view'])
  assert.equal(slots['conversation.view'].opts.id, 'dsh-git-stage')
  assert.equal(slots['conversation.view'].opts.label(), '작업 단계')
  assert.ok(slots['conversation.view'].opts.order > 20, '계획(20) 뒤에 온다')
})

test('사실을 읽기 전에는 읽는 중이라고 쓰고 칩은 숨는다', () => {
  const { mod } = loadBundle(FACTS)
  const slots = slotsOf(mod)
  const out = text(render(slots['conversation.view'], mod, FACTS, []))
  assert.match(out, /작업 단계를 읽는 중이에요/)
  assert.equal(slots['conversation.session.header.utilities'].Component({ sessionId: 's2', useSession: s => s({}), useProjection: () => null }), null)
})

test('사실이 오면 단계 줄·지금 단계 설명·다음 할 일·지금 하는 일을 그린다', async () => {
  const { mod } = loadBundle(FACTS)
  const slots = slotsOf(mod)
  render(slots['conversation.view'], mod, FACTS, [])
  await mod.internals.sources.get('s1').refresh()
  const todos = [{ content: 'npm test 돌리기', status: 'completed' }, { content: 'PR 열기', status: 'in_progress' }]
  const out = text(render(slots['conversation.view'], mod, FACTS, todos))
  assert.match(out, /공유 단계 · 3\/6 · 승인 필요/)
  assert.match(out, /4단계 공유\(푸시·PR\) 자세히/)
  assert.match(out, /4\s+공유\s+승인 필요/)
  assert.match(out, /승인하면 GitHub에 올리고/)
  assert.match(out, /지금 하는 일\s+PR 열기/)
  assert.match(out, /app · claude\/feat\/x/)
  const chip = text(slots['conversation.session.header.utilities'].Component({ sessionId: 's1', useSession: s => s({}), useProjection: () => todos }))
  assert.match(chip, /작업 단계 공유 단계 · 3\/6 · 승인 필요/)
})

test('createStageSource는 보는 화면이 있을 때만 주기적으로 읽고, 실패는 오류 코드로 남긴다', async () => {
  let loads = 0
  let tick = null
  let stopped = 0
  const source = createStageSource({
    load: async () => { loads += 1; if (loads === 2) throw Object.assign(new Error('x'), { code: 404 }); return { repo: false } },
    every: (fn) => { tick = fn; return () => { stopped += 1 } },
  })
  const off = source.subscribe(() => {})
  await source.refresh()
  assert.equal(loads, 1, '구독할 때 한 번, 진행 중인 읽기는 겹치지 않는다')
  tick()
  await new Promise(r => setTimeout(r, 0))
  assert.equal(source.getSnapshot().error, '404')
  assert.deepEqual(source.getSnapshot().facts, { repo: false }, '실패해도 지난 사실은 남긴다')
  off()
  assert.equal(stopped, 1)
  assert.equal(routeOf('a b'), 'api/dsh-git-stage?sessionId=a%20b')
})
