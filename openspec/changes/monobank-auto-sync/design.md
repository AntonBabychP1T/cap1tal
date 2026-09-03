## Context

See proposal.md — Why. The engine is done and nothing calls it. What this design has to place is a
trigger, one lock, one remembered moment and two readings on Головний, on top of code that already
works and must not be touched.

Three constraints shape everything below.

- **monobank allows one request a minute.** `coordinator.ts` paces itself to `MIN_REQUEST_GAP_MS`,
  so a run costs `1 + links` requests and about that many minutes of wall clock. Anything that
  starts runs must be rarer than that, and two runs must never overlap.
- **`npm run verify` never touches a device.** Every decision here — is a run due, what did the run
  mean, what does the line say — is a pure function in `src/monobank/` or `src/ui/`, and the React
  side is the trigger and nothing else. That is the same split `notification-drain.ts` uses, and it
  exists for the same reason: the ordering *is* the rule.
- **The pieces already exist.** `monobank_links.last_synced_at` is written by `markSynced` for a
  completed account only, `momentLabel` already turns a moment into Ukrainian, `useOnForeground`
  already gives the open-and-return signal, and `decideAlert` already knows that a failure the
  owner is looking at raises nothing.

## Goals / Non-Goals

**Goals:**

- One place that starts a monobank sync, whoever asked, with one lock around it.
- A decision about *when* and a decision about *what it meant*, both pure and both tested without a
  clock, a network or an emulator.
- The freshness of the bank data readable on Головний in the same words for the same moment the
  monobank screen uses.

**Non-Goals:**

