---
name: DSH 휴대폰
description: 내 컴퓨터의 DeepSeek Harness를 휴대폰에서 읽고, 보내고, 승인하는 메신저형 PWA
colors:
  brand: "#4d6bfe"
  brand-fill: "#4361ee"
  brand-ink: "#3650d8"
  brand-soft: "#eaeeff"
  on-brand: "#ffffff"
  bg: "#f6f7fb"
  surface: "#ffffff"
  surface-2: "#eef0f6"
  text: "#10131c"
  muted: "#555d70"
  border: "#e3e6ee"
  control: "#7a8296"
  danger: "#c8281e"
  on-danger: "#ffffff"
  attn-bg: "#fff5dc"
  attn-border: "#b7791f"
  attn-text: "#6b3f00"
  add-bg: "#e5f6ea"
  add-text: "#0f5132"
  del-bg: "#fdebec"
  del-text: "#8a1c1c"
  run: "#15803d"
  wait: "#b45309"
  brand-dark: "#6a84ff"
  brand-ink-dark: "#9db0ff"
  brand-soft-dark: "#1b2347"
  bg-dark: "#0c0f16"
  surface-dark: "#141821"
  surface-2-dark: "#1c212d"
  text-dark: "#e9ecf3"
  muted-dark: "#9aa3b6"
  border-dark: "#252b39"
  control-dark: "#6b7489"
  danger-dark: "#cf3038"
  danger-ink-dark: "#ff8f8f"
  attn-bg-dark: "#2a2212"
  attn-border-dark: "#a9761c"
  attn-text-dark: "#f6d591"
  add-bg-dark: "#10291c"
  add-text-dark: "#b9ecca"
  del-bg-dark: "#391619"
  del-text-dark: "#ffc9c9"
  run-dark: "#4ade80"
  wait-dark: "#fbbf24"
typography:
  headline:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  reading:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "calc(16px * var(--read))"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.33
  caption:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "'D2Coding', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  xs: "6px"
  sm: "10px"
  md: "12px"
  lg: "14px"
  xl: "16px"
  bubble: "20px"
  field: "22px"
  sheet: "24px"
  pill: "999px"
spacing:
  tight: "4px"
  sm: "8px"
  gap: "12px"
  gap-compact: "6px"
  gutter: "16px"
  section: "24px"
  touch: "44px"
components:
  button-primary:
    backgroundColor: "{colors.brand-fill}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "48px"
  button-neutral:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "48px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "48px"
  button-small:
    typography: "{typography.label}"
    padding: "0 14px"
    height: "44px"
  link-button:
    backgroundColor: "transparent"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "44px"
  link-button-active:
    backgroundColor: "{colors.brand-soft}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    size: "44px"
  icon-button-hover:
    backgroundColor: "{colors.surface-2}"
  icon-button-primary:
    backgroundColor: "{colors.brand-fill}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.pill}"
    size: "44px"
  icon-button-primary-disabled:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.control}"
  icon-button-listening:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
  segmented-track:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.lg}"
    padding: "4px"
  segment:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "44px"
  segment-on:
    backgroundColor: "{colors.brand-fill}"
    textColor: "{colors.on-brand}"
  bubble-user:
    backgroundColor: "{colors.brand-fill}"
    textColor: "{colors.on-brand}"
    typography: "{typography.reading}"
    rounded: "20px 20px 6px 20px"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "18px 16px"
  card-attention:
    backgroundColor: "{colors.attn-bg}"
    textColor: "{colors.attn-text}"
    rounded: "{rounded.xl}"
  session-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    padding: "12px 16px"
    height: "68px"
  session-row-hover:
    backgroundColor: "{colors.surface-2}"
  composer-input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "10px 16px"
    height: "44px"
  topbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    padding: "6px 8px"
    height: "56px"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "24px 24px 0 0"
    width: "560px"
  chip:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  badge-running:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  badge-attention:
    backgroundColor: "{colors.attn-bg}"
    textColor: "{colors.attn-text}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  tool-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.mono}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "44px"
  toast:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  toast-error:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
  down-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
---

# Design System: DSH 휴대폰

## Overview

**Creative North Star: "정석대로 만든 메신저"**

