# daily-usability — design

## Context

See proposal.md — Why. Nothing here is a new mechanism: `computeBalance` and `reconcile`
(`src/domain/account.ts`), `approximateUah` with its staleness rule (`src/ui/approx-uah.ts`),
`transactionLine`/`overLimitByMonth` (`src/ui/transaction-line.ts`), `buildEntry` with its
`description` field (`src/ui/entry-form.ts:48-53`) and the transactions repo's four queries
(`src/db/transactions-repo.ts`) all exist and are proven. What is missing is that they are never
put in front of the owner: no total is computed from the balances the Рахунки screen already
holds, no query takes a text, the tap that should open a рахунок's history opens its rename form,
and the entry form throws away everything it just learned about the owner's habits.

The idiom to copy is the one the repo already uses everywhere: every decision pure in
`src/ui/`/`src/domain/` under Vitest, screens as wiring, `npm run verify` Node-only and under a
minute, and only one new append-only migration.

## Goals / Non-Goals

**Goals:**

- Six slices, each with its own tests and its own `verify`, mergeable one at a time.
- Every new number is derived from what is already stored: no cached totals, no counters, no
  second source of truth. The one thing genuinely remembered — the рахунок of the last hand-made
  запис — is a preference, not money.
- Nothing new goes into `src/app/*.tsx` that could have been proven in `src/ui/`: totals, the
  search criterion, the recent lists, the confirmation sentence and the фактичний залишок parse
  are all pure functions.

**Non-Goals:**

- No change to any monthly number, its formula or its wording (`monthly-picture`, `month-screen`
  untouched).
- No native, Expo-config or permission change; no new dependency; the only network is the
  monobank rate endpoint the app already calls.
- No new table beyond the one-row preference; no schema change to `transactions`.

## Decisions

**D1. One change, six slices, applied in order; they are not parallelisable.**
Four of the six (money line, опис, form memory, way to «Транзакції») edit
`src/app/(tabs)/index.tsx`, and two edit `src/app/(tabs)/accounts.tsx`, so worktree lanes would
collide on the two biggest screen files. The task order is: money held → рухи рахунку → звірити
anywhere → опис → form memory and confirmation → «Транзакції». «Звірити» depends on рухи рахунку
(it lives on that screen); nothing else depends on anything else.

**D2. «Скільки всього грошей» counts every unarchived рахунок of every вид.**
The question the owner asked is "how much money is there", so the answer may not quietly drop a
рахунок shown right above it. The вид subtotals are what separates money in hand from money that
is saved, invested or lent — that separation is the вид's whole job (glossary: *Account kind*).
Alternatives rejected: totalling only `spending` + `cash` (the number would silently disagree
with the rows above it, and the owner would have to add the rest by hand); netting рахунки-борги
out (a debt рахунок's balance is money the owner is owed, and hiding it makes «залишилось» and
the total tell different stories about the same lending).

**D3. Totals are a pure function over the balances the screen already computed.**
`src/ui/account-totals.ts`: `accountTotals(accounts, computed: Map<id, Money>)` →
`{ perKind: Map<AccountKind, Money[]>, total: Money[] }`, each list ordered UAH-first then
alphabetically. That ordering already exists as the private `byCurrency` in
`src/ui/month-screen.ts:93`; it moves to `src/ui/amount-input.ts` (where money formatting already
lives) and both modules import it — one rule for the order of currencies, not two. The Рахунки
screen keeps building the `computed` map exactly as it does today (`accounts.tsx:62-79`); the
totals cost one pass over it.

**D4. The rate refresh becomes a hook shared by the three screens that approximate.**
`src/app/(tabs)/month.tsx:70-105` holds the only refresh effect today (`shouldRefreshRates`,
`fetchMonobankRates`, `ratesRepo.upsert`, then `reload()`), asked at most once per focus. It moves
verbatim into `src/hooks/use-current-rates.ts` and is used by Місяць, Рахунки and Головний. The
staleness rule, the per-currency judgement and the silent failure are the existing spec's and do
not change. Alternatives rejected: copying the effect twice more (three copies of a rule that is
already subtle), and refreshing only on Місяць (an owner who never opens Місяць would never see
an approximation on Рахунки).

