# 모델 예비 키 — 제공자 추가 원칙

이 문서는 새 모델 제공자를 추가할 때 예비 키 기능이 자동으로 붙게 하는 기준입니다.
**플러그인 코드는 고치지 않습니다.** 아래 이름 규칙만 지키면 됩니다.

## 한 줄 원칙

> 제공자는 **계정 로그인이 아니라 이름 있는 API 키(`apiKeyEnv`)** 로 인증하고,
> 키 이름을 **`<PROVIDER>_API_KEY`** 로 맞춘다.

이렇게 추가하면 설정 → 모델 카드에 `모델 예비 키` 패널이 자동으로 나타나고,
메인 키는 1번, 예비 키는 2~5번, 실제 사용 키는 `*_ACTIVE_KEY`에 따로 기록됩니다.

딥시크 공식(`deepseek-official`)은 이미 `DEEPSEEK_API_KEY`로 선언되어 있어서
별도 설정 없이 같은 패널이 붙습니다. 설정 → 모델의 **DeepSeek** 카드에서
메인 키를 입력하고, 그 아래 예비 키 2번부터 넣으면 됩니다.

## 1. 새 제공자 추가 절차

1. **설정 → 모델 → 제공자 추가**에서 제공자를 만듭니다.
2. **API 키를 입력해 저장**합니다. `apiKeyEnv`가 아직 없으면 이때 프로필에 기록됩니다.
   - 카드가 `configured` 상태여야 예비 키 패널이 보입니다. 보통 API 키를 저장하면 됩니다.
3. 카드 아래에 **`모델 예비 키`** 패널이 생겼는지 확인합니다.
4. 2번 키부터 예비 키를 입력하고 **키 저장**을 누릅니다.
5. 대화창에서 `/model-keys-status <route>`로 상태를 확인합니다.

프로필 파일(`~/.dsh/profiles/desktop/cordis.patch.yml`)에 직접 추가할 때는
기존 `llm-pi-ai` 항목의 `config.providers` 아래에 `apiKeyEnv`를 선언합니다.

```yaml
# 기존 llm-pi-ai 항목의 config.providers 아래에 추가
providers:
  newprovider:
    displayName: New Provider
    apiKeyEnv: NEWPROVIDER_API_KEY   # 이 이름이 기준
    api: openai-completions
    baseURL: https://api.example.com/v1
    models:
      - id: some-model
        name: Some Model
        contextWindow: 131072
```

- `apiKey`처럼 **키 값을 프로필에 직접 쓰지 않습니다.**
- `apiKeyEnv`가 없으면 이 플러그인은 그 제공자를 예비 키 대상으로 보지 않습니다.
- 키 값은 설정 → 모델 화면이나 자격 증명 저장소에만 둡니다.

## 2. 이름 규칙

`ACME_API_KEY`를 예로 들면:

| 참조 | 의미 |
| --- | --- |
| `ACME_API_KEY` | 메인 키. 설정 → 모델의 API 키 칸이 쓰는 곳 |
| `ACME_API_KEY_1` | 메인 키의 사본(1번 슬롯) |
| `ACME_API_KEY_2` … `_5` | 예비 키 2~5번 |
| `ACME_ACTIVE_KEY` | 지금 실제로 쓰는 키 |

딥시크 공식은 `ACME` 자리에 `DEEPSEEK`이 들어간다고 보면 됩니다
(`DEEPSEEK_API_KEY`, `DEEPSEEK_API_KEY_2`, `DEEPSEEK_ACTIVE_KEY` …).

- 이름은 영문 대문자·숫자·밑줄만 쓰고 문자로 시작합니다(`^[A-Za-z_][A-Za-z0-9_]*$`).
- 설정 → 모델에서 새 제공자를 추가하면 route 이름에서 `<ROUTE>_API_KEY`가 자동으로 만들어집니다
  (하이픈은 `_`로 바뀝니다). 직접 프로필에 추가할 때도 같은 이름을 쓰면 됩니다.
- `_API_KEY`로 끝나지 않는 이름도 동작하지만, 그때 활성 키 이름은 `<이름>_ACTIVE`가 됩니다.
  패널도 같은 규칙을 쓰므로 가능하면 `_API_KEY`로 통일하세요.
- 제공자(route) 하나에 키 참조 하나를 씁니다. 다른 제공자와 같은 참조를 공유하지 않습니다.
- 한 번 정한 `apiKeyEnv`는 가급적 바꾸지 않습니다. 이름을 바꾸면 예전 슬롯(`_1`~`_5`)과
  `_ACTIVE_KEY`가 고아가 됩니다. 꼭 바꿔야 하면 키를 먼저 옮기고 이름을 바꿉니다.

## 3. 동작 원칙