누구나 아는 메신저의 문법을 비틀지 않고 그대로 씁니다. 내 말은 오른쪽 파란 말풍선, 상대(DSH)의 답은 말풍선 없이 화면 폭 전체에 놓인 글, 아래에는 둥근 입력창과 보내기 단추, 위에는 제목 줄, 승인과 질문은 아래에서 올라오는 시트입니다. 새로 배울 것이 없어야 긴 대화를 읽고 글을 보내는 일에만 집중할 수 있습니다. 개성은 새 형식이 아니라 실행의 완성도에서 나옵니다.

색은 DeepSeek 파랑 하나가 내 말풍선·주요 단추·선택·초점을 맡고, 나머지는 그 파랑 쪽으로 살짝 기운 차가운 무채색입니다. 면은 1px 선으로 나누고, 그림자는 화면 위에 실제로 떠 있는 것(시트, 토스트, "맨 아래로" 단추)에만 씁니다. 초록·호박·빨강은 꾸밈이 아니라 상태입니다. 움직임은 누름 반응과 시트가 오르는 것, 그리고 "지금 실행 중"을 알리는 표시뿐입니다.

피하는 모습은 두 가지로 확인되어 있습니다. 번쩍이는 그라데이션·유리 효과·눈에 띄는 움직임 같은 화려한 장식, 그리고 브랜드 색이 보이지 않는 밋밋한 회색 화면입니다. 청록색 관리 화면 느낌과 카드 속 카드도 쓰지 않습니다.

**Key Characteristics:**
- 표준 메신저 형식: 오른쪽 파란 말풍선, 말풍선 없는 답, 아래 입력창, 아래에서 오르는 시트
- 강조색은 DeepSeek 파랑 하나, 중립색은 파랑 기가 도는 차가운 회색
- 구분은 1px 선, 그림자는 떠 있는 것에만
- 글은 Pretendard, 코드는 D2Coding(앱에 묶어 넣음), 한국어 `word-break: keep-all`
- 터치 대상 44px 이상, 입력 글자 16px 이상
- 밝음·어두움·기기 따름 세 가지 테마와 글자 크기·밀도·생각 과정 표시 옵션
- 상태는 색과 함께 글자·아이콘·모양으로도 표시

## Colors

파랑 하나와 차가운 회색, 그리고 상태에만 나오는 세 가지 신호색으로 이루어진 절제된 팔레트입니다. 값은 모두 위 frontmatter가 기준이고, 코드에서는 `web/src/app.css`의 `--이름` 토큰으로 씁니다. 어두운 값은 frontmatter에서 `-dark`가 붙은 항목이며 코드에서는 같은 토큰 이름에 다른 값이 들어갑니다.

### Primary
- **DeepSeek 파랑** (`brand`): 브랜드 색 그대로입니다. 입력창 초점 테두리, 글자 커서, 실행 중 점, 답을 쓰는 중 커서, 고른 선택지의 테두리처럼 선과 작은 표시에 씁니다. 초점 고리(`--focus`)도 밝은 화면에서는 이 값입니다.
- **채움 파랑** (`brand-fill`): 흰 글자가 올라가는 채운 면에 쓰는 한 단계 깊은 파랑입니다. 내 말풍선, 주요 단추, 보내기·새 세션 단추, 켜진 스위치, 고른 구간 단추, 글자 선택 영역입니다. 흰 글자와 5.02:1이며 어두운 화면에서도 같은 값을 씁니다.
- **글자 파랑** (`brand-ink`): 배경 위에 파란 글자로 놓일 때 씁니다. 링크, 글자 단추, 칩과 "실행 중" 배지의 글자입니다. 어두운 화면에서는 밝은 `brand-ink-dark`로 바뀌고 초점 고리도 이 값을 씁니다.
- **옅은 파랑** (`brand-soft`): 칩·"실행 중" 배지·고른 선택지의 바탕, 글자 단추를 누른 순간의 바탕입니다.

### Tertiary
상태색입니다. 꾸미는 데 쓰지 않습니다.
- **호박(답 필요·연결 끊김)** (`attn-bg`, `attn-border`, `attn-text`, `wait`): 답을 기다리는 요청 묶음, 대화 위 요청 줄, "답 필요" 배지, 연결 배너와 그 점입니다.
- **초록(끝남·허용·추가)** (`run`, `add-bg`, `add-text`): 끝난 도구의 체크, "허용됨" 표시, 비교 화면의 추가된 줄과 "새 파일" 표시입니다.
- **빨강(거부·오류·삭제)** (`danger`, `danger-ink-dark`, `del-bg`, `del-text`): 거부 단추, 오류 토스트, 음성 입력 중인 마이크 단추, 오류 결과 상자, 비교 화면의 지워진 줄입니다. 글자로 쓸 때 어두운 화면에서는 `danger-ink-dark`를 씁니다.

