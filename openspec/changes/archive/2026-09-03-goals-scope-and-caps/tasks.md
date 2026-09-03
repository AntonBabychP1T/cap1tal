# goals-scope-and-caps — tasks

Every amount in every test is integer minor units beside its currency code. No task adds a
dependency, a native module, an emulator run or a network call to `npm run verify`.

Section 3 is the sharp one: it rebuilds a table while foreign keys are on. Read design D4 before
touching `drizzle/`, and never edit a committed migration.

**Precondition for section 3.** Generate these migrations only in a tree that already carries every
other in-flight change's migrations — `monobank-auto-sync`'s and `bug-report-here`'s are untracked
`0013`/`0014` at the time of writing. In a worktree lane untracked files do not travel, so
`db:generate` there would emit the same indices those lanes will emit and the two would collide by
filename and by journal index when the lanes meet. Read every number from
`drizzle/meta/_journal.json` **after** generating; no number written in this file or in design.md is
a number to copy.

## 1. Vocabulary and the documents

- [x] 1.1 Rewrite the «Ціль» entry in the Categories section of `docs/glossary.md` and add
      «Ціль-накопичення», «Ціль витрат», «Склад цілі», «Внесок рахунку», «Прогрес цілі» and
      «Приблизний прогрес» beside it: a ціль is of one of two kinds; a ціль-накопичення holds a
      назва, a target сума in its own currency, an optional дата and a склад of one or more
      рахунки; its прогрес is the sum of the внески of that склад, приблизний when any внесок was
      converted, and absent when a rate it needs is unknown; a ціль витрат is the ліміт of one
      категорія read as a ціль. Extend the «Ліміт» entry with the sentence that it **is** that
      категорія's ціль витрат — one сума under two names. Add to the "Distinctions the owner drew"
      table: ціль витрат ≠ ціль-накопичення (opposite directions, so opposite words), and прогрес
      цілі ≠ розрахунковий баланс (a progress may be приблизний; a баланс never is). Verify by
      reading the deltas of `specs/goals` and `specs/limits` against the glossary — no term used
      there is left undefined and no synonym is introduced. If `investments-value` has not yet
      landed, add «Поточна вартість» in that change's own wording too — `specs/goals` and
      `specs/goal-screen` use it as a domain noun and no term they use may be undefined.
- [x] 1.2 Update `docs/product-vision.md`: in §4 «Categories, limits, goals» say that a ціль is of
      two kinds and that a goal of the accumulating kind counts the money of one or more accounts;
      in §11 «Reports and goals» replace «Goals: set aside N by a date, with progress» with the two
      kinds and the note that a progress mixing currencies is explicitly approximate. Remove every
      claim that a ціль hangs on exactly one рахунок. Verify by grepping the file for «one account»
      and «одного рахунку» around the goal wording — nothing is left saying it.
- [x] 1.3 Rewrite FR-R3 in `docs/tech-task.md` §FR-R to the new model — two kinds; a
      ціль-накопичення over a stored set of рахунки with its own currency, its progress read from
      балансі and поточні вартості, converted into UAH only and marked приблизний; a ціль витрат
      that is the категорія's ліміт and holds no second сума — and add a line to FR-L1 pointing at
      it. Verify FR-R3 and the `goals` delta say the same thing in the same words.
- [ ] 1.4 Rewrite the `## Purpose` block of `openspec/specs/goals/spec.md` — it still says a ціль
      «names a target сума and a дата on one рахунок, and its progress is that рахунок's
      розрахунковий баланс», which the requirements below it will contradict — and extend the one
      in `openspec/specs/limits/spec.md` to say that a ліміт is also the ціль витрат of its
      категорія. A delta cannot change a Purpose, so this is a hand edit of the main specs, made
      when the change is archived. Verify by reading each Purpose against the requirements under it.
      While archiving, also check that the `ai-analysis-package` delta's RENAMED block is applied
      **before** its MODIFIED one — the MODIFIED targets the post-rename heading, and in the other
      order the merge would not find that header in the truth spec.
