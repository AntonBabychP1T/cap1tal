## Context

See proposal.md (Why) for the motivation. The approach copies the archived `installments` change
(2026-10-01, its design D0–D8) as closely as the domain allows, because the mechanism is already
built and proven there:

- a pure графік (`src/domain/installments.ts`);
- facts stored per платіж — link, mark, refusal — keyed by number;
- one `settle` that links and drops in one write transaction and writes nothing when nothing
  changed (`src/db/installments-repo.ts`);
- the upkeep called from launch, the background monobank run, a restore and the screens' focus
  (`src/ui/installment-upkeep.ts`, `src/hooks/installment-ports.ts`);
- the reading on Місяць (`src/ui/month-screen.ts`);
- merge, snapshot and бекап handling.

A зобов'язання differs from a розстрочка in five ways, and each needs a decision below:

1. it has no end and no повна сума;
2. its періодичність is not always monthly;
3. it may be in any currency;
4. its сума may vary, which is why it has an ознака;
5. a платіж may be пропущено.

## Goals / Non-Goals

**Goals:**

- a derived, endless графік with no rows per платіж;
- linking that is deterministic and never fights the розстрочки' linking over one транзакція;
- one reading, «Вільно після зобов'язань», computed per currency over both plans;
- storage, merge and бекап that keep everything the owner said.

**Non-Goals:** everything the proposal lists, in particular reminders (so no notification code is
touched) and any change to how a розстрочка is entered.

## Decisions

### D0. Names in code

`.claude/rules/domain.md` forbids `Payment`.

| Term | Code |
|---|---|
| зобов'язання | `Commitment` |
| платіж of a зобов'язання | `CommitmentDue` (a dated amount owed; it keeps "part" for a розстрочка, where a платіж really is a part of a whole) |
| періодичність | `Periodicity` = `'monthly' \| 'quarterly' \| 'halfYearly' \| 'yearly'` |
| ознака | `marker` |
| пропущено | `skipped` |
| дата припинення | `stoppedOn` |
| «Вільно після зобов'язань» | `freeAfterCommitments` |
| «Платежі місяця» | `monthDues` |
| рахунок списання, списання | `debitAccountId` and `debit`, as in the розстрочки |

### D1. A plan, not a ledger: the графік is derived and endless

The `commitments` row stores only the owner's inputs. Платежі are a pure function of
`(firstDue, periodicity, stoppedOn)`. The function is evaluated up to a bound the caller gives:

- `commitmentDues(commitment, facts, { until, today })` returns every платіж with its state from
  the first up to `min(until, stoppedOn)`;
- **readers pass the bound they need:** the end of the shown month (Місяць); `max(today, firstDue)`
  plus one period, for "the first one after today" even when the first платіж is more than a period
  ahead (detail and list); `today + 3 days` (linking — no candidate can be dated later than today).

Facts are keyed by `(commitmentId, number)`, as for розстрочки, so "states kept by number" on edit
comes for free.

*Alternative:* materialise the next N платежі as rows. Rejected: an endless series has no natural N.
Every edit, stop and resume would rewrite rows, and the derivation is already proven for розстрочки.

The cost of an old first date is bounded: 12 платежі a year monthly. A зобов'язання recorded with a
first date ten years back evaluates 120 entries per read, and that is fine.

### D2. The графік reuses the розстрочка's month arithmetic

`monthsAfter(first, months)` already clamps to the month's last day and never chains (31 → 28 → 31,
and 29 Feb → 28 Feb → 29 Feb in a leap year). It is exported from `installments.ts`, today
module-private, and платіж k of a зобов'язання is `monthsAfter(firstDue, (k − 1) × n)` with n ∈ {1,
3, 6, 12}. `addDays`, `daysApart` and the window constants are reused too:

- `AUTO_LINK_WINDOW_DAYS` = 3;
- `HAND_LINK_WINDOW_DAYS` = 10.

The rules are one rule, so they are shared, not copied: `commitments.ts` imports them from
`installments.ts`, and nothing moves to a new module.

### D3. Pure domain in `src/domain/commitments.ts`

No React, no db, `today` passed in.

- `commitmentProblems(input, ctx)` / `commitmentRefusal(input, ctx)` follow the shape of
  `installmentProblems` / `installmentRefusal`:
  - the назва;
  - the сума (> 0 and ≤ `MAX_AMOUNT_MINOR`);
  - the періодичність;
  - the рахунок (exists; archived only when *chosen*, `ctx.existing`);
  - the категорія (archived only when chosen);
  - the ознака (trimmed; empty means none; 1–2 characters is refused).

  The refusal texts are Ukrainian and name the field.
- `commitmentDues(...)` (D1) returns `{ number, due, amount, state, reason?, transactionId? }`,
  with state `'paid' | 'skipped' | 'expected' | 'notFound'` and reason `'debit' | 'marked'`. The
  amount is always `commitment.amount`. The screen shows the списання's own сума for a linked one.
