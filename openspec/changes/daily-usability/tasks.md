# daily-usability — tasks

Groups run in the order below (design D1): four of the six slices edit
`src/app/(tabs)/index.tsx` and two edit `src/app/(tabs)/accounts.tsx`, so they are not
parallelisable, and «Звірити» (group 3) needs the рухи screen of group 2. Every group ends green.

## 1. Скільки всього грошей

- [x] 1.1 Move the private `byCurrency` from `src/ui/month-screen.ts:93` into
      `src/ui/amount-input.ts` and import it back (design D3), then add
      `src/ui/account-totals.ts` with `accountTotals(accounts, computed)` → per-вид and grand
      totals per currency; verify with `src/ui/account-totals.test.ts` covering the accounts
      scenarios "Two accounts of the same currency add up", "Currencies stay apart", "An archived
      рахунок counts toward nothing", "A рахунок-борг counts as what is still owed" and "A
      negative balance is counted with its sign".
- [x] 1.2 Add `approximateTotals(totals, rates)` to `src/ui/account-totals.ts` — the marked
      approximate UAH equivalent of the grand total, absent whenever a participating currency has
      no known rate, reusing `approximateUah` and its rounding; verify with
      `src/ui/account-totals.test.ts` covering the accounts-screen scenarios "A known rate adds a
      marked approximation" and "An unknown rate hides the approximation, not the totals".
- [x] 1.3 Extract the rate refresh effect of `src/app/(tabs)/month.tsx:70-105` into
      `src/hooks/use-current-rates.ts` unchanged (design D4) and use it from Місяць; no behaviour
      changes, so the proof is `npm run verify` staying green and `src/ui/approx-uah.test.ts` and
      `src/ui/month-screen.test.ts` untouched.
- [x] 1.4 Render the totals on `src/app/(tabs)/accounts.tsx`: a total on every вид group, one
      grand total, the approximation beside it through `use-current-rates`, and no total on the
      archived group; the screen stays wiring — proves the accounts-screen scenarios "The screen
      says how much money there is", "Currencies are totalled apart" and "The archived group is
      not totalled" against the tested module, with `npm run verify` green.
- [x] 1.5 Render «Усього грошей» above the entry card on `src/app/(tabs)/index.tsx` from the same
      `accountTotals` + `use-current-rates`, and show none when no unarchived рахунок exists;
      proves the main-screen scenarios "Money is the first thing on the screen", "The month's
      number is not this number" and "An empty device shows no total"; `npm run verify` green.

## 2. Рухи рахунку замість перейменування

- [x] 2.1 Extract the account draft's rules from `src/app/(tabs)/accounts.tsx:94-127` into
      `src/ui/account-form.ts` (`blankDraft`, `draftFrom`, `accountFromDraft` with the «рахунок
      потребує назви» refusal and the opening-balance parse, design D6); verify with
      `src/ui/account-form.test.ts` covering the accounts-screen scenario "Renaming is immediately
      visible" and the accounts capability's rejection of an empty назва.
- [x] 2.2 Add `src/ui/account-movements.ts` deciding what the рухи screen shows — назва,
      розрахунковий баланс, the баланс банку when a link feeds one, the транзакції touching the
      рахунок on either leg newest-first, and the words for a рахунок with no history; verify with
      `src/ui/account-movements.test.ts` covering the accounts-screen scenarios "Both legs of a
      переказ belong to the рахунок" and "A рахунок with no history says so".
- [x] 2.3 Add the screen `src/app/account/[id].tsx` rendering that module through
      `transactionLine` + `overLimitByMonth`, each line pushing `/transaction/[id]`, plus the
      explicit editing action rendering `src/ui/account-form.ts`; proves the accounts-screen
      scenarios "The natural gesture shows the money's movements", "A транзакція is edited from
      the рухи" and "Archiving moves the account to the archived group"; `npm run verify` green.
- [x] 2.4 Rewire `src/app/(tabs)/accounts.tsx`: the row's tap pushes `/account/[id]`, the editing
      form and its archive action leave the screen, creation («+») and the linked «Звірити ·
      різниця» stay exactly as they are; proves the modified scenario "The tap is not the editing
      gesture"; `npm run verify` green.

