## Context

See `proposal.md` — Why, for the three defects and the bug report that surfaced them.

What shapes the approach, beyond that:

- `syncLinkedAccounts` (`src/monobank/coordinator.ts`) already receives everything effectful as a
  port and is proven end to end under `verify` against synthetic answers. Both the ordering and the
  pacing therefore have somewhere honest to live: the order is a pure function of the links, and
  the remembered request moment is two more methods on `SyncStorage`.
- `StoredMonobankLink` already carries `lastSyncedAtMs: number | null` (`src/db/monobank-repo.ts`),
  which `markSynced` writes and only for a `complete` account. That moment answers the screens, but
  it cannot order a run — see D1 — so the link gains one more moment beside it.
- The two lines share one reducer today: `lastCompletedSyncMs(links)` in `src/ui/monobank-screen.ts`,
  which Головний imports precisely so the two screens cannot drift. That seam is where the new rule
  belongs, for the same reason.
- `monobank_sync_attempt` is the app's single-row-table idiom: a text `id` primary key pinned by a
  CHECK, and `{ mode: 'timestamp_ms' }` for instants. The remembered request moment is the same
  shape of thing.
- Migrations are append-only (`.claude/rules/database.md`): the new storage is a new generated
  migration plus a test that every committed migration still leaves stored rows untouched.

## Goals / Non-Goals

**Goals:**

- Every paced request a run spends goes to the рахунок that has waited longest, so a run that ends
  early still moves the owner's picture forward and no рахунок is unreachable.
- The two screens state what has actually synced, and how old the *whole* picture is.
- The minute between requests is a property of the device, not of one run.

**Non-Goals:**

- Running a sync while the app is not in the foreground. Nine рахунки still cost about nine
  minutes; this change makes those minutes count and stops the screens misreporting the result. A
  background run is native work (a foreground service or a background task) and its own change.
- Reducing the number of requests a run makes. The personal API has no multi-account statement
  endpoint, so one рахунок is one request per window; nothing here can change that.
- Touching what is imported, how an item maps, or the cursor rule. No транзакція, no сума and no
  cursor behaves differently because of this change.

## Decisions

### D1. The order is "longest since its turn", and a turn is a request sent

`syncOrder(links)` joins `planWindows`, `continueWindow`, `isFullAnswer` and `mapStatement` in
`src/monobank/sync.ts` — the module the coordinator's own comment calls "the two decisions a sync
makes… data in, data out". The coordinator keeps the order; the rule lives with the other rules.

It sorts on `lastAttemptedAtMs` — the moment a run last sent a request about that link — `null`
first, then ascending, then `monobankAccountId` as the tie-break.

Ordering on the **turn** rather than on `lastSyncedAtMs` is the correction the spec review forced,
and it is the whole of the fairness argument. Ordered by the last *completed* sync, a рахунок that
can never complete — one client-info still shows but whose statement answers `unavailable` every
time — keeps `lastSyncedAtMs === null` forever and therefore heads every run for good. Two or three
of those recreate the starving tail this change exists to remove. A turn is taken whatever the
answer was, so a рахунок that cannot complete costs exactly one request per cycle, like every other,
and the queue always advances.

A turn is *not* taken when no request is spent: a link whose monobank account the token no longer
shows is passed over before `fetchStatement`, so it stays at the head of the order and costs
nothing to leave there.

`null` first because a link that has never had a turn is the one the app knows nothing about, and
because without it a рахунок linked today on a phone with eight busy ones would queue behind all of
them.

*Alternative rejected:* order by cursor age. The cursor moves mid-run on a paginated account, so a
рахунок halfway through a long first import would sort itself to the back after each committed
page. The turn moves once per run per рахунок, which is exactly the event being rationed.

### D2. The order is taken once, at the start of the run, and never recomputed

The coordinator already snapshots `runToMs` once, for the same family of reasons. Re-sorting after
each account would make the loop's own progress its input: the run would be a priority queue over
state it is mutating, and a run over N accounts could not be stated to make N requests. Sorting
once is also what makes «a run is reproducible» testable.

### D3. The remembered request moment is its own single-row table, not a column on the attempt

