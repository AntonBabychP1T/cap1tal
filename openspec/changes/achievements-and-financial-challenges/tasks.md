# achievements-and-financial-challenges — tasks

## 1. The зведення прогресу — one bounded reading of the history

- [x] 1.1 Create `src/progress/summary.ts` with the `ProgressSummary` shape (per (місяць, currency):
      витрачено, дохід, інвестовано, відкладено, count of транзакції, count «Без категорії», count
      «Без джерела»; per (вид рахунку, currency): sum of розрахункові баланси; total count with
      earliest and latest дата; pending чернетки by місяць) and the pure derivations over it —
      `activeMonths`, `completedMonths`, `cleanMonths`, `longestCleanRun`, `historySpanMonths`,
      `reserve(currency)`, `investedCapital(currency)`, `investmentMonths` (design D10); verify
      `src/progress/summary.test.ts` proves achievements scenarios «An imported місяць is активний»,
      «The current місяць is not завершений», «A місяць with no транзакція is not чистий», «One «Без
      категорії» is enough to spoil a місяць», «Активні місяці need not be consecutive», «A gapped
      year still spans a year», «An empty місяць breaks the run» and «A вид рахунку's total keeps its
      currencies apart».
- [x] 1.2 Add `readProgressSummary()` to a new `src/db/progress-repo.ts` as aggregate SQL — one
      `GROUP BY` per shape, never one row per транзакція — reusing `UNCATEGORISED_CATEGORY_ID` and
      `UNSOURCED_SOURCE_ID` from `src/domain/transaction.ts`; verify
      `src/db/progress-repo.test.ts` proves persistence scenarios «The зведення is bounded, not per
      транзакція», «The зведення holds the same numbers as the місячна картина» and «A вид рахунку's
      total keeps its currencies apart», the middle one by comparing against `monthlyPicture` on the
      same fixture.
- [x] 1.3 Add `nthTransactionDate(n)` to `src/db/progress-repo.ts` — `ORDER BY date, rowid LIMIT 1
      OFFSET n-1`, one row; verify `src/db/progress-repo.test.ts` proves persistence scenario «The
      Nth транзакція is read alone» and achievements scenario «A crossed tier reads exactly one
      транзакція for its дата».
- [x] 1.4 Add the per-категорія half of the зведення: `readProgressSummary()` also returns, per
      (місяць, currency, категорія that carries a ліміт), that категорія's витрачено as
      `categoryBreakdown` computes it — for limited категорії only, so the bound is (місяці ×
      ліміти) — and `summary.ts` gains `limitedCategorySpend(month, currency, categoryId)`; verify
      `src/db/progress-repo.test.ts` proves persistence scenario «Only категорії with a ліміт are
      broken out» and that the numbers match `categoryBreakdown` on the same fixture.
- [x] 1.5 Add `firstTransferOntoKind(kind)` to `src/db/progress-repo.ts` — the earliest переказ onto
      a рахунок of that вид, one row, `undefined` when none; verify `src/db/progress-repo.test.ts`
      proves persistence scenario «The first переказ onto a вид is read alone» and achievements
      scenario «The first переказ onto a вид is read alone».

- [x] 1.6 Add the per-рахунок half of the зведення: `readProgressSummary()` returns one row per
      рахунок — its id, вид, currency and розрахунковий баланс — and the (вид, currency) totals are
      the sums of those, so one `GROUP BY` answers both and a ціль's progress is read without
      loading a транзакція; verify `src/db/progress-repo.test.ts` proves persistence scenario «A
      ціль's progress is read from the зведення, not from the транзакції».

## 2. The three tables

- [x] 2.1 Add `earnedAchievements`, `challengeDecisions` and `spendingNorms` to `src/db/schema.ts`
      (design D3), run `npm run db:generate`, and commit the generated migration untouched; verify
      `src/db/migrations.test.ts` proves persistence scenario «A fresh database from migrations alone
      stores a досягнення» and that a database at the previous migration keeps every row.
- [x] 2.2 Implement the earned-досягнення half of `src/db/progress-repo.ts`: insert-if-absent by key,
      list, and mark-all-unseen-seen in one write; verify `src/db/progress-repo.test.ts` proves
      persistence scenarios «A stored досягнення round-trips», «Storing the same key twice stores one
      row» and «Seen is recorded once and for all unseen at once».
- [x] 2.3 Implement the виклик-decision half: upsert by key, read, remove; verify
      `src/db/progress-repo.test.ts` proves persistence scenarios «A decision round-trips», «A
      decision is replaced under its key» and «Nothing derived is stored beside it».
