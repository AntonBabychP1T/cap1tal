## Context

A розстрочка (monobank «Покупка частинами») reaches the app today only as its monthly debits:
the owner confirmed on 2026-10-01 that the mono statement carries **only** the monthly платежі and
never the full purchase, which lives in the mono app's credits window. The personal API
(`/personal/client-info`, `/personal/statement`) has no розстрочка data; the «Покупка Частинами» API
is merchant-side (`store-id` + HMAC signature) and unusable with a personal token. So:

- the monthly picture is already correct — each debit is the витрата of its month;
- what is missing is the plan behind the debits: what each debit is, what is still owed, how much
  of the current month is already promised, and a warning the day before.

Existing pieces this builds on: the pure monthly picture (`src/domain/monthly-picture.ts`), the
Місяць screen logic (`src/ui/month-screen.ts`), the local-notification port and its launch-time
re-assertion (`src/platform/local-notifications.ts`, `src/reminders/schedule.ts`,
`reconcileOnLaunch` in `src/app/_layout.tsx`), the background monobank run
(`src/platform/monobank-sync-task.ts`), the бекап format (`src/backup/`), the account merge
(`src/db/account-merge-repo.ts`), the stamp-keyed memo of app-speed-pass (`src/db/stamp.ts`), and
the management-list pattern of «Ліміти»/«Цілі».

## Goals / Non-Goals

**Goals:** a hand-entered plan with an exact integer split; automatic, deterministic linking of
debits to платежі with owner corrections that stick; «Вільно після розстрочок» for the current
month; one local warning the day before a платіж; storage, merge and бекап that keep all of it.

**Non-Goals:** anything the proposal lists — monobank import of розстрочки, interest/credit cards,
the unpaid remainder in статок, a Головний widget, non-UAH розстрочки, changes to how any existing
number is counted.

## Decisions

### D0. Names in code

`.claude/rules/domain.md` forbids `Payment` as a synonym. Code uses the glossary's own glosses:
розстрочка = `Installment`, платіж = `InstallmentPart` (monobank's «частинами»), списання = the
`debit` of a part, рахунок списання = `debitAccount`, вільно після розстрочок =
`freeAfterInstallments`, нагадування про платіж = `installmentDue` notice.

### D1. A plan, not a ledger: the графік is derived, only the owner's facts are stored

The розстрочка row stores the owner's inputs (назва, повна сума, кількість, щомісячний платіж,
дата першого платежу, рахунок списання, сплачено раніше, категорія, `recordedAt`, `closedOn`).
Платежі are **not** rows: number, дата and сума are a pure function of those inputs. What is stored
per платіж is only what cannot be derived — a link, a mark, a refusal — keyed by
`(installmentId, number)`.

*Alternative:* one row per платіж. Rejected: every edit would rewrite N rows and reconcile them
with links; with derivation an edit is one row, and "states kept by number" falls out for free.

### D2. Schema (one new append-only migration from `npm run db:generate`)

| Table | Columns | Notes |
|---|---|---|
| `installments` | `id` text pk · `name` · `total_minor` int · `currency` text CHECK = 'UAH' · `parts_count` int · `part_minor` int · `first_due` text (ISO date) · `debit_account_id` → accounts **restrict** · `paid_before` int · `category_id` → categories nullable **restrict** · `recorded_at` int · `closed_on` text nullable | CHECKs for the ranges the domain also enforces |
| `installment_part_links` | `installment_id` → installments **cascade** · `number` int · `transaction_id` → transactions **cascade**, UNIQUE | pk `(installment_id, number)`; UNIQUE makes "one транзакція, one платіж" a storage fact |
| `installment_part_marks` | `installment_id` cascade · `number` | pk both — «Позначити сплаченим» |
| `installment_refusals` | `installment_id` cascade · `number` · `transaction_id` → transactions cascade | pk all three — «Відв'язати» remembered |
| `installment_reminder` | singleton `id` = 1 · `enabled` int · `asked` int | absent row reads as on, not asked; `asked` is the phone's own and never part of the snapshot (D8) |

Removing a транзакція cascades its link and refusals away. `debit_account_id` is `restrict`, like
every reference to a рахунок, so the merge must move it (D8) or roll back. The snapshot replace
deletes the installment tables **before** accounts and categories (`src/db/backup-repo.ts`), since
both references restrict.

### D3. Pure domain in `src/domain/installments.ts`

No React, no db, `today` passed in.

- `splitInstallment(total, count, part?)` → `{ part, last }`: `part ??= floor(total / count)`;
  `last = total − (count − 1) · part`. Integer minor units only.
