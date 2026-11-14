// Local gateway for building the phone app, on http://localhost:3091/h/ with the
// loopback-only dev bypass (no Access).
//   npm run dev              against a scripted fake DSH (no Desktop needed)
//   npm run dev -- --real    against the running Desktop (needs devUpstreamFile: true)
import path from 'node:path'
import { createFakeDsh } from '../test/support/fake-dsh.js'
import { loadConfig, startHandheld } from '../server/app.js'
import { dataDir, ensureDir, readJson } from '../server/home.js'

const real = process.argv.includes('--real')
const port = Number(process.env.PORT ?? 3091)
const ROOT = path.join(import.meta.dirname, '..')
const logger = { info: (m) => console.log(m), warn: (m) => console.warn(m) }

const DEMO = 'session-demo-1'
const SECOND = 'session-demo-2'
const HELPER = 'session-demo-helper'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function seed(dsh) {
  const user = (text) => dsh.pushEvent(DEMO, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text }] })
  const reply = (turn, text) => dsh.pushEvent(DEMO, 'assistant/message', { turn, message: { content: [{ type: 'reasoning', text: '파일 구조를 먼저 봅니다.' }, { type: 'text', text }] } })
  dsh.pushEvent(DEMO, 'session/title', { title: '로그인 화면 다듬기' })
  user('로그인 버튼 글자를 키우고 오류 문구를 한국어로 바꿔 줘')
  dsh.pushEvent(DEMO, 'turn/start', { turn: 1 })
  dsh.pushEvent(DEMO, 'tool/call', { callId: 'c1', name: 'bash', arguments: JSON.stringify({ command: 'rg -n "Sign in" src' }) })
  dsh.pushEvent(DEMO, 'tool/result', { message: { toolCallId: 'c1', isError: false, content: [{ type: 'text', text: 'src/Login.tsx:12:  <button>Sign in</button>\nsrc/Login.tsx:20:  <p>Invalid password</p>' }] } })
  dsh.pushEvent(DEMO, 'tool/call', { callId: 'c2', name: 'edit', arguments: JSON.stringify({ file_path: '/home/user/app/src/Login.tsx' }) })
  dsh.pushEvent(DEMO, 'tool/result', {
    message: { toolCallId: 'c2', isError: false, content: [{ type: 'text', text: 'edited' }] },
    meta: { diffs: [{ path: '/home/user/app/src/Login.tsx', oldText: 'export function Login() {\n  return (\n    <form>\n      <button className="btn">Sign in</button>\n      <p className="error">Invalid password</p>\n    </form>\n  )\n}\n', newText: 'export function Login() {\n  return (\n    <form>\n      <button className="btn btn-lg">로그인</button>\n      <p className="error" role="alert">비밀번호가 맞지 않습니다</p>\n    </form>\n  )\n}\n' }] },
  })
  dsh.pushEvent(DEMO, 'tool/call', { callId: 'c3', name: 'write', arguments: JSON.stringify({ file_path: '/home/user/app/src/login.css', content: '.btn-lg {\n  font-size: 1.125rem;\n  min-height: 44px;\n}\n' }) })
  dsh.pushEvent(DEMO, 'tool/result', { message: { toolCallId: 'c3', isError: false, content: [{ type: 'text', text: 'written' }] } })
  dsh.pushEvent(DEMO, 'workspace/changes', { turn: 1 })
  reply(1, '버튼을 `btn-lg`로 키우고 오류 문구를 바꿨습니다.\n\n- 버튼 글자: **로그인**\n- 오류: 비밀번호가 맞지 않습니다 (`role="alert"`로 화면 낭독기에도 읽힙니다)\n\n```css\n.btn-lg {\n  font-size: 1.125rem;\n  min-height: 44px;\n}\n```')
  dsh.pushEvent(DEMO, 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  // A subagent the demo session handed work to.
  dsh.pushEvent(HELPER, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '`Sign in` 문구가 쓰인 곳을 모두 찾아 줘' }] })
  dsh.pushEvent(HELPER, 'turn/start', { turn: 1 })
  dsh.pushEvent(HELPER, 'tool/call', { callId: 'h1', name: 'bash', arguments: JSON.stringify({ command: 'rg -n "Sign in" src' }) })
  dsh.pushEvent(HELPER, 'tool/result', { message: { toolCallId: 'h1', isError: false, content: [{ type: 'text', text: 'src/Login.tsx:12:  <button>Sign in</button>' }] } })
  dsh.pushEvent(HELPER, 'assistant/message', { turn: 1, message: { content: [{ type: 'text', text: '`src/Login.tsx` 12번째 줄 한 곳에서만 씁니다.' }] } })
  dsh.pushEvent(HELPER, 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  dsh.pushEvent(SECOND, 'session/title', { title: '배포 스크립트 점검' })
  dsh.pushEvent(SECOND, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '배포 전에 빠진 검사가 있는지 봐 줘' }] })
}

