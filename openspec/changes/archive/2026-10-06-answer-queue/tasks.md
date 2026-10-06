# answer-queue — tasks

Every task that changes behaviour writes its failing test first, names the test file and quotes
the delta-spec scenarios it proves. No box is ticked before `npm run verify` is green on the tree
that holds it.

## 0. Order

- [x] 0.1 Before starting, confirm no sibling change editing Головний's service rail
      (`backup-reminder`), the дубль answers (`observations-by-weight`), the pickers
      (`uniform-fields`) or `transaction-search` / `bank-notifications-screen` (`local-model-guesses`)
      is in the same wave (proposal Impact); verify with `openspec list` and the wave plan.

- [x] 0.2 Update `docs/glossary.md` (design D11) — check the wording against the deltas if it is already there: add «Правило-джерело»; extend Rule (a third
      target, money arriving only), Sweep (розбір) (it also gives доходи «Без джерела» their джерело,
      after absorption) and Counterpart income (a джерело a правило-джерело gave counts as the owner's
      choice). Verify `npm run verify` stays green and the wording matches the delta specs.

## 1. Правило-джерело in storage and domain (categorisation-rules, backup-file)

- [x] 1.1 First re-read `src/db/schema.ts` and `ls drizzle/` for a sibling's schema edit or newer
      migration. Then add `source_id` to `rules` and widen the target CHECK to exactly one of three
      (design D6); `npm run db:generate` for the next migration. In `src/db/migrations.test.ts` prove the migrated shape and that a
      category rule and a правило-переказ stored before the migration survive it unchanged with
      `source_id` NULL (the generated copy's data statement is hand-corrected, design D6), and that
      a row naming two targets is refused.
- [x] 1.2 `RuleTarget` gains `source`; the rules repository validates it (refuses an unknown джерело
      and «Без джерела», refuses two targets). Prove "A правило-джерело is stored", "A rule naming a
      category and a джерело is rejected", "«Без джерела» is rejected as a rule's target", "A
      правило-джерело to an unknown джерело is rejected" in `src/db/rules-repo.test.ts`.
- [x] 1.3 Direction-aware matching and `matchSource` (design D7). Prove "Arriving money is matched by
      правила-джерела alone", "Leaving money ignores правила-джерела", "The longest правило-джерело
      wins" and "A правило-джерело naming a продавець follows recognition" in
      `src/domain/rules.test.ts`; every existing matching scenario stays green.
- [x] 1.4 The розбір over доходи «Без джерела» (design D8c): `sweepUnsourced` returns the sourced
      доходи, `sweepStored` applies them after the витрати moves, `SweepCounts` carries the two new counts. Prove "A new
      правило-джерело answers the доходи already waiting", "A more specific правило-джерело keeps the
      last word", "A category правило moves no дохід", "A джерело the owner chose is never replaced",
      "A naming of a продавець reaches the доходи too", "Absorption comes before sourcing in one pass",
      "The розбір reaches a дохід «Без джерела» whatever stored it", "A правило-джерело keeps matching
      into an archived джерело", "A rule switched from a category to a джерело",
      "A deleted правило-джерело leaves its доходи as they are" and the amended "The pass is in the
      журнал as counts alone" in `src/domain/rules.test.ts` and `src/db/rules-repo.test.ts`.
- [x] 1.5 Backup: `BackupRule.sourceId`, `BACKUP_SCHEMA_VERSION` raised by one from the value before
      this change (equal to the journal length after 1.1), the consistency check over three
      targets (design D6). Prove "A правило-джерело survives the round trip", "An older бекап restores
      with no правило-джерело", "A правило-джерело pointing outside the бекап stops the restore" and
      "A правило naming a категорія and a джерело stops the restore" in `src/db/backup-repo.test.ts`
      and `src/backup/format.test.ts`.

## 2. Where a правило-джерело applies (monobank-sync, bank-notifications)

- [x] 2.1 monobank mapping (design D8a). Prove "A правило-джерело gives arriving money its джерело",
      "Arriving money is a дохід «Без джерела»", "A правило-джерело never matches money leaving" and
      "A зустрічний дохід is absorbed before any правило-джерело is asked", "Cashback is not silently
      finalised as income", "A правило-джерело never turns cashback into a повернення" and "An MCC-only
      правило-джерело sources a statement item that carries the MCC" in
      `src/monobank/sync.test.ts` — the absorption scenario at the commit, where absorption lives, in
      `src/db/monobank-repo.test.ts`.
- [x] 2.2 Дохід-чернетка confirmation (design D8b). Prove "A правило-джерело gives a confirmed дохід
      its джерело", "Confirming a дохід-чернетка keeps «Без джерела»", "A правило naming a категорія
      gives a дохід-чернетка nothing", "«Відсотки» only by the owner's правило" and "A confirmed дохід
      takes the джерело of its правило-джерело" in `src/notifications/draft.test.ts`.
- [x] 2.3 A sourced дохід is not a зустрічний дохід, and manual entry never asks the правила-джерела.
      Prove "A sourced дохід is not absorbed later" in `src/db/counterpart-income-repo.test.ts` and "A
      дохід recorded by hand is not touched" at the save layer in `src/db/transactions-repo.test.ts`
      (not `entry-form.test.ts`, which `quick-entry` rewrites).

## 3. The offer and the rules screen (categorisation-rules, main-screen, settings-screen)

- [x] 3.1 The правило-джерело offer after a джерело is set, with the «від:» whole-опис pattern
      (design D9). Prove "Setting a джерело on a дохід offers the правило-джерело", "A payment from a
      person proposes that person alone", "A джерело an existing правило-джерело already gives offers
      nothing", "Setting a джерело on a дохід offers nothing", "A дохід put back into «Без джерела»
      offers nothing", "A правило-джерело is offered as a джерело", "Giving a дохід its джерело offers
      the правило-джерело" and "Declining the правило-джерело keeps the джерело" in
      `src/ui/list-management.test.ts`.
- [x] 3.2 Wire the offer to the «Без джерела» mark and to editing of a дохід; `sweepSaid` names
      доходи. Prove "The owner is told how many доходи were given a джерело" in
      `src/ui/list-management.test.ts`.
- [x] 3.3 «Правила» list and form: the джерело target, its picker without «Без джерела», switching
      drops the others. Prove "A правило-джерело appears in the list", "The джерело picker offers no
      «Без джерела»" and "Switching from a категорія to a джерело drops the категорія" in
      `src/ui/settings-sections.test.ts` / `src/ui/list-management.test.ts`.

## 4. The queue model (answer-queue)

- [x] 4.1 `answerQueue` in `src/ui/answer-queue.ts` (design D1, D2): groups, order, membership, counts,
      no cross-currency sum. Prove "Groups stand in order and empty ones are absent", "A переказ and a
      коригування are never asked about", "A повернення in «Без категорії» is a question, a дохід in
      «Зарплата» is not", "A дубль of three months ago is not in the unnarrowed queue", "A pair across
      September and October is listed once", "Nothing waits", "Two currencies in one group" and
      "Looking is not answering" in `src/ui/answer-queue.test.ts`.
- [x] 4.2 The bank entry from the rail's monobank sentence, through one pure `monobankRailRow`
      extracted from `homeViewModel` and called by both (design D1). Prove "Twelve days without a token lead
      the queue" and "A configured token clears the entry" in `src/ui/answer-queue.test.ts`.
- [x] 4.3 Month narrowing and the month line. Prove "September only", "A clean narrowed month says
      so", "September is named in October", "A dismissed виклик does not hide the fact" and "A clean
      September shows no line" in `src/ui/answer-queue.test.ts`.
- [x] 4.4 Paging helper `visibleEntries` (design D3). Prove "127 unsourced доходи" and "Answering keeps
      the place" in `src/ui/answer-queue.test.ts`.

## 5. The queue screen (answer-queue)

- [x] 5.1 Extract the «Не дубль» / «Скасувати» / «Видалити одну» handlers into one shared hook used by
      the observations widget, Місяць and the підсумок (design D4); behaviour unchanged — the existing
      tests in `src/ui/observations.test.ts` stay green.
- [x] 5.2 Route `src/app/answers.tsx` with `month` parameter parsing in `src/ui/answer-queue.ts`
      (design D3); render groups, the month line, the narrowing and paging. Prove the parameter rule
      ("September only" with a malformed month narrowing nothing) in `src/ui/answer-queue.test.ts`,
      and add the route to `src/ui/screens.test.ts`'s route assertions.
- [x] 5.3 Answers in place: чернетка confirm/raw сума/dismiss, дубль, категорія with «Це переказ»,
      джерело. Prove "A confirmed витрата with no правило moves to «Без категорії»", "A raw чернетка
      asks for its сума", "Dismissing asks first and stores nothing", "A confirmed дохід with no правило-джерело moves to
      «Без джерела»", "«Не дубль» in the queue, then
      undone", "Either half of a pair opens its editing", "The queue merges and retypes nothing of a
      pair", "One of the two deleted from the queue", "One pick from the queue", "«Це переказ»
      leaves the queue for editing", "A повернення is offered категорії only", "Зарплата is given its
      джерело and remembered", "A refund that arrived as a дохід is retyped from editing" and
      "Categorising elsewhere empties the queue too" through the pure action/model layer in
      `src/ui/answer-queue.test.ts` and `src/ui/drafts-section.test.ts`.

## 6. Головний, підсумок, виклик (main-screen, bank-notifications-screen, month-summary*, challenges, transaction-search)

- [x] 6.1 Replace the uncategorised banner and the drafts row with `queueRow` (design D5); remove the
      draft expansion from `src/app/(tabs)/index.tsx`; rewrite `src/ui/motion-usage.test.ts`'s
      "Opening чернетки moves the feed down smoothly" (l.138–143) under the motion delta's "The rail
      row comes and goes smoothly" and "An answered entry leaves the queue smoothly". Prove "Count and destination agree", "Hiding
      the feed does not hide the row", "Answering the last entry removes the row", "A bank without a
      token is its own row and is not counted", "The feed's way to all транзакції is not narrowed",
      "Many drafts do not bury the dashboard", "Draft confirmation updates the same record", "Confirming the last чернетка into «Без категорії»
      hands off between both alerts", "Categorisation stays in place", "Many drafts are one number on
      Головний" and "No pending чернетки, no surface" in `src/ui/home-screen.test.ts`.
- [x] 6.2 Pending чернетки shown in the queue. Prove "A drafted витрата shows its proposal", "A raw
      чернетка shows its text and the missing сума" and "The newest чернетка stands first" in
      `src/ui/drafts-section.test.ts`.
- [x] 6.3 The підсумок's unanswered lines open `/answers?month=` (design D10). Rewrite the existing
      route assertions in `src/ui/month-summary-screen.test.ts` (l.245, l.262, l.277–278, which expect
      `/transactions?month=2026-09&only=…`, and ~l.281–286, which leads the waiting чернетки to `/`) under "«Без джерела» opens the unsourced доходи", "Waiting
      чернетки open the queue, not Головний", "Unanswered records open narrowed" and "Unsourced records
      open narrowed too".
- [x] 6.4 «Закрий <місяць>»'s action opens the queue narrowed (design D10, `answerMonthRoute` /
      `challengeStart`). Rewrite the assertions in `src/ui/progress-screen.test.ts` l.574–597
      (`left: 'uncategorised'`, `'unsourced'`, `'drafts'` now `/answers?month=…`; `left: 'nothing'`
      still `/transactions?month=2026-09`) under "Only доходи left opens them", "Only чернетки left
      opens them in the queue" and "Nothing left opens the month's транзакції", and prove "A виклик
      opens the місяць it is about" (the month parameter) in `src/ui/transaction-search.test.ts`.
