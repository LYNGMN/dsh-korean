// Read-only access to files inside an Electron app.asar archive.
import fs from 'node:fs'

export function openAsar(file) {
  const fd = fs.openSync(file, 'r')
  const head = Buffer.alloc(16)
  fs.readSync(fd, head, 0, 16, 0)
  const headerPickle = head.readUInt32LE(4)
  const jsonLength = head.readUInt32LE(12)
  const json = Buffer.alloc(jsonLength)
  fs.readSync(fd, json, 0, jsonLength, 16)
  const header = JSON.parse(json.toString('utf8'))
  const base = 8 + headerPickle
  const entries = new Map()
  const walk = (node, path) => {
    if (node.files) for (const [name, child] of Object.entries(node.files)) walk(child, path ? `${path}/${name}` : name)
    else entries.set(path, node)
  }
  walk(header, '')
  return {
    paths: () => [...entries.keys()],
    read(path) {
      const node = entries.get(path)
      if (!node) return undefined
      if (node.unpacked) return fs.readFileSync(`${file}.unpacked/${path}`, 'utf8')
      const buf = Buffer.alloc(node.size)
      fs.readSync(fd, buf, 0, node.size, base + Number(node.offset))
      return buf.toString('utf8')
    },
    close: () => fs.closeSync(fd),
  }
}
