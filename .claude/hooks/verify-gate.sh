#!/usr/bin/env bash
# Two modes, one script:
#   verify-gate.sh baseline   SessionStart — record the tree fingerprint once per session.
#   verify-gate.sh            Stop — refuse to end the turn while files that `npm run verify`
#                             checks have changed this session and the current tree is not the
#                             one that last passed verify (.cache/verify-ok).
#
# Why a hook: "nothing is done until verify is green" is the one rule CLAUDE.md cannot guarantee.
# Loop protection: checks stop_hook_active and gives up after 3 consecutive blocks with a visible
# warning (Claude Code itself caps Stop hooks at 8 consecutive blocks).
set -u
mode=${1:-stop}
input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // "nosession"')
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0
mkdir -p .cache
base=".cache/session-base-$sid"
fp=$(bash scripts/fingerprint.sh 2>/dev/null || echo "?")

if [ "$mode" = "baseline" ]; then
  [ -f "$base" ] || printf '%s\n' "$fp" > "$base"
  exit 0
fi

stamp=$(cat .cache/verify-ok 2>/dev/null || echo "")
[ "$fp" = "$stamp" ] && exit 0                                   # current tree is verified
[ -f "$base" ] && [ "$fp" = "$(cat "$base")" ] && exit 0         # nothing watched changed this session

cnt_file=".cache/verify-gate-$sid"
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
cnt=$(cat "$cnt_file" 2>/dev/null || echo 0)
[ "$active" = "true" ] || cnt=0
cnt=$((cnt + 1))
printf '%s\n' "$cnt" > "$cnt_file"

if [ "$cnt" -gt 3 ]; then
  jq -n '{systemMessage: "verify-gate: turn ended with UNVERIFIED changes after 3 attempts — npm run verify is still not green for this tree."}'
  exit 0
fi

jq -n --arg r "Files that 'npm run verify' checks changed during this session, but verify has not passed for the current tree. Run 'npm run verify' as its own command, fix what fails, then finish. Do not mark any task complete until it is green. (attempt $cnt of 3)" \
  '{decision: "block", reason: $r}'
exit 0
