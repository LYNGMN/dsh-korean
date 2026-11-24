import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply, discover, firstSentence, frontmatter, skillLine } from '../index.js'

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'skill-hints-'))
  const dsh = join(base, 'dsh')
  const shelf = join(base, 'shelf')
  mkdirSync(dsh)
  mkdirSync(join(shelf, 'gstack', 'gstack-cso'), { recursive: true })
  mkdirSync(join(shelf, 'impeccable'), { recursive: true })
  mkdirSync(join(shelf, 'plain'), { recursive: true })
  mkdirSync(join(shelf, 'hidden'), { recursive: true })

  writeFileSync(join(shelf, 'gstack', 'gstack-cso', 'SKILL.md'),
    '---\nname: cso\ndescription: |\n  Security audit\n  for code\nargument-hint: "[--diff 변경분만 | --code 코드]"\n---\nbody\n')
  writeFileSync(join(dsh, 'gstack-cso.md'),
    `---\nname: gstack-cso\ndescription: "wrapper"\ndisable-model-invocation: true\n---\n1. \`${join(shelf, 'gstack', 'gstack-cso', 'SKILL.md')}\`를 끝까지 읽는다.\n`)
  writeFileSync(join(shelf, 'impeccable', 'SKILL.md'),
    '---\nname: impeccable\ndescription: Design work\nargument-hint: "[polish 다듬기] [대상]"\n---\n')
  writeFileSync(join(shelf, 'plain', 'SKILL.md'), '---\nname: plain\ndescription: no hint\n---\n')
  writeFileSync(join(shelf, 'hidden', 'SKILL.md'),
    '---\nname: hidden\ndescription: model only\nuser-invocable: false\nargument-hint: "[x]"\n---\n')
  return [dsh, shelf]
}

test('frontmatter reads quoted, plain and block values', () => {
  const meta = frontmatter('---\nname: a\ndescription: |\n  line one\n  line two\nargument-hint: "[x | y]"\n---\n')
  assert.equal(meta.name, 'a')
  assert.equal(meta.description, 'line one line two')
  assert.equal(meta['argument-hint'], '[x | y]')
})

test('discover finds user-invocable skills through wrappers, with or without a hint', () => {
  const found = discover(fixture(), {})
  assert.deepEqual(found.map((s) => s.name).sort(), ['gstack-cso', 'impeccable', 'plain'])
  const cso = found.find((s) => s.name === 'gstack-cso')
  assert.equal(cso.hint, '[--diff 변경분만 | --code 코드]')
  assert.equal(cso.summaryEn, 'Security audit for code')
  assert.equal(cso.summaryKo, undefined)
  const plain = found.find((s) => s.name === 'plain')
  assert.equal(plain.hint, undefined)
  assert.equal(plain.summaryEn, 'no hint')
})

test('discover leaves out user-invocable: false skills', () => {
  const found = discover(fixture(), { hidden: { summary: '숨김' } })
  assert.equal(found.some((s) => s.name === 'hidden'), false)
})

test('firstSentence keeps the first sentence and shortens long text', () => {
  assert.equal(firstSentence('Fix the cause. Then test it.'), 'Fix the cause.')
  assert.equal(firstSentence('Use for files (e.g. a .env file). More.'), 'Use for files (e.g. a .env file).')
  assert.equal(firstSentence('Use when Next.js\n  breaks'), 'Use when Next.js breaks')
  const long = firstSentence('word '.repeat(60))
  assert.equal(long.length, 160)
  assert.ok(long.endsWith('…'))
})

test('earlier root wins for the same name', () => {
  const [dsh, shelf] = fixture()
  writeFileSync(join(dsh, 'impeccable.md'), '---\nname: impeccable\ndescription: shadow\n---\nno target\n')
  const found = discover([dsh, shelf], {}).filter((s) => s.name === 'impeccable')
  assert.equal(found.length, 1)
  assert.equal(found[0].summaryEn, 'shadow')
  assert.equal(found[0].hint, undefined)
})

