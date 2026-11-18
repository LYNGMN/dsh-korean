# 지도 도구 실측: 도구 없음 · Codebase Memory · Trail-code

같은 일을 세 방식으로 시켜 토큰과 호출 수를 비교해요. 효과 수치는 두 도구 모두 저자가 낸 숫자이고 이 저장소 안에서 다시 만들 수 없어서, 내 컴퓨터에서 직접 재는 실험이에요.

## 먼저 알아 둘 것

- 세션마다 AI가 가는 길이 달라서 호출 수가 크게 흔들려요. 이 컴퓨터의 기존 세션도 한 세션의 도구 호출이 55번부터 1,896번까지 달랐어요. 그래서 **같은 요청을 방식마다 똑같이** 넣고, 숫자는 "몇 배"가 아니라 표로만 봐요. 가능하면 방식마다 두 번씩 돌려요.
- 실험은 **복사본**에서 해요. Trail은 지도를 저장소 안 `graft/` 폴더에 만들어서 원본 저장소를 어지럽히지 않으려는 거예요.
- 코드 지도 플러그인은 이 복사본에서 **켜지 마세요**(기본이 꺼짐). 켜면 우리 플러그인의 덧붙이기가 섞여 세 방식 비교가 깨져요.
- 지도 도구가 읽기만 하는지는 도구 이름으로 가려요. Codebase Memory에는 `delete_project`, `index_repository`가 있어요. DSH가 승인을 물으면 **삭제 계열은 거절**하세요.
- `npx`는 npm에서 패키지를 받아 실행해요. 버전을 `0.30.5`로 고정했고(MIT, 별 1.1만 개), 사용 통계는 `DO_NOT_TRACK=1`로 껐어요.
- 읽은 글자 수는 `read` 도구만 세요. AI가 `bash cat`으로 읽으면 "결과글자"에만 들어가요.

## 1. 복사본 만들기

```bash
mkdir -p ~/Dev/gas-exp && cp -R "/Users/youngmin/구글스크립트/gas-project/rss-bot" ~/Dev/gas-exp/rss-bot
```

```bash
cd ~/Dev/gas-exp/rss-bot && git init -q && git add -A && git -c user.name=exp -c user.email=exp@example.com commit -qm "실험 기준"
```

## 2. DSH에 두 서버를 꺼 둔 채로 등록

`~/.dsh/profiles/desktop/cordis.patch.yml`의 `- id: mcp-manager` 항목에는 지금 `exa`만 있어요. 프로필 패치는 `servers` 지도 **전체를 덮어쓰므로** `exa`는 그대로 두고 아래 두 개를 같은 `servers:` 밑에 더하세요. 둘 다 `enabled: false`로 시작해요.

```yaml
      cbm:
        transport: stdio
        command: /Users/youngmin/.local/bin/codebase-memory-mcp
        enabled: false
      trail:
        transport: stdio
        command: npx
        args: ['-y', '@trailhq/trail-code@0.30.5', 'mcp', '/Users/youngmin/Dev/gas-exp/rss-bot']
        env:
          DO_NOT_TRACK: '1'
        enabled: false
```

DSH 설정 화면의 MCP 항목으로도 같은 서버를 추가할 수 있어요. 어느 쪽이든 도구 이름은 `mcp__cbm__…`, `mcp__trail__…`로 보여야 측정 스크립트가 방식을 알아봐요(서버 이름을 `cbm`, `trail`로 써 주세요).

## 3. 세 방식으로 같은 요청 돌리기

방식마다 **새 세션**을 열고 작업 폴더를 `~/Dev/gas-exp/rss-bot`로 해요. 모델과 설정은 똑같이 둬요. 방식을 바꿀 때는 `enabled`만 바꾸고 DSH를 껐다 켜요.

| 방식 | cbm | trail |
|---|---|---|
| 도구 없음 | false | false |
| Codebase Memory | true | false |
| Trail-code | false | true |

요청 세 개(모두 읽기만 해요. 각각 새 세션에서 한 번씩):

1. `rss-bot 폴더에서 applyAiTranslationHeaderStyles_ 함수가 어디 정의돼 있고 어디서 호출되는지 파일:줄로 알려 줘. 코드는 고치지 마.`
2. `safeLoadConfig_ 함수를 고치면 영향이 가는 곳이 어디인지 알려 줘. 코드는 고치지 마.`
3. `showTarget_ 함수가 Settings_Bluesky.html과 Settings_Discord.html에서 어떻게 다른지 설명해 줘. 코드는 고치지 마.`

정답 기준(원본에서 확인함):

| 요청 | 맞는 답 |
|---|---|
| 1 | 정의 `31_LogService.gs:656`, 호출 `31_LogService.gs:1014` 한 곳 |
| 2 | 정의 `Settings_Discord.html:3792`, 호출 3713·3780·3789. `docs/` 백업 파일의 1753은 옛 사본 |
| 3 | 정의 `Settings_Bluesky.html:7492`, `Settings_Discord.html:8448`. 같은 이름의 함수가 두 화면에 각각 있다 |

방식마다 AI가 맞게 답했는지는 위 기준과 대조해 같이 봐요. 틀리게 답했는데 토큰만 적은 방식이 이긴 것처럼 보이면 안 돼요.

## 4. 재기

```bash
node ~/Dev/worktrees/dsh-korean/dsh-feat-code-map-measure/plugins/code-map/scripts/measure-sessions.mjs --cwd gas-exp --since 2026-11-18 --rows
```

- `--rows`는 세션별 한 줄을 보여 줘요(앞 8글자가 세션 번호). 어느 방식에 어느 세션이 들어갔는지 확인하세요.
- 첫 표는 방식별 중앙값이에요. `기록없음`은 세션 기록에 토큰 사용량이 남지 않았다는 뜻이고, 그때는 `결과글자`로 비교해요.
- 지도호출 뒤에 읽기가 따라붙으면(`지도뒤읽기`) AI가 지도 답을 믿지 못하고 파일을 또 읽은 거예요. 많이 읽을수록 절약이 줄어요.

## 5. 끝나면

`cordis.patch.yml`에서 `cbm`, `trail` 항목을 빼거나 `enabled: false`로 두고, 복사본과 Trail 지도 폴더를 지워요.

```bash
rm -rf ~/Dev/gas-exp
```
