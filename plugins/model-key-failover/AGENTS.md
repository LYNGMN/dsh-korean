# model-key-failover

## 문서

- 새 제공자를 추가하는 원칙과 점검표는 `README.md`를 따른다. 같은 내용을 여기에 복사하지 않는다.

## 작업하며 배운 것

- DSH/Cordis의 `ctx.get('service')`는 추적용 Proxy를 돌려준다. 서비스 메서드를 Proxy에 대입하면 일시적인 shadow에만 쓰이고 원본 서비스에는 반영되지 않는다 — 2026-11-14 — `service[Symbol.for('cordis.original')]`로 원본 인스턴스를 얻어 그 위에 대입하고, effect 정리에서 원래 메서드로 되돌린다.
- 메인 키와 사용 중인 키를 같은 credential ref에 두면 예비 키로 넘어갈 때 Models 페이지의 메인 키 칸까지 바뀐다 — 2026-11-14 — 메인 키는 `*_API_KEY`에 그대로 두고, 사용 중인 키는 `*_ACTIVE_KEY`에 기록한 뒤 `credentials.resolve`만 리다이렉트한다.
- 딥시크 공식(`deepseek-official`)은 `llm-deepseek` 네임스페이스의 단일 연결이라 설정의 `providers` 맵 스캔으로 발견되지 않는다 — 2026-11-14 — 호스트는 `ctx.llm.listConfigurableProviders()` 디렉터리와 설정을 함께 읽고, 클라이언트는 `settings.models.provider-card` 슬롯에 `llm-pi-ai`와 `llm-deepseek` 키를 모두 등록한다.
