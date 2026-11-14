# dsh-subagent-tree

DeepSeek Harness(DSH) Desktop 왼쪽 사이드바에서 하위 에이전트를 부모 세션 아래에 보여 주는 플러그인입니다. DeepSeek 공식 플러그인이 아닙니다.

- **줄 끝 아이콘**: 하위 에이전트가 있는 세션 줄 끝에 개수가 나옵니다. 실행 중인 자식이 있으면 아이콘이 파랗게 바뀝니다.
- **마우스를 올렸을 때 뜨는 카드**: 자식 목록과 상태(실행 중·끝남·중단됨·대기)가 나오고, 누르면 그 하위 에이전트 세션이 열립니다.
- **자식 줄**: 부모 줄 바로 아래에 연결선·상태 아이콘·제목이 붙은 줄이 나옵니다. 줄에 마우스를 올리면 나오는 화살표로 접고 펼칩니다.

앞의 두 가지는 DSH가 플러그인에게 열어 둔 자리에 들어갑니다. 자식 줄은 그런 자리가 없어 세션 줄 뒤에 직접 붙이므로, DSH가 화면 구조를 바꾸면 자식 줄만 사라질 수 있습니다. 그래도 줄 끝 아이콘과 카드는 그대로 남습니다.

## 설치

1. 키트 루트에서 `./install.sh`로 다른 플러그인과 함께 설치합니다. 이것만 넣으려면 DSH Desktop → 플러그인 → 추가에 이 폴더의 **절대 경로**(`<키트 폴더>/plugins/subagent-tree`)를 넣습니다. `~/`로 시작하는 경로는 패키지 이름으로 읽혀 설치되지 않습니다.
2. 플러그인을 켜면 사이드바에 바로 나타납니다.

터미널에서는 DSH에 들어 있는 명령으로도 설치할 수 있습니다. 설치와 함께 켜집니다.

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add link:$PWD
```

자식 줄만 끄려면 플러그인 설정에서 `nestedRows`를 `false`로 바꿉니다.

## 확인한 DSH 버전

0.2.2-rc.3

## 개발

| 하는 일 | 명령 |
|---|---|
| 화면용 번들 만들기 | `node scripts/build.mjs` |
| 테스트 | `node --test test/*.test.mjs` |
| 미리보기 | 저장소 폴더에서 `python3 -m http.server 8765` 뒤 `http://127.0.0.1:8765/test/preview.html` (`?theme=dark`) |

MIT 라이선스.
