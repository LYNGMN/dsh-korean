import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRadioIndex, radioProps } from '../web/src/lib/radio.js'

test('arrow keys move through the group and wrap around', () => {
  assert.equal(nextRadioIndex('ArrowRight', 0, 2), 1)
  assert.equal(nextRadioIndex('ArrowDown', 1, 2), 0)
  assert.equal(nextRadioIndex('ArrowLeft', 0, 3), 2)
  assert.equal(nextRadioIndex('ArrowUp', 2, 3), 1)
})

test('Home and End jump to the ends, other keys are left alone', () => {
  assert.equal(nextRadioIndex('Home', 2, 3), 0)
  assert.equal(nextRadioIndex('End', 0, 3), 2)
  assert.equal(nextRadioIndex('Enter', 0, 3), -1)
  assert.equal(nextRadioIndex('Tab', 0, 3), -1)
  assert.equal(nextRadioIndex('ArrowRight', 0, 0), -1)
})

test('only the selected radio is a tab stop', () => {
  const values = ['queue', 'steer']
  const props = values.map((own) => radioProps(values, 'steer', () => {}, own))
  assert.deepEqual(props.map((p) => p.tabIndex), [-1, 0])
  assert.deepEqual(props.map((p) => p['aria-checked']), [false, true])
})

test('with an unknown value the first radio stays reachable', () => {
  const values = ['queue', 'steer']
  const props = values.map((own) => radioProps(values, 'gone', () => {}, own))
  assert.deepEqual(props.map((p) => p.tabIndex), [0, -1])
})

test('an arrow key selects the neighbour', () => {
  const values = ['send', 'newline']
  let chosen = null
  const props = radioProps(values, 'send', (v) => { chosen = v }, 'send')
  let prevented = false
  props.onKeyDown({ key: 'ArrowRight', preventDefault: () => { prevented = true }, currentTarget: { parentElement: null } })
  assert.equal(chosen, 'newline')
  assert.equal(prevented, true)
})
