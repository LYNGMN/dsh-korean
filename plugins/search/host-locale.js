import { execFileSync } from 'node:child_process'

/**
 * Host-side language for this plugin's own user-facing text: command
 * descriptions, input hints, command results and log lines.
 *
 * DSH translates its own commands and the browser half of a plugin
 * (`ctx.locale`), but a Host command definition carries plain strings. This
 * module picks the language the same way the GUI does and lets the plugin
 * register its commands again when the user changes the language.
 *
 * Language order:
 *   1. `locale.preference` in the Host settings (Settings → General).
 *   2. The process environment: when LC_ALL / LC_MESSAGES / LANG are all
 *      missing, the macOS preferred languages (what the desktop shell gives the
 *      GUI); otherwise `Intl` and then those variables.
 *   3. English.
 *
 * Text meant for the model (tool descriptions, tool results, steering prompts)
 * must not go through this module: it stays in one language so the request
 * does not change with the GUI language.
 *
 * Copied into each plugin on purpose: a plugin never imports another plugin.
 */

export const SUPPORTED_LOCALES = Object.freeze(['en', 'ko'])
export const FALLBACK_LOCALE = 'en'
/** Settings namespace and field owned by DSH's locale plugin. */
export const LOCALE_NAMESPACE = 'locale'
export const LOCALE_PREFERENCE_FIELD = 'preference'
/** Host event fired when one settings namespace changed. */
export const SETTINGS_UPDATED_EVENT = 'settings/document-updated'

const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*/u

/** Map any language tag (`ko-KR`, `ko_KR.UTF-8`, `en`) to a supported locale, or undefined when empty. */
export function pickLocale(id) {
  if (typeof id !== 'string') return undefined
  const match = LANGUAGE_TAG.exec(id.trim())
  if (match === null) return undefined
  const primary = match[0].split(/[-_]/u)[0].toLowerCase()
  if (primary === 'c' || primary === 'posix') return undefined
  return SUPPORTED_LOCALES.includes(primary) ? primary : FALLBACK_LOCALE
}

function settingsService(ctx) {
  try {
    return typeof ctx?.get === 'function' ? ctx.get('settings') : undefined
  } catch {
    return undefined
  }
}

/** The language chosen in DSH settings, or undefined while the GUI follows the system. */
export function storedPreference(ctx) {
  const settings = settingsService(ctx)
  if (typeof settings?.describe !== 'function') return undefined
  try {
    const row = settings.describe().find((descriptor) => descriptor?.ns === LOCALE_NAMESPACE)
    const value = row?.value?.[LOCALE_PREFERENCE_FIELD] ?? row?.user?.[LOCALE_PREFERENCE_FIELD]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  } catch {
    return undefined
  }
}

/** First entry of `defaults read -g AppleLanguages` output. */
export function parseAppleLanguages(output) {
  const match = /\(\s*"?([A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*)"?/u.exec(String(output ?? ''))
  return match === null ? undefined : match[1]
}

let macLanguageCache
function macLanguage() {
  if (macLanguageCache !== undefined) return macLanguageCache || undefined
  try {
    const output = execFileSync('/usr/bin/defaults', ['read', '-g', 'AppleLanguages'], {
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    macLanguageCache = parseAppleLanguages(output) ?? ''
  } catch {
    macLanguageCache = ''
  }
  return macLanguageCache || undefined
}

function intlLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return undefined
  }
}

/** The language of the running system, used while DSH has no stored preference. */
export function environmentLocale(env = process.env, platform = process.platform) {
  const explicit = env?.LC_ALL || env?.LC_MESSAGES || env?.LANG || undefined
  // A GUI-launched Host has no locale variables, so Intl only reports ICU's
  // default (en-US). The desktop shell gives the GUI the macOS languages.
  if (explicit === undefined && platform === 'darwin') {
    const system = macLanguage()
    if (pickLocale(system) !== undefined) return system
  }
  const intl = intlLocale()
  if (explicit === undefined || pickLocale(intl) !== undefined) return intl ?? explicit
  return explicit
}

/** The locale this plugin's Host text should use right now. */
export function resolveLocale(ctx) {
  return pickLocale(storedPreference(ctx)) ?? pickLocale(environmentLocale()) ?? FALLBACK_LOCALE
}

function fill(template, params) {
  return template.replace(/\{(\w+)\}/gu, (whole, key) => (params?.[key] === undefined ? whole : String(params[key])))
}

/**
 * Build a lookup over `{ en: {...}, ko: {...} }`. An entry is a string with
 * `{name}` placeholders or a function of the params. Missing entries fall back
 * to English, then to the key itself.
 * @returns {(key: string, params?: object, locale?: string) => string}
 */
export function createText(ctx, dictionary) {
  return (key, params, locale = resolveLocale(ctx)) => {
    const entry = dictionary[locale]?.[key] ?? dictionary[FALLBACK_LOCALE]?.[key]
    if (typeof entry === 'function') return String(entry(params ?? {}))
    return typeof entry === 'string' ? fill(entry, params) : key
  }
}

/**
 * Call `listener` after the DSH language setting changed. The Host emits the
 * settings event while it re-reads its forms, so the listener runs a microtask
 * later and reads the new value.
 * @returns {() => void} unsubscriber (the plugin scope also removes it on unload).
 */
export function watchLocale(ctx, listener) {
  if (typeof ctx?.on !== 'function') return () => {}
  let scheduled = false
  try {
    const off = ctx.on(SETTINGS_UPDATED_EVENT, (ns) => {
      if (ns !== LOCALE_NAMESPACE || scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        try {
          listener()
        } catch {
          // A failed refresh keeps the previous language.
        }
      })
    })
    return typeof off === 'function' ? off : () => {}
  } catch {
    return () => {}
  }
}

/**
 * Run `register(locale)` now and again whenever the language changes.
 * `register` returns the disposer (or disposers) of what it registered; they
 * run before the next registration so a command never appears twice.
 * @param {object} ctx context that can read settings and listen to events.
 * @param {(locale: string) => (Function | Function[] | void)} register
 * @returns {{ readonly locale: string, refresh: () => void }}
 */
export function registerLocalized(ctx, register) {
  let current
  let disposers = []
  const refresh = () => {
    const next = resolveLocale(ctx)
    if (next === current) return
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // Already removed with the plugin scope.
      }
    }
    current = next
    disposers = [register(next)].flat().filter((dispose) => typeof dispose === 'function')
  }
  refresh()
  watchLocale(ctx, refresh)
  return {
    get locale() {
      return current
    },
    refresh
  }
}
