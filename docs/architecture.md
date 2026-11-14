# 키트 구조

## 1. 무엇을 담는가

DSH 플러그인 여러 개를 저장소 하나에 모은 키트입니다. 플러그인은 서로 코드를 나눠 쓰지 않고, DSH가 하나씩 따로 싣습니다(패키지 하나 = 플러그인 카드 하나).

```
/
├─ install.sh              plugins/*를 DSH 프로필에 한 번에 넣고 뺀다(dsh plugin add/remove)
├─ package.json            npm workspaces(plugins/*), 루트 test·build·check
├─ test/                   키트 공통 규칙 시험, install.sh 시험
├─ docs/install-with-ai.md AI 도구가 따르는 설치·휴대폰 설정 절차
├─ docs/logo.svg           README 머리의 키트 로고(태극 물결을 얹은 고래)
├─ README.md, README.en.md 사용자 안내(한국어·영어)
└─ plugins/<폴더>/          플러그인 하나 = npm 패키지 @lyngmn/dsh-<폴더>
   ├─ package.json         name·author·repository.directory·exports(./icon, ./locale/*.json)
   ├─ cordis.patch.yml     DSH 묶음 설정. name은 패키지 이름, id는 처음 정한 그대로
   ├─ icon.svg, locale/    플러그인 카드 아이콘과 제목·설명
   └─ AGENTS.md 등         그 플러그인만의 구조·규칙(있으면)
```

## 2. 이름과 id

| 무엇 | 규칙 | 바꾸면 |
|---|---|---|
| 패키지 이름 | `@lyngmn/dsh-<폴더>` | 프로필 설치 목록, `cordis.patch.yml`의 `name`, 화면 번들 `id`, 설정 칸 `key`를 같이 바꾼다 |
| 플러그인 id(`cordis.patch.yml`의 `id`) | 처음 정한 그대로(예: `brave-search`, `dsh-korean`) | 사용자 프로필에 저장된 설정 덮어쓰기가 끊긴다. 바꾸지 않는다 |
| 데이터 폴더·로그 접두사 | 처음 정한 그대로 | 저장된 데이터를 못 찾는다 |

루트 `test/plugin-card.test.mjs`가 패키지 이름·`cordis.patch.yml`의 `name`·화면 번들 `id`가 같은지 확인합니다.

## 3. 설치 흐름

1. 사용자가 저장소를 받아 `./install.sh`를 실행합니다.
2. 스크립트는 프로필 `package.json`에서 같은 플러그인이 다른 이름(`@local/<폴더>`, `dsh-<폴더>`)으로 깔려 있는지 찾아, 허락을 받고 `dsh plugin remove`로 뺍니다. 같은 id가 둘이면 겹치기 때문입니다.
3. 플러그인 `dependencies`가 키트 폴더에서 찾아지지 않으면 키트 루트에서 `npm install --omit=dev`로 받습니다. `link:` 연결은 연결한 폴더의 의존성을 받지 않기 때문입니다. 이미 있으면 건너뛰어 개발용 패키지를 지우지 않습니다.
4. `dsh plugin --profile <프로필> add link:<절대 경로>…`로 모든 플러그인을 한 번에 연결합니다. `dsh plugin`은 인자를 프로필 폴더의 pnpm에 넘깁니다.

## 4. 경계

- DSH 앱 파일은 읽기만 합니다.
- 프로필은 사용자가 `install.sh`를 실행하거나 DSH 화면에서 바꿀 때만 바뀝니다. 에이전트가 프로필 파일을 손으로 고치지 않습니다.
- 플러그인 사이에 공용 코드 패키지를 두지 않습니다. 같은 코드가 필요하면 각 플러그인에 둡니다(한 플러그인을 고쳐도 다른 플러그인이 흔들리지 않게).

## 5. 고치는 때

책임·경계·이름 규칙을 바꾸는 변경은 같은 커밋에서 이 문서를 고칩니다.
