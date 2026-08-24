# db-schema — tasks

## 1. Dependencies and toolchain

- [x] 1.1 Add dev dependencies: `better-sqlite3`, `@types/better-sqlite3`,
      `babel-plugin-inline-import` (design §8); `npm run verify` still green.
- [x] 1.2 Create `babel.config.js` (default Expo preset + inline-import for `.sql`) and
      `metro.config.js` (default config + `sql` in `resolver.sourceExts`) per design §8.

## 2. Domain: opening balance and computed balance

- [x] 2.1 Extend `Account` with `openingBalance: Money` and add an `account()` factory that
      defaults it to zero and rejects a currency mismatch (design §6). Tests in
      `src/domain/account.test.ts` prove accounts scenarios "The opening balance defaults to
      zero" and "A mismatched opening-balance currency is rejected".
- [x] 2.2 Add pure `computeBalance(account, transactions)` to `src/domain/account.ts`
      (design §7). Tests in `src/domain/account.test.ts` prove accounts scenarios "Expenses,
      income and refunds move the balance", "A correction moves the balance by its signed
      amount", "A cross-currency transfer moves both balances in their own currencies" and
      "A foreign-currency amount on the account is rejected".

## 3. Schema and first migration

- [x] 3.1 Write `src/db/schema.ts`: `accounts` and single-table `transactions` with type
      discriminator, per-type CHECK constraints, money column pairs, TEXT `YYYY-MM-DD` date with
      GLOB check, account FKs with `onDelete: 'restrict'`, plain-TEXT `category_id`/`source_id`
      (design §1–§6).
- [x] 3.2 Generate the first migration with `npm run db:generate`; commit it untouched
      (append-only rule).
- [x] 3.3 Migration test `src/db/migrations.test.ts`: apply all committed migrations to an empty
      in-memory database, then store and read back an account and one transaction of each of the
      five types — proves persistence scenario "A fresh install starts from migrations alone".

## 4. Repositories

- [x] 4.1 Test database helper in `src/db/` (in-memory and temporary-file `better-sqlite3`
      clients with the real migrations applied via the Drizzle migrator and foreign-key
      enforcement on — `PRAGMA foreign_keys = ON`, design §8) plus row↔domain mappers
      (design §9).
- [x] 4.2 `accountsRepo` (save, get, list) returning domain `Account`s; save upserts via
      `onConflictDoUpdate`, never `INSERT OR REPLACE` (design §9). Round-trip test in
      `src/db/accounts-repo.test.ts`, including the opening balance surviving storage and
      re-saving an account that already has transactions.
- [x] 4.3 `transactionsRepo.save`/`get` for all five types. Tests in
      `src/db/transactions-repo.test.ts` prove persistence scenarios "Expense with an
      original-currency amount round-trips", "Cross-currency transfer round-trips with two legs
      and no rate", "Income, refund and correction round-trip", "Loading an unknown id returns
      nothing" and "A transaction referencing an unknown account is rejected".
- [x] 4.4 Restart test on a temporary-file database in `src/db/transactions-repo.test.ts`:
      store, close, reopen, read — proves persistence scenario "Reopening storage returns what
      was stored".
- [x] 4.5 `transactionsRepo.listMonth` and `listByAccount`. Tests in
      `src/db/transactions-repo.test.ts` prove persistence scenarios "Month boundaries are
      respected" and "Both transfer legs count as touching".
- [x] 4.6 `transactionsRepo.save` as insert-or-replace and `remove`. Tests in
      `src/db/transactions-repo.test.ts` prove persistence scenarios "Retyping an expense into a
      transfer keeps the id" and "A removed transaction disappears from listings".

## 5. Runtime wiring

- [x] 5.1 Runtime client in `src/db/client.ts` (`drizzle-orm/expo-sqlite`) with foreign-key
      enforcement on (`PRAGMA foreign_keys = ON`) and migrations applied at app startup via the
      Drizzle Expo migrator in the root layout (design §8) — thin module, covered by
      lint/typecheck; no new native modules or permissions.
- [x] 5.2 Append the calendar-date convention to `.claude/rules/database.md`'s [PROPOSED]
      instants rule: transaction dates are TEXT `YYYY-MM-DD` matching the domain IsoDate, month
      filters are lexicographic ranges; instants stay epoch milliseconds (design §2).
      Also narrow the same file's money bullet: one table holding five row shapes cannot carry a
      column-level `NOT NULL` on a per-type money pair, so the pair is held by the
      `transactions_shape` CHECK instead (design §3, amended after diff review).
      The same edit settles three `[PROPOSED]` markers this change makes real — the expo-sqlite
      startup migrator, `better-sqlite3` in tests + `PRAGMA foreign_keys = ON` on both
      connections, and the Queries bullet's month-range wording. **These are edits to a rule file;
      they need the owner's nod at review.**

## 6. Verification

- [x] 6.1 Run `npm run verify` and paste the final lines

      ```
      ▶ npm run -s test

       RUN  v4.1.11 /Users/antonbabych/dev/cap1tal

       Test Files  8 passed (8)
            Tests  77 passed (77)
         Start at  13:51:43
         Duration  325ms (transform 245ms, setup 0ms, import 820ms, tests 74ms, environment 0ms)

      ✔ verify passed (dcff1769db7aeeda2f2d704a14403393b81735eb)
      ```

- [x] 6.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      Pass 1: FAIL (1 critical, 7 warnings). Critical — design §3 and `.claude/rules/database.md`
      claimed `NOT NULL` money columns that a five-type single table cannot have; the artifacts
      were amended (§3 above), not the committed migration. Also fixed: `save` now validates the
      date so nothing can be stored that cannot be read back; the root layout keeps one root so
      the splash lifts on migration failure; the test migrations folder resolves from
      `import.meta.url`; shape-CHECK negative cases and the no-stored-balance assertion are tested.

      Pass 2: PASS (0 critical). Its remaining warnings were closed except two left for the
      owner: the rule-file edits above, and `@types/better-sqlite3` ^9 against `better-sqlite3` ^13.
