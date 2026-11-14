#!/usr/bin/env node
// 번역 사전을 영어 원문과 대조한다. 문제가 하나라도 있으면 실패 코드로 끝난다.
// 사용법: node scripts/check.mjs [--allow-incomplete] [--consistency] [--version <앱 버전>]
import { fileURLToPath } from 'node:url'
import { loadProject } from './dictionary.mjs'

const PLACEHOLDER = /\{\w+\}/g
const HANGUL = /[가-힣]/
const INVISIBLE = /[​‌‍⁠﻿]/
const DASH = /[—–]/
const PLURAL = /\.(one|other)$/

const placeholders = (text) => (text.match(PLACEHOLDER) ?? []).sort().join(' ')
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 플레이스홀더, 영어로 두는 말, 숫자·기호를 빼고도 영어 낱말이 남는지 본다.
function hasTranslatableWords(text, keep) {
  let rest = text.replace(PLACEHOLDER, ' ').replace(/https?:\/\/\S+/g, ' ')
  for (const word of [...keep].sort((a, b) => b.length - a.length)) {
    rest = rest.replace(new RegExp(`(?<![A-Za-z])${escapeRegExp(word)}(?![A-Za-z])`, 'g'), ' ')
  }
  return /[A-Za-z]{2,}/.test(rest)
}

function termPattern(term) {
  const words = term.trim().split(/\s+/).map(escapeRegExp)
  return new RegExp(`(?<![A-Za-z-])${words.join('[\\s-]+')}(?:s|es)?(?![A-Za-z-])`, 'i')
}

// 플러그인 카드 문구를 검사할 때 쓰는 가짜 네임스페이스 이름. 용어집의 verbatimKeys·exceptions에도 이 이름을 쓴다.
export const PACKAGES = '@packages'

// 앱 본체(메인 프로세스) 문구를 검사할 때 쓰는 가짜 네임스페이스 이름.
export const DESKTOP = '@desktop'

function withPackages({ english, korean, sameInEveryLanguage = {}, packages, desktop }) {
  const extra = [[PACKAGES, packages], [DESKTOP, desktop]].filter(([, set]) => set)
  if (extra.length === 0) return { english, korean, sameInEveryLanguage }
  const add = (base, pick) => ({ ...base, ...Object.fromEntries(extra.map(([name, set]) => [name, pick(set)])) })
  return {
    english: add(english, (set) => set.english),
    korean: add(korean, (set) => set.korean),
    sameInEveryLanguage: add(sameInEveryLanguage, (set) => set.sameInEveryLanguage ?? [])
  }
}

export function check({ glossary, allowIncomplete = false, ...project }) {
  const { english, korean, sameInEveryLanguage } = withPackages(project)
  const issues = []
  const report = (rule, namespace, key, message) => issues.push({ rule, namespace, key, message })
  const terms = (glossary.terms ?? [])
    .filter((term) => term.enforce !== false)
    .map((term) => ({ ...term, pattern: termPattern(term.en), accepted: [].concat(term.ko) }))
  const keep = glossary.keep ?? []
  const progress = {}

  for (const namespace of Object.keys(korean)) {
    if (!english[namespace]) report('unknown-namespace', namespace, '', '원문에 없는 네임스페이스입니다')
  }

  for (const [namespace, source] of Object.entries(english)) {
    const target = korean[namespace] ?? {}
    const allowedEnglish = new Set([
      ...(sameInEveryLanguage[namespace] ?? []),
      ...(glossary.verbatimKeys?.[namespace] ?? [])
    ])
    const exempt = new Set(glossary.exceptions?.[namespace] ?? [])
    // 한 문장을 여러 키로 쪼갠 조각. 한국어는 어순이 달라 빈 값과 앞뒤 공백이 원문과 달라질 수 있다.
    const fragments = new Set(glossary.fragments?.[namespace] ?? [])
    let done = 0

    for (const key of Object.keys(target)) {
      if (!(key in source)) report('unknown-key', namespace, key, '원문에 없는 키입니다')
    }

    for (const [key, original] of Object.entries(source)) {
      if (!(key in target)) {
        if (!allowIncomplete) report('missing-key', namespace, key, '번역이 없습니다')
        else if (PLURAL.test(key)) {
          const sibling = key.replace(PLURAL, (_, form) => (form === 'one' ? '.other' : '.one'))
          if (sibling in target) report('plural-pair', namespace, key, `${sibling}만 있고 짝이 없습니다`)
        }
        continue
      }
      done++
      const text = target[key]
      if (typeof text !== 'string') {
        report('not-a-string', namespace, key, '값이 문자열이 아닙니다')
        continue
      }
      if (text === '' && original !== '' && !fragments.has(key)) report('empty', namespace, key, '번역이 비어 있습니다')
      if (INVISIBLE.test(text)) report('invisible-character', namespace, key, '보이지 않는 문자(U+200B, BOM 등)가 있습니다')
      if (DASH.test(text)) report('dash', namespace, key, '줄표(—, –)를 쓰지 않습니다')
      if (placeholders(text) !== placeholders(original)) {
        report('placeholder', namespace, key, `플레이스홀더가 다릅니다: 원문 [${placeholders(original)}] 번역 [${placeholders(text)}]`)
      }
      if (!fragments.has(key) && (/^\s/.test(text) !== /^\s/.test(original) || /\s$/.test(text) !== /\s$/.test(original))) {
        report('edge-space', namespace, key, '앞뒤 공백이 원문과 다릅니다')
      }
      if (text !== '' && !HANGUL.test(text) && !allowedEnglish.has(key) && hasTranslatableWords(text, keep)) {
        report('untranslated', namespace, key, `한글이 없습니다: "${text.slice(0, 40)}"`)
      }
      if (!exempt.has(key) && HANGUL.test(text)) {
        // 플레이스홀더 이름({provider} 등)은 문구가 아니므로 용어 대조에서 뺀다.
        const prose = original.replace(PLACEHOLDER, ' ')
        for (const term of terms) {
          if (term.pattern.test(prose) && !term.accepted.some((word) => text.includes(word))) {
            report('glossary', namespace, key, `"${term.en}"은(는) "${term.accepted.join('" 또는 "')}"로 옮깁니다`)
          }
        }
      }
    }
    progress[namespace] = { total: Object.keys(source).length, done }
  }

  // 카드 문구는 화면에서 영어 원문으로 찾아 바꾸므로, 같은 원문에 번역이 둘이면 안 된다.
  const byOriginal = new Map()
  for (const [key, original] of Object.entries(english[PACKAGES] ?? {})) {
    const text = korean[PACKAGES]?.[key]
    if (typeof text !== 'string') continue
    if (byOriginal.has(original) && byOriginal.get(original).text !== text) {
      report('package-conflict', PACKAGES, key, `${byOriginal.get(original).key}와 원문이 같은데 번역이 다릅니다`)
    } else byOriginal.set(original, { key, text })
  }
  return { issues, progress }
}