- [ ] 1.5 **At archive time**, re-base this change's `backup-file` delta onto the truth spec as it
      then stands. All three of its MODIFIED requirements — «A бекап is one versioned file holding
      the owner's whole state», «A бекап names the versions it was written under…» and «A бекап that
      contradicts itself is refused whole» — are also MODIFIED by `fiscal-receipts`, which is
      further along and will very likely archive first. This delta was written against the truth
      spec **before** чеки existed, so applying it unchanged after `fiscal-receipts` lands would
      silently delete shipped requirements: the чек and позиція clauses of the contents list, «and
      чеки» in the identifier sentence, the four чек/позиція contradictions of the self-consistency
      list, and «A бекап written before чеки existed restores without them». Before archiving, read
      `openspec/specs/backup-file/spec.md`, re-insert verbatim whatever чек wording it then carries
      into these three blocks, and verify by diffing the merged spec against it that the only lines
      that changed are this change's own ціль lines. If `goals-scope-and-caps` archives **first**,
      the same duty falls to `fiscal-receipts` and this task is recorded as not needed.

## 2. Domain

- [x] 2.1 Reshape `Goal` in `src/domain/goals.ts` into `AccumulationGoal { id, name, target,
      deadline?, accountIds }` (design D3, D6) and adjust `isReached` to the ціль's own currency.
      Tests in `src/domain/goals.test.ts`: "Scenario: Progress equal to the target reaches the
      ціль" and "Scenario: Progress below the target is not reached".
- [x] 2.2 Make `isOverdue` accept a ціль without a дата and never call it overdue (design D3).
      Tests in `src/domain/goals.test.ts`: "Scenario: A past дата without the target is overdue",
      "Scenario: A reached ціль is never overdue" and "Scenario: A ціль without a дата is never
      overdue".
- [x] 2.3 Add `contribution(account, transactions, currentValue?)` to `src/domain/goals.ts`: the
      рахунок's розрахунковий баланс, or the поточна вартість when the рахунок is of вид
      `investment` and one is given (design D7). Tests in `src/domain/goals.test.ts`: "Scenario: A
      переказ into a рахунок of the склад moves the progress", "Scenario: An інвестиційний рахунок
      contributes its поточна вартість", "Scenario: An інвестиційний рахунок without a вартість
      contributes its баланс", "Scenario: An інвестиційний рахунок worth nothing contributes
      nothing" — the вартість is tested for **presence**, not truthiness (design D7) — and
      "Scenario: A negative баланс reduces the progress". Also "Scenario: Money moved between two
      рахунки of one склад does not move the progress" — the glossary's «переказ is not a витрата»
      applied to the склад, and the one thing an implementation summing per-рахунок deltas instead
      of балансі would get wrong.
- [x] 2.4 Add the ціль-накопичення currency rule as a pure predicate — UAH, or the single currency
      every рахунок of the склад shares (design D5) — and the «склад is non-empty, each рахунок
      once» rule, so one sentence serves the form, the repo and the бекап. Tests in
      `src/domain/goals.test.ts`: "Scenario: A mixed склад in UAH is accepted", "Scenario: A
      single-currency склад may keep its own currency", "Scenario: A mixed склад in another
      currency is rejected", "Scenario: A currency neither UAH nor the склад's is rejected",
      "Scenario: An empty склад is rejected", "Scenario: Choosing a рахунок twice counts it
      once", "Scenario: A рахунок-борг may stand in a склад" and "Scenario: Adding a рахунок of
      another currency to a non-UAH ціль is refused".
- [x] 2.5 Add the ціль витрат's state to `src/domain/goals.ts` as a reading of `domain/limits.ts` —
      `within` / `exceeded` / `completedWithin` from `overLimit` and `overLimitBy`, over the month's
      spent the `categoryBreakdown` already holds, with **no new arithmetic** (design D1). Tests in
      `src/domain/goals.test.ts`: "Scenario: Below the ceiling is within", "Scenario: Exactly at
      the ceiling is within", "Scenario: Above the ceiling is exceeded", "Scenario: A month that
      ended within the ceiling is settled" and "Scenario: A new month starts the ціль over". The
      state is a **total** function of (spent, ceiling, has the month ended): over the ceiling is
      `exceeded` whether the month ended or not, an ended month at or below it is `completedWithin`,
      and a running one is `within`. A month that has not begun carries no state at all — the
      spec's "Scenario: A month that has not started carries no verdict" — and that is the caller's
      duty, not a fourth case: nothing asks this function about a month that has not happened.
