# monobank-sync — tasks

Every test name quotes its spec scenario (`.claude/rules/testing.md`); all fixtures are
synthetic inline payload objects — no test ever touches the network or a real token, and the
real API is reached only by the dry-run the owner runs themselves.

## 1. Domain groundwork

- [x] 1.1 Add `description?: string` to the five transaction interfaces in
      `src/domain/transaction.ts` and the constant `UNSOURCED_SOURCE_ID = 'unsourced'` with a
      comment mirroring the reserved-category-id precedent (the seeded row arrives with the
      screen change). Tests in `src/domain/transaction.test.ts`: "Scenario: An imported
      витрата keeps the bank's text" (опис stored, totals unchanged), "Scenario: A manual
      транзакція needs no опис".
- [x] 1.2 Preserve the опис through edits and retypes in `src/ui/retype.ts` and
      `src/ui/entry-form.ts` (every path that rebuilds a транзакція carries `description`
      over). Test in `src/ui/retype.test.ts`: "Scenario: A retype keeps the опис" (витрата з
      описом → переказ → still carries it; also через витрата↔дохід і витрата↔повернення).
- [x] 1.3 Add `reconcile` to `src/domain/account.ts`: given accountId, розрахунковий баланс,
      actual balance, date and an injected `newId`, return a коригування of (actual −
      computed) or `undefined` when equal; throw on a currency mismatch. Tests in
      `src/domain/account.test.ts`: "Scenario: A shortfall becomes a negative коригування"
      (including that applying it makes `computeBalance` equal the actual balance and the
      month counts it as spent), "Scenario: A surplus becomes a positive коригування",
      "Scenario: Equal balances create nothing", "Scenario: A foreign-currency actual balance
      is rejected".

## 2. Personal API client — `src/monobank/api.ts`

- [x] 2.1 Define `AuthFetchLike`, the `Outcome<T>` union and the endpoint URLs; implement the
      shared answer handling: 401/403 → invalid-token, 429 → rate-limited, thrown fetch or
      non-2xx or unparseable body → unavailable, and no outcome ever containing the token.
      Tests in `src/monobank/api.test.ts`: "Scenario: A 429 answer is rate-limited",
      "Scenario: A rejected token is invalid-token", "Scenario: A network failure is
      unavailable", "Scenario: No outcome carries the token" (serialise every outcome of a
      stubbed run and assert the token string is absent).
- [x] 2.2 Implement client-info fetch + total parse: cards and банки to
      `{ id, currency, name, bankBalance }` in integer minor units, card balance minus credit
      limit, non-offered currencies dropped, alien payloads → unavailable. Tests in
      `api.test.ts`: "Scenario: A card's баланс банку subtracts the credit limit",
      "Scenario: A card deep in its credit limit is negative", "Scenario: A банка arrives with
      its title and balance", "Scenario: A card is named by its type and masked number",
      "Scenario: A currency the app does not offer is left out", "Scenario: A hostile payload
      is unavailable, not a crash".
- [x] 2.3 Implement statement fetch + whole-or-nothing parse with the injected
      `dateOf(unixSeconds)` converter: id, moment, date, description, MCC, signed minor-unit
      amount, hold; the row's own currency code checked against the рахунок's (design D12: it is
      the account's currency, and the operation's is nowhere in the payload); any unreadable row
      fails the answer. Tests in `api.test.ts`: "Scenario: A statement item parses whole" (with a
      midnight-boundary `dateOf` case), "Scenario: A foreign purchase is the сума the bank
      charged, and nothing more", "Scenario: A row of another currency is not this рахунок's
      statement", "Scenario: One unreadable row fails the whole answer".

## 3. Sync planning and mapping — `src/monobank/sync.ts`

- [x] 3.1 Implement `planWindows(fromMs, nowMs)` (≤ 31 d + 1 h each, oldest first, covering,
      non-overlapping) and `continueWindow(window, oldestItemMs)` for full 500-item answers.
      Tests in `src/monobank/sync.test.ts`: "Scenario: A long span becomes consecutive
      windows" (property-style over arbitrary spans), "Scenario: A short span is one window",
      "Scenario: A full answer continues the window".
- [x] 3.2 Implement `mapStatement(items, ctx)` per design D7: negative → витрата through
      `src/domain/rules.ts` matching else «Без категорії», positive → дохід «Без джерела»,
      опис from description, no original-currency сума (design D12), hold ignored, zero skipped; returns
      транзакції plus the ids now seen. Tests in `sync.test.ts`: "Scenario: A recognised
      merchant lands in its category", "Scenario: An unrecognised merchant is «Без
      категорії»", "Scenario: Arriving money is a дохід «Без джерела»", "Scenario: A foreign
      purchase is a витрата of what the bank charged", "Scenario: A hold maps like anything else",
      "Scenario: A zero amount maps to nothing".
- [x] 3.3 Enforce the seen-id invariant in `mapStatement`: an id already in `ctx.seenIds`
      maps to nothing, every readable id joins the returned seen set, and the set is the only
      memory — nothing consults stored транзакції. Tests in `sync.test.ts`: "Scenario: The
      same item does not import twice" (the same item in two consecutive `mapStatement` calls
      chained through the returned set), "Scenario: A deleted транзакція stays deleted" (id in
      the set, no matching транзакція anywhere — still skipped), "Scenario: A zero item's id
      is still remembered".

## 4. Linking model — `src/monobank/link.ts`

- [x] 4.1 Implement the link model: `validateLink` (currency equality, one link per monobank
      account and per рахунок against an existing link set) and `suggestKind` (card →
      `spending`, банка → `savings`). Tests in `src/monobank/link.test.ts`: "Scenario: A
      currency mismatch is rejected", "Scenario: A second link on either side is rejected",
      "Scenario: A банка suggests a savings рахунок" (including that the suggestion does not
      reject another вид).

## 5. Dry-run

- [x] 5.1 Create `scripts/mono-dry-run.ts` (owner-run only:
      `MONOBANK_TOKEN=… npx tsx scripts/mono-dry-run.ts`): fetch client-info, print parsed
      accounts with raw balance, credit limit and derived баланс банку, fetch one recent
      statement window for the first account and print the mapped транзакції with an empty
      rule set; exit with a readable message on every non-ok outcome; store nothing, print no
      token. Verify by `npx tsx --check`-style compile (typecheck covers it) and a stubbed
      smoke test in `src/monobank/sync.test.ts` is NOT needed — the script only wires already
      tested functions; confirm `npm run lint` and `npm run typecheck` pass over it.

## 6. Gate

- [x] 6.1 Run `npm run verify` and paste the final lines
- [x] 6.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
