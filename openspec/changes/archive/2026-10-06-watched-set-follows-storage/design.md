## Context

See proposal.md — Why. What matters here is the shape of the seam as it stands.

`NotificationCapturePort.setWatched` takes the whole set every time, never a delta, and answers
with one of three typed outcomes: `ok`, `refused` naming the monobank packages, or `unavailable`.
Its two callers today are `addWatchedApp` and `removeWatchedApp` in `src/ui/notification-settings.ts`,
which tell the device first and write the row only on `ok` — the order that keeps the screen and the
device agreeing whenever the owner is the one changing things.

`drainCaptures` in `src/ui/notification-drain.ts` already holds the other half of the seam and
already reads the stored watches: it needs them to decide each captured notification. It runs on
exactly the two triggers the requirement names — the app opening and returning to the foreground —
behind one `draining` guard in `src/app/_layout.tsx`, and `verify` proves it against
`inMemoryNotificationCapture` and a real SQLite database.

`restore` in `src/db/backup-repo.ts` writes `notification_watches` inside the one transaction that
replaces everything, knows nothing of any port, and is a pure storage function by design.

## Goals / Non-Goals

**Goals:**

- The set the capture layer applies equals the packages the stored watches name, from the first
  collection after anything writes those rows behind the screen's back.
- Nothing new can make a collection fail. The reconciliation is additive to a loop whose ordering
  is its whole safety property.
- Provable under `npm run verify`, with no device and no native module — as everything in
  `src/ui/` is.

**Non-Goals:**

- Reconciling in the other direction. The device is told a set, never asked for one; the port has
  no reader and gains none here.
- Any memory of what the device was last told. See the second decision.

## Decisions

**The reconciliation lives at the start of the drain, not after the restore.**

Telling the port from `restore` would mean making a pure storage function effectful and giving
`backup-repo.ts` a port it has no other use for — and it would still leave every other path that
writes watch rows uncovered, which is the general form of the bug rather than the one instance of
it that was noticed. The drain is where the device and storage already meet, it already reads the
watches, and it runs on precisely the triggers the requirement names, so the first collection after
any restore carries the repair with no coupling added anywhere.

The cost is that a restore does not repair the set the instant it lands: the device stays wrong
until the next collection. In practice a restore is followed by the app being used, and the
foreground trigger fires; and until a collection runs, no drop matters, because nothing would have
been read out of the queue anyway.

Alternative considered and rejected: a reconciliation of its own, called from both places. It is
the same call at the same moment as the drain's own, with a second call site to keep in step.

**Told unconditionally, on every collection.**

No comparison against the last set told, no cached "already reconciled" flag. The whole premise is
that the device's set cannot be trusted to match what this app believes about it — a flag holding
what we last told it would be exactly the belief that just proved wrong, and it would go stale the
same way after a restore replaced the database it would have to live in. The call is a small write
on the device side and idempotent by contract, and the trigger is a foreground transition, not a
loop.

**Before `collect`, and before the empty-queue return.**

Before `collect`, because the requirement says the device applies the stored set and the honest
reading of that is "told first". Before the early return for an empty collection above all: after a
restore the queue is empty *precisely because* the device has been dropping everything, so a
reconciliation that only ran when something was waiting would never run at all in the one case this
change exists for.

**The watches are read once inside the drain.**

Today `input.storage.watches()` is read after the early return. It moves to the top and one read
feeds both the set that is told and the decisions that follow, so the set the device is given and
the set each notification is judged against cannot be two different things. (`src/app/_layout.tsx`
still makes a read of its own for the alert decision — that one answers a different question, "was
anything expected at all", and is left alone.)

**The monobank family is filtered out of what is told, not left to be refused.**

This is the one place where "tell the device the stored set" cannot be taken literally.
`setWatched` refuses the *whole* set when any package matches `MONOBANK_PACKAGE_PREFIX`, and
leaves the device holding what it had. So a single stored monobank watch would not merely fail to
be applied — it would make every collection refuse, for good, leaving every other відстежуваний
застосунок on whatever set the device happened to hold. That is the original bug back again, made
permanent, in exactly the situation this change exists for: `backup-file` carries відстежувані
застосунки, and `MONOBANK_PACKAGE_PREFIX` is documented as a constant that widens as the owner's
phone confirms the production package, so a бекап written under a narrower reading is the concrete
path to such a row.

The drain therefore applies `monobankPackagesIn` — the same pure rule, already exported for exactly
this reason — and tells the remainder. The port's refusal is deliberately *not* a filter (a screen
must show the owner that what they typed was rejected, never silently drop it), but the drain has
no owner watching and nothing to show, so for it the rule has to be applied before the question is
asked.

The set told is then "the відстежувані застосунки that may be watched", which is what the capture
layer's own monobank requirement already demands of it. What this does not do is remove the stored
row: the section lists it under its raw package with the рахунок it points at, and removing *that*
row tells a set that no longer names monobank and so succeeds normally. Deleting a watch row from a
collection loop would be this change reaching into the owner's data over an edge case it can simply
route around. The escape is narrower than it sounds, and the narrowness is pre-existing: while such
a row is stored, adding or removing any *other* watch tells a set that still names monobank and is
refused, so the section can do exactly one thing until that row goes. This change does not widen
that and does not fix it; it only makes sure a collection is no longer held hostage by it.

**`refused` and `unavailable` change nothing and stop nothing.**

After the filter, `refused` is unreachable through this call: the drain applies the same predicate
the port checks, from the same constant. It is still ignored rather than asserted away, because a
port is a seam and a drain that threw on an outcome its own contract declares would be the fragile
thing. `unavailable` is a build with no listener in it, where `collect` already answers "nothing
waiting" and the drain already does the right thing; on a real device it is unreachable from here
too, since such a build reports access as `unsupported` and `_layout.tsx` never starts a drain.

Neither is worth a сповіщення про збій, and neither should suppress the clearing of one.
`reportCollection` clears an outstanding collection alert when access is granted and the drain did
not fail, and that stays right — not because the write cannot fail, but because a failed one costs
nothing and fixes itself. The device adapter answers `unavailable` when the native write throws,
which is reachable while access is granted and `collect` succeeds; but the set is told
unconditionally on every collection, so the next foreground transition simply tells it again, and
in between the device holds no worse a set than it holds today, before this change exists. The
alert means "the транзакції you expect stopped arriving"; raising or holding one over a
reconciliation that retries itself minutes later would be noise in the one channel this app has for
saying something is wrong. The return value is ignored deliberately, with the reason written at the
call site.

## Risks / Trade-offs

- **A restore leaves the device wrong until the next collection** → Bounded by a foreground
  transition, and harmless meanwhile: an uncollected queue loses nothing by being empty.
- **One more native call per foreground transition** → A small set written to a file on the device
  side; the trigger is a human opening an app, not a poll.
- **A stored monobank watch stays listed while never being told to the device** → The section shows
  it under its raw package name and removes it on request, and monobank money keeps arriving through
  the sync, which is the whole reason it may not be captured. `addWatchedApp` still refuses to store
  such a watch in the first place, so the only way in is a бекап written under a narrower reading of
  the family.
- **The filter and the port's rule could drift apart** → They cannot: both call
  `monobankPackagesIn` over `MONOBANK_PACKAGE_PREFIX`, and widening the constant moves both at once.
  A test pins that a set carrying monobank still applies the other packages.
- **A `setWatched` that rejects rather than answering would now break a collection** → The port's
  documented contract is that failures are values, and `verify` holds the double to it. The device
  adapter is proven on the emulator, as it is for every other port in `src/platform/`.
