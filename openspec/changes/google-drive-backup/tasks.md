# google-drive-backup — tasks

> **`backup-file` (step 11) landed on 2026-09-01.** Design D1 has been reconciled against the seam
> it actually shipped; §1.1 records what moved.
>
> This change touches native paths (`app.json`, new Expo modules with native code). `npm run
> verify` does not cover them: `npx expo-doctor` plus the CI `android` job (assembleDebug) is
> the compile check, and section 10 is the behaviour check on the emulator with a real Google
> account (rules/android.md). Nothing here loads a native module or talks to Google under
> `verify`.
>
> **Two tasks need the owner and cannot be done by the agent**: §2.3 (creating the Google Cloud
> OAuth client) and all of §10 (the emulator smoke with a real Google account). Everything else is
> the agent's.

## 1. The gate, the vocabulary, and the spec baseline

- [x] 1.1 Reconcile design D1 with the seam `backup-file` actually shipped: `saveBackup(store,
      now)` rather than `makeBackup()`, `readBackup(bytes)` as a full read, `applyRestore(store,
      header)` as the import a previewed restore must use (so the file is not parsed twice),
      `bytes` a **string** and not a buffer, `checksum` a CRC-32 over the body, and `BACKUP_TABLES`
      as the enumerated snapshot a table can be excluded from; verify: design.md D1 names the real
      signatures and the two consequences, and the specs did not have to move for it.
- [x] 1.2 Add to `docs/glossary.md` the two terms the specs use verbatim that it does not already
      define — **версія бекапу** (one uploaded бекап, identified by the moment it was made and by
      the key it is sealed under) and **код відновлення** (the sealing key written so a person can
      copy it down; the only way a new phone opens a версія бекапу) — and a row in the distinctions
      table saying a код відновлення is not a відновлення. **бекап** and **відновлення** are
      already there (step 11) and only need the Drive copy mentioned in **бекап**'s "not
      encrypted" sentence, which is true of the file and false of the Drive copy; verify: every
      Ukrainian term used in this change's two new specs appears in the glossary.
