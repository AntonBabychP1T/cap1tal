## 1. The remembered attempt in storage

- [x] 1.1 Add the `monobank_sync_attempt` table to `src/db/schema.ts` — one row keyed by the text
      id `'attempt'` behind a CHECK, the app's single-row idiom, with `attempted_at` and a nullable
      `outcome` — and generate the migration with `npm run db:generate` (design D2). Verify:
      `npx vitest run src/db/migrations.test.ts` passes and exactly one file is added under
      `drizzle/`.
- [x] 1.2 Bump `BACKUP_SCHEMA_VERSION` to 14 in `src/backup/format.ts` and add
      `monobank_sync_attempt` to the enumerated exclusions in `src/backup/format.test.ts` with the
      reason (design D2): device-local operational state, the same class as `alerts` and
      `entry_defaults`. Verify: `npx vitest run src/backup/format.test.ts` covers persistence's
      «A бекап carries no attempt».
- [x] 1.3 Extend `src/db/monobank-repo.ts` with `attempt()`, `beginAttempt(at)`,
      `finishAttempt(outcome)` and `withdrawAttempt()`, replacing the single row rather than
      appending. Verify: `npx vitest run src/db/monobank-repo.test.ts` covers persistence's «An
      attempt is read back as it was written», «A later attempt replaces the earlier one», «An
      attempt without an outcome round-trips as one» and «A device that never attempted says so».
- [x] 1.4 Prove the бекап path ignores the attempt: making a бекап on a device that holds one omits
      it, and restoring another device's бекап leaves it untouched. Verify:
      `npx vitest run src/db/backup-repo.test.ts` covers persistence's «A restore leaves this
      phone's attempt alone».
- [x] 1.5 Prove the migration keeps stored rows: apply every committed migration to a database
      holding рахунки, транзакції, monobank links, imported item ids and last-sync moments and
      assert none changed. Verify: the new case in `src/db/migrations.test.ts` covers persistence's
      «The migration adds storage and touches nothing» and «An empty database reaches the current
      shape».

## 2. The pure decisions

- [x] 2.1 Create `src/monobank/auto.ts` with `syncDue({ links, attemptedAtMs, nowMs })`
      and the exported quiet-interval constant carrying design D1's arithmetic as its comment.
      Verify: `src/monobank/auto.test.ts` covers monobank-sync's «The first opening on a linked
      device syncs», «Reopening inside the interval sends nothing», «Returning after hours syncs»,
      «With nothing linked nothing is attempted». `syncDue` deliberately takes neither `configured`
      nor `force`: the token lives in secure storage and the coordinator reads it anyway, and a run
      the owner asked for simply does not call `syncDue`. So «Without a token nothing is attempted»
      is proven at `startSync` (task 3.2) and «A run the owner asked for ignores the interval» in
      task 3.1, both by behaviour rather than here.
- [x] 2.2 Add `worstOutcome(results)` to `src/monobank/auto.ts`, total over every `AccountOutcome`
      the coordinator can produce: invalid-token, rate-limited, unavailable, cancelled, complete.
      Verify: `src/monobank/auto.test.ts` covers «The worst outcome is the one remembered», «A rate
      limit outranks an unavailable account», «A stopped account outranks a completed one» and «A
      whole run that worked is remembered as complete».
- [x] 2.3 Add `needsOwner({ attempt, lastCompletedAtMs, nowMs })` returning which of the two
      situations it is or nothing at all, with the 24-hour staleness rule of design D6 — the words
      belong to Головний, not here. Verify: `src/monobank/auto.test.ts` covers monobank-sync's «A
      rejected token needs the owner at once», «A single unreachable attempt over fresh data needs
      nobody», «Failing over stale data needs the owner», «A run the owner stopped is not a
      failure», «A run that worked needs nobody», «A device that has tried nothing yet needs
      nobody» and «An attempt with no outcome needs nobody».

## 3. The one entry point and its lock

- [x] 3.1 Create `src/ui/monobank-sync.ts`: `startSync` as the only caller of
      `syncLinkedAccounts`, holding the module-level in-flight promise, returning «already going
      on» as a value, and exposing `syncInFlight()` plus `onSyncState` firing on start **and** on
      finish (design D3). Verify: `src/ui/monobank-sync.test.ts` covers monobank-sync's «A second
      trigger during a run starts nothing», «The owner asking during a run is told, not queued», «A
      run beginning is announced, not only its end» and «After a run ends the next one may start».
- [x] 3.2 Make `startSync` write the attempt around the run: `beginAttempt` before calling the
      coordinator, `finishAttempt(worstOutcome(...))` for a run that reached the bank, and
      `withdrawAttempt()` for `not-configured`, `no-links` and `storage-unavailable` (design D10).
      Verify: `src/ui/monobank-sync.test.ts` covers «A failed run still spends its interval», «A run
      the app did not survive still holds its moment», «Without a token nothing is attempted», «With
      nothing linked nothing is attempted» and «Unreadable token storage is not an attempt either».
