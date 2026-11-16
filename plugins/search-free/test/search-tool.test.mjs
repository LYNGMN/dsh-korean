import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'
import { COMMAND_TEXT, commandPrompt, formatToolOutput, parseCommandInput, parseToolArgs } from '../search-tool.js'

const ENGINES = ['auto', 'you', 'naver', 'kakao', 'bing']

test('parseToolArgs checks the query, the engine and max_results', () => {
  assert.deepEqual(parseToolArgs({ query: ' q ' }, ENGINES), { engine: 'auto', request: { query: 'q' } })
  assert.deepEqual(parseToolArgs({ query: 'q', engine: 'Naver', max_results: 50 }, ENGINES), { engine: 'naver', request: { query: 'q', maxResults: 20 } })
  assert.throws(() => parseToolArgs({ query: '', engine: 'google', extra: 1 }, ENGINES), (error) =>
    /"extra" is not a known argument/.test(error.message) && /"query" must be/.test(error.message) && /"engine" must be one of auto, you/.test(error.message))
  assert.throws(() => parseToolArgs(null, ENGINES), /must be an object/)
})

test('parseCommandInput reads an engine, an alias, or none', () => {
  assert.deepEqual(parseCommandInput('auto Node.js 24', ENGINES), { engine: 'auto', question: 'Node.js 24' })
  assert.deepEqual(parseCommandInput('free Node.js 24', ENGINES), { engine: 'auto', question: 'Node.js 24' })
  assert.deepEqual(parseCommandInput('자동 Node.js 24', ENGINES), { engine: 'auto', question: 'Node.js 24' })
  assert.deepEqual(parseCommandInput('NAVER 서울 날씨', ENGINES), { engine: 'naver', question: '서울 날씨' })
  assert.deepEqual(parseCommandInput('네이버 서울 날씨', ENGINES), { engine: 'naver', question: '서울 날씨' })
  assert.deepEqual(parseCommandInput('다음 서울 날씨', ENGINES), { engine: 'kakao', question: '서울 날씨' })
  assert.deepEqual(parseCommandInput('서울 날씨 알려 줘', ENGINES), { engine: 'auto', question: '서울 날씨 알려 줘' })
  assert.deepEqual(parseCommandInput('naver', ENGINES), { engine: 'naver', question: '' })
  assert.deepEqual(parseCommandInput('   ', ENGINES), { engine: 'auto', question: '' })
})

test('the tool searches the chosen engine and names the engine that answered', async (t) => {
  const { tools } = (() => {
    const tools = []
    apply({ get: () => undefined, web: { registerSearchProvider() {} }, tools: { register: (tool) => tools.push(tool) } }, { providers: ['bing'] })
    return { tools }
  })()
  const real = globalThis.fetch
  t.after(() => { globalThis.fetch = real })
  globalThis.fetch = async () => new Response('<li class="b_algo"><h2><a href="https://b.example/q">q result</a></h2><p>q</p></li>', { status: 200 })
  const direct = await tools[0].execute({ query: 'q', engine: 'bing' }, {})
  assert.deepEqual(direct, { engine: 'Bing', sources: [{ url: 'https://b.example/q', title: 'q result', snippet: 'q' }], truncated: false })
  const viaAuto = await tools[0].execute({ query: 'q' }, {})
  assert.equal(viaAuto.engine, 'Bing')
  assert.match(tools[0].output.render({}, direct)[0].text, /Results from Bing\./)
  assert.match(formatToolOutput('X', { sources: [], truncated: false }), /No results found\./)
})

test('/search steers the agent to free_search with the engine and refuses an empty question', () => {
  const commands = []
  apply({ get: () => undefined, web: { registerSearchProvider() {} }, tools: { register() {} }, commands: { register: (c) => commands.push(c) } }, {})
  const [search] = commands
  assert.equal(search.name, 'search')
  const steered = []
  const result = search.handler({ rawInput: 'naver 서울 날씨', agent: { steer: (m) => steered.push(m) } })
  assert.equal(result.kind, 'success')
  assert.equal(steered[0].content[0].text, commandPrompt('서울 날씨', 'naver'))
  assert.match(steered[0].content[0].text, /free_search tool and engine "naver"/)
  const empty = search.handler({ rawInput: 'auto', agent: { steer: () => assert.fail('must not steer') } })
  assert.equal(empty.kind, 'error')
  assert.match(empty.text, /auto, you, parallel/)
  assert.ok(COMMAND_TEXT.ko.hint.includes('<질문>'))
})
