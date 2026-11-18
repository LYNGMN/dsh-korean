// Icons are Lucide (https://lucide.dev, ISC licence), copied from lucide-static 1.73.0 as drawn:
// 24 box, 2px round stroke. The key is the name this app uses; the comment is Lucide's name.
// No icon package is bundled. To add one, copy its shapes from the same Lucide version.
const PATHS = {
  // chevron-left
  back: <path d="m15 18-6-6 6-6" />,
  // settings
  settings: (
    <>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // sun
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </>
  ),
  // moon
  moon: <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />,
  // sun-moon
  auto: (
    <>
      <path d="M12 2v2" />
      <path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715" />
      <path d="M16 12a4 4 0 0 0-4-4" />
      <path d="m19 5-1.256 1.256" />
      <path d="M20 12h2" />
    </>
  ),
  // arrow-up
  send: (
    <>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </>
  ),
  // mic
  mic: (
    <>
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <rect x="9" y="2" width="6" height="13" rx="3" />
    </>
  ),
  // square
  stop: <rect width="18" height="18" x="3" y="3" rx="2" />,
  // bell
  bell: (
    <>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </>
  ),
  // plus
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  // x
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  // file-diff
  diff: (
    <>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M9 10h6" />
      <path d="M12 13V7" />
      <path d="M9 17h6" />
    </>
  ),
  // copy
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  // corner-down-right
  branch: (
    <>
      <path d="m15 10 5 5-5 5" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </>
  ),
  // chevron-down
  chevron: <path d="m6 9 6 6 6-6" />,
  // wrench
  tool: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />,
  // check
  check: <path d="M20 6 9 17l-5-5" />,
  // triangle-alert
  // git-branch
  stages: (
    <>
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  alert: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  // arrow-down
  down: (
    <>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </>
  ),
  // shield
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  // circle-question-mark
  question: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9.5a3 2.5 0 016 0c0 2-2 2-3 3.5" />
      <path d="M12 17h.01" />
    </>
  ),
  // square-slash
  command: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <line x1="9" x2="15" y1="15" y2="9" />
    </>
  ),
  // clipboard-list
  review: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </>
  ),
}

// Optical corrections, measured with icon-optics (visible size against `settings` = 1, and how far
// the visible centre sits from the box centre at 22px). Only icons that looked off inside the
// group they appear in are touched: s scales about the centre (the stroke keeps its 2px), y moves
// the drawing in 24-box units. Values: before -> after.
const OPTICAL = {
  moon: { s: 1.05 }, // theme choices and top bar, next to sun and settings: size 0.92 -> 0.96
  auto: { s: 1.05 }, // size 0.92 -> 0.96
  question: { s: 0.95 }, // waiting requests, next to shield and review: size 1.06 -> 1.01
  plus: { s: 1.18 }, // in the round new-session button, next to settings: size 0.65 -> 0.76
  send: { s: 1.15, y: 0.5 }, // in the round send button, next to mic: size 0.65 -> 0.72, centre 0.69px high -> 0.37px
  down: { y: -0.5 }, // centre 0.69px low -> 0.23px
  stop: { s: 0.72 }, // replaces mic and marks a stopped tool: size 1.07 -> 0.80, not a box filling the button
  check: { s: 1.2 }, // tool status and notes, next to alert: size 0.54 -> 0.62
  alert: { y: -0.8 }, // centre 0.97px low -> 0.23px
  branch: { y: -0.3 }, // centre 0.56px low -> 0.29px
}

export const ICON_NAMES = Object.keys(PATHS)

export function Icon({ name, size = 22, class: className }) {
  const optical = OPTICAL[name]
  const scale = optical?.s ?? 1
  return (
    <svg class={`icon${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      {optical ? <g transform={`translate(12 ${String(12 + (optical.y ?? 0))}) scale(${String(scale)}) translate(-12 -12)`} stroke-width={2 / scale}>{PATHS[name]}</g> : PATHS[name]}
    </svg>
  )
}