- [x] 2.6 Prove the ціль витрат uses the ліміт's own arithmetic for повернення and for another
      currency, rather than a second count. Tests in `src/domain/goals.test.ts`: "Scenario: A
      повернення pulls the ціль back exactly as it pulls the ліміт", "Scenario: Another currency's
      spending never counts" and "Scenario: Spending shows against the ceiling".

- [x] 2.7 Prove in `src/domain/limits.test.ts` that a month's ліміт verdict is settled by that
      month's own транзакції — the `limits` delta's new requirement, which is the ліміт's half of
      what makes a ціль витрат's finished month unambiguous. Scenarios: "Scenario: A finished month
      keeps its verdict" and "Scenario: A retroactive транзакція settles the month anew". No new
      arithmetic: this proves the property `overLimitCategories` already has, so a later change
      cannot take it away silently.

## 3. Schema, migrations and repository

- [x] 3.1 Add `goalAccounts` to `src/db/schema.ts` with a composite primary key and, for this first
      migration only, `goal_id` as a plain `TEXT NOT NULL` with **no** reference to `goals`
      (design D4); drop `accountId` from `goals` and make `deadline` nullable, with the `deadline
      IS NULL OR GLOB …` check. Run `npm run db:generate`, read the migration it emits — take its number from
      the journal, do not assume `0014`, since other changes are in flight with migrations of their
      own — and confirm the `CREATE TABLE goal_accounts` precedes the `goals` rebuild — if it does not, move
      nothing by hand and stop, this is the case CLAUDE.md rule 8 means.
- [x] 3.2 Hand-add the one data statement to that uncommitted migration, between the
      `CREATE TABLE goal_accounts` and the `goals` rebuild, with the comment design D4 spells out:
      `INSERT INTO goal_accounts (goal_id, account_id) SELECT id, account_id FROM goals;`. Test in
      `src/db/migrations.test.ts`: "Scenario: A stored ціль keeps every field and gains its склад",
      "Scenario: The migrated ціль shows the progress it showed before" and "Scenario: Two цілі on
      one рахунок both keep it" — seeded with `openTestDbMigratedTo(n)`, where **n is the journal
      length immediately before this change's first migration**, read from `_journal.json` and not
      copied from here (15 in the tree this was implemented in). Naming the seed by index rather
      than by tag is what keeps the test proving the hand-added `INSERT` is needed even after the
      in-flight lanes shift the numbers. Each case must fail if the statement is removed.
- [x] 3.3 Add the `goal_id → goals(id) ON DELETE CASCADE` reference in `src/db/schema.ts`, run
      `npm run db:generate` again for the second migration — a generated rebuild of `goal_accounts`
      alone —
      and confirm no committed file changed (`git status` on `drizzle/`). Test in
      `src/db/migrations.test.ts`: "Scenario: A fresh database from migrations alone stores цілі"
      and "Scenario: Nothing else in the database moves".
- [x] 3.4 Rewrite `src/db/goals-repo.ts` to save, read, replace and remove a ціль together with its
      склад in one transaction, refusing an unknown рахунок id, an empty склад, a склад naming one
      рахунок twice and a currency neither UAH nor the склад's shared one (design D2, D5). Tests in `src/db/goals-repo.test.ts`:
      "Scenario: A stored ціль round-trips", "Scenario: A ціль without a дата round-trips without
      one", "Scenario: A replaced ціль keeps its id and new values", "Scenario: A removed ціль is
      gone and nothing else is", "Scenario: An unknown рахунок id is rejected", "Scenario: An empty
      склад is rejected", "Scenario: The same рахунок twice is rejected" and "Scenario: A
      currency mismatching the рахунок is rejected".
- [x] 3.5 Prove the currency rule admits what it should. Tests in `src/db/goals-repo.test.ts`:
      "Scenario: A UAH ціль over рахунки of several currencies is stored" and "Scenario: A ціль in
      its склад's one currency is stored".
- [x] 3.6 Add `goal_accounts` to the snapshot read and the snapshot replace of `src/db/repos.ts` /
      `src/db/backup-repo.ts` so the whole stored state still round-trips as one unit. Follow that
      file's stated convention rather than leaning on the cascade: it "deletes in reference order
      and says so — a restore that leaned on a cascade would be one `PRAGMA foreign_keys = OFF`
      away from leaving orphans behind", so `goal_accounts` is deleted **explicitly, immediately
      before `goals`**, and inserted after it. Tests in `src/db/backup-repo.test.ts`: a ціль with a
      three-рахунок склад survives snapshot → replace → snapshot unchanged, and replacing leaves no
      orphan склад row behind — asserted as the outcome, which holds whether or not a cascade fires.

