// Line diff for the diff view: LCS over lines, grouped into hunks with context.

const CONTEXT = 3
const MAX_CELLS = 4_000_000

function splitLines(text) {
  if (!text) return []
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

/** @returns {Array<{type: ' '|'-'|'+', text: string}>} */
function lineOps(a, b) {
  // Trim the common head and tail so the table only covers the changed middle.
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1
  const ma = a.slice(head, a.length - tail)
  const mb = b.slice(head, b.length - tail)
  const ops = a.slice(0, head).map((text) => ({ type: ' ', text }))
  if ((ma.length + 1) * (mb.length + 1) > MAX_CELLS) {
    for (const text of ma) ops.push({ type: '-', text })
    for (const text of mb) ops.push({ type: '+', text })
  } else {
    const w = mb.length + 1
    const table = new Uint32Array((ma.length + 1) * w)
    for (let i = ma.length - 1; i >= 0; i -= 1) {
      for (let j = mb.length - 1; j >= 0; j -= 1) {
        table[i * w + j] = ma[i] === mb[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < ma.length && j < mb.length) {
      if (ma[i] === mb[j]) { ops.push({ type: ' ', text: ma[i] }); i += 1; j += 1 }
      else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) { ops.push({ type: '-', text: ma[i] }); i += 1 }
      else { ops.push({ type: '+', text: mb[j] }); j += 1 }
    }
    while (i < ma.length) { ops.push({ type: '-', text: ma[i] }); i += 1 }
    while (j < mb.length) { ops.push({ type: '+', text: mb[j] }); j += 1 }
  }
  for (const text of a.slice(a.length - tail)) ops.push({ type: ' ', text })
  return ops
}

/**
 * @param {string | null} oldText - null for a new file
 * @param {string} newText
 * @returns {{added: number, removed: number, hunks: Array<{lines: Array<{type: string, text: string, oldNo: number|null, newNo: number|null}>}>}}
 */
export function diffLines(oldText, newText) {
  const ops = lineOps(splitLines(oldText ?? ''), splitLines(newText ?? ''))
  let oldNo = 1
  let newNo = 1
  const numbered = ops.map((op) => {
    const line = { ...op, oldNo: op.type === '+' ? null : oldNo, newNo: op.type === '-' ? null : newNo }
    if (op.type !== '+') oldNo += 1
    if (op.type !== '-') newNo += 1
    return line
  })
  const changed = numbered.map((l, index) => (l.type === ' ' ? -1 : index)).filter((index) => index >= 0)
  const hunks = []
  let current = null
  for (const index of changed) {
    const start = Math.max(0, index - CONTEXT)
    const end = Math.min(numbered.length - 1, index + CONTEXT)
    if (current && start <= current.end + 1) current.end = end
    else {
      current = { start, end }
      hunks.push(current)
    }
  }
  return {
    added: numbered.filter((l) => l.type === '+').length,
    removed: numbered.filter((l) => l.type === '-').length,
    hunks: hunks.map(({ start, end }) => ({ lines: numbered.slice(start, end + 1) })),
  }
}