`monobank_request_pace`, one row, `id` pinned to `'pace'` by a CHECK, `last_request_at` as
`timestamp_ms`. The obvious cheaper move — a fourth column on `monobank_sync_attempt` — is wrong
because `withdrawAttempt()` **deletes that row**: a run that finds no token or no link withdraws
its attempt, and the pace of requests the device really did send would go with it. The two facts
have different lifetimes, so they are two rows.

It is written after every request the coordinator sends, ok or not: a request that came back 429
was still sent, and pacing from it is the entire point.

*Alternative rejected:* keep the moment in module state beside `inFlight` in
`src/ui/monobank-sync.ts`. It would survive a run but not the app being killed — and being killed
mid-run is the normal case on this device, which is how the bug was found.

The per-link turn of D1 is a nullable `last_attempted_at` **column on `monobank_links`**, beside
`last_synced_at`. It belongs to the link — unlinking takes it, relinking starts it empty — but
unlike `last_synced_at` it does **not** travel in a бекап: `src/db/backup-repo.ts` names the link
columns it snapshots and restores one by one, so leaving it out of that list is the whole of the
work, and the бекап file's shape does not change at all. Same argument as the request pace: it is
what this phone last asked, and a restored phone has asked nothing. `src/backup/format.test.ts`
guards tables, not columns, so this needs its reason written into `format.ts`'s prose rather than a
new entry in `BACKUP_TABLES`.

Both schema edits land in one generated migration.

### D4. The pacing seam stays inside `paced()`, seeded from storage

`syncLinkedAccounts` initialises `lastRequestMs` from `ports.storage.lastRequestAtMs()` instead of
`undefined`, and calls `ports.storage.noteRequest(...)` where it already assigns `lastRequestMs`.
Every existing test that passes no stored moment behaves exactly as before.

The wait is clamped to the gap: `Math.min(gap, gap - since)` with `since` allowed to be negative.
A phone whose clock jumped forward a year would otherwise wait a year, which is `syncDue`'s
future-attempt argument applied to the same hazard.

`noteTurn` is written **inside** the paced call, after the gap has been waited out and immediately
before the request goes out, and `paced` re-checks `cancelled()` there and answers a `STOPPED`
sentinel instead of sending. The two go together: without the re-check the placement would be
untestable in-process — only the app dying during the wait would distinguish it — and «Зупинити»
pressed during a whole minute of waiting would still fire the request it was pressed to prevent.
With it, a run stopped during the gap spends no request, takes no turn, and reports the рахунок as
`cancelled`; the рахунок is exactly where it was in the next run's order.

Every one of these writes is wrapped, like `upsertAccounts` and `commitStatementAnswer` already
are, so an unwrapped throw cannot turn a storage hiccup into a sync that never starts — the exact
failure mode this change exists to remove. A refused write costs at most a repeated turn or an
unpaced first request; it never costs the run.

### D5. Coverage, not the newest moment, is what the screens read

One reducer answers both screens, beside `lastCompletedSyncMs` and exported like it:

```
syncCoverage(links) -> { linked, synced, oldestCompletedMs? }
```

`homeViewModel` does not receive links and should not start to: its `monobank` input is a reading,
not a table. The field `lastCompletedAtMs?` is therefore replaced by the reducer's own answer —
`monobank: { configured, linked, synced, oldestCompletedAtMs?, syncing, attempt? }` — computed by
`syncCoverage` at the one call site in `src/app/(tabs)/index.tsx` that computes
`lastCompletedSyncMs` today. That keeps the screen file free of rules, and it is what task 4.4's
anti-drift test asserts against: both lines read one reducer over one set of links.

`needsOwner` is fed from the same reading, and this is the decision the spec review found
unstated: its `lastCompletedAtMs` becomes `synced === linked ? oldestCompletedAtMs : undefined`.
A bank the app has never wholly heard from is stale by definition, so a failing run over the phone
in the bug report now raises «Дані monobank не оновлюються» instead of being silenced by the one
рахунок that did sync. `needsOwner` itself is unchanged — it already answers `undefined` for an
absent moment by calling it stale.

- `linked === 0` → neither screen shows a line (unchanged).
- `synced === 0` → «Синхронізації на цьому пристрої ще не було» / `NEVER_SYNCED_LINE` (unchanged).
- `synced < linked` → «Синхронізовано 3 з 9 рахунків», on both screens in the same words, with the
  noun fixed rather than taken from `accountCount` — see D6, which is the reason.
