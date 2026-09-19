## Context

Головний today is one 800-line screen file holding: the «Усього грошей» card, the whole entry
form (type, рахунок(и), сума, «скільки прийшло», дата, нещодавні, категорія/джерело, опис,
«Записати», confirmation), the чернетки block, and 50 feed rows with their marks and the one-tap
categoriser. Everything it decides is already pure and tested — `buildEntry`, `proposeForTransfer`,
`recordedConfirmation`, `expenseCategoryChoices`, `recentlyUsed`, `draftLines`, `transactionLine`,
`overLimitByMonth`, `accountTotals` — the file is wiring. The numbers this change puts on top of
the screen are equally ready: `monthlyPicture` in `src/domain/monthly-picture.ts` already computes
залишилось and витрачено per currency, and `monthViewModel` already formats them for Місяць.

So this is a re-wiring, not new machinery. See proposal.md — Why.

Constraints that shape it: `npm run verify` never renders JSX, so anything worth testing has to be
a plain-TypeScript decision in `src/ui/`; money stays integer minor units per currency and is never
summed across currencies; no schema change and no migration is allowed to appear (rules/database.md).

## Goals / Non-Goals

**Goals:**

- Головний answers "how is the month going" above the fold, with numbers that already exist.
- One entry form in the app, moved rather than copied — recording behaves identically.
- The new screen decisions (what the status says, what «Потребує уваги» holds) are pure functions
  under `verify`, not conditions written inside JSX.

**Non-Goals:**

- No change to how any number is computed. `monthlyPicture`, `computeBalance`, `accountTotals`,
  `approximateUah` are read, never touched.
- No redesign of the entry form itself. The backlog's separate ideas for it — «Усі категорії» with
  search, a pinned «Записати», system date pickers, auto-choosing the single рахунок — stay in the
  backlog; this change moves the form as it is.
- No new bottom-sheet library, no new navigation pattern, no sixth tab.

## Decisions

### D1 — The entry form moves to a pushed screen at `transaction/new`, not a modal or a sheet

The app is a Stack over the tabs, and everything that is not a tab is pushed with
`presentation: 'card'` — `transactions`, `transaction/[id]`, `account/[id]`, `manage/*`,
`onboarding`. The entry form becomes one more of those, at `src/app/transaction/new.tsx`, so it
gets the same header, the same «Назад», the same hardware-back behaviour and the same
`useReloadOnFocus` reads as every other screen. Nothing new is learned by the codebase.

- *A bottom sheet* would need a library the project does not have (`@gorhom/bottom-sheet` or
  Reanimated-driven code of our own) for a form with ten fields and two dialogs. Rejected outright.
- *`presentation: 'modal'`* is one line, but it would be the only modal in the app and on Android it
  changes the back behaviour and the header. Not worth being the exception.
- *A static route beside a dynamic one* — `transaction/new` next to `transaction/[id]` — is
  standard expo-router precedence (static wins). It is the one thing here that must be proven on
  the emulator rather than in a unit test: if the router ever resolved it to the editor with
  `id === "new"`, the screen would open «Транзакцію не знайдено». The smoke pass checks exactly
  that, and the fallback is a route named `entry` at the root, which cannot collide with anything.

### D2 — Залишилось leads Головний always; Місяць keeps its own rule

