// Keyboard behaviour of a radio group built from buttons (WAI-ARIA radio pattern):
// one tab stop, arrow keys move and select, Home/End jump to the ends.

const STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** Index the key moves to, or -1 when the key is not a radio key. */
export function nextRadioIndex(key, index, count) {
  if (count <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const step = STEP[key]
  if (!step) return -1
  return (index + step + count) % count
}

/** Props for one radio button of the group. */
export function radioProps(values, value, choose, own) {
  const checked = own === value
  return {
    role: 'radio',
    'aria-checked': checked,
    // With nothing selected the first button stays reachable.
    tabIndex: checked || (!values.includes(value) && values[0] === own) ? 0 : -1,
    onClick: () => choose(own),
    onKeyDown: (e) => {
      const next = nextRadioIndex(e.key, values.indexOf(own), values.length)
      if (next < 0) return
      e.preventDefault()
      choose(values[next])
      e.currentTarget.parentElement?.querySelectorAll('[role="radio"]')[next]?.focus()
    },
  }
}
