// Phone <-> gateway protocol, version 1. The PWA depends on this file's shapes
// only; nothing here mirrors DSH wire names. Bump PROTOCOL_VERSION on any
// incompatible change and keep the PWA and gateway in one release.

export const PROTOCOL_VERSION = 1

/** Mount point of the PWA and its API on the gateway origin. */
export const BASE_PATH = '/h'
export const LIVE_PATH = `${BASE_PATH}/live`
export const API_PATH = `${BASE_PATH}/api`

/** Seconds between client pings; the server drops a socket silent for 3 intervals. */
export const PING_INTERVAL_SECONDS = 25

/** Largest live frame the server sends; longer history goes out in several frames. */
export const MAX_FRAME_BYTES = 64 * 1024

/** Streaming text is coalesced and flushed at most this often. */
export const STREAM_FLUSH_MS = 100

/**
 * Item kinds the gateway produces from Host history (`items` frames, history pages):
 *   user       { text, images: number }
 *   assistant  { turn, text, reasoning? }
 *   tool       { callId, name, title, input?, diffs?: Diff[] }      a tool call was made
 *   toolResult { callId, isError, output, truncated?, diffs?: Diff[] } its result (pairs by callId); output is cut at 4,000 characters,
 *     GET /sessions/:id/items/:seq/output returns the whole text (up to 1,000,000)
 *   turn       { phase: 'start'|'end', turn, outcome? }
 *   approval   { phase: 'asked', id, tool, reason? } | { phase: 'decided', id, decision }
 *   changes    { turn }                                            files changed during that turn
 *   title      { title }                                           session renamed
 *   other      { type }                     unknown Host event, shown as a quiet marker
 * Every item has { seq, time, kind }. `seq` is the Host's durable per-session
 * sequence, so it is also the resume cursor.
 *
 * Diff: { path, oldText: string|null, newText: string }  (whole file text before/after; null = new file)
 *
 * Live frames, server -> client:
 *   welcome  { v, upstream, email }
 *   status   { upstream: 'connected'|'connecting'|'down', detail? }
 *   sessions { rows: SessionRow[] }                         full list, sent on change
 *   items    { sessionId, items: Item[], reset: boolean, more: boolean, hasOlder?: boolean }
 *            ascending; reset=true replaces what the phone holds; more=true means another frame follows;
 *            hasOlder=false means nothing exists before these items (on resync frames)
 *   history  { sessionId, items: Item[], hasMore: boolean }     reply to an older page request (REST)
 *   stream   { sessionId, attemptId, text, reasoning }        provisional full text of the reply in progress
 *   streamEnd{ sessionId, attemptId }
 *   pending  { items: Pending[] }                             every unanswered approval/question
 *   pong     { at }
 *   error    { code, message }
 * Live frames, client -> server:
 *   hello    { v, watch: { [sessionId]: lastSeq|null } }
 *   watch    { sessionId, since: number|null }
 *   unwatch  { sessionId }
 *   ping     { at }
 *
 * SessionRow: { id, title, cwd, running, updatedAt }
 * Subagent:   { id, title, mode: 'one-shot'|'continuable'|'unknown', state: 'running'|'done'|'stopped'|'idle', createdAt }
 *             `id` is opaque and works wherever a session id is read (watch, history); a subagent
 *             conversation is view-only, so prompt and cancel refuse it. REST: GET /sessions/:id/subagents
 * Command:    { name, description, hint? }   a slash command of a session, without the leading slash.
 *             REST: GET /sessions/:id/commands, POST /sessions/:id/command { line } -> { ran, ok?, text? }
 *             (`ran: false`: DSH knows no such command)
 * Pending:    { id, sessionId, kind: 'approval', tool?, reason?, reasons?, callId?, at }   callId pairs with the `tool` item;
 *             `reasons` is the reason per language (`{ en, ko, zh }`) when DSH sent one
 *           | { id, sessionId, kind: 'question', questions: Question[], at }
 * Question:   { id, question, header?, detail?, options?: string[], multiSelect: boolean, review? }
 *             `review: { approve, revise }` marks a plan review: `detail` is the plan (markdown) and the answer
 *             selects one of the two option values; `revise` may carry the person's feedback as `custom`
 * Stages:     { facts: GitFacts, todos: Array<{ content, status }>|null }   the session's Git work stage, read-only.
 *             REST: GET /sessions/:id/stages. GitFacts is { repo: false } or { repo: true, folder, branch, base, isBase,
 *             changes, ahead, upstream, unpushed, hadCommits, headTime, pr, prError, tag }; web/src/lib/stages.js
 *             turns it into six stages (same file as plugins/git-stage/src/stages.js)
 * Settings:   { notifyTurnEnd: boolean, lang: 'ko'|'en'|'ja'|'zh-CN'|'zh-TW' }   lang words the notifications
 */

export const UPSTREAM = Object.freeze({ connected: 'connected', connecting: 'connecting', down: 'down' })