### Neutral
- **차가운 바탕** (`bg`): 화면 바닥과 입력창 안쪽입니다. 브라우저·상태 표시줄 색(`theme-color`)도 이 값입니다.
- **면** (`surface`): 위·아래 막대, 카드, 세션 목록, 시트, 도구 줄, 코드 블록의 바탕입니다.
- **들어간 면** (`surface-2`): 중립 단추, 구간 선택의 홈, 누르거나 올린 줄, 인라인 코드, 코드 블록 머리, 미리보기 상자입니다.
- **글자** (`text`)와 **보조 글자** (`muted`): 본문과, 시각·폴더·설명·생각 과정 같은 두 번째 줄입니다. 보조 글자는 가장 어두운 바탕(`surface-2`) 위에서도 5.78:1입니다.
- **선** (`border`): 면과 면을 나누는 1px 선입니다. 장식용이라 대비 기준을 지지 않습니다.
- **조작 선** (`control`): 입력창·선택지·윤곽 단추의 테두리, 꺼진 스위치의 바탕처럼 "여기를 누를 수 있다"를 알려야 하는 선입니다. 주변 바탕과 3:1 이상입니다.

### Named Rules
**강조색 하나 규칙.** 한 화면에 강조색은 하나뿐입니다. 기본은 DeepSeek 파랑이고, 설정의 "강조 색"에서 채도를 낮춘 남색(`data-accent="calm"`)이나 회색(`data-accent="graphite"`)으로 바꿀 수 있습니다. 세 가지 모두 `--brand`·`--brand-fill`·`--brand-ink`·`--brand-soft` 네 토큰만 바꿉니다. 두 번째 강조색, 그라데이션, 빛 번짐을 만들지 않습니다.

**넓은 면은 옅게 규칙.** 내 글 말풍선처럼 넓은 면은 기본이 옅은 바탕(`--brand-soft`)에 보통 글자색입니다. 진한 채움(`data-bubble="solid"`)은 사용자가 고를 때만 씁니다. 진한 강조색은 단추·선택·초점처럼 작은 면에 둡니다.

**채움은 한 단계 깊게 규칙.** 흰 글자가 올라가는 파란 면은 `brand`가 아니라 `brand-fill`입니다. `brand` 위 흰 글자는 4.33:1로 4.5:1에 못 미칩니다.

**상태색은 상태에만 규칙.** 초록·호박·빨강은 실제 상태(끝남, 답 필요, 오류, 추가·삭제)가 있을 때만 나옵니다. "실행 중"은 초록이 아니라 파랑입니다.

**색만으로 말하지 않기 규칙.** 상태에는 항상 글자("답 필요", "실행 중", "거부됨")나 아이콘·기호(체크, 경고 세모, +, −)가 함께 붙습니다.

## Typography

**Display Font:** 따로 없습니다. 본문과 같은 Pretendard를 굵기로 구분해 씁니다.
**Body Font:** `"Pretendard Variable", Pretendard, system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif` (`--sans`). 코드는 `"D2Coding", ui-monospace, ...` (`--mono`). 두 글꼴은 `web/build.mjs`가 앱에 묶어 넣고, 설정의 "글꼴"에서 기기 글꼴(`data-font="system"`)로 바꿀 수 있습니다.
**Label/Mono Font:** `ui-monospace, "SF Mono", Menlo, Consolas, "D2Coding", monospace` (`--mono`)

**Character:** 휴대폰이 원래 쓰는 글꼴 그대로라 메신저처럼 익숙하게 읽힙니다. 글꼴 파일을 내려받지 않으며, 프로젝트 규칙상 새 글꼴 패키지를 들이지 않습니다. 위계는 크기보다 굵기(400·500·600·700)와 보조 글자색으로 만듭니다.

