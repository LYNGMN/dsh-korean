// Screen text in the chosen language. Korean is the reference table; a key missing
// from another table falls back to it.
import ko from '../locale/ko.js'
import en from '../locale/en.js'
import ja from '../locale/ja.js'
import zhCN from '../locale/zh-CN.js'
import zhTW from '../locale/zh-TW.js'

export const TABLES = { ko, en, ja, 'zh-CN': zhCN, 'zh-TW': zhTW }
export const DEFAULT_LANG = 'ko'
/** Each language under its own name, so it can be found from any language. */
export const LANGS = [['ko', '한국어'], ['en', 'English'], ['ja', '日本語'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文']]
const SPEECH = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW' }

let current = DEFAULT_LANG

export const lang = () => current
export const speechLang = () => SPEECH[current]
/** Whether this language's input method uses Enter to confirm a conversion. */
export const imeConfirmsWithEnter = () => current === 'ja' || current.startsWith('zh')

export function setLang(next) {
  current = Object.hasOwn(TABLES, next) ? next : DEFAULT_LANG
}

export const hasText = (key) => Object.hasOwn(ko, key)

export function fill(text, vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole)) : text
}

export function t(key, vars) {
  return fill(TABLES[current][key] ?? ko[key] ?? key, vars)
}

/**
 * A text DSH sends per language (`{ en, zh, ko }`): the chosen language, then its
 * base language, then whatever the gateway picked.
 */
export function pickText(byLang, fallback) {
  if (!byLang || typeof byLang !== 'object') return fallback
  const own = byLang[current] ?? byLang[current.split('-')[0]]
  return typeof own === 'string' && own ? own : fallback
}

/** Message for an error code the gateway sent, or the gateway's own message. */
export function errorText(code, status, message) {
  if (hasText(`err.${code}`)) return t(`err.${code}`)
  if (status === 502) return t('err.upstream')
  return message ?? t('err.failed')
}
