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

/** Facts about one stage, each a sentence. */
export function stageFacts(stage) {
  const i = stage.info
  switch (stage.key) {
    case 'branch':
      if (i.detached) return [t('stage.f.detached')]
      if (i.isBase) return [t('stage.f.onBase', { branch: i.branch })]
      return [t('stage.f.branch', { branch: i.branch }), ...(i.nameOk ? [] : [t('stage.f.badName')])]
    case 'commit':
      return [i.changes > 0 ? t('stage.f.changes', { n: i.changes }) : t('stage.f.clean'), t('stage.f.ahead', { n: i.ahead })]
    case 'verify':
      if (i.by === 'todo') return [t('stage.f.verifyTodo', { item: i.item })]
      return [i.by === 'run' ? t('stage.f.verifyRun') : t('stage.f.verifyNone')]
    case 'share': {
      const lines = [!i.upstream ? t('stage.f.notPushed') : i.unpushed > 0 ? t('stage.f.unpushed', { n: i.unpushed }) : t('stage.f.pushed')]
      if (i.pr) lines.push(t(i.pr.state === 'CLOSED' ? 'stage.f.prClosed' : i.pr.draft ? 'stage.f.prDraft' : 'stage.f.pr', { n: i.pr.number }))
      else if (i.prError === 'auth') lines.push(t('stage.f.ghAuth'))
      else if (i.prError === 'no-gh') lines.push(t('stage.f.noGh'))
      else if (i.prError) lines.push(t('stage.f.prError'))
      else if (i.upstream) lines.push(t('stage.f.noPr'))
      return lines
    }
    case 'merge':
      if (i.by === 'pr') return [t('stage.f.mergedPr', { n: i.pr.number, base: i.base })]
      return [t(i.by === 'local' ? 'stage.f.mergedLocal' : 'stage.f.notMerged', { base: i.base })]
    case 'deploy':
      return [i.tag ? t('stage.f.tag', { tag: i.tag }) : t('stage.f.noTag')]
    default:
      return []
  }
}

/** What to do next at the current stage; null for any other stage. */
export function stageNext(stage) {
  if (stage.status !== 'current') return null
  if (stage.blocked === 'gh-auth') return t('stage.n.ghAuth')
  const i = stage.info
  switch (stage.key) {
    case 'branch': return t('stage.n.branch')
    case 'commit': return t(i.changes > 0 ? 'stage.n.commitDirty' : 'stage.n.commit')
    case 'verify': return t('stage.n.verify')
    case 'share': return t(i.upstream && i.unpushed === 0 ? 'stage.n.sharePr' : 'stage.n.share')
    case 'merge': return t('stage.n.merge')
    case 'deploy': return t('stage.n.deploy')
    default: return null
  }
}
