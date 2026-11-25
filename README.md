<div align="center">

<img src="docs/logo.svg" width="128" height="128" alt="">

# 한국어 DeepSeek Harness 키트

**DeepSeek Harness를 한국어로, 휴대폰에서도.**<br>한국어 언어팩을 비롯한 플러그인 13개를 명령 한 번으로 설치합니다.

<p>
  <a href="https://github.com/LYNGMN/dsh-korean/actions/workflows/check.yml"><img alt="check" src="https://img.shields.io/github/actions/workflow/status/LYNGMN/dsh-korean/check.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=check"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/releases/latest"><img alt="release" src="https://img.shields.io/github/v/release/LYNGMN/dsh-korean?style=flat-square&logo=github&color=3F77D8"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/github/license/LYNGMN/dsh-korean?style=flat-square&color=3D94EE"></a>
  <img alt="macOS" src="https://img.shields.io/badge/platform-macOS-000000?style=flat-square&logo=apple&logoColor=white">
  <a href="https://nodejs.org"><img alt="Node.js" src="https://img.shields.io/badge/node-%E2%89%A522.15-339933?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="CHANGELOG.md"><img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.2--rc.3-3F77D8?style=flat-square"></a>
</p>
<p>
  <a href="https://github.com/LYNGMN/dsh-korean/stargazers"><img alt="stars" src="https://img.shields.io/github/stars/LYNGMN/dsh-korean?style=flat-square&logo=github&color=f5c518"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/forks"><img alt="forks" src="https://img.shields.io/github/forks/LYNGMN/dsh-korean?style=flat-square&logo=github"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/issues"><img alt="issues" src="https://img.shields.io/github/issues/LYNGMN/dsh-korean?style=flat-square&logo=github"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/pulls"><img alt="pull requests" src="https://img.shields.io/github/issues-pr/LYNGMN/dsh-korean?style=flat-square&logo=github"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/LYNGMN/dsh-korean?style=flat-square&logo=git&logoColor=white"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/graphs/contributors"><img alt="contributors" src="https://img.shields.io/github/contributors/LYNGMN/dsh-korean?style=flat-square"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/pulls"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-3D94EE?style=flat-square"></a>
</p>

**한국어** · [English](README.en.md)

