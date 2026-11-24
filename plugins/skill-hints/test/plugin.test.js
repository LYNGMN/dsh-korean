import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { PROVIDER, RANK, apply, body, describe, discover, frontmatter, shorten } from '../index.js'

/** ~/.dsh/skills(감싸개 .md)와 ~/.agents/skills(폴더) 두 자리를 흉내 낸다. */
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'skill-hints-'))
  const dsh = join(base, 'dsh')
  const shelf = join(base, 'shelf')
  mkdirSync(dsh)
  for (const dir of ['gstack/gstack-cso', 'impeccable', 'plain', 'hidden', 'auto']) mkdirSync(join(shelf, dir), { recursive: true })

  writeFileSync(join(shelf, 'gstack', 'gstack-cso', 'SKILL.md'),
    '---\nname: cso\ndescription: |\n  Security audit\n  for code\nargument-hint: "[--diff 변경분만 | --code 코드]"\n---\nreal body\n')
  writeFileSync(join(dsh, 'gstack-cso.md'),
    `---\nname: gstack-cso\ndescription: "wrapper"\ndisable-model-invocation: true\n---\n\n1. \`${join(shelf, 'gstack', 'gstack-cso', 'SKILL.md')}\`를 끝까지 읽는다.\n\n`)
  writeFileSync(join(shelf, 'impeccable', 'SKILL.md'),
    '---\nname: impeccable\ndescription: Design work\ndisable-model-invocation: true\nargument-hint: "[polish 다듬기] [대상]"\n---\nimpeccable body\n')
  writeFileSync(join(shelf, 'plain', 'SKILL.md'),
    '---\nname: plain\ndescription: no hint\ndisable-model-invocation: true\n---\nplain body\n')
  writeFileSync(join(shelf, 'hidden', 'SKILL.md'),
    '---\nname: hidden\ndescription: nobody\ndisable-model-invocation: true\nuser-invocable: false\n---\n')
  writeFileSync(join(shelf, 'auto', 'SKILL.md'),
    '---\nname: auto\ndescription: Model picks this up\n---\nauto body\n')
  return [{ path: dsh, source: 'user-dsh' }, { path: shelf, source: 'user-agents' }]
}

const NO_OVERLAY = '/nonexistent/skill-hints.json'

function overlayFile(skills) {
  const path = join(mkdtempSync(join(tmpdir(), 'skill-hints-overlay-')), 'skill-hints.json')
  writeFileSync(path, JSON.stringify({ skills }))
  return path
}

/** 가짜 호스트: 저장된 DSH 언어(`undefined` = 시스템 따름), 설정 바뀜 알림, 스킬 제공자 등록. */
function host(initial) {
  const listeners = []
  let preference = initial
  let provider
  let invalidated = 0
  const ctx = {
    get: (name) => (name === 'settings'
      ? { describe: () => [{ ns: 'locale', value: preference === undefined ? {} : { preference } }] }
      : undefined),
    on: (event, listener) => { if (event === 'settings/document-updated') listeners.push(listener); return () => {} },
    skills: {
      registerProvider(create) {
        provider = create({ signal: new AbortController().signal, invalidate: () => { invalidated += 1 } })
        return () => {}
      },
    },
  }
  const setLocale = async (next) => {
    preference = next
    for (const listener of listeners) listener('locale', 1)
    await Promise.resolve()
  }
  const list = async () => new Map((await provider.list({})).map((c) => [c.name, c]))
  return { ctx, setLocale, list, provider: () => provider, invalidated: () => invalidated }
}

test('frontmatter reads quoted, plain and block values', () => {
  const meta = frontmatter('---\nname: a\ndescription: |\n  line one\n  line two\nargument-hint: "[x | y]"\n---\n')
  assert.equal(meta.name, 'a')
  assert.equal(meta.description, 'line one line two')
  assert.equal(meta['argument-hint'], '[x | y]')
})

test('body is the text after the closing fence, trimmed like DSH', () => {
  assert.equal(body('---\nname: a\n---\n\n  hello\n\n'), 'hello')
  assert.equal(body('---\r\nname: a\r\n---\r\nhi\r\n'), 'hi')
  assert.equal(body('no frontmatter'), undefined)
  assert.equal(body('---\nname: a\n'), undefined)
})