- [x] 2.4 Implement the норма half: upsert per currency, read one, read all, reject non-positive;
      verify `src/db/progress-repo.test.ts` proves persistence scenarios «A норма round-trips per
      currency», «Confirming again replaces», «A non-positive норма is rejected» and «An absent норма
      is absent, not zero».

## 3. The місячна норма витрат

- [x] 3.1 Create `src/progress/norm.ts` with `proposeNorm(summary, currency)` — the median of
      витрачено over the last six завершені активні місяці of that currency, with the місяці it came
      from, and nothing when fewer than six exist (design D7); verify `src/progress/norm.test.ts`
      proves achievements scenarios «The proposal is the median of six місяці», «Too little history
      offers no proposal» and «A норма is never guessed from category names» (the last by the module
      importing no категорія name and taking none as input).

## 4. The catalogue and the evaluation

- [x] 4.1 Create `src/progress/catalogue.ts` with the templates of the облік and якість groups —
      `ledger.first-transaction`, `ledger.transactions` (100/500/1000/2000), `ledger.active-months`
      (3/6/12/18), `ledger.history-span`, `quality.clean-month`, `quality.clean-months-streak` (3/6)
      — each with its key, Ukrainian назва, condition sentence, свідчення shape, whether the history
      dates it, and a predicate over the зведення (design D5). `quality.month-without-drafts` is
      **not** in v1 (design D12); verify `src/progress/catalogue.test.ts` proves achievements
      scenarios «The count tiers are crossed in order», «Three consecutive чисті місяці earn the
      run», «An empty місяць breaks the run» and «A month of heavy spending earns nothing».
- [x] 4.2 Add the ціль-накопичення templates — `goal.first`, `goal.progress` (25/50/75),
      `goal.reached`, `goal.reached-in-time` — decided from a `{goal, progress: Money | null}` the
      engine is **handed**, where `null` is an approximate or unknown progress and earns nothing;
      the module reads `goal.target` and `goal.deadline` and never a рахунок, a склад, a вартість or
      a курс (design D6); verify `src/progress/catalogue.test.ts` proves achievements scenarios «A
      ціль at 60 % earns two quarters at once», «Each ціль earns its own», «A ціль reached after its
      дата is not reached in time», «No досягнення at five per cent», «A приблизний progress earns
      nothing», «An unknown progress earns nothing and unearns nothing», «A ціль with no дата is
      never reached in time» and «A ліміт earns no ціль досягнення», and that `src/progress/`
      imports nothing from `src/ui/`.
- [x] 4.3 Add the резерв and інвестиційні templates — `reserve.first`, `reserve.norm` (25/50/100),
      `invest.first`, `invest.months` (3/6/12), `invest.norm-months` (1/3/6/12) — each money one
      keyed by currency and existing only where a норма is confirmed, `reserve.first` and
      `invest.first` dated by `firstTransferOntoKind` of task 1.5 and archived рахунки counted;
      verify
      `src/progress/catalogue.test.ts` proves achievements scenarios «Without a confirmed норма the
      milestones do not exist», «A confirmed норма earns what the резерв already covers», «Перше
      відкладення needs no норма», «Contribution months count across currencies without summing
      money», «A gain earns nothing», «Two currencies earn two досягнення» and «Currencies are never
      added together to reach a milestone».
- [x] 4.4 Create `src/progress/achievements.ts` with `evaluate({summary, goals, norms, earned, today})
      → newlyEarned[]`, pure, add-only, and the дата досягнення rule of design D4 — the history's
      date where the template names one, today where the condition is a balance; verify
      `src/progress/achievements.test.ts` proves achievements scenarios «Evaluating twice earns
      nothing twice», «Deleting history does not unearn», «A retroactive count is dated in the
      history», «A retroactive месяць count is dated at the month's end», «A balance condition is
      dated the day it was recorded», «An existing history earns everything it proves at once» (the
      owner-shaped fixture of task 4.5) and «Editing an old транзакція earns nothing new by itself».
- [x] 4.5 Add `src/progress/fixtures.ts` — a generated history shaped like the owner's real Saldo
      export and **carrying nothing personal**: 2459 транзакції from 2024-10 to 2026-09, 23 активні
      місяці, a run of чисті місяці, savings рахунки and UAH/USD/EUR інвестиційні рахунки whose
      розрахунковий баланс exceeds 100000 UAH on the UAH ones; verify
      `src/progress/achievements.test.ts` uses it for the existing-user scenario, that no name, опис
      or сума from a real export appears in it, and that nothing under `src/app/` imports it, so
      Metro never bundles it (the rule `src/db/test-db.ts` already lives by).

