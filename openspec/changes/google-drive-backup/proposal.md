# google-drive-backup — proposal

## Why

Every hryvnia of the owner's history lives in one SQLite file on one phone. A lost, stolen,
wiped or replaced phone takes the whole answer to both product questions with it — "where did
my money go" and "how much can I still spend" become unanswerable for every month before the
new phone, and no amount of re-typing brings a year of monobank statements back. Vision §12
already granted the exception this needs: Google Drive is the one cloud service v1 may use,
opt-in, for recovery. This change is step 12 of tech-task §5 (FR-B3–B4): the owner connects
their own Google account, an encrypted бекап goes to the app's own folder in their Drive about
once a day without being asked, and a new phone gets the history back through an explicit,
named restore.

**This change depends on `backup-file` (step 11, FR-B1–B2) and cannot be implemented before
it.** Step 11 owns what a бекап *is*: the versioned snapshot of рахунки, категорії, джерела,
правила, ліміти, цілі, транзакції and non-secret settings, its integrity check, and the import
that replaces local state atomically. This change owns only what happens to those bytes
afterwards — encrypting them, putting them in Drive, keeping a few versions, bringing one back.
The seam it needs from step 11 is small and stated in design D1; the artifacts here are written
now so that step 11 can be built against a known consumer, and `/opsx:apply` waits for it.

## What Changes

- **New capability `google-drive-backup`** — everything that happens to a бекап between the
  local snapshot and the owner's Drive:
  - **Connection is opt-in and to the owner's own account.** Nothing reaches any network
    until the owner explicitly connects Google Drive. The app asks for the narrowest access
    that can hold a backup: its own hidden application folder in the owner's Drive, never the
    owner's other files. The authorisation Google issues is a secret and is kept where the
    monobank token is kept — the device keystore, never SQLite, never a бекап, never a log.
  - **What goes up is encrypted before it leaves the phone.** A random key made at connect
    time lives in the device keystore; the бекап is sealed under it with an authenticated
    cipher, so what sits in Drive is ciphertext even to Google. Because that key is bound to
    this phone and a new phone is exactly the case backup exists for, connecting also produces
    a **код відновлення**: the same key written so a person can copy it down, shown at connect
    and re-showable while connected, and the only way a new phone reads the backup. It is
    never stored among the owner's financial data and never uploaded.
  - **A daily best-effort copy, and honest words about it.** While connected, the app uploads
    the current бекап at least once per 24 hours when the system gives it the chance, and
    catches up the moment the app is next opened if the system did not. It never claims a
    clock time Android does not guarantee: what the owner is shown is the last successful
    backup's date and the last failure, not a promise.
  - **A new version never destroys the last good one.** Each upload is a new file; older
    versions are pruned only after a newer one is safely up, and a small number of previous
    versions is kept — a бекап that was written from already-corrupted local data is not the
    only thing left to restore from.
  - **Restore is explicit, named and verified.** The owner picks a version by its date, the
    app decrypts it, checks the бекап's format version, schema version and integrity, and says
    what will be replaced *before* anything local is touched. Restore never merges and never
    runs by itself. A failure at any step leaves the phone exactly as it was.
  - **Refusal and revocation are states, not crashes.** No network, a Google account that
    revoked access, a full Drive, a wrong код відновлення, a бекап from a newer schema — each
    is an answer the owner is shown with what to do about it, and each leaves local data and
    the last good backup untouched.
  - **Named exclusions.** The monobank token, the Google authorisation, the encryption key and
    its код відновлення, raw bank-notification payloads and the on-device capture queue are
    never in what is uploaded (vision §12, and the promise `bank-notifications-capture`
    already made).
- **New capability `google-drive-backup-screen`** — the «Google Drive» section of
  Налаштування: connect and disconnect, the last successful backup and the last failure in
  words, «Зберегти зараз», «Відновити» with the version list, and the код відновлення — shown
  once at connect with the owner made to acknowledge it, retrievable later while connected,
  and asked for when restoring on a phone whose keystore does not hold the key.
- **Modified capability `settings-screen`** — the tab gains a «Google Drive» section, and the
  screen's standing claim that nothing but monobank leaves the phone stops being true while
  Drive is connected: it must say what actually goes out.

Non-goals (deliberate, and some of them are vision §14 lines this change stays behind):

