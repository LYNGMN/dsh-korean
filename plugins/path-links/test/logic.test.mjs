// Pure parts of client.js, loaded through a stand-in module loader in node:vm.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

function load() {
  let mod
  const window = { __ModuleLoader__: { load(def) { mod = def.factory(() => {}) } } }
  vm.runInNewContext(source, { window })
  return mod
}

const mod = load()
// Objects made inside the vm have its own Object prototype; compare their JSON shape.
const plain = (value) => JSON.parse(JSON.stringify(value))
const { pathCandidate, fileAddress, realDirectory, depsFrom, dictionaries } = mod.internals

test('the bundle registers under the package name and asks only for locale up front', () => {
  let id
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(def) { id = def.id } } } })
  assert.equal(id, '@lyngmn/dsh-path-links')
  assert.deepEqual([...mod.inject], ['locale'])
})

test('absolute paths written in skill wrappers are path candidates', () => {
  for (const path of [
    '/Users/me/.agents/sources/backnotprop/pstack/skills/create-verification-skill/SKILL.md',
    '/Users/me/.agents/sources/backnotprop/pstack/skills/create-verification-skill',
    '/Users/me/My Documents/notes.md'
  ]) assert.equal(pathCandidate(path), path)
  assert.equal(pathCandidate('  /Users/me/dir/  '), '/Users/me/dir', 'trims spaces and a trailing slash')
})

test('placeholders, commands, home and relative paths are not', () => {
  for (const text of [
    '/Users/me/.agents/sources/pack/skills/<이름>/SKILL.md',
    '/pstack-setup',
    '/pstack-<이름>',
    '/gps-review',
    '~/.agents/skills',
    'references/',
    './SKILL.md',
    'pstack',
    '//server/share/x',
    '/Users/me/*.md',
    '/Users/me/../etc/passwd',
    '/Users/me/a\n/Users/me/b',
    '/',
    '',
    '/' + 'a/'.repeat(600) + 'b'
  ]) assert.equal(pathCandidate(text), null, JSON.stringify(text))
  assert.equal(pathCandidate(undefined), null)
})

test('file addresses match DSH: relative inside the session folder, absolute outside, segments encoded', () => {
  assert.equal(fileAddress('s1', '/Users/me/project', '/Users/me/project/src/a.md'), 'dsh-resource://file/session/s1/src/a.md')
  assert.equal(fileAddress('s1', '/Users/me/project/', '/Users/me/project/a.md'), 'dsh-resource://file/session/s1/a.md')
  assert.equal(fileAddress('s1', '/Users/me/project', '/Users/me/project-two/a.md'), 'dsh-resource://file/session/s1//Users/me/project-two/a.md')
  assert.equal(fileAddress('s1', undefined, '/Users/me/.agents/x/SKILL.md'), 'dsh-resource://file/session/s1//Users/me/.agents/x/SKILL.md')
  assert.equal(fileAddress('a b', '', '/Users/me/My Docs/가.md'), 'dsh-resource://file/session/a%20b//Users/me/My%20Docs/%EA%B0%80.md')
  assert.equal(fileAddress('s1', '/w', '/w/c:d#e?.md'), 'dsh-resource://file/session/s1/c:d%23e%3F.md')
})

test('a folder behind a symlink takes the real location of a known file inside it', () => {
  const files = [['/Users/me/.agents/skills/cloud/demo/SKILL.md', '/Users/me/.agents/sources/cloud/skills/demo/SKILL.md']]
  assert.equal(realDirectory('/Users/me/.agents/skills/cloud/demo', files), '/Users/me/.agents/sources/cloud/skills/demo')
  assert.equal(realDirectory('/Users/me/.agents/skills/cloud', files), '/Users/me/.agents/sources/cloud/skills', 'a deeper file works too')
  assert.equal(realDirectory('/Users/me/.agents/skills/clou', files), '/Users/me/.agents/skills/clou', 'a name prefix is not a parent folder')
  assert.equal(realDirectory('/Users/me/other', files), '/Users/me/other', 'unknown folders stay as written')
})

test('DSH services map to stat kinds, the sidebar tab and Finder requests', async () => {
  const seen = []
  const scope = {
    sidebarRight: { mounted: { getSnapshot: () => 'sid' }, openResource: (...args) => seen.push(['open', ...args]) },
    sessions: { list: { getSnapshot: () => ({ byId: { sid: { cwd: '/w' } } }) } },
    remote: {
      workspaceFiles: {
        async stat(sid, path, signal) {
          seen.push(['stat', sid, path, signal instanceof AbortSignal])
          if (path === '/f') return { ok: true, value: { absolutePath: '/real/f', version: 'v' } }
          if (path === '/d') return { ok: false, error: { code: 'workspace-file/not-regular-file', details: { path, kind: 'directory' } } }
          if (path === '/l') return { ok: false, error: { code: 'workspace-file/not-regular-file', details: { path, kind: 'symlink' } } }
          return { ok: false, error: { code: 'workspace-file/not-found', details: { path } } }
        }
      },
      session: {
        canOpenWorkspacePath: async () => ({ ok: true, value: true }),
        async openWorkspacePath(request) { seen.push(['reveal', request]); return request.path === '/bad' ? { ok: false, error: {} } : { ok: true, value: { opened: true } } }
      }
    }
  }
  const deps = depsFrom(scope, {})
  assert.equal(deps.sessionId(), 'sid')
  assert.equal(deps.cwd('sid'), '/w')
  assert.equal(deps.cwd('other'), undefined)
  const signal = new AbortController().signal
  assert.deepEqual(plain(await deps.stat('sid', '/f', signal)), { kind: 'file', absolutePath: '/real/f' })
  assert.deepEqual(plain(await deps.stat('sid', '/d', signal)), { kind: 'dir' })
  assert.deepEqual(plain(await deps.stat('sid', '/l', signal)), { kind: 'none' }, 'a symlink itself cannot be read or revealed')
  assert.deepEqual(plain(await deps.stat('sid', '/x', signal)), { kind: 'none' })
  deps.open('dsh-resource://file/session/sid//f')
  assert.equal(await deps.reveal('/real/f', 'reveal'), true)
  assert.equal(await deps.reveal('/d', 'open'), true)
  assert.equal(await deps.reveal('/bad', 'reveal'), false)
  assert.equal(await deps.canReveal(), true)
  assert.deepEqual(plain(seen.filter(([k]) => k !== 'stat')), [
    ['open', 'dsh-resource://file/session/sid//f', { destination: 'sidebar', revealIfOpened: true }],
    ['reveal', { path: '/real/f', action: 'reveal' }],
    ['reveal', { path: '/d' }],
    ['reveal', { path: '/bad', action: 'reveal' }]
  ])
  assert.ok(seen.filter(([k]) => k === 'stat').every((s) => s[3]), 'stat gets an abort signal')
  scope.remote.session.canOpenWorkspacePath = async () => ({ ok: false, error: {} })
  assert.equal(await deps.canReveal(), false)
})

test('every language has every label', () => {
  const keys = Object.keys(dictionaries.en).sort()
  for (const lang of ['ko', 'zh']) assert.deepEqual(Object.keys(dictionaries[lang]).sort(), keys, lang)
})