## 5. The виклики

- [x] 5.1 Create `src/progress/challenges.ts` with the five templates of the challenges spec, their
      offer conditions, progress, finish criteria and the fixed priority order. Its only inputs are
      the зведення, the цілі-накопичення with their already-resolved progress, the ліміти and the
      owner's stored decisions — «Закрий місяць» counts **down** from what the зведення holds now
      and carries no denominator, «Втримай ліміт» reads the limited-категорія rows of task 1.4, and
      «Фінансова подушка» picks its currency by the rule of the challenges spec; verify
      `src/progress/challenges.test.ts` proves challenges scenarios «A proposed виклик carries all
      four», «Закрий місяць counts down from what is there now», «Закрий місяць is offered ahead of
      the rest», «The подушка asks for the норма first», «The ліміт виклик counts завершені місяці
      only» and «The інвестиційна звичка reads the last four завершені місяці».
- [x] 5.2 Add the selection — filter by offer condition, drop dismissed, cap at three, deterministic
      order — and the derived finished state; verify `src/progress/challenges.test.ts` proves
      challenges scenarios «Four eligible виклики yield three», «The same data yields the same
      виклики», «A dismissed виклик stops being proposed», «A dismissal binds only its own
      parameters», «The criterion decides, not the acceptance», «Finishing earns only the underlying
      fact» and «A fresh install proposes nothing».

## 6. When the evaluation runs

- [x] 6.1 Add `src/progress/run.ts` — read зведення, цілі (resolving each progress through
      `goalProgress`, so an approximate one arrives as `null`), ліміти and норми, evaluate, store
      what is new, and return what was newly earned — and call it at the ten moments of the
      achievements spec: app start in `src/app/_layout.tsx`, and after a транзакція is
      stored/edited/deleted, a monobank sync commits, a чернетка is settled, a Saldo імпорт commits,
      a відновлення lands, a ціль-накопичення changes, a рахунок is created/edited/archived, and
      a норма is confirmed. Setting or clearing a **ліміт** is deliberately not among them — a
      ліміт is a ціль витрат and no досягнення is defined about one (design D10); verify
      `src/progress/run.test.ts` proves achievements scenarios «Recording a транзакція evaluates», «A
      Saldo імпорт earns what it brought», «A відновлення earns what the бекап holds» and «A closed
      app with working import loses nothing».
- [x] 6.2 Prove the negative: verify a test in `src/progress/run.test.ts` and one in
      `src/ui/progress-screen.test.ts` prove achievements scenario «Opening Головний repeatedly
      evaluates once» and main-screen scenario «Opening Головний earns nothing» — no view model
      under `src/ui/` imports `run`, and each takes stored rows as input, so no draw path can earn
      anything. Storing a транзакція from a screen *does* evaluate: that is the recording, not the
      drawing, and `src/ui/screens.test.ts` reads the two screen files by path to prove `run` is
      called on the save path and nowhere else.

## 7. The screens

- [x] 7.1 Create `src/ui/progress-screen.ts` with `progressViewModel(...)` — the three sections, their
      Ukrainian plurals, the empty sentences, and the rule that a досягнення with no measurable
      progress is not listed «У процесі»; verify `src/ui/progress-screen.test.ts` proves
      progress-screen scenarios «The three sections are shown in order», «Отримані are newest first»,
      «An empty section says so», «A досягнення with no measurable progress is not listed as in
      progress», «No score exists to show», «Two currencies read as two amounts» and «A fresh install
      shows one sentence».
- [x] 7.2 Add `homeProgressSection(...)` to `src/ui/progress-screen.ts` — nothing when there is
      nothing, one named досягнення when exactly one is unseen, one counting line when two or more,
      plus the accepted виклик closest to being finished (design D11); verify
      `src/ui/progress-screen.test.ts` proves progress-screen scenarios «Nothing waiting, no
      section», «One accepted виклик is shown», «Twelve retroactive досягнення are one line», «One
      new досягнення is named» and «Seen is seen».
- [x] 7.3 Add the detail view models — `achievementDetail(...)` and `challengeDetail(...)`, with
      «досягнуто» versus «помічено» and the свідчення beside the recomputed current number; verify
      `src/ui/progress-screen.test.ts` proves progress-screen scenarios «The detail explains why it
      was earned», «A balance-dated досягнення says «помічено»» and «A виклик's detail names its
      finish», and achievements scenarios «The свідчення keeps the number of its moment» and «A money
      свідчення carries its currency».
