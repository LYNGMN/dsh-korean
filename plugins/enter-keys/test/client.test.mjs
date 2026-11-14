import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { build } from '../scripts/build.mjs'
import { REPLAY_DELAY_MS, STORAGE_KEY } from '../src/enter-rules.js'

// 가짜 React: 컴포넌트를 함수로 불러 나온 나무만 본다. 훅은 처음 값만 돌려준다.
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: init => [typeof init === 'function' ? init() : init, () => {}],
  useRef: init => ({ current: init ?? null }),
  useEffect: () => {},
  useId: () => 'r1',
}

// 아주 작은 DOM 흉내: 입력창 카드와 그 안 편집 루트.
class FakeNode {
  constructor(parent = null) { this.parent = parent }
  contains(other) {
    for (let n = other; n; n = n.parent) if (n === this) return true
    return false
  }
}
class FakeKeyboardEvent {
  constructor(type, init) { this.type = type; Object.assign(this, init); this.isTrusted = false }
}

function fakeComposer({ menu = false } = {}) {
  const card = new FakeNode()
  const root = new FakeNode(card)
  root.isConnected = true
  root.getAttribute = name => (name === 'contenteditable' ? 'true' : null)
  root.dispatched = []
  root.dispatchEvent = event => { root.dispatched.push(event); return true }
  card.listeners = {}
  card.addEventListener = (type, fn, capture) => { assert.equal(capture, true, 'capture 단계로 듣는다'); card.listeners[type] = fn }
  card.removeEventListener = (type) => { delete card.listeners[type] }
  card.menu = menu
  card.querySelector = (selector) => {
    if (selector === '[data-composer-input]') return root
    return card.menu ? {} : null
  }
  return { card, root }
}

function fakeStorage(initial = {}) {
  const data = { ...initial }
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v) }, removeItem: (k) => { delete data[k] } }
}

