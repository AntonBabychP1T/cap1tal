## 1. Рахунки: the age and the first-sync guard (pure)

- [ ] 1.1 In `src/app/(tabs)/accounts.tsx`, change the `bankBalances` map's value from `Money` to a
      record carrying the balance, `obtainedAt`, and whether the link has ever completed a sync
      (`lastSyncedAtMs !== null`) — all three already returned by the `monobankRepo.listLinks()` /
      `.getAccount()` loop that builds the map today (design D1). Thread a `now: Date` into
      `accountRows()`.
- [ ] 1.2 In `src/ui/account-groups.ts`, update `accountRows()`'s signature to take the richer
      bank-side map and `now`, add `bankBalanceAge?: string` (via `freshnessLabel`, design D2) and
      `awaitingFirstSync?: boolean` to `AccountRow`, and make `reconcilable` additionally require
      the link has synced at least once (design D3, D4). `awaitingFirstSync` is set from
      "not synced" alone, never compounded with "and there is a difference" (design D4). Import
      `NEVER_SYNCED_ACCOUNT` from `src/ui/monobank-screen.ts` rather than a new literal. Failing
      tests first in `src/ui/account-groups.test.ts` updating «Scenario: The two balances remain
      distinct» to assert the age, and adding «Scenario: Звірити waits for the first sync» and
      «Scenario: The wait is said even when the balances happen to agree». Verify with
      `npx vitest run src/ui/account-groups.test.ts`.
- [ ] 1.3 `reconcileConfirmation` names `row.bankBalanceAge` alongside the difference it already
      names. Failing test first in `src/ui/account-groups.test.ts` for «Scenario: The age is named
      before anything is written». Verify with `npx vitest run src/ui/account-groups.test.ts`.

## 2. Рухи: the same age (pure)

- [ ] 2.1 In `src/ui/account-movements.ts`, change `accountMovements()`'s `bankBalance` input to
      the same record shape as task 1.1 (balance + `obtainedAt` + synced-once), add `now: Date`,
      and add `bankBalanceAge?: string` to `AccountMovements` via `freshnessLabel` (design D2). The
      typed-фактичний-залишок `reconcileTyped` is untouched — it does not read the bank side at
      all. Failing test first in `src/ui/account-movements.test.ts` for «Scenario: A linked
      рахунок's рухи show the balance's age». Verify with
      `npx vitest run src/ui/account-movements.test.ts`.

## 3. Screen wiring

- [ ] 3.1 `src/app/(tabs)/accounts.tsx`: render `row.bankBalanceAge` beside «останній баланс
      банку», and where `row.awaitingFirstSync` is true render `NEVER_SYNCED_ACCOUNT` in place of
      the «Звірити» `RowAction`. Verify with `npm run typecheck`.
- [ ] 3.2 `src/app/account/[id].tsx`: pass the richer bank-side record and `now` into
      `accountMovements`, and render `movements.bankBalanceAge` beside «останній баланс банку» the
      same way. Verify with `npm run typecheck`.

## 4. The words

- [ ] 4.1 `docs/glossary.md`: **Bank balance (баланс банку)** gains one sentence — it is shown with
      the moment it was obtained. **Reconcile (звірити)** gains one sentence — not offered from
      баланс банку before a рахунок's first sync has completed. Verify by re-reading both entries
      against `specs/accounts-screen/spec.md` in this change.

## 5. The gate

- [ ] 5.1 Run `npm run verify` and paste the final lines
- [ ] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

## 6. The phone

- [ ] 6.1 Smoke on the emulator with the `smoke-runner` subagent (`scripts/android.sh`,
      `.claude/rules/android.md`): a linked рахунок whose sync has completed shows the age of its
      баланс банку and, on «Звірити», names that age before the коригування is created; a linked
      рахунок whose first sync has not completed shows «Ще не синхронізовано» and no «Звірити»;
      the same ages appear on that рахунок's рухи. Record what was seen.

## Note (2026-10-06)

Recovered from an old worktree (claude/vigorous-babbage-5b8ed5, written 2026-09-09, never committed).
The accounts-screen spec has moved since: four current scenarios were copied into the MODIFIED
block so validate passes. Re-run the spec-reviewer against the current specs before `/opsx:apply`.
