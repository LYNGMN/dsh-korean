# dsh-handheld 작업 지침

DeepSeek Harness(DSH)를 휴대폰에서 다루는 개인용 모바일 작업 환경입니다. DSH 플러그인으로 돌아가는 **게이트웨이**와, 휴대폰에 설치해 쓰는 **PWA**로 이루어집니다. DSH 화면을 비추거나 고쳐 쓰지 않고, DSH가 공식으로 여는 API 손님 경로(`/connect`, `/api`, `/api/remote.mux`)만 씁니다.

구조는 [docs/architecture.md](docs/architecture.md), 외부 접속 설정은 [docs/setup-cloudflare.md](docs/setup-cloudflare.md)를 따릅니다.

## 지킬 것

- `shaobeichen/dsh-pocket`(GPL-2.0)은 설계 참고로만 봤습니다. 그 저장소의 코드·CSS·문구를 가져오지 않습니다. 이 저장소는 MIT입니다.
- `/Applications/DeepSeek Harness.app` 안의 파일은 읽기만 합니다.
- DSH 규약(RPC 봉투, mux 프레임, 이벤트 이름)은 `server/dsh/`만 압니다. 게이트웨이·PWA는 우리 규약(`server/protocol.js`)만 씁니다. DSH가 바뀌면 `server/dsh/`와 그 테스트만 고칩니다.
- 게이트웨이는 `127.0.0.1`에만 엽니다. 외부 요청은 Cloudflare Access JWT가 맞을 때만 받습니다(fail-closed). 개발 모드 우회는 루프백 주소에서만 열립니다.
- 승인·질문 답은 사람이 휴대폰에서 직접 누를 때만 보냅니다. 자동 승인 코드를 넣지 않습니다.
- 토큰·쿠키·VAPID 개인키·터널 토큰은 로그와 화면에 내보내지 않습니다. 저장 파일은 0600입니다.
- 서버 의존성은 `ws` 하나입니다. JWT 검증과 Web Push 암호화는 `node:crypto`로 합니다. 새 의존성은 라이선스·유지 상태를 확인한 뒤 이 줄을 고치면서 들입니다.
- 화면 글자는 한국어 기본, `word-break: keep-all`, 입력창 16px 이상, 터치 대상 44px 이상입니다.
- 플러그인 카드에는 아이콘과 한국어 설명을 꼭 넣습니다. 아이콘은 Lucide 아이콘을 36칸 SVG로 옮겨 DSH 파란색 그라데이션(`#3D94EE`→`#3F77D8`)으로 칠하고, 외부 서비스를 잇는 플러그인은 그 서비스의 공식 로고를 씁니다. 출처는 SVG 주석에 남기고, 다른 플러그인 아이콘과 보이는 크기·중심을 `measure-icon-optics.mjs`로 맞춥니다. 제목·설명은 `locale/ko.json`(`meta.title`, `meta.description`, 해요체)과 `locale/en.json`에 두고 `package.json` `exports`에 `./icon`, `./locale/*.json`을 엽니다. — 2026-11-14 사용자 — 지키는 방법: `test/plugin-card.test.*`

## 정해진 결정 (2026-11-14 사용자)

- 조종 대상은 DSH입니다. 외부 접속은 Cloudflare Tunnel + Cloudflare Access입니다.
- 첫 버전 기능은 승인 푸시, diff 보기, IME 안전·음성 입력, 세션 이어보기입니다.
- Desktop 플러그인 설치·제거는 사용자가 키트 `install.sh`나 DSH 플러그인 화면(이 폴더의 절대 경로)으로 직접 합니다. Claude는 프로필 파일을 손으로 고치지 않습니다.

## 자주 쓰는 명령

| 하는 일 | 명령 |
|---|---|
| 의존성 설치 | 키트 루트에서 `npm install` |
| 테스트 | `npm test` |
| PWA 빌드(결과 `web/dist/`도 커밋) | `npm run build` |
| 가짜 DSH로 게이트웨이 띄우기(개발) | `npm run dev` |

## 작업·배포 흐름

