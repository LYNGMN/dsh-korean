import assert from 'node:assert/strict'
import test from 'node:test'
import { armOf, compareArms, summarizeSession } from '../scripts/measure-sessions.mjs'

const event = (type, time, data) => JSON.stringify({ type, seq: 1, time, data })
const call = (id, name, args = {}, turn = 1) => event('tool/call', 1794000000000, { turn, step: 1, callId: id, name, arguments: JSON.stringify(args) })
const result = (id, text, turn = 1) => event('tool/result', 1794000000100, { turn, step: 1, message: { role: 'tool', toolCallId: id, content: [{ type: 'text', text }] } })
const step = (usage, turn = 1) => event('assistant/message', 1794000000200, { turn, step: 1, message: { role: 'assistant', content: [] }, ...(usage && { usage }) })

function log(...lines) { return ['{"type":"session","cwd":"/repo","time":1794000000000}', ...lines].join('\n') }

test('방식은 불러 쓴 지도 도구 이름으로 정한다', () => {
  assert.equal(armOf(['bash', 'read']), 'none')
  assert.equal(armOf(['bash', 'mcp__cbm__search_graph']), 'cbm')
  assert.equal(armOf(['mcp__codebase-memory__trace_path']), 'cbm')
  assert.equal(armOf(['mcp__trail__graft_find_code']), 'trail')
  assert.equal(armOf(['mcp__cbm__search_graph', 'mcp__trail__graft_find_code']), 'cbm+trail')
  assert.equal(armOf(['mcp__exa__web_search_exa']), 'none', '검색 서버는 지도 도구가 아니다')
  assert.equal(armOf(['bash'], true), 'plugin', '코드 지도 플러그인 덧붙임만 있으면 plugin')
  assert.equal(armOf(['mcp__cbm__search_graph'], true), 'cbm+plugin')
})

test('도구 호출 수, 읽은 글자, 결과 글자, 토큰을 합산한다', () => {
  const summary = summarizeSession(log(
    call('a', 'read', { file_path: '/repo/a.js' }), result('a', 'x'.repeat(100)),
    call('b', 'bash', { command: 'ls' }), result('b', 'y'.repeat(30)),
    step({ inputTokens: 1000, outputTokens: 50, cacheReadTokens: 200, totalTokens: 1250 }),
    step({ inputTokens: 400, outputTokens: 20, cacheReadTokens: 1200, totalTokens: 1620 }),
    step(undefined),
  ))
  assert.equal(summary.arm, 'none')
  assert.equal(summary.startedAt, 1794000000000)
  assert.deepEqual({ ...summary.totals }, {
    toolCalls: 2, reads: 1, readChars: 100, resultChars: 130, mapCalls: 0, readsAfterMap: 0, mapNotes: 0,
    inputTokens: 1400, outputTokens: 70, cacheReadTokens: 1400, steps: 3, stepsWithUsage: 2,
  })
})

test('코드 지도 플러그인이 붙인 메모가 있는 세션은 plugin 방식으로 센다', () => {
  const note = event('user/message', 1794000000150, { role: 'user', id: 'n', source: { kind: 'dsh-code-map', form: 'notice' }, content: [{ type: 'text', text: 'Code map: ...' }] })
  const inbox = event('agent/inbox/spliced', 1794000000151, { inserted: [{ role: 'user', source: { kind: 'dsh-code-map' } }] })
  const other = event('user/message', 1794000000152, { role: 'user', id: 'u', source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] })
  const summary = summarizeSession(log(call('a', 'grep', {}), result('a', 'x'), note, inbox, other))
  assert.equal(summary.totals.mapNotes, 1, '같은 메모가 inbox 이벤트에도 남아도 한 번만 센다')
  assert.equal(summary.arm, 'plugin')
})

test('지도 도구를 부른 턴에서 그 뒤 읽기가 따라왔는지 센다', () => {
  const summary = summarizeSession(log(
    call('m', 'mcp__cbm__search_graph', { name_pattern: 'x' }), result('m', '{}'),
    call('r1', 'read', { file_path: '/repo/a.js' }), result('r1', 'abc'),
    call('r2', 'read', { file_path: '/repo/b.js' }, 2), result('r2', 'abc', 2),
  ))
  assert.equal(summary.arm, 'cbm')
  assert.equal(summary.totals.mapCalls, 1)
  assert.equal(summary.totals.readsAfterMap, 1, '다른 턴의 읽기는 세지 않는다')
})

test('방식별로 중앙값을 내고 토큰 기록이 없으면 없다고 둔다', () => {
  const a = summarizeSession(log(call('a', 'read', {}), result('a', 'x'.repeat(10)), step({ inputTokens: 100, outputTokens: 1, cacheReadTokens: 0, totalTokens: 101 })))
  const b = summarizeSession(log(call('a', 'read', {}), result('a', 'x'.repeat(30))))
  const arms = compareArms([a, b])
  assert.equal(arms.none.sessions, 2)
  assert.equal(arms.none.readChars, 20)
  assert.equal(arms.none.sessionsWithUsage, 1)
  assert.equal(arms.none.inputTokens, 100)
  assert.equal(compareArms([b]).none.inputTokens, null)
})
