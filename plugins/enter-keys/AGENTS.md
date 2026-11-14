# dsh-enter-keys 작업 지침

DeepSeek Harness(DSH) Desktop 입력창에 **엔터 키를 누르면: 바로 보내기(기본) / 줄바꿈** 설정을 더하고, 한글을 조합하다 누른 Enter도 한 번에 처리하는 플러그인입니다(DeepSeek 공식 플러그인이 아님). 서버 쪽 일은 없고 화면 쪽 번들(`lib/client.js`) 하나뿐입니다.

구조는 [docs/architecture.md](docs/architecture.md)를 따릅니다.

## 왜 DOM에 개입하나

DSH 0.2.2-rc.3 입력창의 Enter 처리(`dsh-client-ui-conversation/src/client/input/editor/keymap.ts`)는 코드에 고정되어 있고, 플러그인이 바꿀 공식 자리·서비스·설정·단축키가 없습니다(입력창 face는 "package-private", Enter 단축키는 `registerFixed` 읽기 전용). 사용자가 2026-11-15에 DOM 개입을 허용했습니다. 그래서 이 플러그인은 **입력창 카드 안 공식 자리에 보이지 않게 들어가, 그 카드에만 capture 단계 keydown을 거는** 최소한의 개입만 합니다.

## 지킬 것

- `/Applications/DeepSeek Harness.app` 안의 파일은 읽기만 합니다. DSH 코드·CSS를 복사하지 않습니다.
- 공식 경로는 자리 두 곳만 씁니다: `conversation.input.overlay`(입력창 카드 안, 보이지 않는 `span`)와 `settings.general.item`(설정 줄, order 21).
- DOM 개입은 자기 입력창 카드(`[data-composer-card]`) 안에서, 편집 루트(`[data-composer-input]`) 안을 향한 keydown·composition 이벤트에만 합니다. 문서 전체나 다른 요소에 듣기를 걸지 않습니다(설정 동기화용 `window` `storage` 이벤트 하나만 예외).
- DSH 동작을 대신하지 않습니다. 보내기·메뉴 고르기·잠금·작업 중 방식은 DSH가 정하도록, 확정이 끝난 뒤 편집 루트에 Enter(또는 Shift+Enter) 하나를 다시 눌러 줍니다. DSH 내부 객체(Lexical editor, `ComposerKeyboard`)에 손대지 않습니다.
- Shift+Enter는 늘 DSH 줄바꿈, Cmd/Ctrl+Enter는 DSH 규칙(작업 중 반대 방식)을 그대로 둡니다. 한글 조합 중 Cmd/Ctrl+Enter만 같은 조합으로 다시 눌러 한 번에 되게 합니다.
- 한글이 아닌 조합(일본어·중국어 후보 고르기)은 예전 DSH 동작 그대로 둡니다. 자동완성 메뉴가 열려 있으면 Enter는 DSH가 항목을 고르게 둡니다.
- 판단 규칙은 `src/enter-rules.js`(DOM·타이머 없음)에만 둡니다. 숫자(30ms·100ms·1000ms)를 바꾸면 그 파일 주석과 테스트를 같이 고칩니다.
- 설정은 브라우저 저장소 `dsh-enter-keys:enterKey`(`send`·`newline`)에 둡니다. 읽기·쓰기는 모두 try/catch이고, 못 읽으면 바로 보내기입니다.
- `@deepseek-ai/dsh-client-ui-primitives` 같은 Harness Client 패키지를 `require`하지 않습니다. 공용 모듈로 받는 것은 `react`뿐입니다.
- `lib/client.js`는 빌드 결과물입니다. `src/` 파일을 고친 뒤 `node scripts/build.mjs`로 다시 만듭니다.
- npm 의존성을 들이지 않습니다.
- 화면 글자는 한국어, `word-break: keep-all`입니다. 설정 줄 제목·고르기 칸은 한 줄입니다. 고르기 칸은 진짜 라디오 단추라 키보드·화면 읽기가 그대로 됩니다.
- 화면·플러그인 카드의 키 이름은 영어 `Enter`가 아니라 한국어 "엔터 키"로 씁니다. 조합은 `Shift+엔터`, `Cmd+엔터`(Windows는 `Ctrl+엔터`)입니다. 코드·식별자와 개발 문서의 이벤트 이름(`key: 'Enter'`)은 그대로 둡니다. — 2026-11-15 사용자 — 지키는 방법: `test/client.test.mjs`, `test/plugin-card.test.mjs`
- 화면을 바꾸면 `test/preview.html`(`?theme=dark`)을 `ui-visual-qa`로 320·375·1280, 밝음·어두움에서 잽니다.
- 플러그인 카드 아이콘·한국어 설명과 이름 규칙은 키트 루트 `AGENTS.md`를 따릅니다.

## 자주 쓰는 명령

| 하는 일 | 명령 |
|---|---|
| 화면용 번들 만들기 | `node scripts/build.mjs` |
| 테스트 | `node --test test/*.test.mjs` |

## 작업·배포 흐름