- `nearestDue(dues)` returns the earliest `expected | notFound`, for the list order.
- `matchCommitmentDebits({ commitments, facts, transactions, takenByInstallments, today })` returns
  `{ link, drop, categorise }`:
  - `drop` uses `commitmentLinkStands`: the платіж exists (≤ `stoppedOn`); the транзакція is a
    витрата on the рахунок списання in the зобов'язання's currency; it is ≤ 10 days from the
    платіж's дата. Marks and refusals are not the matcher's: they are dropped by the repository at
    the moment of an edit or a stop (below);
  - `link` serves open платежі ordered by `(due, recordedAt, number)`. Each takes the nearest
    qualifying candidate within ±3 days, ties to the one stored first. It skips refusals, the
    транзакції `taken` by kept зобов'язання links, and `takenByInstallments`;
  - a candidate qualifies by `marker ? foldCase(description ?? '').includes(foldCase(marker)) :
    amount.amount === commitment.amount`. The currency and рахунок checks are the
    `isDebitOn`-shaped `isCommitmentDebitOn(candidate, commitment)`. `DebitCandidate`
    (`installments.ts`) gains an optional `description`, loaded by both repositories' candidate
    queries; the розстрочка matcher ignores it;
  - `categorise` covers only new links whose витрата is «Без категорії», when the зобов'язання has
    a категорія.
- `factsDroppedByEdit(before, after, facts)` returns the marks and refusals of платежі whose дата
  the edit moves by more than ten days, and `factsDroppedByStop(commitment, stoppedOn, facts)` every
  link, mark and refusal of a платіж dated after `stoppedOn`. The repository deletes both inside
  the same write as the edit or the stop — an edit of a stopped зобов'язання applies both, against
  the edited графік, so no fact is left on a платіж the edit pushed past the stop — and refuses to store a fact for a платіж after the дата
  припинення.
- `owedByCurrency(dues, month)` returns `Map<currency, minor>` of the month's `expected | notFound`.
- `freeAfterCommitments(leftByCurrency, owedByCurrency, month, today)` returns `Map<currency,
  Money>`. It is empty unless `month` is today's month. A currency appears only where both a
  залишилось and a non-zero owed сума exist. Its JSDoc says in so many words that the owed map
  holds the розстрочки' платежі too — the reading's name is the owner's, and the exception is the
  glossary's.

The розстрочка side feeds the same function: `owedInMonth` already exists and gives the UAH сума.
The caller merges it into the map. `freeAfterInstallments` and its tests are **removed** (the
installments requirement is REMOVED). Its scenarios move, renamed, into the `commitments` tests,
which prove the UAH figure is unchanged when no зобов'язання is owed.

`foldCase` (`src/domain/fold.ts`) is the app's one case fold. The ознака uses it with plain
`includes`; no whitespace collapse, since a bank's опис rarely varies in spacing.

### D4. Linking order: розстрочки first, then зобов'язання, one транзакція one платіж

The two plans keep their own link tables (D5). "One транзакція, one платіж" is enforced across both
in four places:

1. **Domain.** `matchCommitmentDebits` receives `takenByInstallments` (ids linked to any розстрочка
   платіж after that settle). `matchInstallmentDebits` receives `takenByCommitments`, a new optional
   input whose default is the empty set, so existing tests stand. The candidate rule of both specs
   says "not linked to any платіж of a розстрочка or of a зобов'язання".
2. **Repository.** `installmentsRepo.settle` and the hand link («Обрати списання») read the
   зобов'язання link table to exclude those ids. `commitmentsRepo` does the same with the
   розстрочка link table. `linkDebit` of either refuses a транзакція linked in the other table.
3. **One settle for both plans, in one write.** `installmentsRepo` gains `settleIn(tx, today)`
   (today's `settle` body without its own transaction; `settle` stays as a wrapper for its tests),
   and `commitmentsRepo` has the same. A new `settlePlans(db, today)` (`src/db/plans-settle.ts`)
   runs the розстрочки' match first and the зобов'язання' second, reading the розстрочки' links as
   they stand after the first, inside **one** `immediate` write transaction. It returns
   `{ installments: boolean; commitments: boolean }` and writes nothing when neither has anything
   to do. So the order holds even when a background прогін commits between the two, which two
   separate transactions would not guarantee.
4. **Upkeep.** `settleAndReassert` (`src/ui/installment-upkeep.ts`) calls `settlePlans` through its
   storage port **before** its `only: 'if-changed'` return, so a screen's focus settles the
   зобов'язання even when the розстрочки had nothing to settle. The reminder re-assertion depends
   only on `installments` having changed; the function's return is "either changed". It keeps its
   name; renaming it would touch every caller for no behaviour. **Nothing calls
   `commitmentsRepo.settle` alone** — the «Зобов'язання» screens use `settleInstallmentsOnFocus`
   like Місяць and the «Розстрочки» screens.

A транзакція already linked to one plan stays where it is. Serving order matters only among
транзакції free at the time of the pass. This is what both specs say.

*Alternative:* one shared link table with a `plan_kind` discriminator. Rejected:
`installment_part_links` is committed, and moving its rows is a data migration with no behavioural
gain. Cross-table uniqueness is two indexed lookups inside the same write transaction.

Where the зобов'язання are settled: everywhere the розстрочки are (Місяць focus, launch, the end
of a background monobank run, after a restore), plus the focus of the «Зобов'язання» screens —
always through the same `settlePlans`.
Running at launch and in the background matters even without reminders. A linked «Без категорії»
витрата takes its категорія, and Головний's «Без категорії» count should not wait for Місяць to be
opened.

