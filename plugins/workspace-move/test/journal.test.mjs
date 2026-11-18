import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { journalPath, readJournal, removeEntry, upsertEntry, writeJournal } from '../src/host/journal.js'

const entry = (id) => ({
  id,
  phase: 'prepared',
  from: { workspaceId: 'ws-1', dir: '/tmp/x', projectDir: '/tmp', cwd: '/tmp' },
  to: { workspaceId: 'ws-2', path: '/tmp/y' },
  quarantine: '/tmp/q',
  backup: '/tmp/b',
})

test('저널을 쓰고 다시 읽는다', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dwm-journal-'))
  try {
    const file = journalPath(dir)
    await writeJournal(fsp, file, [entry('a')])
    assert.deepEqual((await readJournal(fsp, file)).map(item => item.id), ['a'])
    const leftovers = (await fsp.readdir(dir)).filter(name => name.endsWith('.tmp'))
    assert.deepEqual(leftovers, [])
    await writeJournal(fsp, file, upsertEntry([entry('a')], entry('b')))
    assert.deepEqual((await readJournal(fsp, file)).map(item => item.id), ['a', 'b'])
    await writeJournal(fsp, file, removeEntry(await readJournal(fsp, file), 'a'))
    assert.deepEqual((await readJournal(fsp, file)).map(item => item.id), ['b'])
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('깨진 저널은 덮어쓰지 않고 옆으로 옮긴 뒤 빈 목록으로 시작한다', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dwm-journal-'))
  try {
    const file = journalPath(dir)
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(file, '{ broken')
    assert.deepEqual(await readJournal(fsp, file), [])
    const names = await fsp.readdir(dir)
    assert.equal(names.filter(name => name.startsWith('journal.json.corrupt-')).length, 1)
    await assert.rejects(fsp.access(file), { code: 'ENOENT' })
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('없는 저널은 빈 목록이다', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dwm-journal-'))
  try {
    assert.deepEqual(await readJournal(fsp, journalPath(dir)), [])
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})
