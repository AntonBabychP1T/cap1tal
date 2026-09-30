## Why

The owner's репорт of 2026-09-30 (SM-S921B, Android 16, build 7a3a3ac) shows monobank sync that
runs but does not keep the money current, which is the whole of «where money went / how much is
left» for the рахунки that carry most of it:

- 98 прогони in 60 hours, each spending its one statement request (the bank allows one a minute) on
  whichever of nine рахунки waited longest. The black card — the рахунок with nearly every
  транзакція — was read nine times in those 60 hours, about once every six hours.
- Since 2026-09-29 19:48 the token no longer shows one linked рахунок (`_ot8dnw…`). Every прогін
  since is remembered as `unavailable`, so a перенесено прогін is no longer continued, Головний
  stays «оновлено вчора» for good and the background run raises the сповіщення.
- Android gave the app no background chance for 12 hours and more at a time (Doze and App Standby);
  the app never asks to be exempt.
- «Оновити з monobank» on the monobank screen re-reads only the list of рахунки, not the
  транзакції — the owner pressed it expecting a sync and nothing updated.

The owner's expectation, which this change adopts: the black card is current without opening the
app, at least hourly and ideally within minutes of a purchase; the other рахунки a little less
often but current too; «Оновити» makes every рахунок current within about ten minutes even if the
app is closed right after; and Android is asked for whatever permission that takes.

## What Changes

- Every прогін reads the balances first: the **межа свіжості** falls from an hour to a minute, so a
  прогін more than a minute after the last client-info answer asks for a fresh one.
- A **баланс банку that moved** since the last stored answer makes its рахунок **позачерговий**
  (new, stored on the link). So does linking it, and so does the owner asking for a sync (all
  рахунки). A completed sync that covers the moment clears it. Позачергові рахунки go before the хід
  order until they have had a хід; then come **overdue** рахунки (no хід for three hours), then the
  rest — so a busy card cannot starve the others, and a рахунок that keeps failing cannot starve
  anyone.
- A прогін that stops with a позачерговий рахунок still unread, while the app is not in front of the
  owner, asks the phone for a one-off **дочитування** as soon as the bank's minute allows. A chain of
  them reads the remaining позачергові рахунки one a minute, so «Оновити» finishes all nine in about
  ten minutes with the app closed. The chain ends when no позачерговий рахунок without a хід is left.
- A **поштовх**: a notification the monobank app posts (the notification listener is already bound
  for bank notifications) is taken only as a sign that something moved. Only its package, moment and
  flags are looked at (ongoing, foreground-service and group-summary notifications are ignored); its
  content is never read or stored; its moment is noted and a дочитування is asked for a minute
  later — at most one pending, so at most about one прогін a minute. A background chance after a
  поштовх is due whatever the тихий інтервал says.
- A рахунок the token no longer shows is **set aside**, not failed: it is still reported per рахунок
  and said plainly on the monobank screen, but it no longer decides how a прогін is remembered, how
  fresh Головний says the bank is, or whether monobank needs the owner — unless the token shows none
  of the linked рахунки.
- The monobank screen says whether Android restricts the app's background work and offers the
  system's own exemption (battery optimisation; the app-info page when the owner restricted the app
  by hand). The permission `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is declared.
- «Оновити з monobank» is renamed «Оновити список рахунків».

Non-goals: no server, webhook or remote push (vision §14.14 stays); no foreground service or
persistent notification; no exact alarms; no change to the one-request-a-minute pacing, to how a
statement is read, paged or mapped, or to the фоновий прогін never waiting; no reading of a monobank
notification's text; no cadence promise shown to the owner. iOS keeps working with the parts that
are not Android's (the balance-first order and the set-aside рахунок); дочитування, поштовх and the
restriction row are Android-only and answer «not supported» elsewhere (vision §14.15).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `monobank-sync`: the межа свіжості is a minute; позачергові рахунки and their place in the order;
  дочитування; поштовх; a рахунок the token no longer shows is set aside from the remembered outcome
  and every freshness reading.
- `monobank-sync-screen`: the background note becomes three readings with the phone's own fix; a
  set-aside рахунок is said plainly on its row; the account-list refresh is labelled for what it does.
- `main-screen`: Головний's freshness line and «Потребує уваги» leave out a set-aside рахунок.
- `bank-notifications-capture`: a monobank notification is a поштовх — noted by moment, never read,
  never captured; «only a watched app» gains that one exception.
- `persistence`: the позачерговий moment on a link survives a restart, arrives by an append-only
  migration, and stays out of a бекап.

## Impact

- `src/monobank/` — `sync.ts` (order, межа свіжості, shown links), `coordinator.ts` (order taken
  after client-info, asked runs mark all позачергові, set-aside reason), `auto.ts` (nudged due,
  remembered outcome, continuation decision).
- `src/db/schema.ts`, a new `drizzle/0006_*` migration, `src/db/monobank-repo.ts`.
- `src/ui/monobank-sync.ts`, `src/ui/monobank-background.ts`, `src/ui/monobank-screen.ts`,
  `src/ui/home-screen.ts` consumers, `src/app/manage/monobank.tsx`, `src/app/(tabs)/index.tsx`.
- New port `src/platform/background-sync.ts` + `background-sync-device.ts`; `src/hooks/monobank-ports.ts`,
  `src/platform/monobank-sync-task.ts`.
- Native: `modules/notification-capture` gains a WorkManager one-off worker that runs the
  registered background tasks, the поштовх in `CaptureListenerService`, and the battery-optimisation
  status/request; depends on `expo-background-task` and `androidx.work`. Needs a new dev build.
- `docs/glossary.md` (позачерговий рахунок, прострочений рахунок, дочитування, поштовх, відкладений
  рахунок; межа свіжості, прогін, хід, фоновий прогін, відстежуваний застосунок updated),
  `docs/product-vision.md` §12 (the owner's decision of 2026-09-30), `.claude/rules/android.md`
  (the one-off дочитування worker and the battery-optimisation permission), `app.json`
  (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`).
- Archive order: after `monobank-auto-sync`, `monobank-sync-fairness`, `monobank-background-sync`
  and `monobank-sync-cadence`, whose requirements this change modifies (six MODIFIED blocks).
