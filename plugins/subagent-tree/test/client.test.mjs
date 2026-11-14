import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { build } from '../scripts/build.mjs'

// 가짜 React: 컴포넌트를 함수로 불러 나온 나무만 본다. 훅은 지금 값만 돌려준다.
const Fragment = Symbol('Fragment')
const React = {
  Fragment,
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useSyncExternalStore: (_subscribe, get) => get(),
  useState: init => [init, () => {}],
  useRef: () => ({ current: null }),
  useEffect: () => {},
  useLayoutEffect: () => {},
}
const ReactDOM = { createPortal: (node, box) => ({ portal: node, box }) }

function loadBundle() {
  let registered
  const sandbox = {
    window: { __ModuleLoader__: { load: entry => { registered = entry } } },
    console,
  }
  vm.runInNewContext(build(), sandbox)
  const mod = registered.factory(name => ({ react: React, 'react-dom': ReactDOM })[name])
  return { id: registered.id, mod }
}

function fakeCtx(list, config) {
  const slots = {}
  const opened = []
  const refreshed = []
  const ctx = {
    sessions: {
      list: { getSnapshot: () => list, subscribe: () => () => {} },
      refreshProjections: async (id) => { refreshed.push(id) },
    },
    uiWorkspace: { openSession: address => opened.push(address) },
    slots: {
      inject: (name, fn) => fn(),
      register: (opts, Component) => { slots[opts.name] = { opts, Component } },
    },
    effect: () => {},
  }
  return { ctx, slots, opened, refreshed, config }
}

const LIST = {
  ids: ['p1', 'p2'],
  byId: {
    p1: { id: 'p1', running: true },
    p2: { id: 'p2', running: false },
    c1: { id: 'c1', running: true, retainedBy: {} },
    c2: { id: 'c2', running: false, retainedBy: { mainView: 1 }, projectionValues: { subagentTiming: { lastTurnCompleted: true } } },
  },
  projectionsBySession: {
    p1: { state: 'ready', values: { subagentCatalog: [
      { id: 'c1', createdAt: 1, mode: 'continuable', label: '자막 정리 검토' },
      { id: 'c2', createdAt: 2, mode: 'one-shot', label: '테스트 보강' },
    ] } },
    p2: { state: 'ready', values: { subagentCatalog: [] } },
  },
}

const text = node => (node == null || node === false ? '' : typeof node === 'string' ? node
  : typeof node.type === 'function' ? text(node.type(node.props))
  : node.portal ? text(node.portal) : [node.props?.['aria-label'] ?? '', ...(node.children ?? []).map(text)].join(' '))

test('번들은 플러그인 이름으로 등록되고 세 서비스를 받는다', () => {
  const { id, mod } = loadBundle()
  assert.equal(id, '@lyngmn/dsh-subagent-tree')
  assert.deepEqual([...mod.inject], ['sessions', 'uiWorkspace', 'slots'])
})

test('공식 자리 세 곳에 등록한다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(LIST)
  mod.apply(f.ctx)
  assert.deepEqual(Object.keys(f.slots).sort(), [
    'sidebar.session.row.hover', 'sidebar.session.row.trailing', 'sidebar.workspaces.session.row.action',
  ])
})

test('줄 끝 아이콘은 개수와 실행 중 수를 읽어 주고, 자식이 없으면 그리지 않는다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(LIST)
  mod.apply(f.ctx)
  const { Component } = f.slots['sidebar.session.row.trailing']
  const out = Component({ sessionId: 'p1' })
  assert.match(text(out), /하위 에이전트 2개, 1개 실행 중/)
  assert.equal(Component({ sessionId: 'p2' }), null)
})

test('카드는 자식 제목과 상태 글자를 보이고, 누르면 하위 에이전트 주소로 연다', () => {
  const { mod } = loadBundle()
  const f = fakeCtx(LIST)
  mod.apply(f.ctx)
  const card = f.slots['sidebar.session.row.hover'].Component({ sessionId: 'p1' })
  const all = text(card)
  assert.match(all, /자막 정리 검토/)
  assert.match(all, /실행 중/)
  assert.match(all, /끝남/)
  const firstKid = card.children[1]
  const button = firstKid.type(firstKid.props)
  button.props.onClick({ stopPropagation() {} })
  assert.deepEqual({ ...f.opened[0] }, { kind: 'subagent', parentSessionId: 'p1', childSessionId: 'c1', mode: 'continuable' })
})

test('접기 버튼은 펼침 상태를 알리고, 자식 줄을 끄면 나오지 않는다', () => {
  const { mod } = loadBundle()
  const on = fakeCtx(LIST)
  mod.apply(on.ctx)
  const button = on.slots['sidebar.workspaces.session.row.action'].Component({ sessionId: 'p1' })
  assert.equal(button.props['aria-expanded'], true)
  assert.equal(button.props['aria-label'], '하위 에이전트 접기')
  const off = fakeCtx(LIST)
  loadBundle().mod.apply(off.ctx, { nestedRows: false })
  assert.equal(off.slots['sidebar.workspaces.session.row.action'].Component({ sessionId: 'p1' }), null)
})
