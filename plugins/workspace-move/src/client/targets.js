// 대상 목록과, 제목이 겹칠 때만 붙이는 짧은 꼬리 경로.
export function targetWorkspaces(items, sourceWorkspaceId) {
  return items.filter(item => item.workspaceId !== sourceWorkspaceId)
}

function duplicateTitles(items) {
  const counts = new Map()
  for (const item of items) counts.set(item.title, (counts.get(item.title) ?? 0) + 1)
  return new Set([...counts].filter(([, count]) => count > 1).map(([title]) => title))
}

function trailingSegments(targetPath) {
  return String(targetPath).split('/').filter(segment => segment.length > 0)
}

export function pathSuffix(item, others) {
  const mine = trailingSegments(item.path)
  for (let count = 1; count <= mine.length; count += 1) {
    const tail = mine.slice(-count).join('/')
    const clash = others.some(other => {
      if (other.workspaceId === item.workspaceId) return false
      const segments = trailingSegments(other.path)
      return count <= segments.length && segments.slice(-count).join('/') === tail
    })
    if (!clash) return tail
  }
  return mine.join('/')
}

export function targetRows(items, sourceWorkspaceId) {
  const targets = targetWorkspaces(items, sourceWorkspaceId)
  const duplicated = duplicateTitles(targets)
  return targets.map(item => ({
    id: item.workspaceId,
    title: item.title,
    path: item.path,
    suffix: duplicated.has(item.title) ? pathSuffix(item, targets) : '',
  }))
}
