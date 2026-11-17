import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'
import { COMMAND_TEXT, commandPrompt, createCountGrants, formatToolOutput, parseCommandInput, parseCount, parseToolArgs } from '../search-tool.js'

const ENGINES = ['auto', 'you', 'naver', 'kakao', 'bing']

test('parseToolArgs checks the query, the engine and max_results', () => {
  assert.deepEqual(parseToolArgs({ query: ' q ' }, ENGINES), { engine: 'auto', request: { query: 'q' } })
  // max_results is accepted but ignored: the plugin page sets the count per engine.
  assert.deepEqual(parseToolArgs({ query: 'q', engine: 'Naver', max_results: 50 }, ENGINES), { engine: 'naver', request: { query: 'q' } })
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
  assert.deepEqual(parseCommandInput('korea 서울 날씨', [...ENGINES, 'korea']), { engine: 'korea', question: '서울 날씨' })
  assert.deepEqual(parseCommandInput('한국 서울 날씨', [...ENGINES, 'korea']), { engine: 'korea', question: '서울 날씨' })
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

test('/search steers the agent to engine_search with the engine and refuses an empty question', () => {
  const commands = []
  apply({ get: () => undefined, web: { registerSearchProvider() {} }, tools: { register() {} }, commands: { register: (c) => commands.push(c) } }, {})
  const [search] = commands
  assert.equal(search.name, 'search')
  const steered = []
  const result = search.handler({ rawInput: 'naver 서울 날씨', agent: { steer: (m) => steered.push(m) } })
  assert.equal(result.kind, 'success')
  assert.equal(steered[0].content[0].text, commandPrompt('서울 날씨', 'naver'))
  assert.match(steered[0].content[0].text, /engine_search tool, engine "naver", instead/)
  const empty = search.handler({ rawInput: 'auto', agent: { steer: () => assert.fail('must not steer') } })
  assert.equal(empty.kind, 'error')
  assert.match(empty.text, /auto, korea, you, parallel/)
  assert.ok(COMMAND_TEXT.ko.hint.includes('<질문>'))
})

test('parseCount reads max words and whole numbers 1-100 written as 30, 30개 or x30', () => {
  for (const word of ['max', 'MAX', 'maximum', 'all', '최대']) assert.equal(parseCount(word), 'max', word)
  assert.equal(parseCount('30'), 30)
  assert.equal(parseCount('20개'), 20)
  assert.equal(parseCount('x15'), 15)
  for (const word of ['0', '101', '2026', '3.5', 'ten', '', undefined]) assert.equal(parseCount(word), undefined, String(word))
})

test('parseCommandInput reads a count right after the engine, or first for the automatic engine', () => {
  const engines = [...ENGINES, 'korea']
  assert.deepEqual(parseCommandInput('korea max 서울', engines), { engine: 'korea', count: 'max', question: '서울' })
  assert.deepEqual(parseCommandInput('naver 30 전기차', engines), { engine: 'naver', count: 30, question: '전기차' })
  assert.deepEqual(parseCommandInput('kakao 20개 맛집', engines), { engine: 'kakao', count: 20, question: '맛집' })
  assert.deepEqual(parseCommandInput('naver 2026 월드컵', engines), { engine: 'naver', question: '2026 월드컵' })
  assert.deepEqual(parseCommandInput('max 서울', engines), { engine: 'auto', count: 'max', question: '서울' })
  assert.deepEqual(parseCommandInput('naver 10 3 idiots', engines), { engine: 'naver', count: 10, question: '3 idiots' })
  assert.deepEqual(parseCommandInput('naver max', engines), { engine: 'naver', count: 'max', question: '' })
})

test('parseToolArgs reads count as a number or "max" and rejects anything else', () => {
  assert.deepEqual(parseToolArgs({ query: 'q', engine: 'naver', count: '30' }, ENGINES), { engine: 'naver', count: 30, request: { query: 'q' } })
  assert.deepEqual(parseToolArgs({ query: 'q', engine: 'naver', count: 30 }, ENGINES), { engine: 'naver', count: 30, request: { query: 'q' } })
  assert.deepEqual(parseToolArgs({ query: 'q', count: 'max' }, ENGINES), { engine: 'auto', count: 'max', request: { query: 'q' } })
  assert.throws(() => parseToolArgs({ query: 'q', count: 500 }, ENGINES), /"count" must be/)
})

test('a count grant matches only the same engine and count, and expires after 30 minutes', () => {
  let clock = 0
  const grants = createCountGrants({ now: () => clock })
  assert.equal(grants.allow('naver', 30), undefined)
  grants.set('naver', 30)
  assert.equal(grants.allow('naver', 30), 30)
  assert.equal(grants.allow('naver', 50), undefined)
  assert.equal(grants.allow('kakao', 30), undefined)
  assert.equal(grants.allow('naver', undefined), undefined)
  clock = 30 * 60 * 1000
  assert.equal(grants.allow('naver', 30), undefined)
  grants.set('korea', 'max')
  assert.equal(grants.allow('korea', 'max'), 'max')
  grants.set('korea', undefined)
  assert.equal(grants.allow('korea', 'max'), undefined)
})

test('/search with a count tells the agent the count, grants it, and the tool then asks the engine for it', async (t) => {
  const commands = []
  const tools = []
  const ctx = { get: () => undefined, web: { registerSearchProvider() {} }, tools: { register: (tool) => tools.push(tool) }, commands: { register: (c) => commands.push(c) } }
  apply(ctx, { providers: ['you', 'kakao'] })
  const [search] = commands
  const steered = []
  const capped = search.handler({ rawInput: 'kakao 80 맛집', agent: { steer: (m) => steered.push(m) } })
  assert.match(steered[0].content[0].text, /engine "kakao" and count "80"/)
  assert.match(capped.text, /50/, 'a count above the engine maximum is reported as that maximum')

  const counts = []
  const real = globalThis.fetch
  t.after(() => { globalThis.fetch = real })
  globalThis.fetch = async (url) => {
    counts.push(new URL(String(url)).searchParams.get('count'))
    return new Response(JSON.stringify({ results: { web: [] } }), { status: 200 })
  }
  const run = (count) => tools[0].execute({ query: 'q', engine: 'you', count }, {}).catch(() => {})
  // The grant is for kakao, so a count for you is ignored and the page setting (10) applies.
  await run('30')
  search.handler({ rawInput: 'you 30 q', agent: { steer() {} } })
  await run('30')
  // A different count than the user's is ignored.
  await run('40')
  search.handler({ rawInput: 'you max q', agent: { steer() {} } })
  // "max" is the engine maximum (100), held to the keyless maximum (50) without a key.
  await run('max')
  assert.deepEqual(counts, ['10', '30', '10', '50'])
})
