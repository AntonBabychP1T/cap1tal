## Context

See proposal.md — Why. The constraints that shape the approach:

- The statement endpoint allows one request a minute per token; client-info is limited separately
  (the 2026-09-27 and 2026-09-30 репорти show client-info answered 200 twice within two seconds and
  seconds after a statement request). Nine linked рахунки therefore cost at least nine minutes to
  read fully, whatever the app does.
- A фоновий прогін never waits (`chanceRun`): JS timers stop with the Activity and Android 14+
  freezes a cached process, so a run that waits in the background holds the lock for as long as the
  phone sleeps. That stays.
- `expo-background-task` gives one WorkManager chain for both tasks at a 15-minute floor; Doze and
  App Standby defer it for hours on a phone that has not exempted the app. Its scheduler re-appends
  its own chain after every run (`APPEND`), so enqueuing its `BackgroundTaskWork` from elsewhere would
  grow that chain.
- The notification listener (`CaptureListenerService`) is already bound whenever the owner granted
  notification access, and today returns early for the monobank package.
- Four monobank changes are unarchived; this change modifies requirements two of them add and must
  archive after all four.

## Goals / Non-Goals

**Goals:** spend each прогін's one or two requests on the рахунок that actually moved; finish an
owner-asked refresh with the app closed; react to a purchase within about two minutes when the
phone allows; get the phone to deliver chances at all; stop one vanished рахунок from poisoning
every reading.

**Non-Goals:** a foreground service, exact alarms, a server or webhook, reading any monobank
notification content, a cadence shown to the owner, changing how statements are paged or mapped.

## Decisions

### D1. The balances decide who is read first; the flag lives on the link

`monobank_links.owed_since` (nullable `timestamp_ms`, migration `0006`) is the moment a link became
позачерговий. It is written in exactly three places in `src/db/monobank-repo.ts`:

