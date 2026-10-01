## Context

See proposal.md — Why. What shapes every decision below:

- **The engine is done and proven, and it already runs under a lock, a pace and an order.**
  `syncLinkedAccounts` (`src/monobank/coordinator.ts`) receives everything effectful as a port,
  commits a page the moment it is read, moves a рахунок's moment only when it completes, orders
  the links longest-waiting-first (`syncOrder`) and paces itself from the moment the *device* last
  sent a request. A run cut short at any point leaves cursors valid to resume from and an order
  that puts the never-asked рахунки first. That is exactly the shape a run of bounded length
  needs, and it exists; this change adds the bound and the trigger.
- **Why a foreground run freezes.** React Native on Android pauses every JS timer while the
  Activity is paused (`JavaTimerManager`: `isPaused && !isRunningTasks`). The coordinator's
  `wait` is a `setTimeout`, so the minute before the next request stops counting the moment the
  owner leaves and resumes when they return. A request already in flight still answers — native
  callbacks are not gated — and its page still commits. Nothing is corrupted; nothing progresses.
- **`expo-background-task` and `expo-task-manager` are already dependencies**, already in
  `app.json`'s plugins, already used by `src/platform/drive-backup-task.ts` for the daily бекап
  (`google-drive-backup` design D9). Three facts about them shape D1–D4:
  1. On Android the task service starts a `HeadlessJsTask` for the duration of a chance precisely
     so that JS timers keep firing while the app is backgrounded or headless
     (`TaskService.maybeStartHeadlessTask`). The coordinator's `setTimeout` wait therefore works
     inside a background run as it is.
  2. All registered tasks run on **one** WorkManager request. Its delay is the `minimumInterval` of
     whichever task registered most recently, the request is re-enqueued after every chance, and
     the worker skips a chance entirely while the app is in the foreground — it reschedules
     instead. Two tasks with two intervals would give whichever registered last its cadence, and
     the order tasks are restored in at launch is not one this app controls.
  3. WorkManager stops a worker that runs longer than ten minutes. The JS task is not killed with
     it, but a chance that overruns is a chance that ends in a retry loop rather than in a
     scheduled next one.
- **A headless start evaluates no route.** `expo-router/entry` registers the root component and
  nothing more; `src/app/_layout.tsx` — where `drive-backup-task.ts` is imported today — runs only
  when the root renders, which a WorkManager wake-up with no Activity never does. `TaskManager`
  then reports the task as not defined and unregisters it. The task definitions have to be reached
  from the bundle's entry, before expo-router.
- **`npm run verify` never touches a device.** Every decision here — is a run due, when a run
  yields, what a background run announces, where postponed ranks, when a request is given up — is
  a pure function or a port double, and the React and WorkManager sides are triggers and nothing
  else. That is the split `monobank-auto-sync` D3 and `google-drive-backup` D9 already use, for the
  same reason.
- **Words.** The fairness delta owns **turn** (хід): one request sent about a рахунок. What the
  phone grants is a **chance to run**, the phrase the Drive spec already uses, and the sync that
  starts on it is a **background run** (фоновий прогін). A foreground run that stops for the
  background **yields** (поступається) — not «hands over», which the glossary reserves for giving a
  file to another app. The outcome is **postponed** (перенесено) — not «відкладено», which is the
  glossary's «Saved».

## Goals / Non-Goals

**Goals:**

- Every chance the phone gives buys progress on the рахунок that has waited longest, ends inside
  the worker's limit, and leaves the next run a valid place to continue from.
- A run in front of the owner never holds the one-run lock while the app is in the background,
  and no request holds it indefinitely.
- The foreground behaviour — opening, the pull, «Синхронізувати», the quiet interval, the
  freshness line, «Потребує уваги» — is unchanged in every case that does not involve leaving the
  app.
- Everything decided is under `verify`; the device side is registration and two `defineTask`
  calls.