- `synced === linked` → the **oldest** completed moment, named by the monobank screen
  («Остання синхронізація — …») and aged by Головний («оновлено 3 хв тому»).

Oldest rather than newest because the line answers "how old is what I am looking at", and the
owner's money is the whole of it. With the ordering of D1 in place, a рахунок that keeps failing
now goes *first* in every run, so the oldest moment is also the number most likely to change when
the problem is fixed.

`lastCompletedSyncMs` is replaced rather than kept beside the new reducer. Its only caller was the
line this change rewrites, and «the most recent completed sync among the links» is not a question
any screen should be able to ask any more — leaving it exported would leave the misleading answer
one import away. The per-account moments the rows show are read from the links directly, as they
always were.

*Alternative rejected:* state the newest moment and put the coverage beside it. Two numbers on one
line, and the first one read is still the flattering one. The count replaces the date while it is
partial precisely so the flattering number is not available to misread.

### D6. The count says «рахунків», and `accountCount` is the wrong helper for it

`accountCount(n)` renders the **nominative** plural — «1 рахунок», «3 рахунки», «9 рахунків» — and
the line needs the **genitive**: after «з», the noun is genitive plural for every number, so it is
«з 2 рахунків» and «з 3 рахунків» as much as «з 9 рахунків». Using `accountCount` would produce
«Синхронізовано 1 з 3 рахунки», and no scenario written around 3-of-9 would ever catch it.

The line is therefore `Синхронізовано ${synced} з ${linked} рахунків`, with the noun fixed. Both
screen deltas carry a scenario with a linked count of three so the wrong helper cannot be
reintroduced without a test failing. The partial branch is only reachable with `linked >= 2`
— `synced === 0` is the never-synced line and `synced === linked` the moment — so no singular case
exists to get wrong.

## Risks / Trade-offs

- **[A рахунок the bank no longer shows can never complete, so the oldest moment freezes and the
  screens say «Синхронізовано 8 з 9» forever]** → That is the truth, and it is the answer the owner
  needs: a revoked or foreign monobank account is `unavailable` every run, and today the screen
  hides it behind eight fresher рахунки. The unlink is the owner's to make and the screen already
  offers it per account. Mitigation is honesty, not smoothing.
- **[Ordering by need means the run's first рахунок is the one most likely to fail — an
  invalid-token stops the whole run at its first account]** → Unchanged behaviour: a rejected token
  stops the run wherever it sits, and stopping on the first is strictly cheaper than stopping on
  the ninth. The outcome the owner is shown is the same word.
- **[A stored request moment makes the first sync after installing a бекап wait a minute]** → It
  does not: the moment is device-local and excluded from the бекап (persistence delta), so a fresh
  device has none and its first request goes out at once.
- **[One more SQLite write per request]** → One write a minute, against a database that already
  commits a whole statement answer per request. Immaterial.
- **[The count line loses the date while partial, so an owner mid-first-sync sees no moment at
  all]** → They see «Синхронізовано 3 з 9 рахунків», which is more than a date would tell them, and
  the per-account moments are on the monobank screen for anyone who wants them.

## Migration Plan

One generated migration, carrying both schema edits: the `monobank_request_pace` table and the
nullable `last_attempted_at` column on `monobank_links`. Nothing is rewritten, no column changes
type, no data moves, and every existing link reads back as one that has never had a turn.

`BACKUP_SCHEMA_VERSION` **does** change, to 19: `src/backup/format.test.ts` pins it to the number
of entries in the migration journal, so one new migration is one higher whatever the migration
contains. That is the tripwire working as designed — someone must open `format.ts` and decide.
The decision is: `monobank_request_pace` joins the enumerated exclusions beside
`monobank_sync_attempt`, `alerts` and `entry_defaults`; `last_attempted_at` needs no decision at
all, because `monobank_links` is already a backed-up table and the column belongs to the link
exactly as `last_synced_at` does.

Rollback is uninstalling: nothing outside the new table and the new column is touched.

The archive order is the one real deployment hazard and it is a task, not a footnote: the
main-screen requirement this change modifies, and the monobank-sync-screen requirement it removes,
both live in the unarchived `monobank-auto-sync`. See `tasks.md` §7.
