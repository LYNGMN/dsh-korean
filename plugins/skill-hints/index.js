import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveLocale, watchLocale } from './host-locale.js'

/**
 * 스킬 힌트 — `/` 메뉴의 사람 전용 스킬 설명을 DSH 언어에 맞춘다.
 *
 * DSH는 `/` 메뉴에 "명령"과 "스킬"을 따로 보여 주고, 같은 이름이어도 합치지 않는다.
 * 그래서 명령을 따로 등록하지 않고, 스킬 제공자(`ctx.skills.registerProvider`)로
 * 같은 스킬을 사용자 폴더보다 앞선 순위로 다시 내놓아 스킬 줄 하나의 설명만 바꾼다.
 * 한국어면 오버레이의 한국어 요약(없으면 영어)과 입력 힌트, 그 밖은 원문 description
 * 앞부분(160자)을 쓴다. 본문·경로·호출 범위는 DSH 파일 제공자와 똑같이 둔다.
 *
 * 모델도 부르는 스킬은 건드리지 않는다. description은 모델이 스킬을 고르는 글이기도
 * 해서 언어마다 바뀌면 안 된다(host-locale.js 머리말).
 */
export const name = 'skill-hints'
export const inject = ['skills']

/** 제공자 이름. `runtime`은 DSH가 따로 쓴다. */
export const PROVIDER = 'skill-hints'
/**
 * DSH 파일 스킬 순위: 프로젝트 100·200, 사용자 지정 폴더 300, ~/.dsh/skills 400, ~/.agents/skills 500.
 * 작을수록 이긴다. 사용자 지정 폴더는 그대로 이기게 두고 두 사용자 폴더만 앞선다.
 */
export const RANK = 350

const HOME = homedir()
/** DSH가 사용자 스킬을 읽는 순서와 출처 이름(같은 이름이면 앞쪽이 이긴다). */
export const DEFAULT_ROOTS = [
  { path: join(HOME, '.dsh', 'skills'), source: 'user-dsh' },
  { path: join(HOME, '.agents', 'skills'), source: 'user-agents' },
]
/** 한국어 힌트·요약 한 곳(~/.agents/bin/skill-hints-sync가 원본에 넣는 것과 같은 목록). */
export const DEFAULT_OVERLAY = join(HOME, '.agents', 'skill-hints.json')
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const DESCRIPTION_MAX = 160