- [x] 3.3 Raise the alert with the caller's own `attended` on a failed run and `clearAlert` on a
      completed one, and do not call `journal.failure` — `raise` already journals the kind, and a
      silent run showed the owner no text to journal (design D5). Verify:
      `src/ui/monobank-sync.test.ts` covers main-screen's «A failing automatic run posts no
      notification», «A run that works clears what an earlier failure left standing», «A successful
      automatic run says nothing» and «An automatic run that imported nothing says nothing either»,
      each configured exactly as the app shell configures a run.

## 4. The trigger

- [x] 4.1 Call `startSync` from `src/app/_layout.tsx` on open and on `useOnForeground`, gated by
      `syncDue`, beside the notification drain and passing no `cancelled` port (design D4). Verify:
      `npm run typecheck` and the emulator smoke of task 7.1 — this is the React half the gate
      cannot run.
- [x] 4.2 Keep `src/app/manage/monobank.tsx`'s «Синхронізувати» going through `startSync` with its
      own `cancelled` port, its progress reporting and its `journal.failure` unchanged; the
      сповіщення itself moved into `startSync`, which is now the only caller of the coordinator. Verify: `npx vitest run src/ui/monobank-screen.test.ts` still passes and
      `npm run typecheck` is green.

## 5. Головний

- [x] 5.1 Add `freshnessLabel(ms, now)` to `src/ui/dates.ts`, delegating past a day to
      `momentLabel` (design D7). Verify: `npx vitest run src/ui/dates.test.ts` covers main-screen's
      «Minutes are stated as minutes», «A sync just now is щойно», «Hours are stated as hours» and
      «Beyond a day it is a calendar moment».
- [x] 5.2 Give `homeViewModel` its `monobank` field — the freshness line, the «sync is going on»
      state, and the attention row's words from `needsOwner` — and add that row to `HomeAttention`
      so the section's presence counts it. Verify: `npx vitest run src/ui/home-screen.test.ts`
      covers «A linked bank that has never synced says so», «Without monobank there is no line», «A
      run in flight is what the line says», «A failed run does not move the line», «A rejected token
      puts the section on the screen», «A transient failure over fresh data puts nothing there»,
      «The monobank row goes when the problem does» and the modified «Nothing waiting, no section».
- [x] 5.3 Render the freshness line and the monobank row of «Потребує уваги» in
      `src/app/(tabs)/index.tsx` from that view model, the row opening `/manage/monobank`, and
      subscribe to `onSyncState` so a run beginning or ending re-reads the screen. Verify:
      `npm run typecheck` and the smoke of task 7.1 for main-screen's «A run that begins while
      Головний is open reaches the line».
- [x] 5.4 Add an optional `refreshControl` prop to `Screen` in `src/components/surfaces.tsx`,
      passed through to its ScrollView and absent on every other screen, and use it on Головний:
      reload storage always, then `startSync` when monobank is configured with a link — never
      consulting `syncDue`, because the interval governs only the runs the owner did not ask for —
      awaiting a run already in flight rather than starting a second (design D8). Verify:
      `npm run typecheck`, plus the smoke of task 7.1 for «A pull imports and shows the result in
      place», «A pull without monobank changes nothing but the reading» and «A pull during a run
      starts no second one».

## 6. The monobank screen

- [x] 6.1 Make the screen say a sync is going on while a run started elsewhere is in flight, offer
      neither starting nor stopping it, re-read on `onSyncState`, and keep its own run's progress
      and outcome list unchanged. Verify: `npx vitest run src/ui/monobank-screen.test.ts` covers
      monobank-sync-screen's «A run started elsewhere is not started again here», «A run started
      elsewhere is not this screen's to stop», «A run that begins while the screen is open is seen
      there» and «A run started elsewhere dates the accounts it completed».

## 7. Smoke and documentation

- [ ] 7.1 Run the `smoke-runner` subagent over this change's scenarios on the emulator: opening the
      app with a linked рахунок, the freshness line's wording, the pull, a pull with monobank not
      configured, and «Потребує уваги» after a rejected token. Fix what it finds.
- [ ] 7.2 Update `docs/app-overview.md` — Головний now carries the freshness line and syncs by
      itself, with a fresh screenshot under `docs/screens/`.

## 8. The gate

- [x] 8.1 Run `npm run verify` and paste the final lines
- [x] 8.2 Run the `diff-reviewer` subagent; fix CRITICAL findings until PASS

## 9. Blocking: the archive order

- [ ] 9.1 **Do not archive this change before `home-daily-overview` is archived.** The main-screen
      delta here MODIFIES «Потребує уваги», which that change ADDS and which is therefore not in
      `openspec/specs/main-screen/spec.md` yet. `openspec validate --strict` passes either way — it
      does not cross-check a MODIFIED against truth — so nothing in `verify` catches this. Archived
      in the wrong order, this change's MODIFIED has no target and `home-daily-overview`'s ADDED
      then overwrites the requirement, silently dropping the monobank row. Verify before archiving:
      `openspec list` shows `home-daily-overview` archived, `openspec/specs/main-screen/spec.md`
      contains «Потребує уваги», and `openspec validate monobank-auto-sync --strict`
      still passes against it — that form, not `--changes`, which ignores the name and validates
      everything.
