import { randomUUID } from 'node:crypto'
import { createText, registerLocalized, resolveLocale } from './host-locale.js'
import { HELP, boost, grillMe, teamwork } from './prompts.js'

/**
 * Antigravity-style /agy commands for DeepSeek Harness.
 *
 * /agy-plan and /agy-goal are thin aliases: they resolve the session's own
 * agent-scoped /plan and /goal definitions and call their handlers, so plan
 * mode and the goal domain keep their exact shipped behavior. The three prompt
 * commands steer one ordinary user message into the agent and let the model use
 * the tools its preset exposes (ask_user_question, subagent, workflow, ...).
 *
 * Command descriptions, hints and results follow the DSH language
 * (host-locale.js) and are registered again when it changes. The steered
 * prompts in prompts.js stay as they are: they are written for the model.
 */
export const name = 'agy-commands'
export const inject = ['commands']

/** User-facing Host text, by DSH language. */
export const TEXT = Object.freeze({
  en: {
    missing: ({ command }) =>
      `/${command} is not available in this session's agent preset. ` +
      'Switch to the standard preset (or a preset that mounts it) and try again.',
    failed: '/{command} failed: {message}',
    grillStartAsk: 'Starting a requirements interview. It first asks what to do.',
    grillStart: 'Starting a requirements interview, one question at a time.',
    boostStart: 'Starting deep multi-agent reasoning.',
    teamworkStart: 'Starting a long multi-agent project. A scope interview comes first.',
    usage: 'Usage: /{command} <task>',
    unknown: 'Unknown /agy subcommand "{sub}".',
    agyDescription: 'Antigravity-style commands (plan/goal/grill-me/boost/teamwork)',
    agyHint: '<plan|goal|grill-me|boost|teamwork> [task]',
    planDescription: 'Switch plan mode — same as /plan',
    planHint: '[off|message]',
    goalDescription: 'Create and manage a long-running goal — same as /goal',
    goalHint: '[<objective>|clear|edit <objective>|pause|resume]',
    grillDescription: 'Requirements interview before starting (one question at a time)',
    grillHint: '[task]',
    boostDescription: 'Deep multi-agent reasoning for a hard problem',
    boostHint: '<task>',
    teamworkDescription: 'Multi-day multi-agent project (milestones and audits)',
    teamworkHint: '<task>',
  },
  ko: {
    missing: ({ command }) =>
      `/${command} 명령이 이 세션의 에이전트 프리셋에 없습니다. ` +
      '표준 프리셋(또는 이 명령을 넣은 프리셋)으로 바꾼 뒤 다시 시도해 주세요.',
    failed: '/{command} 실패: {message}',
    grillStartAsk: '요구사항 인터뷰를 시작합니다. 무엇을 할지 먼저 물어봅니다.',
    grillStart: '요구사항 인터뷰를 시작합니다. 한 번에 질문 하나씩 진행합니다.',
    boostStart: '심층 다중 에이전트 추론을 시작합니다.',
    teamworkStart: '장기 다중 에이전트 프로젝트를 시작합니다. 먼저 범위 인터뷰를 진행합니다.',
    usage: '사용법: /{command} <할 일>',
    unknown: '알 수 없는 /agy 하위 명령 "{sub}"입니다.',
    agyDescription: 'Antigravity 방식 명령 (plan/goal/grill-me/boost/teamwork)',
    agyHint: '<plan|goal|grill-me|boost|teamwork> [할 일]',
    planDescription: '계획 모드 전환 — /plan과 동일',
    planHint: '[off|메시지]',
    goalDescription: '장기 목표 생성·관리 — /goal과 동일',
    goalHint: '[<목표>|clear|edit <목표>|pause|resume]',
    grillDescription: '시작 전 요구사항 인터뷰 (한 번에 질문 하나)',
    grillHint: '[할 일]',
    boostDescription: '어려운 문제를 다중 에이전트로 심층 추론',
    boostHint: '<할 일>',
    teamworkDescription: '며칠짜리 다중 에이전트 프로젝트 (마일스톤·감사)',
    teamworkHint: '<할 일>',
  },
})

