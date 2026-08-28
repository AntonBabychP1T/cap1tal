# investments-value — design

## Context

See proposal.md — Why. Almost everything this step needs already exists: `src/domain/account.ts`
computes the розрахунковий баланс of any рахунок, `src/ui/account-groups.ts` turns рахунки into
the rows Рахунки renders, and `src/app/(tabs)/accounts.tsx` already shows a second, foreign number
beside a рахунок's own — the баланс банку — with the discipline this change needs: two named
figures, neither ever written over the other. The step adds one small stored entity (the поточна
вартість), two pure functions, and three numbers on one kind of row.

Constraints that shape it: money stays integer minor units beside its currency code end to end,
the domain reads no clock and imports nothing from `src/db` or React, committed migrations are
immutable, and `npm run verify` stays Node-only and under a minute.

## Goals / Non-Goals

**Goals:**

- Вкладено is derived, never stored: one number for "money put in", computed from the same
  транзакції as every other balance in the app.
- Every determination the specs name — вкладено, прибуток/збиток — is a pure function testable
  without a database or a screen.
- One new append-only migration; nothing about existing tables, rows or mappers changes.
- The вартість cannot exist in an invalid shape: wrong currency, wrong вид of рахунок or a
  negative сума is refused by the only writer, not just by the form.

**Non-Goals:**

- No history of вартості and no shape that could later be mistaken for one: one row per рахунок,
  replaced in place.
- No approximate-UAH figure and no total across інвестиційні рахунки on Рахунки — the screen has
  never had one and this change does not introduce the first.
- No new screen: the three numbers and their entry live on the row that already shows the
  рахунок.

## Decisions

### D1. Вкладено is `computeBalance`, not a second sum

`src/domain/investments.ts` exposes `contributed(account, transactions)` which, for a рахунок of
вид `investment`, returns `computeBalance(account, transactions)` and rejects any other вид.

FR-I1 words вкладено as «нетто цих переказів». For an інвестиційний рахунок the two are the same
number — its транзакції are перекази — with one deliberate addition: the початковий залишок. That
matters concretely, because the Saldo import gives an imported інвестиційний рахунок an opening
balance from Saldo's opening rows (`src/saldo/interpret.ts`); summing only перекази would show
that money as pure прибуток the moment a вартість is entered. Money that was in the рахунок before
the app started is money put in, and the owner can edit the початковий залишок exactly where every
other one is edited.

Alternative rejected: folding transfers only, with the opening balance added back as a special
case — the same number by a longer road, and a second definition of a balance in the codebase.
Alternative rejected: storing a running "contributed" total — the drift risk `goals` already
refused for progress.

Consequence worth naming: a коригування recorded by hand on an інвестиційний рахунок moves
вкладено. That is correct and unavoidable under "every hryvnia is explained by транзакції" — but
it is why the specs forbid «Звірити» against a вартість: reconciling would silently convert a
прибуток into a коригування, which the month counts as дохід.

### D2. Прибуток is `subtract(вартість, вкладено)` and exists only with a вартість

`gainLoss(value, contributed)` in the same module: `subtract` from `src/domain/money.ts`, which
already refuses to combine two currencies. No вартість, no прибуток — the function is simply not
called, and the view model's field is absent rather than zero, so "worth exactly what went in"
(0) and "we do not know what it is worth" stay different states on the screen.

### D3. `investment_values`: its own table, primary-keyed by рахунок

A new table `investment_values`: `account_id` TEXT primary key referencing `accounts`
(`onDelete: 'restrict'`, like every other reference to a рахунок — рахунки archive, never
delete), `amount` INTEGER, `currency` TEXT, `as_of` TEXT ('YYYY-MM-DD').

The primary key *is* "at most one вартість per рахунок": recording is an upsert, clearing a
delete, and a second row is not representable. `CHECK (amount >= 0)` and the ISO-date `GLOB`
check keep the rest out. This is `category_limits` again (limits-goals-reports D1), for the same
reasons: nullable columns on `accounts` would thread вартість-awareness through the accounts
mappers, repos and every screen that builds an `Account`, and would make a half-set pair (a сума
without its currency) representable.

The currency column stays even though the рахунок has one, for the reason `goals` kept its own
(D2 there): an amount without its currency code beside it would be the first such amount in the
schema.

### D4. The two invariants SQLite cannot express live in the one writer