test('discover keeps user-only skills and leaves model-invocable and hidden ones to DSH', () => {
  const found = discover(fixture(), {})
  assert.deepEqual(found.map((s) => s.name).sort(), ['gstack-cso', 'impeccable', 'plain'])
  const cso = found.find((s) => s.name === 'gstack-cso')
  assert.equal(cso.hint, '[--diff 변경분만 | --code 코드]')
  assert.equal(cso.summaryEn, 'Security audit for code')
  assert.equal(cso.source, 'user-dsh')
  assert.equal(cso.locator.path.endsWith('gstack-cso.md'), true)
  assert.equal(found.find((s) => s.name === 'plain').hint, undefined)
})

test('the earlier root wins, even when it is a model-invocable skill', () => {
  const roots = fixture()
  writeFileSync(join(roots[0].path, 'plain.md'), '---\nname: plain\ndescription: shadow\n---\nmodel can use me\n')
  writeFileSync(join(roots[0].path, 'impeccable.md'), '---\nname: impeccable\ndescription: shadow\ndisable-model-invocation: true\n---\nno target\n')
  const found = discover(roots, {})
  assert.equal(found.some((s) => s.name === 'plain'), false)
  const impeccable = found.filter((s) => s.name === 'impeccable')
  assert.equal(impeccable.length, 1)
  assert.equal(impeccable[0].summaryEn, 'shadow')
  assert.equal(impeccable[0].source, 'user-dsh')
})

test('shorten keeps up to 160 characters and cuts long text at a word boundary', () => {
  assert.equal(shorten('Fix the cause.\n  Then test it.'), 'Fix the cause. Then test it.')
  const long = shorten('abcd '.repeat(40))
  assert.ok(long.length <= 160)
  assert.ok(long.endsWith('abcd…'))
  assert.equal(shorten('x'.repeat(200)), `${'x'.repeat(159)}…`)
})

test('describe: Korean summary plus hint in Korean, English original otherwise', () => {
  const skill = { summaryEn: 'Cut AI tells.', summaryKo: 'AI 말투 걷어내기', hint: '[다듬을 글]' }
  assert.equal(describe(skill, 'ko'), 'AI 말투 걷어내기 · [다듬을 글]')
  assert.equal(describe(skill, 'en'), 'Cut AI tells.')
  assert.equal(describe({ summaryEn: 'Cut AI tells.', hint: '[다듬을 글]' }, 'ko'), 'Cut AI tells. · [다듬을 글]')
  assert.equal(describe({ summaryEn: 'Cut AI tells.' }, 'ko'), 'Cut AI tells.')
})

test('apply registers one skill provider and no commands', async () => {
  const h = host('en')
  let commands = 0
  h.ctx.commands = { register: () => { commands += 1 } }
  apply(h.ctx, { roots: fixture(), overlay: NO_OVERLAY })
  assert.equal(h.provider().name, PROVIDER)
  assert.equal(commands, 0)
  const listed = await h.list()
  assert.deepEqual([...listed.keys()].sort(), ['gstack-cso', 'impeccable', 'plain'])
})

test('candidates outrank the user folders and keep the file provider shape', async () => {
  const roots = fixture()
  const h = host('en')
  apply(h.ctx, { roots, overlay: NO_OVERLAY })
  const cso = (await h.list()).get('gstack-cso')
  assert.ok(RANK < 400 && RANK > 300)
  assert.equal(cso.rank, RANK)
  assert.deepEqual(cso.invocation, { modelInvocable: false, userInvocable: true })
  assert.equal(cso.provider, PROVIDER)
  assert.equal(cso.source, 'user-dsh')
  assert.deepEqual(cso.resourceBase, { kind: 'directory', path: roots[0].path })
  assert.equal(cso.path, realpathSync(join(roots[0].path, 'gstack-cso.md')))
})

