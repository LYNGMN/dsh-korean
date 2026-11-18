# 코드 지도

DeepSeek Harness 대화의 **작업 단계** 옆에 **코드 지도** 탭을 더해요. 창이 좁으면 **다른 대화 보기 방식(…)** 메뉴에서 열 수 있어요.

- **어디부터 볼까요?** 코딩을 요청할 때 함수나 파일 이름이 맞으면 DSH가 관련 위치를 최대 3개 참고해요. 탭에서 직접 함수나 파일을 찾고 **사용처**를 누르면 호출 경로와 파일 위치를 볼 수 있어요.
- **함께 확인할 곳** 코딩 요청 전후를 비교해 이번에 바뀐 파일을 보여 줘요. 파일 속 함수와 메서드의 사용 관계를 두 단계까지 살펴봐요. 후보 옆 **검증 요청 넣기**를 누르면 파일 위치를 담은 문장이 입력창에 추가돼요. 기존 초안과 첨부는 그대로 남고, 메시지는 직접 보내요.
- **저장소 전체 변경**을 펼치면 마지막 커밋(HEAD) 이후의 변경 파일과 영향 후보를 볼 수 있어요.

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
