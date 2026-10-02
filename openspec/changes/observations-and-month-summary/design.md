## Context

See proposal.md for the why. The approach depends on what already exists:

- **Every reading is derived, nothing is stored.** Головний, Звіти, Статок and the AI-аналіз
  screen read the whole history through the stamp-keyed `storedHistory` memo
  (`src/db/stored-history.ts`). A repeated read between writes costs nothing; `stampedMemo` lets
  any derivation share that guarantee. Місяць reads only `listMonth(shown)` and the month before
  it today.
- **Most of the arithmetic exists.**
  - `src/analysis/trends.ts`: `medianOf` (half-away rounding of an even median),
    `largestPerMonthByKey`, `recurrenceOf`.
  - `src/analysis/details.ts`: `foldMerchant`, the пакет's «Продавець».
  - `src/domain/monthly-picture.ts`: `monthlyPicture`, `categoryBreakdown`.
  - `src/domain/net-worth.ts`: `monthFigures`, which gives each month's зміна and розбивка.
  - `src/domain/limits.ts`: `overLimitBy`.
  - `src/domain/goals.ts`: `spendingGoalState`.
  - `src/progress/norm.ts`: `completedMonthsIn`, the rule for завершені активні місяці of a
    currency, over a `ProgressSummary`.
- **No transaction knows where it came from.** `transactions` has no origin column. Imported bank
  ids live in `monobank_imported_items` without a link back to a транзакція id. So «same purchase
  through two doors» is recognisable only by its shape: same рахунок, сума and date, and a
  different text.
- `transactionsRepo.save` is an upsert (`onConflictDoUpdate`), so a child row with `ON DELETE
  CASCADE` survives every edit. `counterpart_income_awaits` relies on exactly this.
- **The dashboard registry is closed** (`src/dashboard/layout.ts`). Its canonical order is also
  the fresh-install order. The normalizer appends any id a saved layout lacks at the end, hidden.
  `homeDashboardReadPlan` decides what Головний reads.
- **The working tree is shared right now.** `rule-template` is archived with migration `0009`;
  this change took `0010` at apply. `category-icons-and-transaction-visuals` (3/31) and `voice-entry` (0/20) are
  open. Two more were proposed the same day, and both touch this change (D11):
  - `merchant-normalization` makes the продавець an entity recognised from the опис;
  - `commitments` renames Місяць's «Розстрочки» block to «Платежі місяця».

  This change edits none of their files. It takes the next free migration number and the next
  `BACKUP_SCHEMA_VERSION` at apply time.

## Goals / Non-Goals

**Goals:**
- Detectors that are pure functions of (stored history, «Не дубль» answers, today). They hold
  numbers only, are tested scenario by scenario in Node, and are shared by all three places that
  show them.
- A підсумок that does not recompute a number some screen already owns. It calls the same
  functions, so the "equals Місяць / equals Статок" scenarios hold by construction and a test
  proves it.
- One new table, additive, in the бекап as an optional section, with no format-version bump.

**Non-Goals:**
- A generic rule engine or user-defined detectors. The catalogue is a closed union, as the
  dashboard registry is.
- Caching спостереження across stamps or persisting them.
- Any change to `src/analysis/` behaviour. Its helpers are imported, not altered. Moving
  `foldMerchant` or `medianOf` to `src/domain/` is out of scope; they are already pure.

## Decisions

### D1. Two pure modules, and the screens only format

