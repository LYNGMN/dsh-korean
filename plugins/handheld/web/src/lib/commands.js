// Slash commands in the composer: which ones to suggest, and whether a line is one.

const NAME = /^\s*\/(\S*)/

/** The known command a line starts with, or null (a path like /etc/hosts is not one). */
export function commandNameOf(text, commands) {
  const name = NAME.exec(text)?.[1]
  return name && commands.some((c) => c.name === name) ? name : null
}

/** Commands to suggest while only the name is being typed ("/pl"). */
export function matchingCommands(text, commands) {
  const typed = /^\/(\S*)$/.exec(text)?.[1]
  if (typed === undefined) return []
  return commands.filter((c) => c.name.startsWith(typed.toLowerCase()))
}