### D5. Schema (one new append-only migration from `npm run db:generate`)

| Table | Columns | Notes |
|---|---|---|
| `commitments` | `id` text pk · `name` · `amount_minor` int · `currency` text · `periodicity` text · `first_due` text · `debit_account_id` → accounts **restrict** · `category_id` → categories nullable **restrict** · `marker` text nullable · `recorded_at` int · `stopped_on` text nullable | CHECKs: name not blank, amount > 0, periodicity ∈ the four, ISO dates, marker null or `length(trim) ≥ 3` |
| `commitment_due_links` | `commitment_id` → commitments **cascade** · `number` int ≥ 1 · `transaction_id` → transactions **cascade**, UNIQUE | pk `(commitment_id, number)` |
| `commitment_due_marks` | `commitment_id` cascade · `number` · `kind` text CHECK ∈ ('paid','skipped') | pk `(commitment_id, number)`; one mark per платіж by construction |
| `commitment_refusals` | `commitment_id` cascade · `number` · `transaction_id` → transactions cascade | pk all three |

- **One state fact per платіж.** "At most one of a link, a mark сплачено and a mark пропущено" is
  the pk of the marks table (one kind) plus a repository check. A link refuses a marked платіж and a
  mark refuses a linked one, in the same write transaction. SQLite has no cross-table CHECK, and a
  trigger would be hand-written DDL, which `database.md` forbids.
- **Currency.** "Currency equals the рахунок списання's" is a repository check on insert, update and
  restore. The column is stored because money is always `(minor, currency)` in this codebase, and a
  merge already requires one currency on both sides.
- **Facts after the stop.** A link, mark or refusal for a платіж dated after `stopped_on` is
  refused by the repository and by the бекап validation; a stop deletes the ones that exist (D3).
- **No switch row.** There is no reminder, so there is no singleton table.
- **Number.** The migration takes whatever number `db:generate` gives at apply time. 0010 is free
  today, but four in-flight changes also add one.

### D6. Місяць: one reading over both plans, one block over both plans

- `monthViewModel` gains `commitments?: { commitments, facts }` beside `installments`. Each currency
  group's model replaces `freeAfterInstallments?` with `freeAfterCommitments?: { label, amount }`,
  set for the current month where `freeAfterCommitments` gives that group's currency. The label
  constant becomes `FREE_AFTER_COMMITMENTS_LABEL = 'Вільно після зобов'язань'`. It sits directly
  after залишилось whichever number leads, as today.
- `MonthInstallmentsBlock` becomes `MonthDuesBlock`:
  - rows of both kinds, sorted by дата, then the plan's `recordedAt`, then розстрочка before
    зобов'язання, then number. Every row carries a `href` (`/installment/[id]` or
    `/commitment/[id]`);
  - `totals: { currency, total, unpaid }[]`, which excludes пропущено (and закрито, as today);
  - the title becomes «Платежі місяця».
- The component in `src/app/(tabs)/month.tsx` renders rows as pressables; the block-level tap goes.
- `monthlyPicture` is untouched. Reports, досягнення, the AI-аналіз package and Головний see none of
  this.

### D7. Screens and routes

- **`src/app/manage/commitments.tsx`** (logic in `src/ui/commitments-screen.ts`): the active list
  by `nearestDue`, «Припинені», «Нове зобов'язання», and the empty sentence.
- **`src/app/commitment/[id].tsx`** (logic in `src/ui/commitment-detail.ts`):
  - the values;
  - the платежі newest first, bounded at the first one after today;
  - the verbs per платіж;
  - the candidate picker (the same list shape as «Обрати списання» of a розстрочка);
  - «Оновити суму» (the latest платіж by дата with `reason: 'debit'` whose списання's сума ≠
    `amount`), done as an ordinary `update` with the new сума;
  - «Редагувати», «Припинити» / «Відновити», «Видалити» with confirmation;
  - on focus, `settleInstallmentsOnFocus` (both plans, D4), as on the list.