- [x] 7.4 Create `src/app/progress.tsx`, `src/app/achievement/[key].tsx` and
      `src/app/challenge/[key].tsx` — a досягнення key like `reserve.norm:100:UAH` reaches the route
      through `encodeURIComponent`, and the screen decodes it — register all three in
      `src/app/_layout.tsx` beside `transaction/[id]`, and add the entries from Головний
      (`src/app/(tabs)/index.tsx`) and «Звіти» (`src/app/(tabs)/reports.tsx`); verify
      `npm run typecheck` and `npm run lint` pass, the five tabs are unchanged (progress-screen
      scenario «The tabs are unchanged») and reports-screen scenarios «Прогрес is reachable from
      Звіти» and «The entry is there with nothing earned» have a screen to open.
- [x] 7.6 Add `monthFromRoute` to `src/ui/transaction-search.ts` — the місяць a `?month=` in the
      route asks for, decided by `isMonth` rather than by a shape — and open «Транзакції» on it, so
      «Закрий <місяць>»'s action lands on the місяць it is about; verify
      `src/ui/transaction-search.test.ts` proves transaction-search scenarios «A виклик opens the
      місяць it is about» and «Something that is not a місяць narrows nothing».
- [x] 7.5 Add the норма confirmation step to the «Фінансова подушка» виклик's flow — the proposal,
      the six місяці it came from, and a field the owner may overwrite, refusing a non-positive сума
      in Ukrainian per app-shell — as a step inside `src/app/challenge/[key].tsx`; verify
      `src/ui/progress-screen.test.ts` proves challenges scenario «The подушка asks for the норма
      first»; verify `src/progress/run.test.ts` proves achievements scenario «Raising the норма
      keeps what was earned» — the earned row survives untouched and the progress beside it
      re-derives to 40 % — since it takes an evaluation before and after the change, which the
      view model has no way to perform.

## 8. The бекап and the boundaries

- [x] 8.1 Add the three tables to the бекап: name them in `BACKUP_TABLES`, add their shapes and
      their parse to `src/backup/format.ts`, and carry them through `src/db/backup-repo.ts`'s
      snapshot and its atomic replacement. `BACKUP_FORMAT_VERSION` stays 2 — an older build reads an
      unknown list as absent, so bumping it would refuse new бекапи for nothing; what moves is
      `BACKUP_SCHEMA_VERSION`, which the tripwire in `format.test.ts` holds equal to the number of
      entries in `drizzle/meta/_journal.json`. Verify `src/backup/format.test.ts` and
      `src/db/backup-repo.test.ts` prove backup-file scenarios «The three survive the round trip», «A
      відновлення replaces the earned set» and «A restored свідчення is not money», and persistence
      scenarios «The snapshot carries all three» and «Replacing replaces all three at once».
- [x] 8.2 Prove the privacy boundaries: verify a test in `src/analysis/` proves achievements scenario
      «A пакет для аналізу holds no досягнення» and ai-analysis-package scenario «The прогрес state
      stays on the phone», and a test in `src/progress/run.test.ts` proves
      progress-screen scenario «Nothing is pushed to the phone» (the module imports no notification
      port).
- [x] 8.3 Prove the money boundary: verify a test in `src/progress/run.test.ts` proves achievements
      scenario «An earned досягнення moves no money» by comparing every розрахунковий баланс and the
      місячна картина before and after an evaluation that earns twelve досягнення.

## 9. Documentation

- [x] 9.1 Apply design D13 to `docs/glossary.md`: the new «Прогрес» section with «Досягнення»,
      «Свідчення», «Виклик», «Активний місяць», «Завершений місяць», «Чистий місяць», «Місячна норма
      витрат» and «Резерв», plus the three rows for «Distinctions the owner drew», and extend the
      existing «Backup (бекап)» entry, which enumerates what a бекап holds; verify every term this
      change's specs use appears there verbatim.
- [ ] 9.2 Apply design D13 to `docs/product-vision.md`: the new §18 and the sentence appended to §12;
      add the roadmap row to `docs/tech-task.md` §5 and note the screen in `docs/app-overview.md`
      with a screenshot from the smoke run.

## 10. The gate

- [x] 10.1 Run `npm run verify` and paste the final lines
- [x] 10.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