### Hierarchy
- **Headline** (700, 22px, 1.3, -0.02em): 첫 화면 제목 "DSH 세션" 하나에만 씁니다.
- **Title** (700, 17px, 1.3, -0.01em): 대화·설정 화면의 위 막대 제목과 카드 제목입니다. 시트 제목은 같은 성격으로 19px(-0.015em)입니다.
- **Body** (400, 16px, 1.5): 기본 글자, 세션 줄 제목(600), 입력창입니다.
- **Reading** (400, `calc(16px * var(--read))`, 1.7): DSH의 답입니다. 내 말풍선은 같은 크기에 줄 높이 1.5입니다. 넓은 화면에서도 글줄은 760px 기둥을 넘지 않습니다.
- **Label** (600, 15px): 단추, 구간 선택, 스위치 줄, 대화 위 요청 줄입니다. 큰 단추(`.btn`)는 16px입니다.
- **Caption** (400, 13.5px, 보조 글자색): 폴더·경로·안내 문장입니다. 시각과 위 막대 아래 줄은 13px, 배지는 12.5px 700입니다.
- **Mono** (13.5px, 1.55): 코드 블록과 도구 줄 제목입니다. 도구 입출력과 비교 화면은 12.5px, 인라인 코드는 주변 글자의 0.88배입니다.

### Named Rules
**읽기 배율 규칙.** 대화 글(답, 내 말, 생각 과정, 코드 블록)의 크기는 고정값이 아니라 `calc(기준 * var(--read))`로 씁니다. `--read`는 1 / 1.125 / 1.25이며, 단추·제목·목록 같은 조작 글자에는 곱하지 않습니다.

**낱말 지키기 규칙.** 본문은 `word-break: keep-all`과 `overflow-wrap: break-word`를 기본으로 하고, 이름·단추·배지·시각은 한 줄(`white-space: nowrap` 또는 말줄임)입니다. 코드·경로·명령처럼 낱말이 없는 글만 `overflow-wrap: anywhere`로 어디서든 꺾습니다.

**숫자 폭 맞추기 규칙.** 모든 글자에 `font-variant-numeric: tabular-nums`가 걸려 있어 시각과 +/− 줄 수가 흔들리지 않습니다.

## Layout

화면은 위에서 아래로 쌓인 세로 한 줄입니다. 위 막대(최소 56px), 필요할 때만 나오는 연결 배너와 요청 줄, 스스로 스크롤하는 가운데 영역, 대화 화면에서는 아래 입력 줄입니다. 앱 높이는 `var(--app-height, 100dvh)`이고 `body`는 스크롤하지 않습니다. 위·아래·옆 안전 영역은 `env(safe-area-inset-*)`으로 막대와 가장자리 여백에 더합니다.

- **가장자리 여백:** 목록·설정·대화는 좌우 16px, 입력 줄은 12px, 위 막대는 8px(44px 아이콘 단추 안쪽 여백 11px이 더해져 글줄과 눈으로 맞습니다)입니다.
- **대화 간격:** 항목 사이는 `--gap`(기본 12px, 촘촘하게 6px), 말풍선 안쪽은 `--bubble-pad`(기본 10px 14px, 촘촘하게 7px 12px)입니다. 내 말풍선은 최대 폭 85%이고 앞뒤 항목과 4px 더 띄웁니다.
- **목록:** 세션 목록은 선으로 나뉜 줄(최소 68px, 12px 16px)이 한 덩어리 면 안에 들어갑니다. 줄은 두 줄 구성입니다. 윗줄에 제목과 시각, 아랫줄에 폴더와 상태 배지입니다.
- **설정:** 주제별 카드(18px 16px, 아래 16px 간격)가 세로로 쌓입니다. 카드 안에 카드를 넣지 않습니다.
- **단추 묶음:** 나란한 단추는 같은 폭 격자(`1fr 1fr`, 간격 10px)이고 하나뿐이면 전체 폭입니다. 구간 선택도 `repeat(n, minmax(0, 1fr))` 같은 폭입니다.
- **넓은 화면(720px 이상):** 내용·입력 줄·위 막대가 가운데 760px 기둥에 맞춰지고, 시트는 아래에서 오르는 대신 화면 가운데에 뜬 상자(최대 폭 560px, 네 모서리 24px)가 됩니다. 이 밖의 중단점은 없습니다.

### Named Rules
**44 규칙.** 누를 수 있는 것은 모두 높이 44px 이상입니다(아이콘 단추 44×44, 큰 단추·선택지 48px, 세션 줄 68px). 입력 글자는 16px 이상이라 iOS가 화면을 확대하지 않습니다.