- [x] 6.5 The «Без категорії» narrowing agrees with the queue group. Prove "A повернення in «Без
      категорії» is a question too" and "The list and Головний's count agree" in
      `src/ui/transaction-search.test.ts`.
- [x] 6.6 The нагадування still opens Головний, which names чернетки in the rail row. Prove "A tap
      while the app is closed opens Головний" in `src/ui/reminder-schedule.test.ts` (the route
      stays Головний) and `src/ui/home-screen.test.ts` (the rail row names the чернетки).

## 7. Emulator

- [x] 7.1 Smoke on the emulator with the `smoke-runner` subagent (`.claude/rules/android.md`):
      Головний's rail row and its count; the queue with all groups on seeded data, each answer in
      place, the month line and narrowing; the підсумок and «Закрий» entry points; a правило-джерело
      created from the offer sweeping the other доходи; 360 × 640 dp and 200 % text on the queue.
      Record the verdict in this task.
      **Verdict (2026-10-06, two rounds on Pixel_10_Pro, seeded copy of the owner's DB, restored after):**
      round 1 PASS for the rail row, group order and counts, month chips, the month line narrowing,
      paging, two currencies, a категорія pick and its offer, «Це переказ», the повернення picker,
      the джерело picker and offer text, чернетка confirm/dismiss, and the sole дубль's «Не дубль» →
      «Скасувати». It found D1 чернетки order, D2 no re-read after an accepted правило-джерело, D3 the
      розбір's sentence dropped, D4 a повернення without its рахунок — fixed in 23696c6 with tests.
      Round 2 PASS for all four fixes on the device («2 доходи отримали джерело.», «Без джерела»
      12→9 at once), the підсумок's three lines and «Закрий вересень 2026» opening the queue narrowed,
      «Правила» → «Джерело» without «Без джерела», and 360 × 640 dp. At 200 % text the row titles were
      cut («Без кате…»): fixed by two title lines with a test; **not re-run on the device**.
      Backlog, not in this change's spec: the sweep sentence's agreement for 1 («1 витрата стали
      переказами»), чернетки dated as ISO, «Без категорії» offered in category pickers, the
      «Правила» subtitle not naming джерело, the «Можливі дублі» heading at 0 beside «Скасувати».

## 8. Done

- [x] 8.1 Run `npm run verify` and paste the final lines
      `Test Files  243 passed (243)` · `Tests  5199 passed (5199)` ·
      `✔ verify passed (132615aeeee60c81e599cc5b709699ddcafe75f9)` (2026-10-06, before the commit).
- [x] 8.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
      First pass FAIL (1 critical: the sole дубль's «Скасувати» vanished with its group; 1 major:
      «Нічого не чекає відповіді» beside the bank entry). Fixed (`keepDuplicates`, emptyMessage);
      second pass PASS. Recorded minors: `countUncategorised` has no production caller; the
      one-tap handlers exist on three screens.