**Non-Goals:**

- Making the coordinator know about time budgets, foreground state, WorkManager or AppState. It
  gains one yes/no port and one outcome word.
- Any change to the Drive бекап's own rules. Its task file changes only where the shared worker
  forces it to (D2, D4).
- A native module of any kind. `expo-background-task` is already installed; nothing here needs a
  permission, a manifest entry or a rebuild trigger beyond the entry file.

## Decisions

### D1 — Chances come from `expo-background-task`, not from a foreground service

A WorkManager chance is the honest fit: the run already commits per page and resumes per cursor,
so a bounded run every quarter of an hour or so gives a picture that is fresh most of the time and
costs the phone nothing between runs. A foreground service would keep the app alive to make one
request a minute indefinitely, needs a persistent notification, and is the `dataSync` type Android
14/15 caps and kills — a service the owner would learn to resent. `AlarmManager` exact alarms
need a permission Android 14 refuses by default and buy nothing WorkManager does not.

The interval asked for is `BACKGROUND_TURN_INTERVAL_MINUTES = 15`, WorkManager's own floor. It is
a *minimum delay between chances*, not a schedule: Doze defers them to maintenance windows, App
Standby buckets stretch them to hours for an app opened rarely, Samsung's «sleeping apps» do
worse. None of that is under the app's control, so the app claims none of it — the screen says
«приблизно раз на чверть години, коли телефон це дозволяє» and no more (spec:
monobank-sync-screen). Exempting the app from battery optimisation is a system setting the owner
may set by hand; offering a shortcut to it is a possible later change, not this one.

### D2 — One worker, one interval: both tasks register with the same constant

Because every registered task shares one WorkManager request whose delay is the most recently
registered interval (Context, fact 2), the Drive бекап's `INTERVAL_MINUTES = 12 * 60` cannot
stand beside a 15-minute monobank task: which cadence the phone ends up on would depend on the
order the task manager restores tasks in at launch. So `src/platform/background-turn.ts` owns the
one interval and the one `reconcileTask(name, wanted)` that passes it, and both
`drive-backup-task.ts` and the new `monobank-sync-task.ts` reconcile through it — the rule made
unforgettable rather than restated in two files, since the two registrations were otherwise the
same twenty lines twice. The Drive task's `runBackup` asks `isBackupDue` before it makes a бекап
and answers `not-due` from one row read, so a chance every quarter of an hour costs it nothing and
changes nothing the `google-drive-backup` spec promises («at least once every 24 hours,
best-effort»). Its design D9 is annotated with this, not rewritten.

*Alternative rejected:* one app-level task that runs both jobs. Cleaner against the platform, but
it merges two jobs with two rules — «registered only while connected» and «registered only while a
рахунок is linked» — for no behavioural gain. Two definitions on one worker, sharing only the
registration mechanics, is the same thing with less churn: `syncDriveBackupTask` keeps its own name,
its own condition and its own prose, and loses only the copy of the interval it should never have
chosen for itself.

### D3 — The budget: eight minutes, expressed as a wait that gives up and a question the run asks

WorkManager's ten minutes are the worker's (Context, fact 3). A background run is given
`BACKGROUND_TURN_BUDGET_MS = 8 * 60_000`, measured from the chance's start, and the budget is
enforced where the run spends time — in the wait before a request — and nowhere else:

- `budgetedRun({ nowMs, setTimer, deadlineMs })` in `src/monobank/yielding.ts` (new, pure)
  answers a `wait` that declines to start a wait that would end past the deadline (it resolves at
  once and remembers that it gave up) and a `postponed` that answers yes once it has given up or
  the deadline has passed.
- The coordinator gains one optional port, `postponed?: () => boolean`, asked at every point
  `cancelled` is asked today — after each wait, before each request, at the top of each account
  and window — and a sixth `AccountOutcome`, `'postponed'`. A yes ends the run exactly as a
  cancellation does: no further request, no further turn, every remaining account given the
  outcome, and the account in progress reported the same way with whatever it had committed kept.
  `cancelled` is asked first, so the owner's decision wins when both would answer.

