import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 사용자 스킬 폴더를 DSH 파일 제공자와 같은 규칙으로 읽는다.
 * 같은 이름이면 앞 폴더가 이긴다. 감싸개(`<이름>.md`)는 그 안에 적힌 실제 SKILL.md의 입력 안내를 쓴다.
 */
const HOME = homedir()
/** DSH가 사용자 스킬을 읽는 순서(같은 이름이면 앞쪽이 이긴다). */
export const DEFAULT_ROOTS = [join(HOME, '.dsh', 'skills'), join(HOME, '.agents', 'skills')]
/** 한국어 요약·입력 안내 목록(`{ skills: { 이름: { summary, hint } } }`). */
export const DEFAULT_OVERLAY = join(HOME, '.agents', 'skill-hints.json')
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

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

/** SKILL.md 머리말에서 한 줄짜리·접은 칸을 읽는다(YAML 라이브러리 없이). */
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

export function loadOverlay(path = DEFAULT_OVERLAY) {
  try {
    const skills = JSON.parse(read(path) ?? '{}').skills
    return skills && typeof skills === 'object' ? skills : {}
  } catch {
    return {}
  }
}

/**
 * 사람이 `/`로 부를 수 있는 스킬(`user-invocable: false`가 아닌 것)을 찾는다.
 * @returns {{ name: string, userOnly: boolean, description: string, hint?: string, summary?: string }[]}
 */
export function discover(roots = DEFAULT_ROOTS, overlay = loadOverlay()) {
  const seen = new Set()
  const found = []
  for (const root of roots) {
    for (const entry of entries(root)) {
      const path = join(root, entry)
      const file = isDir(path) ? join(path, 'SKILL.md') : entry.endsWith('.md') ? path : undefined
      if (file === undefined) continue
      const own = read(file)
      if (own === undefined) continue
      const meta = frontmatter(own)
      if (!meta.name || !meta.description || !SKILL_NAME.test(meta.name) || seen.has(meta.name)) continue
      seen.add(meta.name)
      if (meta['user-invocable'] === 'false') continue
      const target = wrappedSkill(own)
      const source = frontmatter((target !== undefined && read(target)) || own)
      const extra = overlay[source.name ?? meta.name] ?? overlay[meta.name] ?? {}
      const skill = { name: meta.name, userOnly: meta['disable-model-invocation'] === 'true', description: meta.description }
      const hint = String(source['argument-hint'] || extra.hint || '').trim()
      if (hint) skill.hint = hint
      const summary = String(extra.summary ?? '').trim()
      if (summary) skill.summary = summary
      found.push(skill)
    }
  }
  return found
}

/**
 * 화면에 넘길 AI 호출 가능 스킬의 메뉴 설명 `{ 이름: '요약 · 안내' }`. 한국어일 때만 준다.
 * 이런 스킬은 AI가 읽는 설명이라 파일은 원문 그대로 두고, `/` 메뉴 글자만 이 요약으로 바꾼다.
 */
export function labelsFor(skills, locale) {
  if (locale !== 'ko') return {}
  const out = {}
  for (const skill of skills) {
    if (skill.userOnly || !skill.summary) continue
    out[skill.name] = skill.hint ? `${skill.summary} · ${skill.hint}` : skill.summary
  }
  return out
}

/** 화면에 넘길 입력 안내 `{ 이름: 안내 }`. 안내 글이 한국어로 쓰여 있어 한국어일 때만 준다. */
export function hintsFor(skills, locale) {
  if (locale !== 'ko') return {}
  const out = {}
  for (const skill of skills) if (skill.hint) out[skill.name] = skill.hint
  return out
}
