## 1. The two new moments in storage

- [x] 1.1 Add the `monobank_request_pace` table to `src/db/schema.ts` — one row keyed by the text id
      `'pace'` behind a CHECK, the app's single-row idiom, with `last_request_at` as
      `{ mode: 'timestamp_ms' }` NOT NULL (design D3) — **and** the nullable `last_attempted_at`
      column on `monobank_links`, beside `last_synced_at` and documented as mirroring it (design
      D1, D3). Generate one migration for both with `npm run db:generate`. Verify:
      `npx vitest run src/db/migrations.test.ts` passes and exactly one file is added under
      `drizzle/`.
- [x] 1.2 Bump `BACKUP_SCHEMA_VERSION` to 19 in `src/backup/format.ts` — the constant is pinned to
      the number of migration-journal entries — and add `monobank_request_pace` both to the
      enumerated exclusions in `src/backup/format.test.ts` and to the prose in `format.ts` that
      gives every exclusion its reason, as device-local operational state of the same class as
      `monobank_sync_attempt`, `alerts` and `entry_defaults`. `last_attempted_at` is a column on a
      table that *is* backed up, so it needs its own paragraph in that prose saying why it is left
      out of the snapshot — `format.test.ts` guards tables, not columns, so nothing else would say
      it (design D3). Verify: `npx vitest run src/backup/format.test.ts` passes — it pins the
      version and the enumerated exclusions — while persistence's «A бекап carries no request
      moment» is covered next door in `src/db/backup-repo.test.ts`, which is where a бекап is
      actually made.
- [x] 1.3 Extend `src/db/monobank-repo.ts` with `lastRequestAtMs(): number | undefined` and
      `noteRequest(at: Date): void`, replacing the single row rather than appending. Verify:
      `npx vitest run src/db/monobank-repo.test.ts` covers persistence's «The moment is read back
      as it was written», «A later request replaces the earlier moment» and «A device that never
      sent a request says so».
- [x] 1.4 Add `lastAttemptedAtMs: number | null` to `StoredMonobankLink` and `noteTurn(
      monobankAccountId, at)` to the repository, and make `link`, `createAccountAndLink` and
      `linkMany` start a link with no turn. Verify: `npx vitest run src/db/monobank-repo.test.ts`
      covers persistence's «A link's turn is read back as it was written», «A link that has never
      had a turn says so», «A failed turn moves only the turn» and «Relinking starts the turns
      again».
- [x] 1.5 Leave `last_attempted_at` out of the link columns `src/db/backup-repo.ts` snapshots and
      restores — the бекап file's shape is unchanged — and prove the бекап path: a request moment is
      omitted from a бекап and untouched by a restore, and a restored link reads back with no turn
      while its cursor, boundary and last-sync moment are exactly as the бекап holds them. Verify:
      `npx vitest run src/db/backup-repo.test.ts` covers persistence's «A restore leaves this
      phone's request moment alone» and «A restored link has had no turn».
- [x] 1.6 Prove the migration keeps stored rows: apply every committed migration to a database
      holding рахунки, транзакції, monobank links, imported item ids, last-sync moments and a
      remembered sync attempt, and assert none changed and that every link reads back with no turn.
      Verify: the new cases in `src/db/migrations.test.ts` cover persistence's «The migration adds
      storage and touches nothing», «Links that existed before the migration have had no turn» and
      «An empty database reaches the current shape».

## 2. The order a run works in

- [x] 2.1 Add `syncOrder(links)` to `src/monobank/sync.ts` — pure, total, `lastAttemptedAtMs` null
      first then ascending, `monobankAccountId` as the tie-break, returning a new array and
      mutating nothing (design D1). Verify: `src/monobank/sync.test.ts` covers monobank-sync's «An
      account that has never had a turn goes first», «The longest-waiting account goes first» and
      «Accounts that have waited equally are ordered reproducibly».
- [x] 2.2 Replace the `monobankAccountId` sort in `syncLinkedAccounts`
      (`src/monobank/coordinator.ts`) with `syncOrder`, taken once before the loop and never
      recomputed (design D2), and add `noteTurn` to `SyncStorage`, called for an account the run
      is about to send a request about and not for one it passes over (design D1). Verify:
      `npx vitest run src/monobank/coordinator.test.ts` covers monobank-sync's «A run cut short
      leaves different accounts first next time», «An account that never completes does not hold
      the queue», «An account no request is spent on keeps its place» and «Giving an account its
      turn does not reorder the run it is in» — the first by running a coordinator over nine links
      with a `cancelled` port that stops after three, then a second one over the moments the first
      left.
