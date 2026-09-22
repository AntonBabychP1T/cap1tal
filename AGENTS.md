# cap1tal — shared agent rules

Personal money tracker for one person on one phone. Product truth: `docs/product-vision.md`,
vocabulary: `docs/glossary.md` (Ukrainian terms are used verbatim in code, specs and UI).
Behaviour is spec-driven with OpenSpec: `openspec/specs/<capability>/spec.md` is the source
of truth, `openspec/changes/<name>/` is work in flight, `BACKLOG.md` is the owner's queue.

Stack (decided, do not relitigate): Expo SDK 57 / React Native, TypeScript strict,
SQLite + Drizzle ORM, npm, Android first (iOS must stay possible). Node ≥ 24.

## Finding code

Use the `repo-code-navigation` skill (`.agents/skills/repo-code-navigation/SKILL.md`) for
any task that touches code structure or behaviour: codedb-mcp graph for orientation,
callers, dependencies and impact; exact source (`codedb_symbol`/`codedb_read` or a targeted
read) before any edit; native grep/read as fallback for routes, ports, native modules, UI
strings and everything outside the index. Read the governing spec and the colocated
`*.test.ts` before changing behaviour.

## Map

| Where | What |
|---|---|
| `src/domain/` | pure rules and values; no React/Expo/db imports |
| `src/dashboard/` | the closed Головний widget registry and its normalizer; no React, no repository |
| `src/db/` | Drizzle schema, repositories, `repos.ts`; `drizzle/` = generated migrations |
| `src/ui/` | screen logic without React, so the Node-only gate can test it |
| `src/app/` | expo-router screens: `(tabs)/` Головний · Місяць · Рахунки · Звіти · Налаштування, plus pushed screens |
| `src/monobank/ notifications/ saldo/ analysis/ backup/ reminders/ reporting/ progress/ fiscal/` | pure feature modules behind ports |
| `src/platform/` | one port per device capability + `*-device.ts` adapter (never loaded by tests) |
| `src/hooks/*-ports.ts`, `src/app/_layout.tsx` | where adapters are bound to ports at runtime |
| `modules/` | local Expo modules (Kotlin) |
| `index.ts` | bundle entry: background tasks first, then `expo-router/entry` |

Details, entry points and data flow: the skill's `references/architecture.md` and
`references/modules.md`.

## Commands

| Command | Purpose |
|---|---|
| `npm run verify` | The gate: `openspec validate` → lint → typecheck → tests. < 1 min, Node only. Run it on its own, never behind `head`. |
| `npm run lint` / `npm run typecheck` / `npm run test` | The pieces of `verify` |
| `npx vitest run <path>` | One test file while iterating |
| `npm run db:generate` | New migration from `src/db/schema.ts` |
| `scripts/android.sh up\|shot\|reset\|logs` | Emulator smoke tests; never part of `verify` |
| `openspec list` / `openspec validate --all` | OpenSpec state |

## Conventions

- Money is integers in minor units with an ISO-4217 code; never floats, never cross-currency
  sums. Every transaction is an expense unless explicitly typed otherwise.
- Glossary terms verbatim in identifiers and specs; no synonyms (`Wallet`, `Budget`, …).
- Tests sit next to source as `<file>.test.ts`, names quote the spec scenario. Never under
  `src/app/` (expo-router bundles everything there).
- Domain code takes `now` as an argument; no I/O, clocks or randomness inside.
- Committed migrations are immutable; a schema change is a new migration plus a test.
- `android/` and `ios/` are generated (`expo prebuild`), never hand-edited or committed.

## Safety

- No behaviour change without an OpenSpec change that specifies it. Bug fix = failing test
  first. Never skip, weaken or delete a failing test.
- `git push` only when the human asks. Never force-push, rewrite history, delete remote refs,
  recursive `rm`, or read/write secrets (`.env*`, keystores, `google-services.json`).
- Stop and ask when a task is ambiguous, contradicts the vision, or needs a hand edit under
  `android/`.

## Definition of done

Nothing is done, no task box is ticked and no completion is reported without a passing
`npm run verify` on the exact current tree — quote its last lines. A change that touches a
screen is also smoke-tested on the emulator before it is archived; a green suite is not
evidence that a screen works.
