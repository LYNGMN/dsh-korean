import { DEFAULT_OVERLAY, DEFAULT_ROOTS, discover, hintsFor, loadOverlay } from './skills.js'
import { createSync, DEFAULT_SCRIPT } from './sync.js'
import { createText, registerLocalized, resolveLocale, watchLocale } from './host-locale.js'

/**
 * 스킬 힌트 — 감싸개 설명 방식(`dsh-sync-skills`)을 돕는다.
 *
 * 1. 입력 안내: 화면 번들(client.js)이 `/스킬` 뒤에 회색 입력 안내를 그리도록 안내 목록을 내준다.
 * 2. 언어 맞추기: DSH 언어가 바뀌면(그리고 켜질 때) 감싸개 설명을 그 언어로 다시 쓰고,
 *    켜져 있는 DSH는 메뉴를 다시 읽지 않으니 화면에 재시작 알림을 띄우게 한다.
 * 3. `/skill-hints` 명령 하나: 상태를 보여 주고 `/skill-hints sync`로 바로 맞춘다.
 *
 * 스킬 제공자는 쓰지 않는다. DSH는 작업 모드마다 스킬 파일을 다시 읽어 플러그인 쪽 같은 이름을 덮는다.
 */
export const name = 'skill-hints'
export const inject = []
export const ROUTE_PATH = '/api/dsh-skill-hints'
export const COMMAND = 'skill-hints'

const TEXT = {
  en: {
    commandDescription: 'Check the skill menu descriptions and match them to your DSH language',
    commandHint: '[sync]',
    title: 'Skill hints',
    language: 'Language: {name}',
    skills: 'Skills you can call with /: {total} (user-only {userOnly}, with input hints {hinted})',
    missing: 'User-only skills without a Korean summary: {count}',
    scriptMissing: 'Sync script not found: {path}. Menu descriptions stay as the skill files have them.',
    inSync: 'The skill menu is up to date for this language.',
    outOfSync: '{count} skill menu entries need updating (descriptions or new skills). Run /skill-hints sync.',
    checkFailed: 'Could not check the skill menu (the sync script failed).',
    synced: 'Updated {count} skill menu entries.',
    nothingToSync: 'Nothing to update.',
    syncFailed: 'The sync script failed. Run ~/.agents/bin/dsh-sync-skills --apply in a terminal to see why.',
    restart: 'Quit DSH completely (⌘Q) and open it again to see the new descriptions in the / menu.',
    unknown: 'Unknown option "{arg}". Use /skill-hints or /skill-hints sync.',
  },
  ko: {
    commandDescription: '스킬 메뉴 설명 상태를 보고 DSH 언어에 맞춰요',
    commandHint: '[sync]',
    title: '스킬 힌트',
    language: '언어: {name}',
    skills: '/로 부를 수 있는 스킬: {total}개 (사용자 전용 {userOnly}개, 입력 안내 있음 {hinted}개)',
    missing: '한국어 요약이 없는 사용자 전용 스킬: {count}개',
    scriptMissing: '맞추는 스크립트가 없어요: {path}. 메뉴 설명은 스킬 파일에 적힌 그대로예요.',
    inSync: '스킬 메뉴가 지금 언어와 맞아요.',
    outOfSync: '스킬 메뉴에서 맞출 것이 {count}건 있어요(설명이나 새 스킬). /skill-hints sync로 맞출 수 있어요.',
    checkFailed: '스킬 메뉴를 확인하지 못했어요(맞추는 스크립트가 실패했어요).',
    synced: '스킬 메뉴 {count}건을 맞췄어요.',
    nothingToSync: '맞출 것이 없어요.',
    syncFailed: '맞추는 스크립트가 실패했어요. 터미널에서 ~/.agents/bin/dsh-sync-skills --apply를 실행하면 이유가 보여요.',
    restart: 'DSH를 완전히 종료(⌘Q)했다가 다시 켜야 / 메뉴에 새 설명이 보여요.',
    unknown: '"{arg}"는 모르는 옵션이에요. /skill-hints 또는 /skill-hints sync를 써 주세요.',
  },
}
const LANGUAGE_NAME = { ko: '한국어', en: 'English' }

