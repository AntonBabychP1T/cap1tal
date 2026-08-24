# accounts-manual-transactions — tasks

Each behaviour task names its test file and the delta-spec scenarios its test names quote.
After each task: run its named test file (`npx vitest run <path>`), then `npm run verify`.
Scenarios listed in task 4.5 as manual-smoke-only are the deliberate, stated exception to
testing.md's every-scenario-has-a-test rule: they are pure UI wiring that Vitest cannot run.

## 1. Domain: archival and transfer guard

- [x] 1.1 Add `archived: boolean` to `Account`, default `false` in `account()`; add pure
      `activeAccounts(accounts: Account[]): Account[]`. Tests in
      `src/domain/account.test.ts`: "Scenario: An archived account is not offered for new
      transactions", "Scenario: Editing pickers also offer only unarchived accounts"
      (`activeAccounts` is the one list both flows use), "Scenario: Unarchiving restores the
      account", and a new account is unarchived by default (`archived === false`).
      (accounts delta)
- [x] 1.2 Test in `src/domain/transaction.test.ts` named "Scenario: The same account on both
      legs is rejected", proving `transfer()` throws for identical source and destination —
      the rejection the quick-add form surfaces. (main-screen delta)
- [x] 1.3 Test in `src/domain/transaction.test.ts` named "Scenario: A cross-currency переказ
      proposes no комісія", proving `proposeFee` returns `null` for a UAH→USD переказ whose
      arrived number is the smaller one — the form must never compare raw numbers across
      currencies. (main-screen delta)

## 2. Storage: migration, archived flag, latest listing

- [x] 2.1 Schema: `accounts.archived` (`integer { mode: 'boolean' } NOT NULL DEFAULT 0`) and
      `transactions.created_at` (`integer { mode: 'timestamp_ms' } NOT NULL DEFAULT 0`); run
      `npm run db:generate`; do not touch the committed migration. Extend the migration test
      file with "Scenario: A fresh database from migrations alone stores the flag" and
      "Scenario: A pre-migration account loads unarchived" (insert a representative row after
      applying only the first migration, then apply the new one and load). (persistence delta)
- [x] 2.2 Mappers + `accountsRepo`: round-trip `archived`; `save` rejects a kind or currency
      change on an existing id (design §2). Tests in `src/db/accounts-repo.test.ts`:
      "Scenario: An archived account survives a restart", "Scenario: Changing the kind is
      rejected", "Scenario: Changing the currency is rejected", "Scenario: Renaming keeps
      identity and history", "Scenario: Editing the opening balance moves the computed balance",
      "Scenario: Archiving keeps history and balance", and "Scenario: An account shows its
      computed balance" (`computeBalance` over `listByAccount` — the Рахунки screen's exact
      read path). (accounts + persistence + accounts-screen deltas)
- [x] 2.3 `transactionsRepo`: `save(t, storedAt: Date)` setting `created_at` on insert only;
      `listLatest(limit)` ordered `date DESC, created_at DESC, id DESC`; update existing tests
      for the signature. Tests in `src/db/transactions-repo.test.ts`: "Scenario: Newest date
      comes first", "Scenario: Same-date transactions are ordered by storage recency",
      "Scenario: The requested count is respected", "Scenario: Replacing a transaction keeps
      its place", "Scenario: A recorded transaction appears at the top of the feed" (save
      today's expense, `listLatest` returns it first). (persistence + main-screen deltas)
- [x] 2.4 Repo-level proofs of the editing flows, in `src/db/transactions-repo.test.ts`:
      "Scenario: An expense becomes a transfer under the same identity", "Scenario: Moving an
      expense to another currency asks the amount anew" (replace with the USD amount on the USD
      account; no UAH remains), "Scenario: Changing a transfer leg to another currency asks
      that leg anew". The two fee tests first written here are superseded by task 2.5, which
      pins the stored shape and the resulting розрахунковий баланс. (main-screen delta)
