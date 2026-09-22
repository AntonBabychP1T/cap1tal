@AGENTS.md

# Claude Code layer

Everything above is shared with Codex; this file adds only what Claude Code runs.

## Workflow for any change

1. `/opsx:propose` → artifacts in `openspec/changes/<name>/`.
2. `spec-reviewer` subagent on the change; fix CRITICAL findings before implementing.
3. `/opsx:apply` → task by task; after each task the relevant tests, then `npm run verify`.
4. All tasks done: `verify` green, then the `diff-reviewer` subagent until `PASS`.
5. Commit (the commit hook refuses an unverified tree). Push only when the human asks.
6. Screen touched → `smoke-runner` subagent on the emulator (`.claude/rules/android.md`).
7. `/opsx:archive` only after 4 passes and 6 is green or explicitly recorded as not run.

## Where Claude-specific things live

- `.claude/rules/` — `domain.md`, `database.md`, `testing.md`, `android.md`, loaded on demand
  by path.
- `.claude/agents/` — `spec-reviewer`, `diff-reviewer`, `task-builder`, `smoke-runner`.
- `.claude/skills/` — `auto-work` (parallel lanes in `.claude/worktrees/`, kept out of git by
  `.git/info/exclude`), the `opsx:*` OpenSpec skills, and `repo-code-navigation`
  (a symlink to `.agents/skills/`, shared with Codex).
- `.mcp.json` — `codedb-mcp` via `scripts/codedb-mcp.sh`.
- `.claude/hooks/` — `guard-bash.sh` (destructive git / rm / secrets / unverified commit),
  `guard-migrations.sh` (committed `drizzle/` files), `verify-gate.sh` (SessionStart + Stop:
  no turn ends with watched files changed and `verify` not green).
- `types/expo.d.ts` replaces the gitignored `expo-env.d.ts` so CI `tsc` sees the same types.
