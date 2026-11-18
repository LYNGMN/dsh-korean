# 한국어 DSH 키트 작업 지침

DeepSeek Harness(DSH) 플러그인을 모은 키트입니다. 구조는 [docs/architecture.md](docs/architecture.md)를 따르고, 플러그인 폴더에 `AGENTS.md`가 있으면 그 플러그인을 고칠 때 함께 따릅니다. 같은 주제에서 플러그인 지침과 다르면 플러그인 지침이 우선합니다.

## 지킬 것

- `/Applications/DeepSeek Harness.app` 안의 파일은 읽기만 합니다.
- 플러그인 이름은 `@lyngmn/dsh-<폴더>`, `author`는 `LYNGMN`, `repository.directory`는 `plugins/<폴더>`입니다. `cordis.patch.yml`의 플러그인 `id`와 데이터 폴더 이름은 처음 정한 그대로 둡니다(사용자 설정이 id로 저장됨).
- 플러그인 카드에는 아이콘과 한국어 설명을 꼭 넣습니다. 아이콘은 Lucide 아이콘을 36칸 SVG로 옮겨 DSH 파란색 그라데이션(`#3D94EE`→`#3F77D8`)으로 칠하고, 외부 서비스를 잇는 플러그인은 그 서비스의 공식 로고를 씁니다. 출처는 SVG 주석에 남기고, 다른 플러그인 아이콘과 보이는 크기·중심을 `measure-icon-optics.mjs`로 맞춥니다. 제목·설명은 `locale/ko.json`(`meta.title`, `meta.description`, 해요체)과 `locale/en.json`에 두고 `exports`에 `./icon`, `./locale/*.json`을 엽니다. — 2026-11-14 사용자 — 지키는 방법: `test/plugin-card.test.mjs`
- 카드 설명은 끝에 같은 문장으로 DeepSeek 공식 플러그인이 아님을 밝힙니다. 한국어는 "DeepSeek 공식 플러그인이 아니에요.", 영어는 "Not an official DeepSeek plugin."이고, `package.json` `description`은 영어 카드 설명과 같게 둡니다. — 2026-11-15 사용자 — 지키는 방법: `test/plugin-card.test.mjs`
- 승인·질문 답은 사람이 직접 누를 때만 보냅니다. 자동 승인 코드를 넣지 않습니다.
- API 키·토큰·쿠키는 로그·화면·저장소에 내보내지 않습니다.
- 새 npm 의존성은 그 플러그인 지침이 허락할 때만 들입니다. 플러그인 사이에 공용 코드 패키지를 만들지 않습니다.
- 화면 글자는 한국어 기본, `word-break: keep-all`, 입력창 16px 이상, 터치 대상 44px 이상입니다.
- DSH 프로필(`~/.dsh/profiles/*`)은 손으로 고치지 않습니다. 설치·제거는 사용자가 `install.sh`나 DSH 플러그인 화면으로 합니다.

## 새 플러그인 넣기

1. `plugins/<폴더>/`를 만들고 `package.json` 이름을 `@lyngmn/dsh-<폴더>`로 둡니다. `test` 명령을 넣습니다.
2. `cordis.patch.yml`의 `name`과 화면 번들 `id`를 패키지 이름과 같게 둡니다.
3. 아이콘·`locale/ko.json`·`locale/en.json`을 넣습니다.
4. 루트에서 `npm test`가 통과하는지 봅니다. `install.sh`는 `plugins/`를 스스로 훑으므로 고칠 것이 없습니다.
5. 루트 `README.md`의 표와 `CHANGELOG.md`에 한 줄씩 더합니다.

## 자주 쓰는 명령

| 하는 일 | 명령 |
|---|---|
| 의존성 연결 | `npm install` |
| 전체 시험(키트 규칙 + 모든 플러그인) | `npm test` |
| 빌드(필요한 플러그인만) | `npm run build` |
| 한국어 번역 검사 | `npm run check` |
| 휴대폰 앱 사본 맞추기(`git-stage`의 단계 규칙·Git 읽기를 고친 뒤) | `npm run sync` |
| 설치 미리 보기 | `./install.sh --dry-run` |

## 작업·배포 흐름

1. 검토: 코드는 다른 세션이나 도구가 리뷰합니다. 화면은 사람이 실제 앱에서 봅니다.
2. 넓은 검사: 루트 `npm test`와 `npm run check`를 커밋 전에 한 번 돌립니다. 공개 뒤에는 GitHub Actions가 같은 명령을 돌립니다.
3. 배포 실행기: 서버 배포는 없습니다. 완성본은 Git 태그(`v<버전>`)이고, 사용자는 저장소를 받아 `./install.sh`로 설치합니다.
4. 병합·배포하는 사람: 사용자가 승인한 뒤에만 Push·병합·태그를 합니다.
5. 사용자 승인이 필요한 일: GitHub 저장소 만들기, Push, 태그, npm 공개 등록, 실제 프로필에 `install.sh` 실행, Desktop 재시작.
6. 운영 확인: `./install.sh` 뒤 DSH 플러그인 화면에서 카드마다 아이콘·한국어 제목이 보이고 켜고 끌 수 있는지, 검색 키·예비 키 설정이 이어지는지, Desktop 로그에 오류가 없는지 봅니다.
7. 기록: 키트 전체 변경은 루트 `CHANGELOG.md`, 플러그인 변경은 그 플러그인 `CHANGELOG.md`에 적습니다(없으면 루트에).
8. 되돌리기: `./install.sh --remove` 또는 DSH 플러그인 화면에서 끄기·제거.

## 작업하며 배운 것

키트 전체에 맞는 교훈입니다. 한 플러그인에만 맞는 교훈은 그 플러그인 `AGENTS.md`에 둡니다.

- `dsh` 명령은 PATH에 없고 `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`에 있습니다. `dsh plugin --profile <이름> <pnpm 인자>`는 인자를 프로필 폴더의 pnpm에 넘깁니다. 로컬 폴더는 `link:<절대 경로>`로만 받고, `~/`로 시작하면 패키지 이름으로 읽혀 설치가 안 됩니다. — 처음 2026-11-14 — 지키는 방법: `install.sh`
- DSH 플러그인 카드에는 만든이 칸이 없습니다(제목·설명·아이콘·버전·출처만). 만든이는 패키지 이름의 핸들과 플러그인 마켓 목록의 `author`로만 드러납니다. — 처음 2026-11-14 — 지키는 방법: 패키지 이름 규칙, `test/plugin-card.test.mjs`
- `link:` 설치는 연결한 폴더의 `dependencies`를 받지 않습니다. 런타임 npm 패키지를 쓰는 플러그인(지금은 휴대폰 작업 공간의 `ws`)은 `install.sh`가 키트 루트에서 `npm install --omit=dev`로 받고, 빌드가 필요한 화면은 빌드물을 커밋합니다. — 처음 2026-11-15 — 지키는 방법: `install.sh`, `test/install.test.mjs`, `plugins/handheld/test/web-dist.test.js`
- 같은 플러그인을 옛 이름과 새 이름으로 함께 깔면 `cordis.patch.yml`의 id가 겹칩니다. 이름을 바꿀 때는 옛 이름을 먼저 뺍니다. — 처음 2026-11-14 — 지키는 방법: `install.sh`의 옛 이름 확인
