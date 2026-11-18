// When one of my own messages is long, the conversation shows only its first lines and a "more" button.
export const FOLD_LINES = 6
export const FOLD_CHARS = 280

export function isLongMessage(text) {
  return typeof text === 'string' && (text.length > FOLD_CHARS || text.split('\n').length > FOLD_LINES)
}
