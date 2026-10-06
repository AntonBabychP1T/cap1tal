## Context

See proposal.md — Why. What exists today, found on 2026-10-06:

- Головний's rail (`src/app/(tabs)/index.tsx` ~1131, model in `src/ui/home-screen.ts`
  `homeViewModel().alerts`) draws an uncategorised banner (`uncategorisedBanner`, opening
  `/transactions?only=uncategorised`), a drafts row expanding in place (`draftCount`, `draftLabel`,
  the confirm/dismiss logic in `src/ui/drafts-section.ts`), and the monobank rows (`failureRow`,
  the no-token row).
- One-tap джерело and the «Без джерела» narrowing of «Транзакції» shipped in `qa-sweep-2026-10`
  (main-screen "A дохід «Без джерела» is given its джерело in one tap", transaction-search "The
  list narrows to «Без джерела»"). «Не дубль» with undo and «Видалити одну» shipped with it too
  (`src/ui/observations.ts` `answeredDuplicate`, `deleteOneConfirmation`). The detector is
  `possibleDuplicates(ledger, month, answered, linked)` in `src/observations/duplicates.ts`.
- Правила: `Rule.target` is `{ kind: 'category' } | { kind: 'transfer' }` (`src/domain/rules.ts`);
  matching is `matchRule` / `matchCategory`; the розбір is `sweepUncategorised` (domain) driven by
  `sweepStored` (`src/db/categorisation.ts`); storage is `rules` in `src/db/schema.ts` with the CHECK
  `rules_target_exactly_one` over `category_id` / `to_account_id`; backup is `BackupRule` in
  `src/backup/format.ts`.
- An arriving monobank item becomes a дохід «Без джерела» in `src/monobank/sync.ts`; a дохід-чернетка
  confirms with `UNSOURCED_SOURCE_ID` in `src/notifications/draft.ts`. `isCounterpartIncome`
  (`src/domain/counterpart-income.ts`) requires `UNSOURCED_SOURCE_ID`, so a дохід that has a джерело
  is never absorbed — which is exactly what the specs say of a дохід a правило-джерело sourced.

## Goals / Non-Goals

**Goals:** one queue screen built only from reads that exist; one rail row in place of two; a
правило-джерело that rides the existing matching ladder, розбір and offer without a second engine.

**Non-Goals:** a stored queue or any «seen» state; a new detector; a шаблон for доходи; touching the
pickers (`uniform-fields`) or the entry form (`quick-entry`); any native work.

## Decisions

**D1 — The queue is a pure function over loaded state.** `answerQueue(input)` in a new
`src/ui/answer-queue.ts` takes the stored транзакції (or the narrowed slice), the pending чернетки,
the «Не дубль» answers, the linked-рахунок set, the monobank rail sentence — computed by one
pure `monobankRailRow(monobank, now)` extracted from `homeViewModel` and called by both it and the
queue route, which loads the same sync state Головний loads, so the words and the moment the entry
leaves are Головний's own —, `today` and an optional `Month`, and returns the groups of the spec in order with
their entries and counts, plus the month line. It reads no clock, storage or React. The rail row's
label (`queueRowLabel(queue)`) is derived from the same result, so the count on Головний and the
queue cannot disagree (answer-queue "holds six kinds", main-screen "One rail row"). *Alternative:*
a `answer_queue` table refreshed on writes — rejected: every answer already changes the row that
made the entry, so a second list could only drift, and the brief asks for a reading.

**D2 — Можливі дублі window: the current month and the month before.** Unnarrowed, the queue calls
`possibleDuplicates` for `today`'s month and the previous one and de-duplicates pairs by their
unordered id key. Older pairs appear in a queue narrowed to their month and stay stated on Місяць.
*Alternative:* all history — rejected: a three-year Saldo history yields pairs the owner cannot
remember, burying this month's. This window is an owner-tunable default (open question 1).

**D3 — Route and parameters.** New pushed route `src/app/answers.tsx` titled «Що потребує
відповіді», opened as `/answers` or `/answers?month=YYYY-MM`; a malformed or absent `month` narrows
nothing, mirroring transaction-search's month parameter. The month narrowing uses the existing
month chip/stepper of «Транзакції» for consistency. Long groups page by 20 in the screen state; the
pure model returns full lists and the screen slices, so "answering keeps the place" is a screen
state rule tested through a pure `visibleEntries(group, shownCount)` helper.

**D4 — Answers reuse existing actions.** Категорія: the quick picker and suggestion of the feed
(`category-choices.ts`, `shortlist.ts`) and the правило offer flow. Джерело: the existing «Обрати
джерело» picker, now followed by the правило-джерело offer (D7). Чернетка: `confirmPendingDraft` /
`dismissPendingDraft` from `drafts-section.ts`, moved off Головний. Дубль: the observations
widget's «Не дубль» / «Скасувати» / «Видалити одну» handlers, extracted to a shared hook so the
widget, Місяць, the підсумок and the queue call one implementation. Nothing in the queue writes
except through these.

**D5 — Головний rail.** `homeViewModel().alerts` replaces `uncategorisedBanner`, `draftCount`,
`draftLabel` with `queueRow: { total, label } | null` computed by D1's function over the data
Головний already loads (it already loads the current month's спостереження; the previous month's
дублі are one more `possibleDuplicates` call over the ledger it holds). The draft expansion and its
state leave `index.tsx`. `failureRow` and the no-token row are unchanged. Plural forms reuse
`src/progress/plural.ts`.

**D6 — Правило-джерело in storage.** `rules` gains a nullable `source_id` referencing `sources.id`
with `onDelete: 'restrict'`. That restriction never reaches the owner: the categories capability
offers no deletion of a джерело, only archiving, and an archived джерело keeps its правила working
(categorisation-rules "A правило-джерело keeps matching into an archived джерело"); `restrict` only
guards storage against a future deletion path. The CHECK
`rules_target_exactly_one` is replaced by one counting exactly one non-null among `category_id`,
`to_account_id`, `source_id`. Changing a CHECK recreates the table: the generated migration copies
the rows (drizzle-kit emits the `__new_rules` copy, whose `INSERT … SELECT` names the new
`source_id` in the old table — that one data statement is corrected by hand to `NULL`, as
`.claude/rules/database.md` allows and as migration 0012 did for `merchant_id`); a migration test with representative rows of
both existing kinds proves they survive and that a row with two targets is refused. `npm run
db:generate` produces the next migration in `drizzle/`; no hand-written DDL, only the data copy above. Before generating,
re-read `schema.ts` and `ls drizzle/` for a sibling's newer migration (memory: shared-tree commits).
The repository refuses `UNSOURCED_SOURCE_ID` as a target before storage sees it.
`BACKUP_SCHEMA_VERSION` becomes the schema version before this change's plus one — equal to the
migration journal's length after `db:generate`;
`BackupRule.sourceId?` is optional, so an older бекап restores with none (backup-file "A бекап carries
a правило-джерело"); the consistency check counts three targets.

**D11 — Glossary first.** `docs/glossary.md` gains «Правило-джерело» and its Rule, Sweep (розбір)
and Counterpart income entries are extended (a джерело a правило-джерело gave counts as one the
owner chose, so that дохід is no longer a зустрічний дохід) before any code, so code and specs use
one word.

**D7 — Matching knows the direction; one ladder.** `RuleTarget` gains `{ kind: 'source'; sourceId }`.
`matchRule` takes `direction: 'out' | 'in'` (default `'out'` for every current caller); `eligible`
excludes `source` rules for `'out'` and every non-`source` rule for `'in'`. A new
`matchSource(rules, merchants, { description, mcc })` mirrors `matchCategory` with `'in'`. The шаблон
is never consulted for `'in'` (its rules are all category rules, so eligibility already excludes
them). Ranking (`beats`) is untouched.

**D8 — Where a правило-джерело applies.** (a) `src/monobank/sync.ts`: after the зустрічний-дохід
check, an arriving item's `sourceId` is `matchSource(...) ?? UNSOURCED_SOURCE_ID`. (b)
`src/notifications/draft.ts` confirmation: same for a дохід-чернетка, matched on the text with no
MCC; auto-confirm stays expense-only. (c) a sibling of `sweepUncategorised`, `sweepUnsourced(tiers, transactions)`,
returns `{ id, sourceId }[]` for stored доходи «Без джерела» that `matchSource` answers;
`sweepStored` calls it over the транзакції re-read after the витрати moves and their absorptions
are written, in the same immediate transaction, so a дохід a new переказ absorbed no longer exists
and is never sourced, and extends `SweepCounts` with
`incomesExamined` and `incomesSourced` for the журнал and the «розбір» message. Every розбір
trigger therefore covers доходи with no new call sites, and it reaches every stored дохід «Без
джерела», whatever stored it. Manual entry and the Saldo import never call `matchSource` at the
moment they store a дохід.

**D9 — The offer.** `ruleOffer` / `ruleOfferView` in `src/ui/list-management.ts` gain a `source`
target, and `ruleTargetLabel`, `ruleLine`, `ruleFromDraft` and `sweepSaid` learn it (the last one
naming доходи given a джерело). For a дохід whose folded опис starts with «від:»
the proposed pattern is the whole folded, trimmed опис (categorisation-rules); otherwise
`proposeMerchantPattern`. The offer text reads «Гроші з таким описом отримають джерело «…»».

**D10 — Підсумок, виклик.** `month-summary-screen`'s unanswered lines and the виклик action
(`answerMonthRoute` in `src/ui/progress-screen.ts`) push `/answers?month=YYYY-MM` instead of
`/transactions?...&only=` or `/` for `left: 'uncategorised' | 'unsourced' | 'drafts'`;
`left: 'nothing'` keeps opening `/transactions?month=YYYY-MM`. The `only=` parameters of «Транзакції» stay — the list keeps its own
narrowings.

No new native module, permission, package, `app.json` field or config plugin.

## Risks / Trade-offs

- [The owner loses one-tap draft confirmation on Головний] → the rail row names чернетки first in
  its kinds, and the queue opens with «Чернетки» right after the bank entry; recorded as **BREAKING**
  in the proposal and as open question 2.
- [A broad правило-джерело gives a джерело to a дохід that is really the other leg of the owner's own
  переказ, which then is no longer absorbed and counts as income] → the offer for «від:» proposes
  the whole sender, not «від»; the розбір says how many доходи it sourced so a broad правило is
  noticed; the дохід stays retypeable from editing. Covered by the scenario "A sourced дохід is not
  absorbed later".
- [Unnarrowed «Без категорії» over three years is long] → paging by 20, newest first; the counts on
  the rail row and group heading stay exact.
- [Recreating `rules` for a CHECK change] → generated copy migration plus a data test; rules are few
  (dozens), so the copy is instant.
- [Sibling collisions on main-screen and observations] → sequencing in proposal Impact; the shared
  дубль-answer hook (D4) is the seam `observations-by-weight` should edit, not three copies.

## Migration Plan

One append-only migration (D6). Rollback is the previous build: the new column is nullable and
older code ignores it — but a правило-джерело row would then violate the old build's assumption of a
category-or-transfer target, so a rollback build must not be installed over data holding one; the
бекап of the previous schema version restores cleanly into this one, not the reverse.

## Open Questions for the owner

1. Можливі дублі in the unnarrowed queue: the current and previous month (chosen), or all history?
2. Should Головний keep the in-place draft expansion as well, at the price of a second row? Chosen:
   no — one row, one place.
3. Should the daily нагадування (vision §13) open the queue instead of Головний? Chosen: unchanged —
   it opens Головний, whose rail row names the чернетки; changing it would edit the vision.
4. The month line names the most recent завершений активний місяць only. Should it name every
   unclean finished month (e.g. «У серпні ще 3»)? Chosen: one line, the latest, as «Закрий
   <місяць>» does.
5. Vision and glossary make кешбек a повернення, never a дохід, so this change uses no кешбек
   example and a правило-джерело never decides one. Should a bank-paid кешбек reward be a дохід
   instead? That would need a vision and glossary edit first.