## 3. «Звірити» будь-якому рахунку

- [x] 3.1 Add `parseActualBalance(typed, currency)` to `src/ui/amount-input.ts` — sign and zero
      accepted like an opening balance, an empty string refused in the owner's words (design D7);
      verify with `src/ui/amount-input.test.ts` covering the accounts-screen scenario "A rejected
      entry writes nothing" for `""` and `"abc"`.
- [x] 3.2 Add `reconcileTyped({ account, computed, typed, date, newId })` to
      `src/ui/account-movements.ts` — the parsed фактичний залишок, the sentence naming the signed
      difference before anything is written, and the "already agree" answer when `reconcile()`
      returns nothing; verify with `src/ui/account-movements.test.ts` covering the accounts-screen
      scenarios "Cash is brought into line with a recount", "The difference is named before it is
      written" and "An equal фактичний залишок creates nothing".
- [x] 3.3 Wire «Звірити» into `src/app/account/[id].tsx` for any unarchived рахунок: the typed
      field, the named difference, the confirmation, then `transactionsRepo.save` of exactly the
      коригування the domain returned; `npm run verify` green.

## 4. Опис у ручній транзакції

- [x] 4.1 Add `normaliseDescription(typed)` to `src/ui/entry-form.ts` (trim, empty → `undefined`,
      design D8) and fix the module comment at `src/ui/entry-form.ts:48-53` that says the form
      never asks for one; verify with `src/ui/entry-form.test.ts` covering the transactions
      scenarios "The owner's own опис is an опис like any other" and "A cleared опис changes no
      number", and the main-screen scenarios "A typed опис is stored", "An empty опис stores none"
      and "A переказ can be explained too" through `buildEntry` for all four types.
- [x] 4.2 Add the optional опис field to the entry form on `src/app/(tabs)/index.tsx`, passed
      through `normaliseDescription` into `buildEntry`; `npm run verify` green.
- [x] 4.3 Make the опис editable in `src/app/transaction/[id].tsx`: `Form` carries it, `apply`
      passes `form.description` instead of `original.description` (`:158-160`), and
      `ImportedDescription` (`:310-325`) becomes a field labelled «Опис»; verify with
      `src/ui/entry-form.test.ts` covering the transactions scenario "Changing another field
      leaves the опис alone" and the main-screen scenarios "A wrong опис is corrected from
      editing", "An опис can be cleared" and "A manual transaction stays compact".

## 5. Пам'ять і підтвердження форми запису

- [x] 5.1 Add the one-row `entry_defaults` table to `src/db/schema.ts` (design D9) and generate
      the next migration with `npm run db:generate`; verify with `src/db/migrations.test.ts`
      covering the persistence scenarios "Pre-migration rows survive unchanged" and "A fresh
      database from migrations alone remembers a рахунок".
- [x] 5.2 Add `src/db/entry-defaults-repo.ts` (`remembered()`, `remember(accountId)`) and register
      it in `src/db/repos.ts`; verify with `src/db/entry-defaults-repo.test.ts` covering the
      persistence scenarios "The remembered рахунок comes back", "Only the latest one is kept",
      "Storing a транзакція remembers nothing by itself" and "A fresh database remembers none".
- [x] 5.3 Add `defaultAccountId(remembered, offered)` to `src/ui/entry-form.ts` and wire it into
      `src/app/(tabs)/index.tsx`: the form opens on the remembered рахунок, `store()` remembers
      the рахунок the money left, and nothing else in the app calls `remember`; verify with
      `src/ui/entry-form.test.ts` covering the main-screen scenarios "The next витрата opens on
      the same рахунок", "An import does not move the memory" and "An archived рахунок is not
      offered as the default".
- [x] 5.4 Add `recentlyUsed(feed, limit)` to `src/ui/category-choices.ts` (design D10) and render
      the recent row above the full категорія and джерело lists on `src/app/(tabs)/index.tsx`;
      verify with `src/ui/category-choices.test.ts` covering the main-screen scenarios "The last
      used категорія is one tap away", "An archived категорія is not resurrected by having been
      used" and "A fresh device offers only the full list".
