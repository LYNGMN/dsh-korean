# dsh-enter-keys

DeepSeek Harness(DSH) Desktop 입력창의 엔터 키 동작을 고르게 해 주는 플러그인입니다. DeepSeek 공식 플러그인이 아닙니다.

- **설정 → 일반 → "엔터 키를 누르면"**: 바로 보내기(기본) / 줄바꿈
- **한글 한 번에**: 한글 마지막 글자를 조합하는 중에 엔터 키를 눌러도 한 번에 보냅니다(줄바꿈을 골랐다면 줄 하나만 바꿉니다). DSH 기본 입력창은 이 엔터 키를 조합 확정에만 써서, 두 번 눌러야 보내지거나 줄바꿈이 끼곤 했습니다.

| 누르는 키 | 바로 보내기(기본) | 줄바꿈 |
|---|---|---|
| 엔터 | 보내기 | 줄바꿈 |
| Shift+엔터 | 줄바꿈 | 줄바꿈 |
| Cmd+엔터(Windows는 Ctrl+엔터) | DSH 규칙: 작업 중에는 "작업 중 보내기 방식"의 반대 | 보내기(작업 중에는 같은 DSH 규칙) |

`/`·`@` 자동완성 메뉴가 열려 있으면 엔터 키는 두 설정 모두 항목을 고릅니다. 일본어·중국어처럼 한글이 아닌 조합은 DSH 원래 동작 그대로입니다.

## 설치

1. 키트 루트에서 `./install.sh`로 다른 플러그인과 함께 설치합니다. 이것만 넣으려면 DSH Desktop → 플러그인 → 추가에 이 폴더의 **절대 경로**(`<키트 폴더>/plugins/enter-keys`)를 넣습니다. `~/`로 시작하는 경로는 패키지 이름으로 읽혀 설치되지 않습니다.
2. 플러그인을 켜면 설정 → 일반에 "엔터 키를 누르면" 줄이 생깁니다.

터미널에서는 DSH에 들어 있는 명령으로도 설치할 수 있습니다. 설치와 함께 켜집니다.

```bash
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add link:$PWD
```

## 어떻게 동작하나

DSH는 입력창 엔터 키 처리를 플러그인에 열어 두지 않았습니다. 이 플러그인은 입력창 카드 안 공식 자리(`conversation.input.overlay`)에 보이지 않게 들어가, 그 카드의 편집 칸으로 가는 엔터 키만 먼저 봅니다. 조합을 확정한 엔터 키는 확정이 끝난 뒤 DSH 편집기에 엔터 키 하나로 다시 눌러 주므로, 보내기·메뉴 고르기·작업 중 방식은 모두 DSH가 그대로 정합니다. 자세한 구조는 [docs/architecture.md](docs/architecture.md)에 있습니다.

DSH 업데이트로 입력창 구조가 바뀌면 동작이 멈출 수 있습니다. 그때는 플러그인을 끄면 DSH 원래 동작으로 돌아갑니다.

## 개발

```bash
node scripts/build.mjs
```

```bash
node --test test/*.test.mjs
```

`test/preview.html`은 실제 DSH 없이 설정 줄과 가짜 입력창을 올려 보는 틀입니다. 브라우저로 파일을 바로 열고, `?theme=dark`로 어두운 테마를 봅니다.

## 라이선스

MIT. 아이콘은 Lucide `corner-down-left`(ISC)를 옮겨 칠했습니다.
