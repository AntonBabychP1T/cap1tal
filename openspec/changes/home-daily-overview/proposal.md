## Why

Головний today does three jobs at once: it shows «Усього грошей», it carries the whole entry
form, and it lists fifty транзакції. The form sits between the owner and everything worth
reading, so the screen the app opens on answers neither product question — where the money went,
and how much is left — until it has been scrolled past. Meanwhile the one number that answers the
second question, the month's «Залишилось», lives only on Місяць, and Головний shows a total that
looks like an answer to it but is not.

Opening the app should be: see the state of the month in a few seconds, and record something if
there is something to record. This change turns Головний into that overview and moves recording
behind a «+».

## What Changes

- **BREAKING (screen layout, not data):** the entry form leaves Головний's permanent content.
  Type, рахунок, сума, дата, нещодавні категорії, категорія/джерело, опис and «Записати» are no
  longer on the screen until the owner asks to record something.
- Головний leads with the month's status, read off the existing monthly picture for the current
  calendar month: «Залишилось у <місяці>» as the screen's main figure, with «Витрачено» beside
  it, per currency and never summed across currencies. Tapping it opens Місяць.
- «Усього грошей» becomes a secondary one-line row, «На рахунках …», with its «≈ … грн» as
  today. Tapping it opens Рахунки. Nothing about how balances are computed changes.
- A conditional «Потребує уваги» section appears only when something is actually waiting: витрати
  carrying «Без категорії», and pending чернетки зі сповіщень. With neither, the section is not
  rendered at all — no heading, no empty state. It aggregates what already exists; it introduces
  no new state, no new type and no new stored number.
- The стрічка shows the latest 5 транзакції instead of 50, under «Останні транзакції» with «Усі ›»
  to the existing «Транзакції» screen. The lines keep what they say today: type, категорія or
  джерело, рахунок, дата, опис, the «Без категорії» mark with its one-tap picker, and the
  over-limit mark. Tapping one still opens editing.
- A floating «+» in the bottom-right corner opens the entry form as its own pushed screen. It is
  the same form as today — the same `buildEntry`, the same комісія and «Відсотки» proposals, the
  same remembered рахунок, the same confirmation — moved, not reimplemented. Recording is
  confirmed on that screen, where the owner is looking when they record.

It also reverses one earlier decision, knowingly: `month-start-and-polish` stopped Місяць from
leading with залишилось while a month has no дохід, because before the month's first дохід that
number is negative by construction. Головний is asked to lead with it all the same, so it carries
the reason with it — the same sentence Місяць uses, per currency — rather than swapping the figure
out mid-month. Місяць keeps its own rule unchanged (design D2).

This contradicts one line of product truth, deliberately and with the owner's word for it:
docs/product-vision.md §3 says "On opening the app: add a transaction, and see the latest
transactions. Everything else lives elsewhere and is one step away." After this change adding a
транзакція is the thing that is one step away, because the owner asked for exactly that: opening
the app should answer how the month is going, and recording is what the «+» is for. §3 and the
main-screen spec's Purpose are rewritten in this change to say so — the vision is amended, not
quietly broken.

Non-goals, deliberately: no category dashboard on Головний, no charts, no forecasts, no budget
formula, no overall monthly ліміт, no new transaction type, no schema change and no migration.
Vision §14 is untouched. This is a UX refactor over capabilities that already exist.

## Capabilities

### New Capabilities

None. Every behaviour this change shows already has a capability that defines it: the numbers are
`monthly-picture`'s, the total is `accounts`', the чернетки are `bank-notifications`', the whole
history is `transaction-search`'s.

### Modified Capabilities

- `main-screen`: what Головний opens with (the month's status leads, the total becomes a
  secondary row that leads to Рахунки), the «Потребує уваги» section, the стрічка's size and its
  «Усі» offer, where the entry form lives and where recording is confirmed.
- `bank-notifications-screen`: «Pending чернетки are visible on Головний» — the чернетки keep
  their surface and their place on Головний, now inside «Потребує уваги»; its scenario about an
  empty pending list still describing "the entry form with the feed" is reworded to the screen
  this change leaves behind.

## Impact

- `src/app/(tabs)/index.tsx` — rewritten as the overview: monthly status, secondary total,
  «Потребує уваги», five feed lines, the «+».
- `src/app/transaction/new.tsx` — new screen holding the entry form moved off Головний, pushed
  over the tabs like `transactions` and `transaction/[id]`; registered in `src/app/_layout.tsx`.
- `src/ui/home-screen.ts` — new pure module: the monthly status lines, the secondary total row and
  the «Потребує уваги» items, tested under `verify`.
- `src/ui/months.ts` — the twelve month names in the locative («у вересні»), for the status title.
- `src/db/transactions-repo.ts` — one read added: how many stored транзакції carry «Без
  категорії». No schema change, no migration.
- `src/components/surfaces.tsx` — the floating «+» as a surface, so it is one shape and not a
  screen's private styling.
- `docs/product-vision.md` §3 and the `main-screen` spec's Purpose — rewritten to describe the
  screen this change makes.
- `openspec/changes/reminders-and-alerts/` — that change, still in flight, has a scenario reading
  "the app opens on Головний, showing quick entry and any pending чернетки". Whichever of the two
  archives second rewords it; this change carries the task.
- `src/ui/entry-form.test.ts`, `src/ui/alerting.test.ts`, `src/ui/notifications-screen.test.ts` —
  structural assertions naming `src/app/(tabs)/index.tsx` are re-pointed at the entry screen where
  what they assert has moved. Re-pointed, never relaxed.
- Unchanged on purpose: `src/domain/**` (no new calculation), `src/ui/entry-form.ts`,
  `src/ui/drafts-section.ts`, `src/ui/transaction-line.ts`, `src/db/schema.ts`, `drizzle/`.