test('get loads the same body DSH would, with the original description', async () => {
  const roots = fixture()
  const h = host('ko')
  apply(h.ctx, { roots, overlay: overlayFile({ cso: { summary: '코드 보안 점검' } }) })
  const listed = await h.list()
  const cso = await h.provider().get(listed.get('gstack-cso'), {})
  assert.equal(cso.description, 'wrapper')
  assert.match(cso.content, /^1\. `.+SKILL\.md`를 끝까지 읽는다\.$/u)
  assert.equal(cso.provider, PROVIDER)
  assert.deepEqual(cso.invocation, { modelInvocable: false, userInvocable: true })
  const plain = await h.provider().get(listed.get('plain'), {})
  assert.equal(plain.content, 'plain body')
  assert.deepEqual(plain.resourceBase, { kind: 'directory', path: join(roots[1].path, 'plain') })
})

test('get returns undefined when the file no longer holds that skill', async () => {
  const roots = fixture()
  const h = host('en')
  apply(h.ctx, { roots, overlay: NO_OVERLAY })
  const listed = await h.list()
  writeFileSync(join(roots[1].path, 'plain', 'SKILL.md'), 'gone')
  assert.equal(await h.provider().get(listed.get('plain'), {}), undefined)
})

test('a Korean DSH language shows the Korean summary and the hint', async () => {
  const h = host('ko')
  apply(h.ctx, { roots: fixture(), overlay: overlayFile({ cso: { summary: '코드 보안 점검' }, plain: { summary: '평범한 스킬' } }) })
  const listed = await h.list()
  assert.equal(listed.get('gstack-cso').description, '코드 보안 점검 · [--diff 변경분만 | --code 코드]')
  assert.equal(listed.get('plain').description, '평범한 스킬')
  assert.equal(listed.get('impeccable').description, 'Design work · [polish 다듬기] [대상]')
})

test('an English DSH language shows the original description without the Korean hint', async () => {
  const [dsh, shelf] = fixture()
  writeFileSync(join(shelf.path, 'plain', 'SKILL.md'),
    '---\nname: plain\ndescription: Do one thing. Then explain why at length.\ndisable-model-invocation: true\n---\nplain body\n')
  const h = host('en')
  apply(h.ctx, { roots: [dsh, shelf], overlay: overlayFile({ plain: { summary: '평범한 스킬' } }) })
  const listed = await h.list()
  assert.equal(listed.get('plain').description, 'Do one thing. Then explain why at length.')
  assert.equal(listed.get('gstack-cso').description, 'Security audit for code')
})

test('an unset DSH language follows the system language', async () => {
  for (const [system, expected] of [['ko-KR', '평범한 스킬'], ['en-US', 'no hint']]) {
    const original = Intl.DateTimeFormat
    const lang = process.env.LANG
    Intl.DateTimeFormat = function () { return { resolvedOptions: () => ({ locale: system }) } }
    process.env.LANG = `${system.replace('-', '_')}.UTF-8`
    try {
      const h = host(undefined)
      apply(h.ctx, { roots: fixture(), overlay: overlayFile({ plain: { summary: '평범한 스킬' } }) })
      assert.equal((await h.list()).get('plain').description, expected, system)
    } finally {
      Intl.DateTimeFormat = original
      if (lang === undefined) delete process.env.LANG
      else process.env.LANG = lang
    }
  }
})

test('a language change invalidates the catalog and the next list swaps the summaries', async () => {
  const h = host('ko')
  apply(h.ctx, { roots: fixture(), overlay: overlayFile({ plain: { summary: '평범한 스킬' } }) })
  assert.equal((await h.list()).get('plain').description, '평범한 스킬')
  await setLocaleAndSettle(h, 'en')
  assert.equal(h.invalidated(), 1)
  assert.equal((await h.list()).get('plain').description, 'no hint')
})

async function setLocaleAndSettle(h, locale) {
  await h.setLocale(locale)
  await new Promise((resolve) => setImmediate(resolve))
}

test('a host without the skills service is left alone', () => {
  assert.doesNotThrow(() => apply({}, { roots: fixture(), overlay: NO_OVERLAY }))
})

test('plain string roots still work', async () => {
  const h = host('en')
  apply(h.ctx, { roots: fixture().map((root) => root.path), overlay: NO_OVERLAY })
  const listed = await h.list()
  assert.equal(listed.get('gstack-cso').source, 'user-dsh')
  assert.equal(listed.get('plain').source, 'user-agents')
})
