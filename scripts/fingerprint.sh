#!/usr/bin/env bash
# Prints one hash describing the current content of everything `npm run verify` checks.
# Content-based (git blob hashes of tracked + untracked, non-ignored files), so it is
# independent of staging and commits. Used by:
#   - scripts/verify.sh            writes it to .cache/verify-ok after a green run
#   - .claude/hooks/verify-gate.sh compares it to the stamp before letting a turn end
#   - .claude/hooks/guard-bash.sh  compares it to the stamp before `git commit`
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Paths whose change invalidates a verify run. Keep in sync with the gate's "watched" list.
WATCH=(src types drizzle openspec package.json package-lock.json tsconfig.json eslint.config.js vitest.config.mts drizzle.config.ts app.json app.config.ts app.config.js)

existing=()
for p in "${WATCH[@]}"; do [ -e "$p" ] && existing+=("$p"); done
if [ ${#existing[@]} -eq 0 ]; then
  printf 'empty\n'
  exit 0
fi

git ls-files -co --exclude-standard -- "${existing[@]}" \
  | sort -u \
  | while IFS= read -r f; do
      [ -f "$f" ] && printf '%s %s\n' "$f" "$(git hash-object "$f")"
    done \
  | git hash-object --stdin