- [x] 1.3 Re-copy the `settings-screen` MODIFIED block from `openspec/specs/settings-screen/spec.md`
      as it stands **at apply time** and append «Google Drive», keeping every scenario the live
      spec has — the delta was written against an older baseline and had lost «Сповіщення банків»,
      «Бекап» and «Репорти про помилки», which a MODIFIED block would delete on archive. Note that
      `reminders-and-alerts` holds a MODIFIED block on the same requirement: a mirrored note goes
      in that change's tasks.md, the way `fiscal-receipts` put one here; verify: `openspec validate
      google-drive-backup --strict` is clean and the delta's text equals the live spec's plus
      «Google Drive».

## 2. Dependencies and native configuration

- [x] 2.1 Confirm the pinned dependencies of design D2, D5 and D9 — `expo-auth-session`,
      `expo-crypto`, `expo-background-task`, `expo-task-manager` and `@noble/ciphers`; verify:
      `npm run verify` green and `npx expo-doctor` shows no new failing check beyond the
      pre-existing SDK patch drift.
- [ ] 2.2 Add the Google Android client's redirect scheme to `app.json` — `scheme` is a bare
      string today and becomes an array with `cap1tal` first — and the `expo-background-task`
      plugin entry (design D2, D9). Note `app.config.js` wraps `app.json` and is not where config
      goes; verify: `npx expo-doctor` and `scripts/android.sh up` still build, install and launch
      the app. **Blocked on 2.3 for the scheme itself.**
- [ ] 2.3 **Owner's task — the agent cannot and must not do this.** Create the Google Cloud OAuth
      client (Android type, package `com.antonbabychp1t.cap1tal`, plus the debug and release
      signing certificates' SHA-1) and its consent screen, and confirm the publishing status and
      the current classification of the `drive.appdata` scope — design D3's named pre-check,
      because a client left in *Testing* expires the authorisation every seven days. Then two
      edits to `app.json`, both of which the code is already written against:

      ```json
      "extra": { "googleOAuthClientId": "<the id>.apps.googleusercontent.com" },
      "scheme": ["cap1tal", "com.googleusercontent.apps.<the id>"]
      ```

      There is no client secret in an installed-app PKCE flow, so nothing here is a credential and
      nothing goes into `.env`. Until it is done, `src/platform/google-auth-device.ts` answers
      `not-configured`, which `src/ui/drive-backup.ts` shows as «Ця збірка застосунку не
      налаштована на Google Drive» — a real state with its own sentence, not a crash; verify: the
      id is present, no client secret exists anywhere in the repo, and D3's answer (appdata as
      designed, or the `drive.file` fallback) is written into design.md.

## 3. The envelope and the код відновлення — pure, and the heart of the change

- [x] 3.1 Create `src/backup/drive/envelope.ts`: seal and open per design D5–D6 — magic,
      envelope-format version, the бекап's schema version, `createdAt` and D14's `keyId` (and
      **not** the бекап's checksum, which in the clear would fingerprint the owner's state and
      which nothing a listing decides needs), a 24-byte nonce, XChaCha20-Poly1305 with the plaintext head as
      associated data, and a pure head read that works without the key over a **prefix** of the
      file; verify: `src/backup/drive/envelope.test.ts` covering scenarios "The uploaded bytes
      reveal nothing", "An altered upload does not open" (flip one byte of ciphertext, one of the
      head, one of the nonce — three cases), "The wrong key does not open it", plus a round-trip
      property over generated payloads.
- [x] 3.2 Create `src/backup/drive/recovery-code.ts`: 32 bytes ↔ Crockford base32 with four
      check characters over the code's own symbols (D7, amended: 52 + 2 does not divide into
      eight groups of seven, and a check over the key's bytes misses substitutions), in eight
      groups of seven, tolerant of `I/L/1` and `O/0` on read and of
      spacing and case (design D7); verify: `src/backup/drive/recovery-code.test.ts` covering
      scenarios "A new phone opens the бекап with the код відновлення" (encode → decode →
      opens an envelope sealed with that key) and "A mistyped код відновлення is refused as
      mistyped" (single-character substitutions are rejected by the checksum, not by a failed
      decryption), plus a round-trip property over generated keys.
- [x] 3.3 Create the two secret-shaped ports with their doubles, `monobank-token.ts` shape
      verbatim: `src/platform/backup-key.ts` (read / save / remove the sealing key, failures
      as values) and `src/platform/random.ts` (CSPRNG bytes, injectable in tests) — design D8,
      D12; verify: `src/platform/backup-key.test.ts` proves an unavailable keystore is an
      answer and never destroys a kept key, plus the source-hygiene test both existing ports
      have (no react, expo or db imports).

## 4. Talking to Google — ports first, adapters after

- [x] 4.1 Create `src/platform/google-auth.ts`: the port (`authorise()` → connected with an
      account label / cancelled / refused / no network; `accessToken()` → token or
      authorisation-withdrawn; `forget()`), its typed failure union and its in-memory double
      (design D12); verify: `src/platform/google-auth.test.ts` proves the double's states and
      the source-hygiene rule, and that no outcome or error carries the authorisation itself.
- [x] 4.2 Create `src/platform/drive.ts`: the port (`list()`, `upload(name, bytes)`,
      `download(id, byteLimit?)` — the limit is D6's range read that fetches a head and not a
      body — and `delete(id)`) with its double, and the **pure** response parsing and error
      mapping beside it — a 401, a 403 `storageQuotaExceeded`, a network failure and a
      malformed body as four distinct outcomes (design D4); verify:
      `src/platform/drive.test.ts` names spec scenarios "No network is a reported state",
      "Withdrawn access stops the claim of being connected" and "A full Drive is reported as a
      full Drive" over recorded response shapes — no network call in any test.
- [x] 4.3 Write the device adapters `google-auth-device.ts` (PKCE through
      `expo-auth-session`/`expo-web-browser`, the refresh authorisation kept in
      `expo-secure-store` under a versioned key, never returned to a caller) and
      `drive-device.ts` (the four `fetch` endpoints of design D4, `appDataFolder` as parent,
      a `Range` header for the head read), lazily resolving native modules and answering the
      port's failure values on any throw; verify: not loaded by `verify` by construction —
      `npm run verify` stays green, the CI android job compiles, and behaviour is section 10's
      smoke.
- [x] 4.4 Write `backup-key-device.ts` over `expo-secure-store` with
      `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and `requireAuthentication: false`, and
      `random-device.ts` over `expo-crypto` (design D8); verify: `npm run verify` green with
      neither file imported by any test, matching `monobank-token-store.ts`'s arrangement.

