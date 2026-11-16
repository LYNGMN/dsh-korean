// Work-stage snapshot (lib/stages.js) -> screen text in the chosen language.
import { t } from './i18n.js'

export const stageTitle = (key) => t(`stage.${key}.title`)
export const stageStep = (key) => t(`stage.${key}.step`)
export const stagePlain = (key) => t(`stage.${key}.plain`)
export const statusText = (status) => t(`stage.status.${status}`)

/** One line for the strip under the session header. */
export function stageSummary(snapshot, error) {
  if (snapshot.kind === 'loading') return error ? t('stage.failed', { error }) : t('stage.loading')
  if (snapshot.kind === 'no-repo') return t('stage.noRepo')
  if (snapshot.current === null) return t('stage.allDone', { done: snapshot.done, total: snapshot.total })
  const stage = snapshot.stages[snapshot.current]
  const vars = { stage: stageTitle(stage.key), done: snapshot.done, total: snapshot.total }
  return stage.approval ? t('stage.summaryApproval', vars) : t('stage.summary', vars)
}

const pad = (n) => String(n).padStart(2, '0')
/** A time (ms) as hours:minutes on this device. */
export function clockOf(at) {
  const time = new Date(at)
  return `${pad(time.getHours())}:${pad(time.getMinutes())}`
}

// An open review request's checks and review in one line, then the failed checks by name.
function prChecks(pr) {
  if (!pr || pr.state !== 'OPEN') return []
  const c = pr.checks
  const parts = c ? [
    ...(c.passing ? [t('stage.f.checksPass', { n: c.passing })] : []),
    ...(c.failing ? [t('stage.f.checksFail', { n: c.failing })] : []),
    ...(c.pending ? [t('stage.f.checksPending', { n: c.pending })] : []),
  ] : []
  if (pr.review) parts.push(t(`stage.f.review.${pr.review}`))
  const lines = parts.length ? [parts.join(' · ')] : []
  if (c?.failed?.length) lines.push(t('stage.f.failedChecks', { names: c.failed.join(', ') }))
  return lines
}

/** Facts about one stage, each a sentence. */
export function stageFacts(stage) {
  const i = stage.info
  switch (stage.key) {
    case 'branch':
      if (i.detached) return [t('stage.f.detached')]
      if (i.isBase) return [t('stage.f.onBase', { branch: i.branch })]
      return [t('stage.f.branch', { branch: i.branch }), ...(i.nameOk ? [] : [t('stage.f.badName')])]
    case 'commit':
      if (i.changes > 0) return [t('stage.f.changes', { n: i.changes }), t('stage.f.ahead', { n: i.ahead })]
      return [i.ahead > 0 ? t('stage.f.savedClean', { n: i.ahead }) : t('stage.f.nothing')]
    case 'verify':
      if (i.run) return [t('stage.f.ranOk', { time: clockOf(i.run.at), command: i.run.command }), t(i.run.editedAfter ? 'stage.f.editedAfter' : 'stage.f.noEditAfter')]
      if (i.by === 'todo') return [t('stage.f.verifyTodo', { item: i.item })]
      return [i.by === 'run' ? t('stage.f.verifyRun') : t('stage.f.verifyNone')]
    case 'share': {
      const lines = [!i.upstream ? t('stage.f.notPushed') : i.unpushed > 0 ? t('stage.f.unpushed', { n: i.unpushed }) : t('stage.f.pushed')]
      if (i.pr) lines.push(t(i.pr.state === 'CLOSED' ? 'stage.f.prClosed' : i.pr.draft ? 'stage.f.prDraft' : 'stage.f.pr', { n: i.pr.number }))
      else if (i.prError === 'auth') lines.push(t('stage.f.ghAuth'))
      else if (i.prError === 'no-gh') lines.push(t('stage.f.noGh'))
      else if (i.prError) lines.push(t('stage.f.prError'))
      else if (i.upstream) lines.push(t('stage.f.noPr'))
      return [...lines, ...prChecks(i.pr)]
    }
    case 'merge':
      if (i.by === 'pr') return [t('stage.f.mergedPr', { n: i.pr.number, base: i.base })]
      if (i.by === 'local') return [t('stage.f.mergedLocal', { base: i.base })]
      return [t('stage.f.notMerged', { base: i.base }), ...prChecks(i.pr)]
    case 'deploy':
      return [i.tag ? t('stage.f.tag', { tag: i.tag }) : t('stage.f.noTag')]
    default:
      return []
  }
}