1. 검토: 코드는 다른 세션이나 도구가 리뷰합니다. 휴대폰 화면은 사람이 실제 기기에서 봅니다.
2. 넓은 검사: `npm run build`(바뀐 `web/dist/`를 함께 커밋)와 키트 루트 `npm test`를 커밋 전에 한 번 돌립니다.
3. 배포 실행기: 서버 배포는 없습니다. 완성본은 키트의 Git 태그(`v<버전>`)이고, 키트 루트 `./install.sh`로 설치합니다.
4. 병합·배포하는 사람: 사용자가 승인한 뒤에만 Push·병합·태그를 합니다.
5. 사용자 승인이 필요한 일: GitHub 저장소 만들기, Push, 태그, DSH 프로필(`~/.dsh/profiles/desktop`) 설치·제거, Desktop 재시작, Cloudflare 터널·Access 앱 만들기와 바꾸기.
6. 운영 확인: 휴대폰에서 공개 주소로 Access 로그인 → 세션 열기 → 메시지 보내기 → 승인 푸시 받고 거부 → diff 보기. Desktop 로그에 `[dsh-handheld]` 오류가 없는지 봅니다.
7. 기록: 바뀐 내용은 `CHANGELOG.md`에 적습니다.
8. 되돌리기: DSH 플러그인 화면에서 끄거나 제거합니다(키트 전체는 `./install.sh --remove`). 공개 접속만 끊으려면 설정에서 터널을 끄거나 Cloudflare에서 터널을 지웁니다.

## 새 DSH 버전이 나오면

1. `npm test`를 돌립니다. `server/dsh/` 테스트는 녹화한 프레임(`test/fixtures/`)을 씁니다.
2. 실제 Desktop에 올려 세션 열기·보내기·승인 왕복을 확인합니다.
3. 프레임 모양이 바뀌었으면 새 녹화를 `test/fixtures/<버전>/`에 넣고 `server/dsh/`만 고칩니다.

## 작업하며 배운 것

이 프로젝트에만 맞는 교훈입니다. 모든 프로젝트에 맞는 교훈은 `~/Dev/docs/agent-rules-architecture.md`의 공통 지식베이스에 둡니다.

- DSH Desktop도 안에서 웹 서버를 `127.0.0.1:<임의 포트>`로 띄우고, `ctx.connection.authenticatedUrl()`로 토큰 주소를 만들어 Electron에 넘깁니다. 플러그인도 같은 함수로 API 손님(`/connect?interactions=answer`) 자격을 얻을 수 있습니다. — 처음 2026-11-14 — 지키는 방법: `server/plugin.js`
- 플러그인 안에서 `ctx.on('approval/request')` 같은 내부 이벤트에 끼어들지 않습니다. 승인은 `$events` 흐름으로 받고 `$events/result`로 답해야 Desktop 창과 휴대폰이 "먼저 답한 쪽" 규칙을 함께 씁니다. — 처음 2026-11-14 — 지키는 방법: `server/dsh/events.js`
- `package.json`의 `engines.dsh`에 `>=0.2.0 <0.3.0`처럼 쓰면 `0.2.2-rc.3` 같은 시험판 DSH가 조건 밖이 되어 플러그인 추가가 조용히 안 됩니다. `engines.dsh`는 두지 않습니다. — 처음 2026-11-14 — 지키는 방법: `package.json`
- 기본 권한(`workspace-write`)에서는 작업 폴더 안 쓰기에 승인 요청이 오지 않습니다. 승인은 모델이 폴더 밖 작업에 `sandbox_permissions`로 권한 상승을 요청할 때 `approval/request`로 옵니다. 승인 실측은 `scripts/probe.mjs --live --prompt`로 폴더 밖 쓰기를 시켜서 합니다. — 처음 2026-11-14 — 지키는 방법: `scripts/probe.mjs`
- 녹화한 세션에는 `~/.dsh/AGENTS.md` 같은 개인 지침이 `user/message`(source.kind가 user가 아님)로 들어 있습니다. 녹화 원본(`test/fixtures/probe/`)은 커밋하지 않고, `scripts/sanitize-fixtures.mjs`로 거른 것만 `test/fixtures/<버전>/`에 넣습니다. — 처음 2026-11-14 — 지키는 방법: `.gitignore`, `scripts/sanitize-fixtures.mjs`
- 키트는 이 폴더를 빌드 없이 `link:`로 연결하므로 휴대폰 화면은 커밋한 `web/dist/`가 그대로 나갑니다. 소스를 고치면 `npm run build` 결과를 같이 커밋합니다. — 처음 2026-11-15 — 지키는 방법: `test/web-dist.test.js`
- Preact의 `useEffect`는 화면을 그린 뒤에 돌아서, 그 사이에 온 실시간 프레임으로 바뀐 상태를 구독자가 놓칠 수 있습니다. `useStore`는 구독할 때 상태 버전을 비교해 따라잡습니다. — 처음 2026-11-14 — 지키는 방법: `web/src/store.js`