## 5. State on the device

- [x] 5.1 Add the `drive_backup` table to `src/db/schema.ts` per design D11 — single-row CHECK
      like `saldo_import`, `account_label`, `recovery_code_acknowledged_at`, `last_success_at`,
      `last_uploaded_checksum`, `last_failure_kind`, `last_failure_at`, and no column that
      could hold a token, a key or a code — and generate one migration with `npm run
      db:generate`. **The migration turns two assertions in `src/backup/format.test.ts` red and
      both are part of this task**: `BACKUP_SCHEMA_VERSION` is asserted to equal the number of
      committed migrations, and the excluded-table set is asserted exhaustively — so bump the
      constant and add `'drive_backup'` to that array with the reason it is excluded; verify:
      `src/db/drive-backup-repo.test.ts` applies the real migrations to an empty in-memory
      database and asserts the shape and the single-row constraint (rules/database.md).
- [x] 5.2 Write `src/db/drive-backup-repo.ts`: read the state, record a success (moment +
      uploaded checksum), record a failure without touching the last success, connect
      (account label), acknowledge the код відновлення, disconnect; verify: the same test file
      covering spec scenarios "A failure does not erase the last success" and "Nothing
      uploaded yet is said plainly", and that connectedness is false while the код відновлення
      is unacknowledged (design D11's one definition).
- [x] 5.3 Prove design D1's fourth point: the бекап snapshot does not contain `drive_backup`;
      verify: a test that makes a бекап on a database with a connected, backed-up state and
      asserts the table's values appear nowhere in the snapshot — the scenario "An uploaded
      бекап carries no secret and no captured payload" extended to the state table.

## 6. The rules that decide — pure

- [x] 6.1 Create `src/backup/drive/schedule.ts`: `isBackupDue({ connected, lastSuccessAt, now,
      interval })` and the identical-бекап skip over the last uploaded checksum (design D9);
      verify: `src/backup/drive/schedule.test.ts` covering scenarios "A due backup runs in the
      background", "A missed window is caught up on opening", "An unchanged бекап is not
      uploaded again" and "A disconnected app never uploads", all with an injected `now`.
- [x] 6.2 Create `src/backup/drive/rotation.ts`: given the folder's listing and a just-confirmed
      upload, which версії бекапу may be deleted — newest five **of the current line** kept,
      nothing deletable while no newer complete version exists, and never a версія sealed under
      another key (design D10, D14); verify: `src/backup/drive/rotation.test.ts` covering
      scenarios "A failed upload leaves the folder untouched", "Older versions are pruned only
      after a newer one is complete" and "A версія the phone cannot open is not deleted".
- [x] 6.3 Create `src/backup/drive/restore.ts`: the admissibility rule — opens → checksum holds
      → schema version known → then and only then confirmable — as a pure function over a
      head and the app's own schema version, returning the preview the screen shows or a
      typed refusal, with "sealed under another key" as its own refusal and not a mistyped code,
      and the rule that a код відновлення adopts whichever line it opens when the folder holds more
      than one (D14); verify: `src/backup/drive/restore.test.ts` covering scenarios "A бекап
      from a newer app version is refused", "A corrupted версія бекапу is refused", "The
      version and its date are named before anything is replaced" and "A версія from another line
      is named as such, not as a mistyped code".

## 7. The two runs

- [x] 7.1 Write the backup run in `src/backup/drive/run-backup.ts`: due? → make the бекап →
      skip if unchanged → seal → upload → confirm → record success → prune per 6.2; every step
      a typed outcome, no throw; verify: `src/backup/drive/run-backup.test.ts` over the ports'
      doubles, covering "A new upload never destroys the last good one" and each failure state
      leaving the last success standing.
- [x] 7.2 Write the restore run in `src/backup/drive/run-restore.ts`: list heads → open with the
      key or the код відновлення → 6.3's admissibility → preview → on confirmation hand the
      **already-read header** to step 11's `applyRestore` (never `restoreBackup`, which would
      parse the bytes a second time and could restore something other than what the preview
      described) → report; verify: `run-restore.test.ts` covering "Restore replaces, it does not
      merge", "A phone without the key and without the code cannot open it", "A mistyped код
      відновлення is refused as mistyped", "A restore that fails part-way leaves the phone
      exactly as it was" and "Restoring with the код відновлення joins that line too" — a restore
      that opened a версія with a typed code **adopts that key** (D14), so the phone's next бекап
      joins the line instead of starting a second one.