**옵션은 속성으로 규칙.** 테마·글자 크기·밀도·생각 과정 표시는 `<html>`의 `data-theme`, `data-text`, `data-density`, `data-reasoning` 속성으로만 바뀝니다. 새 화면은 이 속성을 직접 읽지 않고 `--read`, `--gap`, `--bubble-pad`와 색 토큰만 씁니다.

## Elevation & Depth

기본은 평평합니다. 깊이는 세 겹의 면 색(`bg` 바닥, 그 위 `surface`, 들어간 `surface-2`)과 1px 선(`border`)으로 만듭니다. 그림자는 내용 위에 실제로 떠서 겹치는 것에만 한 가지 값으로 씁니다. 시트 뒤는 반투명 막(`--backdrop`: 밝음 `rgba(12, 15, 22, 0.45)`, 어두움 `rgba(0, 0, 0, 0.6)`)으로 가립니다. 흐림(blur) 효과는 없습니다.

### Shadow Vocabulary
- **뜬 것** (`--shadow`: 밝음 `0 10px 30px rgba(16, 19, 28, 0.14)`, 어두움 `0 10px 30px rgba(0, 0, 0, 0.5)`): 시트, 토스트, 대화 위에 뜬 "맨 아래로" 단추에만 씁니다.

### Named Rules
**뜬 것만 그림자 규칙.** 카드, 목록, 말풍선, 단추, 위·아래 막대에는 그림자를 두지 않습니다. 스크롤해도 제자리에 떠서 내용을 덮는 것만 `--shadow`를 받습니다.

**선으로 나누기 규칙.** 면과 면 사이는 `1px solid var(--border)`입니다. 누를 수 있는 테두리는 `--control`, 상태를 알리는 테두리는 그 상태색(`--attn-border`)입니다. 한쪽에만 두꺼운 색 띠를 두르지 않습니다.

## Shapes

부드럽게 둥근 모서리가 크기에 따라 커집니다. 작은 표시는 6px(인라인 코드, "새 파일" 표시, 말풍선 꼬리 쪽 모서리), 안쪽 조각은 10px(구간 단추, 글자 단추, 입출력 상자), 단추와 코드 블록은 12px, 줄·상자류는 14px(도구 줄, 요청 줄, 선택지, 토스트, 비교 파일), 카드와 세션 목록은 16px, 내 말풍선은 20px, 입력창은 22px(한 줄일 때 알약 모양), 시트는 위쪽 24px입니다. 배지·칩·"맨 아래로"·보내기·마이크·새 세션 단추와 스위치는 완전히 둥급니다(999px).

내 말풍선은 오른쪽 아래 모서리만 6px(`20px 20px 6px 20px`)이라 꼬리 그림 없이도 말한 쪽을 가리킵니다. DSH의 답에는 말풍선도 테두리도 없습니다.

아이콘은 이 앱을 위해 그린 한 세트(`web/src/components/Icon.jsx`)입니다. 24칸 상자, 2px 선, 둥근 끝과 둥근 이음, 채우지 않은 선 그림이고 색은 `currentColor`입니다. 기본 22px, 글줄 안에서는 16~20px로 씁니다. 스크롤바는 얇게(`thin`, 8px) 테마색 `--scroll`로 그립니다.

## Components

모든 조작 요소는 "조용하지만 확실하게 눌리는" 느낌입니다. 가만히 있을 때는 평평하고, 누르면 80ms 안에 살짝 줄어들며, 키보드 초점은 3px 파란 고리(`outline: 3px solid var(--focus)`, 바깥 2px)로 어디서나 같습니다.

### Buttons
- **Shape:** 완만한 모서리(12px), 최소 높이 48px, 좌우 18px, 16px 600 글자, 한 줄 고정. 작은 단추(`.btn-small`)는 44px 높이에 15px 글자입니다.
- **Primary:** 채움 파랑 바탕에 흰 글자("허용", "답 보내기", "알림 켜기"). 한 묶음에 하나만 둡니다.
- **Danger:** 빨강 바탕에 흰 글자("거부"). 승인 시트에서 "허용"과 같은 폭으로 나란히 놓이고 처음 초점은 "거부"에 갑니다.
- **Neutral / Outline:** 중립은 들어간 면 바탕에 본문 글자("이전 대화 더 보기", "다시 로그인"), 윤곽은 투명 바탕에 조작 선 테두리("중단", "시험 알림")입니다.
- **글자 단추(`.link-btn`):** 글자 파랑 600, 14.5px, 44px 높이, 바탕 없음. 누르는 동안만 옅은 파랑 바탕이 깔립니다("변경 보기", "복사", "모두 보기").
- **아이콘 단추(`.icon-btn`):** 44×44, 모서리 12px, 투명 바탕. 올리거나 누르면 들어간 면이 깔리고 0.94배로 줄어듭니다. 보내기·새 세션은 둥근 채움 파랑(`.primary.round`)이며, 보낼 글이 없을 때는 들어간 면에 조작 선 색 아이콘으로 바뀝니다. 음성 입력 중인 마이크는 빨강 채움에 멈춤 아이콘입니다.
- **Pressed / Disabled:** 누르면 0.98배와 밝기 0.96(80ms). 꺼진 단추는 불투명도 0.45입니다.

