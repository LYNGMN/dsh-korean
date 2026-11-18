import assert from 'node:assert/strict'
import test from 'node:test'
import { createCodeMap } from '../lib/index.js'
import { fileText, filePathOf, searchTermsOf } from '../lib/intercept.js'

const root = '/repos/kit'
const row = (name, file, line, callers) => ({ id: 'kit.' + name, name, file, line, kind: 'Function', callers })

function setup(engine = {}, extra = {}) {
  const records = []
  const service = createCodeMap({
    rootOf: async () => root,
    preferences: { has: async () => true, set: async () => {} },
    engine: { index: async () => ({ project: 'kit', status: 'indexed' }), ...engine },
    metrics: { record: entry => records.push(entry) },
    ...extra,
  })
  return { service, records }
}

const session = { id: 'session-1', header: {} }
const exec = (name, args, more = {}) => ({ name, arguments: args, callId: 'c1', agent: { session }, signal: new AbortController().signal, ...more })
const accepted = () => ({ kind: 'accept', content: [{ type: 'text', text: 'tool output' }] })
const run = (service, call, result = { isError: false }) => service.postExecute(call, result, async () => accepted())
const noteText = decision => decision.additionalContexts?.[0]?.content[0].text

test('검색 명령의 낱말과 도구 인자에서 찾을 이름과 파일 경로를 뽑는다', () => {
  assert.equal(searchTermsOf('bash', { command: 'grep -rn "sendResume\\|loadUser" src | head' }), 'sendResume loadUser')
  assert.equal(searchTermsOf('grep', { pattern: 'readCache', path: 'src' }), 'readCache')
  assert.equal(searchTermsOf('bash', { command: 'git log | grep fix' }), '')
  assert.equal(searchTermsOf('edit', { command: 'grep -rn foo .' }), '')
  assert.equal(searchTermsOf('bash', undefined), '')
  assert.equal(filePathOf('read', { file_path: '/repos/kit/src/a.js' }, root), 'src/a.js')
  assert.equal(filePathOf('read', { file_path: '/repos/other/a.js' }, root), '')
  assert.equal(filePathOf('read', { file_path: 'src/a.js' }, root), '')
  assert.equal(filePathOf('bash', { file_path: '/repos/kit/a.js' }, root), '')
})

test('파일 상태 문구는 문제가 있을 때만 나온다', () => {
  assert.equal(fileText('a.js', { status: 'no_recorded_issue', freshness: 'metadata_match', ranges: [] }), '')
  assert.match(fileText('a.js', { status: 'partial', freshness: 'metadata_match', ranges: [[2, 4]] }), /partly parsed \(lines 2-4\)/)
  assert.match(fileText('s.gs', { status: 'no_recorded_issue', freshness: 'not_tracked', ranges: [] }), /not in the map/)
  assert.match(fileText('a.js', { status: 'no_recorded_issue', freshness: 'metadata_changed', ranges: [] }), /changed after the map/)
})

test('검색 결과 뒤에 같은 이름의 정의를 붙이고 원래 결과는 그대로 둔다', async () => {
  const seenQueries = []
  const { service, records } = setup({
    search: async (_root, _project, query, options) => { seenQueries.push([query, options.limit, options.auto]); return [row('sendResume', 'src/mail.js', 12, 3)] },
  })
  await service.refresh('session-1', root)
  const decision = await run(service, exec('bash', { command: 'grep -rn "sendResume" src | head -5' }))
  assert.deepEqual(seenQueries, [['sendResume', 5, true]])
  assert.equal(decision.kind, 'accept')
  assert.equal(decision.content[0].text, 'tool output')
  const text = noteText(decision)
  assert.match(text, /src\/mail\.js:12 sendResume \(function, 3 references\)/)
  assert.match(text, /not an instruction/)
  assert.equal(decision.additionalContexts[0].source.kind, 'dsh-code-map')
  assert.deepEqual(records.map(({ kind, tool, files }) => ({ kind, tool, files })), [{ kind: 'search', tool: 'bash', files: ['src/mail.js'] }])
  assert.equal(JSON.stringify(records).includes('tool output'), false, '기록에는 결과 글이 들어가지 않는다')
})

test('같은 정의는 한 세션에서 두 번 붙이지 않는다', async () => {
  const { service } = setup({ search: async () => [row('sendResume', 'src/mail.js', 12)] })
  await service.refresh('session-1', root)
  const first = await run(service, exec('grep', { pattern: 'sendResume' }))
  const second = await run(service, exec('grep', { pattern: 'sendResume' }))
  assert.ok(noteText(first))
  assert.equal(second.additionalContexts, undefined)
})

test('검색이 아니거나 이름이 없거나 파이프로 받은 grep에는 아무것도 붙이지 않는다', async () => {
  let calls = 0
  const { service } = setup({ search: async () => { calls++; return [row('a', 'a.js', 1)] } })
  await service.refresh('session-1', root)
  for (const call of [
    exec('bash', { command: 'git log | grep sendResume' }),
    exec('bash', { command: 'npm test' }),
    exec('bash', { command: 'grep -rn "닫기 버튼" src' }),
    exec('glob', { pattern: '**/*.js' }),
  ]) {
    const decision = await run(service, call)
    assert.equal(decision.additionalContexts, undefined)
  }
  assert.equal(calls, 0, '이름이 아니면 지도에 묻지도 않는다')
})

