## Context

See proposal.md — Why. What matters here is where the code stands.

`syncLinkedAccounts` (`src/monobank/coordinator.ts`) paces itself through one closure, `paced()`,
which holds a single `lastRequestMs` for every request the прогін sends and seeds it from
`storage.lastRequestAtMs()` so the minute belongs to the phone rather than to one прогін. Every
прогін opens with `paced(() => fetchClientInfo(...))`; the statement request that follows therefore
always finds `since ≈ 0` and asks the `wait` port for the whole gap.

`wait` and `postponed` are the two ports `src/monobank/yielding.ts` writes policies for. There are
two today: `foregroundRun`, whose wait ends on its timer *or* on the app leaving the foreground,
and `budgetedRun`, whose wait is a bare `setTimeout` measured against an eight-minute deadline.
`src/hooks/monobank-ports.ts` builds the foreground pair; `runBackgroundTurn`
(`src/ui/monobank-background.ts`) puts the budgeted pair over it.

The stored рахунки the fix needs are already there. `monobank_accounts` carries `obtained_at` per
row, `monobankRepo.listAccounts()` reads them, and the rows are written both by the прогін itself
(`upsertAccounts`) and by the monobank screen's `cacheAccounts`. `upsertAccounts` inserts and
updates and never deletes — which is a fact D1 has to be built around, not an oversight. No
migration is needed and none is added; `.claude/rules/database.md`'s append-only rule is not
engaged.

Everything below stays provable under `npm run verify`: `yielding.ts` takes its timer as a port,
the coordinator takes storage and both clocks as ports, and no file this change touches is one
`verify` may not load.

## Goals / Non-Goals

**Goals:**

- A прогін that may send exactly one request sends a statement request and imports with it.
- A chance ends in the second or two it takes to send that request, holding the one-run lock for
  no longer.
- Nothing a фоновий прогін *decides* waits on a JS timer.
- The foreground прогін keeps its wait, its «2 з 3» and its «Зупинити» untouched, and
  «Синхронізувати» keeps meaning «now».
- The баланс банку a рахунок carries and the транзакції committed beside it keep describing the
  same instant, which is what «Звірити» is read against.

**Non-Goals:**

- Changing how the bank's rate limit is modelled. One minute across every request to the personal
  API stays the assumption; this change spends that minute better rather than claiming a cheaper
  limit the app cannot prove.
- Touching `syncOrder`, `planWindows`, `continueWindow`, `mapStatement`, the позиція гортання or
  anything else about what a request asks for and what its answer becomes.
- Any change to the WorkManager registration, its quarter-hour `minimumInterval`, or the бекап that
  rides the same request.
- Showing the age of a баланс банку on Рахунки. D3 removes the «Звірити» hazard for a рахунок the
  прогін completed, which is the one this change would otherwise create; a рахунок mid-first-sync
  carries an old cursor beside a fresh balance today and goes on doing so, and making the age
  visible there is a separate question about a screen this change does not touch.

## Decisions

### D1 — Freshness is decided from the newest stored answer, not per рахунок

`upsertAccounts` never deletes (`src/db/monobank-repo.ts`), so a linked monobank account the token
has stopped showing — a revoked card, a closed банка — keeps a row whose `obtained_at` no answer
can ever refresh. A per-рахунок rule («every link is named by a fresh row, or refetch») would
therefore answer «refetch» for ever on such a phone, the refetch could not heal it because the
fresh answer does not name it either, and every прогін would spend its allowance on client-info
again — the reported defect, restored in full and permanently.

So the unit is the **answer**, not the row. All rows one `upsertAccounts` call writes share the
`obtainedAt` it was given, so `max(obtained_at)` is the moment of the newest answer and the rows
carrying exactly that moment are the accounts it named. A link outside that set is one the newest
answer did not name, and the прогін gives it the verdict `unavailable` — the same one
`src/monobank/coordinator.ts:371` gives today for a link a fetched answer does not name.