- `installmentRefusal(input, ctx)` → the first refusal (Ukrainian, naming its field) or nothing
  (`installmentProblems` gives every one, a field each, for the form); an archived рахунок or категорія
  is refused only when it is *chosen* (creation, or changing to it) — `ctx.existing` names what the
  stored розстрочка already has,
  on the shape of `src/domain/refusal.ts`.
- `installmentSchedule(installment)` → `[{ number, due, amount }]`; each due computed from the
  *original* day and clamped to the month's last day — never chained, so 31 → 28 → 31.
- `installmentPartStates(installment, facts, today)` → each part with `paid | closed | expected |
  notFound` and the reason (`debit | paidBefore | marked`), plus progress and залишок (0 once
  closed early).
- `matchInstallmentDebits({ installments, facts, candidates, today })` → `{ link, drop, categorise }`.
  `drop`: links whose транзакція is no longer a UAH витрата on the рахунок списання or lies more
  than ten days from its part's дата (edits of a транзакція or of the розстрочка). `link`: open parts
  ordered by `(due, recordedAt, number)`, each taking the nearest candidate of exact amount within ±3
  days, ties by stored order, skipping refusals and taken транзакції. `categorise`: only among the
  **new** links, the витрати «Без категорії» when the розстрочка has a категорія — never existing
  links, so the owner's later choice stands. The repository's hand-link («Обрати списання») applies
  the same rule at its own moment of linking.
- `freeAfterInstallments(leftUah, parts, month, today)` → сума or `undefined`.
- `installmentReminderDates(parts, today)` → distinct `due − 1 day` of expected parts of active
  розстрочки whose 10:00 is still ahead.

### D4. Linking: one `settle`, run wherever a reader or a warning depends on it

`installmentsRepo.settle(today)` runs in one db transaction: checks the links of **every**
розстрочка — closed and сплачені included — for drops (one query over the link table, so a retyped
debit releases its платіж even after the розстрочка looked paid), loads active розстрочки and facts, and
the candidates — UAH витрати on their рахунки списання **whose сума is one of the open parts'
amounts**, inside the window of the open parts (±3 days) — so the scan is narrow even when an old
part is «не знайдено». It applies `matchInstallmentDebits` and returns whether anything changed.
**It writes nothing when nothing changed**, so `total_changes()` and the stamp do not move and the
memoised screens are not invalidated on every focus.

Called from:
1. Місяць focus, «Розстрочки» focus, one розстрочка's focus — before reading;
2. `reconcileOnLaunch`;
3. the end of a background monobank run (`monobank-sync-task`), after its commit;
4. after a restore.

After 2–4, and after any focus-time `settle` that changed something, the reminder re-assertion
(D5) runs. *Alternative:* hook every write path (monobank commit, notification confirm, hand save,
edit, merge, restore). Rejected: eight places to keep in step instead of four readers.

### D5. Notifications: a one-shot dated arrangement beside the daily one

- **Port.** `LocalNotificationsPort` gains `scheduleAt(notice, at: { date: IsoDate; time:
  TimeOfDay })`; the existing `cancelDaily(id)` already cancels by id and is reused. The double
  records dated arrangements. Device adapter: expo-notifications
  `SchedulableTriggerInputTypes.DATE`, the instant computed in the phone's zone at arrangement time.
  **No new native module, permission or config plugin** — `POST_NOTIFICATIONS` and
  expo-notifications already ship for the daily нагадування.
- **Notice.** `INSTALLMENT_DUE_NOTICE` is a parameterless constant in `notices.ts`, inside
  `ALL_NOTICES` (so `KNOWN_ROUTES` admits `/manage/installments` and `routeOf` honours the tap): title
  «Завтра платіж за розстрочкою», body «Перевірте, чи вистачить грошей на рахунку списання.».
  Only the **id** differs per arrangement, `installmentDueId(date)` = `installment-due-YYYY-MM-DD`,
  set on a copy of the constant — no text of the notice is ever computed, which keeps the file's
  privacy rule.
- **Channel.** `channelOf` maps every `installment-due-*` id to the reminders channel, not «Збої»: it
  is a нагадування, not a сповіщення про збій.
- **Re-assertion** (pure, `src/reminders/installment-schedule.ts`): desired ids from
  `installmentReminderDates` when the switch is on and permission `granted`, else none; cancel every
  held `installment-due-*` id not desired and (re)schedule every desired one — the "re-assert, don't
  check" of D12 of the daily reminder, which also fixes time-zone drift.