- **`src/observations/`** (no React, no db):
  - `thresholds.ts`: every constant of D3, nothing else.
  - `window.ts`:
    - `finishedActiveMonths(transactions, currency, today)`;
    - `windowOf(month, currency, …)`: up to six months, at least three, or none;
    - `typicalOf`: the median of a категорія over the window, zero-filled;
    - `typicalSpentOf`;
    - `noticeableOf`: the поріг помітності.
  - One file per detector:
    - `vs-typical.ts`
    - `early.ts`
    - `run.ts`
    - `price-change.ts`
    - `merchant-outlier.ts`
    - `duplicates.ts`
  - `order.ts`: the fixed order.
  - `observations.ts`: `observationsOf({ month, today, transactions, categories, answers,
    merchantKeyOf? })`, and `observationsIn(ledger, …)` over a ledger already built (the підсумок
    reuses its own). No detector classifies a переказ, so no рахунки are read. For the current
    month it runs the current-month detectors, for a завершений активний місяць the finished-month
    ones, and otherwise it returns `[]`.

  The input is domain `Transaction[]` from the stored history, not a `ProgressSummary`: the
  detectors need individual описи, рахунки and dates. Transactions are grouped once per call with
  `byMonth` (`src/analysis/monthly.ts`). The cost is O(n) per call, plus a median per (категорія,
  currency).
- **`src/month-summary/`** (no React, no db): `monthSummaryOf({ month, today, history, limits,
  goals, waitingDraftsInMonth, figures, answers })`. It returns per-currency sections of `Money`
  and counts, calling:
  - `monthlyPicture` and `categoryBreakdown` for the картина and «Найбільше змінилися»;
  - `typicalSpentOf` from `window.ts`, so the summary's типова сума of витрачено and the
    detectors' are one function;
  - the `MonthFigure` of `monthFigures` for the статок (D6);
  - `overLimitBy`/`spendingGoalState` for ліміти;
  - a new `compositionBalanceChange(transactions, accountIds, month)` for цілі (D7);
  - `observationsOf` for the спостереження.
- **`src/ui/observations.ts`** turns an `Observation` into its sentence and route (D4).
  **`src/ui/month-summary-screen.ts`** turns a summary into rows. The screens only lay out what
  these return.

*Why the domain holds numbers and not sentences:* the scenarios assert numbers and percentages.
Wording is polished at the emulator, and a test that pins a sentence in the domain would make
every polish a domain change. The `challenges` precedent builds text in `src/progress/`, but
those sentences are part of the виклик's spec (its reason and criterion). Here the spec names
what a sentence carries, not its words.

*Alternative rejected:* computing спостереження in SQL. Medians, windows and pairwise duplicate
search are domain logic (database.md: compute in the domain unless measured too slow), and
`storedHistory` already holds every row in memory.

### D2. One window rule, proven equal to the норма's

`finishedActiveMonths` re-implements the `completedMonthsIn` rule over транзакції: a calendar month
that has ended by today and holds at least one транзакція naming the currency. For a переказ, that
is either leg's currency, the way `ProgressSummary` rows count them. A parity test builds a
`ProgressSummary` and a `Transaction[]` from one fixture and asserts both functions name the same
months. That keeps «завершений активний місяць of a currency» one definition, as the glossary
demands, without making the observations depend on the progress repository.

Медіана: `medianOf` from `trends.ts`, which refuses an empty list, so every caller has its
three (window) or one (price, продавець) values in hand before asking: the mean of the two middle
values via `averageMinor`, half away from zero. The поріг is `roundHalfAway(typicalSpent × 300, 10 000)` from `net-worth.ts`. Every
comparison is in integers. The percentage tests are `|A − T| × 10 000 ≥ 2 500 × T` in BigInt where
a product could pass 2^53, the way `recurrenceOf` already does.

### D3. Thresholds as named constants

```
WINDOW_MONTHS = 6            WINDOW_MIN_MONTHS = 3
NOTICEABLE_BP = 300          // поріг помітності: 3 % of the типова сума of витрачено
TYPICAL_BAND_BP = 2500       // ±25 % against типова сума
RUN_MIN = 3                  // «третій місяць поспіль»
PRICE_BAND_BP = 500          // regular = within 5 %; changed = outside 5 %
PRICE_RANGE = [1/2, 2]       // nearest charge must lie within ×½..×2 of the usual
PRICE_PRIOR_MONTHS = 3
MERCHANT_RATIO = 3           MERCHANT_MIN_EARLIER = 3      MERCHANT_LOOKBACK_MONTHS = 12
DUPLICATE_DAY_SPAN = 1
HOME_LIMIT = 3               HOME_SUMMARY_DAYS = 7
CORRECTION_MEASURE_BP = 200  // vision §15: коригування < 2 % of витрачено
```

