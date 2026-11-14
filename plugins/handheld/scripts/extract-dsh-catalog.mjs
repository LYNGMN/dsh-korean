// Writes docs/dsh-api/<version>.json: every Remote endpoint the installed DSH
// app declares (mode, parameter names, strict JSON Schema). Used to see what a
// new DSH version changed before touching server/dsh/.
import fs from 'node:fs'
import path from 'node:path'
import { openAsar } from './asar.mjs'

const APP = process.argv[2] ?? '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'
const ROOT = 'dsh/node_modules/@deepseek-ai/'
const asar = openAsar(APP)
const version = JSON.parse(asar.read(`${ROOT}dsh/package.json`)).version
const catalog = {}

for (const file of asar.paths()) {
  if (!file.startsWith(ROOT) || !file.endsWith('/lib/typert.remote-client.js')) continue
  const pkg = file.slice(ROOT.length).split('/')[0]
  const text = asar.read(file)
  const blocks = text.split(/\n {4}'([\w$./-]+)': \{\n/).slice(1)
  for (let i = 0; i < blocks.length; i += 2) {
    const endpoint = blocks[i]
    const body = blocks[i + 1]
    const params = [...body.matchAll(/ {8}\{\n {10}name: '([^']+)',[\s\S]*?(?:strictCodec: \{[\s\S]*?jsonSchema: (\{.*\}),\n|\n {8}\},)/g)]
      .map(([, name, schema]) => ({ name, schema: schema ? JSON.parse(schema) : null }))
    const mode = /mode: 'stream'|kind: 'stream'|stream: true/.test(body.split('parameters:')[0]) ? 'stream' : 'unary'
    const result = body.match(/\n {6}result: \{[\s\S]*?jsonSchema: (\{.*\}),\n/)
    catalog[endpoint] = { package: pkg, mode, params, result: result ? JSON.parse(result[1]) : null }
  }
}

const out = path.join(import.meta.dirname, '..', 'docs', 'dsh-api', `${version}.json`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ version, endpoints: catalog }, null, 1) + '\n')
console.log(`${Object.keys(catalog).length} endpoints -> ${path.relative(process.cwd(), out)}`)
