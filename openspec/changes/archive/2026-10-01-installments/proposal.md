## Why

The owner buys more and more things through interest-free розстрочки — at monobank «Покупка
частинами» — because with inflation paying 10 000 over ten months is cheaper than paying it today.
Each one is a fixed monthly debit for months ahead, and today the app knows nothing about it: the
debit simply appears as a витрата on its day, «Без категорії», and nothing on Місяць says that
part of what is left this month is already promised to a bank. That breaks the second question of
the vision — *"I don't know how much I can still spend"* — the moment the owner holds even one
розстрочка, and gives no warning to keep money on the card the day before.

The monobank personal API cannot help: `client-info` and `statement` carry no розстрочка data, and
the «Покупка Частинами» API is the merchant side (`store-id`, signed requests), not the client's.
The owner confirmed (2026-10-01) how a розстрочка looks in the mono statement: **only the monthly
debits appear**; the full purchase is never a statement row and is visible only in the mono app's
credits window. So hand entry is the primary path, and the app's monthly picture is already right
— each debit is the real витрата of its month — it only lacks the plan behind the debits.

## What Changes

- New **розстрочка**: a plan the owner enters by hand — назва (what was bought), повна сума,
  кількість платежів, щомісячний платіж (offered as повна сума ÷ кількість in whole kopiykas with
  the remainder on the last платіж, editable), дата першого платежу, рахунок списання (UAH), how
  many платежі are already сплачено, and an optional категорія. From these the app derives a
  графік of monthly платежі.
- The app **links each платіж to its списання**: a UAH витрата on the рахунок списання of exactly
  the платіж сума within three days of its дата. A linked «Без категорії» витрата takes the
  розстрочка's категорія. The owner can unlink, pick the списання by hand, or mark a платіж
  сплачено without one. The app never creates a транзакція.
- **Місяць** gains a «Розстрочки» block for any month that has платежі — each платіж with its
  сума, дата and state — and, in the current month's UAH group, **«Вільно після розстрочок»**:
  залишилось minus this month's платежі that are очікується or списання не знайдено. Залишилось itself is unchanged.
- A pushed **«Розстрочки»** screen, opened from that block and from a new Налаштування section:
  active розстрочки with progress («4 з 10 · залишок 6 000,00 ₴»), a create/edit form, each
  розстрочка's платежі with their verbs, closing early, reopening and deleting.
- **Нагадування про платіж**: one local notification at 10:00 the day before every expected
  платіж, behind one switch on the Розстрочки screen, with a constant text that names no сума and
  no назва.
- Розстрочки, their платежі states and the switch are stored, survive a restart, follow a рахунок
  through a merge, and travel in the бекап.

### Vision §14 items this change deliberately touches (owner's decision, 2026-10-01)

- **§14.3 "Loan details: due dates … repayment schedules"** and **§14.6 "Recurring or scheduled
  transactions"** — narrowed, not lifted: a розстрочка carries a графік of due dates, but it is a
  plan only. No транзакція is ever created by the app; debts to people still have no schedule.
- **§14.10 "Forecasts"** — «Вільно після розстрочок» subtracts amounts that are *contractually
  fixed*, not extrapolated from a pace; no "at this pace" reading is added.
- **§13** — a new kind of local notification (the нагадування про платіж) beside the daily
  нагадування; still local, still no сума on the lock screen.

The vision and the glossary are updated with this proposal to record the decision and the terms.

## Non-goals

- Pulling розстрочки from monobank (the personal API has no such data) or detecting a new
  розстрочка from the statement.
- Interest, fees, credit cards, loans with a rate, or schedules on debts to people.
- Showing the unpaid remainder of a розстрочка inside статок or its history (a liability the
  statement never shows; a follow-up decision for the owner).
- A Головний widget «Найближче списання» (follow-up; the dashboard registry is closed and gets its
  own change).
- Non-UAH розстрочки, irregular schedules beyond "equal платежі, last absorbs the remainder",
  and any change to how витрачено, залишилось, reports, досягнення or the AI-аналіз count money.

## Capabilities

### New Capabilities

- `installments`: the розстрочка, its графік and платежі, linking a платіж to its списання, the
  states of a платіж, closing early, «Вільно після розстрочок», and the нагадування про платіж.
- `installments-screen`: the «Розстрочки» screen — the list, the create/edit form with its
  refusals, one розстрочка's платежі and their verbs, and the reminder switch.

### Modified Capabilities

- `month-screen`: the «Розстрочки» block and «Вільно після розстрочок» in the current month's UAH
  group.
- `settings-screen`: the section «Розстрочки» among the management sections.
- `persistence`: розстрочки, платежі states and the reminder switch survive a restart, arrive by a
  new append-only migration, follow a merged рахунок, and lose a link when its транзакція is
  removed.
- `backup-file`: a бекап carries розстрочки and is refused when they contradict it.

## Impact

- `docs/product-vision.md` (§4, §8, §13, §14) and `docs/glossary.md` (new section «Розстрочки»):
  updated with this proposal.
- `src/domain/installments.ts` (+ test): графік, split, states, linking, вільно — pure.
- `src/db/schema.ts`, a new migration in `drizzle/`, `src/db/installments-repo.ts` (+ test),
  `src/db/account-merge-repo.ts`, the snapshot read/replace, `src/db/repos.ts`.
- `src/backup/format.ts` / `backup.ts` (+ tests): new optional section, `BACKUP_SCHEMA_VERSION` bump.
- `src/reminders/notices.ts` (a constant notice), a new pure arrangement module beside `schedule.ts`,
  `src/platform/monobank-sync-task.ts` (settle and re-assert after a background run);
  `src/platform/local-notifications.ts` and its device adapter gain a one-shot dated arrangement
  (expo-notifications `DATE` trigger — no new native module, permission or config plugin).
- `src/ui/installments-screen.ts`, `src/ui/installment-form.ts`, `src/ui/month-screen.ts` (+ tests);
  routes `src/app/manage/installments.tsx`, `src/app/installment/[id].tsx`; Місяць tab and Налаштування.