**D5. Головний shows one money line, named so it cannot be the month's «Залишилось».**
«Усього грошей» above the entry card, per currency plus the marked approximation; the monthly
numbers stay on Місяць. This is deliberately not the fix for «Залишилось −2650,00 UAH» being the
scariest number in the app — that is the next BACKLOG item and its own change; this one only
makes sure Головний opens on money the owner actually has.

**D6. Рухи рахунку is a pushed screen, and it is where a рахунок's own actions live.**
`src/app/account/[id].tsx`, the same shape as `src/app/category/[month]/[categoryId].tsx`: read
`listByAccount`, render the feed's line through `transactionLine` + `overLimitByMonth`, tap →
`/transaction/[id]`. The Рахунки screen keeps creating рахунки («+») and keeps the linked
«Звірити · різниця» row action; the editing form moves here behind an explicit action. To keep
one set of rules for both screens, the draft's logic goes pure into `src/ui/account-form.ts`
(`blankDraft`, `draftFrom(account)`, `accountFromDraft(draft, id)` — including the «рахунок
потребує назви» refusal now inlined at `accounts.tsx:105-127` and untested), and the two screens
render fields from it. Alternatives rejected: long-press to edit (undiscoverable), an edit icon
on every row (clutter on the screen whose job is reading balances).

**D7. A фактичний залишок parses like an opening balance, but an empty one is a refusal.**
`parseAmount` demands a positive number and cannot express a рахунок at zero or below;
`parseOpeningBalance` (`src/ui/amount-input.ts:52`) accepts sign and zero but reads `''` as
`0,00`, which would turn an untouched field into "I recounted and there is nothing". So
`parseActualBalance(typed, currency)` is added beside them: the same rules, `''` rejected in the
owner's own words. `reconcile()` is then called exactly as Рахунки calls it today
(`accounts.tsx:147-178`), including its `undefined` for equal balances, which the screen reports
as "already agree" instead of silently doing nothing.

**D8. The опис is one optional field, normalised in one place.**
`EntryDraft.description` already exists and `buildEntry` already threads it into all four types —
only the form never filled it. Both screens get a single-line field; `normaliseDescription(typed)`
in `src/ui/entry-form.ts` trims and turns empty into `undefined`, so the column keeps storing NULL
and never `''` (schema comment, `src/db/schema.ts:108-113`). In editing, `apply` passes
`form.description` instead of `original.description` (`src/app/transaction/[id].tsx:158-160`) and
`ImportedDescription` (`:310-325`) becomes a field labelled «Опис» — the label stops saying «від
банку» because it is no longer only the bank's.

**D9. The remembered рахунок is a one-row preference table, written only by the hand-entry path.**
Next migration in sequence (`npm run db:generate`), table `entry_defaults`: `id TEXT PK CHECK (id
= 'entry')`, `account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT` — the same
single-row idiom as `daily_reminder` (`src/db/schema.ts:478`). `entryDefaults.remember(accountId)`
is called from Головний's `store()` and from nowhere else, so a monobank sync, a Saldo import and
a confirmed чернетка leave it alone. Alternatives rejected: deriving the default from the latest
stored транзакція (one sync of the mono black card would repoint it on every launch, which is
exactly the wrong рахунок for someone whose manual entries are cash), and module state like
`landedOnSetup` (it dies with the process, and "the app forgets" is the complaint).

**D10. Recent категорії and джерела are read off the feed, never counted.**
`recentlyUsed(feed, limit)` in `src/ui/category-choices.ts`, over the `listLatest(FEED_SIZE)`
the screen has already loaded: distinct категорії of the latest транзакції carrying one, most
recent first, archived ones dropped (the existing `expenseCategoryChoices` filter decides that,
not a second rule). No table, no migration, no ranking to explain. The full list stays exactly as
it is under the recent row; a категорія may appear in both and is marked selected in both.
Alternative rejected: a usage counter — a table and a migration to answer "часті" when "останні"
is what the owner reaches for.

**D11. The confirmation is a line inside the entry card, not an Alert and not a Toast.**
`Alert` blocks and eats the next tap (which is exactly what the emulator pass complained about
elsewhere); `ToastAndroid` is Android-only and iOS must stay possible. So `store()` sets a
confirmation string built by `recordedConfirmation(written, { accounts, categoryNames,
sourceNames })` in `src/ui/entry-form.ts`, rendered under «Записати», and cleared by the next
recording or the next change to any field. No timer: nothing to race in a smoke test and nothing
that disappears before the owner looks up.

