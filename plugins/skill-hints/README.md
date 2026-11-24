# skill-hints

DeepSeek Harness(DSH)에서 스킬을 `/이름`으로 고를 때 입력창에 세부 명령 안내가 뜨게 하고, `/` 메뉴의 스킬 설명을 DSH 언어에 맞춰 보여 줍니다.

## 왜 필요한가

DSH는 스킬 머리말의 `argument-hint`를 읽지 않고, `/` 메뉴의 스킬 설명도 원문(대개 영어) 그대로 보여 줍니다. 입력창 안내(`input.hint`)와 언어별 설명은 플러그인이 등록한 명령에만 붙습니다.
그래서 이 플러그인은 사람이 부를 수 있는 스킬마다 같은 이름의 명령을 등록합니다.
명령을 실행하면 `/이름 인자`를 사용자 메시지로 보내고, DSH가 원래 스킬을 그대로 불러옵니다.

## 어떤 스킬이 대상인가

- `~/.dsh/skills`와 `~/.agents/skills`에서 DSH가 읽는 순서대로 찾습니다. 같은 이름이면 앞쪽이 이깁니다.
- `user-invocable: false`가 아닌 스킬은 모두 대상입니다. 힌트가 없는 스킬도 등록하고, 이때는 입력창 안내 없이 설명만 붙습니다.
- 입력창 안내는 실제 `SKILL.md` 머리말의 `argument-hint`, 없으면 `~/.agents/skill-hints.json`의 `hint`를 씁니다.
- 메뉴 설명은 DSH 언어가 한국어면 `~/.agents/skill-hints.json`의 `summary`(없으면 영어), 그 밖의 언어면 실제 `SKILL.md` `description`을 씁니다. 160자를 넘으면 단어 경계에서 줄입니다. DSH 언어를 바꾸면 바로 다시 등록합니다.
- 감싸개(`~/.dsh/skills/<이름>.md`)는 그 안에 적힌 실제 `SKILL.md`에서 힌트와 설명을 읽습니다.
- 같은 이름의 호스트 명령이 이미 있으면 그 명령을 그대로 둡니다.

새 스킬을 넣거나 힌트·요약을 고치면 DSH를 재시작해야 반영됩니다.

## 설치

한국어 DSH 키트의 다른 플러그인과 함께 저장소 루트에서 `./install.sh`로 설치합니다.
이 플러그인만 넣으려면 DSH 플러그인 화면 → **플러그인 추가**에 이 폴더의 절대 경로(`<키트 폴더>/plugins/skill-hints`)를 넣습니다.

## 시험

```bash
~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node --test test/plugin.test.js
```

## 되돌리기

DSH 플러그인 화면에서 이 플러그인을 끄거나 제거합니다. 키트 전체를 빼려면 저장소 루트에서 `./install.sh --remove`를 실행합니다.
