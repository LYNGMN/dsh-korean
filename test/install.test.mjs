// install.sh를 가짜 dsh 명령과 가짜 프로필로 돌려, DSH에 어떤 명령을 넘기는지 본다.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = new URL('..', import.meta.url).pathname
const FOLDERS = readdirSync(join(ROOT, 'plugins')).filter((name) => existsSync(join(ROOT, 'plugins', name, 'package.json'))).sort()

function setup(dependencies, kit = ROOT) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-kit-'))
  mkdirSync(join(dir, 'home/profiles/desktop'), { recursive: true })
  writeFileSync(join(dir, 'home/profiles/desktop/package.json'), JSON.stringify({ dependencies }))
  writeFileSync(join(dir, 'dsh'), `#!/bin/sh\necho "$*" >> "${dir}/calls"\n`)
  chmodSync(join(dir, 'dsh'), 0o755)
  writeFileSync(join(dir, 'npm'), `#!/bin/sh\necho "$(pwd) $*" >> "${dir}/npm-calls"\n`)
  chmodSync(join(dir, 'npm'), 0o755)
  const run = (args, input = '') => spawnSync('/bin/bash', [join(kit, 'install.sh'), ...args], {
    env: { ...process.env, DSH_BIN: join(dir, 'dsh'), NPM_BIN: join(dir, 'npm'), DSH_HOME: join(dir, 'home') },
    input,
    encoding: 'utf8'
  })
  const lines = (file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8').trim().split('\n') : [])
  return { run, calls: () => lines('calls'), npmCalls: () => lines('npm-calls') }
}

// 런타임 npm 패키지를 쓰는 플러그인 하나만 든 임시 키트.
function kitWithDependency({ installed = false } = {}) {
  const kit = mkdtempSync(join(tmpdir(), 'dsh-kit-root-'))
  copyFileSync(join(ROOT, 'install.sh'), join(kit, 'install.sh'))
  mkdirSync(join(kit, 'plugins/net'), { recursive: true })
  writeFileSync(join(kit, 'plugins/net/package.json'), JSON.stringify({ name: '@lyngmn/dsh-net', dependencies: { 'left-pad': '1.3.0' } }))
  if (installed) {
    mkdirSync(join(kit, 'node_modules/left-pad'), { recursive: true })
    writeFileSync(join(kit, 'node_modules/left-pad/package.json'), '{}')
  }
  return kit
}

test('키트 플러그인 모두를 한 번에 link:로 넣는다', () => {
  const { run, calls } = setup({ other: '1.0.0' })
  const result = run([])
  assert.equal(result.status, 0, result.stderr)
  const links = FOLDERS.map((folder) => `link:${join(ROOT, 'plugins', folder)}`)
  const made = calls()
  assert.equal(made.length, 1)
  assert.ok(made[0].startsWith('plugin --profile desktop add '))
  // The shell's glob order and JavaScript's sort may differ; the order does not matter.
  assert.deepEqual(made[0].slice('plugin --profile desktop add '.length).split(' ').sort(), links.sort())
})

test('다른 이름으로 깔린 같은 플러그인은 허락을 받고 먼저 뺀다', () => {
  const { run, calls } = setup({ '@local/brave-search': 'link:/x', 'dsh-korean': 'link:/y', other: '1.0.0' })
  const result = run([], 'y\n')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(calls()[0], 'plugin --profile desktop remove dsh-korean @local/brave-search')
  assert.match(calls()[1], /^plugin --profile desktop add /)
})

test('폴더 이름을 바꾼 플러그인은 바꾸기 전 이름도 먼저 뺀다', () => {
  const { run, calls } = setup({ '@lyngmn/dsh-brave-search': 'link:/x', '@lyngmn/dsh-exa-search': 'link:/y', other: '1.0.0' })
  const result = run([], 'y\n')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(calls()[0], 'plugin --profile desktop remove @lyngmn/dsh-brave-search @lyngmn/dsh-exa-search')
  assert.match(calls()[1], /^plugin --profile desktop add /)
})

test('검색 플러그인에 합친 Brave·Exa·검색 자동 전환은 허락을 받고 먼저 뺀다', () => {
  const { run, calls } = setup({ '@lyngmn/dsh-search-brave': 'link:/b', '@lyngmn/dsh-search-exa': 'link:/e', '@lyngmn/dsh-search-fallback': 'link:/f', other: '1.0.0' })
  const result = run([], 'y\n')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(calls()[0], 'plugin --profile desktop remove @lyngmn/dsh-search-brave @lyngmn/dsh-search-exa @lyngmn/dsh-search-fallback')
  assert.match(calls()[1], /^plugin --profile desktop add /)
  assert.ok(!calls()[1].includes('search-brave'))
})

test('다른 이름 플러그인을 빼지 말라고 하면 겹치지 않게 아무것도 넣지 않고 멈춘다', () => {
  const { run, calls } = setup({ '@local/skill-hints': 'link:/x' })
  const result = run([], 'n\n')
  assert.equal(result.status, 1)
  assert.deepEqual(calls(), [])
})

test('--dry-run은 할 일만 보여 주고 DSH를 부르지 않는다', () => {
  const { run, calls } = setup({ '@local/skill-hints': 'link:/x' })
  const result = run(['--dry-run'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /remove @local\/skill-hints/)
  assert.match(result.stdout, /add link:/)
  assert.match(result.stdout, /미리 보기라 아무것도 바꾸지 않았어요/)
  assert.doesNotMatch(result.stdout, /끝났어요/)
  assert.deepEqual(calls(), [])
})

test('--remove는 깔려 있는 키트 플러그인만 뺀다', () => {
  const { run, calls } = setup({ '@lyngmn/dsh-korean': 'link:/a', '@lyngmn/dsh-skill-hints': 'link:/b', other: '1.0.0' })
  const result = run(['--remove', '--yes'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(calls(), ['plugin --profile desktop remove @lyngmn/dsh-korean @lyngmn/dsh-skill-hints'])
})

test('플러그인이 쓰는 npm 패키지가 없으면 키트 폴더에서 먼저 받고 넣는다', () => {
  const kit = kitWithDependency()
  const { run, calls, npmCalls } = setup({}, kit)
  const result = run([])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /left-pad/)
  assert.deepEqual(npmCalls(), [`${kit} install --omit=dev --no-audit --no-fund`])
  assert.deepEqual(calls(), [`plugin --profile desktop add link:${join(kit, 'plugins/net')}`])
})

test('npm 패키지가 이미 있으면 받지 않는다(개발 중인 키트의 개발용 패키지를 지우지 않는다)', () => {
  const { run, npmCalls } = setup({}, kitWithDependency({ installed: true }))
  assert.equal(run([]).status, 0)
  assert.deepEqual(npmCalls(), [])
})

test('--dry-run은 npm 패키지 받기도 보여 주기만 한다', () => {
  const { run, calls, npmCalls } = setup({}, kitWithDependency())
  const result = run(['--dry-run'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /npm install --omit=dev/)
  assert.deepEqual(npmCalls(), [])
  assert.deepEqual(calls(), [])
})

test('모르는 옵션은 아무것도 하지 않고 멈춘다', () => {
  const { run, calls } = setup({})
  assert.equal(run(['--nope']).status, 2)
  assert.deepEqual(calls(), [])
})
