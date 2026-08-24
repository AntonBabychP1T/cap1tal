#!/usr/bin/env bash
# The single fast verification command: spec validation → lint → typecheck → tests.
# Must finish in under a minute and must not need an emulator or a native build.
# On success it writes .cache/verify-ok so the Claude Code hooks know this exact tree is green.
set -euo pipefail
cd "$(dirname "$0")/.."

step() {
  printf '\n▶ %s\n' "$*"
  "$@"
}

step npm run -s spec:validate
step npm run -s lint
step npm run -s typecheck
step npm run -s test

mkdir -p .cache
bash scripts/fingerprint.sh > .cache/verify-ok
printf '\n✔ verify passed (%s)\n' "$(cat .cache/verify-ok)"