**D12. The search narrows in SQL and matches text in TypeScript.**
SQLite's `LIKE` and `lower()` fold ASCII case only, so «СІЛЬПО» would never match a typed
«сільпо» — the owner's data is Ukrainian, so an SQL-only text search is not an option.
`transactionsRepo.search({ match?: { text, amountMinor?, categoryIds, sourceIds }, accountId?,
month?, limit, offset })` therefore narrows in SQL by рахунок, month, сума and category/source
ids (the AND filters plus the cheap half of the OR-group), reads that narrowed set in the latest
listing's order, applies the опис match in TypeScript with `toLocaleLowerCase('uk')`, and only
then applies `limit`/`offset` — so a page is a page of results, not of candidates. Resolving the
typed query into ids and a сума is pure and lives in `src/ui/transaction-search.ts`
(`searchCriteria(query, categories, sources)`), so the same query is tested twice: once as a
criterion, once as a query. Ceiling: this reads the narrowed rows into memory — fine for the
hundreds-to-low-thousands this app holds (the Saldo export was 188). If it stops being fine the
next step is a lowercase shadow column filled by a migration; FTS5 is not an option worth relying
on in the Expo SQLite build.

**D13. The «період» filter is a місяць.**
The app's period is the calendar month everywhere (glossary: *Month*), `src/ui/months.ts` already
builds and labels the list, and `listMonth`'s lexicographic bound is the same one the search
needs. A free from/to range would add two parsed date fields to get wrong for a question the
month already answers.

**D14. «Транзакції» is pushed over the tabs, not a sixth tab.**
`src/app/transactions.tsx`, reached from an action beside the «Останні транзакції» label on
Головний — search is somewhere you go from the стрічка, not somewhere you live. The five tabs are
the tech task's and stay. The рухи рахунку screen deliberately does not re-implement search: the
searchable version of "this рахунок's history" is «Транзакції» narrowed to that рахунок.

## Risks / Trade-offs

- **Головний grows: money line, entry card, чернетки, стрічка — and the form gains a field.** →
  The money line is one line, the опис is one line, and the recent-категорії row removes far more
  scrolling than the field adds. Smoke on the emulator with the form open is the check; if it
  reads long, the опис field is the first thing to move behind a disclosure — a screen decision,
  not a spec change.
- **Two large numbers in the app («Усього грошей» here, «Залишилось» on Місяць) can be confused.**
  → Different screens, different names, and Головний shows no monthly number at all. Named in the
  spec so a later change cannot quietly put them side by side.
- **The rate refresh now runs from three screens.** → Same one-hour per-currency staleness rule,
  same at-most-once-per-focus guard, same silent failure; the endpoint is public and tokenless.
  Three screens asking within the hour still produce one request.
- **Text matching in TypeScript reads the narrowed rows into memory.** → Bounded by the рахунок,
  month and сума filters; the ceiling and its next step are named in D12, and `verify` covers the
  paging contract regardless of where the filtering happens.
- **A remembered рахунок could resurrect an archived one as the default.** → The screen resolves
  it against the offered list; the spec has the scenario, and the test with it.
- **Renaming a рахунок becomes one tap further away.** → It moves to where a рахунок's own
  actions belong, and the tap that used to open it now opens what the owner was actually reaching
  for. Explicit smoke scenario: rename a рахунок from its рухи.
- **Six slices are a large diff for one change.** → Task groups are per slice, each ending green,
  and D1 fixes their order; a group can be merged before the next is begun.

## Migration Plan

One new append-only migration generated by `npm run db:generate` for `entry_defaults`; no other
table changes shape and nothing is backfilled. Committed migrations stay untouched
(`.claude/rules/database.md`), and `src/db/migrations.test.ts` gains the case that every committed
migration applied in order yields a database that can remember and read back a рахунок while every
pre-existing row survives. Rolling the code back leaves the table in place and unread, which is
harmless: nothing else references it.

## Open Questions

- How many категорії the recent row should hold (five to start) and how many транзакції one page
  of «Транзакції» should be (a hundred to start). Both are numbers to tune after the emulator
  pass; neither changes a requirement, a module boundary or a task.
