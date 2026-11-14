import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enterAction, lineBreakAction } from '../web/src/lib/enter-keys.js'

const key = (over = {}) => ({
  key: 'Enter', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false,
  keyCode: 13, isComposing: false, composing: false, msSinceCompositionEnd: Infinity, enterKey: 'send', ...over,
})
const send = (other = false, afterCompose = false) => ({ action: 'send', other, afterCompose })

test('other keys are left alone', () => {
  assert.equal(enterAction(key({ key: 'a', keyCode: 65 })).action, 'none')
})

test('send mode: Enter sends, Shift/Alt+Enter break the line, Cmd or Ctrl+Enter sends the other way', () => {
  assert.deepEqual(enterAction(key()), send())
  assert.equal(enterAction(key({ shiftKey: true })).action, 'newline')
  assert.equal(enterAction(key({ altKey: true })).action, 'newline')
  assert.deepEqual(enterAction(key({ metaKey: true })), send(true))
  assert.deepEqual(enterAction(key({ ctrlKey: true })), send(true))
  assert.equal(enterAction(key({ metaKey: true, ctrlKey: true })).action, 'none')
})

test('newline mode: Enter breaks the line, Cmd or Ctrl+Enter sends the chosen way', () => {
  assert.equal(enterAction(key({ enterKey: 'newline' })).action, 'newline')
  assert.deepEqual(enterAction(key({ enterKey: 'newline', metaKey: true })), send())
  assert.deepEqual(enterAction(key({ enterKey: 'newline', ctrlKey: true })), send())
})

test('Enter while a Korean syllable is composing sends once the syllable is committed', () => {
  assert.deepEqual(enterAction(key({ isComposing: true, keyCode: 229 })), send(false, true))
  assert.deepEqual(enterAction(key({ composing: true })), send(false, true))
  assert.deepEqual(enterAction(key({ composing: true, metaKey: true })), send(true, true))
  assert.equal(enterAction(key({ composing: true, shiftKey: true })).action, 'newline')
  assert.equal(enterAction(key({ composing: true, enterKey: 'newline' })).action, 'newline')
})

test('Safari: the committing Enter arrives just after compositionend and still sends', () => {
  assert.deepEqual(enterAction(key({ keyCode: 229, msSinceCompositionEnd: 5 })), send())
  assert.equal(enterAction(key({ keyCode: 229, msSinceCompositionEnd: 500 })).action, 'none')
})

test('a line break no Enter keydown decided (on-screen keyboards) follows the setting', () => {
  assert.equal(lineBreakAction({ inputType: 'insertLineBreak', enterKey: 'send', keyAction: null }), 'send')
  assert.equal(lineBreakAction({ inputType: 'insertParagraph', enterKey: 'send', keyAction: null }), 'send')
  assert.equal(lineBreakAction({ inputType: 'insertLineBreak', enterKey: 'newline', keyAction: null }), 'allow')
  assert.equal(lineBreakAction({ inputType: 'insertText', enterKey: 'send', keyAction: null }), 'allow')
})

test('a line break right after an Enter keydown follows that keydown', () => {
  assert.equal(lineBreakAction({ inputType: 'insertLineBreak', enterKey: 'send', keyAction: 'newline' }), 'allow')
  // The IME let a sending Enter through after committing the syllable: do not add a stray line.
  assert.equal(lineBreakAction({ inputType: 'insertLineBreak', enterKey: 'send', keyAction: 'send' }), 'block')
  assert.equal(lineBreakAction({ inputType: 'insertParagraph', enterKey: 'newline', keyAction: 'send' }), 'block')
})