## 4. Backup

- [x] 4.1 Change the ціль shape in `src/backup/format.ts` to carry `accountIds` and an optional
      `deadline`, bump `BACKUP_FORMAT_VERSION` to 2 and `BACKUP_SCHEMA_VERSION` to the journal's
      new length (two more than it was; read it, do not copy a number), and add
      `goal_accounts` to `BACKUP_TABLES` (design D10). Tests in `src/backup/format.test.ts`: the
      schema-version tripwire against `drizzle/meta/_journal.json` passes, and `BACKUP_TABLES`
      still accounts for every table the schema has.
- [x] 4.2 Make `goalAt` read both shapes — `accountIds` as the склад, a version-1 `accountId` as a
      склад of one (design D10). Tests in `src/backup/format.test.ts`: "Scenario: A ціль of the
      previous format keeps its one рахунок" and "Scenario: A ціль without a дата comes back
      without one".
- [x] 4.3 Replace the ціль clause of the self-consistency check with D5's rule plus «every рахунок
      of a склад is in the бекап», «a склад is non-empty» and «a склад names no рахунок twice».
      Tests in `src/backup/format.test.ts`: "Scenario: A ціль pointing at a рахунок outside the
      бекап stops the restore", "Scenario: A ціль with an empty склад stops the restore",
      "Scenario: A ціль naming one рахунок twice stops the restore", "Scenario: A ціль in another
      currency than its рахунок stops the restore" and "Scenario: A UAH ціль over several
      currencies does not stop the restore".
- [x] 4.4 Prove the whole round trip through `src/backup/backup.test.ts`: "Scenario: A ціль comes
      back with its whole склад" and "Scenario: A ціль витрат comes back as its ліміт" — the second
      showing that nothing new was written for it, since it is the ліміт `category_limits` already
      carries.

## 5. Screen logic

- [x] 5.1 Add `src/ui/goal-progress.ts`: the внески plus the ціль's currency plus the stored rates
      → `{ kind: 'exact' | 'approximate', total, parts }` or `{ kind: 'unknown', missingCurrencies,
      parts }`, converting through `approximateUah` verbatim, each внесок rounded before the sum
      (design D6). Tests in `src/ui/goal-progress.test.ts`: "Scenario: A single-currency progress
      is exact", "Scenario: A foreign внесок makes the progress approximate", "Scenario: The USD
      рахунок's own баланс is untouched", "Scenario: An unknown rate leaves the ціль without a
      progress", "Scenario: The known внески are still readable", "Scenario: A missing rate
      never becomes a zero", "Scenario: A foreign інвестиційний рахунок converts its вартість, not
      its баланс" — the вартість is in the рахунок's own currency, so it is the вартість that goes
      through `approximateUah`, and this is the one intersection where a fallback to the баланс
      would go unnoticed — "Scenario: Two рахунки of one foreign currency are each rounded" —
      per-внесок rounding, so the listed внески add up to the total (design D6) — and "Scenario: A
      progress too large to hold exactly is absent, and names no currency".
- [x] 5.2 Add the two progress read-outs to `src/ui/goal-progress.ts` — the accumulation one
      (progress / target, floor percentage, «залишилось накопичити», «досягнуто») and the spending
      one (spent / ceiling, «використано N %», «можна витратити ще», «перевищено на X» and no
      percentage once over), as two types with no field in common (design D8). Tests in
      `src/ui/goal-progress.test.ts`: "Scenario: A ціль under way reads its three numbers",
      "Scenario: A percentage never rounds up to a ціль that is not reached", "Scenario: A reached
      ціль says so instead of a remainder", "Scenario: A negative progress reads zero per cent",
      "Scenario: Within the ceiling reads used and remaining", "Scenario: Exceeded reads the excess
      and no percentage", "Scenario: An exceeded ціль is never called reached" and "Scenario: A
      negative spent reads zero per cent".