The two shapes of postponed the spec states fall out of where the question is asked. A рахунок the
run stops *before* its first request has had no `noteTurn` (that write sits inside the paced call,
after the wait) and no commit — nothing moved, place kept. A рахунок stopped *between windows* has
its turn and its committed pages, exactly as a cancelled one does today, and queues behind the
never-asked ones next run. Both are what the fairness order was designed for; the spec says both
so the screen cannot claim «nothing moved» about a рахунок whose cursor advanced.

Why not a `deadlineMs` inside the coordinator: expressing the budget as a property of the wait
port keeps the coordinator ignorant of clocks beyond the pacing it already does, and gives the
foreground case (D5) the same two ports with a different reason behind them. One mechanism, two
policies.

The last request a budgeted run sends goes out before the eighth minute and answers within the
request timeout (D8), so the worst case ends the chance with about a minute to spare. A run over
nine рахунки — `1 + 9` requests, about nine minutes — does not fit in one chance; it fits in two,
and the order guarantees the second starts where the first stopped. That is the case on the
owner's phone, and it is why `postponed` is a normal outcome rather than an error.

The number is WorkManager's. An iOS build gets a far shorter grant (`BGAppRefreshTask` allows
about thirty seconds; `BGProcessingTask` minutes, at night), so the constant lives behind
`Platform.select` in `background-turn.ts` with the Android value written and the iOS one left to
the change that builds for iOS — a budget too long there would simply be a run the system kills
mid-wait, which the cursors survive.

### D4 — The tasks are defined at the bundle's entry, and prepare storage themselves

A new `index.ts` at the project root becomes `package.json`'s `main`:

```
import './src/platform/monobank-sync-task';
import './src/platform/drive-backup-task';
import 'expo-router/entry';
```

Both task modules call `TaskManager.defineTask` at module scope, so a headless start defines
them before the task manager delivers the queued event (Context: a headless start evaluates no
route). `_layout.tsx` stops importing `drive-backup-task.ts` for its definition and keeps only the
registration call. `app.config.js`'s `BUILD_SOURCES` and `scripts/fingerprint.sh`'s `WATCH` gain
`index.ts`, for the reason both lists give: a file the bundle is made from must count towards
«брудне» and towards the verified fingerprint.

A headless start also runs no `useMigrations` and no `bindJournal`. `background-turn.ts` exports
`prepareBackgroundStorage()`, which both tasks await first: `migrate(db, migrations)` from
`drizzle-orm/expo-sqlite/migrator` — the same function `useMigrations` calls — and then
`bindJournal(reportingRepo)`, a no-op when the app is alive and what lets `raise`'s journal line
survive a chance on a dead process. This makes the task the one other caller of the migrator
beside the root layout, and `.claude/rules/database.md` is amended to name it. The two cannot
interleave: drizzle's expo-sqlite `migrate` awaits only while reading the migration files, then
calls the sync dialect's `migrate`, which runs every pending statement inside one `BEGIN … COMMIT`
without yielding the JS thread. Whichever caller gets there second reads the journal, finds
nothing pending and returns. It is also the only thing that makes a chance after an app update
safe before the owner has opened the new build.

*Alternative rejected:* keeping the definitions in `_layout.tsx` and accepting that a chance on a
dead process does nothing. That is the common case for a phone at night, and it is also the
state `drive-backup-task.ts` is in today — this change fixes both with one entry file.

### D5 — A foreground run yields: the wait ends when the app leaves the foreground