1. 검토: 코드는 다른 세션이나 도구가 리뷰합니다. 실제 한글 입력은 사람이 DSH Desktop에서 칩니다.
2. 넓은 검사: `node scripts/build.mjs`와 `node --test test/*.test.mjs`를 커밋 전에 한 번 돌립니다. 빌드 뒤 `lib/client.js`가 바뀌었으면 같이 커밋합니다.
3. 배포 실행기: 서버 배포는 없습니다. 완성본은 Git 태그(`v<버전>`)이고, DSH 플러그인 추가 화면에 로컬 폴더 경로를 넣어 설치합니다.
4. 병합·배포하는 사람: 사용자가 승인한 뒤에만 Push·병합·태그를 합니다.
5. 사용자 승인이 필요한 일: GitHub 저장소 만들기, Push, 태그, DSH 프로필(`~/.dsh/profiles/desktop`) 설치·제거, Desktop 재시작.
6. 운영 확인: DSH Desktop에서
   - 설정 → 일반에 "엔터 키를 누르면" 줄이 "작업 중 보내기 방식" 다음에 있고, 기본이 "바로 보내기"인지
   - 바로 보내기: 한글 마지막 글자를 조합하는 중에 Enter 한 번으로 보내지는지, 줄바꿈이 끼지 않는지. Shift+Enter는 줄바꿈, 작업 중 Cmd/Ctrl+Enter는 반대 방식인지
   - 줄바꿈: Enter(조합 중 포함) 한 번에 줄이 하나만 바뀌는지, Cmd/Ctrl+Enter로 보내지는지
   - `/`를 쳐서 메뉴를 열고 Enter로 항목이 골라지는지(두 설정 모두)
   - Desktop을 다시 켜도 설정이 남는지, 개발자 도구 콘솔에 `[dsh-enter-keys]` 경고나 `slot entry crashed`가 없는지
7. 기록: 바뀐 내용은 `CHANGELOG.md`에 적습니다.
8. 되돌리기: DSH 플러그인 화면에서 끄거나 제거합니다. 끄면 입력창은 DSH 원래 동작으로 돌아갑니다.

## 새 DSH 버전이 나오면

1. `node --test test/*.test.mjs`를 돌립니다.
2. 앱 안 `dsh-client-ui-conversation`에서 다음이 그대로인지 봅니다.
   - `src/client/input/editor/keymap.ts`: 조합 중·`compositionend` 뒤 10ms Enter 삼키기, Shift+Enter `return false`, Cmd/Ctrl+Enter 가속. 10ms가 바뀌면 `REPLAY_DELAY_MS`를 그보다 크게 둡니다. DSH가 Enter 설정을 공식으로 들이면 이 플러그인은 그만 씁니다.
   - `src/client/skeleton/InputBar.tsx`: `data-composer-card`, `data-composer-overlay`, `renderSlot('conversation.input.overlay')` 위치
   - `src/client/input/editor/ComposerContentEditable.tsx`: `data-composer-input`
   - `dsh-client-ui-input-trigger/src/client/MenuView.tsx`: `data-trigger-menu`
   - `src/client/apply.ts`: `settings.general.item`의 `composer-enter` 순서(20)
3. 실제 Desktop에서 운영 확인 6번을 다시 합니다.

## 작업하며 배운 것

이 프로젝트에만 맞는 교훈입니다. 모든 프로젝트에 맞는 교훈은 `~/Dev/docs/agent-rules-architecture.md`의 공통 지식베이스에 둡니다.

- DSH 입력창은 한글 조합 중 Enter를 `return true`로 삼키고(보내지도 줄바꿈도 안 함), `compositionend` 뒤 10ms 안의 Enter도 조합 중으로 봅니다. 이 두 번째 Enter는 `preventDefault`가 없어 브라우저 줄바꿈이 됩니다. "가끔 줄바꿈, 두 번 쳐야 보내짐"의 원인입니다. — 처음 2026-11-15 — 지키는 방법: `src/enter-rules.js`, `test/enter-rules.test.mjs`
- Desktop 화면은 `127.0.0.1:<임의 포트>`가 아니라 고정된 자체 스킴(`protocol.registerSchemesAsPrivileged`)으로 열려 브라우저 저장소가 재시작 뒤에도 남습니다. DSH 자신도 사이드바·폭 설정을 `localStorage`에 둡니다. — 처음 2026-11-15 — 지키는 방법: `src/client.template.js`의 `createSettingStore`
- DSH 편집기(Lexical)는 keydown을 `event.key`(`Enter`)와 수식 키로 읽고 `isTrusted`를 보지 않습니다. 편집 루트에 보낸 가짜 `KeyboardEvent`도 DSH 키맵을 그대로 탑니다. Chromium에서는 Shift+Enter를 Lexical이 직접 줄바꿈합니다(Safari 계열만 브라우저에 맡김). — 처음 2026-11-15 — 지키는 방법: `pressEnter`
- DSH 플러그인 화면 순서는 `dsh-client-ui-plugin-manager`의 `sortPackages`가 정합니다. 범위 접두사(`@lyngmn/` 등)를 뺀 이름을 `localeCompare`로 비교할 뿐이고, 사용자가 바꿀 방법은 없습니다. 이 플러그인 이름(`dsh-enter-keys`)은 그대로 두고, Brave·Exa 검색 플러그인 이름을 바꿔 모으기로 했습니다(사용자 결정). — 처음 2026-11-15 — 지키는 방법: 없음(이름을 정할 때 그 화면 순서를 먼저 봄)
