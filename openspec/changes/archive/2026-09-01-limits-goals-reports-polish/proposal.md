# limits-goals-reports-polish — proposal

## Why

Three things the smoke of `limits-goals-reports` left behind rub every day. They are small, and
each one costs the owner either a piece of the language the app is written in or a piece of the
answer a chart is supposed to give.

**A refused form speaks English.** Type "0" as a ліміт and the app answers
`an amount is positive, got "0"`. Type «31.12.2026» as a ціль's дата and it answers
`date must be YYYY-MM-DD, got "31.12.2026"`. Everything else the owner reads is Ukrainian —
«оберіть рахунок», «Правило потребує категорії», «назва не може бути порожньою». The engine's own
invariant text leaks through in exactly the places a person is already being told "no", which is
the worst possible moment for the app to stop speaking their language.

**On «Ліміти» the hardware «назад» leaves the screen with the editor open.** The editor is the
thing on screen; the phone's own back gesture is what a person reaches for to undo opening it, and
instead the whole section goes away. The next visit re-opens the list, the half-typed ліміт is
gone, and «Скасувати» — the button that does the right thing — sits under the keyboard.

**The charts on «Звіти» carry no number and no axis.** Bars over month names, and nothing that
says how much any of them is. The tab's whole job is reading the history; without a scale a bar
only says "bigger than that other bar", and the exact сума the owner came for — August's
витрачено — is not on the screen at all. The view model already computes every one of those
numbers and the screen throws them away.

All three serve the vision's first problem — where the money went — by making the answer readable
instead of approximate, and by not breaking the app's own voice while refusing input.

## What Changes

- **Every refusal an owner-facing form can produce is in Ukrainian.** The typed-сума parser and
  the typed-дата parser answer in the owner's language and name what is wrong with what was
  typed. The domain's invariant messages stay English — they are programmer-facing and no form can
  reach them any more, because the one refusal that still could (a переказ with the same рахунок on
  both legs) is named where the form builds it, exactly as the cross-currency leg already is.
- **The hardware «назад» closes an open editor before it leaves the screen** on «Ліміти» and on
  «Цілі» — one press for the editor, the next for the section. The finding named «Ліміти»; «Цілі»
  carries the identical inline editor, and a requirement true of one and false of the other would
  be a worse answer than fixing both.
- **Both charts on «Звіти» carry their scale and one month's exact numbers.** Each chart states the
  сума its tallest bar stands for and marks the zero its bars grow from; a chart holding a month
  below zero states the bottom of its own scale too. Tapping a month spells that month's numbers
  out in full — витрачено, дохід and інвестовано for the history chart, the chosen category's сума
  for the category chart — and the newest month is spelled out before anything is tapped.

## Non-goals

- **No charting library.** Design D6 of the archived change stands: two charts are not a reason for
  a native-ish dependency. The axis is a hairline and two labels.
- **No translation of the domain.** `src/domain/` keeps its English invariant text. This change
  closes the paths by which a form could show it, and does not restate the domain in Ukrainian.
- **No new numbers.** Every сума this change puts on «Звіти» is one the reports capability already
  computes; nothing is derived a second way and no total is added.
- **No date picker, no calendar widget.** A дата is still typed as `РРРР-ММ-ДД`; only the refusal
  changes.
- **Nothing about ліміти themselves** — not a notification, not a block, not a second currency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: gains the requirement that what the owner reads is Ukrainian, refusals included —
  the one owner-visible rule here that belongs to no single screen.
- `settings-screen`: the «Ліміти» and «Цілі» sections gain the hardware-«назад» behaviour and the
  statement that a refused сума, назва or дата says why in Ukrainian.
- `reports-screen`: both charts gain a stated scale, a marked zero and one month's exact numbers.

## Impact

- `src/ui/amount-input.ts` — the three refusals become Ukrainian; new: the typed дата.
- `src/ui/entry-form.ts`, `src/ui/goals-section.ts` — use the Ukrainian дата parser; the
  same-рахунок переказ is named before the domain refuses it.
- `src/ui/limits-section.ts`, `src/ui/goals-section.ts` — the hardware-«назад» decision.
- `src/ui/reports-screen.ts` — the axis of each chart and the read-out month.
- `src/app/manage/limits.tsx`, `src/app/manage/goals.tsx`, `src/app/(tabs)/reports.tsx` — wiring.
- `src/db/limits-repo.ts`, `src/db/goals-repo.ts` — two storage refusals that were half-English.
- No migration, no dependency, no native change.