- `upsertAccounts` — for each fetched account with a stored row whose `bank_balance_amount` differs,
  `UPDATE monobank_links SET owed_since = MAX(COALESCE(owed_since, :t), :t)` for that link, inside the
  same transaction. The **later** moment wins: keeping the earliest would let a sync that completes
  up to an older answer clear a movement a newer answer (the screen's) recorded. Being in the repo is what makes the monobank screen's own
  refresh count (spec scenario «The screen's own refresh is not lost»); comparing against the row
  before the overwrite needs no second stored balance.
- `insertLink` — `owed_since = cursorMs` (the boundary), so a fresh link needs no clock.
- `oweAll(at)` — new `SyncStorage` method, the same `MAX(...)` for every link, called by the
  coordinator at the start of an asked run (after the token read, before client-info).

`markSynced(id, at)` clears it in the same statement: `owed_since = CASE WHEN owed_since <= :at THEN
NULL ELSE owed_since END`. Integer millisecond comparison; no money is involved in the flag, and the
balance comparison is integer minor units of one currency (the currency guard in `upsertAccounts`
already runs first).

*Alternative rejected:* a second stored balance «at last complete» compared on each run — needs the
same column count, and loses the screen's refresh unless every writer compares too. *Rejected:*
treating «never synced» as позачерговий — a link whose statement always fails would head every run
(the starvation `monobank-sync-fairness` removed).

### D2. Three groups; order taken after client-info; priority ends at the turn

`priorityOf(link, nowMs)` (pure, `src/monobank/sync.ts`): `0` when `owedSinceMs` is set and the last
turn is before it (or none); `1` when **overdue** — no turn for `TURN_OVERDUE_MS` (3 h) or never;
`2` otherwise. `syncOrder(links, nowMs)` sorts by group, then the existing turn rule. `OrderableLink`
gains an optional `owedSinceMs` and `nowMs` is optional, so every existing caller and test keeps its
meaning. `syncLinkedAccounts` keeps its first `listLinks()` for the empty check and `usableAccounts`,
and computes the order from a second `listLinks()` after the client-info step, so an answer this run
fetched has already marked what moved. Still one order per run.

The overdue group is the starvation bound the review asked for: a chance has one statement request,
and a card that moves before every chance would otherwise take all of them. With chances ~15 min
apart the turn rule reaches nine рахунки every ~2¼ h, so overdue is rare on a phone that delivers
chances — and when it does not, overdue is what turns the first chance after a long gap into a
catch-up chain (D5). Three hours is also «інші рахунки трошки рідше, але актуальні» in the owner's
words.

### D3. Межа свіжості is one minute; client-info stays unpaced

`CLIENT_INFO_FRESH_MS = 60_000`. A background chance (≥ 15 min apart) and a дочитування (≥ 1 min
apart) therefore always refetch; two runs inside a minute share one answer. The `unpaced` path is
unchanged. The cadence spec's sentence about a single allowance contradicted the code since the
2026-09-27 fix; the MODIFIED requirement states what the code does.

### D4. Set-aside рахунки: a reason, one filter, one helper

- The coordinator decides «token no longer shows it» first in the loop, before the stop checks, and
  finishes with reason `not-shown` (`AccountResult.reason` widens to `UnavailableReason |
  'not-shown'`); so a set-aside рахунок is never `postponed` and never keeps a chain going. The
  журнал already records a reason as its own entry.
- `worstOutcome` (the one reducer every caller uses: `startSync`, `syncEnding`, the background
  announce, the screen) ignores `not-shown` results unless every result is one.
- `shownLinks(links, rememberedAccounts)` (pure, `sync.ts`): links named by the newest stored answer
  (same «newest moment» reading as `usableAccounts`, without the freshness bound); all links when
  no answer is stored or the answer names none of them. `syncCoverage` callers (Головний,
  monobank screen, background announce) pass `shownLinks(...)`; `monobankAccountRows` marks a
  linked row `notShown`. The ADDED set-aside requirement states its precedence over the «every
  linked рахунок» wording in the unarchived freshness requirements rather than MODIFYing each of
  them; the main-screen delta repeats it for Головний.

### D5. Дочитування: a pure decision, a port, and a native one-off worker

- Pure (`src/monobank/auto.ts`): `continuationDelayMs({ accounts, links, inForeground,
  lastRequestAtMs, nowMs, gapMs })` → `undefined` unless some result is `postponed` for a link in
  group 0 or 1 (D2) and `inForeground` is false; otherwise `max(gap − since, 0) + 2 s`, at least
  5 s. Priority rather than «owed» bounds the chain: each рахунок gets at most one
  continuation-driven turn (the turn ends its priority), so a failing or many-paged рахунок falls
  back to the ordinary chances.
- Due-ness: `runBackgroundTurn` is due when `syncDue` says so **or** a shown link is in group 0/1.
  That is what keeps a chain alive past a рахунок that failed mid-chain (the remembered outcome is
  then `unavailable`, which `syncDue` alone would hold for the тихий інтервал).
- The журнал gets a `native` entry `background-continuation` with the delay each time one is asked
  for, so the owner's репорт shows a chain apart from the periodic chances.
- `SyncPorts` gains optional `continueLater(delayMs)` and `inForeground()`; `startSync` asks the
  decision after every run that reached the bank and calls `continueLater` when it answers. Every
  device run gets them from `syncPorts()`; tests pass fakes.
- Port `src/platform/background-sync.ts` (`continueLater`, `nudgedAtMs`, `setNudgesWanted`,
  `restriction`, `openRestrictionFix`), adapter `background-sync-device.ts` over a new Expo module
  `BackgroundSync`; on a platform without it every call is a no-op / `unsupported`.
- Native (`modules/notification-capture`, second module class `BackgroundSyncModule`, listed in
  `expo-module.config.json`): `SyncContinuation.schedule(context, delayMs)` — `synchronized`; if
  WorkManager holds an `ENQUEUED`/`BLOCKED` work tagged `cap1tal.monobank-continuation`, nothing;
  else enqueue a `OneTimeWorkRequest<SyncContinuationWork>` with that initial delay, a
  `CONNECTED` network constraint and the tag. `SyncContinuationWork` (a `CoroutineWorker`) asks
  `TaskServiceProviderHelper.getTaskServiceImpl(ctx).getTaskConsumers(packageName)` for the
  `BackgroundTaskConsumer`s and calls `executeTask` on each, awaiting their callbacks (bounded at
  nine minutes), then returns success. It never schedules itself: the next link is JS's decision.
  Both registered tasks run, exactly as on a periodic chance; each already decides «not due» for
  itself. Gradle deps: `androidx.work:work-runtime-ktx:2.9.1` (the version `expo-background-task`
  resolves) and `host.exp.exponent:expo.modules.backgroundtask:<installed version>` — SDK 57 links
  Expo modules as the prebuilt publications in their `local-maven-repo`, so `project(':…')` does not
  resolve.

*Alternatives rejected:* enqueuing `expo-background-task`'s own `BackgroundTaskWork` (re-appends
its periodic chain on every run); JS timers or a native sleep inside a chance (frozen process, lock
held); a foreground service (a permanent notification for a money tracker, and Android 14+
foreground-service type rules).

### D6. Поштовх

`CaptureListenerService.onNotificationPosted`: before the watched-set check, a package starting
with `MONOBANK_PACKAGE_PREFIX` goes to `NudgeRule.route(flags)` — a pure Kotlin object with a JVM
unit test — and returns without touching `extras`. `route` answers `ignore` for
`FLAG_ONGOING_EVENT`, `FLAG_FOREGROUND_SERVICE` and `FLAG_GROUP_SUMMARY`, `nudge` otherwise.
`SyncContinuation.nudge(context, sbn.postTime)` does nothing unless the `nudges_wanted` flag
(SharedPreferences, written by JS through `setNudgesWanted` from `syncMonobankSyncTask` — whenever
links change and on every foreground, the same re-asserted rule as the periodic registration) is
set; otherwise it writes `nudged_at_ms` and schedules with a 65 s delay on a background thread
(WorkManager's `get()` must not block the listener's main thread). The dedup of D5 makes a burst one
дочитування and bounds a chatty monobank app to about one прогін a minute.

JS: `syncDue` gains optional `nudgedAtMs`; due when it is after `attemptedAtMs`.
`runBackgroundTurn` reads it through a new optional port `nudgedAtMs()`. A поштовх whose дочитування
finds another run going on is not retried: that run, or the next chance or opening, reads the
balances (межа свіжості a minute) and so still finds what moved.

### D7. Battery optimisation

`BackgroundSyncModule.restriction()` → `restricted` when `ActivityManager.isBackgroundRestricted()`
(API 28+), `optimised` when `!PowerManager.isIgnoringBatteryOptimizations(pkg)`, else `allowed`.
`openRestrictionFix()` starts `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` with `package:` data
for `optimised` (falling back to `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` if unresolvable) and
`ACTION_APPLICATION_DETAILS_SETTINGS` for `restricted`. The permission
`android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is declared in `app.json`
`android.permissions`, as `.claude/rules/android.md` requires; its reason is recorded in that rule
file, since JSON carries no comment. Exemption puts the app in the power allowlist, which exempts its jobs from Doze deferral and
App Standby buckets; on One UI it is shown as «Необмежено». The words for each reading and the
decision of what to offer live in `src/ui/monobank-screen.ts` (pure); the screen re-reads on focus
and on return to the foreground.

### D8. Rules and vision

`.claude/rules/android.md` names two background capabilities and «one worker, one interval». The
owner asked on 2026-09-30 for the app to be woken as often as it takes («якщо потрібно пробуджувати
застосунок у фоні, то зробити цей дозвіл»), so the rule gains: the one-off дочитування worker
(`SyncContinuationWork`, never periodic, never more than one pending), the поштовх as the one use of
notification access for monobank, and the battery-optimisation permission — still no foreground
service and no exact alarm. `docs/product-vision.md` §12 is updated the same way: a chance still
never waits and sends about one statement request, the balances go first, and the app itself asks
the phone for a дочитування — never a timer of its own.

### D9. Label

«Оновити з monobank» → «Оновити список рахунків»: the label moves into `src/ui/monobank-screen.ts`
(`REFRESH_LIST_LABEL`, tested there) and `src/app/manage/monobank.tsx` reads it; the not-configured
sentence follows.

## Risks / Trade-offs

- [A net-zero pair (a hold and its reversal) leaves the balance unchanged, so nothing is
  позачерговий] → the ordinary turn still reads every рахунок; with chances every ~15 min that is
  every ~2 h for nine рахунки. The cursor never moves without a read, so nothing is lost.
- [`executeTask` on the consumer is `expo-background-task`'s public Kotlin API, not a documented JS
  one] → pinned SDK; a failure to find the service or consumers returns success and changes nothing,
  so the periodic chain still works. Re-check `BackgroundTaskConsumer.executeTask` and
  `TaskServiceProviderHelper.getTaskServiceImpl` on the next Expo SDK upgrade, beside the
  `expo-task-manager` patch `android.md` already lists.
- [Every дочитування also runs the бекап task] → it is registered only while Drive is connected and
  decides «not due» itself (daily); the cost is one quick JS call per дочитування.
- [More client-info requests (one per прогін)] → one small request per chance; the bank limits it
  separately; a refused client-info ends the прогін as before and the next one retries.
- [The exemption is a Play policy-sensitive permission] → the app is sideloaded for one owner; the
  request is the system's own dialog and only offered, never forced.
- [A phone that never grants the exemption] → still gets poштовх and дочитування (WorkManager one-off
  work is also deferred by Doze, but far less than the periodic chain in practice) and the screen
  says why sync may lag.
- [Monobank posts non-transaction notifications] → each costs at most one дочитування of two small
  requests; the balances decide whether anything is read.

## Migration Plan

`npm run db:generate` produces `0006` adding `owed_since` (nullable, no default); existing links read
back not позачергові and become so at the next client-info answer that shows movement. The бекап
names its link columns explicitly, so nothing changes there. Needs a new dev build
(`expo run:android`) for the native module; a JS-only update keeps working without it because every
native call is optional. Rollback: the column is ignored by older code.
