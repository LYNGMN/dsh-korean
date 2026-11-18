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

const TONES = ['wait', 'ok', 'warn', 'err', 'idle']
const toneOf = (nodes, className) => nodes.find(node => node.props?.className?.split(' ').includes(className))?.props['data-tone']
const toneRows = nodes => nodes.filter(node => node.props?.className === 'dcm-gap').map(node => node.props['data-tone'])
const allRead = { ...ready, coverage: { notIndexed: 0, partial: 0, unusable: 0, skipped: 0,
  unmapped: { look: 0, tests: 76, quiet: 40, lookTop: [] } } }

test('모르는 값은 없음이 아니라 확인 안 됨으로 쓰고 주황으로 알린다(조사를 못 했을 때)', () => {
  const view = render({ ...ready, coverage: { notIndexed: null, partial: 0, unusable: 0, unmapped: null } })
  assert.ok(view.text.includes('확인 안 됨'))
  assert.equal(toneOf(view.nodes, 'dcm-state'), 'warn')
  assert.match(view.text, /읽은 범위를 확인 못 했어요/)
  assert.equal(toneRows(view.nodes)[0], 'warn')
})

test('코드가 아닌 파일과 테스트 파일은 숫자는 보이되 경고 색을 쓰지 않는다', () => {
  const view = render(allRead)
  assert.match(view.text, /테스트 파일/)
  assert.match(view.text, /문서·설정·이미지 등/)
  assert.match(view.text, /76개/)
  assert.deepEqual([...new Set(toneRows(view.nodes))], ['idle'], '코드 공백이 없으면 모든 행이 회색')
  assert.equal(toneOf(view.nodes, 'dcm-state'), 'ok')
  assert.match(view.text, /코드를 모두 읽었어요/)
})

test('코드로 보이는 파일이 지도에 없으면 주황이고 어떤 형식인지 알려 준다', () => {
  const view = render({ ...allRead, coverage: { ...allRead.coverage,
    unmapped: { look: 29, tests: 0, quiet: 0, lookTop: [{ ext: '.gs', files: 28 }, { ext: '.sh', files: 1 }] } } })
  assert.equal(toneOf(view.nodes, 'dcm-state'), 'warn')
  assert.match(view.text, /코드 일부를 못 읽었어요/)
  assert.match(view.text, /주로 \.gs 28개, \.sh 1개/)
  assert.equal(toneRows(view.nodes)[0], 'warn')
})

test('옛 코드 지도가 엔진 숫자만 보내도 이전처럼 보인다', () => {
  const formats = [{ ext: '.gs', files: 28 }, { ext: '.a', files: 4 }, { ext: '.b', files: 3 }, { ext: '.c', files: 2 }]
  const { text, nodes } = render({ ...ready, coverage: { ...ready.coverage, notIndexed: 2, unknownFormats: formats } })
  assert.match(text, /\.gs 28개, \.a 4개, \.b 3개 외 1종/)
  assert.match(text, /지도에 넣지 못한 파일/)
  assert.equal(toneOf(nodes, 'dcm-state'), 'warn')
})

test('알약과 결론 카드와 카드 줄무늬가 같은 상태에 같은 색을 쓴다', () => {
  const changedAll = { ...allRead, requestImpact: { status: 'ready', files: ['a.js'], candidates: [] } }
  const cases = [
    [{ state: 'indexing', enabled: true, focus: [] }, 'wait', 'wait'],
    [allRead, 'ok', 'idle'],
    [changedAll, 'ok', 'ok'],
    [{ ...changedAll, coverage: { ...allRead.coverage, unmapped: { look: 3, tests: 0, quiet: 0, lookTop: [] } } }, 'warn', 'warn'],
    [{ ...allRead, coverage: { ...allRead.coverage, unmapped: { look: 3, tests: 0, quiet: 0, lookTop: [] } } }, 'warn', 'idle'],
    [{ state: 'engine-missing', enabled: true, focus: [] }, 'err', null],
    [{ state: 'off', enabled: false, focus: [] }, 'idle', null],
  ]
  for (const [snapshot, pill, summary] of cases) {
    const { nodes } = render(snapshot)
    assert.equal(toneOf(nodes, 'dcm-state'), pill, snapshot.state + ' 알약')
    if (summary) assert.equal(toneOf(nodes, 'dcm-summary'), summary, snapshot.state + ' 결론')
  }
})

test('초록은 지도가 코드를 모두 읽었다는 뜻일 뿐 고친 것이 맞다는 뜻이 아니다', () => {
  const { text } = render({ ...allRead, requestImpact: { status: 'ready', files: ['a.js'], candidates: [] } })
  assert.match(text, /지도가 코드를 모두 읽었어요/)
  assert.doesNotMatch(text, /문제 없|안전|통과/)
})