test('skillLine keeps the slash token the skill loader recognises', () => {
  assert.equal(skillLine('gstack-cso', '  --diff  '), '/gstack-cso --diff')
  assert.equal(skillLine('gstack-cso', ''), '/gstack-cso')
  assert.match(skillLine('impeccable', 'polish header'), /(^|\s)\/impeccable(?=\s|$)/u)
})

test('apply registers commands with hints and steers a user message', async () => {
  const registered = new Map()
  apply({ commands: { register: (d) => registered.set(d.name, d) } }, { roots: fixture() })
  const cso = registered.get('gstack-cso')
  assert.equal(cso.input.hint, '[--diff 변경분만 | --code 코드]')

  const steered = []
  const result = await cso.handler({ agent: { steer: (m) => steered.push(m) }, rawInput: ' --diff', attachments: [] })
  assert.equal(result.kind, 'success')
  assert.equal(steered.length, 1)
  assert.equal(steered[0].role, 'user')
  assert.equal(steered[0].source.kind, 'user')
  assert.equal(steered[0].content[0].text, '/gstack-cso --diff')
})

test('a name already taken by a host command is skipped, not fatal', () => {
  const registered = new Map()
  apply({
    commands: {
      register(d) {
        if (d.name === 'impeccable') throw new Error('duplicate')
        registered.set(d.name, d)
      },
    },
  }, { roots: fixture() })
  assert.ok(registered.has('gstack-cso'))
})

test('overlay gives Korean summary and a hint for skills without one', () => {
  const shelf = fixture()
  const found = discover(shelf, { cso: { summary: '보안 점검' }, plain: { hint: '[대상]', summary: '평범' } })
  assert.equal(found.find((s) => s.name === 'gstack-cso').summaryKo, '보안 점검')
  const plain = found.find((s) => s.name === 'plain')
  assert.equal(plain.hint, '[대상]')
  assert.equal(plain.summaryKo, '평범')
  assert.equal(plain.summaryEn, 'no hint')
})

/** Fake Host with a stored DSH language (`undefined` = follow the system) and the settings event. */
function localeHost(initial) {
  const registered = new Map()
  const listeners = []
  let preference = initial
  const ctx = {
    get: (name) => (name === 'settings'
      ? { describe: () => [{ ns: 'locale', value: preference === undefined ? {} : { preference } }] }
      : undefined),
    on: (event, listener) => { if (event === 'settings/document-updated') listeners.push(listener); return () => {} },
    commands: {
      register(definition) {
        registered.set(definition.name, definition)
        return () => { if (registered.get(definition.name) === definition) registered.delete(definition.name) }
      },
    },
  }
  const setLocale = async (next) => {
    preference = next
    for (const listener of listeners) listener('locale', 1)
    await Promise.resolve()
  }
  return { ctx, registered, setLocale }
}

async function withSystemLocale(id, run) {
  const original = Intl.DateTimeFormat
  const lang = process.env.LANG
  Intl.DateTimeFormat = function () { return { resolvedOptions: () => ({ locale: id }) } }
  process.env.LANG = `${id.replace('-', '_')}.UTF-8`
  try {
    return await run()
  } finally {
    Intl.DateTimeFormat = original
    if (lang === undefined) delete process.env.LANG
    else process.env.LANG = lang
  }
}

const NO_OVERLAY = '/nonexistent/skill-hints.json'

test('the description prefix and results follow a Korean DSH language', async () => {
  const { ctx, registered } = localeHost('ko')
  apply(ctx, { roots: fixture(), overlay: NO_OVERLAY })
  const cso = registered.get('gstack-cso')
  assert.equal(cso.description, '스킬 · Security audit for code')
  assert.equal((await cso.handler({ agent: { steer() {} }, rawInput: '' })).text, '/gstack-cso 스킬을 불러옵니다.')
  const failed = await cso.handler({ agent: { steer() { throw new Error('busy') } }, rawInput: '' })
  assert.equal(failed.text, '/gstack-cso 실행 실패: busy')
})