/** 상태 보고 글. 순수 함수라 시험에서 바로 부른다. */
export function reportText(t, { locale, skills, check, applied, restart, script }) {
  const lines = [t('title'), '', `- ${t('language', { name: LANGUAGE_NAME[locale] ?? locale })}`]
  const userOnly = skills.filter((skill) => skill.userOnly)
  lines.push(`- ${t('skills', { total: skills.length, userOnly: userOnly.length, hinted: skills.filter((skill) => skill.hint).length })}`)
  if (locale === 'ko') {
    const missing = userOnly.filter((skill) => !skill.summary).map((skill) => skill.name)
    lines.push(`- ${t('missing', { count: missing.length })}${missing.length ? `: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}` : ''}`)
  }
  if (applied !== undefined) {
    if (!applied.available) lines.push(`- ${t('scriptMissing', { path: script })}`)
    else if (!applied.ok) lines.push(`- ${t('syncFailed')}`)
    else lines.push(`- ${applied.changed > 0 ? t('synced', { count: applied.changed }) : t('nothingToSync')}`)
  } else if (check !== undefined) {
    if (!check.available) lines.push(`- ${t('scriptMissing', { path: script })}`)
    else if (!check.ok) lines.push(`- ${t('checkFailed')}`)
    else lines.push(`- ${check.changed > 0 ? t('outOfSync', { count: check.changed }) : t('inSync')}`)
  }
  if (restart) lines.push('', t('restart'))
  return lines.join('\n')
}

/**
 * @param {object} ctx DSH Host 플러그인 문맥
 * @param {{ roots?: string[], overlay?: string, script?: string, sync?: ReturnType<typeof createSync> }} [config]
 */
export function apply(ctx, config = {}) {
  const roots = Array.isArray(config?.roots) && config.roots.length > 0 ? config.roots : DEFAULT_ROOTS
  const overlayPath = config?.overlay ?? DEFAULT_OVERLAY
  const script = config?.script ?? DEFAULT_SCRIPT
  const sync = config?.sync ?? createSync({ script })
  const t = createText(ctx, TEXT)
  const logger = typeof ctx?.logger === 'function' ? ctx.logger('dsh-skill-hints') : undefined
  const state = { restart: false }
  const skills = () => discover(roots, loadOverlay(overlayPath))

  /** 감싸개 설명을 지금 언어로 다시 쓴다. 바뀐 것이 있으면 재시작 알림을 켠다. */
  const match = async () => {
    const locale = resolveLocale(ctx)
    const result = await sync.apply(locale)
    if (result.ok && result.changed > 0) {
      state.restart = true
      logger?.info?.(`rewrote ${result.changed} skill descriptions for ${locale}; restart DSH to see them`)
    } else if (result.available && !result.ok) {
      logger?.warn?.('dsh-sync-skills failed')
    }
    return result
  }
  const ready = match()
  watchLocale(ctx, () => { void match() })

  const json = (body) => Response.json(body, { headers: { 'cache-control': 'no-store' } })
  const route = async () => {
    await ready.catch(() => {})
    const locale = resolveLocale(ctx)
    return json({ locale, hints: hintsFor(skills(), locale), restart: state.restart })
  }

  const handler = async (invocation) => {
    const arg = String(invocation?.rawInput ?? '').trim().toLowerCase()
    if (arg !== '' && arg !== 'sync') return { kind: 'error', text: t('unknown', { arg }) }
    await ready.catch(() => {})
    const locale = resolveLocale(ctx)
    if (arg === 'sync') {
      const applied = await match()
      return { kind: applied.available && !applied.ok ? 'error' : 'success', text: reportText(t, { locale, skills: skills(), applied, restart: state.restart, script }) }
    }
    const check = await sync.check(locale)
    return { kind: 'success', text: reportText(t, { locale, skills: skills(), check, restart: state.restart, script }) }
  }

  if (typeof ctx?.inject === 'function') {
    ctx.inject(['connection'], (scope) => {
      scope.effect(() => scope.connection.fetch.register({ path: ROUTE_PATH, methods: ['GET'], requestBody: 'buffered', fetch: route }), 'dsh-skill-hints: route')
    })
    ctx.inject(['commands'], (scope) => {
      // 설명·안내는 등록할 때 정해지므로 언어가 바뀌면 다시 등록한다.
      registerLocalized(scope, (locale) => scope.commands.register({
        name: COMMAND,
        description: t('commandDescription', undefined, locale),
        input: { hint: t('commandHint', undefined, locale) },
        recordInput: false,
        handler,
      }))
    })
  }
  return { state, ready, route, handler }
}
