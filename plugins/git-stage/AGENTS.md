# dsh-git-stage 작업 지침

DeepSeek Harness(DSH) Desktop 대화 머리의 보기 탭에 **작업 단계** 보기를, 채팅 머리 오른쪽에 **단계 칩**을 더하는 플러그인입니다(DeepSeek 공식 플러그인이 아님). 서버 쪽(`lib/index.js`)이 세션 작업 폴더의 Git 상태를 읽어 라우트 `/api/dsh-git-stage`로 내주고, 화면 쪽 번들(`lib/client.js`)이 그것과 할 일 목록으로 여섯 단계를 그립니다.

구조는 [docs/architecture.md](docs/architecture.md)를 따릅니다.

## 지킬 것

- `/Applications/DeepSeek Harness.app` 안의 파일은 읽기만 합니다. DSH 코드·CSS를 복사하지 않습니다.
- Git은 **읽기만** 합니다. `fetch`·`pull`·`push`·`commit`·`merge`·`tag` 만들기처럼 상태를 바꾸거나 네트워크를 타는 `git` 명령을 넣지 않습니다. `gh`는 `pr view`만 부릅니다. 화면에 푸시·머지·태그 단추를 넣지 않습니다.
- 명령은 셸 없이 `execFile`의 argv로 돌리고, 환경에 `GIT_OPTIONAL_LOCKS=0`·`GIT_TERMINAL_PROMPT=0`·`GH_PROMPT_DISABLED=1`을 둡니다. 5초 제한입니다.
- 작업 폴더는 서버가 세션 id로 `sessionQuery`에서 찾습니다. 화면이 보낸 경로(`?cwd=`)는 믿지 않습니다. 작업 폴더가 저장소 묶음이면 화면은 저장소 **이름**(`?repo=`)만 보내고, 서버는 `findRepos`가 찾은 목록에 그 이름이 있을 때만 씁니다.
- `gh` 출력 원문·토큰은 로그와 화면에 내보내지 않습니다. 화면에는 로그인 만료·없음·시간 초과 같은 분류만 보입니다. PR 주소는 `https:`일 때만 씁니다.
- 단계 규칙은 `src/stages.js`(순수 함수) 하나가 정합니다. 휴대폰 앱(`plugins/handheld/web/src/lib/stages.js`)과 Git 읽기(`plugins/handheld/server/gateway/git-read.js`)는 이 플러그인 파일의 **복사본**입니다(키트는 플러그인 사이 공용 패키지를 두지 않음). 고치면 두 사본을 같이 고치고, 키트 루트 `test/git-stage-copies.test.mjs`가 같은지 봅니다.
- `@deepseek-ai/dsh-client-ui-primitives` 같은 Harness Client 패키지를 `require`하지 않습니다. 공용 모듈로 받는 것은 `react`·`react-dom`뿐입니다.
- `lib/client.js`는 빌드 결과물입니다. `src/` 파일을 고친 뒤 `node scripts/build.mjs`로 다시 만듭니다.
- npm 의존성을 들이지 않습니다.
- 코드는 여기서 분석하지 않습니다. 코드 지도 플러그인(`/api/dsh-code-map`, `src/code-summary.js`)이 읽은 숫자만 빌려 보입니다. 지도가 읽지 못한 범위(미인덱스·부분 파싱·파싱 불가)는 0이어도 늘 보이고, 값을 모르면 0이 아니라 "확인 안 됨"으로 씁니다. 그 라우트가 없거나 실패해도 작업 단계 읽기는 실패하지 않습니다. — 2026-11-18 사용자 — 지키는 방법: `test/code-summary.test.mjs`, `test/client.test.mjs`
- 화면 글자는 한국어 해요체, `word-break: keep-all`입니다. 단계 칸은 같은 폭 격자(넓으면 6칸, 좁으면 3칸 두 줄)입니다.
- 화면을 바꾸면 `test/preview.html`을 `ui-visual-qa`로 320·375·1280, 밝음·어두움에서 잽니다(`--theme-attr data-theme --open ".dgs-chip"`).
- 플러그인 카드 아이콘·한국어 설명과 이름 규칙은 키트 루트 `AGENTS.md`를 따릅니다.

## 자주 쓰는 명령

| 하는 일 | 명령 |
|---|---|
| 화면용 번들 만들기 | `node scripts/build.mjs` |
| 테스트 | `node --test test/*.test.mjs` |

## 작업·배포 흐름