- Any change inside `coordinator.ts`, `api.ts`, `sync.ts` or `link.ts`. This change calls them.
- Any work while the app is closed (see the proposal's non-goals).
- Any change to what the monobank screen shows about a run the owner started there.

## Decisions

### D1 — The cadence is a pure function, and its interval is 15 minutes

`src/monobank/auto.ts` (new, pure) answers three questions and holds no state:

- `syncDue({ links, attemptedAtMs, nowMs })` — whether a run the owner did not ask for
  may start;
- `worstOutcome(results)` — the one outcome a finished run is remembered as;
- `needsOwner({ attempt, lastCompletedAtMs, nowMs })` — whether monobank needs the owner, and in
  what words.

Fifteen minutes for the interval, and the arithmetic is the argument: a two-account owner spends
three requests and roughly three minutes per run, so a quarter of an hour keeps the API budget at
about a fifth of what monobank allows even for an owner who opens the app constantly, while
`оновлено 3 хв тому` stays true for most of the day.

*Alternatives.* A run on every open — rejected outright: two openings a minute apart would each
fire a client-info request, and the second run would collide with the first (D3 would refuse it,
so the owner would simply get nothing). An hour — rejected: it satisfies «повернувся після кількох
годин» and fails «відкрив застосунок», which is the case this change exists for; the coffee bought
at 9:10 would not be on the screen at 9:40.

The interval is one exported constant with this paragraph above it, not a setting. A setting would
be a screen, a stored value, a backup field and a migration for a number the owner has no way to
choose well.

### D2 — The attempt is stored, and its moment is written before the run, not after

One new single-row table, the shape `daily_reminder` and `entry_defaults` already use:
`monobank_sync_attempt` with a text `id` fixed to `'attempt'` by a CHECK, `attempted_at` and a
nullable `outcome`. New migration, generated with `npm run db:generate`; committed migrations are
immutable (`rules/database.md`).

Adding it trips `BACKUP_SCHEMA_VERSION` (`src/backup/format.ts:35`), which `format.test.ts` holds
equal to the number of committed migrations precisely so that a new table forces this question to
be answered: the attempt does **not** go in the бекап. It is what one phone last tried and how it
went — the same class as `alerts` and `entry_defaults`, both already excluded — and an attempt
carried in from another device would make this one skip a sync it never made or claim a failure it
never had. So the constant goes to 14 and `monobank_sync_attempt` joins the enumerated exclusions
in `format.test.ts`.

Not a column on `monobank_links`: the attempt is a fact about the *run*, and a run that failed on
its single client-info request touched no link at all — there would be nowhere to write it.

The moment goes in when the run starts and the outcome when it ends, which is the whole reason the
column is nullable. Force-closing an app that feels slow is exactly what an owner does, and a
moment written only on success would let ten force-closes fire ten client-info requests into a
one-per-minute API. Writing the moment first costs one lost run in the rare case the phone dies
mid-sync; writing it last costs a rate-limit on a bad afternoon.

*Alternative considered:* keeping the attempt in module memory only. Rejected for exactly the case
above — a cold start would forget it, and cold starts are the common case.

### D3 — One lock, in a module, not in React

`src/ui/monobank-sync.ts` (new) owns the only entry point that starts a run — `startSync(ports)` —
and the module-level promise that says one is going on, plus a listener set so a finished
run tells whoever is on screen to re-read. That is `notification-drain.ts`'s exact shape
(`onCapturesStored`), and it is a module rather than React state because the three callers live in
three different trees — the root layout, Головний, the monobank screen — and the thing being
guarded is one device's one API budget, of which there is exactly one.

There is no `force` flag, because there is nothing to force: `startSync` never consults the quiet
interval at all. `syncDue` is asked by the *trigger* — the app shell, which is the only caller that
did not have the owner ask — and the pull and «Синхронізувати» simply do not ask it.

A refused start returns «a run is already going on» as a value rather than throwing, so the pull on
Головний can simply await the run in flight and the monobank screen can say so in its status line.
It reports without a run when the run in flight failed outright: a refused start must not inherit
somebody else's rejection.

The listeners fire on **start as well as on finish**, and the module exposes whether a run is going
on as a plain getter. A finish-only signal would leave both screens unable to keep the promise
their specs make: a run begun by the foreground trigger while Головний or the monobank screen is
already open would say nothing at all until it ended, so «синхронізація…» would never appear on
the screen the owner is looking at.

### D4 — A run is not cancelled when the app leaves the foreground

The coordinator's `cancelled` port stays unused by the automatic run. Pages commit as they are read
and `markSynced` fires only for an account that completed, so a run the OS suspends either resumes
and finishes or leaves a cursor that is valid to resume from — the engine's own guarantee, not a
new one. Cancelling on background would mean a three-account first sync, which needs four minutes,
never finishing at all.

The monobank screen keeps cancelling the run *it* started when the owner leaves that screen: that
is the owner's decision about a run they are watching, and it goes through the same lock either
way.

### D5 — The automatic run raises no сповіщення про збій, and says so honestly

`raise('monobank-sync', { attended: true }, …)` — passed unconditionally, and it is a fact rather
than a guess: this run exists *because* the app was opened or foregrounded, so the owner is in the
app by construction. `decideAlert` then posts nothing and records nothing outstanding, which is
already its defined behaviour for an attended failure.

The automatic run does **not** call `journal.failure`, though the manual one on the monobank screen
still does. The журнал's requirement (`openspec/specs/bug-report/spec.md`) records "every action
that failed with the text the owner was shown", and a silent run showed them nothing — writing
`syncSummary(…).headline` there would be journaling text that was never on screen. Nothing is lost:
`raise` journals `('alert', kind)` before it decides anything, so a репорт still carries that the
sync failed and when.

Success clears, as it does everywhere else: a completed automatic run calls `clearAlert`, so a
сповіщення left standing by a failure the owner *was* away for does not outlive the sync that
fixed it (`reminders-and-alerts`: "cleared when that same action next succeeds").

The manual run on the monobank screen keeps raising the alert unchanged — it is the one that can
outlive the owner's attention.

### D6 — What counts as needing the owner: at once for a token, a day for everything else

`invalid-token` is the only outcome the owner alone can fix, and until they do, every later run
fails identically — so it goes into «Потребує уваги» on the spot. Every other failure is a phone in
a lift, and a row that appears whenever the metro does would train the owner to ignore the section
that also holds their чернетки. So the rest is time-based: nothing until no linked рахунок has
completed a sync for 24 hours, at which point «the data is old and the app cannot refresh it» is
worth a row regardless of whose fault it is.

An attempt with no outcome (a run going on, or one the phone did not survive) needs nobody: nothing
is known about it yet.

*Alternative:* a row on every failure. Rejected as noise. *Alternative:* never a row, only the
freshness line growing old. Rejected because an owner whose token expired would simply stop seeing
money with no idea why — the line would say «оновлено 3 дні тому» and nothing would say what to do.

### D7 — «оновлено 3 хв тому» is a new label beside `momentLabel`, and delegates to it

`freshnessLabel(ms, now)` in `src/ui/dates.ts`: «щойно» under a minute, `N хв тому` under an hour,
`N год тому` under a day, and `momentLabel`'s own words beyond that.

The two screens do say the same moment differently under a day — Головний «23 год тому», the
monobank screen «вчора о 09:00» — and that is the intended split, not an oversight. Головний
answers "is what I am looking at current", where an age is the answer; the monobank screen answers
"when did each рахунок last sync", where the moment is. Past a day the age stops being useful and
both fall through to the same `momentLabel` words, so they converge exactly where it matters.

The abbreviations are deliberate. `plural()` exists in `labels.ts` and would give «3 хвилини» /
«5 хвилин» correctly, but the owner wrote «3 хв» themselves, the abbreviation is what a status line
wants, and it keeps three grammatical forms out of a string that appears on the busiest screen.

### D8 — Головний reads what it already reads

The freshness line and the attention row need `monobank.listLinks()` (which already carries
`lastSyncedAtMs`) and the one attempt row. Both are read in the same `useReloadOnFocus` block
Головний already has, and both are handed to `homeViewModel`, which gains a `monobank` field
holding the line and the optional attention row — computed by the same pure functions `verify`
tests, not in JSX.

The pull is a `RefreshControl`, the app's first one, and the ScrollView it needs belongs to the
shared `Screen` component (`src/components/surfaces.tsx`) rather than to Головний. `Screen`
therefore gains one optional `refreshControl` prop, passed straight through and absent everywhere
else — the narrowest change that reaches the right ScrollView, and it leaves every other screen's
rendering identical.

`refreshing` is the shared run's promise being pending, so a pull with nothing to sync re-reads
storage and resolves at once, and a pull during a run in flight simply awaits that run.

### D9 — Sequencing against the changes already in flight

«Потребує уваги» is defined by `home-daily-overview` (17/20) and does not exist in the main specs
yet. This change adds a row to that section and touches the same view model and the same screen
file, so it is implemented after `home-daily-overview` archives and never in the same auto-work
wave. `shortlist-pickers` touches the entry form and not Головний's own body, so it does not
conflict.

### D10 — Who decides there is nothing to sync, and the attempt that is withdrawn

`syncLinkedAccounts` reads the token store and lists the links itself, and answers `not-configured`,
`no-links` or `storage-unavailable` before it sends anything. Duplicating those two reads in
`startSync` just to decide whether to record an attempt would put the "is monobank usable" question
in two places, and the secure-storage read in one more.

So `startSync` records the attempt's moment optimistically and **withdraws it** when the run comes
back as one of those three kinds — nothing was tried, so nothing should be remembered as tried and
the next opening must not wait out an interval. Every other kind (`ran`, whatever its accounts did)
keeps the moment and gains its outcome. One extra write on the rare path, one source of truth about
what monobank can do, and `coordinator.ts` untouched.

`syncDue` therefore takes `links` and not `configured`: the token question is answered once, inside
the run. Головний needs its own answer to decide whether to draw a freshness line at all, and reads
the token store directly for it — a reading, not a gate.

The one cost, accepted: on a device with links whose token was removed, every opening claims the
lock and announces a run for as long as a secure-store read takes, so the monobank screen flickers
«Синхронізація вже триває». The alternative is reading the secret twice on every open, which is a
worse trade for a state that only exists between removing a token and unlinking the рахунки.

## Risks / Trade-offs

- **A run in flight when the phone kills the app** → the cursor is committed per page and the
  attempt's moment is already written (D2), so nothing is lost and no request storm follows; the
  cost is one attempt remembered with no outcome until the next run.
- **A four-minute run behind a pull-to-refresh spinner** → the freshness line says a sync is going
  on for as long as it is (spec: main-screen), so the spinner is not the only thing the owner has;
  the pull's own indicator ends when the run does.
- **A first sync started automatically can be very long** — a linked рахунок whose boundary is
  months back plans many windows at a minute apiece. It is the same run the manual button starts
  today, it commits page by page, and every following run is short. Not mitigated further:
  shortening it would mean changing the engine, which is out of scope.
- **A run withdrawn after its moment was written** (D10) → the window between the two writes is one
  token read; an app killed inside it leaves an attempt with no outcome, which needs nobody (spec)
  and costs at most one skipped interval.
- **A clock corrected backwards** → an attempt dated in the future reads as due rather than as
  never due (`auto.ts`), so a wrong clock costs one extra run and heals itself on the next
  `beginAttempt`, instead of disabling automatic sync until the phone catches up.
- **The interval is a guess about one owner's habits** → it is one constant in one pure module with
  its arithmetic written above it, so moving it is an edit and a test, not a redesign.
- **`RefreshControl` is new to this app** → it is React Native's own component on a ScrollView that
  already exists; nothing about it is testable under `verify`, so the smoke run on the emulator is
  where the pull is actually seen to work (CLAUDE.md step 6).

## Migration Plan

One new migration adding `monobank_sync_attempt`, generated with `npm run db:generate` and applied
by the existing `useMigrations` call. It adds a table and alters nothing, so a database holding
рахунки, транзакції, links, imported ids and last-sync moments passes through it untouched — which
is what the persistence delta's migration scenario asserts. There is no rollback: committed
migrations are immutable, and reverting the feature means the table is simply not read.
