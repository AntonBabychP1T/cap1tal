# Tasks

Baseline: `npm run verify` green on the tree at commit `3c296ab` plus the uncommitted
`monobank-background-sync` work it carries (3234 tests). Hard rule 2 applies throughout — every
behaviour below gets its failing test first.

A standing hazard for every test in this change: `src/ui/monobank-background.test.ts:183` and
`src/ui/monobank-sync.test.ts:217` run their прогони with `minRequestGapMs: 0`, which is why 3234
green tests never saw this defect — at a zero gap `paced()` never calls `wait()`, so the whole
failing path is unreachable. Every new test below SHALL use a non-zero gap.

## 1. The freshness decision (pure)

- [x] 1.1 In `src/monobank/sync.ts`, export `CLIENT_INFO_FRESH_MS = 60 * 60_000` and
      `usableAccounts(rows, links, nowMs, freshMs?)`. It takes the newest `obtainedAt` across the
      rows, answers `undefined` when there is none, when it is older than the межа свіжості, or when
      it is after `nowMs`, and otherwise answers the rows carrying exactly that moment, keyed by
      monobank account id (design D1, D2). The map's value type is the narrow one the coordinator
      actually reads — `currency` and `bankBalance` — not `MonobankAccount`, which carries
      `balance` and `creditLimit` that `StoredMonobankAccount` does not have. Failing test first in
      `src/monobank/sync.test.ts` for spec scenarios «A fresh stored answer sends the allowance to
      the statement», «An answer older than the межа свіжості is refetched», «An answer dated in the
      future is refetched» and «A phone that has never read client-info asks the bank», plus the one
      that is the point of D1: rows from an older answer are NOT in the map, so a link only they
      name reads as unnamed rather than as a reason to refetch. Verify with
      `npx vitest run src/monobank/sync.test.ts`.

## 2. The прогін spends its allowance on the statement

- [x] 2.1 Add `rememberedAccounts(): readonly StoredMonobankAccount[]` to `SyncStorage` in
      `src/monobank/coordinator.ts` and implement it in `src/db/monobank-repo.ts` as
      `listAccounts()` (design D1). Verify with `npx vitest run src/db/monobank-repo.test.ts` and
      `npm run typecheck` — every in-repo `SyncStorage` double must answer it.
- [x] 2.2 Add `asked?: boolean` (or the equivalent) to `SyncPorts`; a прогін that carries it SHALL
      fetch client-info whatever the phone holds (design D7). Set it at the two call sites the app
      already calls «asked for» — `src/app/manage/monobank.tsx:482` («Синхронізувати») and
      `src/app/(tabs)/index.tsx:228` (the pull on Головний) — and at neither of the two in
      `src/app/_layout.tsx` nor in `src/platform/monobank-sync-task.ts`. The division is the one
      «Pulling down on Головний refreshes it and syncs monobank now» already draws for the тихий
      інтервал; do not introduce a second notion of it. Failing tests first in
      `src/monobank/coordinator.test.ts` for spec scenarios «Синхронізувати» asks the bank however
      fresh the stored answer is», «The pull on Головний asks the bank too» and «A прогін an opening
      starts uses the stored answer». Verify with `npx vitest run src/monobank/coordinator.test.ts`
      and `npm run typecheck`.
- [x] 2.3 In `syncLinkedAccounts`, read the stored рахунки through `remembered(...)` and put them to
      `usableAccounts`; when they serve and the прогін is not one the owner asked for, skip the
      client-info request and take `fetched` from them. A link the map does not name ends
      `unavailable` and does **not** send the прогін back to the bank. Failing tests first in
      `src/monobank/coordinator.test.ts` for spec scenarios «A fresh stored answer sends the
      allowance to the statement», «A link the token no longer names does not send every прогін back
      to client-info», «A прогін that may send one request imports with it» and «Storage that will
      not answer does not stop the прогін» (a throwing `rememberedAccounts` leaves the прогін
      fetching client-info). Verify with `npx vitest run src/monobank/coordinator.test.ts`.
- [x] 2.4 Prove the convergence hinge, which is what makes the cadence work at all: a прогін that
      spends its whole allowance on the client-info request stores that answer before it stops, so
      the прогін after it sends a statement request. Failing test first in
      `src/monobank/coordinator.test.ts` for spec scenario «A прогін that refetches leaves the next
      one able to send a statement» — two прогони in sequence over one real repo, the second sending
      no client-info request. Verify with `npx vitest run src/monobank/coordinator.test.ts`.
