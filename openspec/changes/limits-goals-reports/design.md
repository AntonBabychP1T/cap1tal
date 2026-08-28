# limits-goals-reports — design

## Context

See proposal.md — Why. Everything this step shows is already computable: `src/domain/monthly-picture.ts`
holds the month's numbers and the breakdown, `src/domain/account.ts` the розрахунковий баланс,
`src/ui/months.ts` the month arithmetic and Ukrainian names. The step adds two small stored
entities (ліміти, цілі), one pure fold over history (reports), one new tab and two settings
sections. Constraints that shape the design: money stays integer minor units end to end, domain
and UI logic stay pure TypeScript with no React imports so `npm run verify` stays Node-only,
committed migrations are immutable, and no new native module may be needed.

## Goals / Non-Goals

**Goals:**

- Every determination the specs name — over-limit, progress, reached, overdue, the history
  series — is one pure function, testable without a database or a screen.
- One new append-only migration; nothing about existing tables, rows or mappers changes.
- No new dependencies: charts are laid out by pure TypeScript and drawn with plain views.

**Non-Goals:**

- No general charting layer — the two charts of this change are the deliverable, not a library.
- No caching or incremental recomputation of the history series; 5k transactions fold in one
  pass well inside the NFR budget, so precomputation would be complexity without a payer.
- No enforcement of the ціль-currency invariant inside SQLite — see Decisions.

## Decisions

### D1. Ліміти live in their own table, not as columns on categories

A new `category_limits` table: `category_id` (primary key, references `categories`), `amount`
integer, `currency` text. The primary key IS the "at most one ліміт per category" rule; setting
is an upsert, clearing a delete. Alternative — nullable `limit_amount`/`limit_currency` columns
on `categories` — was rejected: it would thread limit awareness through the existing categories
mappers, repos and seed logic that this change otherwise never touches, and a half-set pair
(amount without currency) becomes representable. The same argument shaped `categorisation-rules`:
a thing that points at a category is its own table.

### D2. Цілі are a table with a рахунок reference; the currency invariant is enforced twice