### Chips
- **칩(`.chip`):** 옅은 파랑 바탕에 글자 파랑 700, 13.5px, 알약 모양. 승인 시트의 도구 이름, 질문의 머리말에 씁니다. 누르는 것이 아니라 이름표입니다.
- **배지(`.badge`):** 12.5px 700 알약. "실행 중"은 옅은 파랑 바탕에 깜박이는 파란 점, "답 필요"는 호박 바탕에 안쪽 1px 호박 선입니다.
- **표시(`.tag`):** 비교 화면의 "새 파일". 초록 바탕, 모서리 6px.

### Cards / Containers
- **Corner Style:** 16px. 도구 줄·비교 파일 같은 줄형 상자는 14px, 코드 블록은 12px입니다.
- **Background:** 면(`surface`) 위에 1px 선. 바닥(`bg`)과 색 차이로만 떠 보입니다.
- **Shadow Strategy:** 없음(Elevation & Depth의 "뜬 것만 그림자 규칙").
- **Border:** `1px solid var(--border)`.
- **Internal Padding:** 카드 18px 16px. 세션 목록은 여백 없이 줄이 가장자리까지 닿습니다.
- **답 기다리는 요청 묶음(`.card-attn`):** 호박 바탕·호박 테두리·호박 글자의 카드로 목록 맨 위에 놓입니다. 종 아이콘과 건수 제목, 그 아래 방패(승인)·물음표(질문) 아이콘이 붙은 줄입니다.
- **정보 줄(`.facts`):** 왼쪽 보조 글자색 이름, 오른쪽 정렬 값(500), 줄 사이 1px 선.

### Inputs / Fields
- **보내는 입력창:** 바닥색 안쪽, 조작 선 1px 테두리, 모서리 22px, 16px 글자에 줄 높이 22px, 최소 44px에서 화면 높이의 40%까지 늘어납니다. 오른쪽에 마이크와 보내기 단추가 아래 맞춤으로 붙습니다.
- **Focus:** 테두리가 `brand`로 바뀌고(120ms) 공통 초점 고리가 함께 보입니다. 안내 글(placeholder)은 보조 글자색입니다.
- **보내는 방식(`.mode-btn`):** 실행 중에만 입력창 위에 나오는 알약 단추 둘("대기열", "끼어들기"). 고른 쪽이 채움 파랑입니다.
- **구간 선택(`.segmented`):** 들어간 면의 홈(모서리 14px, 안쪽 4px)에 같은 폭 구간(44px, 모서리 10px). 고른 구간은 채움 파랑에 흰 글자, 나머지는 보조 글자색입니다. 테마·글자 크기·밀도·Enter 동작에 씁니다.
- **스위치(`.switch`):** 44px 높이 누름 영역 안에 52×32 알약. 꺼짐은 조작 선 색, 켜짐은 채움 파랑이고 흰 손잡이가 20px 움직입니다(150ms).
- **선택지(`.choice`):** 조작 선 테두리 줄(48px, 모서리 14px)에 20px 기본 라디오·체크(`accent-color` 채움 파랑). 고르면 테두리가 `brand`, 바탕이 옅은 파랑이 됩니다.
- **직접 입력(`.field`):** 14px 보조색 이름표 아래 입력창과 같은 문법의 글상자(모서리 14px).
- **Error:** 시트 안 오류 문장은 빨강 글자 14.5px이며 `role="alert"`로 읽힙니다.

