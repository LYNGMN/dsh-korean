// One-time setup after the Cloudflare tunnel and Access app exist
// (docs/setup-cloudflare.md). Writes $DSH_HOME/dsh-handheld/config.json and,
// if given, the tunnel token to tunnel-token (0600). The token is read without
// echo and never printed.
//
//   node scripts/configure.mjs                      asks for every value
//   node scripts/configure.mjs --origin https://dsh.example.com --team myteam.cloudflareaccess.com \
//     --aud <AUD tag> --emails me@example.com      saves without asking; the tunnel token file is left as it is
import path from 'node:path'
import readline from 'node:readline'
import { parseArgs } from 'node:util'
import { dataDir, ensureDir, readJson, writePrivate } from '../server/home.js'

const { values: flags } = parseArgs({
  options: {
    origin: { type: 'string' },
    team: { type: 'string' },
    aud: { type: 'string' },
    emails: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})
if (flags.help) {
  console.log(`사용법:
  node plugins/handheld/scripts/configure.mjs
      하나씩 묻고 저장합니다. 터널 토큰도 화면에 보이지 않게 받습니다.
  node plugins/handheld/scripts/configure.mjs --origin https://<주소> --team <팀>.cloudflareaccess.com --aud <AUD 태그> --emails "<이메일>,<이메일>"
      묻지 않고 저장합니다. 빠진 값은 지금 설정을 쓰고, 터널 토큰 파일은 그대로 둡니다.`)
  process.exit(0)
}
delete flags.help
const fromFlags = Object.values(flags).some((value) => value !== undefined)

const dir = ensureDir(dataDir())
const current = readJson(path.join(dir, 'config.json'), {})
const defaults = {
  origin: current.publicOrigin ?? '',
  team: current.access?.teamDomain ?? '',
  aud: current.access?.audience ?? '',
  emails: (current.access?.allowedEmails ?? []).join(','),
}

async function askAll() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const ask = (question, fallback = '') => {
    const hint = fallback ? ` [${fallback}]` : ''
    return new Promise((resolve) => rl.question(`${question}${hint}: `, (answer) => resolve(answer.trim() || fallback)))
  }
  const askSecret = (question) => new Promise((resolve) => {
    const write = rl._writeToOutput
    rl._writeToOutput = (s) => { if (s.includes(question)) write.call(rl, s) }
    rl.question(`${question}: `, (answer) => {
      rl._writeToOutput = write
      process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
  console.log('dsh-handheld 설정 — 빈칸으로 두면 [ ] 안의 지금 값을 씁니다.\n')
  const answers = {
    origin: await ask('휴대폰에서 열 주소 (예: https://dsh.example.com)', defaults.origin),
    team: await ask('Access 팀 도메인 (예: myteam.cloudflareaccess.com)', defaults.team),
    aud: await ask('Access 앱의 AUD 태그', defaults.aud),
    emails: await ask('들어올 수 있는 이메일 (쉼표로 구분)', defaults.emails),
    token: await askSecret('터널 토큰 (바꾸지 않으려면 빈칸)'),
  }
  rl.close()
  return answers
}

const answers = fromFlags
  ? { origin: flags.origin ?? defaults.origin, team: flags.team ?? defaults.team, aud: flags.aud ?? defaults.aud, emails: flags.emails ?? defaults.emails, token: '' }
  : await askAll()

const publicOrigin = answers.origin.trim().replace(/\/+$/, '')
const teamDomain = answers.team.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
const audience = answers.aud.trim()
const allowedEmails = answers.emails.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

if (!/^https:\/\/[^/]+$/.test(publicOrigin)) throw new Error('주소는 https://로 시작하고 경로가 없어야 합니다')
if (!teamDomain || !audience) throw new Error('팀 도메인과 AUD 태그가 필요합니다')
if (allowedEmails.length === 0) throw new Error('이메일을 하나 이상 넣어 주세요')

writePrivate(path.join(dir, 'config.json'), JSON.stringify({
  ...current,
  publicOrigin,
  tunnel: true,
  access: { teamDomain, audience, allowedEmails },
}, null, 1))
if (answers.token) writePrivate(path.join(dir, 'tunnel-token'), answers.token)
console.log(`\n저장했습니다: ${path.join(dir, 'config.json')}${answers.token ? ' 와 tunnel-token' : ''}`)
console.log('DSH Desktop을 다시 시작하면 적용됩니다.')
