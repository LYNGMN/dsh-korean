# dsh-plan-view 작업 지침

DeepSeek Harness(DSH) Desktop 대화 머리의 보기 탭(`채팅 · 실행 흐름 · …`)에 **계획** 보기를, 채팅 머리 오른쪽에 **진행 칩**을 더하는 플러그인입니다(DeepSeek 공식 플러그인이 아님). 에이전트의 할 일을 실시간으로 체크하며 턴이 넘어가도 기록하고, `/plan`으로 제출된 계획 문서를 단계 체크와 함께 보여 줍니다. 서버 쪽 일은 없고 화면 쪽 번들(`lib/client.js`) 하나뿐입니다.

구조는 [docs/architecture.md](docs/architecture.md)를 따릅니다.

## 지킬 것

- `/Applications/DeepSeek Harness.app` 안의 파일은 읽기만 합니다. DSH 코드·CSS를 복사하지 않습니다.
- DSH가 열어 둔 공식 경로만 씁니다: 자리 `conversation.view`·`conversation.session.header.utilities`, 서비스 `uiConversation.events.register`·`uiConversation.views.register`·`uiConversation.binding(...).target(...)`, 투영 `todos`, 세션 `running`, 보기 칸의 `inspectCall`.
- `@deepseek-ai/dsh-client-ui-primitives` 같은 Harness Client 패키지를 `require`하지 않습니다(DSH 플러그인 안내가 금지, 예고 없이 바뀜). 마크다운·아이콘·창은 직접 그립니다. 공용 모듈로 받는 것은 `react`·`react-dom`뿐입니다.
- 할 일은 에이전트 것입니다. 탭과 칩은 보기·펼치기·이동만 하고 DSH에 아무것도 쓰지 않습니다.
- 계획 문서는 `src/markdown.js`로 해석합니다. HTML은 글자로 남기고, 링크는 http·https·mailto만 열며, 그림은 불러오지 않고 대체 글만 보입니다.
- 보기 id와 대화 대상(target) 이름은 `dsh-plan-view`입니다. DSH가 나중에 `plan`이라는 보기를 들여도 부딪치지 않게 짧은 이름을 쓰지 않습니다.
- `lib/client.js`는 빌드 결과물입니다. `src/` 파일을 고친 뒤 `node scripts/build.mjs`로 다시 만듭니다.
- npm 의존성을 들이지 않습니다. React는 DSH가 공용 모듈로 주는 것을 `require`로 받습니다.
- 화면 글자는 한국어, `word-break: keep-all`입니다. 제목 줄은 한 줄 말줄임입니다. 움직임은 `prefers-reduced-motion`이면 끕니다.
- 화면을 바꾸면 `test/preview.html`(file://로 열림, `?theme=dark`·`?step=0~3`·`?carried=1`·`?empty=1`)을 `ui-visual-qa`로 320·375·1280, 밝음·어두움에서 잽니다. 칩 창은 `--open ".dpv-chip"`로 엽니다.
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
6. 운영 확인: 할 일 목록을 쓰는 세션과 `/plan`을 쓴 세션을 하나씩 열어 봅니다.
   - `…`(다른 대화 보기 방식) 메뉴에 "계획"이 있고, 고정하면 탭으로 남는지
   - 에이전트가 할 일을 고치면 체크·경과 시간이 바로 바뀌는지, 채팅 머리 칩 숫자가 같이 바뀌고 누르면 할 일 창이 열리는지
   - 새 메시지를 보낸 뒤에도 목록이 "직전 턴 목록"으로 남고 "지난 할 일"에 턴이 쌓이는지
   - 제출된 계획이 원문 기호(`#`, `**`, `|---|`) 없이 제목·목록·표로 보이고, 할 일과 비슷한 단계가 체크되는지
   - 밝음·어두움 모두, 개발자 도구 콘솔에 `slot entry crashed`나 `[dsh-plan-view]` 오류가 없는지
7. 기록: 바뀐 내용은 `CHANGELOG.md`에 적습니다.
8. 되돌리기: DSH 플러그인 화면에서 끄거나 제거합니다.

## 새 DSH 버전이 나오면

1. `node --test test/*.test.mjs`를 돌립니다.
2. 앱 안 `dsh-client-ui-conversation/src/client/contract/slots.ts`에서 `conversation.view`·`conversation.session.header.utilities` 자리와 `inspectCall`이 그대로인지, `todo/write` 이벤트(`seq`·`time`·`data.todos`)와 투영 `todos`가 새 턴에 null이 되는 동작이 그대로인지, `contract/conversation.ts`의 `ConversationNodeDefinition`·`ConversationViewDefinition` 모양이 그대로인지, `dsh-tool-todo/src/types.ts`의 `todos` 투영과 `dsh-client-ui-plan/src/client/plan.ts`의 `exit_plan_mode` 인자(`plan`) 모양이 그대로인지 봅니다.
3. 실제 Desktop에서 운영 확인 6번을 다시 합니다.

## 작업하며 배운 것

이 프로젝트에만 맞는 교훈입니다. 모든 프로젝트에 맞는 교훈은 `~/Dev/docs/agent-rules-architecture.md`의 공통 지식베이스에 둡니다.

- 대화 보기 칸(`conversation.view`)에 등록할 때 `inject(sessionId)`가 돌려준 `hooks: { 이름: 관찰값 }`은 컴포넌트에 `use이름(선택자)`로 들어옵니다. 세션 범위 자리라 `useProjection`·`sessionId`도 함께 받습니다. — 처음 2026-11-14 — 지키는 방법: `src/client.template.js`의 `PlanView`
- DSH 플러그인 안내(앱 안 문서)는 플러그인이 `@deepseek-ai/dsh-client-ui-primitives` 등 Harness Client 패키지를 `require`하지 말라고 합니다. 실제로 `MarkdownText`를 받지 못해 계획 본문이 원문 마크다운으로 보였습니다. 필요한 부품은 직접 만듭니다. — 처음 2026-11-15 — 지키는 방법: `test/client.test.mjs`(공용 부품을 require하면 실패)
- 투영 `todos`는 `turn/start`에서 null이 됩니다. 목록을 유지하려면 `todo/write` 이벤트를 직접 접어 기록해야 합니다. — 처음 2026-11-14 — 지키는 방법: `src/todo-history.js`
- 계획 문서의 줄과 할 일 문구는 길이·모양이 달라 글자 유사도(0.5)로는 거의 붙지 않습니다(실측: 계획 26개 중 24개가 짝 0). 실행 여부는 "계획 뒤 할 일" 집계로 보여 주고, 단계 체크는 문구가 거의 같은 줄에만 붙입니다. — 처음 2026-11-16 — 지키는 방법: `test/client.test.mjs`(짝 0에서도 완료 배지)
