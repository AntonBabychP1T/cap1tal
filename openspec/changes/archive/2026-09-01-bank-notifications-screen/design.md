# bank-notifications-screen — design

## Context

See proposal.md — Why. Everything hard is already built and proven: the pure engine in
`src/notifications/` (`processCapture`, `confirmDraft`, `dismissDraft`, the parsers), the
platform ports in `src/platform/notification-access.ts` and `notification-capture.ts` with
their in-memory doubles, and the native listener in `modules/notification-capture/` (its own
manifest, no config plugin), all archived as the `bank-notifications-capture` spec. This
change is plumbing and surfaces: three tables, one repo, one drain loop, one Налаштування
section, one Головний block. The idiom to copy is monobank-sync-screen: ports injected into
screens, pure screen logic in `src/ui/` proven by Vitest, atomic commits in the repo layer,
`npm run verify` Node-only.

## Goals / Non-Goals

**Goals:**

- Wire capture → engine → storage so nothing is lost or doubled across crashes and restarts:
  acknowledge to the capture layer only what is committed.
- Keep the device and the database agreeing on what is watched: every watch mutation goes
  through the capture port first, stored only on `ok`.
- One editing surface: a чернетка confirms into an ordinary транзакція; all fixing happens in
  the feed, which already edits and retypes everything.

**Non-Goals:**

- No engine or parser changes, no native/Expo/permission changes of any kind — **no new
  native module, no new Android permission, no app.json or plugin edit**; the listener and
  its manifest shipped with `bank-notifications-capture`.
- No headless/background drain: collection happens when the app runs (open + foreground).
- No per-bank parsers, no retroactive auto-confirm sweep (engine D8 stands).

## Decisions

**D1. Three tables; settled чернетки are deleted, fingerprints are the memory.**
`notification_watches` (packageName TEXT PK, accountId FK → accounts),
`notification_fingerprints` (fingerprint TEXT PK — the plain joined string, engine D3),
`notification_drafts` (id TEXT PK, accountId FK, currency, date, text, kind
'expense'|'income'|'raw', amountMinor INTEGER nullable, originalAmountMinor INTEGER nullable,
originalCurrency TEXT nullable, createdAt INTEGER for newest-first ordering). A watch row
stores no currency: the repo joins accounts on read, so the engine's `Watch.currency` can
never drift from the рахунок. Confirm/dismiss deletes the draft row — the fingerprint row is
what "never returns" rests on, exactly the engine's contract. Alternative — a settled-status
column — rejected: nothing ever reads a settled чернетка, and persistence only promises
pending ones load.

**D2. One `notificationsRepo` owns the atomic commits, mirroring `commitStatementAnswer`.**
`commitOutcome(outcome)` writes, in one `db.transaction`: fingerprint + draft row for
`drafted`, fingerprint + транзакція for `auto-confirmed` (composing the same mappers the
transactions repo uses, as monobank-repo already does); `duplicate`/`ignored` write nothing.
`confirm(draft, транзакція)` inserts the транзакція and deletes the draft row in one
transaction; `dismiss(draftId)` deletes the row. Plus `watches()` (joined with accounts),
`addWatch`/`removeWatch`, `seenFingerprints()`, `pendingDrafts()`.

**D3. The drain loop is a pure-logic driver in `src/ui/`, called from the app shell.**
`drainCaptures({ capture: NotificationCapturePort, repo, rules, newId, dateOf })` in
`src/ui/notification-drain.ts` (no React): `collect()`, then for each record in order run
`processCapture` with ctx `{ watches, seenFingerprints, rules, newId, dateOf }` — feeding each
newly committed fingerprint back into the seen set so an in-batch duplicate dies too — commit
each outcome, and finally `acknowledge(n)` where n is the contiguous prefix of records whose
outcomes are committed (a storage failure stops the loop; the tail redelivers next time and
the dedup kills anything committed-but-unacknowledged). The React side is a thin effect in
`src/app/_layout.tsx`: run on mount and on AppState turning `active`, only when
`access.state()` answers `granted`. Returning from the system access screen is a foreground
transition, so granting is followed by a drain without extra wiring. Proven in Vitest with
`inMemoryNotificationCapture` + the test db.