// While the agent works there is nothing for the person to do at these stages but wait.
const WAIT_STAGES = new Set(['branch', 'commit', 'verify'])

/** What to do next at the current stage; null for any other stage. */
export function stageNext(stage, { running = false } = {}) {
  if (stage.status !== 'current') return null
  if (stage.blocked === 'gh-auth') return t('stage.n.ghAuth')
  if (stage.blocked === 'checks') return t('stage.n.checks')
  if (running && WAIT_STAGES.has(stage.key)) return t(`stage.n.wait.${stage.key}`)
  const i = stage.info
  switch (stage.key) {
    case 'branch': return t('stage.n.branch')
    case 'commit': return t(i.changes > 0 ? 'stage.n.commitDirty' : 'stage.n.commit')
    case 'verify': return t(i.run?.editedAfter ? 'stage.n.verifyAgain' : 'stage.n.verify')
    case 'share': return t(i.upstream && i.unpushed === 0 ? 'stage.n.sharePr' : 'stage.n.share')
    case 'merge': return t('stage.n.merge')
    case 'deploy': return t('stage.n.deploy')
    default: return null
  }
}

/**
 * Before approving share or merge: what goes up (commit titles, file counts) and what stays (unsaved changes).
 * Null for a finished stage or when nothing would go up.
 */
export function stageOutgoing(stage) {
  if ((stage.key !== 'share' && stage.key !== 'merge') || stage.status === 'done') return null
  const out = stage.info.outgoing
  if (!out || out.total === 0) return null
  const hidden = out.total - out.commits.length
  return {
    title: stage.key === 'share' ? t('stage.o.share') : t('stage.o.merge', { base: stage.info.base }),
    commits: out.commits.map((c) => c.subject),
    more: hidden > 0 ? t('stage.o.more', { n: hidden }) : null,
    files: out.files ? t('stage.o.files', { n: out.files.changed, added: out.files.added, removed: out.files.removed }) : null,
    left: out.changes > 0 ? t('stage.o.left', { n: out.changes }) : null,
    pending: out.pending.map((p) => `${t(`stage.o.kind.${p.kind}`)} · ${p.path}`),
  }
}

/**
 * One request to send the agent at the current stage. The button only puts it in the message box; the person sends it.
 * Null for any other stage, when GitHub sign-in comes first, or when there is nothing to commit yet.
 * @param {string|null} [repo] repository inside a workspace folder, named so the agent works in the right one.
 */
export function stageAsk(stage, repo = null) {
  const key = askKeyOf(stage)
  if (key === null) return null
  return repo ? t('stage.a.inRepo', { repo, ask: t(key) }) : t(key)
}

function askKeyOf(stage) {
  if (stage.status !== 'current') return null
  if (stage.blocked === 'checks') return 'stage.a.checks'
  if (stage.blocked) return null
  const i = stage.info
  switch (stage.key) {
    case 'branch': return 'stage.a.branch'
    case 'commit': return i.changes > 0 ? 'stage.a.commit' : null
    case 'verify': return 'stage.a.verify'
    case 'share': return 'stage.a.share'
    // Pushed but no open review request yet: open one first.
    case 'merge': return i.pr && i.pr.state === 'OPEN' ? 'stage.a.merge' : 'stage.a.openPr'
    case 'deploy': return 'stage.a.deploy'
    default: return null
  }
}