async function respond(dsh, request) {
  const sessionId = request.sessionId
  const text = request.content.map((p) => p.text ?? '').join('')
  const turn = Date.now()
  dsh.pushEvent(sessionId, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text }] })
  dsh.setRunning(sessionId, true)
  dsh.pushEvent(sessionId, 'turn/start', { turn })
  const attemptId = `attempt-${String(turn)}`
  dsh.pushStream(sessionId, { type: 'start', attemptId })
  const answer = `받은 글은 ${String(text.length)}자입니다. 가짜 DSH라서 실제로 일하지는 않지만, 글이 조금씩 나타나는 모습을 확인할 수 있습니다.`
  for (const piece of answer.match(/.{1,6}/gsu) ?? []) {
    dsh.pushStream(sessionId, { type: 'chunk', attemptId, chunk: { type: 'text-delta', text: piece } })
    await sleep(60)
  }
  if (text.includes('승인')) {
    dsh.pushEvent(sessionId, 'tool/call', { callId: `call-${String(turn)}`, name: 'write', arguments: JSON.stringify({ file_path: '/home/user/outside.txt', content: 'hi\n' }) })
    const frame = dsh.waterfall({ event: 'approval/request', agentId: sessionId, request: { toolName: 'write', callId: `call-${String(turn)}`, reason: '작업 폴더 밖 /home/user/outside.txt 에 쓰려고 합니다' } })
    dsh.pushEvent(sessionId, 'approval/asked', { id: frame.eventId, toolName: 'write', reason: '작업 폴더 밖 쓰기' })
    while (!dsh.state.answers.some((a) => a.eventId === frame.eventId)) await sleep(200)
    const decision = dsh.state.answers.find((a) => a.eventId === frame.eventId).value
    dsh.pushEvent(sessionId, 'approval/decided', { id: frame.eventId, outcome: decision })
    dsh.pushEvent(sessionId, 'tool/result', {
      message: { toolCallId: `call-${String(turn)}`, isError: decision !== 'allowed-once', content: [{ type: 'text', text: decision === 'allowed-once' ? 'written' : '사용자가 거부했습니다' }] },
      meta: decision === 'allowed-once' ? { diffs: [{ path: '/home/user/outside.txt', oldText: null, newText: 'hi\n' }] } : {},
    })
  }
  dsh.pushStream(sessionId, { type: 'end', attemptId, outcome: { kind: 'committed' } })
  dsh.pushEvent(sessionId, 'assistant/message', { turn, message: { content: [{ type: 'text', text: answer }] } })
  dsh.pushEvent(sessionId, 'turn/end', { turn, reason: { kind: 'completed' } })
  dsh.setRunning(sessionId, false)
}

let upstreamUrl
if (real) {
  const upstream = readJson(path.join(dataDir(), 'upstream.json'))
  if (!upstream?.url) throw new Error('no upstream.json: set devUpstreamFile: true in the plugin config and restart Desktop')
  upstreamUrl = () => readJson(path.join(dataDir(), 'upstream.json'))?.url ?? upstream.url
} else {
  const dsh = await createFakeDsh({
    sessions: [
      { sessionId: DEMO, cwd: '/home/user/app' },
      { sessionId: SECOND, cwd: '/home/user/deploy' },
      { sessionId: HELPER, cwd: '/home/user/app', parentSessionId: DEMO, label: '문구 쓰인 곳 찾기', mode: 'one-shot' },
    ],
    workspaces: [{ workspaceId: 'ws-1', path: '/home/user/app', title: 'app', sessionIds: [DEMO] }],
    onPrompt: (request) => void respond(dsh, request),
  })
  seed(dsh)
  upstreamUrl = () => dsh.url
}

const dir = ensureDir(path.join(ROOT, '.dev-home', 'data'))
const app = await startHandheld({ upstreamUrl, dataDir: dir, config: loadConfig(dir, { port, devNoAuth: true, publicOrigin: null, access: null }), logger })
console.log(`dev gateway: http://localhost:${String(app.port)}/h/  (${real ? 'real Desktop' : 'fake DSH'})`)
