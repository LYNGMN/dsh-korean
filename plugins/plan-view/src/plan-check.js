// 계획 문서 단계 자동 체크: 목록 줄을 할 일 문구와 맞춰 GFM 체크(- [x])로 바꾼다.
// 문구가 비슷한 단계만 체크하므로 틀릴 수 있다. 짝이 없는 줄은 그대로 둔다.

export const MATCH_THRESHOLD = 0.5
const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(\S.*)$/
const FENCE = /^\s*(```|~~~)/

export function normalizeStep(text) {
  return String(text)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

function bigrams(text) {
  const compact = text.replace(/\s+/g, '')
  const counts = new Map()
  for (let i = 0; i < compact.length - 1; i++) {
    const pair = compact.slice(i, i + 2)
    counts.set(pair, (counts.get(pair) ?? 0) + 1)
  }
  return { counts, size: Math.max(compact.length - 1, 0), compact }
}

// 글자 2-gram Dice 유사도(0~1). 한쪽이 다른 쪽을 통째로 품으면(4글자 이상) 0.75 이상으로 본다.
export function similarity(a, b) {
  const x = bigrams(normalizeStep(a))
  const y = bigrams(normalizeStep(b))
  if (x.compact === '' || y.compact === '') return 0
  if (x.compact === y.compact) return 1
  let shared = 0
  for (const [pair, n] of x.counts) shared += Math.min(n, y.counts.get(pair) ?? 0)
  const dice = x.size + y.size === 0 ? 0 : (2 * shared) / (x.size + y.size)
  const [short, long] = x.compact.length <= y.compact.length ? [x.compact, y.compact] : [y.compact, x.compact]
  return short.length >= 4 && long.includes(short) ? Math.max(dice, 0.75) : dice
}

// 코드 울타리 밖의 목록 줄.
export function planSteps(markdown) {
  const steps = []
  let fenced = false
  String(markdown).split('\n').forEach((line, index) => {
    if (FENCE.test(line)) { fenced = !fenced; return }
    if (fenced) return
    const found = LIST_LINE.exec(line)
    if (found === null) return
    steps.push({ index, indent: found[1], marker: found[2], checked: found[3], text: found[4] })
  })
  return steps
}

// todos: [{content, status}]. 돌려주는 것: 고친 마크다운, 짝지은 단계 수, 그중 완료 수.
export function checkPlanMarkdown(markdown, todos) {
  const steps = planSteps(markdown)
  const pairs = []
  steps.forEach((step, s) => (todos ?? []).forEach((todo, t) => {
    const score = similarity(step.text, todo.content)
    if (score >= MATCH_THRESHOLD) pairs.push({ s, t, score })
  }))
  pairs.sort((a, b) => b.score - a.score || a.s - b.s)
  const stepUsed = new Map()
  const todoUsed = new Set()
  for (const pair of pairs) {
    if (stepUsed.has(pair.s) || todoUsed.has(pair.t)) continue
    stepUsed.set(pair.s, todos[pair.t])
    todoUsed.add(pair.t)
  }
  if (stepUsed.size === 0) return { markdown, matched: 0, done: 0 }
  const lines = String(markdown).split('\n')
  let done = 0
  for (const [s, todo] of stepUsed) {
    const step = steps[s]
    const isDone = todo.status === 'completed'
    if (isDone) done++
    lines[step.index] = `${step.indent}${step.marker} [${isDone ? 'x' : ' '}] ${step.text}`
  }
  return { markdown: lines.join('\n'), matched: stepUsed.size, done }
}
