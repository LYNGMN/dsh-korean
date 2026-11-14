// Theme choice without the DOM: 'auto' follows the device, the others pin it.
export const THEMES = ['auto', 'light', 'dark']

/** The theme actually on screen for a stored choice. */
export function resolveTheme(choice, systemDark) {
  if (choice === 'light' || choice === 'dark') return choice
  return systemDark ? 'dark' : 'light'
}

/** What the one-tap toggle switches to: the opposite of what is on screen now. */
export function toggledTheme(choice, systemDark) {
  return resolveTheme(choice, systemDark) === 'dark' ? 'light' : 'dark'
}