- [x] 7.3 Write the connect and disconnect runs. Connect has **two doors and both must end
      connected** (D11, D14): where the folder already holds версії, ask for a код відновлення,
      adopt the key of whichever line it opens, and record the acknowledgement from the typing
      itself — the owner who typed the code has shown they hold it, and asking again would ask
      twice; where the folder is empty, make a key, show the код відновлення and record the
      acknowledgement the owner gives. A phone that joined a line and did not set
      `recovery_code_acknowledged_at` would never count as connected, never register the
      background task and never upload, which is the whole new-phone flow. Disconnect = forget the
      authorisation, keep the key, keep the Drive folder;
      disconnect = forget the authorisation, keep the key, keep the Drive folder; verify:
      `src/backup/drive/connection.test.ts` covering "A cancelled connection leaves nothing
      behind", "The connection is not complete until the code is acknowledged", "Disconnecting
      removes it", "A new phone continues the same backup line" and "Connecting with the code
      needs no second acknowledgement".

## 8. Running it without being asked

- [x] 8.1 Register the background task through `expo-background-task`/`expo-task-manager`,
      asking 6.1's predicate and running 7.1 (design D9); verify: registration happens only
      while connected, `npm run verify` green with no test loading the task module, and the
      real run is smoke task 10.4.
- [x] 8.2 Ask the same predicate on the app's foreground entry so a window the system never
      granted is caught up (design D9); verify: the catch-up decision is 6.1's tested function
      and the wiring is a code-read plus smoke task 10.4.

## 9. The «Google Drive» section

- [x] 9.1 Write `src/ui/drive-backup.ts`: every state of the section as data (not connected /
      connected with last success / unchanged-since-then / last failure / running / restoring) —
      the unchanged state exists so an ageing date is not read as a silent failure — and the mapping from
      every member of the failure unions to a Ukrainian sentence naming a next step (design
      D13); verify: `src/ui/drive-backup.test.ts` covering "The section speaks Ukrainian and
      never shows a secret" — exhaustive over the union, asserting no untranslated outcome name
      reaches a label — "A failure is shown next to the last success" and "An unchanged бекап does
      not read as a stale one".
- [x] 9.2 Build the screen `src/app/manage/drive-backup.tsx` over 9.1: the not-connected offer
      (saying how it differs from «Бекап»), the connected state with account and last бекап,
      «Зберегти зараз», «Відновити», «Від'єднати Google Drive», and showing the код відновлення
      only behind a deliberate action; verify: `src/ui/drive-backup.test.ts` reads the `.tsx` by
      path (rules/testing.md) to assert no label is built inline instead of coming from 9.1, and
      the screen's behaviour is smoke tasks 10.1–10.3.
- [x] 9.3 Build the connect flow's код-відновлення step: the code, what it is for, that it
      cannot be recovered, copy, and the acknowledgement that completes the connection — plus
      D14's other door, where the folder already holds версії and the flow asks for that line's
      code instead, with starting afresh offered and its cost said first; verify: the scenarios
      "The code is shown with what it is for", "Leaving without acknowledging does not complete
      the connection", "A new phone is offered the existing line" and "Starting afresh says what
      it costs first" — state in `src/ui/`, walked in smoke task 10.1.
- [x] 9.4 Build the restore flow: the версії бекапу listed by date newest first, the code asked
      for when the phone holds no key, the named confirmation before replacing; verify:
      scenarios "The list is offered by date", "Confirmation is required and names what is
      replaced", "A wrong код відновлення is said plainly and can be retyped" and "A версія from
      another line is named as such" in `src/ui/drive-backup.test.ts`, and smoke task 10.5.