There is a third writer, and it is the one that can break the proxy: `commitStatementAnswer` writes
`obtained_at` for **one** row (`src/db/monobank-repo.ts:483-489`). A прогін that read `max = T0`,
a screen refresh that writes `T1` to every row while it works, and then that прогін's own commit
would leave the just-synced рахунок at `T0` while the rest carry `T1` — and the next прогін would
read it as «not named by the newest answer» and hand it `unavailable` for up to an hour. So a commit
never lowers a row's `obtained_at` — and that rule binds `commitStatementAnswer` alone.

Two writers the proxy does not fully survive, named rather than engineered around. `upsertAccounts`
is wrapped in a `try` the run swallows («not a run failure»), so storage that refuses it while a
page commit succeeds leaves that one рахунок alone at the new moment and every other link reading
as unnamed — `unavailable` on the screen for up to a межа свіжості. A бекап restored over this
phone (`src/db/backup-repo.ts`) can land the same mixed shape. Both self-heal on the next fetched
answer, both need a failure or a restore to reach, and the cost is an hour of one wrong word rather
than anything stored — which is why the answer here is this paragraph and not a fourth mechanism.

A third writer that looked worse is not: a рахунок whose boundary lies after the newest answer is
refused by `usableAccounts` outright (D3), so it never becomes a lone row either. A fetched
client-info answer must still overwrite every row it names in *either* direction, or a row dated in
the future of the device's clock could never be corrected: the healing answer's moment is earlier
than the row's, a blanket never-lower rule would refuse it, and the phone would refetch client-info
for ever. The two hazards that look worse are not real: `upsertAccounts`
is one `db.transaction`, so no partial write can name a subset, and two answers landing in the same
millisecond come from the same token and name the same set.

*Alternative rejected:* a `client_info_read_at` column, or a stored payload beside the token. Both
add a migration and a second copy of a moment the rows already carry.

### D2 — The freshness test is one pure function, called before any request

`usableAccounts(rows, links, nowMs, freshMs?)` answers the map the прогін uses, or `undefined`.
Data in, data out, beside `syncOrder` in `src/monobank/sync.ts`, so every branch is a table test.
It answers `undefined` for no rows, for a newest moment older than the bound, and for one dated
after `nowMs` — the clock-moved-forward hazard `syncDue` and `paced` already guard, answered the
same way: one extra request, and the answer it brings heals the rows.

The bound is one hour, exported as `CLIENT_INFO_FRESH_MS` and called the **межа свіжості** in the
глосарій. The argument is a background one and it is scoped to background runs by D7: the phone's
chances come about four to an hour, so an hour spends one of them on balances and leaves three for
statement requests. It is not a freshness promise about the балanci — D3 is what makes their age
harmless — and it is one exported constant with one reason beside it, so moving it changes nothing
but itself.

### D3 — A прогін's span ends at the moment of the answer it used

`runToMs` becomes the answer's moment rather than `ports.nowMs()`. Today those are the same thing
to within the client-info round trip, so nothing changes for a прогін that fetches; for a прогін
using a stored answer it is the whole point.

Рахунки offers «Звірити» — a коригування for the difference between a рахунок's розрахунковий
баланс and its баланс банку (`openspec/specs/accounts-screen/spec.md`) — and shows no age beside
either figure. A прогін that imported an hour of транзакції against an hour-old баланс банку would
make that difference an hour of the owner's real spending, and confirming «Звірити» would write a
коригування for money already explained. That is «кожна гривня пояснена» broken by an optimisation,
which is not a trade this change is allowed to make.

Ending the span at the answer's moment costs nothing: the span between it and now is imported by
the прогін after it, from the cursor this one committed. The price is that транзакції lag the bank
by up to the межа свіжості — an honest hour, against the «never» they lag by today.

A span that can end in the past also opens a case `runToMs = now` made unreachable — and it is not
solved here but in D2, because the answer is to refuse the answer. A рахунок no синхронізація has
ever completed, linked with a boundary *after* the stored answer, has no вікно the прогін could ask
about: `planWindows` answers `[]` and it would be reported «finished without asking». Neither word
fits. `complete` is contradicted by «Ще не синхронізовано» on the screen in the same breath;
`postponed` is worse, because `followUpDue` starts a run at once on that word and a run that could
only report it again would follow itself for as long as the app stayed in front — a hot loop. So
`usableAccounts` refuses an answer older than such a рахунок's cursor, the прогін fetches, and the
answer it gets is dated past the boundary. A boundary in the future of the clock itself is not
healed by any answer and does not force the request, or the allowance would go to client-info for
ever.