function loadBundle({ storage = fakeStorage() } = {}) {
  let registered
  const required = []
  const window = {
    __ModuleLoader__: { load: entry => { registered = entry } },
    localStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const sandbox = {
    window,
    navigator: { platform: 'MacIntel' },
    console: { warn: () => {} },
    document: {
      createElement: () => ({ dataset: {}, remove: () => {} }),
      head: { appendChild: () => {} },
      querySelector: () => null,
    },
    Node: FakeNode,
    KeyboardEvent: FakeKeyboardEvent,
    WeakSet, Set, setTimeout, clearTimeout, Date,
  }
  vm.runInNewContext(build(), sandbox)
  const mod = registered.factory((name) => {
    required.push(name)
    if (name === 'react') return React
    throw new Error(`unexpected require ${name}`)
  })
  return { id: registered.id, mod, required, storage }
}

const key = (target, over = {}) => {
  const event = {
    type: 'keydown', target, key: 'Enter', code: 'Enter', keyCode: 13, isTrusted: true, isComposing: false, repeat: false,
    shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, prevented: false, stopped: false, ...over,
  }
  event.preventDefault = () => { event.prevented = true }
  event.stopImmediatePropagation = () => { event.stopped = true }
  return event
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const text = node => (node == null || node === false ? '' : typeof node === 'string' ? node
  : typeof node.type === 'function' ? text(node.type(node.props))
  : (node.children ?? []).map(text).join(''))
const find = (node, pred, out = []) => {
  if (node && typeof node === 'object') {
    if (typeof node.type === 'function') return find(node.type(node.props), pred, out)
    if (pred(node)) out.push(node)
    for (const child of node.children ?? []) find(child, pred, out)
  }
  return out
}

test('번들은 플러그인 이름으로 등록되고 자리 서비스만 받으며 react 말고는 불러오지 않는다', () => {
  const { id, mod, required } = loadBundle()
  assert.equal(id, '@lyngmn/dsh-enter-keys')
  assert.deepEqual([...mod.inject], ['slots'])
  assert.deepEqual(required, ['react'], 'DSH 공용 부품(dsh-client-ui-primitives 등)을 쓰지 않는다')
})

test('입력창 카드 안 자리와 일반 설정 줄 두 곳을 등록한다', () => {
  const { mod } = loadBundle()
  const slots = {}
  const ctx = {
    effect: fn => { fn() },
    slots: { inject: (_name, fn) => fn(), register: (opts, Component) => { slots[opts.name] = { opts, Component } } },
  }
  mod.apply(ctx)
  assert.deepEqual(Object.keys(slots).sort(), ['conversation.input.overlay', 'settings.general.item'])
  assert.equal(slots['settings.general.item'].opts.id, 'dsh-enter-keys')
  assert.equal(slots['settings.general.item'].opts.order, 21, 'DSH 작업 중 보내기 방식(20) 다음')
  const hook = slots['conversation.input.overlay'].Component({})
  assert.equal(hook.type, 'span')
  assert.equal(hook.props.hidden, true, '입력창에는 아무것도 보이지 않는다')
})

test('설정 줄: 기본은 바로 보내기, 고르면 저장한다', () => {
  const { mod, storage } = loadBundle()
  const ctx = { effect: fn => { fn() }, slots: { inject: (_n, fn) => fn(), register: (opts, C) => { if (opts.name === 'settings.general.item') ctx.Row = C } } }
  mod.apply(ctx)
  const tree = ctx.Row({})
  assert.match(text(tree), /엔터 키를 누르면/)
  assert.match(text(tree), /Shift\+엔터는 늘 줄을 바꾸고, 줄바꿈을 고르면 Cmd\+엔터로 보내요/)
  const group = find(tree, n => n.props?.role === 'radiogroup')
  assert.equal(group.length, 1)
  const radios = find(tree, n => n.type === 'input')
  assert.deepEqual(radios.map(r => [r.props.value, r.props.checked]), [['send', true], ['newline', false]])
  assert.match(text(tree), /바로 보내기/)
  assert.doesNotMatch(text(tree), /Enter/, '화면 글자의 키 이름은 한국어 "엔터"로 쓴다(2026-11-15 사용자)')
  radios[1].props.onChange()
  assert.equal(storage.data[STORAGE_KEY], 'newline')
  assert.equal(mod.internals.store.get(), 'newline')
})

test('저장소를 못 읽으면 바로 보내기로 둔다', () => {
  const { mod } = loadBundle()
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  const s = mod.internals.createSettingStore(broken)
  assert.equal(s.get(), 'send')
  s.set('newline')
  assert.equal(s.get(), 'newline', '저장은 못 해도 이번 창에서는 바뀐다')
})

test('바로 보내기: 조합 중 Enter 한 번 → 따라오는 Enter는 먹고, 확정 뒤 DSH에 Enter 하나를 누른다', async () => {
  const { mod } = loadBundle()
  const { card, root } = fakeComposer()
  const detach = mod.internals.attachComposer(card)
  card.listeners.compositionstart({ target: root })
  const composing = key(root, { isComposing: true, keyCode: 229 })
  card.listeners.keydown(composing)
  assert.equal(composing.prevented, false, '조합 확정은 IME에 맡긴다')
  card.listeners.compositionend({ target: root, data: '요' })
  const followUp = key(root)
  card.listeners.keydown(followUp)
  assert.ok(followUp.prevented && followUp.stopped, '확정 직후 Enter가 줄바꿈이 되지 않는다')
  await wait(REPLAY_DELAY_MS + 20)
  assert.equal(root.dispatched.length, 1)
  const [press] = root.dispatched
  assert.equal(press.type, 'keydown')
  assert.equal(press.key, 'Enter')
  assert.equal(press.shiftKey, false)
  assert.equal(press.bubbles, true)
  assert.equal(press.cancelable, true)
  card.listeners.keydown(press)
  assert.equal(root.dispatched.length, 1, '다시 누른 가짜 Enter는 그냥 지나간다')
  detach()
  assert.deepEqual(Object.keys(card.listeners), [], '떼면 듣기를 모두 거둔다')
})

test('줄바꿈: Enter는 Shift+Enter로 바꿔 누르고, 메뉴가 열리면 DSH에 맡긴다', () => {
  const { mod } = loadBundle({ storage: fakeStorage({ [STORAGE_KEY]: 'newline' }) })
  const { card, root } = fakeComposer()
  const detach = mod.internals.attachComposer(card)
  const enter = key(root)
  card.listeners.keydown(enter)
  assert.ok(enter.prevented && enter.stopped)
  assert.equal(root.dispatched.length, 1)
  assert.equal(root.dispatched[0].shiftKey, true)
  card.menu = true
  const pick = key(root)
  card.listeners.keydown(pick)
  assert.equal(pick.prevented, false)
  const send = key(root, { metaKey: true })
  card.listeners.keydown(send)
  assert.equal(send.prevented, false, 'Cmd+Enter는 DSH가 보낸다')
  detach()
})

test('입력창 밖 keydown은 보지 않고, 같은 카드에 두 번 걸지 않는다', () => {
  const { mod } = loadBundle({ storage: fakeStorage({ [STORAGE_KEY]: 'newline' }) })
  const { card, root } = fakeComposer()
  const detach = mod.internals.attachComposer(card)
  const outside = key(new FakeNode(card))
  card.listeners.keydown(outside)
  assert.equal(outside.prevented, false, '첨부·버튼 같은 카드 안 다른 곳은 그대로')
  const again = mod.internals.attachComposer(card)
  again()
  assert.ok(card.listeners.keydown, '두 번째 연결의 해제는 처음 연결을 지우지 않는다')
  detach()
  assert.equal(root.dispatched.length, 0)
})