- [x] 2.5 `commitStatementAnswer` never lowers a рахунок's `obtained_at`: it writes the баланс банку
      and its moment only when that moment is not older than the row's — the pair together or
      neither, never one of them (design D1, third writer). `upsertAccounts` is **not** touched: a
      fetched client-info answer must go on overwriting every row it names in either direction, or a
      row dated in the future of the device's clock could never be healed and the phone would
      refetch client-info for ever. Failing tests first in `src/db/monobank-repo.test.ts` (both
      directions, and that `upsertAccounts` still lowers a future-dated row) and in
      `src/monobank/coordinator.test.ts` for spec scenarios «A committed page does not move a
      рахунок's moment backwards» and «A рахунок the screen refreshed mid-прогін keeps the newer
      balance». Verify with
      `npx vitest run src/db/monobank-repo.test.ts src/monobank/coordinator.test.ts`.
- [x] 2.6 Prove the defect this change exists for is gone, at the seam that had it: a failing test
      in `src/monobank/coordinator.test.ts` where a прогін over nine links with a stored answer
      inside the межа свіжості and a gap already passed sends a statement request as its first
      request and imports from it — where today it sends client-info, owes the whole gap and imports
      nothing. Verify with `npx vitest run src/monobank/coordinator.test.ts`.

## 3. The прогін's span ends at the answer it used

- [x] 3.1 Change exactly two call sites in `src/monobank/coordinator.ts` — `runToMs` (line 253) and
      `obtainedAt` (line 339) — to take the moment of the client-info answer the прогін is using:
      the fetched answer's own moment, or the stored one's `obtainedAt` (design D3). Leave
      `ports.now()` alone everywhere else: it also feeds `noteRequest` (:290), `noteTurn` (:461) and
      `storedAt` (:522, :576), and those are moments of *requests* and of *writes*, not of the
      answer — an answer's moment reaching `noteRequest` would make every прогін believe the last
      request was an hour ago and defeat the pace this change exists to spend well. Failing tests
      first in `src/monobank/coordinator.test.ts` for spec scenarios «A прогін using a stored answer
      imports only up to that answer's moment» (asserting no imported транзакція is later than the
      answer's moment), «The next прогін imports the rest», «A committed баланс банку carries the age
      of the answer it came from» and «The pace still measures from the request». Verify with
      `npx vitest run src/monobank/coordinator.test.ts`.
- [x] 3.2 `markSynced` records the moment of the answer the прогін used, not `ports.now()`, and a
      рахунок whose cursor already stands at that moment sends no request, takes no хід and moves no
      moment (design D3). Without this, once a sweep has carried every рахунок to the answer's
      moment, `planWindows` returns `[]`, `syncOneAccount` answers `complete` having asked nothing,
      and `finish` dates a синхронізація the bank was never asked about — the exact thing the guard
      at coordinator.ts:296-303 exists to prevent, unreachable today only because `runToMs` is
      always `now`. A рахунок no синхронізація has ever completed is the one exception: it is not
      reported complete without a request, or the screen would say «Ще не синхронізовано» about a
      рахунок the outcome list calls complete. Failing tests first in
      `src/monobank/coordinator.test.ts` for spec scenarios «A completed рахунок is remembered by
      the answer's moment», «A прогін with nothing to ask moves no moment» and «A рахунок that never
      synced is not reported complete without a request». Verify with
      `npx vitest run src/monobank/coordinator.test.ts`.
- [x] 3.3 Confirm the прогін that *fetches* is unchanged by 3.1 and 3.2: the existing coordinator
      tests for windows, cursors and committed balances pass without edits, because the fetched
      answer's moment is what `runToMs` already was to within one round trip. Verify with
      `npx vitest run src/monobank/`.

## 4. A фоновий прогін that never waits

- [x] 4.1 Replace `budgetedRun` with `chanceRun()` in `src/monobank/yielding.ts` (design D4),
      keeping `foregroundRun` and `withRequestTimeout` untouched. Failing tests first in
      `src/monobank/yielding.test.ts`: `postponed()` answers no before any wait is asked for and yes
      after one, `wait` resolves without scheduling anything (a `SetTimer` double that is never
      called), and no clock is read. Verify with `npx vitest run src/monobank/yielding.test.ts`.
