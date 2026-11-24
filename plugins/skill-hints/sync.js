import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 감싸개 설명 맞추기 — `~/.agents/bin/dsh-sync-skills`를 DSH 언어로 돌린다.
 *
 * DSH는 작업 모드(프리셋)마다 스킬 파일을 다시 읽어 플러그인이 내놓은 같은 이름 스킬을 덮는다.
 * 그래서 메뉴 설명은 파일(`~/.dsh/skills/*.md`)에서 바꾸고, 이 플러그인은 그 스크립트를 부르기만 한다.
 * 스크립트가 없는 맥에서는 아무것도 하지 않는다.
 */
export const DEFAULT_SCRIPT = join(homedir(), '.agents', 'bin', 'dsh-sync-skills')
const TIMEOUT_MS = 30_000
// GUI로 켠 Host는 PATH가 짧아 `#!/usr/bin/env python3`가 python3를 못 찾을 수 있다.
const PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(':')

export function scriptAvailable(script = DEFAULT_SCRIPT) {
  try {
    accessSync(script, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** 기본 실행기: 종료 코드와 출력을 돌려준다(실패해도 던지지 않는다). */
export function runFile(file, args, env) {
  return new Promise((resolve) => {
    execFile(file, args, { env: { ...process.env, PATH: `${PATH}:${process.env.PATH ?? ''}`, ...env }, timeout: TIMEOUT_MS }, (error, stdout) => {
      const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0
      resolve({ code, stdout: String(stdout ?? '') })
    })
  })
}

/** 출력 마지막 요약 줄에서 바꾼(또는 바꿀) 건수. 없으면 0. */
export function changedCount(stdout) {
  const m = /(\d+)건 (?:고침|바꿀 것 있음)/u.exec(String(stdout ?? ''))
  return m ? Number(m[1]) : 0
}

/**
 * @param {{ script?: string, run?: typeof runFile, available?: () => boolean }} [options]
 * @returns {{ check: (locale: string) => Promise<Result>, apply: (locale: string) => Promise<Result> }}
 *   Result = { available: boolean, ok: boolean, changed: number }
 */
export function createSync({ script = DEFAULT_SCRIPT, run = runFile, available = () => scriptAvailable(script) } = {}) {
  let queue = Promise.resolve()
  const call = (locale, apply) => {
    const job = queue.then(async () => {
      if (!available()) return { available: false, ok: false, changed: 0 }
      const { code, stdout } = await run(script, apply ? ['--apply'] : [], { DSH_SKILL_LOCALE: locale })
      // 미리 보기는 바꿀 것이 있으면 1로 끝난다. 그 밖의 코드는 실패다.
      const ok = code === 0 || (!apply && code === 1)
      return { available: true, ok, changed: ok ? changedCount(stdout) : 0 }
    })
    queue = job.catch(() => {})
    return job
  }
  return {
    check: (locale) => call(locale, false),
    apply: (locale) => call(locale, true),
  }
}
