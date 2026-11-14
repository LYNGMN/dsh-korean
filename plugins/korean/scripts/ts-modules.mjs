// asar 안의 TypeScript 모듈을 디스크에 풀지 않고 불러온다.
// 사전 파일은 거의 순수한 데이터라서, 상대 경로 .ts 가져오기만 따라가고
// 그 밖의 가져오기(패키지, .tsx, .css)는 아무 일도 하지 않는 대역으로 바꾼다.
import { registerHooks, stripTypeScriptTypes } from 'node:module'

const SCHEME = 'dshasar:'
const IMPORT = /^[ \t]*(import|export)\s+([^'"]*?)\s+from\s+(['"])([^'"]+)\3;?[ \t]*$/gm
const SIDE_EFFECT_IMPORT = /^[ \t]*import\s+(['"])([^'"]+)\1;?[ \t]*$/gm

let installedFor = null

function stub() {
  const target = function () {}
  return new Proxy(target, {
    get: (_, key) => {
      // 대역이 글자로 바뀌어 사전에 섞이면 빈 문구가 생기므로, 그 순간 멈춘다.
      if (key === Symbol.toPrimitive) return () => { throw new Error('대역 값이 문구에 쓰였습니다') }
      return key === 'then' ? undefined : stub()
    },
    apply: () => stub(),
    construct: () => stub()
  })
}

// '@deepseek-ai/패키지/하위경로'를 그 패키지의 TypeScript 원본으로 잇는다.
function resolvePackage(asar, specifier) {
  const m = specifier.match(/^(@deepseek-ai\/[^/]+)(\/.+)?$/)
  if (!m) return null
  const base = `/dsh/node_modules/${m[1]}`
  if (!asar.has(`${base}/package.json`)) return null
  const entry = JSON.parse(asar.read(`${base}/package.json`)).exports?.[`.${m[2] ?? ''}`]
  const built = typeof entry === 'string' ? entry : entry?.default
  if (typeof built !== 'string') return null
  const relative = built.replace(/^\.\//, '').replace(/\.js$/, '.ts')
  const candidates = [relative.replace(/^lib\/types\//, 'src/'), relative.replace(/^lib\//, 'src/')]
  return candidates.map((c) => `${base}/${c}`).find((c) => asar.has(c)) ?? null
}

export function resolveInAsar(asar, specifier, parentPath) {
  if (!specifier.startsWith('.')) return resolvePackage(asar, specifier)
  const resolved = new URL(specifier, `file://${parentPath}`).pathname
  return asar.has(resolved) && resolved.endsWith('.ts') ? resolved : null
}

function bindingsToStub(clause) {
  const lines = []
  const named = clause.match(/\{([^}]*)\}/)
  const rest = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim()
  const namespace = rest.match(/\*\s+as\s+(\w+)/)
  if (namespace) lines.push(`const ${namespace[1]} = globalThis.__dshStub();`)
  else if (rest) lines.push(`const ${rest} = globalThis.__dshStub();`)
  if (named) {
    for (const part of named[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const local = part.split(/\s+as\s+/).pop()
      lines.push(`const ${local} = globalThis.__dshStub();`)
    }
  }
  return lines.join(' ')
}

function rewrite(asar, source, path) {
  const code = stripTypeScriptTypes(source, { mode: 'transform' })
  return code
    .replace(SIDE_EFFECT_IMPORT, (line, _q, specifier) =>
      resolveInAsar(asar, specifier, path) ? line : '')
    .replace(IMPORT, (line, keyword, clause, _q, specifier) => {
      const target = resolveInAsar(asar, specifier, path)
      if (target) return `${keyword} ${clause} from '${SCHEME}${target}'`
      return keyword === 'import' ? bindingsToStub(clause) : ''
    })
}

export function installAsarModules(asar) {
  if (installedFor === asar) return
  if (installedFor) throw new Error('asar 모듈 불러오기는 한 번만 설치할 수 있습니다')
  installedFor = asar
  globalThis.__dshStub = stub
  process.removeAllListeners('warning')
  process.on('warning', (warning) => {
    if (warning.name !== 'ExperimentalWarning') console.warn(warning)
  })
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith(SCHEME)) return { url: specifier, format: 'module', shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (!url.startsWith(SCHEME)) return next(url, context)
      const path = url.slice(SCHEME.length)
      return { format: 'module', source: rewrite(asar, asar.read(path), path), shortCircuit: true }
    }
  })
}

export function importFromAsar(asar, path) {
  installAsarModules(asar)
  return import(`${SCHEME}${path}`)
}