- [x] 2.3 Check the existing coordinator tests that lean on the old alphabetical order. Two do —
      «An invalid token mid-run stops the remaining accounts» and «Cancelling stops the run» —
      and both still hold, because with neither link having had a turn `syncOrder`'s tie-break is
      the monobank account id and gives the same sequence. Neither needed rewriting; both gained
      a comment naming the requirement they now lean on, so the next reader does not take the
      order for an accident. Verify: `npx vitest run src/monobank/coordinator.test.ts` is green
      with no test left asserting an order the spec no longer states.

## 3. The pace that survives a run

- [x] 3.1 Add `lastRequestAtMs()` and `noteRequest(at)` to the `SyncStorage` interface in
      `src/monobank/coordinator.ts`, seed `lastRequestMs` from the first and call the second where
      the run already records a request — for every request sent, whatever it answered (design D4).
      Verify: `npx vitest run src/monobank/coordinator.test.ts` covers monobank-sync's «A run
      started immediately after another waits», «A run started long after another does not wait»,
      «The first run on a device does not wait» and «A failed run still moves the remembered
      moment».
- [x] 3.2 Clamp the wait to one gap so a stored moment in the future cannot stall sync, and wrap
      both `noteRequest` and `noteTurn` so a refused write can never end a run (design D4).
      Verify: `npx vitest run src/monobank/coordinator.test.ts` covers monobank-sync's «A clock
      moved forward does not stall sync» and «Storage that will not remember the moment does not
      stop the run».
- [x] 3.3 Wire the new storage methods through `src/hooks/monobank-ports.ts` — nothing but passing
      `monobankRepo` on, which already implements them. Verify: `npm run typecheck` is green.

## 4. What the two screens say

- [x] 4.1 Add `syncCoverage(links)` to `src/ui/monobank-screen.ts` in place of
      `lastCompletedSyncMs` — which had one caller, the line this change rewrites, and whose
      answer no screen should be able to ask for any more — and export it, answering
      `{ linked, synced, oldestCompletedMs? }` (design D5). Verify:
      `npx vitest run src/ui/monobank-screen.test.ts` covers the three shapes it distinguishes —
      none synced, some synced, all synced — as the cases the two line rules read.
- [x] 4.2 Rewrite `lastSyncLine` on that reducer: `Синхронізовано N з M рахунків` while partial
      with the noun fixed in the genitive (design D6 — **not** `accountCount`), the oldest
      completed moment once every link has synced, `NEVER_SYNCED_DEVICE` when none has, `null` with
      no links. Verify: `npx vitest run src/ui/monobank-screen.test.ts` covers
      monobank-sync-screen's «The screen's last sync is the oldest of the accounts», «A partly
      synced bank is stated as a count, not as a moment», «The count reads as Ukrainian for every
      number of accounts», «No linked account has ever synced» and «A completed sync is dated on
      the screen».
- [x] 4.3 Change `homeViewModel`'s `monobank` input from `lastCompletedAtMs?` to
      `{ linked, synced, oldestCompletedAtMs? }` beside the fields it already takes, give its line
      the same rule in Головний's words, and feed `needsOwner` the whole-bank moment —
      `synced === linked ? oldestCompletedAtMs : undefined` (design D5). Verify:
      `npx vitest run src/ui/home-screen.test.ts` covers main-screen's «The age is the oldest
      account's, not the newest», «A partly synced bank is stated as a count», «The count reads as
      Ukrainian for every number of рахунки», «A failing run over a partly synced bank needs the
      owner», «Minutes are stated as minutes», «A linked bank that has never synced says so»,
      «Without monobank there is no line» and «A failed run does not move the line».
- [x] 4.4 Confirm the two screens cannot drift: one test asserts that for the same links Головний's
      line and the monobank screen's line agree on which of the three states they are in and on the
      moment behind them. Verify: `npx vitest run src/ui/home-screen.test.ts` holds the case, as
      main-screen's «the same moment the monobank screen states, in shorter words» requires.
- [x] 4.5 Compute `syncCoverage(stored.links)` where `src/app/(tabs)/index.tsx` computes
      `lastCompletedSyncMs` today and pass its answer into `homeViewModel`; render whatever the two
      view models now say in that file and in `src/app/manage/monobank.tsx`, with no rule of their
      own (design D5). Verify: `npm run typecheck` and the smoke of task 6.1.

