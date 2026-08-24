---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "vitest.config.mts"
---

# Testing rules

## What runs where
- `npm run verify` is the only definition of "green": spec validation → lint → typecheck →
  `vitest run`. It must stay under a minute and must never need an emulator, a device or a
  native build. Do not add anything to it that breaks that.
- Vitest covers pure TypeScript only: `src/domain/**` and `src/db/**` (in-memory SQLite).
- React Native components and screens are not under Vitest. When UI tests arrive they use
  `jest-expo` and run in the slow CI job, not in `verify`. [PROPOSED]
- Run a single file while iterating: `npx vitest run src/domain/<file>.test.ts`.

## How to write them
- Test file sits next to its source: `foo.ts` → `foo.test.ts`.
- Test names quote the OpenSpec scenario they prove, e.g.
  `it("Scenario: ATM withdrawal does not count as spent", …)`. Every scenario in a change's
  delta spec has at least one test whose name contains that scenario title.
- Assert on behaviour and values (amounts in minor units, currency codes, account kinds), not on
  implementation details. No snapshot-only tests for domain code.
- Keep the monthly identity `income = spent + invested + saved + lent + left` as a property
  test over generated transaction sets.
- Domain tests use plain values and an injected `now`; no fake timers unless the function takes
  time as an argument.
- DB tests apply the real migrations to an empty in-memory database in `beforeEach`; no mocking
  of Drizzle, no shared mutable database across tests.
- Each bug fix starts with a failing test that reproduces it.

## Never
- Never skip, `.only`, delete or weaken a failing test to make `verify` pass. If a test is
  wrong, say why in the change and fix the test explicitly.
- Never mark a task as done, or tell the user the work is complete, without quoting the final
  lines of a passing `npm run verify` from this exact tree.
- Never add `--passWithNoTests`-style escapes beyond the one already in `vitest.config.mts`
  (it exists only so the empty repository verifies).
