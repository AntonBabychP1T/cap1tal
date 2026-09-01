# bank-notifications-screen — proposal

## Why

Step 8 (tech-task §5, FR-S3) is built but invisible: the pure engine (`bank-notifications`,
14/14 tasks done) turns a captured notification into чернетки and транзакції, and the capture
layer (`bank-notifications-capture`, archived) physically reads watched apps' notifications
into a bounded on-device queue. Nothing connects them: no table stores a watch, a fingerprint
or a чернетка; no screen lets the owner grant access or map an app to a рахунок; nothing ever
collects the queue. Until this change, both product questions still miss every bank but mono —
"where the money went" skips whole рахунки and "how much is left" flatters the owner. This
change is the closing half: persistence, the Налаштування section, the Головний surface, and
the wiring that drains the queue through the engine into storage.

## What Changes

- **New capability `bank-notifications-screen`** — the visible, on-device flow:
  - **Налаштування section «Сповіщення банків»**: explains what reading bank notifications is
    for and that nothing read leaves the phone (vision §12); shows the access state as the
    device reports it — granted, denied with the way to the system «Доступ до сповіщень»
    screen, or unsupported with no action offered (the capture spec's three answers); the
    state is re-read when the owner returns from the system screen.
  - **Watched apps management**: the owner adds a watch by picking a known bank app by name
    (or naming an app package by hand) and mapping it to exactly one existing unarchived
    рахунок; the list shows every watch with its app and рахунок; a watch can be removed —
    capture stops for that app, existing чернетки and транзакції stay. Every mutation goes
    through the capture port as the full watched set, so the stored set and the device never
    disagree; the port's refusal of the monobank package family is surfaced, and the picker
    never offers monobank at all — mono is synced by its API, a second capture path would only
    manufacture duplicates.
  - **Collection wiring**: while access is granted, opening the app (and returning to the
    foreground) collects the waiting captured notifications, runs each through
    `processCapture`, persists each outcome atomically — fingerprint + чернетка, or
    fingerprint + auto-confirmed транзакція — and only then acknowledges what was stored, so
    a crash between collecting and storing loses nothing and a redelivery dies at the
    fingerprint dedup. Ignored and duplicate outcomes are acknowledged without storing.
  - **Головний surface for чернетки**: pending чернетки are visible on Головний, each with
    its рахунок, date, notification text and what it proposes (витрата, дохід «Без джерела»,
    or raw with no сума — a foreign original-currency reference shown as information).
    Confirming creates exactly the транзакція the engine decides (правила at the moment of
    confirmation, «Без категорії» fallback, «Без джерела» for money in) and it appears in the
    feed as an ordinary транзакція — editable and retypeable like any other. A raw чернетка
    asks the owner for the сума in the рахунок's currency before it can confirm. Dismissing
    creates nothing and the чернетка never returns. An auto-confirmed витрата skips the
    surface entirely and lands in the feed.
- **Modified capability `settings-screen`** — the Налаштування tab hosts the new
  «Сповіщення банків» section alongside the existing ones.
- **Modified capability `persistence`** — watches, seen fingerprints and чернетки survive a
  restart; a fingerprint is remembered independently of what became of its чернетка or
  транзакція (confirmed, dismissed, deleted — it never yields again); a capture outcome
  commits atomically in one storage transaction; the storage arrives by a new append-only
  migration that keeps every stored row.

Non-goals of this change (deliberate):

- No engine changes: `processCapture`, `confirmDraft`, `dismissDraft` and the parsers are
  consumed as they are. Per-bank parsers still arrive later as pure additions from real
  samples, no spec change.
- No retroactive auto-confirm sweep when a правило appears — engine design D8 stands: a
  правило created later is honoured at manual confirmation only.
- No background or headless processing while the app is closed: the capture queue waits on
  the device (its spec guarantees that) and is drained when the app runs. No reminders, no
  operational alerts, no push of our own (vision §§13–14).
- No SMS parsing, no other banks' APIs (vision §14.7), nothing read leaves the device
  (vision §12). The capture spec and the in-flight google-drive-backup change exclude the
  on-device queue and raw notification payloads from any backup; чернетки carrying the
  notification text verbatim in the owner's database are the new fact this change creates,
  and where they stand relative to the sealed бекап is a named coordination point with
  google-drive-backup (design.md Risks), not a promise this change makes on its own.
- No editing of a чернетка's fields beyond supplying the raw сума: the owner fixes details
  on the created транзакція in the feed, where editing already exists — one editing surface,
  not two.
- Verification on a physical Android device with real bank notifications stays a manual
  owner step after the change lands: Expo Go has no listener service, the emulator smoke
  drives posted test notifications only.

## Capabilities

### New Capabilities

- `bank-notifications-screen`: the visible flow that completes FR-S3 — the Налаштування
  section (access state, grant flow, watched-apps management through the capture port), the
  collection wiring that drains the device queue through the engine into storage atomically,
  and the Головний surface where чернетки are confirmed, completed with a сума, or dismissed.

### Modified Capabilities

- `settings-screen`: the tab-hosting requirement gains the «Сповіщення банків» section.
- `persistence`: added requirements — watches, fingerprints and чернетки survive restart,
  fingerprints outlive their чернетки and транзакції, capture outcomes commit atomically,
  and the shape arrives by a new append-only migration.

## Impact

- New code: a migration + schema rows for watches, seen fingerprints and чернетки; a
  notifications repo in `src/db/`; pure screen logic in `src/ui/` (settings section state,
  чернетки list labels and confirm/dismiss decisions); the Налаштування section screen in
  `src/app/manage/`; the чернетки surface on `src/app/(tabs)/index.tsx`.
- Touched code: Головний's screen file gains the surface; the app layer supplies the real
  `dateOf` (extracted from its inline home at `src/app/manage/monobank.tsx`, engine design
  D9); Налаштування's section list gains one row.
- Consumed as-is: `NotificationAccessPort` and `NotificationCapturePort` in `src/platform/`
  (device adapters already exist, native module `modules/notification-capture/` already
  ships the listener), the engine in `src/notifications/`, `matchRule`, the transactions
  repo. The watch-through-the-port rule closes the BACKLOG's named gap: `addWatch` alone
  does not refuse monobank — the screen must go through the port, or picker and device
  drift apart.
- Depends on the `bank-notifications` engine change being integrated (implemented, awaiting
  archive); this change adds the persistence and UI it deliberately left out.
- No new dependencies. `npm run verify` stays Node-only and under a minute — screens get
  their logic proven in `src/ui/` tests, the device path is smoke-tested on the emulator.
