# 휴대폰에서 접속하기: Cloudflare 터널 + Access

[English](setup-cloudflare.en.md)

휴대폰이 집 밖에서도 이 Mac의 DSH에 닿게 하는 설정입니다. 게이트웨이는 이 Mac 안(`127.0.0.1:3090`)에서만 열리고, 바깥 요청은 Cloudflare를 거쳐 로그인한 사람만 들어옵니다.

```text
휴대폰 ──https──▶ Cloudflare Access(로그인) ──▶ 이름 있는 터널 ──▶ 이 Mac 127.0.0.1:3090
```

AI 도구에 맡기려면 키트의 [AI 설치 안내서](../../../docs/install-with-ai.md)를 쓰세요. 아래는 사람이 직접 하는 방법입니다.

## 준비물

- Cloudflare 계정과, Cloudflare에 연결된 도메인 하나(예: `example.com`)
- 이 Mac의 `cloudflared`. 없으면 `brew install cloudflared`로 설치합니다.
- 휴대폰에서 쓸 주소 하나를 정합니다. 예: `dsh.example.com`

## 1. 터널 만들기

두 방법 중 하나를 고릅니다. 결과는 같습니다.

### 방법 A: 명령줄 (빠름)

```bash
cloudflared tunnel login
```

브라우저가 열리면 Cloudflare에 로그인하고 쓸 도메인을 고릅니다. 그다음:

```bash
cloudflared tunnel create dsh-handheld
```

```bash
cloudflared tunnel route dns dsh-handheld dsh.example.com
```

터널 토큰은 화면에 띄우지 않고 바로 파일에 저장합니다.

```bash
(umask 077 && mkdir -p ~/.dsh/dsh-handheld && cloudflared tunnel token dsh-handheld > ~/.dsh/dsh-handheld/tunnel-token)
```

이 방법으로 만든 터널은 플러그인이 게이트웨이 주소(`--url http://127.0.0.1:3090`)를 직접 넘겨 줍니다. 따로 설정할 것이 없습니다.

### 방법 B: Cloudflare 화면

1. Cloudflare 대시보드 → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. 종류는 **Cloudflared**, 이름은 `dsh-handheld`
3. 설치 안내 화면에 나오는 명령에서 `--token` 뒤의 긴 값이 **터널 토큰**입니다. 복사만 해 두고, 안내된 설치 명령은 실행하지 않습니다(플러그인이 직접 실행합니다). 토큰은 3단계에서 넣습니다.
4. **Public hostname** 추가
   - Subdomain `dsh`, Domain `example.com`
   - Service: `HTTP` · `127.0.0.1:3090`

## 2. Access 앱 만들기 (Cloudflare 화면)

1. **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. Application domain: `dsh.example.com` (경로 비움)
3. 정책(Policy): **Allow**, Include → **Emails** → 휴대폰에서 로그인할 이메일
4. 만든 뒤 앱의 **Overview**에서 **Application Audience (AUD) Tag**를 복사합니다.
5. 팀 도메인은 **Settings** → **Custom pages** 위쪽 또는 로그인 주소에 보이는 `<팀이름>.cloudflareaccess.com`입니다.
6. (권장) 로그인 방식에 패스키나 일회용 코드를 켭니다. 세션 시간은 24시간 정도가 휴대폰에서 쓰기 편합니다.

## 3. 이 Mac에 값 넣기

키트 폴더에서 설정 도우미를 실행합니다.

```bash
node plugins/handheld/scripts/configure.mjs
```

물어보는 순서대로 휴대폰 주소, 팀 도메인, AUD 태그, 허용 이메일, 터널 토큰을 넣습니다. 터널 토큰은 화면에 보이지 않게 입력되고 `~/.dsh/dsh-handheld/tunnel-token`(본인만 읽기)에 저장됩니다. 방법 A로 이미 저장했다면 토큰은 빈칸으로 둡니다.

질문 없이 한 줄로 넣을 수도 있습니다. 이때 터널 토큰 파일은 그대로 둡니다.

```bash
node plugins/handheld/scripts/configure.mjs --origin https://dsh.example.com --team myteam.cloudflareaccess.com --aud <AUD 태그> --emails me@example.com
```

그다음 DSH Desktop을 다시 시작합니다.

## 4. 휴대폰에서

1. 휴대폰 브라우저로 `https://dsh.example.com/h/`를 열고 Access로 로그인합니다.
2. **홈 화면에 추가**합니다.
   - iPhone: Safari 공유 버튼 → 홈 화면에 추가. 알림은 iOS 16.4 이상에서, 홈 화면 아이콘으로 열었을 때만 옵니다.
   - Android: Chrome 메뉴 → 앱 설치
3. 홈 화면 아이콘으로 열고 **설정 → 알림 켜기 → 시험 알림**을 누릅니다. 알림 하나로 승인 요청과 질문을 함께 받습니다.

## 잘 됐는지 확인하기

- 터미널에서 `curl -sI https://dsh.example.com/h/`를 실행하면 `302`와 함께 `cloudflareaccess.com` 로그인 주소로 넘어갑니다.
- 휴대폰에서 세션을 열고 메시지를 보냈을 때 Mac의 DSH에도 나타나면 연결된 것입니다.
- 작업 폴더 밖에 파일을 쓰라고 시키면 휴대폰에 승인 요청 알림이 옵니다.

## 안전 장치

- 게이트웨이는 Access가 서명한 로그인 표(JWT)를 직접 검사합니다. 표가 없거나, 다른 앱의 것이거나, 허용 이메일이 아니면 거부합니다. Access 설정이 비어 있으면 바깥 요청은 모두 거부됩니다.
- 글 보내기·승인 같은 쓰기 요청과 실시간 연결은 출처(Origin)가 설정한 휴대폰 주소와 같아야 합니다.
- 승인은 휴대폰에서 사람이 누를 때만 나갑니다. Android 알림의 허용·거부 버튼도 사람이 누른 것입니다.
- 터널 토큰·알림 서명 키는 `~/.dsh/dsh-handheld/` 안에 본인만 읽을 수 있게(0600) 저장되고 로그에 나오지 않습니다.

## 끄기·되돌리기

- 바깥 접속만 끄기: `~/.dsh/dsh-handheld/config.json`에서 `"tunnel": false`로 바꾸고 Desktop 재시작, 또는 Cloudflare에서 터널 삭제
- 플러그인 전체 끄기: DSH 플러그인 화면에서 휴대폰 작업 공간 카드를 끄거나 제거