[쉬운 설치](#쉬운-설치) · [휴대폰](#휴대폰에서-쓰기) · [상세 설치](#상세-설치)<br>[문제 해결](#문제-해결) · [변경 기록](CHANGELOG.md)

</div>

DeepSeek Harness(DSH)를 한국어로 쓰기 위한 플러그인 모음입니다. 한국어 언어팩을 비롯해 LYNGMN이 만든 플러그인 13개가 들어 있고, 명령 한 번으로 모두 설치합니다. DeepSeek 공식 키트가 아닙니다.

플러그인 이름은 모두 `@lyngmn/dsh-<이름>`입니다. DSH 플러그인 화면에 플러그인마다 카드가 생기고, 하나씩 켜고 끌 수 있습니다.

## 플러그인

<table>
<thead><tr><th width="72">아이콘</th><th align="left" width="220">이름</th><th align="left">하는 일</th></tr></thead>
<tbody>
<tr>
<td align="center"><img src="plugins/korean/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>한국어 언어팩</strong></td>
<td>화면을 한국어로 바꾸고, 본문·코드·터미널 글꼴을 고르게 해요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/handheld/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>휴대폰 작업 공간</strong></td>
<td>휴대폰 앱으로 세션을 이어 보고 메시지를 보내요. 승인 요청을 알림으로 받아 직접 허락하거나 거부해요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/workspace-move/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>작업공간 대화 옮기기</strong></td>
<td>대화를 다른 작업공간으로 옮기거나, 필요 없는 대화를 삭제해요. 옮길 때는 기록·제목·세션 id를 그대로 가져가고, 삭제한 기록은 휴지통으로 보내요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/subagent-tree/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>하위 에이전트 트리</strong></td>
<td>사이드바에서 하위 에이전트를 부모 세션 아래에 묶어 보여 줘요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/plan-view/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>계획 보기</strong></td>
<td>대화 보기 방식에 '계획' 탭을 더해 할 일 목록과 제출된 계획을 한 화면에 띄워 둬요. 멈춘 계획은 단추 하나로 이어서 진행해요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/git-stage/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>작업 단계</strong></td>
<td>대화 보기 방식에 '작업 단계' 탭을 더해 작업실 만들기부터 배포까지 Git 작업이 어디쯤인지, 다음에 무엇을 승인해야 하는지 보여 줘요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/code-map/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>코드 지도</strong></td>
<td>작업 단계 옆에서 관련 코드와 변경 뒤 함께 확인할 곳을 보여 주고, 지도가 읽지 못한 범위도 알려 줘요. Codebase Memory 실행 파일이 필요해요. <a href="plugins/code-map/README.md">설치 안내</a></td>
</tr>
<tr>
<td align="center"><img src="plugins/search/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>검색</strong></td>
<td>Exa·Brave·네이버·카카오를 비롯한 여러 웹검색 엔진과, 정한 순서로 차례로 쓰는 자동 엔진(<code>auto</code>), 엔진 고르기 창이 있는 <code>/search</code> 명령을 더해요. 엔진별 키·순서·결과 수는 플러그인 페이지에서 정해요.<br>이번 검색만 바꾸려면 <code>/search naver 30 서울 날씨</code>나 <code>/search exa max 서울 날씨</code>처럼 써요.<br>키 없이: You.com·Parallel·Keenable·Tavily·Firecrawl·Bing<br>키 필요: Exa·Brave·네이버·카카오·TinyFish·Jina<br>묶음: 한국(네이버+카카오) <code>/search ko</code>·<code>ko-group</code>·<code>ko-seq</code><br>예전 Brave Search·Exa Search·검색 자동 전환을 합쳤어요. <code>/brave</code>·<code>/exa</code>와 <code>brave_search</code>·<code>exa_search</code>는 그대로 써요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/agy-commands/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>Antigravity 명령</strong></td>
<td>계획·목표·인터뷰·부스트·팀워크용 <code>/agy</code> 명령이에요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/enter-keys/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>엔터 키 설정</strong></td>
<td>입력창에서 엔터 키를 누르면 바로 보낼지 줄을 바꿀지 골라요. 한글을 치다가 누른 엔터 키도 한 번에 처리해요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/skill-hints/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>스킬 힌트</strong></td>
<td>입력창에 /스킬을 치면 뒤에 회색 입력 안내를 보여 주고, 스킬 메뉴 설명을 DSH 언어에 맞춰요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/footnote-hover/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>각주 미리보기</strong></td>
<td>각주 번호에 마우스를 올리면 내용을 미리 보여 줘요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/path-links/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>경로 바로가기</strong></td>
<td>마크다운 미리보기의 절대 경로를 누르면 그 파일을 새 탭으로 열고, 옆 ↗로 Finder에서 보여 줘요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/model-key-failover/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>모델 예비 키</strong></td>
<td>쓰던 API 키가 막히면 예비 키로 넘어가요.</td>
</tr>
<tr>
<td align="center"><img src="plugins/auto-review-resilience/icon.svg" width="40" height="40" alt=""></td>
<td nowrap><strong>자동 검토 복구</strong></td>
<td>자동 검토가 레이트 리밋으로 실패하면 다시 시도하고, 그래도 안 되면 직접 승인을 물어요.</td>
</tr>
</tbody>
</table>

## 쉬운 설치

### AI에게 맡기기

DSH, Claude Code, Codex 같은 AI 도구에 아래 글을 그대로 붙여 넣습니다. AI가 단계마다 할 일을 먼저 말하고, 허락이 필요한 곳에서는 묻습니다.

```text
https://raw.githubusercontent.com/LYNGMN/dsh-korean/main/docs/install-with-ai.md 를 읽고, 그 안내대로 한국어 DSH 키트를 설치해 줘. 단계마다 무엇을 하는지 먼저 말해 주고, 허락이 필요한 곳에서는 물어봐 줘.
```

휴대폰에서도 쓰려면 끝에 한 줄을 더합니다.

```text
휴대폰에서도 쓸 수 있게 설정까지 해 줘.
```

AI가 따르는 절차는 [AI 설치 안내서](docs/install-with-ai.md)에 있습니다.

### 명령 세 줄

터미널에서 차례로 실행합니다.

```bash
git clone https://github.com/LYNGMN/dsh-korean.git ~/dsh-korean
```

```bash
cd ~/dsh-korean
```

```bash
./install.sh
```

끝나면 DSH를 완전히 끄고(⌘Q) 다시 켭니다.

## 휴대폰에서 쓰기

휴대폰 작업 공간을 켜면 집 밖에서도 휴대폰으로 DSH 세션을 보고, 메시지를 보내고, 승인 요청을 알림으로 받습니다. 접속은 Cloudflare 터널을 거치고, Cloudflare Access로 로그인한 사람만 들어옵니다.

- **쉬운 길**: 위 AI 프롬프트에 "휴대폰에서도 쓸 수 있게 설정까지 해 줘."를 붙입니다. 터널 만들기, 토큰 저장, 설정 저장, 연결 확인은 AI가 합니다.
- **사람이 직접 할 일**
  1. 브라우저에서 Cloudflare에 로그인하고 도메인 고르기
  2. Cloudflare 화면에서 Access 앱 만들기(AI가 누를 곳을 안내합니다)
  3. DSH 다시 켜기
  4. 휴대폰에서 주소 열기 → 홈 화면에 추가 → 설정에서 알림 켜기
- **필요한 것**: Cloudflare 계정과 Cloudflare에 연결된 도메인. 터널과 Access는 Cloudflare Zero Trust 무료 요금제로 쓸 수 있고, 도메인 비용은 따로 듭니다.
- **직접 설정하기**: [Cloudflare 안내서](plugins/handheld/docs/setup-cloudflare.md)

## 상세 설치

### 준비물

- macOS와 DeepSeek Harness 앱(`/Applications/DeepSeek Harness.app`)
- Git
- Node.js 22.15 이상과 npm. 휴대폰 작업 공간이 쓰는 npm 패키지를 처음 한 번 받습니다.
- 휴대폰에서 쓰려면: Cloudflare 계정, Cloudflare에 연결된 도메인, `cloudflared`(`brew install cloudflared`)

### 1. 받기

```bash
git clone https://github.com/LYNGMN/dsh-korean.git ~/dsh-korean
```

다른 곳에 받아도 됩니다. 설치는 이 폴더를 가리키는 연결이라, 폴더를 지우거나 옮기면 플러그인이 사라집니다. 받은 자리에 그대로 둡니다.

### 2. 미리 보기

```bash
cd ~/dsh-korean && ./install.sh --dry-run
```

실제로는 아무것도 바꾸지 않고 할 일만 보여 줍니다. 넣을 플러그인, 먼저 뺄 플러그인, 받을 npm 패키지가 나옵니다.

### 3. 설치

```bash
./install.sh
```

- 플러그인이 쓰는 npm 패키지가 없으면 먼저 받습니다. 인터넷 연결이 필요합니다.
- 같은 플러그인이 다른 이름으로 깔려 있으면 겹치지 않게 먼저 뺄지 묻습니다. 설정과 키는 그대로 남습니다.
- `--profile <이름>`으로 Desktop 말고 다른 DSH 프로필에 넣을 수 있습니다.

### 4. 확인

DSH를 완전히 끄고(⌘Q) 다시 켭니다. 플러그인 화면에 카드 13개가 아이콘과 한국어 제목으로 보이면 설치된 것입니다. 화면이 한국어가 아니면 **설정 → 일반 → 언어**에서 한국어를 고릅니다.

### 하나만 설치하기

DSH 플러그인 화면 → **플러그인 추가**에 `plugins/<폴더>`의 절대 경로를 넣습니다. 예: `/Users/<사용자>/dsh-korean/plugins/korean`. `~/`로 시작하는 경로는 받지 않습니다.

### 추천 글꼴

한국어 언어팩은 본문 Pretendard, 코드 D2Coding, 터미널 IBM Plex Mono를 추천합니다. 글꼴은 키트에 들어 있지 않으니 따로 설치합니다.

```bash
brew install --cask font-pretendard font-d2coding font-ibm-plex-mono
```

글꼴은 **설정 → 일반**에서 고릅니다. 설치된 글꼴만 목록에 보입니다.

## 업데이트

```bash
cd ~/dsh-korean && git pull
```

그다음 DSH를 다시 켭니다. 새 플러그인이 더해진 판이면 `./install.sh`를 한 번 더 실행합니다.

## 빼기

```bash
cd ~/dsh-korean && ./install.sh --remove
```

플러그인 하나만 끄려면 DSH 플러그인 화면에서 그 카드를 끕니다.

## 문제 해결

| 증상 | 할 일 |
|---|---|
| 카드가 안 보인다 | 플러그인 화면에서 새로 고침을 누르거나 DSH를 완전히 껐다 켭니다. |
| `npm을 찾지 못했어요` | Node.js를 설치한 뒤 `./install.sh`를 다시 실행합니다. |
| 휴대폰 주소가 열리지 않는다 | [Cloudflare 안내서](plugins/handheld/docs/setup-cloudflare.md)의 "잘 됐는지 확인하기"를 봅니다. |
| iPhone에서 알림 버튼이 없다 | Safari 탭이 아니라 홈 화면 아이콘으로 엽니다. |

해결되지 않으면 [이슈](https://github.com/LYNGMN/dsh-korean/issues)에 증상과 DSH 판을 적어 주세요. 토큰·이메일·주소 같은 개인 값은 적지 않습니다.

## 만드는 사람을 위해

- 구조: [docs/architecture.md](docs/architecture.md)
- 작업 규칙: [AGENTS.md](AGENTS.md)
- 전체 시험: `npm install && npm test`
- 번역 검사: `npm run check`

## 기여자

<a href="https://github.com/LYNGMN/dsh-korean/graphs/contributors"><img src="https://contrib.rocks/image?repo=LYNGMN/dsh-korean" alt="기여자 목록"></a>

## 스타 추이

<a href="https://star-history.com/#LYNGMN/dsh-korean&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=LYNGMN/dsh-korean&type=Date&theme=dark">
    <img alt="스타 추이 그래프" src="https://api.star-history.com/svg?repos=LYNGMN/dsh-korean&type=Date" width="600">
  </picture>
</a>

## 라이선스

MIT. 플러그인마다 자기 `LICENSE`·`NOTICE`가 있으면 그것을 따릅니다.
