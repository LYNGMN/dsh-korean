// 코드 지도 플러그인(/api/dsh-code-map)의 상태를 작업 단계 화면용 요약으로 바꾼다. React 없음.
// 이 플러그인은 코드를 직접 분석하지 않는다. 코드 지도가 켜져 있을 때만 그 숫자를 빌려 보여 준다.

export function codeRouteOf(sessionId) {
  return `api/dsh-code-map?sessionId=${encodeURIComponent(sessionId)}`
}

const countOf = value => (Number.isSafeInteger(value) && value >= 0 ? value : null)

// 읽지 못한 범위. 0이어도 늘 보여 주고, 값을 모르면 0이 아니라 "확인 안 됨"으로 쓴다.
export function codeGapsOf(coverage) {
  if (!coverage || typeof coverage !== 'object') return null
  const gaps = [
    ['notIndexed', '미인덱스', coverage.notIndexed],
    ['partial', '부분 파싱', coverage.partial],
    ['unusable', '파싱 불가', coverage.unusable],
  ].map(([key, name, raw]) => {
    const value = countOf(raw)
    return { key, label: `${name} ${value === null ? '확인 안 됨' : `${value}개`}`, warn: value !== 0 }
  })
  // 지도에 한 개도 없는 파일 형식(예: .gs). 옛 코드 지도는 이 값이 없으니 그때는 그리지 않는다.
  const formats = coverage.unknownFormats
  if (formats === null) gaps.push({ key: 'formats', label: '형식 모름 확인 안 됨', warn: true })
  else if (Array.isArray(formats)) {
    for (const item of formats.slice(0, 3)) {
      const files = countOf(item?.files)
      if (typeof item?.ext === 'string' && files !== null) {
        gaps.push({ key: `format${item.ext}`, label: `형식 모름 ${item.ext.slice(0, 12)} ${files}개`, warn: true })
      }
    }
    if (formats.length > 3) gaps.push({ key: 'formats-more', label: `형식 모름 외 ${formats.length - 3}종`, warn: true })
  }
  return gaps
}

export function codeRequestLine(request) {
  if (!request || typeof request !== 'object') return '코딩 요청이 끝나면 이번에 바뀐 파일을 보여 줘요.'
  if (request.status === 'pending') return '이번 요청의 변경 범위를 확인하고 있어요.'
  if (request.status !== 'ready') return '이번 요청의 변경 범위를 확인할 수 없어요.'
  const files = Array.isArray(request.files) ? request.files.length : 0
  if (files === 0) return request.partial
    ? '확인할 수 있는 범위에서 변경 파일을 찾지 못했어요.'
    : '이번 요청 중 바뀐 파일이 없어요.'
  const tail = request.analyzing
    ? ' · 호출 관계를 확인하고 있어요'
    : ` · 함께 확인할 곳 ${Array.isArray(request.candidates) ? request.candidates.length : 0}곳`
  return `이번 요청에서 바뀐 파일 ${files}개${tail}${request.partial ? ' · 일부는 확인하지 못했어요' : ''}`
}

/** 코드 지도가 이 저장소에서 꺼져 있거나 없으면 null(아무것도 그리지 않는다). */
export function codeSummaryOf(data) {
  if (!data || typeof data !== 'object' || data.enabled !== true) return null
  if (data.state === 'engine-missing') {
    return { kind: 'message', line: '코드 지도를 쓰려면 분석 도구가 필요해요. 코드 지도 탭에서 안내를 확인해 주세요.' }
  }
  if (data.state === 'analysis-failed') {
    return { kind: 'message', line: '코드 지도를 준비하지 못했어요. 작업 단계는 그대로 볼 수 있어요.' }
  }
  if (data.state !== 'ready' && data.state !== 'indexing') return null
  return {
    kind: 'ready',
    indexing: data.state === 'indexing',
    request: codeRequestLine(data.requestImpact),
    gaps: codeGapsOf(data.coverage),
  }
}
