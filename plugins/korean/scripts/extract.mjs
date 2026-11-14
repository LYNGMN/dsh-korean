#!/usr/bin/env node
// 설치된 DeepSeek Harness에서 영어 원문 사전을 뽑아 source/<버전>/ 에 저장한다.
// 앱에는 아무것도 쓰지 않는다. 사용법: node scripts/extract.mjs [--app <.app 경로>] [--out <폴더>]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openAsar } from './asar.mjs'
import { importFromAsar, resolveInAsar } from './ts-modules.mjs'

const PACKAGES = '/dsh/node_modules/@deepseek-ai/'
const REGISTER = 'locale.register('

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

// 여는 괄호 위치에서 시작해 짝이 맞는 닫는 괄호까지의 안쪽 글을 돌려준다.
export function balanced(text, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' }
  const stack = []
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++
    } else if (pairs[ch]) stack.push(pairs[ch])
    else if (ch === stack.at(-1)) {
      stack.pop()
      if (stack.length === 0) return text.slice(open + 1, i)
    }
  }
  throw new Error('괄호 짝이 맞지 않습니다')
}

export function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++
    } else if ('({['.includes(ch)) depth++
    else if (')}]'.includes(ch)) depth--
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = text.slice(start).trim()
  if (last) parts.push(last)
  return parts
}