`foregroundRun({ setTimer, inForeground, onLeaveForeground })` in `yielding.ts` answers the same
two ports for a run in front of the owner: a `wait` that resolves when the timer fires *or* the
app leaves the foreground, whichever first, unsubscribing the other; and a `postponed` that is
«the app is not in front». `src/hooks/monobank-ports.ts` builds it over `setTimeout`,
`AppState.currentState === 'active'` and an `AppState` `change` subscription, so every foreground
run — the shell's, the pull's, the monobank screen's — yields the same way. The monobank screen's
own `cancelled` stays beside it and wins.

Why the wait has to end early rather than merely the question being asked: with timers paused,
a frozen `setTimeout` never resolves, so the run never reaches the point where it would ask. The
`AppState` event, unlike a timer, is delivered to a paused JS thread, and it is what wakes the
wait. A request already in flight answers through a native callback, which is not paused either,
and its page commits before the run asks and stops.

This reverses `monobank-auto-sync` D4 («a run is not cancelled when the app leaves the
foreground»), and the reason that decision gave — a first sync that would never finish — is
exactly what the background run now provides. What that decision protected, the committed pages
and the resumable cursor, is untouched: yielding is a stop between requests, never inside an
answer.

### D6 — `postponed` is a word of its own, and it ranks between `cancelled` and `complete`

Reusing `cancelled` would make the monobank screen say «скасовано» about a run nobody cancelled
and would make «the owner stopped it» indistinguishable from «the app went to the background» in
the remembered attempt. `postponed` carries what both need to know: nothing is wrong, the next run
continues. In `auto.ts` it joins `BY_URGENCY` after `cancelled` — neither needs the owner, and when
both appear in one run (a run the owner stops while it is also out of time) the owner's own
decision is the more informative word — and `needsOwner` answers nothing for it as it does for
`cancelled`. `syncFailed` on the screen excludes it beside `cancelled`, and `startSync` raises no
сповіщення for either: a run that stopped is not a run that failed. That last point tightens
today's `startSync`, which raises for anything but `complete` — a cancelled run the owner walked
away from posts one today — and the spec now says in two scenarios that it must not.

The owner's word for it is «перенесено» — «відкладено» is the глосарій's «Saved», the fourth
number of the місячна картина, and a result line saying «black ··1234: відкладено» in an app where
that word means «put into a банка» would be worse than no word.

`syncDue` gains the postponed rule: an attempt remembered as `postponed` is due at once. The
quiet interval exists to stop repeated openings spending the bank's budget on runs that have
nothing to do; a postponed run has, by definition, something left to do.

The follow-up — a background run that outlived the owner's return being finished at once by a
full one — is a second pure rule beside it, `followUpDue({ attempt, inForeground })` in
`auto.ts`: true only when the attempt the run just wrote is remembered as `postponed` *and* the
app is in front. The app shell subscribes to `onSyncState` and asks it when a run ends. It is
deliberately not «ask `syncDue` again»: `startSync` announces the end of every run, including
one that never reached the bank and withdrew its attempt, and on a phone with links and no token
— the state «Removing the token keeps imported history» leaves — `syncDue` over a withdrawn
attempt is true again, which would be a run that withdraws, announces, starts, withdraws, forever.
Deciding from the finished run's own outcome cannot loop: the follow-up runs in the foreground
without a budget, so it ends `complete`, failed, or — if the app left meanwhile — `postponed` with
the app not in front, and none of those is followed.

### D7 — One background run is a pure function over the same ports as every other trigger

