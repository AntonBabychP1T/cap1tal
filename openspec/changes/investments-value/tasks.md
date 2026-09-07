# investments-value — tasks

Every amount in every test is integer minor units beside its currency code. No task adds a
dependency, a native module, an emulator run or a network call to `npm run verify`.

## 1. Vocabulary

- [x] 1.1 Add «Вкладено» to the Accounts section of `docs/glossary.md` beside the «Поточна
      вартість» the goals change already put there, and point the existing «Прибуток / збиток»
      entry at both by name (design D8): вкладено is the інвестиційний рахунок's розрахунковий
      баланс, поточна вартість is the hand-entered сума in that рахунок's currency with the дата it
      was entered, at most one per рахунок. Say in «Прибуток / збиток» that it is not a monthly
      number. Verify by reading the three entries together — no term used in the deltas is left
      undefined, and no synonym for either is introduced anywhere.

## 2. Domain

- [x] 2.1 Add `src/domain/investments.ts` with `contributed(account, transactions)`: the рахунок's
      розрахунковий баланс via `computeBalance`, rejecting any вид other than `investment`
      (design D1), and the `CurrentValue` type (сума + дата) that `src/ui/goal-screen.ts` declared
      ahead of this change — which now re-exports it rather than keeping a second copy. Tests in
      `src/domain/investments.test.ts`: "Scenario: Money back out reduces вкладено", "Scenario:
      Money that was there before the app is вкладено too", "Scenario: Вкладено is the whole
      history, інвестовано is one month", "Scenario: A cross-currency переказ is вкладено in the
      рахунок's own currency" and "Scenario: A рахунок of another вид has no вкладено".
- [x] 2.2 Add `gainLoss(value, contributed)` to the same module — `subtract` over two amounts of
      one currency, absent when there is no вартість (design D2). Tests in
      `src/domain/investments.test.ts`: "Scenario: A вартість above вкладено is a прибуток",
      "Scenario: A вартість below вкладено is a збиток", "Scenario: Equal amounts are zero, not
      absent", "Scenario: Without a вартість there is no прибуток" and "Scenario: Two рахунки in
      different currencies keep separate figures".

## 3. Schema, migration and repository

- [x] 3.1 Add `investment_values` to `src/db/schema.ts` — `account_id` primary key referencing
      `accounts` with `onDelete: 'restrict'`, `amount`, `currency`, `as_of`, plus the
      `amount >= 0` and ISO-date GLOB checks (design D3); generate one append-only migration with
      `npm run db:generate` and regenerate `drizzle/migrations.js`. Extend
      `src/db/migrations.test.ts`: "Scenario: A fresh database holds поточні вартості",
      "Scenario: Existing financial data survives the migration" and "Scenario: No рахунок gains
      an invented вартість".
- [x] 3.2 Implement `src/db/investments-repo.ts` — read one, upsert (replacing сума and дата),
      clear — refusing a missing рахунок, a рахунок of another вид and a currency other than the
      рахунок's (design D4); export it from `src/db/repos.ts`. Tests in
      `src/db/investments-repo.test.ts`: "Scenario: Reopening storage returns the вартість
      unchanged", "Scenario: Storing again replaces, never accumulates", "Scenario: Clearing
      leaves nothing behind", "Scenario: An unknown рахунок is rejected", "Scenario: A рахунок of
      another вид is rejected", "Scenario: A currency other than the рахунок's is rejected" and
      "Scenario: A negative сума is rejected", plus "Scenario: The numbers survive archiving" —
      archiving a рахунок takes nothing of its вартість away.

## 4. Screen logic

- [x] 4.1 Add the zero-or-positive amount parser to `src/ui/amount-input.ts` (design D6) — zero is
      a real вартість, below zero is not. Tests in `src/ui/amount-input.test.ts` naming the
      investments scenario it serves: "Scenario: A negative вартість is rejected, zero is not".
- [x] 4.2 Extend `AccountRow` in `src/ui/account-groups.ts` with the investment block — вкладено
      named as such, and, only when a вартість exists, the formatted вартість, its дата and the
      signed прибуток — fed by a вартості map beside the existing balances and bank balances
      (design D6), plus the confirmation text for clearing. An archived інвестиційний рахунок keeps
      its block: archiving takes nothing away. Tests in `src/ui/account-groups.test.ts`: "Scenario:
      All three numbers stand beside each other", "Scenario: A збиток is shown as the negative it
      is", "Scenario: Without a вартість only вкладено is shown", "Scenario: Other вид рахунки are
      untouched" and "Scenario: The numbers survive archiving".

## 5. Рахунки screen

- [x] 5.1 Show the investment block on the рахунок's row in `src/app/(tabs)/accounts.tsx`, reading
      вартості on focus like every other query there, and keep the row's single main amount —
      no рахунок shows the same number twice, and no `spending`, `savings`, `cash` or `debt`
      рахунок shows any of it. Verify on the emulator (`scripts/android.sh up`, then `shot`)
      against a рахунок with a вартість, one without, and one of another вид.