A new `goals` table: `id` text primary key, `name` text, `amount` integer, `currency` text,
`deadline` text (ISO date, like transaction dates), `account_id` references `accounts`. The
"target in the linked рахунок's currency" rule is enforced in both places it could break: the
goal editor flow (re-)enters the target in the рахунок's currency, exactly as main-screen
re-asks an amount when an account choice changes currency, and `goals-repo` rejects a ціль
whose currency differs from its linked рахунок's — a read-and-compare in the repo, not a SQLite
trigger — so the mismatch the money rules forbid is not representable in storage either
(spec-reviewer's point: the editor alone leaves the bad row expressible). The currency column
stays: an amount without its currency code would be the first such amount in the schema, and the
alternative — dropping the column and deriving the currency by joining `accounts` on every
read — is the more invasive shape for the same invariant.

### D3. One migration, both tables

`npm run db:generate` produces migration `0006_*` adding `category_limits` and `goals`. Both
persistence requirements say "a new migration"; one migration satisfies both — they ship
together, there is no state where one exists without the other. `src/db/migrations.test.ts`
gains the two checks `.claude/rules/database.md` demands: a fresh database from migrations alone
stores ліміти and цілі, and rows stored under 0000–0005 survive 0006 unchanged.

### D4. Determinations are three small pure modules

- `src/domain/limits.ts` — `overLimit(spentInLimitCurrency, limit)` plus a helper that, given a
  month's breakdown and the limits, yields the over-limit category ids. Strictly-greater
  comparison, per the limits capability.
- `src/domain/goals.ts` — `goalProgress(balance)`, `isReached`, `isOverdue(deadline, today)`;
  `today` is an argument, never `new Date()` inside, so tests pin the clock the way
  `src/ui/dates.ts` consumers already do.
- `src/domain/reports.ts` — the history series: take every stored транзакція plus the current
  month, derive the span (earliest month … max(current, latest month)) with its own small month
  arithmetic on ISO dates — domain never imports from `src/ui`, so `months.ts` stays where it
  is and reports does not reach for it — and fold `monthly-picture` per month. The
  category series is the same fold keeping one breakdown row. Monthly-picture itself is not
  touched — reports consumes it, which is what keeps "each month equals its monthly picture"
  true by construction.

### D5. Reports read the whole history through one new repo listing

`transactions-repo` gains `listAll()` returning every stored транзакція once (no ordering
contract — the fold groups by month itself). Alternative — iterate `listMonth` over the span —
was rejected: it is O(months) queries for the same rows and needs a separate "earliest date"
query anyway. One `SELECT` of ~5k rows is the cheap, obvious read.

### D6. Charts are plain views over a pure layout model

`src/ui/reports-screen.ts` builds everything renderable as data: per-month bar heights normalised
against the series' largest absolute value, negative values flagged for below-baseline drawing,
month labels from `months.ts` (short Ukrainian month + year), the currency chooser (offered
currencies, UAH-first default per the spec), and the category chooser fed by the same
"categories the history carries" derivation the spec names. `src/app/(tabs)/reports.tsx` maps
that model onto `View`s — coloured bars in a horizontally scrollable row — the way every other
screen maps its view model. Alternatives rejected: `react-native-svg`/victory (new native-ish
dependency, config churn, iOS risk — for two bar charts), and canvas/webview (worse on every
axis). If bars ever need to become lines, the layout model is where the change lands; the spec
does not name the mark's shape.

### D7. Over-limit marking rides the existing view models

- Month screen: `src/ui/month-screen.ts` breakdown rows gain an `overLimit` flag, computed by
  `domain/limits.ts` from the row's own amount when the row's currency is the ліміт's.
- Feed: `src/ui/transaction-line.ts` gains an `overLimit` flag on lines that show a category.
  The screen computes, for each distinct month present in the loaded feed (typically one or
  two), that month's breakdown via `listMonth` + monthly-picture, and hands the resulting
  over-limit set per month to the line builder. The drill-down list on Місяць reuses the same
  flag through `category-transactions.ts`, satisfying "wherever a category's month-scoped
  транзакції are listed".

### D8. Settings sections follow the list-management pattern

`src/ui/settings-sections.ts` gains «Ліміти» and «Цілі» entries; screens land beside the
existing ones as `src/app/manage/limits.tsx` and `src/app/manage/goals.tsx`, their logic in
`src/ui/limits-section.ts` and `src/ui/goals-section.ts` (amount entry through the existing
`amount-input.ts`, dates through `dates.ts`, account offering through `account-choices.ts`).
The «Звіти» tab is added in `src/app/(tabs)/reports.tsx` and ordered in `_layout.tsx` between
Рахунки and Налаштування.

No new native module, no new permission, no Expo config change anywhere in this change.

## Risks / Trade-offs

- [Feed marking needs a per-month breakdown, an extra read per feed month] → months in a loaded
  feed are few and `listMonth` + the fold are already sub-millisecond at this scale; if the feed
  ever pages years deep, the flag computation is confined to one function fed by the screen.
- [`listAll` on every «Звіти» opening rereads everything] → accepted: one query, one pass, ~5k
  rows against a one-second NFR measured on ten times less; no cache to invalidate.
- [Two цілі on one рахунок double-count the same money] → accepted and intended: a ціль reads a
  баланс, it does not own money; the spec says so and the screen shows each ціль against the
  same рахунок by name.
- [A ліміт in a currency the category is never spent in silently never fires] → accepted: the
  determination is honest per currency (no conversion by design); the «Ліміти» section shows the
  ліміт's currency next to the сума so the mismatch is visible where it is set.

## Migration Plan

1. Extend `src/db/schema.ts` with `category_limits` and `goals`; `npm run db:generate` → `0006_*`.
2. New repos (`limits-repo.ts`, `goals-repo.ts`) and `listAll` in `transactions-repo.ts`; wire
   through `repos.ts`.
3. Migration tests per D3 before any screen work; committed migrations 0000–0005 untouched.
4. Rollback is git-revert before commit; after commit the migration is immutable — a follow-up
   migration would remove the tables if ever needed.

## Open Questions

- The exact visual of the bars (colour set, grouped vs stacked per month) is a rendering choice
  inside D6's layout model; the specs constrain only what is shown, so it can settle during
  implementation on the emulator.