- [x] 2.5 The accepted-fee shape (design §8), rewriting the two fee tests of 2.4 in
      `src/db/transactions-repo.test.ts`: "Scenario: Accepted fee proposal records the expense"
      (build the candidate `transfer` from the typed legs 100000/99500, take `proposeFee`, then
      store the переказ with 99500 on both legs plus the "Комісія" витрата; both read back),
      "Scenario: Accepting the комісія keeps the source balance exact" (`computeBalance` over
      `listByAccount` for both accounts on the accepted and on the declined shape — 900000 and
      99500 in both), "Scenario: Declined fee proposal records only the transfer" (legs stay
      100000/99500, no витрата stored), "Scenario: An edited переказ that arrives short proposes
      the комісія" (replace an equal-legged переказ under its id with the trimmed one plus the
      fee), "Scenario: An edited amount persists" (12550 UAH re-saved under the same id as 13000;
      one transaction, not two). (main-screen delta)
- [x] 2.6 Re-dating at the repo level, in `src/db/transactions-repo.test.ts`: "Scenario: A
      corrected date moves the transaction to its real month" (`save` under the same id with a
      July date; assert `get`, `listMonth('2026-07')` holds it, `listMonth('2026-08')` does not,
      and its new `listLatest` place), "Scenario: A replacement with a new date takes its new
      place", "Scenario: A date other than today can be chosen when recording" (store a
      non-today date, read it back unchanged). These pin `date` inside the
      `onConflictDoUpdate` set. (main-screen + persistence deltas)
- [x] 2.7 The reverse retype at the repo level, in `src/db/transactions-repo.test.ts`:
      "Scenario: A transfer becomes an expense on the account the money left" (assert the source
      keeps the сума that left, the destination's `listByAccount` is empty and its
      `computeBalance` no longer holds the amount), "Scenario: A cross-currency transfer becomes
      an expense of what left", "Scenario: An accepted комісія survives the retype as its own
      transaction". (main-screen delta)
- [x] 2.8 One more test in `src/db/accounts-repo.test.ts` named "Scenario: A created account is
      usable immediately" (needs 3.3): save a `cash` "гаманець" in UAH with no opening balance,
      then assert `computeBalance` over `listByAccount` is 0 minor units UAH,
      `activeAccounts(list())` contains it, and `groupAccountsByKind(list())` places it under
      `cash`. (accounts-screen delta)

## 3. Pure UI modules

- [x] 3.1 `src/ui/amount-input.ts`: parse major-units string ("125.50", "125,50", "200") to
      `Money` with integer string arithmetic; reject non-numbers, non-positive, >2 fractional
      digits; `formatMoney`, plus `parseOpeningBalance`/`formatMinorUnits` for the one amount that
      may be zero or negative (the початковий залишок). Tests in `src/ui/amount-input.test.ts`:
      "Scenario: Typed amount becomes exact minor units", "Scenario: A whole amount needs no
      fractional part", "Scenario: Too many fractional digits are rejected", "Scenario: A
      non-positive amount is rejected". (main-screen + accounts-screen deltas)
- [x] 3.2 `src/ui/id.ts`: app-generated text id (design §5); trivial uniqueness/shape test in
      `src/ui/id.test.ts` (no spec scenario — infrastructure).
- [x] 3.3 `src/ui/account-groups.ts`: pure `groupAccountsByKind(accounts: readonly Account[])` —
      fixed вид order (`spending`, `savings`, `investment`, `cash`, `debt`), archived accounts
      kept out of every вид group and collected in a final `archived` group, empty groups
      omitted, accounts left in the order given. Tests in `src/ui/account-groups.test.ts`:
      "Scenario: Accounts group by kind, archived apart", "Scenario: Archiving moves the account
      to the archived group", "Scenario: The screen invites the first рахунок" (empty input → no
      groups at all). (accounts-screen delta)
- [x] 3.4 `src/ui/labels.ts`: the Ukrainian the owner reads — `categoryLabel` mapping the reserved
      ids to "Без категорії" and "Комісія", `kindLabel` per вид plus "Архів", `accountChoiceLabel`,
      `failureMessage`, and `OFFERED_CURRENCIES` (UAH/EUR/USD). Tests in `src/ui/labels.test.ts`
      pin the two category labels the specs name verbatim. (main-screen + accounts-screen deltas)
