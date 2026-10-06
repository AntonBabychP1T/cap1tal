## Why

What waits for the owner's word lives in six places today: «Без категорії» behind a banner on
Головний, «Без джерела» behind a mark in the feed and a narrowing in «Транзакції», чернетки behind
a second rail row, можливі дублі inside the «Спостереження» widget and Місяць, a bank the app
cannot hear in a third rail row, and the виклик «Закрий <місяць>» on Прогрес. Each was answerable
after `qa-sweep-2026-10`, but never together: closing a month still means visiting four screens and
knowing which one holds what (roadmap 1.1, QA 2.3). And the most common unanswered дохід — зарплата,
відсотки банки, перекази від батьків — has to be given its джерело by hand every single month, because a правило
cannot name a джерело.

This serves the first problem of the vision, *where did the money go*: a «Без категорії» витрата,
a «Без джерела» дохід, an unconfirmed чернетка and an unanswered дубль are exactly the places where
that answer is wrong or missing. It also serves vision §15 directly — a чистий місяць becomes a
five-minute task on one screen — and §3, which keeps what waits for an answer beneath the header
of Головний.

## What Changes

- **One screen «Що потребує відповіді».** A pushed screen listing, in a fixed order of groups,
  every thing that waits for the owner: a bank the app cannot hear (the same sentence Головний's
  rail states, leading to monobank), the pending чернетки, the можливі дублі of the current and the
  previous month, the витрати and повернення «Без категорії», and the доходи «Без джерела». It is a
  reading over stored state — computed when shown, stored nowhere, no list of its own.