test('the description prefix and results follow an English DSH language', async () => {
  const { ctx, registered } = localeHost('en')
  apply(ctx, { roots: fixture(), overlay: NO_OVERLAY })
  const cso = registered.get('gstack-cso')
  assert.equal(cso.description, 'Skill · Security audit for code')
  assert.equal((await cso.handler({ agent: { steer() {} }, rawInput: '' })).text, 'Loading the /gstack-cso skill.')
})

test('an unset DSH language follows the system language', async () => {
  for (const [system, prefix] of [['ko-KR', '스킬 · '], ['en-US', 'Skill · ']]) {
    await withSystemLocale(system, () => {
      const { ctx, registered } = localeHost(undefined)
      apply(ctx, { roots: fixture(), overlay: NO_OVERLAY })
      assert.ok(registered.get('gstack-cso').description.startsWith(prefix), system)
    })
  }
})

test('a language change registers the skill commands again', async () => {
  const { ctx, registered, setLocale } = localeHost('en')
  apply(ctx, { roots: fixture(), overlay: NO_OVERLAY })
  const count = registered.size
  await setLocale('ko')
  assert.equal(registered.size, count)
  assert.equal(registered.get('gstack-cso').description, '스킬 · Security audit for code')
  const steered = []
  await registered.get('gstack-cso').handler({ agent: { steer: (m) => steered.push(m) }, rawInput: '--diff' })
  assert.equal(steered[0].content[0].text, '/gstack-cso --diff')
})

function overlayFile(skills) {
  const path = join(mkdtempSync(join(tmpdir(), 'skill-hints-overlay-')), 'skill-hints.json')
  writeFileSync(path, JSON.stringify({ skills }))
  return path
}

test('a skill without a hint is registered with no input hint', () => {
  const { ctx, registered } = localeHost('en')
  apply(ctx, { roots: fixture(), overlay: NO_OVERLAY })
  const plain = registered.get('plain')
  assert.ok(plain)
  assert.equal(plain.input, undefined)
  assert.equal(plain.description, 'Skill · no hint')
  assert.equal(registered.has('hidden'), false)
})

test('a Korean DSH language uses the Korean summary', () => {
  const { ctx, registered } = localeHost('ko')
  apply(ctx, { roots: fixture(), overlay: overlayFile({ cso: { summary: '코드 보안 점검' }, plain: { summary: '평범한 스킬' } }) })
  assert.equal(registered.get('gstack-cso').description, '스킬 · 코드 보안 점검')
  assert.equal(registered.get('plain').description, '스킬 · 평범한 스킬')
  assert.equal(registered.get('plain').input, undefined)
})

test('an English DSH language uses the first English sentence', () => {
  const [dsh, shelf] = fixture()
  writeFileSync(join(shelf, 'plain', 'SKILL.md'), '---\nname: plain\ndescription: Do one thing. Then explain why at length.\n---\n')
  const { ctx, registered } = localeHost('en')
  apply(ctx, { roots: [dsh, shelf], overlay: overlayFile({ plain: { summary: '평범한 스킬' } }) })
  assert.equal(registered.get('plain').description, 'Skill · Do one thing.')
})

test('a Korean DSH language falls back to English when there is no Korean summary', () => {
  const { ctx, registered } = localeHost('ko')
  apply(ctx, { roots: fixture(), overlay: overlayFile({ cso: { summary: '코드 보안 점검' } }) })
  assert.equal(registered.get('plain').description, '스킬 · no hint')
  assert.equal(registered.get('impeccable').description, '스킬 · Design work')
})

test('switching the language swaps Korean and English summaries', async () => {
  const { ctx, registered, setLocale } = localeHost('ko')
  apply(ctx, { roots: fixture(), overlay: overlayFile({ plain: { summary: '평범한 스킬' } }) })
  assert.equal(registered.get('plain').description, '스킬 · 평범한 스킬')
  await setLocale('en')
  assert.equal(registered.get('plain').description, 'Skill · no hint')
})
