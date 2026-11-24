// 자동완성으로 고른 뒤 커서 뒤 글이 사라지면 되살리는 규칙. 화면·타이머 없이 판단만 한다(client.template.js가 DOM에 잇는다).
//
// 글을 써 두고 맨 앞에 `/스킬일부`를 넣은 뒤 Tab(또는 엔터 키)으로 고르면, DSH 0.2.2-rc.5에서
// `/스킬이름 `만 남고 커서 뒤 글이 사라지는 일이 있다. DSH 편집 코드(span-map.ts)는 `[토큰 시작, 커서)`만
// 바꾸게 되어 있어 원인 줄은 아직 못 찾았다. 그래서 고르기 직전 커서 뒤 글을 기억했다가, 고른 뒤 그 글이
// 사라졌을 때만 DSH 붙여넣기 길로 다시 넣는다.

// 고른 뒤 확인하는 때(ms). DSH는 고르기를 같은 키 처리 안에서 끝내지만, 늦게 지워지는 경우도 잡는다.
export const TAIL_CHECKS_MS = [0, 80, 300]

/**
 * 지켜볼 키인지.
 * @param {{ key?: string, code?: string, isTrusted?: boolean, isComposing?: boolean,
 *   shiftKey?: boolean, altKey?: boolean, metaKey?: boolean, ctrlKey?: boolean }} e keydown
 * @param {boolean} menuOpen `/`·`@` 자동완성 메뉴가 열렸는지
 * @returns {'tab' | 'enter' | null} 메뉴가 열린 채 누른 Tab·엔터 키(조합 없이)만. 그 밖은 null.
 */
export function watchKind(e, menuOpen) {
  if (!menuOpen || e.isTrusted === false || e.isComposing) return null
  if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return null
  if (e.key === 'Tab') return 'tab'
  if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') return 'enter'
  return null
}

/** 화면 글을 비교할 수 있게 고른다(줄바꿈 없는 공백·CRLF). */
export function normalizeText(text) {
  return String(text ?? '').replace(/ /g, ' ').replace(/\r\n?/g, '\n')
}

/**
 * 고르기 뒤 커서 뒤 글이 사라졌는지.
 * @param {{ before: string, tail: string, after: string }} s 고르기 직전 전체 글, 그때 커서 뒤 글, 지금 전체 글
 * @returns {boolean} 무언가 바뀌었고, 남은 글이 있으며, 그 끝에 커서 뒤 글이 없을 때만 true.
 * 보내서 비었거나(after가 빔) 아직 아무 일도 없으면(after === before) false.
 */
export function lostTail({ before, tail, after }) {
  const t = normalizeText(tail)
  const a = normalizeText(after)
  if (t.trim() === '' || a.trim() === '') return false
  if (a === normalizeText(before)) return false
  if (a.endsWith(t)) return false
  return !a.includes(t.trim())
}

/**
 * 되살릴 글. 고른 항목 뒤에 이미 공백이 있으면 앞 공백을 하나로 줄인다.
 * @param {{ tail: string, after: string }} s
 */
export function restoreText({ tail, after }) {
  const t = normalizeText(tail)
  const a = normalizeText(after)
  return a === '' || /\s$/.test(a) ? t.replace(/^[ \t]+/, '') : t
}