1. 검토: 코드는 다른 세션이나 도구가 리뷰합니다. 탭 모습은 사람이 실제 DSH Desktop에서 봅니다.
2. 넓은 검사: `node scripts/build.mjs`와 `node --test test/*.test.mjs`를 커밋 전에 한 번 돌립니다. 빌드 뒤 `lib/client.js`가 바뀌었으면 같이 커밋합니다.
3. 배포 실행기: 서버 배포는 없습니다. 완성본은 Git 태그(`v<버전>`)이고, DSH 플러그인 추가 화면에 로컬 폴더 경로를 넣어 설치합니다.
4. 병합·배포하는 사람: 사용자가 승인한 뒤에만 Push·병합·태그를 합니다.
5. 사용자 승인이 필요한 일: GitHub 저장소 만들기, Push, 태그, DSH 프로필(`~/.dsh/profiles/desktop`) 설치·제거, Desktop 재시작.
6. 운영 확인: Git 저장소 폴더의 세션을 엽니다.
   - `…` 메뉴에 "작업 단계"가 있고, 탭이 실제로 Git 상태를 읽는지(서버 라우트 `/api/dsh-git-stage`가 닿는지)
   - 브랜치를 만들고·커밋하고·푸시할 때 단계가 넘어가는지(탭이 보이는 동안 10초마다, 세션이 멈출 때 다시 읽음)
   - Git 저장소가 아닌 폴더에서 "Git 저장소가 아니에요"만 보이는지
   - 밝음·어두움 모두, 개발자 도구 콘솔과 Desktop 로그에 `[dsh-git-stage]` 오류가 없는지
7. 기록: 바뀐 내용은 `CHANGELOG.md`에 적습니다.
8. 되돌리기: DSH 플러그인 화면에서 끄거나 제거합니다.

## 새 DSH 버전이 나오면

1. `node --test test/*.test.mjs`를 돌립니다.
2. 앱 안에서 `conversation.view`·`conversation.session.header.utilities` 자리, 투영 `todos`, 세션 `running`, `ctx.connection.fetch.register`, `ctx.sessionQuery.observeSession`(`projections.values.workingDirectory`·`header.cwd`) 모양이 그대로인지 봅니다.
3. 실제 Desktop에서 운영 확인 6번을 다시 합니다.

## 작업하며 배운 것

이 프로젝트에만 맞는 교훈입니다. 모든 프로젝트에 맞는 교훈은 `~/Dev/docs/agent-rules-architecture.md`의 공통 지식베이스에 둡니다.

- 브랜치를 원본에 머지하고 지우지 않았으면 원본보다 앞선 커밋이 0개가 됩니다. 이것만으로 "합치기 끝남"이라 하면 새로 만든 빈 브랜치도 끝남이 되므로, 그 브랜치에 커밋했던 기록(reflog)이 있을 때만 머지로 봅니다. — 처음 2026-11-15 — 지키는 방법: `src/stages.js`, `test/stages.test.mjs`
- 원본 브랜치(`main`)에 있으면 원본이 GitHub와 같다는 이유로 "공유 끝남", 지난 할 일 때문에 "검증 끝남"이 칠해졌습니다. 원본 브랜치에서는 작업실 뒤 단계를 모두 시작 전으로 봅니다. — 처음 2026-11-15 — 지키는 방법: `src/stages.js`, `test/stages.test.mjs`
- DSH에서 `~/Dev`처럼 여러 저장소를 담은 폴더를 작업 공간으로 쓰면 세션 작업 폴더가 저장소가 아닙니다. 그 안의 저장소를 `.git`의 마지막 변경 시각으로 찾아 따라갑니다(명령 없이 파일만, `~/Dev` 246곳에 0.14초). — 처음 2026-11-15 — 지키는 방법: `lib/git-read.js`의 `findRepos`, `test/git-read.test.mjs`
- DSH는 세션 자리(`conversation.view`, 머리 칩)에 표준 속성 `inputActions`를 넘깁니다. 입력창에 글을 넣을 때는 `insertText(text, captureInsertion())`을 쓰고(사람이 친 글·참조 칩을 지움 없이 커서 자리에 넣음), `setDraft`·`submit`은 쓰지 않습니다. — 처음 2026-11-15 — 지키는 방법: `src/client.template.js`의 `Ask`, `test/client.test.mjs`
- 칩 창은 자리를 잰 뒤에 그려지므로, 여는 순간 `panel.focus()`를 부르면 아직 없는 창이라 초점이 칩에 남습니다. 창이 그려진 다음(`place`가 생긴 뒤) 초점을 옮깁니다. — 처음 2026-11-15 — 지키는 방법: `src/client.template.js`의 `StageChip`
- DSH 셸 도구 결과에는 종료 코드 칸이 없습니다. 0이 아니면 결과 글 끝에 `[exit code: N]`이 붙고, 0이면 아무것도 붙지 않습니다(0.2.x 세션 기록 40개에서 확인). `run_in_background` 실행은 결과가 "시작함"이라 성공으로 세지 않습니다. 파이프(`| tail`)·세미콜론 뒤 종료 코드는 마지막 명령 것이라 검증으로 세지 않습니다. — 처음 2026-11-16 — 지키는 방법: `lib/index.js`의 `resultOkOf`, `lib/git-read.js`의 `verifyCommandOf`, `test/git-read.test.mjs`
- 시안에서 점 클래스(`.now`)와 카드 클래스(`.now`)가 겹쳐 점이 카드 모양으로 커졌습니다. 칩 점은 `data-status`, 지금 카드는 `dgs-now`처럼 상태와 부품 이름을 다른 축으로 나눕니다. — 처음 2026-11-16 — 지키는 방법: `src/style.css`