- [x] 5.5 Add `recordedConfirmation(written, { accounts, categoryNames, sourceNames })` to
      `src/ui/entry-form.ts` and render it under «Записати», cleared by the next recording or the
      next field change (design D11); verify with `src/ui/entry-form.test.ts` covering the
      main-screen scenarios "The owner sees what was recorded", "An accepted комісія is part of
      the confirmation" and "A refusal is not a confirmation".

## 6. Екран «Транзакції»

- [x] 6.1 Add `search({ match, accountId, month, limit, offset })` to
      `src/db/transactions-repo.ts` (design D12: SQL narrows, the опис matches in TypeScript,
      paging applies to results); verify with `src/db/transactions-repo.test.ts` covering the
      persistence scenarios "An опис is found by part of it, in any case", "A сума finds both legs
      of a переказ", "A категорія given with the search matches its транзакції", "Filters narrow
      the search", "A month bounds the result", "Pages continue where the previous one ended" and
      "Nothing matching returns nothing".
- [x] 6.2 Add `src/ui/transaction-search.ts` with `searchCriteria(query, categories, sources)` —
      the typed query resolved into the text, the сума when it reads as one, and the matching
      категорія and джерело ids — and the paging state that keeps what is already shown; verify
      with `src/ui/transaction-search.test.ts` covering the transaction-search scenarios "The
      bank's text finds the транзакція", "A категорія is found by its name", "A сума is found as
      typed", "A транзакція matching twice is shown once", "An empty search shows the history",
      "Showing more keeps what is already shown" and "Search and filters combine".
- [x] 6.3 Add the screen `src/app/transactions.tsx`: the list through `transactionLine` +
      `overLimitByMonth`, «показати ще» paging, the рахунок and місяць narrowing with a way to
      clear it, and the two empty states; proves the transaction-search scenarios "The history
      continues past the feed's ceiling", "An empty history says so", "One рахунок at a time", "A
      місяць bounds the result", "The narrowing can be cleared", "A found транзакція is edited",
      "The marks travel with the line", "Searching changes nothing stored" and "Nothing found is
      said, not hidden"; `npm run verify` green.
- [x] 6.4 Offer the way there from `src/app/(tabs)/index.tsx` beside the «Останні транзакції»
      label, present whatever the history's length, and say the section shows the latest only;
      proves the main-screen scenarios "The whole history is one tap from the feed" and "The way
      there does not depend on having a long history"; `npm run verify` green.

## 7. Verification

- [x] 7.1 Run `npm run verify` and paste the final lines
- [ ] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

## 8. What the emulator showed (2026-09-01)

The smoke of this change found one defect. Everything else it exercised held: «Усього грошей» on
Головний and per-kind totals on «Рахунки», the «Транзакції» screen with its search and its рахунок
and місяць narrowing, a tap on a рахунок opening its рухи and its звірка, the опис field on the
form and the опис on the feed line, the рахунок of the last manual entry surviving a force-stop,
the ряд «Нещодавні» reordering after use, and «Записано: витрата 42,00 UAH — Без категорії.»
after «Записати».

- [x] 8.1 The offer of the whole history loses its last word. `src/app/(tabs)/index.tsx:692` passes
      `title="Усі транзакції та пошук"`, and a fresh launch draws all of it. Once the keyboard has
      been open on Головний — record a витрата, or type in any field — the pill keeps its full
      measured width and draws «Усі транзакції та». The box is unchanged, so the container is not
      squeezing the text; the paint drops the trailing word after the IME re-layout.
      Requirement: main-screen «The whole history is one tap from the feed» — an affordance that
      reads as an unfinished phrase does not name where it goes.
      Fix in `RowAction` (`src/components/form.tsx:176`), whose label is a single line by design
      and whose box is already sized to the whole string. Re-smoke the keyboard path afterwards:
      `verify` is Node-only and cannot see a paint.
