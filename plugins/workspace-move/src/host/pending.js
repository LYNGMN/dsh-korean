// "앱을 다시 켠 뒤 그대로 이동" 요청. Host가 시작할 때 이 파일을 읽어 실제 이동을 끝낸다.
import path from 'node:path'

export const PENDING_FILE = 'pending.json'

export function pendingPath(dataDir) {
  return path.join(dataDir, PENDING_FILE)
}

function isEntry(value) {
  return value !== null && typeof value === 'object'
    && typeof value.sessionId === 'string' && value.sessionId.length > 0
    && typeof value.targetWorkspaceId === 'string' && value.targetWorkspaceId.length > 0
}

export async function readPending(fs, file) {
  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return []
    throw error
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('pending is not an array')
    return parsed.filter(isEntry)
  } catch {
    await fs.rename(file, `${file}.corrupt-${Date.now()}`).catch(() => {})
    return []
  }
}

export async function writePending(fs, file, entries) {
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
