// 계획 문서용 작은 마크다운 해석기: 글을 React와 무관한 노드 나무로 바꾼다.
// DSH 플러그인 안내가 Harness Client 패키지(공용 MarkdownText 포함)를 불러 쓰지 말라고 해서 직접 그린다.
// HTML은 해석하지 않고 글자로 남긴다. 링크는 http·https만 연다. 그림은 대체 글만 보인다.

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^ {0,3}>\s?/
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/
const TASK = /^\[([ xX])\](?:\s+|$)/
const TABLE_DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const SAFE_LINK = /^(https?:\/\/|mailto:)/i

const isBlank = line => line.trim() === ''

function splitCells(line) {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  const cells = []
  let cell = ''
  let inCode = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\' && body[i + 1] === '|') { cell += '|'; i++; continue }
    if (ch === '`') inCode = !inCode
    if (ch === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue }
    cell += ch
  }
  cells.push(cell.trim())
  return cells
}

function tableAlign(cell) {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null
}

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && TABLE_DIVIDER.test(lines[i + 1])
}

// 문단을 끊는 줄인가(목록은 문단 안에서도 새로 시작한다).
function startsBlock(lines, i) {
  const line = lines[i]
  return FENCE_OPEN.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line)
    || LIST_ITEM.test(line) || isTableStart(lines, i)
}

function stripIndent(line, width) {
  let n = 0
  while (n < width && line[n] === ' ') n++
  return line.slice(n)
}

function parseList(lines, start) {
  const first = LIST_ITEM.exec(lines[start])
  const ordered = /\d/.test(first[2])
  const indent = first[1].length
  const items = []
  let i = start
  while (i < lines.length) {
    const found = LIST_ITEM.exec(lines[i])
    if (found === null || found[1].length !== indent || /\d/.test(found[2]) !== ordered) break
    const offset = indent + found[2].length + Math.min(Math.max(found[3].length, 1), 4)
    const body = [found[4]]
    i++
    while (i < lines.length) {
      const line = lines[i]
      if (isBlank(line)) {
        let next = i + 1
        while (next < lines.length && isBlank(lines[next])) next++
        const resumes = next < lines.length && lines[next].length - lines[next].trimStart().length > indent
        if (!resumes) break
        for (; i < next; i++) body.push('')
        continue
      }
      const lead = line.length - line.trimStart().length
      if (lead > indent) { body.push(stripIndent(line, offset)); i++; continue }
      if (!isBlank(body[body.length - 1]) && !startsBlock(lines, i)) { body.push(line.trimStart()); i++; continue }
      break
    }
    let checked = null
    const task = TASK.exec(body[0])
    if (task !== null) {
      checked = task[1] !== ' '
      body[0] = body[0].slice(task[0].length)
    }
    items.push({ checked, children: parseBlocks(body) })
    while (i < lines.length && isBlank(lines[i])) {
      const next = LIST_ITEM.exec(lines[i + 1] ?? '')
      if (next === null || next[1].length !== indent) break
      i++
    }
  }
  const node = { type: 'list', ordered, items }
  if (ordered) node.start = Number.parseInt(first[2], 10)
  return { node, next: i }
}