- [x] 3.5 `src/ui/dates.ts`: `todayIso(now)` — the device clock's calendar date from its LOCAL
      parts, so a transaction recorded late in the evening is not dated the next day in UTC. Tests
      in `src/ui/dates.test.ts`. (main-screen delta: "the date SHALL default to today")
- [x] 3.6 `src/ui/transaction-line.ts`: `transactionLine(t, accountsById)` — one стрічка row as
      pure data: amount with currency, the account (both for a переказ, both amounts when the
      currencies differ), the date, the category label where the type has one. Tests in
      `src/ui/transaction-line.test.ts` prove the feed's content even though the list is JSX.
      (main-screen delta)
- [x] 3.7 `src/ui/account-choices.ts`: `accountChoicesFor(all, currentAccountId)` and `legsOf(t)` —
      one picker list per leg, so an archived account is offered as the destination of nothing
      while the leg already sitting on it keeps showing it. Test in
      `src/ui/account-choices.test.ts` named "Scenario: Editing pickers also offer only unarchived
      accounts" proves both halves at the level the screen actually uses. (accounts delta)

## 4. Screens (thin wiring over the tested modules above)

- [x] 4.1 Головний `src/app/index.tsx`: quick-add (сума via `amount-input`, рахунок from
      `activeAccounts`, toggle витрата/переказ, date defaulting to today and changeable) + feed
      from `listLatest(50)`; a same-currency переказ offers an optional «скільки прийшло»
      defaulting to the сума that left; fee dialog via `proposeFee` on the candidate переказ —
      accept stores the переказ with the arrived сума on both legs plus the "Комісія" витрата,
      decline stores the typed legs only; a cross-currency переказ asks both legs and proposes
      nothing; the same account on both legs surfaces the domain rejection; with no рахунок to
      choose, the form says so and points at Рахунки instead of recording.
- [x] 4.2 Editing `src/app/transaction/[id].tsx`: change amount, date and account(s) — a
      different-currency account choice requires re-entering that amount, a changed date moves
      the transaction to its month, and a same-currency переказ edited to arrive short reuses
      the fee dialog of 4.1; delete with confirmation; retype витрата ↔ переказ under the same
      id (destination from `activeAccounts`; second leg when currencies differ; переказ →
      витрата keeps the account the money left, the сума that left and "Без категорії", and
      leaves any earlier "Комісія" витрата alone).
- [x] 4.3 Рахунки `src/app/accounts.tsx`: sections from `groupAccountsByKind` (вид groups +
      "Архів"); balances via `computeBalance` over `listByAccount`; create (назва, вид, валюта
      UAH/EUR/USD, початковий залишок optional), rename / edit opening balance / archive /
      unarchive; no delete action; with no accounts the screen invites creating the first
      рахунок.
- [x] 4.4 `_layout.tsx` tabs → Головний + Рахунки; delete template demo files (`explore.tsx`,
      hint-row, external-link, web-badge, collapsible, demo tab content) leaf-first, keeping
      `AnimatedSplashOverlay`, themed components and theme hooks; `verify` after removals.
