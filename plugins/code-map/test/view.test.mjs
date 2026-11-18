import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function render(snapshot, extra = {}) {
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
      ...extra,
    }) } },
    document: { createElement: () => ({}), head: { append() {} } },
  })
  const nodes = []
  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (typeof value === 'string' || typeof value === 'number') { nodes.push({ tag: '#text', text: String(value), children: [] }); return }
    if (!value?.tag) return
    if (typeof value.tag === 'function') { visit(value.tag({ ...value.props, children: value.children })); return }
    nodes.push(value)
    value.children.forEach(visit)
  }
  visit(View({ sessionId: 'a', inputActions: undefined, useInput: () => false }))

  const text = nodes.filter(node => node.tag === '#text').map(node => node.text).join('\n')
  const flat = nodes.filter(node => node.tag === '#text').map(node => node.text).join('')
  return { nodes, text, flat, notices, tags: nodes.map(node => node.tag) }
}

const ready = { state: 'ready', enabled: true, focus: [], indexedAt: 1, indexMs: 400,
  coverage: { notIndexed: 0, partial: 0, unusable: 0, skipped: 0, unknownFormats: [] } }

test('화면은 읽지 못한 범위를 0이어도 없음으로 보여 준다', () => {
  const { text } = render(ready)
  for (const label of ['지도에 넣지 못한 파일', '일부만 읽은 파일', '읽지 못한 파일', '형식을 몰라 건너뛴 파일']) assert.ok(text.includes(label), label)
  assert.equal(text.split('없음').length - 1, 4)
})

test('모르는 값은 없음이 아니라 확인 안 됨으로 쓰고 결론에 경고를 올린다', () => {
  const view = render({ ...ready, coverage: { notIndexed: null, partial: 0, unusable: 0, unknownFormats: null } })
  assert.equal(view.text.split('확인 안 됨').length - 1, 2)
  assert.match(view.text, /읽지 못한 범위를 확인하지 못했어요/)
  assert.equal(view.nodes.find(node => node.props?.className === 'dcm-summary').props['data-kind'], 'warn')
})

test('모르는 형식은 확장자와 개수로 쓰고 세 가지까지만 보인다', () => {
  const formats = [{ ext: '.gs', files: 28 }, { ext: '.a', files: 4 }, { ext: '.b', files: 3 }, { ext: '.c', files: 2 }]
  const { text } = render({ ...ready, coverage: { ...ready.coverage, unknownFormats: formats } })
  assert.match(text, /\.gs 28개, \.a 4개, \.b 3개 외 1종/)
  assert.match(text, /지도가 읽지 못한 범위가 있어서/)
})

test('상태가 바뀌어도 같은 뼈대의 한 칸이다', () => {
  for (const snapshot of [{ state: 'indexing', enabled: true, focus: [] }, ready]) {
    const { nodes } = render(snapshot)
    assert.ok(nodes.some(node => node.props?.className === 'dcm-summary'), '결론 카드')
    assert.ok(nodes.some(node => node.props?.className === 'dcm-stack'))
    assert.equal(nodes.some(node => node.props?.['data-ready'] && node.props.className === 'dcm-stack'), false, '상태로 칸 수를 바꾸지 않는다')
  }
  assert.doesNotMatch(client, /grid-template-columns: minmax\(0, 1\.12fr\)/)
})

test('고친 파일 수와 영향 곳 수를 한 줄 결론으로 보여 준다', () => {
  const row = { id: 'x', name: 'loadUser', file: 'src/user.js', line: 3 }
  const { text } = render({ ...ready, requestImpact: { status: 'ready', files: ['a.js', 'b.js'], candidates: [row] } })
  assert.match(text, /이번 요청에서 파일 2개를 고쳤어요/)
  assert.match(text, /영향 줄 수 있는 곳이 1곳 있어요/)
})

test('바뀐 게 없으면 없다고만 하고 지도가 못 읽은 범위는 따로 알린다', () => {
  const { text } = render(ready)
  assert.match(text, /아직 이번 요청에서 바뀐 게 없어요/)
})

