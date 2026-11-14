import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme, toggledTheme } from '../web/src/lib/theme.js'

test('auto follows the device, a pinned theme ignores it', () => {
  assert.equal(resolveTheme('auto', true), 'dark')
  assert.equal(resolveTheme('auto', false), 'light')
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('nonsense', false), 'light')
})

test('the toggle always flips what is on screen', () => {
  assert.equal(toggledTheme('auto', true), 'light')
  assert.equal(toggledTheme('auto', false), 'dark')
  assert.equal(toggledTheme('light', true), 'dark')
  assert.equal(toggledTheme('dark', false), 'light')
})