- **API 키 칸 = 1번 키(메인).** 예비 키로 넘어가도 이 칸의 값은 바뀌지 않습니다.
- 제공자 목록은 어댑터가 등록한 디렉터리와 설정의 `providers` 맵을 함께 읽어서 만듭니다.
  그래서 딥시크 공식처럼 `providers` 맵이 없는 단일 연결 제공자도 자동으로 잡힙니다.
- 실제 사용 키는 `*_ACTIVE_KEY`에 기록하고, 모델이 키를 읽는 순간에만 그 값으로 바꿔 끼웁니다.
- 키 문제(401·403·402·429, quota/auth/rate-limit)일 때만 다음 키로 넘어갑니다.
  문맥 초과, 잘못된 요청, 취소, 네트워크 오류는 키를 바꿔도 해결되지 않으므로 전환하지 않습니다.
- 요청 제한(429)은 기본 60초, 거절·한도 초과는 기본 6시간 쉬었다가 다시 시도합니다.
  모든 키가 막히면 마지막 오류를 그대로 보여 줍니다.
- 예비 키는 제공자(route) 단위로 공유됩니다. 같은 route의 모든 모델이 같은 키 묶음을 씁니다.
- 특정 route만 예비 키를 끄려면 `cordis.patch.yml`의 `exclude`에 route 이름을 넣습니다.

```yaml
config:
  exclude: [some-route]
```

## 4. 추가 후 확인 체크리스트

- [ ] 카드에 `모델 예비 키` 패널이 보인다.
- [ ] 위 API 키 칸이 메인 키(1번)이다. 패널에는 1번 입력칸이 따로 없다.
- [ ] 예비 키를 저장하면 `예비 키 N개 저장됨`이 보인다.
- [ ] 예비 키 입력칸에 앞·뒤가 보이는 마스크가 표시된다.
- [ ] `/model-keys-status <route>`에서 1번이 `active` 또는 `ready`로 보인다.
- [ ] 메인 키가 막혔을 때 2번 키로 넘어가고, **메인 키 칸은 그대로**다.
- [ ] `/model-keys-sync <route>`로 메인 키(1번)로 돌아온다.

저장 직후 active 표시가 잠시 비어 있을 수 있습니다. 다음 요청을 보내거나
`/model-keys-status <route>`를 한 번 실행하면 1번 슬롯이 채워집니다.

## 5. 자주 하는 실수와 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| 예비 키 패널이 안 보인다 | `apiKeyEnv`가 있는가, 키를 저장해 카드가 configured가 되었는가, `llm-pi-ai` 카드인가 |
| `키 상태를 읽지 못했어요` | 자격 증명 서비스가 아직 준비되지 않았거나 읽기 전용이다. 화면을 새로고침한다 |
| `2번 키 사용 중`인데 메인 키 칸은 그대로다 | 정상이다. 마지막에 쓰던 키가 2번이라는 뜻이다. 메인으로 돌아가려면 `/model-keys-sync <route>` |
| 예비 키로 안 넘어간다 | 401·403·402·429 계열인지 확인한다. 네트워크/문맥/취소 오류는 전환 대상이 아니다 |
| 키를 바꿨는데 예전 키가 쓰인다 | 설정에서 저장했는지, `/model-keys-status <route>`의 active가 맞는지 확인한다 |
| 새 제공자만 패널이 없다 | `apiKeyEnv`가 없는 제공자(계정 로그인/OAuth)는 예비 키 대상이 아니다. 딥시크 공식은 `llm-deepseek` 카드인지 확인한다 |

## 6. 제약

- 패널은 예비 키 **4개(2~5번)** 까지 보여 줍니다. `spareSlots`를 바꾸려면
  `client.js`의 `SPARE_SLOTS`도 함께 바꿔야 합니다.
- 패널은 `llm-pi-ai`(사용자 정의 제공자)와 `llm-deepseek`(딥시크 공식) 카드에 붙습니다.
  계정 로그인/OAuth로만 인증하는 제공자(예: `deepseek-account`)는 대상이 아닙니다.
- 키는 DSH 자격 증명 저장소(보통 `~/.dsh/.credentials.yaml`, 파일 권한 600)에 저장됩니다.
  채팅, 프로필, 문서에 실제 키를 붙여넣지 마세요.

## 7. 관련 파일과 명령

- `index.js` — 호스트 쪽: 제공자 발견, 활성 키 리다이렉트, 실패 전환
- `client.js` — 설정 화면 패널: 키 저장, 마스크 표시, active 표시
- `failover-core.js` — 키 이름 규칙(`activeRefFor`), 제공자 발견, 실패 분류
- `test/failover.test.mjs` — 새 제공자 자동 발견, 메인 키 보존, 상태 복구 테스트
- 명령: `/model-keys-status`, `/model-keys-describe`, `/model-keys-next`, `/model-keys-sync`, `/model-keys-set`
