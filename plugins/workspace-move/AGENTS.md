# dsh-workspace-move 작업 지침

DSH 세션 대화를 다른 작업공간으로 옮기는 플러그인이에요(DeepSeek 공식 플러그인 아님). Host 쪽(`index.js`, `src/host/`)이 로그·작업공간 기록을 바꾸고, 화면 쪽 번들(`lib/client.js`)이 세션 메뉴와 확인 창을 그립니다.

구조와 사용법은 [README.md](README.md), 카드 상세는 [docs/DETAIL.md](docs/DETAIL.md)를 따릅니다.

## 지킬 것

- `/Applications/DeepSeek Harness.app` 안의 파일은 읽기만 합니다.
- `index.js`와 `src/`에서 `@deepseek-ai/*` 모듈을 import하지 않습니다. Host 서비스(`ctx.sessionPersistence`, `ctx.workspaceRegistry`, `ctx.connection`)와 node 내장 모듈만 씁니다.
- 새 npm 의존성을 들이지 않습니다. React·ReactDOM은 DSH가 주는 것을 `require`로 받습니다.
- `~/.dsh/storages/workspace.json`이나 세션 로그 파일을 직접 고치지 않습니다. 저장소는 `ctx.sessionPersistence`의 handle로만 읽고 씁니다.
- 이동 순서를 바꾸지 않습니다: 확인 → 미리 확인 → 저널 → 백업 → 격리 → 새 로그 → 검증 → `detachSession` → `attachSession` → 정리. **attach를 detach보다 먼저 하지 않습니다**(한 세션이 두 작업공간에 속하면 DSH가 목록을 못 읽습니다).
- 원본을 지우는 시점은 새 로그 검증이 끝난 뒤입니다. 실패하면 반드시 원래 자리로 되돌립니다.
- 화면 글자는 한국어, `word-break: keep-all`, 터치 대상 44px, 입력 16px 이상, 색은 `--dsw-alias-*` 토큰만 씁니다.
- 끌어놓기는 `document` 캡처 단계에서 `[data-row-key]`만 읽고, `[role="tree"]` 안으로 범위를 좁힙니다. **다른 작업공간 위일 때만** `preventDefault`로 개입하고, 같은 작업공간 안의 공식 순서 바꾸기는 건드리지 않습니다. 놓기 표시는 작업공간 줄에 `dwm-drop-target` 클래스만 붙였다 뗍니다.
- 이동/복사 선택은 Host가 합니다: 열려 있거나 로그가 `maxArtifactBytes`(16MiB)보다 크면 복사, 그 외에는 그대로 이동. preflight의 `copy`가 화면 안내와 일치해야 합니다. 이동 경로는 원본을 먼저 옮기므로 로그를 메모리에 모읍니다(그래서 크기 한도가 있습니다).
- 열린 대화의 **그대로 이동**은 `queue`로 예약만 하고(`pending.json`), 다음 Host 시작 때 `processPending()`이 세션이 닫힌 상태에서 진짜 이동을 끝냅니다. preflight의 `queue`·`trueMove`가 참일 때만 화면에 버튼을 띄웁니다. 예약은 세션을 바꾸지 않으므로 사용자가 재시작하지 않으면 그대로 남습니다.
- 삭제는 `delete` 액션: 세션을 작업공간에서 detach하고 로그 디렉터리를 `~/.Trash`로 옮깁니다(실패하면 `removed/`). **열린 대화는 메모리에 남아 '그룹 없음'에 보이므로 `archiveSession(id, { stopActivity: true })`로 즉시 숨깁니다.** 닫힌 대화는 보관·고정을 풉니다. 클라이언트는 삭제 뒤 `sessions.refresh()`로 목록을 다시 받습니다. 화면의 삭제 메뉴는 Host의 `pending` 응답 `capabilities.delete`가 참일 때만 보입니다.
- 예약 상태는 `pending` 액션이 대상 작업공간 이름과 함께 돌려주고, 화면은 세션 줄 배지(`dwm-badge`, `sidebar.session.row.trailing`)로 보여 줍니다. 끝난 예약은 `completed.json`에 남겨 두었다가 앱이 열릴 때 알림으로 보여 주고 `ack`로 지웁니다. `cancel`은 예약만 지우고 세션은 건드리지 않습니다.
- 세션 메뉴 줄은 옛 슬롯(`sidebar.workspaces.session.menu.item`)에 버튼을 직접 그리지 않고 `ctx.contextMenus.register`로 등록합니다. 아이콘은 `contextMenu.icon` 키로 넘기고(휴지통은 공식 `workspace.delete`), 문구는 공식 줄처럼 `세션 …`·`작업공간 …`으로 맞추고, 확인 창이 뜨는 줄이어도 끝에 말줄임표(…)를 붙이지 않습니다(공식 "이름 바꾸기"와 같게).
- `lib/client.js`는 빌드 결과물입니다. `src/`를 고친 뒤 `node scripts/build.mjs`로 다시 만들고 함께 커밋합니다.
- 플러그인 카드 아이콘·한국어 설명과 이름 규칙은 키트 루트 `AGENTS.md`를 따릅니다.