// 같은 영어 문구를 서로 다르게 옮긴 곳을 모은다. 문맥에 따라 달라질 수 있어 실패로 치지 않고 알려만 준다.
export function inconsistencies(project) {
  const { english, korean } = withPackages(project)
  const byOriginal = new Map()
  for (const [namespace, source] of Object.entries(english)) {
    for (const [key, original] of Object.entries(source)) {
      const text = korean[namespace]?.[key]
      if (typeof text !== 'string' || original === '') continue
      const variants = byOriginal.get(original) ?? new Map()
      variants.set(text, [...(variants.get(text) ?? []), `${namespace}/${key}`])
      byOriginal.set(original, variants)
    }
  }
  return [...byOriginal]
    .filter(([, variants]) => variants.size > 1)
    .map(([original, variants]) => ({ original, variants: Object.fromEntries(variants) }))
}

export function summarize(progress) {
  const rows = Object.entries(progress)
  const total = rows.reduce((sum, [, row]) => sum + row.total, 0)
  const done = rows.reduce((sum, [, row]) => sum + row.done, 0)
  return { total, done, percent: total === 0 ? 100 : Math.floor((done / total) * 1000) / 10, rows }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const versionAt = process.argv.indexOf('--version')
  const project = loadProject(versionAt === -1 ? {} : { version: process.argv[versionAt + 1] })
  const allowIncomplete = process.argv.includes('--allow-incomplete')
  const { issues, progress } = check({ ...project, allowIncomplete })
  const summary = summarize(progress)

  for (const [namespace, row] of summary.rows) {
    if (row.done !== row.total) console.log(`  ${namespace}: ${row.done}/${row.total}`)
  }
  console.log(`원문 ${project.version} 기준 번역률 ${summary.percent}% (${summary.done}/${summary.total}키, 네임스페이스 ${Object.keys(project.english).length}개, 플러그인 카드 문구 ${Object.keys(project.packages.english).length}개, 본체 문구 ${Object.keys(project.desktop.english).length}개)`)

  const byRule = {}
  for (const issue of issues) (byRule[issue.rule] ??= []).push(issue)
  for (const [rule, list] of Object.entries(byRule)) {
    console.log(`\n[${rule}] ${list.length}건`)
    for (const issue of list.slice(0, 30)) console.log(`  ${issue.namespace}/${issue.key}: ${issue.message}`)
    if (list.length > 30) console.log(`  … 외 ${list.length - 30}건`)
  }
  if (process.argv.includes('--consistency')) {
    const found = inconsistencies(project)
    console.log(`\n같은 원문을 다르게 옮긴 곳 ${found.length}건(참고용, 실패로 치지 않음)`)
    for (const { original, variants } of found) {
      console.log(`  "${original.replace(/\n/g, '⏎').slice(0, 60)}"`)
      for (const [text, places] of Object.entries(variants)) {
        console.log(`    → "${text.replace(/\n/g, '⏎').slice(0, 60)}" (${places.length}곳: ${places.slice(0, 3).join(', ')}${places.length > 3 ? ' …' : ''})`)
      }
    }
  }
  console.log(issues.length === 0 ? '검사 통과' : `\n검사 실패: 문제 ${issues.length}건`)
  process.exitCode = issues.length === 0 ? 0 : 1
}