- [x] 9.5 Add «Google Drive» to `src/ui/settings-sections.ts` and move the tab's outbound-traffic
      sentence out of the `.tsx` into `src/ui/` so `verify` reaches it, naming every connection
      the app actually makes — the monobank requests with the token, the tokenless rate request,
      the чек lookups the owner asks for — and the бекап as well while Drive is connected (this
      is §12.1's amendment, now carried by the delta itself); verify: the existing
      settings-screen test covers the section list, and new cases cover scenarios "Not connected
      names what the app sends without Google Drive" and "Connected names the backup too".

## 10. Emulator smoke (manual, scripted — rules/android.md) — **owner's tasks**

- [ ] 10.1 Connect Google Drive end to end with the owner's real account through the unverified-app
      consent screen; record screenshots of the consent, the код відновлення step, the
      acknowledgement, and the section afterwards showing the account and «ще не було» before the
      first upload.
- [ ] 10.2 «Зберегти зараз» → screenshot the last-successful date, and confirm from the Drive side
      that a file exists in the app folder and that its bytes are not readable as JSON.
- [ ] 10.3 Force each failure: airplane mode («немає мережі»), then revoke the app's access at the
      Google account and back to the app («потрібно підключити знову»); screenshot both, and
      confirm the last successful бекап is still shown and no local data changed.
- [ ] 10.4 Leave it a day (or move the device clock) and confirm the daily run happened without
      being asked, and that catching up on open works after denying the app background time.
- [ ] 10.5 Restore onto a wiped install (`scripts/android.sh reset`): type the код відновлення by
      hand, screenshot the version list, the named confirmation, and the restored Головний and
      Рахунки matching what was backed up — the whole point of the change, proven once. Then
      confirm D14: the restored phone's next «Зберегти зараз» joins the same line rather than
      orphaning what is already there.

## 11. Note from `fiscal-receipts` (2026-09-02) — folded into the delta

- [x] 11.1 «The tab tells the truth about what leaves the phone» had to name a third outbound
      connection: the lookup of a фіскальний чек by its реквізити at `cabinet.tax.gov.ua`, made
      only on the owner's explicit tap, which `fiscal-receipts` landed on 2026-09-02 and could not
      amend from its own spec. The spec review of 2026-09-07 found a **fourth** the requirement
      also missed — monobank's tokenless exchange-rate request (`src/monobank/currency.ts`) — so
      the amendment is written into this change's `settings-screen` delta rather than left as a
      note for the implementer; verify: the delta's requirement and both its scenarios name all
      four, and §9.5 is where the sentence itself is built.
- [ ] 11.2 Record the archive-order dependency the amendment creates. `docs/product-vision.md` §12
      still says outbound connections are "limited to the monobank API and exchange rate, plus
      Google Drive" — it does not yet name the tax service. The delta's requirement does, correctly,
      because the lookup exists in the tree; amending the vision is `fiscal-receipts`' owner task
      and gates *its* archive. If this change archives first, the main spec names a connection the
      vision does not yet allow; verify: either §12 names the чек lookup before this change is
      archived, or the archive waits on `fiscal-receipts` — decided with the owner, not guessed.

## 12. Verification

- [x] 12.1 Run `npm run verify` and paste the final lines — `Test Files 158 passed (158)`,
      `Tests 3029 passed (3029)`, `✔ verify passed (273eacb187ed77ab99232fb8aa34e5668a2bde6a)`
- [x] 12.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS — four rounds, PASS on
      the fourth (0 critical). It found, and this change fixed: «Показати код відновлення» opening
      the type-a-code step instead of showing the code; `startFreshLine` overwriting a held key
      (two taps from permanent loss of every версія); the section never being told whether anything
      had changed; the connected tab still claiming «Усе лежить на цьому телефоні»; the settings tab
      reading the connection once at mount; `connect` silently completing an abandoned code step;
      the ask-code retry claiming «0 версій»; both irreversible actions being one-tap; and a restore
      adopting a key from a stale field
