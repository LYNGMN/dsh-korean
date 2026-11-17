#!/usr/bin/env bash
# 한국어 DSH 키트 설치기: plugins/ 아래 플러그인을 DSH 프로필에 한 번에 넣거나 뺀다.
#
#   ./install.sh                 Desktop 프로필에 키트 플러그인을 모두 넣는다
#   ./install.sh --remove        키트 플러그인을 모두 뺀다
#   ./install.sh --dry-run       실제로 바꾸지 않고 할 일만 보여 준다
#   ./install.sh --profile web   다른 프로필에 넣는다(기본 desktop)
#   ./install.sh --yes           다른 이름으로 깔린 같은 플러그인을 묻지 않고 뺀다
#
# 같은 플러그인이 다른 이름(@local/korean, 폴더 이름을 바꾸기 전 @lyngmn/dsh-brave-search 등)으로 깔려 있으면 둘이 겹치므로,
# 그 이름을 먼저 빼도 되는지 묻는다. 플러그인 설정·키는 플러그인 id로 저장돼 있어 그대로 남는다.
# 플러그인이 쓰는 npm 패키지(dependencies)가 아직 없으면 넣기 전에 npm install --omit=dev로 받는다.
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"
PROFILE=desktop
MODE=install
DRY=0
YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --remove) MODE=remove ;;
    --dry-run) DRY=1 ;;
    --yes|-y) YES=1 ;;
    --profile) PROFILE="${2:?--profile 뒤에 프로필 이름을 적어 주세요}"; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "모르는 옵션: $1 (도움말: ./install.sh --help)" >&2; exit 2 ;;
  esac
  shift
done

find_dsh() {
  if [ -n "${DSH_BIN:-}" ]; then echo "$DSH_BIN"; return; fi
  local app="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
  if [ -x "$app" ]; then echo "$app"; return; fi
  if command -v dsh >/dev/null 2>&1; then command -v dsh; return; fi
  echo "DSH 명령을 찾지 못했어요. DeepSeek Harness를 설치했는지 확인하거나 DSH_BIN에 dsh 경로를 넣어 주세요." >&2
  exit 1
}
DSH="$(find_dsh)"
PROFILE_JSON="${DSH_HOME:-$HOME/.dsh}/profiles/$PROFILE/package.json"
NODE="$(command -v node || echo "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/bin/node")"

run() {
  echo "  \$ dsh plugin --profile $PROFILE $*"
  if [ "$DRY" = 1 ]; then return 0; fi
  "$DSH" plugin --profile "$PROFILE" "$@"
}

# 프로필에 지금 깔린 패키지 이름들(한 줄에 하나).
installed_names() {
  [ -f "$PROFILE_JSON" ] || return 0
  "$NODE" -e 'const p = require(process.argv[1]); for (const name of Object.keys(p.dependencies ?? {})) console.log(name)' "$PROFILE_JSON"
}

ask() {
  if [ "$YES" = 1 ] || [ "$DRY" = 1 ]; then return 0; fi
  printf '%s [y/N] ' "$1"
  read -r answer
  case "$answer" in y|Y|yes|YES|예|네) return 0 ;; *) return 1 ;; esac
}

done_msg() {
  if [ "$DRY" = 1 ]; then echo "미리 보기라 아무것도 바꾸지 않았어요."; else echo "$1"; fi
}