`runBackgroundTurn(ports)` in `src/ui/monobank-background.ts` (new, pure, beside
`monobank-sync.ts`) does, in order: ask `syncDue` over the links and the remembered attempt;
build the budgeted ports from the chance's start — the budget and the clock are *inputs*
(`budgetMs`, `nowMs`), so this module never imports `background-turn.ts`, which reaches for
`react-native` and the migrator that `verify` may not load — and put them over the sync ports it
was handed, replacing whatever `wait` and `postponed` those carried: the device's `syncPorts()`
answers the foreground pair (D5), whose `postponed` in a headless process says yes at once, and a
task that forgot to replace it would end every background run postponed with nothing sent, which
no smoke without a token can see; call `startSync` with `alerts` absent and `attended: false`;
then decide what to announce from `needsOwner` over the attempt and the
whole-bank coverage (`syncCoverage(links)` — the same reading Головний decides its row from). When
the owner is needed it raises `monobank-sync` with `attended` answered by a port the task feeds
from `AppState` — the worker starts a chance only in the background, but the owner may open the
app inside the eight minutes, and a failure whose screen is in front raises none (glossary:
сповіщення про збій) — and only when the kind is not already outstanding: `raise` journals before
it decides, and a phone whose token stays rejected would otherwise write a журнал line every
quarter of an hour and flush the 500-entry журнал of everything a репорт needs within days. When
the run completed it clears. It returns a typed outcome (`not-due`, `already-running`, the run's
kind, or `ran` with the worst outcome and the count imported) that the task turns into
WorkManager's success or failure and into an `evaluateProgress()` when anything was imported.
`backgroundTurnsWanted({ links })` beside it is the one rule registration follows.

`startSync`'s own alerting is bypassed on purpose: its rule («a failure nobody is watching posts»)
is the rule for a run the *owner* started and walked away from. A run nobody asked for follows the
rule the main-screen capability already applies to the automatic foreground run — silence unless
monobank needs the owner — and the background run is that rule's second reader. Both readers call
the same `needsOwner`, so the row on Головний and the сповіщення in the shade can never disagree
about whether something is wrong.

### D8 — Every request has a timeout, so a hung one cannot hold the lock

`withRequestTimeout(fetch, { setTimer, timeoutMs })` in `yielding.ts` wraps an `AuthFetchLike`
so that a request not answered within `REQUEST_TIMEOUT_MS = 30_000` rejects; `fetchClientInfo`
and `fetchStatement` already turn a rejection into `unavailable`, so the run goes on to its next
account with the turn taken and nothing stored (spec: «A request that does not answer within the
timeout…»). `syncPorts()` applies it over the device `fetch` with an `AbortController`, so the
socket is released as well. React Native's Android client sets no timeout of its own, and a
request that never answers is a run that never ends: the one-run lock stays held, every later
start — every background run included — waits on it, and the worker dies at ten minutes and
retries into the same wait. Thirty seconds is generous for a 500-item page and short against the
eight-minute budget; the price, a slow-but-alive answer on a bad link ending `unavailable` and
costing that рахунок its place for one cycle, is the price the fairness order already charges any
failed turn.

### D9 — Registration follows the links, re-asserted rather than tracked

`syncMonobankSyncTask()` registers the task when `backgroundTurnsWanted` says so and unregisters
it otherwise, swallowing a device that refuses either. Both tasks reconcile through one
`reconcileTask(name, wanted)` in `background-turn.ts`, which is the only place the shared interval
is ever passed — D2's rule made unforgettable rather than restated in two files. It is called after
the migrations on launch, on every return to the foreground, and from the monobank screen whenever
the number of links changes. A registration that outlives the last link by one foreground costs one
chance that answers `not-due` — `syncDue` is asked first and a phone with nothing linked is never
due — and sends nothing.

### D10 — What the screen says, and what the documents say

The sync section of the monobank screen gains one sentence from `src/ui/monobank-screen.ts`
whenever a link exists, and the legend line at the foot of the screen names every outcome a
result line can carry — today it names four and omits «скасовано»; it gains that and
«перенесено». `docs/product-vision.md` §12 gains the owner's decision that the monobank sync runs
in the background best-effort, with the same no-clock-time honesty the бекап bullet already has;
`docs/glossary.md` gains the sync vocabulary the two earlier changes used without defining —
прогін, хід, тихий інтервал — and the words this change adds: фоновий прогін, поступитися and
перенесено; `docs/app-overview.md` §4.4 replaces «Нічого не працює у фоні» with what is now true;
`.claude/rules/android.md` names the two background capabilities that exist instead of the one it
names today; `.claude/rules/database.md` names the task as the one other caller of the migrator.