The other case a past-ending span opens is solved here: once a sweep has
carried every рахунок to the answer's moment, `planWindows` answers `[]` (`src/monobank/sync.ts:81`),
`syncOneAccount` returns `complete` having sent nothing, and `finish` calls
`markSynced(link, ports.now())` — dating a синхронізація the bank was never asked about, which is
exactly what the comment above that line says the guard exists to prevent. So `markSynced` records
the moment of the answer the прогін used, and a рахунок already standing at it moves nothing. No
cursor can regress and no позиція гортання is stranded by the shorter span: `planWindows` answers
`[]` for `toMs <= fromMs`, `cursorMs = planned.toMs` therefore never moves backwards, and
`windowsOf` works a resumed вікно before it plans anything.

*Alternative rejected:* taking the баланс банку from the statement answer instead. monobank does
send a balance with every statement item, but `StatementItem` (`src/monobank/api.ts:78`) does not
parse it, and adding it would reopen «Statement parsing yields items whole or fails whole». It is
the better long-term answer and it is not this change's.

### D4 — `budgetedRun` is replaced by `chanceRun`, which has no clock and no timer

```
export function chanceRun(): YieldingPorts {
  let owed = false;
  return { wait: () => { owed = true; return Promise.resolve(); }, postponed: () => owed };
}
```

The coordinator asks `wait(ms)` only when it owes part of the gap, and asks `postponed()`
immediately after. So «was a wait asked for» is exactly «the прогін owes a gap it has not sat out»,
and answering `postponed` from that alone is the whole policy. Nothing is scheduled, so nothing can
be frozen, and the прогін returns through the `Stopped` path the coordinator already has — no
change to `coordinator.ts`'s control flow at all.

*Alternative rejected:* keeping the budget and making its wait end when the app leaves the
foreground, as `foregroundRun`'s does. It removes the twenty-minute zombie but not the cause: a
chance would still send one request and end, and it would carry a deadline, a clock and a timer to
reach the same place. The budget existed to bound a wait; with no wait there is nothing to bound.

*Consequence:* `BACKGROUND_TURN_BUDGET_MS`, `ANDROID_BUDGET_MS` and the `Platform.select` around
them go. The comment they carried about iOS's thirty-second grant goes with them, and is not a
loss: a прогін that never waits fits inside a `BGAppRefreshTask` by construction.

### D5 — The screen's own client-info requests take the minute

`monobankConnection.submit` and `.refresh` (`src/monobank/connection.ts`) send client-info and note
no request, which «The minimum gap between requests holds across runs» already forbids. It has been
harmless only because the прогін's own client-info request absorbed the refusal. Once a прогін
skips that request, «Синхронізувати» pressed seconds after the screen refreshed would fire a
statement request the bank refuses — and, unlike the client-info request it replaces, that one
costs the рахунок its хід. So both calls note the request they send.

### D6 — Nothing is journaled that was not journaled before

A chance that sends one request writes exactly the entries a прогін writes today. The `wait` entry
stays deliberately — «this прогін owed a minute and stopped» is precisely what distinguishes «the
pace stopped it» from «the bank refused it», and it is the entry that made this defect readable.

### D7 — A прогін the owner asked for always fetches client-info

The межа свіжості governs прогони nobody asked for. «Asked for» is not a new division: «Pulling
down on Головний refreshes it and syncs monobank now» already draws it for the тихий інтервал —
«the quiet interval governs only the runs the owner did not ask for, and this is one they asked
for» — so this decision reuses that line rather than inventing a second one. Asked for:
«Синхронізувати» (`src/app/manage/monobank.tsx:482`) and the pull on Головний
(`src/app/(tabs)/index.tsx:228`). Not asked for: the opening and the foreground return
(`src/app/_layout.tsx:345`, `:415`) and the chance (`src/platform/monobank-sync-task.ts:47`).