const literal = (text) => text.match(/^(['"])(.*)\1$/)?.[2]

function importsOf(source) {
  const map = new Map()
  for (const m of source.matchAll(/^[ \t]*import\s+(?!type\b)([^'"]*?)\s+from\s+(['"])([^'"]+)\2/gm)) {
    const named = m[1].match(/\{([^}]*)\}/)
    if (!named) continue
    for (const part of named[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      if (part.startsWith('type ')) continue
      const [exported, local = exported] = part.split(/\s+as\s+/)
      map.set(local, { specifier: m[3], exported })
    }
  }
  return map
}

function localConst(source, name) {
  const m = source.match(new RegExp(`\\bconst\\s+${name}\\b[^=\\n]*=\\s*`))
  if (!m) return null
  const rest = source.slice(m.index + m[0].length)
  if ('{['.includes(rest[0])) return rest[0] + balanced(rest, 0) + (rest[0] === '{' ? '}' : ']')
  return rest.match(/^[^\n;]+/)[0].trim()
}

function createResolver(asar, file, source) {
  const imports = importsOf(source)

  async function imported(name) {
    const entry = imports.get(name)
    if (!entry) return undefined
    const path = resolveInAsar(asar, entry.specifier, file)
    return path ? (await importFromAsar(asar, path))[entry.exported] : undefined
  }

  // 이름이나 식을 실제 값(문자열 또는 사전)으로 바꾼다.
  async function value(expression) {
    const text = expression.trim()
    const string = literal(text)
    if (string !== undefined) return string
    if (/^\w+$/.test(text)) {
      const fromImport = await imported(text)
      if (fromImport !== undefined) return fromImport
      const local = localConst(source, text)
      if (local && local !== text) return value(local)
      return undefined
    }
    if (text.startsWith('{')) return objectLiteral(text)
    return undefined
  }

  // { a: '글', b, ...c } 꼴의 객체를 값으로 만든다.
  async function objectLiteral(text) {
    const result = {}
    for (const part of splitTopLevel(balanced(text, 0))) {
      if (part.startsWith('...')) Object.assign(result, await value(part.slice(3)))
      else {
        const colon = part.match(/^(['"]?)([\w.$-]+)\1\s*:\s*([\s\S]+)$/)
        if (colon) result[colon[2]] = await value(colon[3])
        else if (/^\w+$/.test(part)) result[part] = await value(part)
        else return undefined
      }
    }
    return result
  }

  return { value }
}

async function dictionariesIn(asar, file) {
  const source = asar.read(file)
  const { value } = createResolver(asar, file, source)
  const found = []
  for (let at = source.indexOf(REGISTER); at !== -1; at = source.indexOf(REGISTER, at + 1)) {
    const args = splitTopLevel(balanced(source, at + REGISTER.length - 1))
    const namespace = await value(args[0])
    let english
    let others = []
    if (args.length === 2) {
      const all = (await value(args[1])) ?? {}
      english = all.en
      others = Object.entries(all).filter(([id, dict]) => id !== 'en' && id !== 'zh' && dict).map(([, dict]) => dict)
    } else {
      // register(ns, locale, dict) 꼴: [['en', 사전], ...] 목록에서 영어를 찾는다.
      const pair = source.match(/\[\s*'en'\s*,\s*([\w{][^\]]*)\]/)
      if (pair) english = await value(pair[1].trim().startsWith('{') ? '{' + balanced(pair[1], 0) + '}' : pair[1].trim())
    }
    found.push({ namespace, english, others, call: args.join(', ').replace(/\s+/g, ' ').slice(0, 80) })
  }
  return found
}

const isDictionary = (value) =>
  value !== null && typeof value === 'object' && Object.values(value).every((v) => typeof v === 'string')

function shippedCheck(asar, packageName, english) {
  const lib = `${PACKAGES}${packageName}/lib/`
  const built = asar.paths().filter((p) => p.startsWith(lib) && p.endsWith('.js'))
  if (built.length === 0) return { built: false, missing: [] }
  const bundle = built.map((p) => asar.read(p)).join('\n')
  const escapes = (s) => [s, JSON.stringify(s).slice(1, -1), s.replace(/\n/g, '\\n').replace(/`/g, '\\`')]
  const missing = Object.entries(english)
    .filter(([, text]) => text.length > 0 && !escapes(text).some((variant) => bundle.includes(variant)))
    .map(([key]) => key)
  return { built: true, missing }
}

function mainProcessDictionary(asar) {
  const main = asar.read('/lib/main.js')
  const m = main.match(/\b(?:const|let|var)\s+en\s*=\s*\{/)
  if (!m) return null
  const body = balanced(main, m.index + m[0].length - 1)
  try {
    const dict = Function(`"use strict"; return ({${body}})`)()
    return isDictionary(dict) ? dict : null
  } catch {
    return null
  }
}

// 플러그인 카드에 보이는 이름·설명. 화면 사전이 아니라 각 패키지의 locale/<언어>.json(meta)에 들어 있다.
// 키는 "<패키지>:title", "<패키지>:description"이고, 같은 패키지가 다른 내용으로 또 있으면 "@2"를 붙인다.
// 영어 제목이 패키지 이름 조각 그대로(ui-chat, agent-loop 등)인 내부 모듈은 문구가 아니라 식별자라서 뺀다.
function packageTexts(asar) {
  const english = {}
  const verbatim = []
  let identifiers = 0
  const isIdentifier = (name, text) =>
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text) && (name === text || name.endsWith(`-${text}`) || name.endsWith(`/${text}`))
  const read = (path) => {
    try {
      const meta = JSON.parse(asar.read(path).toString('utf8')).meta
      return meta !== null && typeof meta === 'object' ? meta : {}
    } catch {
      return {}
    }
  }
  const marker = '/node_modules/'
  for (const path of asar.paths().filter((p) => p.endsWith('/locale/en.json') && p.includes(marker)).sort()) {
    const folder = path.slice(0, -'en.json'.length)
    const name = path.slice(path.lastIndexOf(marker) + marker.length, -'/locale/en.json'.length)
    const meta = read(path)
    const others = asar.paths()
      .filter((p) => p.startsWith(folder) && p.endsWith('.json') && p !== path && !p.slice(folder.length).includes('/'))
      .map(read)
    for (const field of ['title', 'description']) {
      const text = meta[field]
      if (typeof text !== 'string' || text === '') continue
      if (field === 'title' && isIdentifier(name, text)) {
        identifiers++
        continue
      }
      let key = `${name}:${field}`
      for (let copy = 2; key in english && english[key] !== text; copy++) key = `${name}@${copy}:${field}`
      if (key in english) continue
      english[key] = text
      if (others.length >= 2 && others.every((other) => other[field] === text)) verbatim.push(key)
    }
  }
  return { english, verbatim, identifiers }
}

export async function extract({ app, out }) {
  const resources = join(app, 'Contents/Resources')
  const version = JSON.parse(readFileSync(join(resources, 'runtime/primary-runtime/runtime.json'), 'utf8')).desktopVersion
  const asar = openAsar(join(resources, 'app.asar'))
  const files = asar.paths().filter((p) =>
    p.startsWith(PACKAGES) && /\/src\/.*\.tsx?$/.test(p) && !p.slice(PACKAGES.length).includes('/node_modules/'))

  const namespaces = {}
  const problems = []
  for (const file of files) {
    if (!asar.read(file).includes(REGISTER)) continue
    const relative = file.slice(PACKAGES.length)
    const packageName = relative.split('/')[0]
    for (const { namespace, english, others, call } of await dictionariesIn(asar, file)) {
      if (typeof namespace !== 'string' || !isDictionary(english)) {
        problems.push({ file: relative, call, reason: '네임스페이스나 영어 사전을 찾지 못했습니다' })
      } else if (namespaces[namespace]) {
        problems.push({ file: relative, call, reason: `네임스페이스 ${namespace}가 두 번 등록됩니다` })
      } else {
        const { built, missing } = shippedCheck(asar, packageName, english)
        // 앱이 다른 언어에서도 영어 그대로 둔 값은 번역하지 않는 말일 가능성이 높다.
        const verbatim = others.length < 2 ? [] : Object.keys(english).filter((key) =>
          english[key] !== '' && others.every((dict) => dict[key] === english[key]))
        namespaces[namespace] = { package: `@deepseek-ai/${packageName}`, file: relative, english, built, missing, verbatim }
      }
    }
  }

  const target = join(out, version)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(join(target, 'en'), { recursive: true })
  const index = { appVersion: version, namespaces: {} }
  for (const name of Object.keys(namespaces).sort()) {
    const entry = namespaces[name]
    writeFileSync(join(target, 'en', `${name}.json`), JSON.stringify(entry.english, null, 2) + '\n')
    index.namespaces[name] = {
      package: entry.package,
      file: entry.file,
      keys: Object.keys(entry.english).length,
      ...(entry.built ? {} : { builtBundle: false }),
      ...(entry.missing.length ? { notFoundInBuiltBundle: entry.missing } : {}),
      ...(entry.verbatim.length ? { sameInEveryLanguage: entry.verbatim } : {})
    }
  }
  const main = mainProcessDictionary(asar)
  if (main) writeFileSync(join(target, 'main-en.json'), JSON.stringify(main, null, 2) + '\n')
  else problems.push({ file: 'lib/main.js', call: 'const en = {…}', reason: '메인 프로세스 사전을 읽지 못했습니다' })
  index.mainProcessKeys = main ? Object.keys(main).length : 0
  const packages = packageTexts(asar)
  writeFileSync(join(target, 'packages-en.json'), JSON.stringify(packages.english, null, 2) + '\n')
  index.packages = {
    keys: Object.keys(packages.english).length,
    identifierTitles: packages.identifiers,
    ...(packages.verbatim.length ? { sameInEveryLanguage: packages.verbatim } : {})
  }
  if (problems.length) index.problems = problems
  writeFileSync(join(target, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  asar.close()
  return { version, target, index, problems }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const { version, target, index, problems } = await extract({
    app: option('--app', '/Applications/DeepSeek Harness.app'),
    out: resolve(option('--out', join(root, 'source')))
  })
  const names = Object.keys(index.namespaces)
  const keys = names.reduce((sum, name) => sum + index.namespaces[name].keys, 0)
  const drift = names.filter((name) => index.namespaces[name].notFoundInBuiltBundle)
  console.log(`앱 버전 ${version}: 네임스페이스 ${names.length}개, 키 ${keys}개 → ${target}`)
  console.log(`메인 프로세스 사전(적용 불가, 참고용): ${index.mainProcessKeys}키`)
  console.log(`플러그인 카드 이름·설명: ${index.packages.keys}키`)
  if (drift.length) console.log(`빌드 결과물에서 원문을 찾지 못한 키가 있는 네임스페이스: ${drift.join(', ')}`)
  for (const p of problems) console.log(`확인 필요: ${p.file} :: ${p.call} (${p.reason})`)
  process.exitCode = problems.length ? 1 : 0
}
