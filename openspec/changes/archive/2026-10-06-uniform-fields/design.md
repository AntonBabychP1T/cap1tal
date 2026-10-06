## Context

See proposal.md — Why. `qa-sweep-2026-10` already built every part this change needs; what is left
is wiring the remaining screens to it:

- **Picker.** `Picker` (`src/components/form.tsx`) draws `shortlist` + `allOffer`
  (`src/ui/shortlist.ts`, `PICKER_SIZE = 5`) and the full list with `narrow` and
  `searchBelow`; its search `Field` already carries no `autoFocus` (qa-sweep task 4.3). Recents come
  from `recentlyUsed(latest, PICKER_SIZE)` (`src/ui/category-choices.ts`), as
  `src/app/manage/commitments.tsx` does. Pickers already on it: entry form, editing, the quick marks
  on Головний and «Транзакції», the зобов'язання form, рахунок merge (`account/[id]`), продавець
  merge and naming.
- **Still on a bare `Choices` wall** (inventory of 2026-10-06, every `Choices`/`Picker` call site
  under `src/app` and `src/components`):

  | Screen | Field | Builder in `src/ui` |
  |---|---|---|
  | `manage/installments.tsx` | «Рахунок списання», «Категорія» (`scroll`) | `debitAccountChoices`, `installmentCategoryChoices` (`installment-form.ts`) |
  | `manage/rules.tsx` | «Переказ на», «Категорія» | `accountChoicesFor`, `expenseCategoryChoices` |
  | `manage/rule-template.tsx` | «Категорія» of an opened базова категорія | `templateTargetChoices` (`rule-template-screen.ts`) |
  | `manage/goals.tsx` | «Категорія» of a ціль витрат | `spendingGoalCategoryChoices` (`goals-section.ts`) |
  | `manage/notifications.tsx` | «Рахунок» of a new watch | `offered` (screen-local) |
  | `manage/monobank.tsx` | «Наявний рахунок у …» | `linkChoices` (`monobank-screen.ts`) |

  Left as they are on purpose (proposal Non-goals): «Транзакції»'s рахунок/місяць/продавець rows and
  «Звіти»' категорія/валюта rows (narrowing), the склад of a ціль (`RowAction` ticks), Saldo's merge
  targets and redirects (own search, most-alike order), and the вид/валюта/тип/періодичність rows,
  which are fixed short enumerations, not рахунок/категорія/джерело.
- **Sibling in flight.** `answer-queue` (being applied in the main checkout at the same time) adds a
  «Джерело» target to a правило, drawn as a bare `Choices` in `manage/rules.tsx`. It falls under
  app-shell's general SHALL (one джерело to be stored). Whichever of the two lands second converts
  that field to `Picker` (`noun="sources"`) and keeps the guard of task 2.5 green; the guard is
  written to cover джерела too.
- **Рахунок sets.** `commitmentAccountChoices` (`commitment-form.ts`) offers every unarchived
  рахунок; `debitAccountChoices` every unarchived UAH one; the notifications `offered` every
  unarchived one. None looks at `kind`.
- **Date text leaks** (grep of `${…date|deadline…}` and `toLocaleString` in `src/ui`, `src/app`,
  `src/progress`): `src/app/manage/goals.tsx:404`, `src/app/goal/[id].tsx:85`,
  `src/app/(tabs)/reports.tsx:729` (raw `IsoDate` deadline); `src/app/(tabs)/index.tsx:1285` with
  `DraftLine.date` (`src/ui/drafts-section.ts:33`); `boundaryConfirmation` and its several-рахунки twin
  (`src/ui/monobank-screen.ts:343`, `:759`); `receipt-screen.ts:159`, `:587`, `:609` (`issuedDate`);
  `src/progress/catalogue.ts:414`; `src/app/manage/saldo-import.tsx:308` (`toLocaleString('uk-UA')`).
  Money: no «₴» outside the notification parser, every сума through `formatMoney`; nothing to do.
- **Date control.** `DateField` → `dateStepOffers(typed, now)` (`src/ui/dates.ts:132`) offers
  `forward` only while the дата is before today, for every caller.

## Goals / Non-Goals

**Goals:** the six screens above on `Picker`; three рахунок builders filtered by `kind`; seven date
leaks through the existing labels; a forward-looking mode for the date control. Pure view-model
changes in `src/ui` (and one line in `src/progress`), each proven under `verify`.

**Non-Goals:** no domain, storage or migration change; no new component; no change to `Picker`'s
own behaviour beyond what app-shell already says; no new native module, permission, `package.json`
or `app.json`/config-plugin change.

## Decisions

**D1 — Reuse `Picker`, add rows builders, not a new component.** Each of the six screens gets a
`…Rows(): Named[]` builder next to its existing `…Choices` (as `commitmentAccountRows` /
`commitmentCategoryRows` did), and the screen passes `recentIds` from `recentlyUsed`. Рахунок rows are
named with `accountChoiceLabel` (name plus currency), so a search for «USD» finds the USD рахунки —
the розстрочка form currently passes the bare name. Alternative — a `<AccountPicker>` /
`<CategoryPicker>` wrapper — rejected: it would hide which set is offered, which differs per screen
and is the part the specs pin.