- [x] 4.5 Manual smoke on Android (емулятор або пристрій) of the UI-only scenarios — the stated
      exception to testing.md, since Vitest never runs JSX: "The first screen is entry plus the
      feed", "A recorded transaction appears at the top of the feed" (visually), "With no
      рахунок nothing can be recorded yet", "Same-currency transfer needs one amount", "A short
      arrival proposes the комісія", "Cross-currency transfer asks both legs", the
      accepted/declined fee dialogs, "A deletion is confirmed first", "Renaming is immediately
      visible" and "The screen invites the first рахунок". Note the result in the change before
      archive; the CI android job covers compilation.

      **Run on the `Pixel_10_Pro` emulator (API 37) via `scripts/android.sh`; screenshots in
      `.cache/android/`.** Proven on the device:

      - *With no рахунок nothing can be recorded yet* — after `reset`, Головний offers no рахунок,
        says "Спершу створіть рахунок" and points at Рахунки; the feed says nothing is recorded.
      - *The screen invites the first рахунок* — Рахунки shows no вид groups, only the invitation.
      - *The first screen is entry plus the feed* — тип (витрата by default), рахунок, сума, дата
        prefilled with today, "Категорія: Без категорії", then the стрічка.
      - *A created account is usable immediately* / *An account shows its computed balance* /
        *Accounts group by kind* — a UAH `spending` account opened at 1000,00 appears under
        Витратні with its balance and is offered on Головний at once; a `savings` one lands under
        Накопичувальні.
      - *A recorded transaction appears at the top of the feed* — "125.50" stored as **125,50 UAH**,
        top of the стрічка, "витрата · Без категорії".
      - *Same-currency transfer needs one amount* — «скільки прийшло» left untouched records equal
        legs and proposes no комісія.
      - *A short arrival proposes the комісія* — 100,00 out / 99,50 in raises "Схоже на комісію —
        Дійшло на 0,50 UAH менше".
      - *Accepted fee proposal* + *Accepting the комісія keeps the source balance exact* — the
        stored переказ carries 99,50 on both legs, the "Комісія" витрата is 0,50, and the source
        balance is **774,50 UAH**, not 774,00. This is design §8 proven on a device: the shape the
        archived monthly-picture scenario names would have counted the комісія twice.
      - *A deletion is confirmed first* — "Видалити транзакцію?" with Скасувати/Видалити; after
        confirming, the transaction is gone from the стрічка and the balance returns to 775,00.
      - *Renaming is immediately visible* — the row shows the new назва with its balance unchanged,
        still under its вид; вид and валюта are disabled while editing, with the reason shown.

      **A defect the smoke found, and only the smoke could:** tapping a transaction did nothing.
      `src/app/_layout.tsx` made `NativeTabs` the root layout, so `transaction/[id]` had no tab
      trigger and no stack to be pushed onto — the editing screen was unreachable, while `verify`
      stayed green and the bundle built cleanly. Fixed by making the root a `Stack` over a `(tabs)`
      group (`src/app/(tabs)/`), with editing pushed on top; re-checked on the device afterwards.

      Not covered on the device, and stated rather than implied: *Cross-currency transfer asks both
      legs* and the *declined* fee dialog (both have repo-level tests), and every editing scenario
      beyond opening and deleting. `adb shell input text` cannot type Cyrillic, so account names in
      the run are ASCII.

- [x] 4.6 Docs: bring `docs/tech-task.md` in line with this change's scope — step 3 claims
      `FR-S1 (частково: витрата і переказ)`, step 5 gains `FR-S1 (решта)`, and the milestone
      line "після кроку 3 можна вести облік вручну" becomes "після кроку 3 можна вручну вести
      витрати й перекази; дохід і повернення — після кроку 5; коригування — після кроку 7". No
      spec scenario; it records the owner's answer to proposal.md scope decision 1.
- [x] 4.7 Rules: `src/ui/**` is now under Vitest, so `.claude/rules/testing.md`, the CLAUDE.md
      Layout table and the `vitest.config.mts` comment say so — design §5 created the directory,
      and a rule file that still lists only `src/domain` and `src/db` would mislead the next
      agent. No spec scenario; keeping the rule files true.

## 5. Gate

- [x] 5.1 Run `npm run verify` and paste the final lines

      ```
      Test Files  15 passed (15)
           Tests  157 passed (157)
      ✔ verify passed (7f8d547fa201e011f8da9b0e22c259ba41f7d2c0)
      ```

      Beyond `verify` (which never runs JSX): `npx expo export --platform android` bundles the
      app cleanly — 1753 modules, no broken import or asset path after the template files went.
- [x] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      Round 1 — FAIL (2 critical): "Scenario: An edited amount persists" had no test with that
      name, and the editing screen fed one account list to both pickers, so an archived account
      was offered as a retype destination — what the accounts delta forbids. Round 2 — PASS
      (0 critical) after adding the test and extracting `src/ui/account-choices.ts` (task 3.7).
      Its remaining warnings are closed too: unused `Choices.empty` / `Action.disabled` props
      removed, and the editing form's one-shot initialisation noted in design §6. The PASS is
      conditional on task 4.5 — the manual Android smoke — whose result must be written here
      before `/opsx:archive`.
