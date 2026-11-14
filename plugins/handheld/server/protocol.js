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
 *   toolResult { callId, isError, output, truncated?, diffs?: Diff[] } its result (pairs by callId)
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
 * Pending:    { id, sessionId, kind: 'approval', tool, reason?, callId?, at }   callId pairs with the `tool` item
 *           | { id, sessionId, kind: 'question', questions: Question[], at }
 * Question:   { id, question, header?, detail?, options?: string[], multiSelect: boolean }
 */

export const UPSTREAM = Object.freeze({ connected: 'connected', connecting: 'connecting', down: 'down' })