FOLDERS=()
DIRS=()
NAMES=()
SPECS=()
for dir in "$KIT"/plugins/*/; do
  [ -f "$dir/package.json" ] || continue
  folder="$(basename "$dir")"
  FOLDERS+=("$folder")
  DIRS+=("${dir%/}")
  NAMES+=("@lyngmn/dsh-$folder")
  SPECS+=("link:${dir%/}")
done
if [ ${#NAMES[@]} -eq 0 ]; then
  echo "plugins/ 아래에 플러그인이 없어요." >&2
  exit 1
fi

INSTALLED="$(installed_names)"
has() { printf '%s\n' "$INSTALLED" | grep -qxF "$1"; }

if [ "$MODE" = remove ]; then
  TARGETS=()
  for name in "${NAMES[@]}"; do has "$name" && TARGETS+=("$name"); done
  if [ ${#TARGETS[@]} -eq 0 ]; then
    echo "프로필 '$PROFILE'에 키트 플러그인이 없어요."
    exit 0
  fi
  echo "키트 플러그인 ${#TARGETS[@]}개를 프로필 '$PROFILE'에서 뺄게요."
  ask "계속할까요?" || { echo "그만뒀어요."; exit 0; }
  run remove "${TARGETS[@]}"
  done_msg "끝났어요. DSH를 다시 켜면 반영돼요."
  exit 0
fi

# 플러그인 dependencies 가운데 플러그인 폴더에서 위로 올라가며 찾아도 없는 패키지 이름(한 줄에 하나).
missing_deps() {
  "$NODE" -e '
const { existsSync, readFileSync } = require("node:fs")
const { dirname, join } = require("node:path")
for (const dir of process.argv.slice(1)) {
  const deps = Object.keys(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).dependencies ?? {})
  for (const name of deps) {
    let at = dir
    while (!existsSync(join(at, "node_modules", name, "package.json")) && dirname(at) !== at) at = dirname(at)
    if (!existsSync(join(at, "node_modules", name, "package.json"))) console.log(name)
  }
}' "${DIRS[@]}"
}

MISSING="$(missing_deps | sort -u | tr '\n' ' ')"
if [ -n "${MISSING// /}" ]; then
  echo "플러그인이 쓰는 npm 패키지를 먼저 받을게요: ${MISSING% }"
  echo "  \$ npm install --omit=dev"
  if [ "$DRY" = 0 ]; then
    NPM="${NPM_BIN:-$(command -v npm || true)}"
    if [ -z "$NPM" ]; then
      echo "npm을 찾지 못했어요. Node.js(npm 포함)를 설치한 뒤 다시 실행해 주세요." >&2
      exit 1
    fi
    (cd "$KIT" && "$NPM" install --omit=dev --no-audit --no-fund) || {
      echo "npm 패키지를 받지 못했어요. 인터넷 연결을 확인하고 다시 실행해 주세요." >&2
      exit 1
    }
  fi
fi

# 폴더 이름을 바꾸거나 합친 플러그인의 예전 폴더 이름들(공백으로 나눔).
# search-free는 무료만이 아니라서 search로 바꿈. search-brave·search-exa·search-fallback은
# 2026-11-18 search로 합침(그 전 이름은 brave-search·exa-search).
previous_folders() {
  case "$1" in
    search) echo search-free search-brave search-exa search-fallback brave-search exa-search ;;
  esac
}

# 같은 플러그인의 다른 이름: @local/<폴더>, dsh-<폴더>, 예전 폴더마다 세 이름
OLD=()
for folder in "${FOLDERS[@]}"; do
  candidates=("@local/$folder" "dsh-$folder")
  for previous in $(previous_folders "$folder"); do
    candidates+=("@lyngmn/dsh-$previous" "@local/$previous" "dsh-$previous")
  done
  for old in "${candidates[@]}"; do has "$old" && OLD+=("$old"); done
done
if [ ${#OLD[@]} -gt 0 ]; then
  echo "다른 이름으로 깔린 같은 플러그인이 있어요: ${OLD[*]}"
  echo "그대로 두면 새 이름과 겹쳐요. 설정과 키는 남아요."
  if ask "그 플러그인을 먼저 뺄까요?"; then
    run remove "${OLD[@]}"
  else
    echo "그대로 두면 겹쳐서 설치를 멈출게요." >&2
    exit 1
  fi
fi

echo "키트 플러그인 ${#NAMES[@]}개를 프로필 '$PROFILE'에 넣을게요:"
for name in "${NAMES[@]}"; do echo "  - $name"; done
run add "${SPECS[@]}"
done_msg "끝났어요. DSH 플러그인 화면에서 새로 고침을 누르거나 DSH를 다시 켜면 보여요."