- [x] 5.3 Rework `src/ui/goals-section.ts` into the kind-first form: the kind chooser, the
      накопичення draft (назва, сума, currency, optional дата, склад as a set) and the витрати
      draft (категорія among those with no ліміт, сума, currency), each refused in Ukrainian
      (design D1, D5). Tests in `src/ui/goals-section.test.ts`: "Scenario: The kind is asked before
      anything else", "Scenario: A created ціль appears in the list", "Scenario: A
      ціль-накопичення without a дата is accepted", "Scenario: A created ціль витрат shows no
      накопичення fields", "Scenario: A mixed-currency склад outside UAH is refused in the owner's
      language", "Scenario: A ціль-накопичення with no рахунок is refused" and "Scenario: A
      категорія that already carries a ліміт is not offered". The section's row contents for both
      kinds are part of this task — назва, target, дата and склад for a ціль-накопичення;
      категорія, ceiling and month for a ціль витрат, one whose категорія is archived visibly set
      apart — "Scenario: A ціль витрат of an archived категорія is listed, set apart".
- [x] 5.4 Add the склад picker to `src/ui/goals-section.ts`: the unarchived рахунки plus whatever
      the ціль already holds, the вид shortcuts that tick the рахунки of that вид as they stand,
      and the count of ticked рахунки (design D2, D11). Tests in `src/ui/goals-section.test.ts`:
      "Scenario: A shortcut ticks the рахунки of its вид", "Scenario: A рахунок created later does
      not join a ціль", "Scenario: An archived рахунок is not offered for a new ціль" and
      "Scenario: Archiving a рахунок leaves the ціль as it was".