Each constant carries a comment with its reason, in the style of `trends.ts`. The owner
overturns a threshold by editing its constant, and the scenarios that pin it change with it.

### D4. The `Observation` union and its sentences

```ts
type TxRef = { id; date; accountId; amount: Money; description?; categoryId? }
type Observation =
  | { kind: 'possible-duplicate'; currency; amount: Money; accountId; first: TxRef; second: TxRef }
  | { kind: 'price-change'; currency; transaction: TxRef; usual: Money; changePercent }
  | { kind: 'merchant-outlier'; currency; transaction: TxRef; usual: Money; ratioTenths }
  | { kind: 'category-early'; currency; categoryId; daysElapsed; soFar: Money; previousWhole: Money }
  | { kind: 'category-vs-typical'; currency; categoryId; amount: Money; typical: Money; changePercent }
  | { kind: 'category-run'; currency; categoryId; run: number; series: Money[] }
```

*Changed at apply:* the percentages are a whole `changePercent`, rounded half away from zero once,
from the two сум — not basis points rounded again in the UI, which would round twice and could
read 39 % where the spec's single rounding gives 38 %. A транзакція kind carries a `TxRef`: the
detectors need its date, опис and id for the order's tie-breaks anyway.

Each also carries `month` and a stable `key` (`kind:currency:subject:month`) for list keys. A
транзакція is named by the title its transaction line already gives it (`src/ui/transaction-line.ts`),
not by a copy of its опис kept in the union. The route is derived in `src/ui/observations.ts`:

| Kind | Route |
|---|---|
| a категорія kind | `/category/<month>/<categoryId>` |
| price-change, merchant-outlier | `/transaction/<id>` |
| possible-duplicate | two routes, one per half |

Starting wording, polished at the smoke test. Money is formatted by `formatMoney`, and month forms
come from `src/ui/months.ts`; a genitive form is added there if it is missing.

- vs-typical: «Продукти: 13 800 ₴ — на 38 % більше за типові 10 000 ₴» (or «менше»).
- early: «За 10 днів жовтня на Кафе пішло 4 200 ₴ — уже більше, ніж за весь вересень (3 900 ₴)».
  When the two are equal: «… уже стільки ж, скільки за весь вересень».
- run: «Кафе: третій місяць поспіль більше — 2 100 → 2 600 → 3 050 → 3 900 ₴».
- price-change: «Netflix: 349 ₴ замість звичних 299 ₴ (+17 %)».
- merchant-outlier: «Сільпо, 12 жовтня: 2 940 ₴ — у 4,2 раза більше, ніж зазвичай там (700 ₴)».
  A whole ratio drops the «,0» and takes the integer plural: «у 3 рази», «у 5 разів».
- possible-duplicate: «Схоже на дубль: 125 ₴ на mono black». Under it, two tappable lines (date,
  опис or «без опису»), then «Не дубль».
- empty: «Цього місяця поки нічого незвичного» (current month) / «У вересні нічого незвичного».

The words «варто», «слід», «молодець», «якщо так піде» are banned by a test that renders every
kind from the fixtures and greps the sentences.

### D5. «Не дубль»: one table with cascading references

```sql
duplicate_answers(
  first_id    TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  second_id   TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  answered_at INTEGER NOT NULL,          -- timestamp_ms
  PRIMARY KEY (first_id, second_id),
  CHECK (first_id < second_id)
)
```

- **Unordered pair.** The CHECK makes the pair unordered in storage, not only in the repository.
  `duplicateAnswersRepo.answer(a, b, now)` sorts the pair and upserts it.
- **Cascade is justified.** database.md allows a cascade "where the spec says the child has no
  meaning without the parent". The persistence delta says exactly that. Edits keep the row,
  because `save` is an upsert (Context).