`src/db/investments-repo.ts` refuses a вартість whose рахунок is missing, is not of вид
`investment`, or is in another currency — a read-and-compare in `save`, exactly as `goals-repo`
does for its currency invariant, because SQLite cannot express "equal to / among the values of a
column in another table" without a trigger. Every path writes through this repo, so the shapes the
specs reject are not representable in storage either, not merely refused by a form.

### D5. The дата is the day the вартість was entered, and is not asked for

A вартість carries `as_of`, the calendar date it was entered, so a figure typed in June cannot
present itself as today's worth. The screen passes `todayIso(new Date())` — the same clock read
every other screen does; the domain and the repo take the date as a value.

The owner is deliberately not offered a date field. Vision §10 says "occasionally enters the
**current** value"; a date the owner could set turns one honest observation into a sparse,
hand-maintained series with no way to tell a typo from a backdated truth, and the specs (no
history) do not have a second row to put it in. Re-entering replaces сума and дата together.

### D6. The three numbers ride the existing Рахунки row model

`src/ui/account-groups.ts`'s `AccountRow` gains an optional investment block (вкладено's formatted
string, and — when a вартість exists — the formatted вартість, its дата and the formatted
прибуток with its sign). `accountRows` already takes a map of computed balances keyed by рахунок
id; it gains a second map of вартості from the same screen query, the way `bankBalances` arrives
today. The row keeps one main amount: for an інвестиційний рахунок that amount is labelled
вкладено rather than shown twice.

Entering runs through the same `Card` form machinery the screen already has (`Field`, `Action`,
`failureMessage` from `src/ui/labels.ts`), so a rejection from D4 surfaces as «Не збережено» like
every other refusal on that screen. `Alert`-based confirmation is used for clearing, matching
«Звірити»'s confirm-before-write habit.

The typed сума needs its own small parser in `src/ui/amount-input.ts`: `parseAmount` refuses zero
(a транзакція of nothing is not a транзакція) and `parseOpeningBalance` accepts negatives (a card
can be in overdraft). A вартість is neither — zero is a real answer and below zero is not — so it
gets a third entry point beside them rather than a caller that post-checks a sign, keeping "what
this kind of amount may be" in the one module that parses amounts.

### D7. One migration, generated

`npm run db:generate` produces `0007_*` adding `investment_values`; `drizzle/migrations.js` is
regenerated. `src/db/migrations.test.ts` gains the checks `.claude/rules/database.md` demands: a
fresh database from migrations alone stores a вартість, and rows stored under 0000–0006 survive
0007 unchanged with no рахунок gaining an invented вартість.

### D8. The glossary gains the two terms the code will use

`docs/glossary.md` currently defines «Прибуток / збиток» in terms of two things it never names as
entries. This change adds «Вкладено» and «Поточна вартість» to the Accounts section and points
«Прибуток / збиток» at them, so hard rule 7 ("glossary terms verbatim, no synonyms") has the terms
`contributed` / `currentValue` / `gainLoss` actually stand for. No behaviour follows from this
task; it is what keeps the vocabulary one vocabulary.

## Risks / Trade-offs

- [A вартість silently goes stale — the owner reads a June figure in September] → the дата is
  shown beside it always (D5, and the accounts-screen spec), and no threshold or warning is
  invented: the product has no notifications and a "stale" rule would be a number nobody agreed on.
- [A hand-recorded коригування on an інвестиційний рахунок moves вкладено and so moves прибуток] →
  accepted and named in D1: it is what "every hryvnia is explained by транзакції" costs, and the
  specs keep «Звірити» away from the вартість so it cannot happen by accident.
- [Вкладено uses the початковий залишок, which for an imported рахунок is Saldo's opening figure —
  a value, not a contribution] → accepted: it is the best number the app has, it is visible, and it
  is editable on the рахунок like any other opening balance.
- [One more query per Рахунки opening] → one `SELECT` over a table with one row per інвестиційний
  рахунок (single digits), read on focus like everything else on that screen.

## Migration Plan

1. Extend `src/db/schema.ts` with `investment_values`; `npm run db:generate` → `0007_*`;
   regenerate `drizzle/migrations.js`. Committed migrations 0000–0006 are untouched.
2. Migration tests per D7 before any repo or screen work.
3. `src/db/investments-repo.ts` with the D4 checks, wired through `src/db/repos.ts`.
4. `src/domain/investments.ts`, then the view model, then the screen.
5. Rollback is git-revert before commit; after commit the migration is immutable — a follow-up
   migration would drop the table if it ever had to go.

No new dependency, no native module, no permission, no Expo config change, no network call.