- **Every entry is answered where it stands.** A чернетка is confirmed (supplying the сума of a raw
  one) or dismissed; a можливий дубль takes «Не дубль» (with «Скасувати») or «Видалити одну»; a
  «Без категорії» record takes a категорія from the short picker (the правило's suggestion first)
  or «Це переказ»; a «Без джерела» дохід takes a джерело from the short picker. An answered entry
  leaves the list at once; the правило offer follows an answer exactly as it does from the feed.
- **The month narrowing.** The queue can be narrowed to one місяць. When the most recent завершений
  активний місяць still holds unanswered records, the unnarrowed queue leads with one line naming
  that місяць and how many remain, which opens the queue narrowed to it. The підсумок's «Що ще без
  відповіді» and the виклик «Закрий <місяць>» open the queue narrowed to their місяць instead of
  «Транзакції» or Головний.
- **One row on Головний instead of two.** The rail's uncategorised banner and its drafts row become
  one row naming what waits — «Що потребує відповіді» with its total and the kinds present (for
  example «2 чернетки · 1 дубль · 7 без категорії») — which opens the queue. The rail row for a
  bank the app cannot hear stays as it is. Чернетки are confirmed and dismissed in the queue, no
  longer by expanding a row on Головний. **BREAKING** for the owner's habit: the in-place draft
  expansion on Головний is gone.
- **Правило-джерело.** A правило may name a джерело as its target («зарплата → Зарплата»,
  «відсотки → Відсотки»). It matches only money arriving: a monobank statement item that would be a
  дохід «Без джерела», and a дохід-чернетка at confirmation. Storing one runs a розбір over the
  stored доходи «Без джерела». Giving a дохід its джерело offers to remember it as a
  правило-джерело, with the criterion proposed from the опис exactly as for a категорія. The rules
  list, the rule form and the бекап carry the new target.

Already in place and **not** re-specified here (found in the main specs after `qa-sweep-2026-10`):
the «Без джерела» narrowing in «Транзакції» and opening it already narrowed, the one-tap «Обрати
джерело» mark on a дохід line, «Не дубль» with undo, and «Видалити одну» on a можливий дубль. The
queue reuses each of them as it is.

### Non-goals

- No stored queue, no «seen» or «snoozed» state, no dismissing an entry without answering it.
- No notification, badge, sound or dialog about the queue (vision §13, §19 stand).
- No шаблон for доходи: the built-in шаблон категоризації stays expense-only; only the owner's own
  правила name a джерело.
- No правило-джерело applied at the moment a дохід is recorded by hand or imported from Saldo
  (the розбір still reaches a stored дохід «Без джерела» whatever stored it), or for a повернення, a
  переказ or a коригування; a правило never turns a дохід into a повернення or a переказ.
- No change to what a можливий дубль, an спостереження or a чистий місяць is; ranking and caps of
  спостереження belong to `observations-by-weight`.
- No change to the pickers themselves (owned by `uniform-fields`) or to the entry form (owned by
  `quick-entry`).
- Vision §14 is not touched: nothing here is a forecast, a scheduled транзакція, a tag or a split.

## Capabilities

### New Capabilities
- `answer-queue`: the «Що потребує відповіді» screen — its groups and their order, what each
  entry says, the answer each takes in place, the month narrowing and the line leading to it, and
  that it is a reading over stored state.

### Modified Capabilities
- `main-screen`: the uncategorised banner and the drafts row become one rail row opening the
  queue; «Потребує уваги» no longer opens «Транзакції» narrowed to «Без категорії»; the правило
  offer after giving a дохід its джерело.
- `bank-notifications-screen`: pending чернетки are reached through Головний's rail row and
  answered in the queue rather than expanded on Головний; a confirmed дохід-чернетка takes the
  джерело a правило-джерело gives.
- `bank-notifications`: confirming a дохід-чернетка applies the правила-джерела.
- `monobank-sync`: an arriving statement item takes the джерело of the best правило-джерело.
- `categorisation-rules`: a правило may target a джерело; how it matches; the розбір over доходи
  «Без джерела»; the offer to remember one.
- `settings-screen`: the «Правила» list and form show and set a джерело target.
- `backup-file`: a бекап carries a правило's джерело target.
- `transaction-search`: the «Без категорії» narrowing agrees with the queue's group rather than a
  banner on Головний; opening it narrowed to a місяць no longer names the виклик as its reason.
- `month-summary` and `month-summary-screen`: «Що ще без відповіді» leads to the queue narrowed
  to the month.
- `challenges`: «Закрий <місяць>»'s action opens the queue narrowed to the month.
- `motion`: the чернетки no longer open on Головний; the rail row and an entry answered in the
  queue come and go smoothly instead.
- `reminders-and-alerts`: the нагадування still opens Головний, which now names the pending чернетки
  in the rail row instead of showing them.

## Impact

- New pushed route for the queue and a pure screen-logic module beside it in `src/ui/`; Головний's
  rail rows in `src/app/(tabs)/index.tsx` and `src/ui/home-screen.ts`.
- `src/db/schema.ts`: one nullable column on `rules` for the джерело target, its CHECK widened to
  exactly one of three targets; the next generated migration; `BACKUP_SCHEMA_VERSION` raised by one.
- `docs/glossary.md`: «Правило-джерело» added; Rule, Sweep (розбір) and Counterpart income extended.
- Matching in `src/db/categorisation.ts` and the rules repository; the monobank mapping and the
  чернетка confirmation; the rules form in Налаштування.
- No new native module, permission, package or config plugin.
- **Schema collisions.** `commitments-from-recurring`, `backup-reminder` and
  `category-icons-and-transaction-visuals` may also edit `src/db/schema.ts`, add a migration or
  raise `BACKUP_SCHEMA_VERSION`: whichever lands second regenerates its migration and takes the next
  version number.
- **Sequencing.** `main-screen` is shared with `quick-entry`, `observations-by-weight`,
  `commitments-from-recurring` and `backup-reminder`, and the in-flight `local-model-guesses`,
  `voice-entry` and `category-icons-and-transaction-visuals` — not in the same wave as any of them
  that edits the service rail (`backup-reminder` adds a rail line). `observations-by-weight` also
  edits «Не дубль» and the дубль detector the queue reads — not in the same wave; whichever lands
  second rebases its delta. `uniform-fields` replaces the picker the queue uses — land it before or
  after, not alongside. `local-model-guesses` modifies `transaction-search` and
  `bank-notifications-screen` — not in the same wave.
- Vision §13 says the нагадування opens Головний «where the pending drafts wait»: they are still
  named there, in the rail row, one tap from where they are answered (`reminders-and-alerts` is
  reworded to say so). Whether the нагадування should open the queue instead is open question 3 in
  design.md; the vision is not edited.