**D2 — Screens with no transaction history to hand load `latest`.** `installments`, `rules`,
`rule-template`, `goals`, `notifications` and `monobank` do not read транзакції today. Each adds the
same bounded read the зобов'язання screen uses for its recents
(`transactionsRepo.listLatest(RECENT_WINDOW)`); no new repository method. For the monobank link the recents are resolved
against the currency-matched `linkChoices`, so they rarely apply, and the list is simply topped up
in order — acceptable, the rule is still the same control.

**D3 — Picking from a picker that acts at once.** The monobank link and the шаблон's категорія act
on tap (confirm-and-link; store-and-sweep). With `Picker`, `onSelect` keeps that meaning: choosing
from the shown few or from the full list fires the same handler. The шаблон row passes the
базова категорія's current target as `selected`, so it stands among the five.

**D4 — No рахунок-борг where money is paid from: one predicate, three call sites.** Add
`isPerson(account)` (kind `debt`) to `src/ui/account-choices.ts`. `commitmentAccountChoices` and
`debitAccountChoices` drop `isPerson` рахунки; so does the watch's рахунок list, moved out of the
screen into a `watchAccountChoices` builder in `src/ui/notifications-screen.ts`. The chosen рахунок of
a stored plan is carried back with the existing `withCurrent` pattern, so a зобов'язання or розстрочка
already on a рахунок-борг keeps showing it (a watch needs no such carry: a watch is added, never
edited). An інвестиційний рахунок stays offered everywhere — orchestrator's decision, 2026-10-06: the
owner's real розстрочка is paid from a UAH інвестиційний рахунок (military bonds), and a broker's fee
can be a зобов'язання. Where the rule lives: each set belongs to the capability that owns it
(commitments-screen, installments-screen, bank-notifications-screen); app-shell only fixes how the
offered choices are shown. Rejected for now: a refusal in the domain `commitments`/`installments`
validators. It could follow the archived-рахунок pattern (`context.existing` keeps a stored plan
valid), but it would add a refusal no spec names; the specs fix only what is offered. Consequence:
nothing below the UI enforces the rule, so `commitments-from-recurring` must pre-fill «Рахунок
списання» only from `commitmentAccountChoices`. The glossary entry for «Рахунок списання» is amended in task 1.3, at apply time.

**D5 — Owner's choice taken here: the entry form is left alone.** Excluding рахунки-борги from a
витрата's «Рахунок» would modify main-screen, which `quick-entry` is reworking in the same horizon,
So the exclusion stops at plans and bank watches; whether the entry form should also drop рахунки-борги is an open question.

**D6 — A date that looks ahead.** `dateStepOffers(typed, now, { looksAhead })`: with `looksAhead`
the `forward` step is always present; `DateField` takes a `looksAhead` prop and passes it. Callers:
`manage/goals.tsx` («До дати»), `manage/commitments.tsx` and `manage/installments.tsx` («Дата першого
платежу»). The other six `<DateField>`s (`(tabs)/accounts.tsx`, `account/[id].tsx`,
`transaction/new.tsx`, `transaction/[id].tsx` and both in `manage/monobank.tsx`) keep today's
behaviour. «Вчора» stays on every field — removing it
from a forward field would make the control differ by screen, the very thing this change removes.

**D7 — Date leaks through the labels that exist.** A ціль deadline and a чек's issue day →
`calendarLabel(date, now)`; a чернетка's line → `dayLabel` (it is a транзакція line, app-shell "A
транзакція's дата reads as a day"); the monobank confirmations → `calendarLabel`; the Saldo moment →
`momentLabel(ms, now)` (which already drops seconds and says «сьогодні/вчора о …»); the досягнення
condition → `calendarLabel` too, but without `src/progress` importing `src/ui`: the pure wording
(`GENITIVE_MONTHS`, `calendarLabel`) moves to a shared pure module `src/domain/day-words.ts` taking
the year as "this year" from an `IsoDate` today, and `src/ui/dates.ts` re-exports it, so every
current caller is unchanged. The view
models that hand a raw `IsoDate` to a screen (`GoalRow.deadline`, the goal-screen model, the reports
goal row, `DraftLine.date`) gain a ready label field, so the `.tsx` interpolates text only. A
source-text assertion in `src/ui/screens.test.ts` forbids `toLocaleString`/`toLocaleDateString` in
`src/app` and `src/ui`.

## Risks / Trade-offs

- [Six screens grow a транзакції read] → bounded by `PICKER_SIZE`-driven recents; the зобов'язання
  screen already does it without a measurable cost.
- [An owner who did record a plan on a рахунок-борг can no longer create a new one there] → the
  stored one keeps it (D4).
- [`looksAhead` becomes a second mode of one control] → a single boolean in a pure function, proven
  both ways in `src/ui/dates.test.ts`.
- [Sibling `quick-entry` edits `Picker` in parallel] → this change does not change `Picker`; only
  call sites. Sequencing note in the proposal.

## Migration Plan

None: no storage change. Rollback is reverting the commit.

## Open Questions for the owner

1. Should the entry form's витрата/повернення «Рахунок» also stop offering a рахунок-борг (and should
   a дохід)? Decided **no** here (D5) to stay off main-screen while `quick-entry` reworks it.
2. Should «Рахунок списання» (and the watch's рахунок) also stop offering a банка or a готівка
   рахунок? Decided **no** (D4): only a рахунок-борг is excluded.
3. A рахунок-борг is still offered as the existing рахунок a monobank card links to (it is filtered by
   currency only). Harmless in practice; left as is unless the owner wants it excluded too.