test('화면은 다섯 가지 색 뜻만 쓰고 옛 표시 방식은 남기지 않는다', () => {
  const scenes = [ready, allRead, { state: 'engine-missing', enabled: true, focus: [] }, { state: 'indexing', enabled: true, focus: [] }]
  for (const scene of scenes) {
    for (const node of render(scene).nodes) {
      const tone = node.props?.['data-tone']
      if (tone !== undefined) assert.ok(TONES.includes(tone), tone)
      assert.equal(node.props?.['data-ready'], undefined)
      assert.equal(node.props?.['data-kind'], undefined)
    }
  }
  assert.doesNotMatch(client, /--cm-(blue|good)/)
})

test('상태가 바뀌어도 같은 뼈대의 한 칸이다', () => {
  for (const snapshot of [{ state: 'indexing', enabled: true, focus: [] }, ready]) {
    const { nodes } = render(snapshot)
    assert.ok(nodes.some(node => node.props?.className === 'dcm-summary'), '결론 카드')
    assert.ok(nodes.some(node => node.props?.className === 'dcm-stack'))
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
  const plain = render(changed).flat
  assert.ok(plain.includes('cache.js') && plain.includes('src/'), '이름과 폴더가 글자로 남는다')
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

const withFiles = { ...allRead, root: '/repo', coverage: { ...allRead.coverage, partial: 20, unusable: 1,
  partialFiles: { files: [{ file: 'rss-bot/Settings_Bluesky.html', line: 1245 }, { file: 'rss-bot/Settings_Discord.html' }], more: true },
  unusableFiles: { files: [{ file: 'rss-bot/Settings_DebugReport.html' }], more: false },
  unmapped: { look: 2, tests: 0, quiet: 0, lookFiles: ['tools/run.sh', 'public/page.html'], lookTop: [] } } }

test('노랑 행을 펼치면 어느 파일인지 보이고 누르면 첫 오류 줄로 열린다', () => {
  const opened = []
  const { nodes, text } = render(withFiles, hostWith(opened))
  const listed = nodes.filter(node => node.tag === 'details' && node.props.className === 'dcm-gapfiles')
  assert.equal(listed.length, 3, '코드 후보·일부만 읽음·읽지 못함 세 행')
  assert.match(text, /파일 2개 보기 \(일부\)/, '목록이 잘렸으면 일부라고 쓴다')
  assert.match(text, /목록이 길어서 2개까지만 보여요/)
  const link = fileButtons(nodes).find(node => node.props['aria-label'].includes('Settings_Bluesky.html:1245'))
  link.props.onClick()
  assert.equal(opened[0].address, 'dsh-resource://file/session/a/rss-bot/Settings_Bluesky.html')
  assert.equal(JSON.stringify(opened[0].options), '{"destination":"sidebar","params":{"line":1245}}')
})

test('파일 목록은 어느 행에도 없으면 그리지 않고 회색 행에는 붙이지 않는다', () => {
  const { nodes } = render(allRead, hostWith([]))
  assert.equal(nodes.filter(node => node.props?.className === 'dcm-gapfiles').length, 0)
  const calm = render({ ...withFiles, coverage: { ...withFiles.coverage, unmapped: { ...withFiles.coverage.unmapped, tests: 5, quiet: 9 } } }, hostWith([]))
  const rows = calm.nodes.filter(node => node.props?.className === 'dcm-gap' && node.props['data-tone'] === 'idle')
  assert.ok(rows.every(row => !JSON.stringify(row.children).includes('dcm-gapfiles')))
})

test('빈 상태 안내는 한 번만 나오고 파일이 있을 때만 누르면 열린다고 말한다', () => {
  const empty = render(ready, hostWith([])).text
  assert.equal(empty.split('여기에 나와요').length - 1, 1)
  assert.doesNotMatch(empty, /파일 이름을 누르면 오른쪽에서 열려요/)
  assert.match(render(changed, hostWith([])).text, /파일 이름을 누르면 오른쪽에서 열려요/)
})

test('빠진 것이 없으면 설명을 붙이지 않고 코드는 모두 들어 있다고만 말한다', () => {
  const { text } = render(allRead, hostWith([]))
  assert.match(text, /코드는 모두 지도에 들어 있어요/)
  assert.doesNotMatch(text, /파일 안 일부 줄을 못 읽었어요/)
  assert.match(render(withFiles, hostWith([])).text, /파일 안 일부 줄을 못 읽었어요/)
})
