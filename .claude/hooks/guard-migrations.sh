#!/usr/bin/env bash
# PreToolUse hook for Edit|Write. Exit 2 blocks the edit; stderr is shown to Claude.
#
# Rule it enforces (from .claude/rules/database.md): a migration that is already committed is
# immutable — fix the schema and generate a new migration. A permission deny rule cannot express
# "only files that exist in HEAD", so this lives in a hook.
set -u
input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
case "$path" in "$root"/*) rel=${path#"$root"/} ;; *) exit 0 ;; esac
case "$rel" in drizzle/*) ;; *) exit 0 ;; esac

if git -C "$root" cat-file -e "HEAD:$rel" 2>/dev/null; then
  printf 'guard-migrations: %s is a committed migration and is immutable. Change src/db/schema.ts and run "npm run db:generate" to add a new migration instead.\n' "$rel" >&2
  exit 2
fi
exit 0