- [x] 5.2 Record, replace and clear the вартість from that row: the сума in the рахунок's own
      currency, the дата taken as today at entry (design D5), a rejection surfaced as «Не
      збережено» leaving the numbers unchanged, and clearing behind a confirmation. Verify on the
      emulator that after each of the three the розрахунковий баланс is unchanged, no транзакція
      appears on Головний, and nothing offers to звірити the вартість against the баланс — while
      «Звірити» against a typed фактичний залишок is still offered on that рахунок's рухи, exactly
      as it is for every other unarchived рахунок. The вид total and «Усього грошей» keep counting
      вкладено and are unchanged by a вартість (design Goals/Non-Goals).

      **What the emulator showed** (Pixel_10_Pro / emulator-5554, API 37; frames in
      `.cache/android/smoke/investments-value/`). Both tasks pass, and nothing had to be fixed.

      *5.1.* «Akcii» (вкладено 3 000,00 UAH, no вартість) shows its amount once with «вкладено»
      under it and a lone «Записати вартість». «ОВДП» (вкладено 11 000,00 UAH) shows «поточна
      вартість на 2026-09-07 — 10 500,00 UAH» and «збиток −500,00 UAH» beneath the same single
      main amount, with «Змінити вартість» and «Забрати». «Картка» (витратні), «Заначка»
      (накопичувальні), «Готівка» and «Maksym» (борги) each show one balance line and nothing
      else. The block survives a force-stop restart unchanged. That it survives archiving is
      pinned by test, not by a frame — no screenshot shows an archived інвестиційний рахунок's
      row (`account-groups.test.ts` «The numbers survive archiving» is what covers it).

      *5.2.* Recording 12 000,00 against вкладено 11 000,00 gave «прибуток +1 000,00 UAH» dated
      2026-09-07 with no дата field offered; replacing with a lower figure turned it into a
      «збиток» carrying a real minus sign and the earlier figure was gone; «Забрати» asked first
      and returned the row to вкладено alone. Through all three, вкладено stayed 11 000,00, the
      «ІНВЕСТИЦІЙНІ» heading stayed 14 000,00 UAH, «Усього грошей» stayed 75 712,00 UAH, and
      Головний grew no транзакція. A typed «-100» raised «Не збережено» with the parser's own
      sentence and left every number as it was. Nothing anywhere offered to звірити a вартість
      against вкладено; on ОВДП's рухи «Звірити» against a typed фактичний залишок of 11 500,00
      proposed «коригування на +500,00 UAH» — measured from the розрахунковий баланс 11 000,00,
      not from the вартість, which would have given a different number.

      **Seen but out of scope, for the backlog rather than this change.** The inline вартість
      editor opens at the bottom of the list and the list does not scroll it into view, so with a
      keyboard attached the field and «Зберегти» can sit under the IME. And the «Не збережено»
      dialog offers «Повідомити про помилку» for what is only a refused input — neither is
      something this change's specs say, so neither was touched here.

## 5a. The бекап

- [x] 5a.1 Carry the вартості in the бекап (design D9): the shape in `src/backup/format.ts` with
      `investment_values` in `BACKUP_TABLES`, `BACKUP_SCHEMA_VERSION` moved to the new migration
      count, parsing and `checkConsistent` refusing a вартість whose рахунок the бекап does not
      hold, is not of вид `investment`, is in another currency, is named twice or is negative;
      canonical ordering if the shape needs one. `BACKUP_FORMAT_VERSION` does not move. Tests in
      `src/backup/format.test.ts` for each refusal and for an older бекап that names none.
- [x] 5a.2 Snapshot and restore them in `src/db/backup-repo.ts`, deleting `investment_values`
      **before** `accounts` in `replaceAll` — the reference is `onDelete: 'restrict'` and foreign
      keys are on, so without it every restore on a phone holding a вартість fails on a FOREIGN KEY
      constraint. Tests in `src/db/backup-repo.test.ts`: "Scenario: A вартість survives the round
      trip", "Scenario: A restore replaces the вартості it finds", "Scenario: A бекап written
      before вартості existed still restores" and a restore onto a phone that holds one, which is
      the case that fails without the delete.

## 5b. What the вартість is finally read by

- [x] 5b.1 Feed the вартості to the three places that already take a map and are handed none
      (design D10): `src/app/goal/[id].tsx` (`goalScreenModel`'s `currentValues`, дата included),
      the цілі group of `src/app/(tabs)/reports.tsx` (`reportsViewModel`), and the пакет built in
      `src/ui/ai-analysis-screen.ts` — each reading `investments.all()` beside the queries it
      already makes on focus. Nothing in the domain or the view models changes; the sockets are
      typed and tested already. Verify that a ціль whose склад holds an інвестиційний рахунок with
      a вартість shows that вартість as the внесок, and one without still shows the баланс.

## 6. Roadmap

- [x] 6.1 Move the step-10 row of the `docs/tech-task.md` §5 table to ✅ with one line on what
      landed, and update the completion figure in the sentence below the table. Verify the table's
      state matches `openspec list` after the change is archived.

## 7. Gate

- [x] 7.1 Run `npm run verify` and paste the final lines
- [x] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