## 5. The gate

- [x] 5.1 Run `npm run verify` and paste the final lines
- [x] 5.2 Run the `diff-reviewer` subagent; fix CRITICAL findings until PASS

## 6. Smoke and documentation

- [x] 6.1 Run the `smoke-runner` subagent over this change's scenarios on the emulator: the
      monobank screen with some links synced and some not, the same state on Головний, and the two
      lines after a completed run. Fix what it finds.
- [x] 6.2 Update `docs/app-overview.md` where it describes the freshness line and the monobank
      screen's last sync, with a fresh screenshot under `docs/screens/`, then re-run
      `npm run verify` so the tree the commit is made from is the verified one.

## 7. Blocking: the archive order

- [ ] 7.1 **Do not archive this change before `monobank-auto-sync` is archived.** Two of this
      change's deltas target requirements that live in that change and are therefore not in the
      truth specs yet: `main-screen`'s «Головний says how fresh the bank data is» (which
      `monobank-auto-sync` ADDS and this change MODIFIES) and `monobank-sync-screen`'s «When each
      linked account last synced is shown, and its absence is said plainly» (which
      `monobank-auto-sync` MODIFIES and this change REMOVES in favour of «How much of the bank has
      synced, and how old that picture is, is said plainly»). `openspec validate --strict` passes
      either way — it does not cross-check a delta against another change — so nothing in `verify`
      catches this. Archived first, this change's MODIFIED has no target and its REMOVED drops the
      pre-auto-sync wording, after which `monobank-auto-sync`'s own deltas would silently reinstate
      the behaviour this change exists to remove. This change's ADDED requirement also already
      embeds `monobank-auto-sync`'s run-started-elsewhere paragraphs, so in any other order its
      body must be re-derived rather than applied. Verify before archiving: `openspec list` shows
      `monobank-auto-sync` archived, `openspec/specs/main-screen/spec.md` contains «Головний says
      how fresh the bank data is», `openspec/specs/monobank-sync-screen/spec.md` still contains the
      requirement this change removes, and `openspec validate monobank-sync-fairness --strict`
      still passes against them — that form, not `--changes`, which ignores the name and validates
      everything.
- [x] 7.2 Add the mirror note to `openspec/changes/monobank-auto-sync/tasks.md` §9 so the chain is
      visible from both ends: that change is blocked behind `home-daily-overview` and this one is
      blocked behind it, making the order `home-daily-overview` → `monobank-auto-sync` →
      `monobank-sync-fairness`. Verify by reading all three tasks before archiving anything in the
      chain.

## 8. What the emulator showed

The three states of the monobank screen were driven on `Pixel_10_Pro` with three links seeded
directly in storage (`.cache/android/smoke/monobank-sync-fairness/`):

- **None synced** (`21-mono-none-synced-line.png`) — «Синхронізації на цьому пристрої ще не було»,
  with all three rows on «Ще не синхронізовано». Unchanged, and correct.
- **One of three synced** (`22-mono-1-of-3.png`) — «Синхронізовано 1 з 3 рахунків». This is the
  reported bug in miniature: before this change the same state said «Остання синхронізація —
  сьогодні о 10:39», dating a sync two of the three рахунки had never had. The genitive plural is
  right for 3, which is the number `accountCount` would have got wrong.
- **All three synced** (`23-mono-all-synced-oldest.png`) — rows at «30 серпня о 18:05», «сьогодні
  о 10:44» and «1 вересня о 09:20», and the line «Остання синхронізація — 30 серпня о 18:05»:
  the oldest, not the newest. Before this change it read «сьогодні о 10:44».

No crash, no red box, and nothing in the device log but React Native's own development warning.

**Not smoke-tested, and why:** Головний's freshness line never appeared, because it is shown only
when monobank is *configured* — a token in secure storage — and the links here were seeded without
one (`24-home-all-synced.png` shows Головний with no monobank line at all, which is the specified
behaviour for an unconfigured device). Entering a token would mean a real request to
api.monobank.ua, which a smoke test may not make. The line reads the same `syncCoverage` the
monobank screen above renders correctly, and its four states are proven in
`src/ui/home-screen.test.ts` including the anti-drift case that holds the two screens to one
answer.
