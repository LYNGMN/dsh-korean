// One stroke icon set (24 box, 2px round stroke) drawn for this app.
const PATHS = {
  back: <path d="M15 18 9 12l6-6" />,
  settings: (
    <>
      <path d="M4 7h8M17 7h3M4 17h3M12 17h8" />
      <circle cx="14.5" cy="7" r="2.5" />
      <circle cx="9.5" cy="17" r="2.5" />
    </>
  ),
  send: <path d="M12 19V5M6 11l6-6 6 6" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  bell: <path d="M6 9.5a6 6 0 0 1 12 0c0 5.5 2.5 7 2.5 7h-17S6 15 6 9.5ZM10 20a2.2 2.2 0 0 0 4 0" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  diff: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9.5 11.5h5M12 9v5M9.5 17h5" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  tool: <path d="m5 8 4 4-4 4M12 16h7" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  alert: <path d="M12 4 2.8 19.5h18.4ZM12 10v4.5M12 17.2v.1" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  shield: <path d="M12 3 19 6v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V6Z" />,
  question: <path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.1v.5M12 17.6v.1" />,
}

export function Icon({ name, size = 22, class: className }) {
  return (
    <svg class={`icon${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}