**D4. The watched-app picker is a curated list plus hand entry, and every add goes through the port.**
A constant list of known Ukrainian bank apps (display name + package) in
`src/ui/notification-settings.ts`, monobank never in it; below it, a hand entry for any other
package. Add = engine `addWatch` first (already-watched and рахунок-exists rules, typed
rejection), then `capture.setWatched([...stored, next])`; store the row only on `ok`,
show `refused` (the monobank family — the port's `monobankPackagesIn` rule) and `unavailable`
as answers, changing nothing. Remove = `setWatched` without the package, then delete the row.
This closes the BACKLOG's named gap: `addWatch` alone does not refuse monobank — the port
does, so the screen must never write a watch the device was not told. A wrong guessed package
in the curated list is harmless (it captures nothing) and is fixed as a string constant, no
spec change.

**D5. Screens follow the monobank screen split.**
`src/app/manage/notifications.tsx` — the «Сповіщення банків» section: access state via
`NotificationAccessPort` (re-read on focus, so returning from the system screen refreshes),
watched list, picker, removal. Pure state/label logic in `src/ui/notification-settings.ts`
with tests; the section row itself joins `src/ui/settings-sections.ts`. The Головний surface
is a block above the feed in `src/app/(tabs)/index.tsx`, its lines, ordering and
confirm/dismiss decisions built by `src/ui/drafts-section.ts` (pure, tested): рахунок name,
date, text, proposal label via the existing `labels.ts` money formatting; confirm calls
engine `confirmDraft` (правила re-read at that moment) then `repo.confirm`; raw confirm asks
the сума through the existing `parseAmountInput` rules; dismiss is an Alert-confirmed
`repo.dismiss`, the same gesture deletion already uses.

**D6. `dateOf` is extracted, not duplicated.**
The inline epoch→date at `src/app/manage/monobank.tsx:430` (`todayIso(new Date(...))`) gains a
second caller, so it moves to `src/ui/dates.ts` as `dateOfEpochMs(ms)`; both call sites use
it, engine design D9's condition ("extract when the inline stops being the only caller") now
met. The engine takes epoch ms — the mono call site keeps its `* 1000`.

**D7. Migration 0007, append-only, tested like its six predecessors.**
One new migration adds the three tables with FKs to accounts; `migrations.test.ts` gains the
two persistence scenarios (existing data survives; fresh db supports the shapes). Committed
migrations untouched — `guard-migrations.sh` enforces what the rule states.

## Risks / Trade-offs

- [The tab-hosting requirement is modified by three in-flight changes (first-run-onboarding,
  google-drive-backup, this one)] → this delta bases on first-run-onboarding's version (10/11,
  archives first). Whichever of google-drive-backup and this change archives second must fold
  the other's section («Google Drive» / «Сповіщення банків») into the requirement at archive
  time — an explicit check in the archive step, not a silent overwrite.
- [Чернетки put raw notification text into the database the бекап serializes] → the archived
  capture spec excludes "the queue or raw notification content" from any backup, and the
  in-flight google-drive-backup delta excludes "any raw payload of a bank notification" —
  wording written before чернетки were stored rows, and already ambiguous for the опис a
  confirmed транзакція carries (the same string, backed up as money data). This change takes
  no side: its persistence delta says nothing about бекап. The опис precedent argues чернетки
  are money data in flight and should ride the sealed бекап (excluding them makes a restore
  silently lose pending drafts — the one failure this feature must never have); whichever of
  google-drive-backup and this change archives second MUST reconcile the capture-spec and
  backup wording to a precise boundary, with the owner's word on it — an explicit archive-time
  check, same as the settings-screen fold-in above.
- [Foreground-only drain means a phone unused for days can overflow the bounded queue] →
  capture spec already chose degradation (oldest forgotten, never a crash); accepted — the
  raw-чернетка path and the owner's daily use make loss marginal, and a headless task can
  arrive later without touching these specs.
- [Storage failure mid-batch] → acknowledge only the committed prefix; the tail redelivers
  and fingerprints dedup the overlap. Worst case is re-processing, never loss or doubling.
- [Ignored drafts pile up on Головний] → visible pressure is the design: чернетки exist to be
  answered; dismissal is one confirmed tap. No cap, no auto-expiry — silent loss is the one
  failure this feature must never have.
- [Curated package names guessed wrong] → capture yields nothing for them; hand entry covers
  any bank today; constants are corrected from the owner's phone with no spec churn.

## Migration Plan

Append-only migration 0007 (D7); no data backfill — all three tables start empty, matching
the "fresh database starts empty of notification state" scenario. Rollback = revert the code;
the tables sit inert if unread. Real-device verification with live bank notifications remains
a manual owner step after landing (Expo Go has no listener; the emulator smoke posts test
notifications).

## Open Questions

- The curated bank list's exact contents (packages confirmed on the owner's phone) — string
  constants, adjustable any time without spec or schema change.
