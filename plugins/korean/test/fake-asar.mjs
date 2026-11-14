// 시험용 asar 보관 파일을 만든다. 실제 형식(크기 머리 + JSON 헤더 + 이어 붙인 파일)을 따른다.
import { writeFileSync } from 'node:fs'

export function writeAsar(path, files) {
  const header = { files: {} }
  const chunks = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const parts = name.split('/').filter(Boolean)
    let node = header
    for (const part of parts.slice(0, -1)) node = node.files[part] ??= { files: {} }
    const data = Buffer.from(content, 'utf8')
    node.files[parts.at(-1)] = { size: data.length, offset: String(offset) }
    chunks.push(data)
    offset += data.length
  }
  const json = Buffer.from(JSON.stringify(header), 'utf8')
  const padded = Math.ceil(json.length / 4) * 4
  const head = Buffer.alloc(16 + padded)
  head.writeUInt32LE(4, 0)
  head.writeUInt32LE(8 + padded, 4)
  head.writeUInt32LE(4 + padded, 8)
  head.writeUInt32LE(json.length, 12)
  json.copy(head, 16)
  writeFileSync(path, Buffer.concat([head, ...chunks]))
}
