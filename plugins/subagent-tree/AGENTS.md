# dsh-subagent-tree 작업 지침

DeepSeek Harness(DSH) Desktop 왼쪽 사이드바에서 하위 에이전트를 부모 세션 아래에 보여 주는 플러그인입니다(DeepSeek 공식 플러그인이 아님). 서버 쪽 일은 없고 화면 쪽 번들(`lib/client.js`) 하나뿐입니다.

구조는 [docs/architecture.md](docs/architecture.md)를 따릅니다.

## 지킬 것

- `/Applications/DeepSeek Harness.app` 안의 파일은 읽기만 합니다.
- DSH가 열어 둔 자리(slot) 세 곳만 공식 경로로 씁니다: `sidebar.session.row.trailing`, `sidebar.session.row.hover`, `sidebar.workspaces.session.row.action`.
- 부모 줄 아래 자식 줄은 공식 자리가 아닙니다. 세션 줄(`[data-row-key="session:<id>"]`) 바로 뒤에 상자 하나를 붙이는 것만 하고, DSH가 만든 요소의 속성·스타일·순서는 바꾸지 않습니다. 줄을 찾지 못하면 그리지 않고 경고 한 번만 남깁니다.
- `lib/client.js`는 빌드 결과물입니다. `src/` 파일을 고친 뒤 `node scripts/build.mjs`로 다시 만듭니다.
- npm 의존성을 들이지 않습니다. React·ReactDOM은 DSH가 공용 모듈로 주는 것을 `require`로 받습니다.
- 세션 투영 새로고침(`refreshProjections`)은 세션마다 5초에 한 번까지입니다. 목록 전체를 한꺼번에 다시 읽지 않습니다.
- 화면 글자는 한국어, 이름·제목은 한 줄 말줄임입니다.
- 플러그인 카드 아이콘·한국어 설명과 이름 규칙은 키트 루트 `AGENTS.md`를 따릅니다.

## 자주 쓰는 명령

| 하는 일 | 명령 |
|---|---|
| 화면용 번들 만들기 | `node scripts/build.mjs` |
| 테스트 | `node --test test/*.test.mjs` |

## 작업·배포 흐름

1. 검토: 코드는 다른 세션이나 도구가 리뷰합니다. 사이드바 모습은 사람이 실제 DSH Desktop에서 봅니다.
2. 넓은 검사: `node scripts/build.mjs`와 `node --test test/*.test.mjs`를 커밋 전에 한 번 돌립니다. 빌드 뒤 `lib/client.js`가 바뀌었으면 같이 커밋합니다.
3. 배포 실행기: 서버 배포는 없습니다. 완성본은 Git 태그(`v<버전>`)이고, DSH 플러그인 추가 화면에 로컬 폴더 경로를 넣어 설치합니다.
4. 병합·배포하는 사람: 사용자가 승인한 뒤에만 Push·병합·태그를 합니다.
5. 사용자 승인이 필요한 일: GitHub 저장소 만들기, Push, 태그, DSH 프로필(`~/.dsh/profiles/desktop`) 설치·제거, Desktop 재시작, 상위 저장소(`deepseek-ai/deepseek-harness`)에 이슈 올리기.
6. 운영 확인: 하위 에이전트를 쓰는 세션을 하나 돌려 줄 끝 아이콘, 마우스를 올렸을 때 뜨는 카드, 부모 줄 아래 자식 줄이 보이는지, 자식 줄을 누르면 그 세션이 열리는지, 접기·펼치기가 되는지 봅니다. 밝음·어두움 모두 봅니다. 개발자 도구 콘솔에 `[dsh-subagent-tree]` 경고가 없는지 확인합니다.
7. 기록: 바뀐 내용은 `CHANGELOG.md`에 적습니다.
8. 되돌리기: DSH 플러그인 화면에서 끄거나 제거합니다. 자식 줄만 끄려면 플러그인 설정 `nestedRows`를 `false`로 바꿉니다.

## 새 DSH 버전이 나오면

1. `node --test test/*.test.mjs`를 돌립니다.
2. 앱 안 `dsh-client-ui-workspace/src/client/contract/slots.ts`에서 위 세 자리 이름이 그대로인지, `rows/Rows.tsx`에서 세션 줄에 `data-row-key="session:<id>"`가 그대로인지 봅니다.
3. 실제 Desktop에서 운영 확인 6번을 다시 합니다. 자식 줄이 사라졌으면 콘솔 경고를 보고 줄 찾는 부분(`useRowSibling`)만 고칩니다.

## 작업하며 배운 것

이 프로젝트에만 맞는 교훈입니다. 모든 프로젝트에 맞는 교훈은 `~/Dev/docs/agent-rules-architecture.md`의 공통 지식베이스에 둡니다.

- DSH 세션 줄의 오른쪽 영역(`sidebar.session.row.trailing`이 들어가는 곳)은 마우스를 올리거나 키보드로 들어가면 `display: none`이 됩니다. 컴포넌트는 그대로 붙어 있지만 그 안의 버튼은 누를 수 없으므로, 누르는 버튼은 `sidebar.workspaces.session.row.action`에 둡니다. — 처음 2026-11-14 — 지키는 방법: `src/client.template.js`의 `Toggle`
- 열지 않은 세션의 투영에는 요약 값만 있고 `subagentCatalog`가 빠져 있습니다. 투영이 "있다"는 것만 보고 넘어가면 자식 목록을 끝내 못 읽습니다. — 처음 2026-11-14 — 지키는 방법: `src/tree.js`의 `needsCatalog`, `test/tree.test.mjs`
- DSH 플러그인 추가 창과 `dsh plugin add`는 로컬 폴더를 절대 경로로만 받습니다. `~/`로 시작하면 패키지 이름으로 읽혀 설치가 안 됩니다. `dsh` 명령은 PATH에 없고 `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`에 있으며, `plugin --profile desktop add link:<절대 경로>`는 설치와 켜기를 함께 합니다. — 처음 2026-11-14 — 지키는 방법: README 설치 절
- 연결된(`link:`) 플러그인은 `node scripts/build.mjs`로 다시 빌드하면 떠 있는 DSH가 바뀐 번들을 바로 내줍니다. Desktop을 다시 켤 필요가 없습니다. — 처음 2026-11-14 — 지키는 방법: 운영 확인 6번
