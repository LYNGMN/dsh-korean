import test from 'node:test'
import assert from 'node:assert/strict'
import { actionTexts, LANGS, noteText } from '../server/push/text.js'

test('notifications are worded in the chosen language', () => {
  assert.deepEqual(noteText({ kind: 'approval', session: '블루스카이', tool: 'bash', reason: '폴더 밖 쓰기' }, 'ko'), { title: '승인 요청 · 블루스카이', body: 'bash: 폴더 밖 쓰기' })
  assert.deepEqual(noteText({ kind: 'approval', session: 'Blue', tool: 'bash', reason: 'x', reasons: { en: 'writes outside' } }, 'en'), { title: 'Approval request · Blue', body: 'bash: writes outside' })
  assert.deepEqual(noteText({ kind: 'question', session: 'S', review: true, plan: '설정 개선 계획' }, 'ko'), { title: '계획 검토 · S', body: '설정 개선 계획' })
  assert.equal(noteText({ kind: 'question', question: 'Which?' }, 'ja').title, '質問 · セッション')
  assert.equal(noteText({ kind: 'turnEnd', session: 'S' }, 'xx').title, '작업 끝 · S')
  assert.equal(noteText({ kind: 'turnEnd', session: 'S', approval: 'share' }, 'ko').body, '답변이 끝났습니다 · 공유 승인 필요')
  assert.equal(noteText({ kind: 'turnEnd', session: 'S', approval: 'merge' }, 'en').body, 'The reply is complete · Merge needs approval')
  assert.equal(noteText({ kind: 'turnEnd', session: 'S', approval: 'nope' }, 'ko').body, '답변이 끝났습니다')
  for (const lang of LANGS) assert.ok(noteText({ kind: 'turnEnd', approval: 'deploy' }, lang).body.includes(' · '), lang)
})

test('every language words the notification buttons', () => {
  for (const lang of LANGS) {
    const texts = actionTexts(lang)
    assert.deepEqual(Object.keys(texts), ['reject', 'allow', 'allowed', 'rejected', 'gone', 'failed'])
    assert.ok(Object.values(texts).every((text) => text.length > 0), lang)
  }
})
