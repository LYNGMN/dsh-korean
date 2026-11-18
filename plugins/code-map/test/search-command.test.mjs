import assert from 'node:assert/strict'
import test from 'node:test'
import { commandsOf, searchOf } from '../lib/search-command.js'
import { aggregate, summarizeSession } from '../scripts/measure-sessions.mjs'

test('폴더나 파일을 뒤지는 grep·rg·find를 찾고 찾는 낱말을 뽑는다', () => {
  assert.deepEqual(searchOf('grep -rn "applyHeaderStyles_\\|sendArticle" *.gs | head -8'),
    { kind: 'grep', terms: ['applyHeaderStyles_', 'sendArticle'], paths: ['*.gs'] })
  assert.deepEqual(searchOf("rg 'loadUser' src").terms, ['loadUser'])
  assert.deepEqual(searchOf('grep -n -e readCache -e writeCache lib/cache.js').terms, ['readCache', 'writeCache'])
  assert.equal(searchOf('cd app && grep --include=*.js -R fooBar .').terms[0], 'fooBar')
  assert.equal(searchOf('find ops -maxdepth 2 -type f').kind, 'find')
  assert.deepEqual(searchOf('find . -name "*.gs"').names, ['*.gs'])
})

test('파이프로 받은 grep과 검색이 아닌 명령은 검색으로 세지 않는다', () => {
  assert.equal(searchOf('git log --oneline | grep fix'), null)
  assert.equal(searchOf('cat a.txt | grep -n sendArticle'), null)
  assert.equal(searchOf('npm test && echo done'), null)
  assert.equal(searchOf('grep sendArticle'), null, '파일이 없으면 파이프 입력을 읽는 grep이다')
  assert.equal(searchOf('echo "grep -rn foo ."'), null)
  assert.equal(searchOf(undefined), null)
  assert.equal(searchOf('grep -rn "닫히지 않은 따옴표 .'), null, '해석할 수 없으면 검색이 아니다')
})

test('따옴표 안의 | 는 파이프가 아니고, 명령은 ; && 줄바꿈에서 나뉜다', () => {
  assert.deepEqual(commandsOf('grep -rn "a|b" . ; ls\nwc -l x').map(c => c.words[0]), ['grep', 'ls', 'wc'])
  assert.deepEqual(commandsOf('a | b && c').map(c => c.piped), [false, true, false])
  assert.deepEqual(commandsOf('x'.repeat(9000)), [])
})

const call = (turn, name, args) => JSON.stringify({ type: 'tool/call', data: { turn, name, arguments: JSON.stringify(args) } })

test('세션 기록에서 첫 수정 전 탐색 횟수를 센다', () => {
  const text = [
    JSON.stringify({ type: 'session', cwd: '/repo' }),
    call(1, 'bash', { command: 'grep -rn "loadUser" src' }),
    call(1, 'read', { file_path: '/repo/src/user.js' }),
    call(1, 'bash', { command: 'git status | grep M' }),
    call(1, 'edit', { file_path: '/repo/src/user.js' }),
    call(1, 'grep', { pattern: 'x' }),
    call(2, 'read', { file_path: '/repo/a.js' }),
  ].join('\n')
  const summary = summarizeSession(text)
  assert.equal(summary.cwd, '/repo')
  assert.deepEqual(summary.turns.map(({ turn, searches, reads, edits, beforeEdit }) => ({ turn, searches, reads, edits, beforeEdit })), [
    { turn: 1, searches: 2, reads: 1, edits: 1, beforeEdit: 2 },
    { turn: 2, searches: 0, reads: 1, edits: 0, beforeEdit: null },
  ])
  const total = aggregate([summary])
  assert.equal(total.turnsWithEdit, 1)
  assert.equal(total.exploreBeforeFirstEdit.median, 2)
  assert.equal(total.searchesViaBash, 1)
})
