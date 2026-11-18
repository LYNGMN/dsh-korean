import assert from 'node:assert/strict'
import test from 'node:test'
import { backupStamp, decideRecovery, lastWorkingDirectory, needsDirectoryChange, ownerOf } from '../src/host/plan.js'

test('소유 작업공간을 찾는다', () => {
  const a = { id: 'a', sessionIds: ['s1'] }
  const b = { id: 'b', sessionIds: ['s2'] }
  assert.equal(ownerOf([a, b], 's2'), b)
  assert.equal(ownerOf([a, b], 's3'), undefined)
})

test('마지막 작업 폴더 기록만 본다', () => {
  const events = [
    { type: 'working-directory/change', data: { cwd: '/a' } },
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'working-directory/change', data: { cwd: '/b' } },
  ]
  assert.equal(lastWorkingDirectory(events), '/b')
  assert.equal(lastWorkingDirectory([]), undefined)
  assert.equal(needsDirectoryChange(events, '/c'), true)
  assert.equal(needsDirectoryChange(events, '/b'), false)
  assert.equal(needsDirectoryChange([], '/c'), false)
})

test('복구 판단 네 갈래', () => {
  assert.equal(decideRecovery({ newArtifact: true, newArtifactMatches: true, quarantine: true, oldArtifact: false }), 'complete')
  assert.equal(decideRecovery({ newArtifact: true, newArtifactMatches: false, quarantine: true, oldArtifact: false }), 'manual')
  assert.equal(decideRecovery({ newArtifact: false, newArtifactMatches: false, quarantine: true, oldArtifact: false }), 'restore')
  assert.equal(decideRecovery({ newArtifact: false, newArtifactMatches: false, quarantine: true, oldArtifact: true }), 'clear')
  assert.equal(decideRecovery({ newArtifact: false, newArtifactMatches: false, quarantine: false, oldArtifact: true }), 'clear')
  assert.equal(decideRecovery({ newArtifact: false, newArtifactMatches: false, quarantine: false, oldArtifact: false }), 'manual')
})

test('백업 이름은 정렬되고 세션 id를 담는다', () => {
  const early = backupStamp(1_700_000_000_000)
  const late = backupStamp(1_700_000_001_000)
  assert.ok(early < late)
  assert.match(early, /^2023-11-14T/)
})
