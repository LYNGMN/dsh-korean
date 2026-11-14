import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply, discover, frontmatter, skillLine } from '../index.js'

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

test('discover finds hinted, user-invocable skills through wrappers', () => {
  const found = discover(fixture(), {})
  assert.deepEqual(found.map((s) => s.name).sort(), ['gstack-cso', 'impeccable'])
  const cso = found.find((s) => s.name === 'gstack-cso')
  assert.equal(cso.hint, '[--diff 변경분만 | --code 코드]')
  assert.equal(cso.description, 'Security audit for code')
})

test('earlier root wins for the same name', () => {
  const [dsh, shelf] = fixture()
  writeFileSync(join(dsh, 'impeccable.md'), '---\nname: impeccable\ndescription: shadow\n---\nno target\n')
  assert.equal(discover([dsh, shelf], {}).some((s) => s.name === 'impeccable'), false)
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
  assert.equal(found.find((s) => s.name === 'gstack-cso').description, '보안 점검')
  const plain = found.find((s) => s.name === 'plain')
  assert.equal(plain.hint, '[대상]')
  assert.equal(plain.description, '평범')
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