`month-start-and-polish` deliberately made Місяць lead with витрачено while a currency's дохід is
zero (see month-screen spec, «one number SHALL be shown as the group's leading number»), because
before the month's first дохід залишилось is negative by construction. Головний is asked for the
opposite: залишилось is the screen's number, always.

The two are reconciled by carrying the reason, not by hiding the number: a currency whose дохід is
not above zero gets the same sentence Місяць uses — «У цьому місяці ще не записано дохід.» — reused
verbatim from `month-screen.ts` rather than re-worded, and naming the currency when the month holds
more than one («…ще не записано дохід у USD»). Per currency, because Місяць decides it per currency:
a month with UAH дохід and USD-only витрати would otherwise show a negative USD залишилось on
Головний with its reason left on the other screen. The owner reads a negative залишилось with its
explanation on the 1st of the month, and the same number under the same name on both screens.

*Alternative considered*: copy Місяць's lead rule to Головний, so витрачено becomes the main figure
early in the month. Rejected because the owner asked for залишилось as the main figure and because
a hero number that changes identity mid-month is harder to trust than a negative one with a reason.
It is a one-line change in `homeViewModel` if the owner prefers it.

### D3 — «Потребує уваги» is a reading, and the чернетки stay actionable inside it

Two things can wait on the owner: транзакції carrying «Без категорії», and pending чернетки.

- The uncategorised ones are counted, not listed — the count leads to «Транзакції», where the
  existing «Без категорії» highlight already marks them and a tap opens editing. No new filter and
  no new screen; the ones in the latest five are still one-tap categorisable on Головний itself.
- The чернетки keep the surface they have today — рахунок, дата, text, proposal, «Підтвердити» /
  «Відхилити», the сума field for a raw чернетка — moved under the «Потребує уваги» heading,
  unchanged. The bank-notifications-screen spec requires them to be answerable on Головний; a
  count-only row would have meant a new чернетки screen and a rewrite of that capability, which is
  neither asked for nor an improvement for the one or two чернетки that are normally pending.

The section renders only when at least one of the two exists — no heading, no placeholder,
otherwise. `draftLines` is untouched; the section is a wrapper around it plus one counted row.

### D4 — The count of «Без категорії» is one SQL count over everything stored

`homeViewModel` must not receive the whole history to count uncategorised транзакції, and the
стрічка is only five rows, so counting in TypeScript over what is loaded would answer a different
question ("of the five shown"). One read is added to the transactions repo — a `COUNT(*)` over the
витрати carrying `UNCATEGORISED_CATEGORY_ID` — only витрати, since a повернення is never stored
without a категорія — with a repo test. No schema
change, no migration, no new column: the row already carries the reserved category id.

Дохід «Без джерела» is deliberately *not* counted: the owner named транзакції без категорії, and
«Без джерела» is a different reserved row with a different meaning.

### D5 — `src/ui/home-screen.ts` decides everything the screen says

A new pure module, mirroring `month-screen.ts`, returning a `HomeViewModel`: the status title
(«Залишилось у вересні»), the залишилось and витрачено lines per currency (joined the way
`totalsLine` joins them, so two currencies read as two amounts), the no-дохід note, the empty-month
sentence, the money-held line with its «≈ … грн», and the «Потребує уваги» items with their
Ukrainian plurals (`plural`/`transactionCount` in `labels.ts` already exist). The screen maps over
it and decides nothing. Its tests are where the acceptance criteria about "main figure is
залишилось", "currencies are not summed" and "the section is absent when empty" actually live.

The locative month names («у вересні») go into `src/ui/months.ts` beside the nominative and short
ones — twelve hardcoded strings, like the two lists already there, so Vitest on Node and Hermes
cannot disagree.

### D6 — The «+» is a surface, and the screen wraps its scroll view

`Screen` is a `ScrollView` inside a `SafeAreaView`; a floating control cannot live inside its
scrolling column. `Screen` grows one optional `overlay` prop rendered as an absolutely positioned
sibling of the `ScrollView`, and `surfaces.tsx` gains a `Fab` — one circle, the accent colour, the
44pt tap target the rest of the app uses. Head-room: the same overlay slot is what a future
«Записати» pinned above the tab bar would use, but nothing else uses it in this change.

### D7 — Recording confirms on the entry screen and stays open

`recordedConfirmation` already produces the sentence; today it is rendered under «Записати» on
Головний. It moves with the form: after a successful store the entry screen clears its fields and
shows the confirmation in place, so recording a second транзакція costs no navigation and the
owner reads what was stored where they are looking. Returning to Головний is «Назад», and the
стрічка reloads on focus as it already does.

*Alternative considered*: close the screen on save and show the confirmation on Головний. That
needs state carried across navigation (a route param or module-level state) for one sentence, and
it makes recording three транзакції cost three round trips. Rejected.

### D8 — The vision line and the capability Purpose are amended in this change

docs/product-vision.md §3 ("On opening the app: add a transaction, and see the latest
transactions") and the main-screen spec's Purpose both describe the screen this change replaces.
Hard rule 8 says to stop and ask when a change contradicts the vision; the owner asked for this
change knowing what Головний does today, which is the answer — and the answer is written down
rather than left implicit. Both texts are rewritten here, in the same change, so the archived spec
never contradicts its own requirements. The vision's two questions themselves — where the money
went, how much is left — are untouched; this change serves the second one better than the screen
it replaces.

### D9 — The «Без категорії» count and the alert both keep their existing homes

Two structural details that a screen split gets wrong by default:

- The `local-save` failure сповіщення routes to `HOME_ROUTE` (`src/reminders/notices.ts`), so
  `useClearAlertOnOpen('local-save')` stays on Головний — that is still where the сповіщення
  leads, and confirming a чернетка there still raises it. What moves to the entry screen is the
  raise and the on-success clear that live inside `record`/`store`.
- Three test files assert against the *source text* of `src/app/(tabs)/index.tsx`, and each
  assertion has to be sorted into one of three piles rather than moved wholesale. Moving to the
  entry screen: the `entryDefaultsRepo.remember(` walk, `defaultAccountId(stored.rememberedAccountId`,
  `entryDefaultsRepo.remembered()`, `raiseAlert('local-save'`/`clearAlert` from recording and
  `Alert.alert('Не записано', …)`. Staying on Головний: `useClearAlertOnOpen('local-save')`, the
  чернетка confirmation's own `raiseAlert('local-save'` and `Alert.alert('Не підтверджено', …)`,
  `transactionsRepo.listLatest(FEED_SIZE)`, the `scrollRef=` walk over the five tabs, and
  everything `notifications-screen.test.ts` asserts. Changing shape in place: the literal
  `'<Screen scrollRef={scrollRef}>'`, once the «+» goes into the overlay slot. None is relaxed or
  deleted to get green (hard rule 6), and the two scenario names of the «Головний shows itself
  from its top» block are renamed to the delta's.

### D10 — The in-flight `reminders-and-alerts` wording is reconciled here

That change's delta says a tapped нагадування opens Головний "showing quick entry and any pending
чернетки". It is unarchived, so its text is still editable: this change rewords that scenario in
place if it is still in flight when this one lands, or in `openspec/specs/reminders-and-alerts/`
if it archived first. The routing itself is unchanged — the нагадування still opens Головний,
which is still where recording starts, now through the «+».

## Risks / Trade-offs

- **`transaction/new` resolving to the editor** → proven on the emulator in the smoke pass, with
  the collision-free `entry` route as the fallback (D1).
- **Recording is one tap further away** → that is the point of the change, and the «+» is the
  screen's only floating control, reachable without scrolling from anywhere on Головний.
- **A long-standing pile of «Без категорії» makes the attention section permanent** → it is honest
  (they really are waiting), the section is two lines, and the count leads to where they are fixed.
  If it becomes noise, the answer is a filter on «Транзакції», not a quieter Головний.
- **Головний loads one more month of транзакції** (`listMonth(currentMonth)`) → the same read
  Місяць already does on every focus, and `overLimitByMonth` already reads the months the feed
  touches; with the feed down from 50 rows to 5 that read shrinks at the same time.
- **The screen file is rewritten wholesale** → the entry half is moved verbatim rather than
  retyped, and `diff-reviewer` is asked to check the move for behaviour drift.

## Migration Plan

No data migration: no schema change, no new table, no new column, nothing stored. Rollback is
reverting the commit — the database it leaves behind is the database it started with.