- **The form** (`src/ui/commitment-form.ts`) is an editor closed by `use-close-on-back`:
  - amounts go through `src/ui/amount-input.ts` in the chosen рахунок's currency;
  - «Як часто» is four chips;
  - «Дата першого платежу» is today by default, with the hint «Платежі до сьогодні шукатимуться
    серед уже записаних витрат» — an old first date links old витрати and shows the rest as «списання
    не знайдено», so the owner sees that before choosing one;
  - refusals are placed per field from `commitmentProblems`.
- **Налаштування:** one row «Зобов'язання» → `/manage/commitments`, right after «Розстрочки», with
  the hint «Оренда, інтернет, підписки: що ще має списатися».
- **Registration:** both routes are registered in `src/app/_layout.tsx` beside the installment
  ones.
- **Smoke-test labels:** visible Ukrainian labels («Нове зобов'язання», «Пропустити», «Оновити
  суму») are the ones `smoke-runner` taps, and `scripts/android.sh` cannot type Cyrillic. So the
  form's test path uses an ASCII назва («Netflix»), and the ознака field accepts Latin text.

### D8. Merge, snapshot, бекап

- **Merge.** `mergeAccounts` moves `commitments.debit_account_id` from `from` to `into` in its
  transaction, as it does for розстрочки. Transaction legs move too, so links stay valid. Merge
  already requires one currency, so `currency` stays right.
- **Snapshot.** The read and replace gain the four tables. They are deleted **before** accounts and
  categories (both references restrict), next to the installment tables.
- **Бекап.** A new **optional** section, `commitments`:
  - `{ commitments, links, marks, refusals }`;
  - `BACKUP_FORMAT_VERSION` stays (repo convention for optional sections);
  - `BACKUP_SCHEMA_VERSION` goes 10 → 11 (or the next free value at apply time);
  - the exhaustive table list in `src/backup/format.test.ts` gains the four tables.
- **Validation before anything local is touched.** It reuses `commitmentRefusal` with `existing`
  set to the зобов'язання's own рахунок and категорія, so a since-archived card does not refuse. It
  adds:
  - the currency matches the рахунок;
  - references exist;
  - one fact per платіж;
  - link targets are витрати on the рахунок in its currency;
  - no транзакція is linked in both this section and the `installments` section, or twice within
    either.

## Risks / Trade-offs

- **An unrecognised debit is counted twice until it is linked.** A списання that neither matches
  the сума nor carries the ознака sits inside залишилось as a витрата while its платіж is still
  owed, so «Вільно після зобов'язань» is too low by that сума. → The ознака exists for exactly the
  variable cases. After three days the платіж reads «списання не знайдено» on Місяць and on the
  зобов'язання, one tap from «Обрати списання». The error is on the cautious side: it never shows
  money as free when it is not.
- **An ознака too broad links the wrong витрата.** For example «uber» catches both Uber Eats and
  rides. → Only within ±3 days of a платіж and on the рахунок списання; «Відв'язати» is remembered;
  the minimum length is three characters.
- **An exact-сума зобов'язання without an ознака can take an unrelated purchase.** For example, a
  150,00 ₴ мобільний and a 150,00 ₴ coffee. → It is the розстрочка's accepted trade-off, it is
  visible in the платежі, and the form's hint suggests the ознака.
- **An old first date makes old «списання не знайдено» платежі.** → They are honest. The owner
  marks them сплачено or пропущено, and only the current month's count in the reading.
- **Renaming a reading the owner has used since 2026-10-01.** → Its UAH value is identical while
  no зобов'язання is owed (the REMOVED requirement's Migration). The vision and glossary record the
  owner's decision of 2026-10-02.
- **Four in-flight changes also add migrations and backup tables** (`category-icons-and-transaction-
  visuals`, `observations-and-month-summary`, `merchant-normalization`, `local-model-guesses`). → The migration is generated at
  apply time, after whichever lands first. `BACKUP_SCHEMA_VERSION` is bumped to "current + 1" at
  that moment, and `format.test.ts`'s exhaustive table list catches a missed table.

## Migration Plan

- One new drizzle migration (four tables), generated and never hand-edited.
- A migration test: every migration on an empty database, plus rows stored before, read after.
- A `BACKUP_SCHEMA_VERSION` bump with a "written before зобов'язання" restore test.
- No backfill: no зобов'язання exists until the owner records one.
- Rollback is the usual one for this app: a build without the change ignores tables it does not
  know, and a бекап from it has no section.

## Open Questions

None that change what this change builds. Follow-ups for the owner:

- a нагадування before a зобов'язання's платіж, per зобов'язання;
- «Записати як зобов'язання» from an спостереження of a regular payment;
- a monthly cost of all зобов'язання;
- a Головний widget «Найближче списання» covering both plans.