### D11 — Where a half-paged window is remembered: two columns beside the cursor

The cursor cannot carry it. `cursor_ms` means «everything before this is imported», and the
narrowing of a full window walks *backwards* from the window's end toward the cursor, so the
contiguous imported region grows downward from the top and no prefix from the cursor is
established until the last page. That is why `syncOneAccount` keeps the cursor still while a window
is being paged, and it is right — the mistake was keeping the *position* only in the run's own
memory, where a run that stops takes it with it.

So a new migration adds two nullable columns to `monobank_links`: the end of the window being
paged, and the end the next request should ask for — `continueWindow`'s own answer, written after
each full page and cleared when the window answers short. A run that finds them resumes that
window from the remembered request end instead of planning it afresh; a run that finds them absent
behaves exactly as it does today, which is what every existing row reads back as.

Two columns rather than one, because the two are different facts and the second cannot be derived.
The window's end is what the cursor moves to when the window finishes, and it is *not* the current
run's end: a later run reaches further, and committing its end would step over a slice no request
read. The request end is where paging got to. Storing only one of them would either lose the
resume point or lose the commit point.

They are operational state about this phone's own progress, so they stay out of a бекап for
`last_attempted_at`'s reason: a restored phone has read no pages and must not claim it stopped
halfway through one. A remembered window end at or below the cursor is discarded rather than
trusted — a boundary the owner moved, or a restore, can leave one behind, and the cheap answer is
to plan the window afresh.

*Alternative rejected:* narrowing the window forward instead — halving `[cursor, end]` until an
answer fits — which would advance the cursor with every page and need no stored state at all. It
also spends requests on windows that turn out still too large, and a request is a minute of the
bank's allowance. Backwards narrowing never wastes one; the state is the cheaper of the two.

### D12 — «Away» is the only answer the phone gives, so the rule is about cost, not about guessing

React Native's `AppState` on Android reports `active` and `background` and nothing between them —
`inactive` is documented in RN's own source as iOS-only, and `blur`/`focus` are events about window
focus, not a state a run can read when it asks. The Activity is paused by a system dialog and by
the owner leaving alike, and JS timers are paused with it either way, so a run that wanted to carry
on through a dialog could not: its wait would never resolve. There is nothing to distinguish and
nothing to be gained by distinguishing it.

What was worth fixing is the *cost* of the answer. Asked before every request, with requests a
minute apart, an eager yield turned an ordinary thirty-second visit into a run of about one
request — and, before D11, into a run that threw away a window's paging. D11 makes the yield cost
one request gap, which is what D5 claimed all along. The one rule added here is the cheap half:
`foregroundRun` answers no while the run has sent nothing, so a phone that says «away» at the
instant a run starts costs it one request instead of the whole run. That is a property of the port
and is proven over the fake foreground under `verify`; the mapping from `AppState` to «away» stays
one line in `src/hooks/monobank-ports.ts`, where there is nothing left to get wrong.

**What «has sent nothing» is read from, and where it stops being true.** The port sees two things
only, `wait` and `postponed`, so «a request has gone out» is read from the wait: the coordinator's
pace asks for one before every request but its first, *unless the device already owes the bank the
minute between requests* — `paced` seeds itself from `lastRequestAtMs()`, so a run started inside
that minute waits before its very first request too. The port cannot tell that wait from the others
and does not try, and the behaviour that falls out is the right one anyway: such a run has nothing
it may send. The wait it owes is the pace's, no timer will run it out with the app away, and a
request sent regardless comes back 429 rather than answered. So it stops having sent nothing, which
costs nothing — the request it did not spend is the one the run before it just spent, and that run
is why the minute is owed. The spec says this in as many words rather than leaving the port's rule
sounding broader than it is.