- **Permission.** The port cannot tell "never asked" from "denied" (`answerOf` maps undetermined to
  denied), so the app keeps its own `asked` flag in `installment_reminder`: storing a розстрочка, or
  turning the switch on, while permission is not `granted` and `asked` is false calls `ask()` once
  and sets `asked`; nothing resets it, and from then on the screen offers the system settings.
  `asked` is this phone's state: it is **not** carried in the бекап, and a restore leaves the local
  value as it was.
- **Coordination with `reminders-and-alerts`** (in flight): its requirement "Nothing the app posts
  carries money, a name or bank text" lists what may be posted as a closed set. Whichever of the two
  changes archives second adds «the warning of a платіж tomorrow» to that list (task 8.0), so the
  merged main spec never contradicts itself. The rule itself — no сума, назва or bank text — is
  exactly what this notice keeps.

Bound: one arrangement per calendar date, ≤ 60 parts per розстрочка — far below Android's per-app
alarm limit. Arrangements for every future part are made at once, so a closed app still warns.

### D6. «Вільно після розстрочок» is a Місяць reading, not a monthly-picture number

`monthlyPicture` is untouched. `src/ui/month-screen.ts` adds an optional `freeAfterInstallments` to
the current month's UAH group model, placed directly after залишилось whichever number leads; with
no UAH group there is none. The «Розстрочки» block model is separate and is built even for a month
whose picture is empty. Reports, досягнення, the AI-аналіз package and Головний never see either.

### D7. Screens and routes

- `src/app/manage/installments.tsx` (under `/manage/` like every Налаштування list; the detail
  sits at `/installment/[id]` as a ціль sits at `/goal/[id]`) — the list, «Нова розстрочка»,
  «Закриті», the switch and the permission line; logic in `src/ui/installments-screen.ts`.
- `src/app/installment/[id].tsx` — one розстрочка, its графік and per-part verbs, the candidate
  picker for «Обрати списання»; logic in `src/ui/installment-detail.ts`.
- The create/edit form as an editor opened from the list and from «Редагувати», closed by the back
  gesture through `use-close-on-back`; logic in `src/ui/installment-form.ts` (prefill, "typed values
  are not overwritten", the past-parts count, refusals per field), amounts through
  `src/ui/amount-input.ts`.
- Місяць: a «Розстрочки» block component, and the extra UAH line.
- Налаштування: one section row «Розстрочки» → `/manage/installments`.

### D8. Merge, бекап, snapshot

- `mergeAccounts` moves `installments.debit_account_id` from `from` to `into` in its transaction;
  transaction legs move too, so links stay valid. Merge already requires one currency.
- The snapshot read/replace gains the four tables and the switch's `enabled` (deletion order per
  D2). `asked` is **not** in the snapshot: replace upserts `enabled` and leaves `asked` as the phone
  had it.
- Бекап: a new **optional** section `installments`; `BACKUP_FORMAT_VERSION` stays (repo convention
  for optional sections), `BACKUP_SCHEMA_VERSION` +1 for the migration, and the exhaustive table
  list in `src/backup/format.test.ts` gains the new tables. An older бекап has no section → none,
  switch on, `asked` unchanged. Validation refuses the shapes the spec lists before anything local is
  touched, reusing `installmentRefusal` with `existing` set to the розстрочка's own рахунок and
  категорія — so only the stored-shape rules apply (ranges, UAH, references, link uniqueness), and a
  card archived after the розстрочка was recorded does not refuse the бекап.

## Risks / Trade-offs

- **A same-сума purchase on the same card within ±3 days is taken for the платіж.** → Exact to the
  kopiyka, so rare; visible in the графік; «Відв'язати» is remembered.
- **The bank debits a different сума** → «списання не знайдено» after three days; «Обрати
  списання» accepts any сума within ±10 days.
- **The statement observation may change** (mono starts showing the full purchase) → that row is an
  ordinary витрата the owner can delete; the assumption is recorded in the vision.
- **Re-asserting from the headless background run** relies on expo-notifications working without
  an Activity. → Scheduling is a native call with no UI; if it fails there it is the next launch
  that withdraws the warning, and the failure is logged to the журнал, never thrown.
- **Android delivers dated alarms inexactly** → "about 10:00"; fine for a day-ahead warning.

## Migration Plan

One new drizzle migration (four tables + the singleton), generated, never hand-edited, with a
migration test. `BACKUP_SCHEMA_VERSION` bump with a "written before розстрочки" restore test. No
backfill: no розстрочка exists until the owner records one.

## Open Questions

None that change what this change builds. Follow-ups for the owner: the unpaid remainder in
статок; a Головний widget «Найближче списання».