export function parseBlocks(input) {
  const lines = Array.isArray(input) ? input : String(input ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isBlank(line)) { i++; continue }

    const fence = FENCE_OPEN.exec(line)
    if (fence !== null) {
      const mark = fence[1]
      const body = []
      i++
      while (i < lines.length && !new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}\\s*$`).test(lines[i])) body.push(lines[i++])
      i++
      blocks.push({ type: 'code', lang: fence[2] || '', text: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading !== null) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2] ?? '') })
      i++
      continue
    }

    if (RULE.test(line)) { blocks.push({ type: 'rule' }); i++; continue }

    if (QUOTE.test(line)) {
      const body = []
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ''))
      blocks.push({ type: 'quote', children: parseBlocks(body) })
      continue
    }

    if (LIST_ITEM.test(line)) {
      const { node, next } = parseList(lines, i)
      blocks.push(node)
      i = next
      continue
    }

    if (isTableStart(lines, i)) {
      const head = splitCells(line)
      const align = splitCells(lines[i + 1]).map(tableAlign)
      const rows = []
      i += 2
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
        const cells = splitCells(lines[i++])
        rows.push(head.map((_, c) => parseInline(cells[c] ?? '')))
      }
      blocks.push({ type: 'table', align: head.map((_, c) => align[c] ?? null), head: head.map(cell => parseInline(cell)), rows })
      continue
    }

    const body = [line.trimStart()]
    i++
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines, i)) body.push(lines[i++].trimStart())
    blocks.push({ type: 'paragraph', children: parseInline(body.join('\n').trimEnd()) })
  }
  return blocks
}

// ── 인라인 ───────────────────────────────────────────────────

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/
const WORD = /[\p{L}\p{N}]/u

function pushText(out, value) {
  if (value === '') return
  const last = out[out.length - 1]
  if (last?.type === 'text') last.value += value
  else out.push({ type: 'text', value })
}

// 닫는 표시를 찾는다. 바로 앞 글자가 공백이면 닫는 표시가 아니다.
function findClose(text, mark, from) {
  for (let at = text.indexOf(mark, from); at !== -1; at = text.indexOf(mark, at + 1)) {
    if (at > from && !/\s/.test(text[at - 1]) && text[at - 1] !== '\\') {
      if (mark === '*' && text[at + 1] === '*') { at++; continue }
      if (mark === '_' && WORD.test(text[at + 1] ?? '')) continue
      return at
    }
  }
  return -1
}

// [글](주소) — 대괄호 안의 대괄호, 주소 안의 괄호 한 겹까지 맞춘다.
function readLink(text, at) {
  let depth = 0
  let close = -1
  for (let j = at; j < text.length; j++) {
    if (text[j] === '\\') { j++; continue }
    if (text[j] === '[') depth++
    if (text[j] === ']' && --depth === 0) { close = j; break }
  }
  if (close === -1 || text[close + 1] !== '(') return null
  let parens = 0
  for (let j = close + 2; j < text.length; j++) {
    if (text[j] === '(') parens++
    if (text[j] === ')' && parens-- === 0) {
      const target = text.slice(close + 2, j).trim().replace(/^<|>$/g, '').split(/\s+/)[0]
      return { label: text.slice(at + 1, close), href: target, end: j + 1 }
    }
  }
  return null
}

const EMPHASIS = [['**', 'strong'], ['__', 'strong'], ['~~', 'del'], ['*', 'em'], ['_', 'em']]

export function parseInline(text) {
  const out = []
  let i = 0
  let plain = ''
  const flush = () => { pushText(out, plain); plain = '' }
  while (i < text.length) {
    const ch = text[i]

    if (ch === '\\' && text[i + 1] === '\n') { flush(); out.push({ type: 'break' }); i += 2; continue }
    if (ch === '\\' && PUNCTUATION.test(text[i + 1] ?? '')) { plain += text[i + 1]; i += 2; continue }
    if (ch === ' ' && text.startsWith('  \n', i)) {
      let end = i
      while (text[end] === ' ') end++
      if (text[end] === '\n') { flush(); out.push({ type: 'break' }); i = end + 1; continue }
    }

    if (ch === '`') {
      let run = 1
      while (text[i + run] === '`') run++
      const ticks = '`'.repeat(run)
      let close = text.indexOf(ticks, i + run)
      while (close !== -1 && text[close + run] === '`') close = text.indexOf(ticks, close + run + 1)
      if (close !== -1) {
        flush()
        let value = text.slice(i + run, close).replace(/\n/g, ' ')
        if (/^ .*[^ ].* $/.test(value)) value = value.slice(1, -1)
        out.push({ type: 'code', value })
        i = close + run
        continue
      }
      plain += ticks
      i += run
      continue
    }

    if (ch === '!' && text[i + 1] === '[') {
      const link = readLink(text, i + 1)
      if (link !== null) { plain += link.label; i = link.end; continue }
    }

    if (ch === '[') {
      const link = readLink(text, i)
      if (link !== null) {
        flush()
        const children = parseInline(link.label)
        if (SAFE_LINK.test(link.href)) out.push({ type: 'link', href: link.href, children })
        else out.push(...children)
        i = link.end
        continue
      }
    }

    if (ch === '<') {
      const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(text.slice(i))
      if (auto !== null) {
        flush()
        out.push({ type: 'link', href: auto[1], children: [{ type: 'text', value: auto[1] }] })
        i += auto[0].length
        continue
      }
    }

    const emphasis = EMPHASIS.find(([mark]) => text.startsWith(mark, i))
    if (emphasis !== undefined) {
      const [mark, type] = emphasis
      const opensWord = !(mark[0] === '_' && WORD.test(text[i - 1] ?? ''))
      const nextChar = text[i + mark.length] ?? ''
      if (opensWord && nextChar !== '' && !/\s/.test(nextChar)) {
        const close = findClose(text, mark, i + mark.length)
        if (close !== -1) {
          flush()
          out.push({ type, children: parseInline(text.slice(i + mark.length, close)) })
          i = close + mark.length
          continue
        }
      }
      plain += mark
      i += mark.length
      continue
    }

    plain += ch
    i++
  }
  flush()
  return out
}

// 노드 나무의 글자만(제목 비교·화면 읽기용).
export function plainText(nodes) {
  return (nodes ?? []).map(node => (node.type === 'text' || node.type === 'code' ? node.value
    : node.type === 'break' ? ' ' : plainText(node.children))).join('')
}

export function parseMarkdown(markdown) {
  return parseBlocks(markdown)
}
