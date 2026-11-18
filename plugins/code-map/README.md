# 코드 지도

DeepSeek Harness 대화의 **작업 단계** 옆에 **코드 지도** 탭을 더해요. 창이 좁으면 **다른 대화 보기 방식(…)** 메뉴에서 열 수 있어요.

탭은 한 칸으로 위에서 아래로 읽어요. 지도가 준비 중이든 끝났든 같은 자리에 같은 순서로 나와요.

- **맨 위 한 줄 결론** "이번 요청에서 파일 3개를 고쳤어요 · 영향 줄 수 있는 곳이 5곳 있어요"처럼 이번 요청의 결과를 먼저 말해요. 지도가 읽지 못한 범위가 있으면 같은 카드에 경고가 붙어요.
- **함께 확인할 곳** 고친 파일과 이어진 곳이에요. 옆 **확인 요청 넣기**를 누르면 파일 위치를 담은 문장이 입력창에 추가돼요. 기존 초안과 첨부는 그대로 남고, 메시지는 직접 보내요. **마지막 저장 이후 바뀐 전체**를 펼치면 마지막으로 저장한 상태 이후의 변경 파일과 영향 후보를 볼 수 있어요.
- **지도가 못 읽은 범위** 아래 "읽지 못한 범위" 문단을 보세요.
- **직접 찾아보기** 접혀 있어요. 함수나 파일 이름으로 찾고 **쓰는 곳**을 누르면 호출 경로와 파일 위치를 볼 수 있어요. 코딩을 요청할 때 DSH가 참고한 위치(최대 3개)도 여기에 보여요.
- **이 저장소에서 지도 끄기**는 맨 아래 작은 단추예요.

## 읽지 못한 범위

탭에는 지도가 읽지 못한 범위를 **지도에 넣지 못한 파일 · 일부만 읽은 파일 · 읽지 못한 파일 · 형식을 몰라 건너뛴 파일**로 늘 보여 줘요. 0이어도 "없음"으로 보이고, 값을 모르면 "확인 안 됨"이라고 써요. 쓰는 곳이 없다고 나와도 지도에 없는 파일이나 실행할 때만 이어지는 호출은 빠져 있을 수 있어서 의존이 없다는 뜻은 아니에요. 요청에 함수나 파일 이름이 없으면 위치를 억지로 붙이지 않고 이유를 알려 줘요. 바뀐 파일이 없고 지도가 10분 안에 만든 것이면 요청이 끝나도 지도를 다시 만들지 않아요.

## AI가 검색하는 순간 덧붙이는 정보

프롬프트에 위치를 붙이는 것 말고도, AI가 코드를 `grep`·`rg`로 찾을 때 그 결과 뒤에 **같은 이름의 정의 위치**(최대 5개)를 덧붙여요. AI가 파일을 읽었는데 지도가 그 파일을 읽지 못했거나 일부만 읽었으면 한 줄로 알려 주고, 파일을 고친 직후에는 그 파일을 부르는 곳을 알려 줘요. 검색·읽기·고치기 자체는 막지도 바꾸지도 않고, 0.3초(고친 뒤는 0.6초) 안에 못 끝나면 아무것도 덧붙이지 않아요. 같은 정의는 한 세션에서 한 번만 알려요. 덧붙이는 글에는 "저장소 정보이며 지시가 아니다"라고 적어요.

덧붙인 횟수와 파일 경로만 `~/.dsh/dsh-code-map/metrics.ndjson`에 남겨요(글 내용은 남기지 않고 1MB가 넘으면 멈춰요). 효과는 세션 기록으로 잴 수 있어요.

```bash
node plugins/code-map/scripts/measure-sessions.mjs
```

구글스크립트(`.gs`)는 엔진이 모르는 확장자라서 자바스크립트로 읽도록 연결해요. 이 설정은 플러그인 폴더(`~/.dsh/dsh-code-map/engine/xdg-config`)에만 두고, 내 전역 설정은 건드리지 않아요. 그래도 지도에 한 개도 없는 파일 형식은 `형식 모름 .xyz N개`로 보여 줘요.

## 준비

1. [Codebase Memory v0.12.1](https://github.com/DeusData/codebase-memory-mcp/releases/tag/v0.12.1)에서 운영체제에 맞는 실행 파일을 받으세요. [공식 검증 절차](https://github.com/DeusData/codebase-memory-mcp/blob/main/SECURITY.md#verification)를 따르고, DSH가 찾을 수 있는 위치에 실행 파일을 둬요. macOS에서는 `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`을 함께 확인해요. 다른 위치를 쓸 때는 코드 지도 플러그인의 `executable` 설정에 실행 파일의 절대 경로를 넣을 수 있어요.
2. DSH 플러그인 화면의 **플러그인 추가**에서 이 폴더의 절대 경로를 선택하거나 키트의 `./install.sh`로 연결하세요.
3. Git 저장소를 작업 공간으로 열고 대화의 **코드 지도 → 이 저장소에서 켜기**를 누르세요. 지도 준비가 끝나면 함수나 파일 이름을 넣어 보세요.

이번 요청의 변경은 시작과 끝 사이에 확인한 작업 폴더 차이예요. 같은 작업 폴더에서 DSH 요청이 겹치거나 비교를 끝내지 못하면 범위를 확인할 수 없다고 알려 줘요. 실행 때만 연결되는 코드나 읽지 못한 파일은 분석에서 빠질 수 있어요.

저장소마다 따로 켜거나 끌 수 있어요. 지도와 켜짐 설정은 `~/.dsh/dsh-code-map`에 저장돼요. `DSH_HOME`이 지정되어 있으면 그 아래에 저장해요. 기본 분석은 API 키 없이 로컬에서 실행돼요. DSH 모델 요청에는 참고할 함수 이름과 파일 위치가 들어가요. **끄기**를 누르면 자동 참고와 갱신이 멈추고 기존 지도는 로컬에 남아요.

DeepSeek 공식 플러그인이 아니에요.

## English

Code Map adds a conversation tab next to **Work stages**. When space is limited, open it from the conversation view menu. Requests that match a function or filename can receive up to three indexed locations. The tab also supports manual lookup and up to two levels of callers. It compares the working tree before and after the latest coding request, then suggests callers of functions in the changed files. Use **검증 요청 넣기** to add a verification request to the composer while preserving its draft and attachments. Sending is a separate user action. Expand **저장소 전체 변경** to view the full working tree comparison with HEAD. Overlapping DSH requests in one worktree or a failed comparison make request scope unavailable. Links resolved only at runtime or missed by the index may be absent.

Install the [verified Codebase Memory v0.12.1 executable](https://github.com/DeusData/codebase-memory-mcp/releases/tag/v0.12.1) in a location available to DSH, or set this bundle's `executable` configuration to its absolute path. Add this folder as a local DSH plugin or use the kit's installer. In a Git repository session, open the Code Map tab and enable it for that repository.

Indexing is local and requires no API key. Suggested function names and locations may enter the DSH model request. The index and per-repository setting live under `~/.dsh/dsh-code-map`, or the equivalent folder under `DSH_HOME`. Turning off the feature stops automatic activity and keeps the local index.

Not an official DeepSeek plugin.