## 자주 쓰는 명령

| 하는 일 | 명령 |
|---|---|
| 화면용 번들 만들기 | `node scripts/build.mjs` |
| 플러그인 시험 | `node --test test/*.test.mjs` |
| 키트 전체 시험 | 키트 루트에서 `npm test` |

## 작업·배포 흐름

1. 검토: 코드는 다른 세션이나 도구가 리뷰합니다. 화면은 사람이 실제 DSH에서 봅니다.
2. 넓은 검사: `node scripts/build.mjs`와 `node --test test/*.test.mjs`를 커밋 전에 돌리고, 키트 루트 `npm test`까지 통과하는지 봅니다.
3. 배포 실행기: 서버 배포는 없습니다. 완성본은 Git 태그(`v<버전>`)이고, 사용자가 `./install.sh`로 설치합니다.
4. 병합·배포하는 사람: 사용자가 승인한 뒤에만 Push·병합·태그를 합니다.
5. 사용자 승인이 필요한 일: 프로필 설치·제거, Desktop 재시작, 상위 저장소에 이슈 올리기.
6. 운영 확인: 테스트 대화를 A→B로 옮기고 ⓐ 사이드바에서 자리가 바뀌는지, ⓑ B에서 열어 기록·제목이 그대로인지, ⓒ 한 마디 보내 작업 폴더가 B인지, ⓓ 앱 재시작 뒤에도 B인지, ⓔ 되돌리기가 되는지, ⓕ 열린 대화·하위 에이전트·없는 폴더에서 이유가 나오는지 봅니다.
7. 기록: 바뀐 내용은 `CHANGELOG.md`에 적습니다.
8. 되돌리기: 플러그인 화면에서 끄거나 제거합니다. 이미 옮긴 대화는 그대로 남습니다.

## 새 DSH 버전이 나오면

1. `node scripts/build.mjs && node --test test/*.test.mjs`를 돌립니다.
2. 앱 안 `dsh-workspace/src/types.ts`에서 `attachSession`·`detachSession` 계약이 그대로인지, `dsh-session-persistence/src/index.ts`에서 `create`/`open`/`stat`·`SessionHeader` 필드가 그대로인지 봅니다.
3. `dsh-client-ui-context-menu/src/client/types.ts`의 `MenuContribution`(`observe`·`resolve`·`afterContent`)과 `dsh-client-ui-workspace/src/client/session-actions/context-menus.tsx`의 공식 순서(다음에서 열기 500, 세션 보관 600), `index.ts`의 `workspace.delete` 아이콘 키가 그대로인지, `shell.overlay`가 그대로인지 봅니다.
4. 실제 DSH에서 운영 확인 6번을 다시 합니다.

## 작업하며 배운 것

- 이 빌드의 `stat()`에는 `eventCount`가 없다(`sizeBytes`는 있다). 옮긴 로그의 개수는 첫·마지막 이벤트를 직접 읽어 확인해야 한다. — 처음 2026-11-16 — 지키는 방법: `src/host/move.js`의 `verify`, `test/world.mjs`
- JSONL 백엔드의 `create()`는 루트 전체에서 같은 id의 로그를 찾아 거절하고, 같은 id의 쓰기 handle이 열려 있어도 거절한다. 그래서 원본을 먼저 격리하고 handle을 닫은 뒤 새로 만든다. — 처음 2026-11-16 — 지키는 방법: `src/host/move.js`의 순서, `test/move.test.mjs`
- 작업공간 목록에서 세션이 두 작업공간에 속하면 DSH가 레지스트리를 못 읽는다. 그래서 항상 detach를 먼저 한다. — 처음 2026-11-16 — 지키는 방법: `handOver`, 복구의 `detach → attach`
- macOS의 `/var`는 `/private/var`로 풀린다. 시험용 임시 폴더 경로를 그대로 cwd로 쓰면 `attachSession` 검증이 어긋난다. — 처음 2026-11-16 — 지키는 방법: `test/world.mjs`의 `realpath`
- 형제 플러그인은 화면 쪽만 있어 Host↔화면 통로가 없었다. DSH의 `ctx.connection.fetch.register`(정확 경로, 소유자 Peer만)를 쓰면 인증된 `/api` 경로 하나로 안전하게 붙일 수 있다. — 처음 2026-11-16 — 지키는 방법: `index.js`, `src/client/api.js`