*Alternative rejected:* teaching the port about requests directly, by handing it the fetch to wrap
or giving the coordinator a port to announce them on. It would buy exactness in the one case where
exactness changes nothing — the run still may not send — at the price of a second thing for
`monobank-ports.ts` to wire and get wrong.

*Alternative rejected:* waiting out a short grace before believing «away». The grace would need a
timer, and the timers are exactly what Android has paused by then.

## Risks / Trade-offs

- **[The phone gives chances rarely — Doze, a low standby bucket, Samsung]** → The foreground
  triggers are untouched and every opening still syncs at once when due; the screen promises only
  «коли телефон це дозволяє». Whitelisting is the owner's to do and a later change's to offer.
- **[Nine рахунки do not fit one budget, so most background runs end postponed]** → That is the
  designed outcome, not a failure: the order continues where the run stopped, `postponed` needs
  nobody, and two chances cover all nine. The remembered attempt reads `postponed` most of the
  time on that phone, which is true.
- **[A chance on a dead process runs migrations before the owner has seen the new build]** → The
  same migrations `useMigrations` would run minutes later, through the same function; a failure
  there is the failure the launch screen would have shown, and the chance answers `Failed`.
- **[The Drive бекап is asked every quarter of an hour instead of twice a day]** → One row read
  and one pure function per chance when nothing is due; the upload rule is untouched.
- **[The worker limit is measured from the worker's start, the budget from the JS run's]** → The
  gap between them is the headless start itself, seconds on a cold process; eight of ten minutes
  leaves room for it and for the request timeout.
- **[A foreground run now stops when the owner glances at another app mid-sync]** → It stops
  between requests, the page in flight commits, and returning is `syncDue` over a `postponed`
  attempt: a full run starts at once. The cost is one request gap; the benefit is that the
  background is never blocked.
  *Corrected after the owner's phone, 2026-09-09.* The cost was one request gap only for a рахунок
  between windows. For one in the middle of a *paged* window it was the whole of that window's
  paging, because the position lived in the run's memory — so the рахунок that needed paging never
  finished at all, on any run, ever. D11 is what makes this bullet true as written. And the trigger
  was too eager besides: asked before every request, against «anything but active», with requests a
  minute apart, it turned every ordinary visit into a run of about one request. The spec now says
  what leaving the foreground means and that a run with nothing sent does not yield.
- **[`AppState` on Android reports `background` for a system dialog over the app]** → The run
  yields; returning starts a full one at once. Acceptable **once D11 holds** — before it, a рахунок
  half-way through a window lost its place instead of one request gap. Android offers no finer
  answer to tell «obscured» from «away» (D12), so the app does not pretend to: what it does instead
  is refuse to spend a whole run on the question (spec: «A run that has sent nothing does not
  yield»).
- **[A slow but honest answer is given up at thirty seconds]** → It ends `unavailable`, costs that
  рахунок one cycle of the order, and is retried; a rule that never gives up would cost every
  background run on the device instead.
- **[The task name is versioned (`cap1tal.monobank-sync.v1`) and the entry file is new]** → A
  build carrying this change registers on its first launch; a task registered by an older build
  does not exist, so there is nothing to migrate. Rollback is removing the registration: the
  worker stops when no task is registered.

## Migration Plan

One migration, for D11: two nullable columns on `monobank_links`, which every existing row reads
back as absent — a link that has never been left half-paged, which is true of all of them. No
backfill and nothing to undo.

Otherwise no migration. The attempt's `outcome` column already takes any string, and `postponed` is one more
word the reader knows. The entry file and the registration reach the phone with the next build;
the first launch of that build registers the task, and the first chance after that continues from
the cursors and the order the foreground runs left.

## Open Questions

None that change the specs, the approach or the tasks. Whether to offer a shortcut to the battery
optimisation setting, whether a Wi-Fi-only constraint is worth having, and the iOS budget are
later changes.