test('꺼진 저장소·준비 중·하위 호출·차단된 결정에는 손대지 않는다', async () => {
  const search = async () => [row('sendResume', 'src/mail.js', 12)]
  const off = createCodeMap({ rootOf: async () => root, preferences: { has: async () => false }, engine: { search } })
  assert.equal((await run(off, exec('grep', { pattern: 'sendResume' }))).additionalContexts, undefined)

  const { service } = setup({ search })
  const indexing = await run(service, exec('grep', { pattern: 'sendResume' }))
  assert.equal(indexing.additionalContexts, undefined, '아직 지도가 없으면 붙이지 않는다')

  await service.refresh('session-1', root)
  assert.equal((await run(service, exec('grep', { pattern: 'sendResume' }, { parent: 'ptc' }))).additionalContexts, undefined)
  const blocked = { kind: 'block', reason: 'x' }
  assert.equal(await service.postExecute(exec('grep', { pattern: 'sendResume' }), {}, async () => blocked), blocked)
})

test('엔진이 실패하거나 너무 느리면 원래 결과를 그대로 돌려준다', async () => {
  const failing = setup({ search: async () => { throw new Error('private details') } })
  await failing.service.refresh('session-1', root)
  const failed = await run(failing.service, exec('grep', { pattern: 'sendResume' }))
  assert.equal(failed.additionalContexts, undefined)
  assert.equal(failed.content[0].text, 'tool output')

  const slow = setup({ search: () => new Promise(() => {}) })
  await slow.service.refresh('session-1', root)
  const started = Date.now()
  // The time limit uses an unref'd timer, so keep the test process alive while it runs.
  const keep = setInterval(() => {}, 20)
  try {
    const late = await run(slow.service, exec('grep', { pattern: 'sendResume' }))
    assert.ok(Date.now() - started < 1500, '제한 시간 안에 돌려준다')
    assert.equal(late.additionalContexts, undefined)
  } finally {
    clearInterval(keep)
  }
})

test('읽은 파일이 지도에 없거나 일부만 읽혔을 때만 알리고 한 번만 알린다', async () => {
  const statuses = {
    'src/ok.js': { status: 'no_recorded_issue', freshness: 'metadata_match', ranges: [] },
    'src/bad.js': { status: 'partial', freshness: 'metadata_match', ranges: [[7, 9]] },
    'sheet.gs': { status: 'no_recorded_issue', freshness: 'not_tracked', ranges: [] },
  }
  const { service, records } = setup({ fileStatus: async (_root, _project, file) => statuses[file] })
  await service.refresh('session-1', root)
  const read = file => run(service, exec('read', { file_path: root + '/' + file }))
  assert.equal((await read('src/ok.js')).additionalContexts, undefined)
  assert.match(noteText(await read('src/bad.js')), /partly parsed \(lines 7-9\)/)
  assert.equal((await read('src/bad.js')).additionalContexts, undefined, '같은 파일은 한 번만')
  assert.match(noteText(await read('sheet.gs')), /not in the map/)
  assert.deepEqual(records.map(entry => entry.files[0]), ['src/bad.js', 'sheet.gs'])
  const failedRead = await run(service, exec('read', { file_path: root + '/src/other.js' }), { isError: true })
  assert.equal(failedRead.additionalContexts, undefined, '실패한 읽기에는 붙이지 않는다')
})

test('파일을 고친 직후 그 파일을 부르는 곳을 알려 주고, 같은 파일은 한 번만 알린다', async () => {
  const impacts = []
  const { service, records } = setup({
    scopedImpact: async (_root, _project, files) => {
      impacts.push(files)
      return { candidates: [{ name: 'loadUser', file: 'src/user.js', line: 2, hop: 1 }, { name: 'render', file: 'src/view.js', line: 9, hop: 2 }], partial: true }
    },
  })
  await service.refresh('session-1', root)
  const edited = await run(service, exec('edit', { file_path: root + '/src/cache.js' }))
  const text = noteText(edited)
  assert.match(text, /places that call into src\/cache\.js/)
  assert.match(text, /src\/user\.js:2 loadUser/)
  assert.match(text, /may be incomplete/)
  assert.deepEqual(impacts, [['src/cache.js']])
  assert.equal((await run(service, exec('edit', { file_path: root + '/src/cache.js' }))).additionalContexts, undefined)
  assert.equal((await run(service, exec('write', { file_path: root + '/src/new.js' }), { isError: true })).additionalContexts, undefined)
  assert.deepEqual(records.map(entry => [entry.kind, entry.tool]), [['impact', 'edit']])
})

test('부르는 곳이 없는 파일(새 파일 등)에는 아무것도 붙이지 않는다', async () => {
  const { service } = setup({ scopedImpact: async () => ({ candidates: [], partial: false }) })
  await service.refresh('session-1', root)
  assert.equal((await run(service, exec('write', { file_path: root + '/src/new.js' }))).additionalContexts, undefined)
})
