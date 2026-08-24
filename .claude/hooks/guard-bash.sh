#!/usr/bin/env bash
# PreToolUse hook for the Bash tool. Exit 2 blocks the command; stderr is shown to Claude.
#
# Why a hook and not only permission rules: Bash deny patterns are prefix matches and are
# bypassable (/bin/rm, find -delete, wrappers, compound commands). The deny list in
# .claude/settings.json stays as the first layer; this script is the guarantee.
set -u
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0
# Flatten newlines; strip quoted substrings so text ABOUT commands ("echo 'git push'") doesn't
# trigger. This guards against accidents, not adversarial quoting.
c=$(printf '%s' "$cmd" | tr '\n' ' ' | sed -e "s/'[^']*'//g" -e 's/"[^"]*"//g')

block() { printf 'guard-bash: blocked — %s\n' "$1" >&2; exit 2; }
has()   { grep -Eq "$1" <<<"$c"; }

# Word boundary: start, separators, subshell, backtick.
B='(^|[;&|([:space:]`])'
# `git`, then any flags (with or without an argument, e.g. -C <dir>, -c k=v, --no-pager), then space.
GIT="${B}git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+"

# Plain `git push` (main included) passes through to the permission layer, where an ask rule
# prompts the human on every push. Destructive push variants stay hard-blocked here.
has "${GIT}push[^;&|]*(--delete|--mirror|--prune|[[:space:]]\+|[[:space:]]:[^[:space:]])" \
  && block "deleting or force-updating remote refs is not allowed"
has "${GIT}(reset[[:space:]]+--(hard|merge)|clean([[:space:]]|$)|branch[[:space:]]+-[dD]|filter-branch|filter-repo|update-ref[[:space:]]+-d|reflog[[:space:]]+expire)" \
  && block "history- or worktree-destroying git command; make a new commit or ask the human"
has "${GIT}[^;&|]*(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))" \
  && block "forced git operations are not allowed"
has "${GIT}(checkout|restore)[^;&|]*[[:space:]]--[[:space:]]+\.([[:space:]]|$)|${GIT}restore[[:space:]]+\.([[:space:]]|$)" \
  && block "discarding the whole worktree is not allowed; restore named files or ask the human"

# Destructive filesystem / privilege / remote-code patterns.
has "${B}(/bin/|/usr/bin/)?rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)" \
  && block "recursive rm; delete specific files by name or ask the human"
has 'find[[:space:]][^;&|]*(-delete|-exec[[:space:]]+(/bin/)?rm)' \
  && block "find -delete / -exec rm; delete specific files by name or ask the human"
has "${B}sudo([[:space:]]|\$)" \
  && block "sudo is not available to the agent"
has '(curl|wget)[^|;&]*\|[[:space:]]*(ba|z|da)?sh([[:space:]]|$)' \
  && block "piping a download into a shell is not allowed"

# Database and release operations that the human owns.
has 'drizzle-kit[[:space:]]+(drop|push|migrate)' \
  && block "drizzle-kit drop/push/migrate are not used here: migrations are generated with 'npm run db:generate' and applied by the app at startup"
has "${B}(npm|pnpm|yarn)[[:space:]]+publish" \
  && block "publishing is done by the human"
has "${B}(npx[[:space:]]+)?eas[[:space:]]+(submit|build|update)" \
  && block "EAS build/submit/update are run by the human"

# Commit gate: a tree may only be committed in the exact state that last passed `npm run verify`.
if has "${GIT}commit([[:space:]]|$)"; then
  root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
  fp=$(bash "$root/scripts/fingerprint.sh" 2>/dev/null || echo "?")
  stamp=$(cat "$root/.cache/verify-ok" 2>/dev/null || echo "")
  [ "$fp" = "$stamp" ] \
    || block "this tree has not passed 'npm run verify' in its current state; run it as its own command first, fix failures, then commit"
fi

exit 0