- **No live two-way sync, no merging, no second editing device** (§14.1). This is one phone's
  backup. Two phones writing the same Drive folder is not solved and not attempted; restore
  replaces, and the app says so.
- **No cloud service beyond the owner's own Drive** (§14.9). No cap1tal server, no account, no
  analytics, no third-party sync provider.
- **No local notification when a backup fails** — actionable alerts are step 13
  (`reminders-and-alerts`, FR-N2). Here a failure is visible in Налаштування and nowhere else.
- **No бекап file format work**: format, versioning, integrity and the import that replaces
  local state are `backup-file`'s (FR-B1–B2). This change adds an encryption envelope *around*
  that file and does not change what is inside it.
- **No encryption of the local file export.** The envelope defined here is the Drive copy's;
  whether `backup-file`'s hand-made export reuses it is that change's decision, not this one's.
- **No iOS work beyond staying buildable** (§14.15): the ports here are platform-neutral and
  the adapters are Android's, exactly as `monobank-token` and `notification-capture` are.
- **No first-run onboarding step.** Google Drive is offered in Налаштування after the app is
  in use, not on the way in.

## Capabilities

### New Capabilities

- `google-drive-backup`: the contract for the owner's Drive copy — opt-in connection to their
  own account with app-folder-only access; the authenticated encryption envelope sealed with a
  device key and its код відновлення; the at-least-daily best-effort upload with catch-up and
  honest status; version rotation that never drops the last good backup; explicit, verified,
  replace-not-merge restore; every refusal as a state; and the named list of what may never be
  uploaded.
- `google-drive-backup-screen`: the «Google Drive» section of Налаштування — connect,
  disconnect, last success and last failure in words, «Зберегти зараз», «Відновити» over the
  version list with confirmation before replacing, and how the код відновлення is shown, kept
  and asked for.

### Modified Capabilities

- `settings-screen`: the tab's section list gains «Google Drive», which opens the backup flow;
  and the screen's statement about what leaves the phone becomes conditional on whether Drive
  is connected instead of naming monobank alone.

## Impact

- **Prerequisite**: `backup-file` (step 11). `/opsx:apply` on this change starts only after
  that one is archived and the seam of design D1 exists.
- **New npm dependencies** (design names each and why): `expo-auth-session` + `expo-crypto`
  for the OAuth PKCE flow and device randomness, `expo-background-task` + `expo-task-manager`
  for the daily best-effort run, and `@noble/ciphers` — a pure-TypeScript audited AEAD, chosen
  so the whole envelope is provable under `npm run verify` in Node, with no native crypto
  module.
- **Native/config**: `app.json` gains the OAuth redirect scheme the Google Android client
  requires and the background-task plugin if the package needs one; no hand edit under
  `android/`, no new local module expected. `npx expo-doctor` after the dependency change,
  per `rules/android.md`; the CI `android` job is the check that the config still builds.
- **Owner-only setup, once**: a Google Cloud project with an OAuth client for the app's
  package and signing certificate, and its consent screen. The agent cannot and must not
  create it or hold any credential; the client id is public configuration, and there is no
  client secret in an installed-app PKCE flow — nothing goes into `.env` or the repo that the
  guard would have to block.
- **New code**: `src/backup/drive/**` for the pure parts (envelope, код відновлення encoding,
  the upload/restore decision logic, the "is a run due" schedule rule),
  `src/platform/google-auth.ts` and `src/platform/drive.ts` as ports with in-memory doubles
  beside them and device adapters that `verify` never loads — the `monobank-token` seam
  repeated, plus a keystore key for the encryption key alongside the monobank one.
- **Database**: one new table for the connection and backup state (connected account label,
  last success instant, last failure, known versions), one generated migration and a migration
  test, per `rules/database.md`. No change to any existing table.
- **`npm run verify` stays Node-only and under a minute**: no test loads a native module and
  no test talks to Google; the cipher, the encoding, the schedule rule and every failure state
  are pure functions over injected values.
- **The Налаштування footer changes meaning**: «Назовні йдуть лише запити до monobank з вашим
  токеном» is exactly the sentence this change makes conditionally false, which is why
  `settings-screen` is a modified capability rather than an untouched one.
- **Docs**: `docs/glossary.md` gains **бекап**, **код відновлення** and **версія бекапу** so
  the specs and screens use owner-facing terms verbatim; `docs/tech-task.md` §5 row 12 moves
  from ⏳ to its real state at archive time.