- [x] 4.2 In `src/ui/monobank-background.ts`, put `chanceRun()` over the handed-in ports and drop
      `budgetMs` and `setTimer` from `BackgroundTurnPorts`; `nowMs` stays for `syncDue` and
      `needsOwner`. Failing tests first in `src/ui/monobank-background.test.ts`, at a non-zero gap,
      for spec scenarios «A chance sends what the gap allows and stops», «A chance that owes the gap
      sends nothing», «Successive chances work through every рахунок» and «A chance starts no
      timer». Verify with `npx vitest run src/ui/monobank-background.test.ts`.
- [x] 4.3 Delete `BACKGROUND_TURN_BUDGET_MS`, `ANDROID_BUDGET_MS` and their `Platform.select` from
      `src/platform/background-turn.ts`, and their use in `src/platform/monobank-sync-task.ts`;
      leave `BACKGROUND_TURN_INTERVAL_MINUTES` and `reconcileTask` alone. Verify with
      `npm run typecheck` and `grep -rn "BUDGET" src/` finding nothing in the sync path.
- [x] 4.4 Confirm the перенесено promises the removed requirement made still hold under the new one:
      the existing coordinator and background tests for «A рахунок never asked about keeps its place
      in the order», «A рахунок stopped between its вікна keeps its pages and its хід», «A
      перенесено рахунок moves no moment» and «An answer in flight … stored whole» pass unchanged,
      or are rewritten around `chanceRun` where they named a budget. Verify with
      `npx vitest run src/monobank/ src/ui/monobank-background.test.ts`.

## 5. The screen's own requests take the minute

- [x] 5.1 `monobankConnection.submit` and `.refresh` (`src/monobank/connection.ts`) note the request
      they send, through a port rather than by reaching for the repo (design D5). Failing test first
      in `src/monobank/connection.test.ts`, and one in `src/monobank/coordinator.test.ts` for spec
      scenario «A statement request is not sent seconds after a request the screen made». Verify
      with `npx vitest run src/monobank/connection.test.ts src/monobank/coordinator.test.ts`.
- [x] 5.2 Wire the port at the screen's call site (`src/app/manage/monobank.tsx`, beside
      `cacheAccounts`). Verify with `npm run typecheck`.

## 6. The words

- [x] 6.1 `docs/product-vision.md` §12: the background sync is no longer «bounded to a few minutes
      and continued on the next chance». Replace that clause with the bound the app *does* have — a
      chance sends what the bank's minute already allows and never waits, so it is one request and
      then the next chance — rather than only deleting the old one. The 2026-09-07 owner decision in
      the same bullet («only while at least one рахунок is linked») is untouched. Verify the sentence
      states what now bounds a chance, and that a reader who knows nothing else can tell a chance
      from a прогін in front of the owner.
- [x] 6.2 `docs/glossary.md`: correct **прогін** («one client-info request for the whole run» → only
      when the stored answer will not serve, and never for a прогін the owner asked for), **фоновий
      прогін** («with a few minutes' budget» → sends what the pace allows and never waits) and
      **перенесено** («for want of time or of foreground» → which now also covers the minute owed to
      the bank); and add **межа свіжості** — the hour after which a stored client-info answer no
      longer serves a прогін nobody asked for, and therefore the most транзакції may lag the bank by.
      Hard rule 7: use that term verbatim in the specs and in app-overview. Verify each entry against
      `specs/monobank-sync/spec.md` in this change.
- [x] 6.3 `docs/app-overview.md`, three places: line ~440 «прогін коштує `1 + рахунки` запитів», line
      ~455 «з бюджетом у вісім хвилин», and line ~457 «Дев'ять рахунків … вміщаються у дві» (nine
      chances at best, and more for a рахунок with history). Verify by re-reading the whole monobank
      section, not by grepping for «бюджет».
- [x] 6.4 `docs/tech-task.md`: line ~231 still describes `monobank-background-sync` as «той самий
      прогін, з бюджетом у вісім хвилин», and §5's table has no row for this change. Correct the
      first and add the second. Verify both by reading §5's table.

## 7. Blocking: the archive order

