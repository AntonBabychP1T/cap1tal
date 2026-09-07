## Why

On a phone with nine приєднані рахунки monobank, sync imported nothing for days while both
Головний and the monobank screen said it had just synced. The owner reported it as «не працює
синхронізація… пише синхронізовано, але останні дані з 2 числа». Three defects compound into that:

1. **The tail starves.** A run walks the links in one fixed order — `monobankAccountId`, ascending —
   and an already-synced рахунок still costs a full paced request, because its cursor is behind the
   new run's end. monobank allows one request a minute, so nine рахунки need about nine minutes of
   the app being open. Any run cut short before that redoes the same prefix next time, so the
   рахунки at the end of that fixed order are never reached at all. They are not slow: they are
   unreachable.
2. **The screens say a sync happened that mostly did not.** Both screens read the *most recent*
   completed sync among the links, so one рахунок of nine finishing makes Головний say «оновлено
   3 хв тому» and the monobank screen «Остання синхронізація — сьогодні о 20:34» while eight
   рахунки have never synced once. The owner is told their picture is fresh when it is empty.
3. **The pace does not survive a run.** The minute between requests is a variable inside one run,
   so a run started seconds after the previous one ended — a pull-to-refresh right after a sync
   finishes — fires immediately, gets 429, and is remembered as rate-limited on every рахунок of
   it. A failure the app caused itself.

This is the vision's first problem — «куди пішли гроші» — failing at its root: money that never
arrives in the app cannot be attributed to anything.

## What Changes

- **Sync order becomes fairness, not the alphabet.** A run gives each рахунок a *turn* — one
  request sent about it — in order of how long it has been since its last one: never-turned first,
  then oldest turn, with the monobank account identifier only as the tie-break. A turn counts
  whether or not the рахунок completed, so a рахунок that cannot complete costs one request per
  cycle instead of heading every run for good. A run repeatedly cut short then reaches all of them
  over time instead of looping on a prefix.
- **Both screens state coverage while it is partial.** While some linked рахунки have never
  completed a sync, the screens say so — «Синхронізовано 3 з 9 рахунків» — instead of dating the
  one that did. Once every linked рахунок has synced, the moment they state is the **oldest**
  completed one, which is the age of the owner's whole picture rather than of its freshest corner.
  «Синхронізації на цьому пристрої ще не було» is unchanged for a device where none has.
- **The request pace is remembered across runs.** The device stores the moment of the last request
  it actually sent to the personal API, and a run's *first* request waits out the gap against it
  exactly as its later ones do.
- **Not in scope, deliberately:** making a run survive the app being backgrounded. Nine minutes of
  foreground is still nine minutes; what this change guarantees is that every one of those minutes
  buys progress on a рахунок that needed it, and that the screens stop lying about the rest. A
  background run is a native concern and a separate change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `monobank-sync`: a run's order over the linked рахунки becomes a requirement (longest since its
  turn first) rather than an unstated implementation detail; the minimum gap between requests is
  required to hold across runs, not only within one, and remembering that gap may never fail a run.
- `monobank-sync-screen`: the screen's own last-sync line states coverage while it is partial, and
  the oldest completed moment rather than the most recent once it is not.
- `main-screen`: Головний's freshness line follows the same rule in shorter words. **This
  requirement lives in the unarchived change `monobank-auto-sync`, not in
  `openspec/specs/main-screen/spec.md` — see the archive-order task.**
- `persistence`: the remembered moment of the last personal-API request — device-local operational
  state that a бекап neither carries nor restores, like the sync attempt and the alerts — and the
  moment each link last had a turn, which belongs to the link, goes when it is unlinked, and stays
  out of the бекап for the same reason.

## Impact

- `src/monobank/coordinator.ts` — the link order and the pacing seam; three additions to
  `SyncStorage`.
- `src/ui/monobank-screen.ts`, `src/ui/home-screen.ts` — the two lines, the shared reducer behind
  them (`lastCompletedSyncMs` gains a sibling that answers coverage), and the moment «Потребує
  уваги» decides the monobank row from.
- `src/app/(tabs)/index.tsx`, `src/app/manage/monobank.tsx` — render whatever the view models now
  say; no logic of their own.
- `src/db/schema.ts` + one new migration under `drizzle/`, `src/db/monobank-repo.ts` — the stored
  request moment and each link's turn.
- `src/backup/format.ts` / its test — the new table joins the enumerated exclusions, and
  `BACKUP_SCHEMA_VERSION` goes to 19 because one migration was added.
- No change to what is imported, how an item maps, or the cursor rule: a рахунок's money is
  untouched by all of this.
