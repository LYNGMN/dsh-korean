// asar 보관 파일을 풀지 않고 읽는다. 헤더(JSON)로 목록을 얻고, 필요한 파일만 위치로 읽는다.
import { openSync, readSync, closeSync } from 'node:fs'

export function openAsar(path) {
  const fd = openSync(path, 'r')
  const head = Buffer.alloc(16)
  readSync(fd, head, 0, 16, 0)
  const headerPickleSize = head.readUInt32LE(4)
  const jsonLength = head.readUInt32LE(12)
  const json = Buffer.alloc(jsonLength)
  readSync(fd, json, 0, jsonLength, 16)
  const header = JSON.parse(json.toString('utf8'))
  const dataStart = 8 + headerPickleSize

  const entries = new Map()
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const full = `${prefix}/${name}`
      if (child.files) walk(child, full)
      else if (!child.link) entries.set(full, child)
    }
  }
  walk(header, '')

  return {
    paths: () => [...entries.keys()],
    has: (p) => entries.has(p),
    read(p) {
      const entry = entries.get(p)
      if (!entry) throw new Error(`asar 안에 없는 파일: ${p}`)
      if (entry.unpacked) throw new Error(`asar 밖에 풀려 있는 파일: ${p}`)
      const buffer = Buffer.alloc(entry.size)
      readSync(fd, buffer, 0, entry.size, dataStart + Number(entry.offset))
      return buffer.toString('utf8')
    },
    close: () => closeSync(fd)
  }
}