- [x] 5.5 Handle editing in `src/ui/goals-section.ts`: the kind is not offered, changing the
      currency clears the typed target, adding and removing рахунки, clearing and adding a дата,
      and the deletion sentence for each kind (which says what a ціль витрат's deletion clears).
      Tests in `src/ui/goals-section.test.ts`: "Scenario: The kind of an existing ціль is not
      offered for change", "Scenario: Re-linking to another currency asks the target anew",
      "Scenario: A рахунок added to the склад starts counting", "Scenario: A рахунок removed from
      the склад stops counting and keeps its money", "Scenario: A дата can be removed and added"
      and "Scenario: Deleting a ціль витрат clears its ліміт".
- [x] 5.6 Rework the ціль rows of `src/ui/reports-screen.ts` into two named groups with their own
      row types, each carrying where it navigates (design D9, D12). `reportsViewModel` gains the
      inputs a ціль витрат needs and a склад-wide progress needs, none of which it takes today:
      the **ліміти**, the **категорії** (for a ціль витрат's назва and its archived mark), the
      **monobank rates** (for an approximate progress) and the **поточні вартості** (empty until
      `investments-value` lands). The current month's `categoryBreakdown` is computed from the
      транзакції it already receives — no new number is invented, and `reports`, `monthly-picture`
      and `limits` are read, not changed. The two group titles go in `src/ui/labels.ts` beside the
      other section wording. Tests in
      `src/ui/reports-screen.test.ts`: "Scenario: A ціль shows its progress", "Scenario: A ціль
      витрат shows what is left of its month", "Scenario: An exceeded ціль витрат shows the excess
      and no percentage", "Scenario: The two kinds are not mixed together", "Scenario: A reached
      ціль is marked", "Scenario: An overdue ціль is marked", "Scenario: An approximate progress is
      marked", "Scenario: A progress that cannot be counted says so", "Scenario: A ціль витрат of an
      archived категорія is set apart, not hidden" and "Scenario: No цілі is said plainly".
- [x] 5.7 Add `src/ui/goal-screen.ts`: the view model of one ціль-накопичення — its progress
      read-out and one row per рахунок of the склад with its внесок, the native сума beside the «≈»
      one for a foreign рахунок, the archive mark, the «курс невідомий» mark, and no total when the
      progress is unknown. Its input carries an інвестиційний рахунок's поточна вартість **with the
      дата that вартість describes** — the дата is display-only and never reaches `contribution`
      (design D7). Tests in `src/ui/goal-screen.test.ts`: "Scenario: The ціль's own numbers
      are shown", "Scenario: An approximate progress is marked on the screen", "Scenario: A deleted
      ціль says so", "Scenario: The listed внески account for the progress", "Scenario: An
      інвестиційний рахунок shows the вартість it contributed" — with the дата that вартість
      describes — "Scenario: A negative внесок is
      shown as it is", "Scenario: A USD рахунок reads in both currencies", "Scenario: A рахунок in
      the ціль's own currency gets no second line", "Scenario: The missing currency is named and
      the total withheld", "Scenario: The readable part is not passed off as the whole" and
      "Scenario: An archived рахунок is listed, marked and counted".

- [x] 5.8 Prove the two-way identity of a ліміт and its ціль витрат as a pure test, not on the
      emulator — it is the central claim of this change (design D1). The ліміт rows and the typed
      сума live in `src/ui/limits-section.ts`, not in `src/ui/settings-sections.ts`, which holds
      only the tab's section links. Tests in `src/ui/limits-section.test.ts` and
      `src/ui/goals-section.test.ts`: "Scenario: A ліміт set
      here is a ціль витрат there", "Scenario: A cleared ліміт leaves the category listed" — no
      ціль витрат remaining after it — "Scenario: One сума, whichever name it is set under",
      "Scenario: Changing under one name changes under the other", "Scenario: Clearing removes both
      readings" and "Scenario: A категорія cannot hold two ceilings".

## 6. The AI-аналіз and the settled month

- [x] 6.1 Rewrite `src/analysis/goals.ts` for the new model (design D13): it takes
      цілі-накопичення only, computes the progress as the exact sum of the внески **when every
      рахунок of the склад is in the ціль's currency**, and carries no progress, remaining, verdict
      or pace otherwise; `deadline`, `monthsLeft` and `perMonth` become absent for a ціль without a
      дата. It reads no rate and imports nothing from `src/ui`; the поточні вартості reach it as an
      argument from the same repo the screens read, so the пакет's progress is the identical number
      «Звіти» shows (design D13) — today none exists and every caller passes none. Tests in
      `src/analysis/goals.test.ts`: "Scenario: A ціль's pace", "Scenario: A month started still
      counts", "Scenario: An overdue ціль has no pace", "Scenario: A ціль over several UAH рахунки
      carries their sum", "Scenario: A ціль without a дата has no pace and is not overdue",
      "Scenario: A ціль whose progress would need a rate carries no progress" and "Scenario: The
      цілі of the пакет are in one order whatever order they were read in". The last is not
      optional polish: today's comparator sorts by `deadline` first, and with an optional дата every
      comparison against `undefined` is false, which makes the sort non-transitive and breaks the
      shipped requirement that the same state builds a пакет equal in every value whatever order the
      rows were read in. Order the цілі with a дата first by дата then by назва, and the дата-less
      ones after by назва.
- [x] 6.2 Keep цілі витрат out of the пакет's цілі — the ліміти it already carries are that same
      ceiling, with the сума and the months it was exceeded — and keep the пакет free of any
      approximate or mixed-currency сума. Tests in `src/analysis/goals.test.ts` and
      `src/analysis/package.test.ts`: "Scenario: A ціль витрат is in the пакет only as its ліміт"
      and "Scenario: No сума of the пакет is approximate".
- [x] 6.3 Rewrite the ціль lines of the файл для аналізу in `src/analysis/document.ts`, which today
      prints `до ${goal.deadline}` unconditionally and always prints a progress: a ціль without a
      дата says neither «до …» nor «прострочена», and a ціль carried without a progress says that
      its progress is not in the пакет instead of showing «X з Y». Regenerate
      `src/analysis/document.golden.md` and extend `src/analysis/document.fixture.ts` with a ціль
      over three рахунки, one without a дата and one whose склад holds another currency. Tests in
      `src/analysis/document.test.ts`: the golden file matches, and the existing secret-leak case
      (which already asserts no рахунок назва and no goal id reaches the file) still passes with a
      склад of several рахунки.
- [x] 6.4 State the settled verdict of a finished month on the категорія's month screen — where a
      ціль витрат leads — in `src/ui/category-transactions.ts` and its screen. Tests in
      `src/ui/category-transactions.test.ts`: "Scenario: A month that ended within the ліміт says
      so", "Scenario: The current month gets no settled verdict" and "Scenario: A month that ended
      over the ліміт states its overrun, not a verdict of keeping it".

## 7. Screens

- [x] 7.1 Rebuild the «Цілі» section of `src/app/manage/goals.tsx` on the reworked
      `goals-section.ts`: the kind chooser, the two forms, the склад picker with its shortcuts,
      writing through `goalsRepo` or `limitsRepo`, with the back gesture over an open form
      unchanged. Verify the section by hand on the emulator in section 8; the pure half is proven
      by 5.3–5.5.
- [x] 7.2 Say in the «Ліміти» section of `src/app/manage/limits.tsx` that a ліміт is also the
      категорія's ціль витрат, so the owner meets one сума under two names knowingly (design D1).
      The behaviour behind the sentence is proven by 5.8; this task is the wording on the screen,
      checked on the emulator in section 8.
- [x] 7.3 Draw the two ціль groups on `src/app/(tabs)/reports.tsx` from 5.6's row types, each row
      navigating: a ціль-накопичення to `goal/[id]`, a ціль витрат to
      `category/[month]/[categoryId]` for the month it shows. The screen loads what 5.6 now asks
      for: `limitsRepo.list()`, `categoriesRepo.list()` and `ratesRepo` beside the рахунки,
      транзакції and цілі it already reads, on the same focus-and-requery pattern the tab uses.
- [x] 7.4 Add `src/app/goal/[id].tsx` — the breakdown screen over 5.7's view model, pushed like
      `account/[id].tsx` and with the same back behaviour, recording nothing.
- [x] 7.5 Add the new screen's route to the app-overview map and take the two screenshots
      (`docs/screens/`) the section for «Ліміти і Цілі» needs, replacing the goals one; update
      `docs/app-overview.md` §4.3 and the «ціль» row of its term table to the new model.

## 8. Emulator smoke

- [x] 8.1 Run the `smoke-runner` subagent over these scenarios and fix what it finds: create a
      ціль-накопичення over one рахунок; create one over three рахунки; create one whose склад
      mixes UAH and USD and read its «≈» progress; create a ціль витрат and see the ліміт appear in
      «Ліміти»; edit both kinds; open the breakdown of a mixed-currency ціль and check every внесок
      accounts for the total. Record the verdict in the change before archiving.

**Smoke verdict, 2026-09-03** — Pixel_10_Pro / emulator-5554, API 37, rebuilt from the main tree
after the section-6.4 screen fix. All seven scenarios of 8.1 **pass**, with the numbers checked
against the spec and not merely rendered: «Mashyna» reads «≈ 283 380,00 UAH / 700 000,00 UAH»,
«≈ 40 % · 2 рахунки», its breakdown lists «Rezerv 150 000,00 UAH» (one line) and «USD acc
3 000,00 USD» with «≈ 133 380,00 UAH» under it, and 150 000 + 133 380 = 283 380; «Кафе» reads
«250,00 UAH / 100,00 UAH · ПЕРЕВИЩЕНО НА 150,00 UAH» with **no percentage anywhere on the row**;
the ticked counts read «Вибрано 1 рахунок / 3 рахунки / 2 рахунки»; both refusals appear in
Ukrainian. One defect found and fixed: the Налаштування list row for «Цілі» still read «Відкласти
суму до дати» (`src/ui/settings-sections.ts`), the one sentence on the path to the feature still
describing the old model — now «Накопичити суму або не перевищити витрати», with a test.

Two things the smoke could **not** reach, neither a defect of this change: a missing monobank rate
(the device holds a fresh USD rate, so the «progress cannot be counted» branch is unreachable from
the UI — it is proven in `goal-progress.test.ts` and `goal-screen.test.ts`), and an інвестиційний
рахунок's поточна вартість (that is `investments-value`, not yet landed; every інвестиційний
рахунок contributed its розрахунковий баланс, which is what this build computes).

Three observations outside this change's spec, for BACKLOG.md rather than a fix: changing the
ціль's currency silently wipes an already-typed target (deliberate per the spec — «changing a
ціль's currency SHALL ask the target anew» — but it costs the owner the digits they typed); the
ціль витрат form offers «Без категорії» and «Коригування» as targets for a ceiling, consistently
with «Ліміти» but not usefully; and the категорія chip of an existing ціль витрат looks tappable
while being correctly fixed.

## 9. Roadmap

- [x] 9.1 Add a row for this change to the «Зміни поза нумерацією» table of `docs/tech-task.md` §5
      with one line on what landed, and update the sentence below the table if it names the goal
      model. Verify the table's state matches `openspec list` after the change is archived.

## 10. Gate

- [x] 10.1 Run `npm run verify` and paste the final lines
- [x] 10.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
