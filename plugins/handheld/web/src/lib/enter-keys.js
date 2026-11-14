// What Enter does in the composer. enterKey is the user's setting: 'send' (default) or 'newline'.
// Shift/Alt+Enter always break the line; Cmd or Ctrl+Enter sends (the other delivery mode when Enter itself sends).

export const ENTER_KEY_SETTINGS = ['send', 'newline']
export const DEFAULT_ENTER_KEY = 'send'

// Safari delivers the committing Enter (keyCode 229) right after compositionend.
const COMMIT_WINDOW_MS = 100

/** @returns {{ action: 'none' | 'newline' | 'send', other?: boolean, afterCompose?: boolean }} */
export function enterAction(e) {
  if (e.key !== 'Enter') return { action: 'none' }
  if (e.shiftKey || e.altKey) return { action: 'newline' }
  if (e.metaKey && e.ctrlKey) return { action: 'none' }
  const modified = e.metaKey || e.ctrlKey
  if (e.enterKey === 'newline' && !modified) return { action: 'newline' }
  const other = e.enterKey !== 'newline' && modified
  if (e.isComposing || e.composing) return { action: 'send', other, afterCompose: true }
  if (e.keyCode === 229 && !(e.msSinceCompositionEnd < COMMIT_WINDOW_MS)) return { action: 'none' }
  return { action: 'send', other, afterCompose: false }
}

/**
 * A line break about to be inserted. keyAction is what the Enter keydown just before it decided
 * ('newline' | 'send'), or null when none did (on-screen keyboards often report keyCode 229 or no key).
 * @returns {'allow' | 'block' | 'send'}
 */
export function lineBreakAction({ inputType, enterKey, keyAction }) {
  if (inputType !== 'insertLineBreak' && inputType !== 'insertParagraph') return 'allow'
  if (keyAction === 'send') return 'block'
  if (keyAction === 'newline' || enterKey === 'newline') return 'allow'
  return 'send'
}
