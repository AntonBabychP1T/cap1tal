# cap1tal

Personal money tracker for one person on one phone. Product truth lives in
`docs/product-vision.md` and `docs/glossary.md` — read them before touching domain code.
Work is spec-driven with OpenSpec; specs in `openspec/specs/` are the source of truth for behaviour.

Stack (decided, do not relitigate): Expo / React Native, TypeScript, SQLite + Drizzle ORM, npm,
Android first (iOS must stay possible).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run verify` | The gate: `openspec validate` → lint → typecheck → tests. < 1 min, no emulator/native build. Run it as its own command. |
| `npm run lint` / `npm run typecheck` / `npm run test` | The pieces of `verify` |
| `npx vitest run <path>` | One test file while iterating |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `openspec list`, `openspec status --change <n>`, `openspec validate --all` | OpenSpec state |
| `/opsx:propose`, `/opsx:apply`, `/opsx:archive` | OpenSpec workflow (skills in `.claude/skills/`) |

## Layout

```
docs/            product-vision.md, glossary.md, tech-task.md — why, vocabulary, build plan
openspec/        specs/<capability>/spec.md (truth), changes/<name>/ (work in flight), config.yaml
src/domain/      pure TypeScript: entities, money rules, monthly picture   → .claude/rules/domain.md
src/db/          Drizzle schema, queries; drizzle/ = migrations          → .claude/rules/database.md
**/*.test.ts     Vitest, next to the source                               → .claude/rules/testing.md
android/, app.json, plugins/   Expo native config                         → .claude/rules/android.md
scripts/         verify.sh, fingerprint.sh (used by hooks)
.claude/         settings.json (permissions + hooks), hooks/, rules/, agents/, skills/
```

The Expo app itself is not scaffolded yet. When you run `create-expo-app`, keep this repo's
`package.json` scripts, `eslint.config.js`, `tsconfig.json` (switch `extends` to
`expo/tsconfig.base`), `vitest.config.mts` and `drizzle.config.ts`; merge, don't overwrite.

## Workflow for any change

1. `/opsx:propose` → artifacts in `openspec/changes/<name>/`.
2. Run the `spec-reviewer` subagent on the change. Fix CRITICAL findings before implementing.
3. `/opsx:apply` → implement task by task; after each task run the relevant tests, then `npm run verify`.
4. When all tasks are done: `npm run verify` green, then run the `diff-reviewer` subagent.
   Fix its CRITICAL findings and re-run until `PASS`.
5. Commit (the commit hook refuses an unverified tree). Push when asked — every `git push`
   (main included) goes through a per-run permission prompt; PR merging stays with the human.
6. `/opsx:archive` only after step 4 passes.

## Hard rules

1. Nothing is "done", no task box is ticked, no completion is reported without a passing
   `npm run verify` on the exact current tree — quote its last lines. A Stop hook enforces this.
2. No behaviour change without an OpenSpec change that specifies it. Bug fix = failing test first.
3. Money is integers in minor units with a currency code; never floats, never cross-currency sums.
   Every transaction is an expense unless explicitly typed otherwise. (Details: `rules/domain.md`.)
4. Committed migrations are immutable; schema change = new migration + test. (`rules/database.md`)
5. Every `git push` needs the human's per-run approval (ask rule). Never force-push, delete
   remote refs, or rewrite history; never recursive `rm`; never read or write secrets
   (`.env*`, keystores, `google-services.json`). Hooks and deny rules enforce this.
6. Never skip, weaken or delete a failing test to get green.
7. Use glossary terms verbatim in code and specs; do not invent synonyms.
8. Stop and ask when a task is ambiguous, contradicts the vision, or needs a hand edit under
   `android/`. Do not guess.

## Subagents

- `spec-reviewer` — plan review before `/opsx:apply` (read-only, returns READY / NOT READY).
- `diff-reviewer` — adversarial diff-vs-spec review, runs `verify` itself (returns PASS / FAIL).

## Hooks (in `.claude/settings.json`, scripts in `.claude/hooks/`)

- `guard-bash.sh` (PreToolUse Bash) — blocks force/destructive git and destructive pushes
  (delete/mirror/force), recursive rm, sudo, drizzle push/drop, release commands; blocks
  `git commit` unless the tree matches the last green `verify`. Plain `git push` falls through
  to the ask rule.
- `guard-migrations.sh` (PreToolUse Edit|Write) — blocks edits to committed files under `drizzle/`.
- `verify-gate.sh` (SessionStart + Stop) — refuses to end a turn while watched files changed this
  session and `verify` has not passed for the current tree (max 3 blocks, then warns).