- [ ] 7.1 **Do not archive this change before `monobank-background-sync` is archived.** This change
      REMOVES that change's «A background run has a time budget and postpones what it cannot
      finish» and MODIFIES its «A run in front of the owner yields when the app leaves the
      foreground» and «A postponed run does not spend the quiet interval»; none of the three is in
      `openspec/specs/monobank-sync/spec.md` until that change archives, which is why
      `openspec validate --strict` reports the MODIFIED headers as not found today (the REMOVED
      header is not checked until archive). Verify before archiving: `openspec list` shows
      `monobank-background-sync` archived, `openspec/specs/monobank-sync/spec.md` carries all three
      headers, and `openspec validate monobank-sync-cadence --strict` is clean of the not-found INFO.
- [ ] 7.2 `monobank-sync-fairness` is **not** blocking. Its «The minimum gap between requests holds
      across runs, not only within one» is untouched — this change adds requirements about the
      request a прогін need not send and about the прогін's span, and §5 brings the screen into
      conformance with it rather than changing it. Verify by reading that change's delta and
      confirming no header in this change's delta matches one of its.
- [x] 7.3 Record in `openspec/changes/monobank-background-sync/tasks.md` §9.2 that the owner's
      money-path verification was run on 2026-09-09 and failed — репорт
      `cap1tal-report-2026-09-09-1747`, thirteen client-info requests and no statement request in
      two days — and that `monobank-sync-cadence` is what it found, so the two are read together.
      Verify the note names the репорт and this change.

## 8. The gate

- [x] 8.1 Run `npm run verify` and paste the final lines
- [x] 8.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

## 9. The phone

- [x] 9.1 Smoke on the emulator with the `smoke-runner` subagent: the monobank screen's sync
      section, «Синхронізувати» in front of the owner, and a forced chance
      (`cmd jobscheduler run -f`, `.claude/rules/android.md`) with the app backgrounded — the chance
      must end in seconds with a statement request sent, not in a wait. Record what was seen.

      **Run on 2026-09-09, PASS** — Pixel_10_Pro / emulator-5554 (API 37), fresh
      `assembleDebug`, on `f64f7a2` (Metro serving the working tree, which also carries
      `journal-diagnostics` uncommitted, so the журнал rows below come from that work as much as
      from this change). No monobank token on the emulator, so the money path is 9.2's; the 43
      scenarios that need a request to the personal API were not reachable here.
      - *The number the change exists for.* `BackgroundTaskConsumer: Executing task
        'cap1tal.monobank-sync.v1'` → `TaskService: Finished task`, per chance: **66 ms** (warm
        process), **44 ms** (second chance, same process), **3.434 s** (headless after `am kill`,
        almost all of it the cold JS process and `prepareBackgroundStorage`'s migrations). The
        прогін inside each, as the журнал measured it: **23 ms, 8 ms, 7 ms**. Nothing waited. Before
        this change one chance sat inside a fifty-nine-second wait for 1,199,579 ms.
      - *No starvation.* Three successive chances, each with its own run id and its own
        `почалось` → `not-configured` pair beside a `background-chance · background ·
        not-configured`. **None answered `already-running`** — which is the whole of what the
        twenty-minute lock did to the two chances after it.
      - The screens: `/manage/monobank` renders its sync section without a token, «Синхронізувати»
        without a link answers honestly, Головний renders and its pull does not crash.
      - Nothing was left behind: `monobank_sync_attempt` empty, `monobank_request_pace` empty,
        `alerts` empty, both link moments still null, 0 транзакції.
      - The documented development-build window held: the first forced chance after `am kill` did
        nothing (bundle still coming from Metro), the next on that process registered and ran the
        task. Not a defect.
      - No defects against this change's spec.
- [ ] 9.2 The owner's own money path, on the phone with the token. This is
      `monobank-background-sync` §9.2 re-run, and it is what says the defect is actually gone. The
      criterion is the журнал and not a finished sync — a рахунок with history needs many chances to
      leave «Ще не синхронізовано», and expecting that within an hour would be expecting what the
      design cannot give. After a few hours away from the app, the репорт SHALL show:
      `GET /personal/statement` requests present at all; транзакції imported by a chance nobody
      asked for; `background-chance` entries ending in seconds rather than minutes; and the ходи
      rotating — read that from the per-рахунок `monobank-sync/<id>` entries that end in an outcome,
      **not** from `index=1`, which `journalProgress` writes before any request is sent and which a
      chance that spends its allowance on client-info logs for a рахунок that took no хід. Record
      what was seen.
