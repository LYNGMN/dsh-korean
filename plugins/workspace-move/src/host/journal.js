// 이동 도중 앱이 죽어도 다음 시작 때 이어서 마무리하거나 되돌릴 수 있게, 바꾸기 전에 계획을 파일로 남긴다.
import path from 'node:path'

export const JOURNAL_FILE = 'journal.json'

export function journalPath(dataDir) {
  return path.join(dataDir, JOURNAL_FILE)
}

function isEntry(value) {
  if (value === null || typeof value !== 'object') return false
  if (typeof value.id !== 'string' || value.id.length === 0) return false
  if (value.kind === 'copy') {
    return value.from !== null && typeof value.from === 'object'
      && value.to !== null && typeof value.to === 'object'
      && typeof value.to.workspaceId === 'string' && typeof value.to.path === 'string'
      && typeof value.newId === 'string' && value.newId.length > 0
  }
  if (value.from === null || typeof value.from !== 'object') return false
  if (typeof value.from.dir !== 'string' || typeof value.from.projectDir !== 'string') return false
  if (value.to === null || typeof value.to !== 'object') return false
  if (typeof value.to.workspaceId !== 'string' || typeof value.to.path !== 'string') return false
  if (typeof value.quarantine !== 'string' || typeof value.backup !== 'string') return false
  return true
}

export async function readJournal(fs, file) {
  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return []
    throw error
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('journal is not an array')
    return parsed.filter(isEntry)
  } catch {
    // 읽을 수 없는 저널을 덮어써서 잃지 않도록, 옆에 옮겨 두고 빈 목록으로 시작한다.
    await fs.rename(file, `${file}.corrupt-${Date.now()}`).catch(() => {})
    return []
  }
}

export async function writeJournal(fs, file, entries) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  const handle = await fs.open(temporary, 'w', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(entries, null, 2)}\n`)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(temporary, file)
}

export function upsertEntry(entries, entry) {
  const next = entries.filter(current => current.id !== entry.id)
  next.push(entry)
  return next
}

export function updateEntry(entries, id, change) {
  return entries.map(current => (current.id === id ? { ...current, ...change } : current))
}

export function removeEntry(entries, id) {
  return entries.filter(current => current.id !== id)
}
