# dsh-korean 작업 지침

DeepSeek Harness(DSH) 화면을 한국어로 보여 주는 언어팩입니다(DeepSeek 공식 언어팩이 아님). 앱 파일은 고치지 않고, DSH가 공식으로 제공하는 언어팩 기능(`ctx.locale.addLanguage`, `ctx.locale.register`)만 씁니다.

구조는 [docs/architecture.md](docs/architecture.md), 문체는 [STYLE.md](STYLE.md), 용어는 [glossary.json](glossary.json)을 따릅니다.

## 지킬 것

- `/Applications/DeepSeek Harness.app` 안의 파일은 읽기만 합니다. `app.asar`를 고치면 서명이 깨지고 업데이트 때 사라집니다.
- 번역은 `source/<앱 버전>/en/`의 영어 원문에서 직접 옮깁니다. 다른 언어팩의 코드나 번역문을 가져오지 않습니다.
- `lib/client.js`는 빌드 결과물입니다. 직접 고치지 않고 `ko/*.json`, `packages/ko.json`, `src/client.template.js`, `src/font-picker.js`를 고친 뒤 다시 빌드합니다.
- `source/` 아래 파일은 추출 결과입니다. 손으로 고치지 않습니다.
- npm 의존성을 들이지 않습니다. Node 내장 기능만 씁니다(Node 22.15 이상).
- 화면 전체를 감시해 영어 문구를 바꿔 치는 코드는 넣지 않습니다. 언어 서비스에서 감싸는 함수는 플러그인 카드 문구용 `resolveText` 하나뿐이며, 더 늘리지 않습니다. 사전에 없는 문구는 [docs/untranslated.md](docs/untranslated.md)에 적습니다.

## 자주 쓰는 명령

| 하는 일 | 명령 |
|---|---|
| 설치된 앱에서 영어 원문 다시 뽑기 | `node scripts/extract.mjs` |
| 번역 검사 | `node scripts/check.mjs` (작업 중에는 `--allow-incomplete`) |
| 화면용 번들 만들기 | `node scripts/build.mjs` |
| 테스트 | `node --test test/*.test.mjs` |

## 작업·배포 흐름

1. 검토: 번역문은 사람이 실제 앱 화면에서 확인합니다. 코드는 다른 세션이나 도구의 리뷰를 받습니다.
2. 넓은 검사: `node scripts/check.mjs`와 `node --test test/*.test.mjs`를 커밋 전에 한 번 돌립니다. 공개 뒤에는 GitHub Actions가 같은 두 명령을 돌립니다.
3. 배포 실행기: 서버 배포는 없습니다. 완성본은 Git 태그(`v<버전>`)이고, 사용자는 DSH의 플러그인 추가 화면에 저장소 주소나 로컬 폴더 경로를 넣어 설치합니다.
4. 병합·배포하는 사람: 사용자가 승인한 뒤에만 Push·병합·태그를 합니다.
5. 사용자 승인이 필요한 일: GitHub 저장소 만들기, 첫 Push, 태그·릴리스, 상위 저장소(`deepseek-ai/deepseek-harness`)에 이슈·PR 올리기, 사용자의 DSH 프로필(`~/.dsh/profiles/desktop`)을 바꾸는 설치·제거.
6. 운영 확인: DSH에서 설정 → 일반 → 언어를 한국어로 바꾸고 사이드바, 대화, 설정, 승인 창, 플러그인 화면을 봅니다. 개발자 도구 콘솔에 `[dsh-korean]` 경고가 없는지 확인합니다.
7. 기록: 바뀐 내용은 `CHANGELOG.md`에, 앱에서 영어로 남는 문구는 `docs/untranslated.md`에 적습니다.
8. 되돌리기: DSH 플러그인 화면에서 언어팩을 끄거나 제거합니다. 앱 파일을 고치지 않으므로 그 밖에 되돌릴 것이 없습니다.

## 새 앱 버전이 나오면

1. `node scripts/extract.mjs`로 새 버전 스냅샷(`source/<새 버전>/`)을 만듭니다. "확인 필요"가 나오면 추출기가 읽지 못한 등록이 있다는 뜻이므로 먼저 고칩니다.
2. `node scripts/check.mjs`를 돌립니다. 가장 새 스냅샷을 기준으로 빠진 키, 없어진 키, 플레이스홀더가 바뀐 키를 알려 줍니다.
3. 새 키를 번역하고, 없어진 키는 `ko/`와 `packages/ko.json`에서 지웁니다.
4. 검사와 테스트가 통과하면 빌드하고 실제 앱에서 확인합니다.
5. 지원하지 않게 된 옛 버전 스냅샷은 지웁니다.

## 작업하며 배운 것

이 프로젝트에만 맞는 교훈입니다. 모든 프로젝트에 맞는 교훈은 `~/Dev/docs/agent-rules-architecture.md`의 공통 지식베이스에 둡니다.

- 앱의 사전은 `app.asar` 안에 TypeScript 원본으로 들어 있고, 다른 패키지의 값을 끌어다 쓰는 사전도 있습니다(예: `command`의 `token.*`). 정규식으로 긁으면 이런 값이 빠지므로 모듈을 실제로 불러와 값을 얻습니다. — 처음 2026-11-12 — 지키는 방법: `scripts/ts-modules.mjs`, `test/extract.test.mjs`
- 불러올 수 없는 가져오기를 대역으로 바꿀 때, 대역이 문자열로 바뀌면 빈 문구가 사전에 섞입니다. — 처음 2026-11-12 — 지키는 방법: 대역이 문자열로 쓰이면 오류를 내고, 추출기가 "확인 필요"로 보고함
- 클라이언트 플러그인은 `package.json`의 `dsh.client` 선언과 `./client` export에 더해, `cordis.patch.yml`의 `insert` 항목이 있어야 앱이 번들을 싣습니다. — 처음 2026-11-12 — 지키는 방법: 앱 안 `dsh-client-modules` README
- DSH 플러그인 추가 화면은 npm 패키지, Git 저장소, 로컬 폴더 경로를 모두 받습니다. 프로필의 `package.json`을 손으로 고칠 필요가 없습니다. — 처음 2026-11-12 — 지키는 방법: 설치는 앱 화면이나 `dsh plugin add`로 함