test('찾기 폼은 접힌 상자 안에 있고 끄기는 아래 작은 단추다', () => {
  const { nodes } = render(ready)
  const search = nodes.find(node => node.tag === 'details' && node.props.className.includes('dcm-search'))
  assert.ok(search)
  assert.equal(search.props.open, undefined, '기본은 닫힘')
  const quiet = nodes.find(node => node.props?.className === 'dcm-quiet')
  assert.ok(quiet)
  assert.equal(nodes.filter(node => node.tag === 'button' && node.children.includes('끄기')).length, 0)
})

const changed = { ...ready, root: '/repo',
  requestImpact: { status: 'ready', files: ['src/cache.js', 'docs/한글 문서.md'],
    candidates: [{ id: 'x', name: 'loadUser', file: 'src/user.js', line: 12 }] } }

function hostWith(opened, cwd = '/repo', fail = false) {
  return {
    sidebarRight: { openResource: (address, options) => { if (fail) throw new Error('no'); opened.push({ address, options }) } },
    sessions: { list: { getSnapshot: () => ({ byId: { a: { cwd } } }) } },
  }
}

const fileButtons = nodes => nodes.filter(node => node.tag === 'button' && node.props.className === 'dcm-file')

test('고친 파일과 확인할 곳의 경로를 누르면 오른쪽 사이드바에서 연다', () => {
  const opened = []
  const { nodes } = render(changed, hostWith(opened))
  const buttons = fileButtons(nodes)
  assert.equal(buttons.length, 3)
  buttons.find(node => node.props['aria-label'].includes('src/cache.js')).props.onClick()
  buttons.find(node => node.props['aria-label'].includes('src/user.js:12')).props.onClick()
  buttons.find(node => node.props['aria-label'].includes('한글 문서')).props.onClick()
  assert.deepEqual(opened.map(item => item.address), [
    'dsh-resource://file/session/a/src/cache.js',
    'dsh-resource://file/session/a/src/user.js',
    'dsh-resource://file/session/a/docs/%ED%95%9C%EA%B8%80%20%EB%AC%B8%EC%84%9C.md',
  ])
  // 화면 코드는 다른 실행 환경에서 돌아 객체 모양만 JSON으로 비교한다.
  assert.equal(JSON.stringify(opened[0].options), '{"destination":"sidebar"}')
  assert.equal(JSON.stringify(opened[1].options), '{"destination":"sidebar","params":{"line":12}}')
})

test('세션 폴더 밖의 파일은 절대 경로 주소로 연다', () => {
  const opened = []
  const { nodes } = render(changed, hostWith(opened, '/repo/sub'))
  fileButtons(nodes)[0].props.onClick()
  assert.equal(opened[0].address, 'dsh-resource://file/session/a//repo/src/cache.js')
})

test('사이드바 서비스가 없거나 저장소 위치를 모르면 열 수 없는 글자로만 보인다', () => {
  assert.equal(fileButtons(render(changed).nodes).length, 0)
  assert.equal(fileButtons(render({ ...changed, root: undefined }, hostWith([])).nodes).length, 0)
  assert.ok(render(changed).flat.includes('src/cache.js'))
})

test('여는 데 실패하면 알리고 화면은 그대로 둔다', () => {
  const view = render(changed, hostWith([], '/repo', true))
  fileButtons(view.nodes)[0].props.onClick()
  assert.match(view.notices.at(-1), /열지 못했어요/)
})

test('고친 파일이 많으면 다섯 개까지 보이고 나머지는 접어 둔다', () => {
  const files = Array.from({ length: 8 }, (_v, i) => 'f' + i + '.js')
  const { nodes, text } = render({ ...changed, requestImpact: { status: 'ready', files, candidates: [] } }, hostWith([]))
  assert.match(text, /외 3개 더 보기/)
  assert.equal(fileButtons(nodes).length, 8)
})
