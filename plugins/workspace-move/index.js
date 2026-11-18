// DSH Host 쪽 진입점. 인증된 /api 정확 경로 하나만 열고, 나머지는 src/host로 넘긴다.
// 앱 안의 @deepseek-ai 모듈은 import하지 않는다: 프로필 플러그인은 그 모듈을 안정적으로 해석할 수 없다.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMoveService } from './src/host/move.js'
import { resolveSettings } from './src/host/settings.js'

export const name = 'dsh-workspace-move'

export const inject = ['connection', 'sessionPersistence', 'workspaceRegistry']

// 화면(브라우저)과 서버(Host)가 서로 다른 판을 돌 때를 알아채기 위한 표식.
const HOST_REVISION = '2026-11-16-copy-1'

export async function apply(ctx, config = {}) {
  const logger = ctx.logger('dsh-workspace-move')
  const settings = resolveSettings(config)
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh')

  const service = createMoveService({
    persistence: ctx.sessionPersistence,
    registry: ctx.workspaceRegistry,
    fs,
    dataDir: path.join(home, 'dsh-workspace-move'),
    settings,
    logger,
    hostRevision: HOST_REVISION,
  })

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/workspace-move',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: request => service.handle(request),
  }), 'dsh-workspace-move: move route')

}
