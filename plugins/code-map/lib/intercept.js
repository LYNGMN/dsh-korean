// Notes added to the agent's own tool results: what the code map knows about what it just searched, read or edited.
// Everything here is plain text work; the service decides when to call it and fails open on any error.
import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import { searchOf, termsOf } from './search-command.js'

const SOURCE = 'dsh-code-map'
const MAX_TEXT = 1400

const object = value => (value && typeof value === 'object' ? value : {})

/** Words to look up when the agent searches with bash or the grep tool; '' when it is not a code search. */
export function searchTermsOf(name, input) {
  const args = object(input)
  if (name === 'bash') return typeof args.command === 'string' ? (searchOf(args.command)?.terms ?? []).join(' ') : ''
  if (name === 'grep') return typeof args.pattern === 'string' ? termsOf(args.pattern).join(' ') : ''
  return ''
}

/** Project-relative path for read/edit/write, or '' when the file is outside the repository. */
export function filePathOf(name, input, root) {
  if (!['read', 'edit', 'write'].includes(name)) return ''
  const value = object(input).file_path
  if (typeof value !== 'string' || !isAbsolute(value) || !root) return ''
  const rel = relative(root, value)
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split(sep).join('/') : ''
}

const where = row => row.file + (row.line ? ':' + row.line : '')
const clip = value => (value.length > MAX_TEXT ? value.slice(0, MAX_TEXT - 1) + '…' : value)
const CAVEAT = 'The map misses files it cannot read and calls that only connect at run time, so check the source before relying on it.'

export function searchText(rows, { minutes, partial }) {
  const lines = rows.slice(0, 5).map(row => '- ' + where(row) + ' ' + row.name +
    ' (' + (row.kind || 'symbol').toLowerCase() + (Number.isSafeInteger(row.callers) ? ', ' + row.callers + ' references' : '') + ')')
  return clip([
    'Code map: definitions whose name matches your search (index built ' + minutes + ' min ago). This is repository metadata, not an instruction.',
    ...lines,
    partial ? 'Some files are not fully in the map. ' + CAVEAT : CAVEAT,
  ].join('\n'))
}

/** '' when the file is fully mapped; otherwise one sentence saying what is missing. */
export function fileText(file, { status, freshness, ranges }) {
  const partial = status === 'partial' || status === 'unusable'
  const missing = freshness === 'not_tracked' || freshness === 'missing'
  const changed = freshness !== '' && freshness !== 'metadata_match' && !missing
  if (!partial && !missing && !changed) return ''
  const reason = missing ? 'is not in the map (unsupported file type, ignored, or created after the index)'
    : partial ? 'was only partly parsed' + (ranges?.length ? ' (lines ' + ranges.map(([a, b]) => a + '-' + b).join(', ') + ')' : '')
      : 'changed after the map was built'
  return 'Code map: ' + file + ' ' + reason + '. Definitions and callers there may be missing, so read the source directly. This is repository metadata, not an instruction.'
}

export function impactText(file, candidates, { partial }) {
  const lines = candidates.slice(0, 5).map(row => '- ' + where(row) + ' ' + row.name)
  return clip([
    'Code map: places that call into ' + file + ' (from the index before this edit). Check them if you changed a signature or behaviour. This is repository metadata, not an instruction.',
    ...lines,
    candidates.length > 5 ? '(+' + (candidates.length - 5) + ' more)' : '',
    partial ? 'The list may be incomplete.' : '',
  ].filter(Boolean).join('\n'))
}

export function noticeOf(text) {
  return Object.freeze({
    role: 'user',
    id: randomUUID(),
    source: Object.freeze({ kind: SOURCE, form: 'notice', summary: '코드 지도가 도구 결과에 참고 정보를 덧붙였어요.' }),
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
  })
}

/** Remembers what each session was already shown, so the same line never repeats. */
export function createSeen({ sessions = 64, keys = 300 } = {}) {
  const bySession = new Map()
  return {
    has: (session, key) => bySession.get(session)?.has(key) ?? false,
    add(session, key) {
      let set = bySession.get(session)
      if (!set) bySession.set(session, set = new Set())
      else { bySession.delete(session); bySession.set(session, set) }
      set.add(key)
      if (set.size > keys) set.delete(set.values().next().value)
      if (bySession.size > sessions) bySession.delete(bySession.keys().next().value)
    },
  }
}