### Navigation
- **위 막대(`.topbar`):** 면 바탕, 아래 1px 선, 최소 56px. 왼쪽에 뒤로 아이콘 단추, 가운데 한 줄 제목(17px 700)과 그 아래 상태 줄(13px, "실행 중"이면 파란 점), 오른쪽에 동작 하나("중단") 또는 44px 빈칸입니다.
- **첫 화면:** 뒤로 단추 없이 큰 제목 "DSH 세션"(22px)과 오른쪽에 테마 전환(해·달), 설정, 새 세션(둥근 채움 파랑) 아이콘 단추가 놓입니다. 해·달 단추는 한 번에 밝음·어두움을 바꿉니다.
- **세션 줄(`.row`):** 줄 전체가 링크입니다. 올리거나 누르면 들어간 면이 깔립니다. 탭 바나 햄버거 메뉴는 없고, 화면 이동은 목록 → 대화, 목록 → 설정 두 갈래뿐입니다.

### 말풍선과 답 (Signature)
- **내 말(`.msg-user`):** 오른쪽 정렬, 채움 파랑 바탕에 흰 글자, 최대 폭 85%, `20px 20px 6px 20px`. 줄바꿈을 그대로 보존합니다.
- **DSH의 답(`.msg-assistant`):** 말풍선 없이 화면 폭 전체, 줄 높이 1.7의 마크다운입니다. 문단 사이 0.7em, 제목은 1.2em·1.1em 700, 인용은 왼쪽 1px 조작 선, 코드 블록은 머리줄(언어 이름과 "복사")이 달린 테두리 상자이며 가로로만 스크롤합니다.
- **쓰는 중:** 답 끝에 8×18px 파란 커서가 1초 간격으로 깜박입니다.
- **생각 과정(`.reasoning`):** 접힌 한 줄(44px, 보조 글자색 14px)을 누르면 펼쳐집니다. 설정에서 통째로 숨길 수 있습니다.
- **턴 표시:** 중단·오류로 끝난 턴만 양옆에 선이 달린 13px 보조색 글("중단됨", "오류로 멈춤")로 표시합니다.

### 도구 줄
한 줄짜리 접힌 상자(44px, 모서리 14px, 고정폭 13.5px)입니다. 왼쪽 16px 상태 아이콘이 실행 중(파란 돌아가는 원), 끝남(초록 체크), 오류(빨강 경고 세모), 결과 없음(보조색 네모)을 알리고, 오른쪽 갈매기 표시가 펼치면 180도 돕니다. 펼치면 입력과 결과가 들어간 면 상자(모서리 10px, 12.5px 고정폭, 최대 높이 50vh)로 나오고 오류 결과는 빨강 바탕입니다. 바뀐 파일이 있으면 줄 아래에 "변경 보기 · 파일 n개" 글자 단추가 붙습니다.

### 시트
기본 `<dialog>`로 만든 아래 시트입니다. 최대 폭 560px, 최대 높이 화면의 88%, 위쪽 모서리 24px, `--shadow`와 반투명 막. 머리줄(60px)에 19px 제목과 오른쪽 닫기 아이콘 단추가 있고 내용은 좌우 20px입니다. 220ms 동안 28px 아래에서 오르며 나타납니다(`--ease`: `cubic-bezier(0.2, 0.8, 0.2, 1)`). 비교 화면은 화면을 거의 다 채우는 전체 시트입니다. 넓은 화면에서는 가운데 뜬 상자가 됩니다.

승인 시트는 위에서부터 도구 칩과 세션 이름, 요청 이유(들어간 면 상자), "허용하면 실행할 내용"(조작 선 테두리 상자 안에 고정폭 이름과 명령), 안내 한 줄, 같은 폭의 "거부"·"허용" 순서입니다. 무엇을 실행하는지가 단추보다 먼저 보입니다.

### 변경 비교
파일마다 접었다 펴는 테두리 상자(모서리 14px)입니다. 머리줄에 고정폭 파일 이름과 `+n −n`, 아래 줄에 전체 경로가 놓입니다. 줄은 `옛 줄 번호 · 새 줄 번호 · 기호 · 내용` 네 칸 격자이고, 추가는 초록 바탕, 삭제는 빨강 바탕에 각각 +, − 기호가 붙습니다. 덩어리 사이는 점선입니다. 긴 줄은 가로 스크롤 없이 꺾입니다.