Both asked-for triggers are the owner saying «now», and answering them with balances up to an hour
old would take away the one control they have for exactly that — on the very complaint that opened
this change. So the coordinator is told whether the прогін was asked for, and one that was fetches
client-info whatever the phone holds.

It can afford to. The owner is watching it, so it may wait out the minute between requests and say
«2 з 3» while it does; and over the ten requests a sweep of nine рахунки costs, one spent on
client-info is a tenth. The same request inside a chance is the whole of that chance — a quarter of
an hour — which is the asymmetry D2's argument rests on and the reason one bound cannot serve both.

*Alternative rejected:* one rule for every прогін. Fewer moving parts, and the coordinator would not
need to know who asked; but «Синхронізувати» would stop meaning «now» and start meaning «show me
what you already had», which is not a button worth keeping.

### D8 — Almost every chance ends перенесено, and that is the honest word

A chance sends what the pace allows and stops at the next request it may not send, so its remaining
рахунки end перенесено — which makes перенесено the ordinary outcome of a healthy phone rather than
an exceptional one. Two things follow, both wanted and neither hidden:

- the monobank screen's outcome row reads «перенесено» most of the time, which is true: there is
  always more the прогін owes;
- `syncDue` lets a прогін start at once after a перенесено attempt, so the тихий інтервал stops
  governing chances and openings. That is the rule «A postponed run does not spend the quiet
  interval» already asks for, and it is right — the requests a stopped прогін did not spend are
  still owed — but it means the interval, which used to be the thing rationing прогони, is now the
  pace and the phone's own cadence doing it instead.

The one chance that does not end перенесено is the one where every рахунок already stands at the
answer's moment: it asks nothing, reports complete and moves nothing (D3).

## Risks / Trade-offs

- **A рахунок's first синхронізація still takes many chances.** One chance sends one statement
  request, and a рахунок leaves «Ще не синхронізовано» only when every вікно `planWindows` plans
  has answered short — a year of history is about a dozen вікна for that one рахунок, plus whatever
  гортання a full answer costs. Nine рахунки with history are therefore tens of chances, not nine.
  → It converges instead of never starting, each chance's work is committed, and openings and the
  pull add прогони that can send several requests each. What the change promises is progress on
  every chance, and the spec says so rather than naming a cadence.

- **Транзакції lag the bank by up to the межа свіжості.** D3's span ends at the answer's moment.
  → An hour, against the «never» of today, and the alternative was a коригування written over real
  spending.

- **Балanci refresh about once an hour instead of on every прогін.** → They are dated with the
  moment they were obtained, the monobank screen already reads that, and D3 keeps them aligned with
  the транзакції beside them.

- **A рахунок the token has stopped showing costs one request and one хід per sweep.** → It always
  did; D1 changes only that the verdict now comes from a stored answer rather than a fetched one,
  and no транзакція, cursor or link is touched by it either way.

- **A frozen process can still hold the one-run lock.** `syncPorts` wraps every request in
  `withRequestTimeout`, which arms a `setTimeout` per request (`src/monobank/yielding.ts:179`); a
  process frozen mid-request has that timer frozen too, and `inFlight` (`src/ui/monobank-sync.ts`)
  is module state with no expiry. → Narrower than what was observed — a request in flight rather
  than a whole minute of waiting, and the native call answers a paused JS thread — but it is not
  nothing, and it is not this change's to fix. Named here so the next репорт that shows it is read
  against a known gap rather than a claim of «no timers».

- **This change contradicts requirements `monobank-background-sync` owns.** → Handled as that
  change already handles its own overlap: an explicit archive order in tasks.md, verified with
  `openspec list` before archiving. `openspec validate --strict` reports the MODIFIED headers as
  absent from the main spec today, which is the expected reading until that change archives; the
  REMOVED header is not checked until archive.

## Migration Plan

No data migration, no schema change, no native change. The behaviour change lands whole with the
build: a phone whose stored рахунки are stale simply fetches client-info on its next прогін,
exactly as it does today, and every cursor, позиція гортання, хід and imported item id is
untouched. Rolling back is reverting the commit.