- **Placement.** The table is added at the end of `schema.ts`. The migration comes from
  `npm run db:generate`, with the next free number. The test applies all migrations to a database
  seeded with rows and asserts every row is kept and the table is empty, plus a round-trip and a
  cascade test.
- **Backup.** `BACKUP_TABLES` gains `'duplicate_answers'`, with a comment in the style of the list.
  `BackupContents.duplicateAnswers?: { first, second, answeredAt }[]` is an optional section, so
  `BACKUP_FORMAT_VERSION` stays. `BACKUP_SCHEMA_VERSION` goes up by one with the migration: its
  tripwire in `format.test.ts` fails until it does.
- **Validation and restore.** Validation refuses, as contradicting itself, a pair whose id is not
  among the бекап's транзакції, a pair of one id with itself, and the same pair twice in either
  order. An unsorted pair is not a contradiction, since the pair is unordered: restore sorts it. It goes through the same refusal path the other sections use, so a bad file is
  refused whole before SQL's CHECK or PRIMARY KEY could fail half-way. `backup-repo.ts` snapshots
  and restores the table in the same unit, after `transactions`.

*The cascade's hazard.* The same one `counterpart_income_awaits` documents in `schema.ts`: a later
migration that rebuilds `transactions` runs inside the migrator's transaction, where `PRAGMA
foreign_keys=OFF` is a no-op, and would cascade-delete every answer. The table's comment says so; such
a migration carries the rows across itself, with a test.

*Alternative rejected:* storing answers as a JSON list in a preference row. That avoids a
migration, but loses the cascade (orphans pile up), loses the uniqueness the PRIMARY KEY gives,
and still needs a backup section.

*Alternative rejected:* answering every спостереження («Сховати»). A fact that disappears while
still true is a number the app hides from its owner. The owner can hide the whole widget instead.

### D6. Статок in the підсумок is `monthFigures`' own `MonthFigure`

The summary takes `figures: ReadonlyMap<CurrencyCode, readonly MonthFigure[]>` and picks the
month's entry. The route computes it with `netWorthFigures` — extracted at apply from
`netWorthSeries` in `src/ui/net-worth.ts`, which the «Статок» screen and its widget keep calling —
over the net-worth repo's bounded reads, so both read one derivation. The equality scenario is a test that builds the Статок
screen model and the summary from one fixture and compares the зміна and the five parts.

### D7. A ціль's balance change and the unanswered counts

`compositionBalanceChange(transactions, accountIds, month)` sums, per currency, the signed effect on
each склад рахунок of every транзакція dated in the month:
- expense, refund, income, correction: on `accountId`;
- переказ: −left on `fromAccountId` and +arrived on `toAccountId`.

A переказ inside the склад in one currency therefore nets to zero. It lives in `src/domain/goals.ts`
beside `contribution` and has its own colocated test.

The «Без категорії» and «Без джерела» counts use the same predicates as `transactionsRepo` and
`unansweredIn`:
- expense or refund with `UNCATEGORISED_CATEGORY_ID`;
- income with `UNSOURCED_SOURCE_ID`.

They are counted over the month's транзакції in memory. Waiting чернетки are counted by date from
the pending drafts list Головний already reads.

The unanswered row leads to `/transactions?month=<m>&only=uncategorised` when there are «Без
категорії», and to `/transactions?month=<m>` otherwise. Both parameters already exist.

### D8. Where it is shown, and what each place reads

- **Головний.**
  - Registry: `DASHBOARD_WIDGETS` gains `{ id: 'observations', label: 'Спостереження',
    defaultVisible: true }` third, after `latest-transactions`. The normalizer is unchanged.
  - Read plan: `homeDashboardReadPlan` gains `needsObservations`. When it is true, Головний reads
    `storedHistory` (often already read for «Статок») and the answers, and memoizes
    `observationsOf(current month)` by `stampedMemo` plus today's date. The memo lives in
    `src/hooks/observations-reads.ts` (one for Головний, one for Місяць's shown month, so they never
    evict each other), beside `answerNotDuplicate`.
  - Widget: `src/components/observations-widget.tsx` renders the first three, «Усі (N)» →
    `/month` on the current month, and the summary row. The row comes from
    `homeSummaryOffer(today, activeMonths)`: the previous month when today's day ≤ 7 and that
    month is active.
- **Місяць.** It keeps its two `listMonth` reads for the numbers and adds the `storedHistory` memo
  for the block and the offer. `src/ui/month-screen.ts` gains `summaryOffer: Month | null` and
  `observations`. The block sits after the breakdown and before розстрочки. The offer row sits
  under the month header.
- **Звіти.** The readout model in `src/ui/reports-screen.ts` gains `summaryOffer` for the
  spelled-out month. It needs only the set of active months, which `ReportsHistory` already holds.
- **Підсумок.** `src/app/month-summary/[month].tsx` is pushed. `monthSummaryRoute(param, today,
  activeMonths)` in `src/ui/month-summary-screen.ts` returns either the summary or one of the four
  refusals (`current`, `empty`, `future`, `not-a-month`). It is tested, so a bad param is a
  sentence and never an exception.
- **Shared component.** `src/components/observations-list.tsx` is used in all three places. «Не
  дубль» calls the repo, and the stamp change re-derives the list in place.

### D9. The AI-аналіз screen opens on a given month

`src/app/ai-analysis.tsx` reads `?month=YYYY-MM`. A new pure `initialChoices(today, given?: string)`
beside `defaultChoices(today)` in `src/ui/ai-analysis-screen.ts` returns the defaults, or `{ period: 'custom', from: m, to: m }` when
`given` is a whole month. A malformed value falls back to the defaults. Everything after that is
the existing screen.

The summary's action reads «AI-аналіз <місяця>», not «Поділитися з AI», as the owner first worded
it. On the AI-аналіз screen «Поділитися з AI» *is* the hand-off, and its spec forbids anything
leaving before it. A button with that name that only opens a screen would make the name lie in one
of the two places. To be stated in the summary for the owner.

### D10. Docs land in the first task

The docs come first, so the specs' words exist in the vision and glossary before any code uses
them:
- **Vision §19 «Спостереження і підсумок місяця».** «Owner's decision, 2026-10-02» covers the two
  units. **[PROPOSED]** covers the thresholds, the widget's default place, «Не дубль» as the only
  answer, and the seven-day row. It also states:
  - no спостереження projects, and §14.10 stands;
  - none notifies, and §13 stands;
  - none leaves the phone.
- **Vision §15** gets one line: the підсумок reports the частка коригувань against this measure
  every month.
- **Vision §3** gets one pointer to §19: Головний's default now also points at what is notable.
- **Glossary:** спостереження, типова сума, поріг помітності, можливий дубль (with «Не дубль»),
  підсумок місяця and частка коригувань. Distinction rows:
  - спостереження vs AI-аналіз;
  - спостереження vs досягнення;
  - типова сума vs місячна норма витрат: the норма needs six finished months and the owner's
    confirmation, and Прогрес reads it; the типова сума needs three, is never confirmed, and
    feeds nothing;
  - типова сума vs типова категорія: the same adjective, two unrelated things;
  - можливий дубль vs підказка про дубль;
  - можливий дубль vs зустрічний дохід;
  - підсумок місяця vs місячна картина.
- **Glossary «Backup» entry:** it also names the «Не дубль» answers.
- **app-overview:** §3.2, §3.3, §3.5 and §4.10, a new §3.13, and the §6 status row.

### D11. Living beside `merchant-normalization` and `commitments`

- **Продавець.** The observations spec reads the glossary's продавець and defines none of its own.
  - Today that is the folded опис, through `foldMerchant`, exactly as the пакет groups.
  - If `merchant-normalization` lands first, the price-change and продавець detectors key on its
    recognised продавець (its recognition function, with the folded опис where none is
    recognised), the same rule its пакет change uses.
  - If it lands second, its own task moves the key here.

  Either way the detector code takes one `merchantKeyOf(transaction)` function as a parameter of
  `observationsOf`, so the swap touches the binding, not the detectors. The sentence names a
  транзакція as its transaction line does, so «АТБ» replaces «АТБ-Маркет 1234 Київ» for free once
  lines show the назва.
- **Місяць's blocks.** The «Спостереження» block is anchored to "directly beneath the breakdown",
  before any block of the month's платежі. That holds whether that block is «Розстрочки» or
  «Платежі місяця».
- **Price change vs «Оновити суму».** A зобов'язання's «Оновити суму» and the price-change
  спостереження can both react to Netflix going from 299 to 349. They do not conflict: one is a
  fact about a продавець's history, the other an action on the owner's plan. Linking them
  («Записати як зобов'язання» from an спостереження) is the follow-up `commitments` names in its
  own non-goals, not part of this change.

## Risks / Trade-offs

- **Two legitimate identical cups recorded by hand trip the дубль detector.** → «Не дубль»
  answers the pair for good. The same-опис exclusion removes the far more common bank-bank case at
  one продавець, and the «Комісія» exclusion removes equal fees of two перекази.
- **Two bank records of one сума at two продавці a day apart are stated** (two coffees at 75 ₴ in
  two places). With no origin on a транзакція, they look exactly like a hand-made entry beside a
  bank record. → Accepted and specified («asked, not guessed»): «Не дубль» answers them. The smoke
  test on the owner's data counts how often this happens. A later change could narrow it by
  linking a monobank item id to its транзакція, which this change does not do.
- **A дубль with different сум is missed.** This happens when a hand-made entry rounded the сума,
  or when an FX purchase was entered in another currency. → Accepted. The detector promises exact
  pairs only; a fuzzy one would need a tolerance that floods false positives.
- **Notification-derived описи carry the whole notification text.** Such a продавець never repeats
  across months, so the price and продавець detectors stay silent for those rows. → Accepted.
  Merchant extraction (`on-device-ai-proposal.md` A2) is the later fix, and nothing here blocks
  it.
- **The full-history read on Місяць is new for that screen.** → It is the shared stamp memo that
  Головний and Звіти already fill, so after the first read per write it costs nothing. The
  detectors are O(n). The existing 50 000-record scenario of `main-screen` is the bar, checked on
  the emulator smoke test.
- **The owner's dashboard is customised.** If so, «Спостереження» arrives hidden at the end, per
  the unchanged registry-evolution rule. → The summary to the owner says to switch it on in
  «Налаштувати Головний». The підсумок stays reachable from Місяць and Звіти either way.
- **Thresholds fit the interviewer's guess, not the owner's month.** → Every threshold is one
  named constant, and the proposal marks each as [PROPOSED]. The smoke test runs on the owner's
  real backup (via `run-as`) and records what each detector said, so a first tuning is informed
  by real data.
- **Two numbers drift between the підсумок and the screen that owns them.** → No number is
  recomputed: the same functions are called. Equality tests cover Місяць's картина, Статок's
  розбивка and Місяць's ліміт mark.
- **Concurrent sessions in the same tree.** → New files only, plus small additive edits. The
  migration number and `BACKUP_SCHEMA_VERSION` are decided at apply. `rule-template`,
  `merchant-normalization` and `commitments` each add a migration, so whichever lands later
  renumbers its own and takes the next version (D11).

## Migration Plan

The change is additive:
- one new table, created empty by the new migration;
- one optional бекап section;
- one new registry id, appended hidden for customised layouts and visible in the fresh default.

Rollback is the usual app rollback. A бекап from this version restores on it alone, because its
schema version is newer, exactly as with every migration. No data moves.

## Open Questions

- The final Ukrainian wording of each sentence and of the empty states, decided at the emulator
  smoke test against the owner's data. The spec fixes what each sentence carries, not its words.
