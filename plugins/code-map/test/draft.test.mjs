import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const impactRow = { id: 'caller', name: 'loadUser', file: 'src/user.js', line: 12 }
const snapshot = {
  state: 'ready', enabled: true, focus: [],
  requestImpact: { status: 'ready', files: ['src/cache.js'], candidates: [impactRow] },
  impact: { files: ['old.js'], candidates: [] },
}

function render({ inputActions, draft = '', attachmentIds = [] } = {}) {
  let View
  const notices = []
  const react = {
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children }),
    useEffect() {},
    useState: initial => [initial?.state === 'loading' ? snapshot : initial, text => notices.push(text)],
    useRef: current => ({ current }),
    useId: () => 'test-id',
    Fragment: 'fragment',
  }
  vm.runInNewContext(client, {
    window: { __ModuleLoader__: { load: ({ factory }) => factory(() => react).apply({
      effect() {},
      slots: { inject: (_name, register) => register(), register: (_options, view) => { View = view } },
    }) } },
    document: { createElement: () => ({}), head: { append() {} } },
  })
  const nodes = []
  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (!value?.tag) return
    if (typeof value.tag === 'function') { visit(value.tag({ ...value.props, children: value.children })); return }
    nodes.push(value)
    value.children.forEach(visit)
  }
  visit(View({ sessionId: 'a', inputActions, useInput: select => select({ draft, attachmentIds, phase: 'plain' }) }))
  return { nodes, notices, button: nodes.find(node => node.tag === 'button' && node.props['aria-label']?.includes('검증 요청 넣기')) }
}

test('선택된 초안은 보존하고 함수 위치를 포함한 검증 문장만 넣는다', () => {
  let request
  const inputActions = {
    captureInsertion: () => ({ start: 0, end: 2, draftRev: 9 }),
    insertText: (text, span) => { request = { text, span }; return true },
    setDraft: () => assert.fail('must not replace draft'),
    submit: () => assert.fail('must not send'),
  }
  const { button, nodes } = render({ inputActions, draft: '기존 초안', attachmentIds: ['photo'] })
  assert.ok(button)
  assert.ok(nodes.some(node => node.tag === 'details'))
  button.props.onClick()
  assert.equal(request.span.start, 2)
  assert.equal(request.span.end, 2)
  assert.equal(request.span.draftRev, 9)
  assert.match(request.text, /^\n\n.*loadUser.*src\/user\.js:12.*관련 테스트/s)
})

test('빈 입력창에는 앞 공백 없이 넣으며, 거절되면 상태로 알린다', () => {
  const { button, notices } = render({ inputActions: {
    captureInsertion: () => ({ start: 0, end: 0, draftRev: 2 }),
    insertText: text => { assert.equal(text, text.trimStart()); return false },
  } })
  assert.ok(button)
  button.props.onClick()
  assert.match(notices.at(-1), /넣지 못했어요/)
  assert.equal(render().button, undefined)
})