### 알림 띠와 토스트
- **연결 배너(`.banner`):** 위 막대 아래 호박 바탕 띠에 호박 점과 문장, 필요하면 작은 단추가 붙습니다.
- **대화 위 요청 줄(`.pending-btn`):** 호박 바탕·호박 테두리의 48px 줄에 요청 내용과 밑줄 친 "보기"가 있습니다.
- **토스트(`.toast`):** 위 막대 바로 아래 가운데에 뜹니다. 본문 글자색 바탕에 바닥색 글자(테마와 반대), 모서리 14px, `--shadow`. 오류는 빨강 바탕입니다.
- **맨 아래로(`.down-btn`):** 대화 아래쪽 가운데에 뜨는 알약 단추. 면 바탕, 1px 선, 글자 파랑, `--shadow`. 새 내용이 오면 글자가 "새 내용"으로 바뀝니다.

### 움직임
- **누름 반응:** 80ms, 크기 0.94(아이콘 단추)·0.98(단추).
- **시트 오름:** 220ms, `--ease`. 막은 같은 시간 동안 나타납니다.
- **상태 표시:** 실행 중 점의 맥박(1.6초), 답 쓰는 중 커서 깜박임(1초), 기다림 원(0.8초 회전).
- **작은 전환:** 바탕·테두리 색 120ms, 스위치와 갈매기 표시 150ms, 토스트 나타남 200ms.
- `prefers-reduced-motion: reduce`에서는 모든 애니메이션과 전환이 꺼집니다.

## Do's and Don'ts

### Do:
- **Do** 흰 글자가 올라가는 파란 면에는 `--brand-fill`(#4361ee)을 씁니다. 선·점·커서·초점에는 `--brand`를 씁니다.
- **Do** 색은 `web/src/app.css`의 토큰으로만 씁니다. 새 색이 필요하면 밝음과 어두움 두 벌(`:root`, `prefers-color-scheme` 블록, `:root[data-theme="dark"]`)을 함께 정의합니다.
- **Do** 누를 수 있는 것은 44px 이상, 입력 글자는 16px 이상으로 만듭니다.
- **Do** 면은 `1px solid var(--border)`로 나누고, 누를 수 있는 테두리는 `--control`로 그려 3:1을 지킵니다.
- **Do** 상태에는 색과 함께 글자나 아이콘을 붙입니다("답 필요", 체크, 경고 세모, +/−).
- **Do** 대화 글 크기는 `calc(… * var(--read))`, 대화 간격은 `--gap`과 `--bubble-pad`로 써서 글자 크기·밀도 옵션을 따르게 합니다.
- **Do** 나란한 단추는 같은 폭 격자(`.btn-grid`)에 넣고, 이름·단추·배지는 한 줄로 유지합니다.
- **Do** 아이콘은 `Icon.jsx`의 24칸·2px·둥근 선 세트에 같은 문법으로 그려 넣습니다.
- **Do** 새 움직임을 넣을 때는 `prefers-reduced-motion`에서 꺼지는지 확인하고 `--ease`와 80~220ms 범위를 지킵니다.

### Don't:
- **Don't** 번쩍이는 그라데이션, 유리(흐림) 효과, 눈에 띄는 움직임 같은 화려한 장식을 넣지 않습니다.
- **Don't** 브랜드 파랑이 보이지 않는 밋밋한 회색 화면으로 만들지 않습니다.
- **Don't** 두 번째 강조색을 들이거나 초록·호박·빨강을 꾸밈에 쓰지 않습니다.
- **Don't** 카드·목록·말풍선·단추에 그림자를 두지 않습니다. `--shadow`는 시트·토스트·"맨 아래로" 단추에만 씁니다.
- **Don't** 카드 안에 카드를 넣지 않습니다. 청록색 관리 화면 느낌도 피합니다.
- **Don't** 글꼴을 더 늘리지 않습니다. 글은 Pretendard, 코드는 D2Coding 둘뿐이고 다른 출처에서 불러오지 않습니다. 아이콘 패키지는 들이지 않고 직접 그린 아이콘만 씁니다.
- **Don't** DSH의 답을 말풍선이나 카드에 가두지 않습니다. 답은 화면 폭 전체의 글입니다.
- **Don't** 누른 뒤의 반응을 효과 때문에 늦추지 않습니다. 화면을 다듬는다고 한 화면에 보이는 정보를 줄이지도 않습니다.
- **Don't** 이름·단추 글자를 `<br>`이나 `&nbsp;`로 맞추지 않습니다. 길면 문구를 줄입니다.