function read(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

function unquote(value) {
  const v = value.trim()
  if (v.length >= 2 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'")) {
    return v[0] === '"' ? v.slice(1, -1).replace(/\\"/gu, '"').replace(/\\\\/gu, '\\') : v.slice(1, -1)
  }
  return v
}

/** SKILL.md 머리말에서 필요한 칸만 읽는다(YAML 라이브러리 없이). */
export function frontmatter(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return {}
  const end = text.indexOf('\n---', 3)
  if (end < 0) return {}
  const lines = text.slice(3, end).split('\n')
  const out = {}
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/u.exec(lines[i])
    if (!m) continue
    let value = m[2].trim()
    if (value === '' || /^[|>][+-]?$/u.test(value)) {
      const block = []
      while (i + 1 < lines.length && (/^\s/u.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i].trim())
      value = block.filter(Boolean).join(' ')
    } else {
      value = unquote(value)
    }
    out[m[1]] = value
  }
  return out
}

/** 머리말 뒤 본문. DSH 파일 제공자처럼 `---` 한 줄로 닫힌 곳 다음부터 읽고 앞뒤 공백을 뗀다. */
export function body(text) {
  const lines = String(text ?? '').split('\n')
  if (lines[0]?.replace(/\r$/u, '') !== '---') return undefined
  const close = lines.findIndex((line, i) => i > 0 && line.replace(/\r$/u, '') === '---')
  return close < 0 ? undefined : lines.slice(close + 1).join('\n').trim()
}

/** 감싸개(.md)가 가리키는 실제 SKILL.md 경로. */
function wrappedSkill(text) {
  const m = /`(\/[^`\n]+\/SKILL\.md)`/u.exec(text)
  return m ? m[1] : undefined
}

function entries(root) {
  try {
    return readdirSync(root).sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function realPath(path) {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** 공백을 정리하고 160자를 넘으면 단어 경계에서 줄여 "…"를 붙인다. */
export function shorten(text) {
  const t = String(text ?? '').replace(/\s+/gu, ' ').trim()
  if (t.length <= DESCRIPTION_MAX) return t
  const cut = t.slice(0, DESCRIPTION_MAX - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** 한국어 요약·힌트 오버레이(`{ skills: { 이름: { summary, hint } } }`). */
export function loadOverlay(path = DEFAULT_OVERLAY) {
  try {
    const skills = JSON.parse(read(path) ?? '{}').skills
    return skills && typeof skills === 'object' ? skills : {}
  } catch {
    return {}
  }
}

function normalizeRoots(roots) {
  return roots.map((root, i) => (typeof root === 'string' ? { path: root, source: i === 0 ? 'user-dsh' : 'user-agents' } : root))
}

/**
 * 사람 전용(`disable-model-invocation: true`) 스킬을 DSH와 같은 규칙으로 찾는다.
 * 같은 이름은 앞 폴더가 이기고, 이긴 쪽이 모델도 부르는 스킬이거나 `user-invocable: false`면 뺀다.
 * @returns {{ name: string, source: string, locator: { path: string, directory: string }, whenToUse?: string, hint?: string, summaryKo?: string, summaryEn: string }[]}
 */
export function discover(roots = DEFAULT_ROOTS, overlay = loadOverlay()) {
  const seen = new Set()
  const found = []
  for (const root of normalizeRoots(roots)) {
    for (const entry of entries(root.path)) {
      const path = join(root.path, entry)
      const locator = isDir(path)
        ? { path: join(path, 'SKILL.md'), directory: path }
        : entry.endsWith('.md') ? { path, directory: root.path } : undefined
      if (locator === undefined) continue
      const own = read(locator.path)
      if (own === undefined) continue
      const meta = frontmatter(own)
      const skillName = meta.name
      if (!skillName || !meta.description || !SKILL_NAME.test(skillName) || seen.has(skillName)) continue
      seen.add(skillName)
      if (meta['disable-model-invocation'] !== 'true' || meta['user-invocable'] === 'false') continue
      const target = wrappedSkill(own)
      const real = (target !== undefined && read(target)) || own
      const source = frontmatter(real)
      const extra = overlay[source.name ?? skillName] ?? overlay[skillName] ?? {}
      const skill = { name: skillName, source: root.source, locator, summaryEn: shorten(source.description || meta.description) }
      if (meta.whenToUse) skill.whenToUse = meta.whenToUse
      const hint = source['argument-hint'] || extra.hint
      if (hint) skill.hint = hint
      const summaryKo = shorten(extra.summary)
      if (summaryKo) skill.summaryKo = summaryKo
      found.push(skill)
    }
  }
  return found
}

/** 메뉴에 보일 설명. 한국어면 요약(없으면 영어)과 입력 힌트, 그 밖은 영어 원문. 힌트는 한국어로 쓰여 있어 한국어에서만 붙인다. */
export function describe(skill, locale) {
  if (locale !== 'ko') return skill.summaryEn
  const summary = skill.summaryKo || skill.summaryEn
  return skill.hint ? `${summary} · ${skill.hint}` : summary
}

const INVOCATION = Object.freeze({ modelInvocable: false, userInvocable: true })

/** 찾은 스킬 하나를 DSH 스킬 후보로 바꾼다. */
export function candidate(skill, locale) {
  return {
    name: skill.name,
    description: describe(skill, locale),
    ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
    invocation: INVOCATION,
    provider: PROVIDER,
    source: skill.source,
    rank: RANK,
    locator: skill.locator,
    resourceBase: { kind: 'directory', path: skill.locator.directory },
    path: realPath(skill.locator.path),
  }
}

/** 스킬을 부를 때 본문을 파일에서 다시 읽는다. 설명은 원문(모델이 보는 글)을 그대로 둔다. */
export function load(found) {
  const text = read(found.locator.path)
  const content = body(text)
  if (content === undefined) return undefined
  const meta = frontmatter(text)
  if (meta.name !== found.name || !meta.description) return undefined
  return {
    name: found.name,
    description: meta.description,
    ...(found.whenToUse ? { whenToUse: found.whenToUse } : {}),
    invocation: found.invocation,
    source: found.source,
    provider: PROVIDER,
    resourceBase: { kind: 'directory', path: found.locator.directory },
    path: realPath(found.locator.path),
    content,
  }
}

export function apply(ctx, config = {}) {
  if (typeof ctx?.skills?.registerProvider !== 'function') return
  const roots = Array.isArray(config?.roots) && config.roots.length > 0 ? config.roots : DEFAULT_ROOTS
  const overlayPath = config?.overlay ?? DEFAULT_OVERLAY
  ctx.skills.registerProvider((control) => {
    // 언어가 바뀌면 목록을 다시 받게 한다. 스킬 파일이 바뀌면 DSH 파일 제공자가 같은 캐시를 비운다.
    watchLocale(ctx, () => control.invalidate())
    return {
      name: PROVIDER,
      list: async () => {
        const locale = resolveLocale(ctx)
        return discover(roots, loadOverlay(overlayPath)).map((skill) => candidate(skill, locale))
      },
      get: async (listed) => load(listed),
    }
  })
}