/** Build the identified, frozen user message the Agent inbox expects. */
function steerMessage(text) {
  return Object.freeze({
    role: 'user',
    id: randomUUID(),
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
    source: Object.freeze({ kind: 'user' }),
  })
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Call the session's own command handler with the same invocation.
 * The outer command owns its lifecycle log; the inner handler owns its domain
 * mutation, so this is a plain handler call rather than a nested registry run.
 */
async function delegate(ctx, t, invocation, commandName, rawInput) {
  const definition = ctx.commands.find(invocation.agent, commandName)
  if (definition === undefined) return { kind: 'error', text: t('missing', { command: commandName }) }
  try {
    return await definition.handler({ ...invocation, rawInput })
  } catch (error) {
    return { kind: 'error', text: t('failed', { command: commandName, message: messageOf(error) }) }
  }
}

function steer(agent, text) {
  agent.steer(steerMessage(text))
}

function startInterview(t, invocation, task) {
  try {
    steer(invocation.agent, grillMe(task))
  } catch (error) {
    return { kind: 'error', text: t('failed', { command: 'agy-grill-me', message: messageOf(error) }) }
  }
  return { kind: 'success', text: t(task === '' ? 'grillStartAsk' : 'grillStart') }
}

function startBoost(t, invocation, task) {
  if (task === '') return { kind: 'error', text: t('usage', { command: 'agy-boost' }) }
  try {
    steer(invocation.agent, boost(task))
  } catch (error) {
    return { kind: 'error', text: t('failed', { command: 'agy-boost', message: messageOf(error) }) }
  }
  return { kind: 'success', text: t('boostStart') }
}

function startTeamwork(t, invocation, task) {
  if (task === '') return { kind: 'error', text: t('usage', { command: 'agy-teamwork' }) }
  try {
    steer(invocation.agent, teamwork(task))
  } catch (error) {
    return { kind: 'error', text: t('failed', { command: 'agy-teamwork', message: messageOf(error) }) }
  }
  return { kind: 'success', text: t('teamworkStart') }
}

function help(ctx) {
  return HELP[resolveLocale(ctx)] ?? HELP.en
}

async function route(ctx, t, invocation) {
  const input = invocation.rawInput.trim()
  if (input === '' || input.toLowerCase() === 'help') return { kind: 'success', text: help(ctx) }

  const match = /^(\S+)(?:\s+([\s\S]*))?$/u.exec(input)
  const sub = match[1].toLowerCase()
  const rest = (match[2] ?? '').trim()

  switch (sub) {
    case 'plan':
      return delegate(ctx, t, invocation, 'plan', rest)
    case 'goal':
      return delegate(ctx, t, invocation, 'goal', rest)
    case 'grill-me':
    case 'grill':
      return startInterview(t, invocation, rest)
    case 'boost':
      return startBoost(t, invocation, rest)
    case 'teamwork':
      return startTeamwork(t, invocation, rest)
    default:
      return { kind: 'error', text: `${t('unknown', { sub })}\n\n${help(ctx)}` }
  }
}

export function apply(ctx) {
  // Results read the language when they are produced; descriptions and hints
  // are fixed at registration, so the commands are registered again on change.
  const t = createText(ctx, TEXT)

  registerLocalized(ctx, (locale) => {
    const d = (key) => t(key, undefined, locale)
    return [
      ctx.commands.register({
        name: 'agy',
        description: d('agyDescription'),
        input: { hint: d('agyHint') },
        handler: (invocation) => route(ctx, t, invocation),
      }),
      ctx.commands.register({
        name: 'agy-plan',
        description: d('planDescription'),
        input: { hint: d('planHint'), attachments: true },
        handler: (invocation) => delegate(ctx, t, invocation, 'plan', invocation.rawInput.trim()),
      }),
      ctx.commands.register({
        name: 'agy-goal',
        description: d('goalDescription'),
        input: { hint: d('goalHint'), attachments: true },
        handler: (invocation) => delegate(ctx, t, invocation, 'goal', invocation.rawInput.trim()),
      }),
      ctx.commands.register({
        name: 'agy-grill-me',
        description: d('grillDescription'),
        input: { hint: d('grillHint') },
        handler: (invocation) => startInterview(t, invocation, invocation.rawInput.trim()),
      }),
      ctx.commands.register({
        name: 'agy-boost',
        description: d('boostDescription'),
        input: { hint: d('boostHint') },
        handler: (invocation) => startBoost(t, invocation, invocation.rawInput.trim()),
      }),
      ctx.commands.register({
        name: 'agy-teamwork',
        description: d('teamworkDescription'),
        input: { hint: d('teamworkHint') },
        handler: (invocation) => startTeamwork(t, invocation, invocation.rawInput.trim()),
      }),
    ]
  })
}
