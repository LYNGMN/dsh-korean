// Finds the code search inside a shell command line (grep, rg, find) and the words it looks for.
// It only reads the text: nothing here runs a command, and a command it cannot make sense of is "not a search".

const OPERATORS = new Set([';', '&&', '||', '|', '&', '\n'])
const WITH_VALUE = new Set(['-e', '-f', '-m', '-A', '-B', '-C', '-g', '-t', '-T', '-d', '--regexp', '--file', '--max-count',
  '--context', '--after-context', '--before-context', '--include', '--exclude', '--exclude-dir', '--glob', '--type', '--type-not'])
const GREPS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack'])

// Quotes and escapes are honoured so a "|" inside a pattern is not a pipe.
function tokens(input) {
  const out = []
  let word = ''
  let has = false
  let quote = null
  const flush = () => { if (has) out.push({ word }); word = ''; has = false }
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (quote === "'") {
      if (ch === "'") quote = null
      else word += ch
    } else if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '\\' && '"\\$`'.includes(input[i + 1] ?? '')) { word += input[i + 1]; i += 1 }
      else word += ch
    } else if (ch === "'" || ch === '"') {
      quote = ch
      has = true
    } else if (ch === '\\') {
      if (input[i + 1] === '\n') { i += 1; continue }
      word += input[i + 1] ?? ''
      has = true
      i += 1
    } else if (/\s/.test(ch) && ch !== '\n') {
      flush()
    } else if (ch === '\n' || ch === ';' || ch === '|' || ch === '&') {
      flush()
      let op = ch
      if ((ch === '|' || ch === '&') && input[i + 1] === ch) { op += ch; i += 1 }
      out.push({ op })
    } else {
      word += ch
      has = true
    }
  }
  if (quote) return null
  flush()
  return out
}

// A command is "piped" when it reads the output of the one before it, so a grep there searches text, not files.
export function commandsOf(input) {
  const list = typeof input === 'string' && input.length <= 8000 ? tokens(input) : null
  if (!list) return []
  const commands = []
  let words = []
  let piped = false
  const end = (nextPiped) => {
    if (words.length) commands.push({ words, piped })
    words = []
    piped = nextPiped
  }
  for (const item of list) {
    if (item.op === undefined) {
      if (!/^\d*[<>]/.test(item.word)) words.push(item.word)
    } else end(item.op === '|')
  }
  end(false)
  return commands
}

export const termsOf = pattern => (pattern.match(/[\p{L}\p{N}_$][\p{L}\p{N}_$-]{1,79}/gu) ?? [])

function grepSearch(words) {
  const patterns = []
  const paths = []
  let recursive = false
  let patternGiven = false
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i]
    if (word === '--') { paths.push(...words.slice(i + 1)); break }
    if (WITH_VALUE.has(word)) {
      if (word === '-e' || word === '--regexp') { patterns.push(words[i + 1] ?? ''); patternGiven = true }
      i += 1
    } else if (word.startsWith('--regexp=')) {
      patterns.push(word.slice(9)); patternGiven = true
    } else if (word.startsWith('-') && word.length > 1) {
      if (/^-[a-zA-Z]*[rR]/.test(word) || word === '--recursive') recursive = true
    } else if (!patternGiven) {
      patterns.push(word); patternGiven = true
    } else paths.push(word)
  }
  if (!patterns.length) return null
  // A grep with no file or folder reads the pipe, not the project.
  if (words[0] !== 'rg' && words[0] !== 'ag' && words[0] !== 'ack' && !paths.length && !recursive) return null
  return { kind: words[0] === 'rg' ? 'rg' : 'grep', terms: [...new Set(patterns.flatMap(termsOf))], paths }
}

function findSearch(words) {
  const names = []
  for (let i = 1; i < words.length - 1; i += 1) {
    if (['-name', '-iname', '-path', '-ipath', '-regex'].includes(words[i])) names.push(words[i + 1])
  }
  return { kind: 'find', terms: [], names }
}

/** `{ kind, terms }` for the first command that searches files, or null. */
export function searchOf(command) {
  for (const { words, piped } of commandsOf(command)) {
    if (piped) continue
    const name = words[0]?.split('/').at(-1)
    if (GREPS.has(name)) {
      const found = grepSearch([name, ...words.slice(1)])
      if (found) return found
    } else if (name === 'find') return findSearch(words)
  }
  return null
}
