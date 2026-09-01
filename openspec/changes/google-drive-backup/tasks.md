# google-drive-backup — tasks

> **Blocked until `backup-file` (step 11) is archived.** Task 1.1 is the gate: this change
> consumes design D1's seam and must not start by inventing a бекап format.
>
> This change touches native paths (`app.json`, new Expo modules with native code). `npm run
> verify` does not cover them: `npx expo-doctor` plus the CI `android` job (assembleDebug) is
> the compile check, and section 10 is the behaviour check on the emulator with a real Google
> account (rules/android.md). Nothing here loads a native module or talks to Google under
> `verify`.

## 1. The gate, the vocabulary, and the spec baseline

- [ ] 1.1 Confirm `backup-file` is archived and exposes design D1's four points —
      `makeBackup()`, `readBackup(bytes)`, `restoreBackup(bytes)` and an enumerated snapshot
      that a table can be excluded from. If any differs, stop and update design.md (and the
      specs if a requirement moves) before writing a line of code; verify: the seam's types
      are imported by a compiling scratch file, or the design is amended and re-reviewed.
- [ ] 1.2 Add to `docs/glossary.md` the three terms the specs use verbatim: **бекап**
      (the versioned snapshot of everything the app holds, no secrets in it), **версія бекапу**
      (one uploaded бекап, identified by the moment it was made), **код відновлення** (the
      sealing key written so a person can copy it down; the only way a new phone opens a
      версія бекапу); verify: every Ukrainian term used in this change's two new specs appears
      in the glossary, checked by reading both files against it.
- [ ] 1.3 Re-copy the `settings-screen` requirement "The Налаштування tab hosts the management
      sections" from `openspec/specs/settings-screen/spec.md` into this change's delta and
      re-add «Google Drive» to it. The delta was written against the baseline
      `first-run-onboarding` produces («Перші кроки»); verify: the delta's requirement text
      equals the current main spec's plus «Google Drive», and `npm run verify`'s
      `openspec validate` stays green.

## 2. Dependencies and native configuration

- [ ] 2.1 Add `expo-auth-session`, `expo-crypto`, `expo-background-task`, `expo-task-manager`
      and `@noble/ciphers` (design D2, D5, D9), pinned; verify: `npm run verify` green and
      `npx expo-doctor` shows no new failing check beyond the pre-existing SDK patch drift.
- [ ] 2.2 Add the Google Android client's redirect scheme to `app.json`'s `scheme` beside
      `cap1tal`, and the background-task plugin entry if the package requires one (design D2,
      D9); verify: `npx expo-doctor` and `scripts/android.sh up` still build, install and
      launch the app.
- [ ] 2.3 Ask the owner to create the Google Cloud OAuth client (Android type, the app's
      package and signing certificate) and its consent screen, and confirm the publishing
      status and the current classification of the `drive.appdata` scope — design D3's named
      pre-check, because a client left in *Testing* expires the authorisation every seven
      days. Record the client id as public configuration in `app.json` `extra`; verify: the id
      is present, no client secret exists anywhere in the repo, and D3's answer (appdata as
      designed, or the `drive.file` fallback) is written into design.md.

## 3. The envelope and the код відновлення — pure, and the heart of the change

- [ ] 3.1 Create `src/backup/drive/envelope.ts`: seal and open per design D5–D6 — magic,
      envelope-format version, the бекап's schema version, `createdAt`, step 11's plaintext
      checksum, a 24-byte nonce, XChaCha20-Poly1305 with the plaintext header as associated
      data, and a pure header read that works without the key; verify:
      `src/backup/drive/envelope.test.ts` covering scenarios "The uploaded bytes reveal
      nothing", "An altered upload does not open" (flip one byte of ciphertext, one of the
      header, one of the nonce — three cases), "The wrong key does not open it", plus a
      round-trip property over generated payloads.
- [ ] 3.2 Create `src/backup/drive/recovery-code.ts`: 32 bytes ↔ Crockford base32 with two
      check characters, in eight groups of seven, tolerant of `I/L/1` and `O/0` on read and of
      spacing and case (design D7); verify: `src/backup/drive/recovery-code.test.ts` covering
      scenarios "A new phone opens the бекап with the код відновлення" (encode → decode →
      opens an envelope sealed with that key) and "A mistyped код відновлення is refused as
      mistyped" (single-character substitutions are rejected by the checksum, not by a failed
      decryption), plus a round-trip property over generated keys.
- [ ] 3.3 Create the two secret-shaped ports with their doubles, `monobank-token.ts` shape
      verbatim: `src/platform/backup-key.ts` (read / save / remove the sealing key, failures
      as values) and `src/platform/random.ts` (CSPRNG bytes, injectable in tests) — design D8,
      D12; verify: `src/platform/backup-key.test.ts` proves an unavailable keystore is an
      answer and never destroys a kept key, plus the source-hygiene test both existing ports
      have (no react, expo or db imports).

## 4. Talking to Google — ports first, adapters after

- [ ] 4.1 Create `src/platform/google-auth.ts`: the port (`authorise()` → connected with an
      account label / cancelled / refused / no network; `accessToken()` → token or
      authorisation-withdrawn; `forget()`), its typed failure union and its in-memory double
      (design D12); verify: `src/platform/google-auth.test.ts` proves the double's states and
      the source-hygiene rule, and that no outcome or error carries the authorisation itself.
- [ ] 4.2 Create `src/platform/drive.ts`: the port (`list()`, `upload(name, bytes)`,
      `download(id)`, `delete(id)`) with its double, and the **pure** response parsing and
      error mapping beside it — a 401, a 403 `storageQuotaExceeded`, a network failure and a
      malformed body as four distinct outcomes (design D4); verify:
      `src/platform/drive.test.ts` names spec scenarios "No network is a reported state",
      "Withdrawn access stops the claim of being connected" and "A full Drive is reported as a
      full Drive" over recorded response shapes — no network call in any test.
- [ ] 4.3 Write the device adapters `google-auth-device.ts` (PKCE through
      `expo-auth-session`/`expo-web-browser`, the refresh authorisation kept in
      `expo-secure-store` under a versioned key, never returned to a caller) and
      `drive-device.ts` (the three `fetch` endpoints of design D4, `appDataFolder` as parent),
      lazily resolving native modules and answering the port's failure values on any throw;
      verify: not loaded by `verify` by construction — `npm run verify` stays green, the CI
      android job compiles, and behaviour is section 10's smoke.
- [ ] 4.4 Write `backup-key-device.ts` over `expo-secure-store` with
      `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and `requireAuthentication: false`, and
      `random-device.ts` over `expo-crypto` (design D8); verify: `npm run verify` green with
      neither file imported by any test, matching `monobank-token-store.ts`'s arrangement.

## 5. State on the device

- [ ] 5.1 Add the `drive_backup` table to `src/db/schema.ts` per design D11 — single-row CHECK
      like `saldo_import`, `account_label`, `recovery_code_acknowledged_at`, `last_success_at`,
      `last_uploaded_checksum`, `last_failure_kind`, `last_failure_at`, and no column that
      could hold a token, a key or a code — and generate one migration with `npm run
      db:generate`; verify: `src/db/drive-backup-repo.test.ts` applies the real migrations to
      an empty in-memory database and asserts the shape and the single-row constraint
      (rules/database.md).
- [ ] 5.2 Write `src/db/drive-backup-repo.ts`: read the state, record a success (moment +
      uploaded checksum), record a failure without touching the last success, connect
      (account label), acknowledge the код відновлення, disconnect; verify: the same test file
      covering spec scenarios "A failure does not erase the last success" and "Nothing
      uploaded yet is said plainly", and that connectedness is false while the код відновлення
      is unacknowledged (design D11's one definition).
- [ ] 5.3 Prove design D1's fourth point: the бекап snapshot does not contain `drive_backup`;
      verify: a test that makes a бекап on a database with a connected, backed-up state and
      asserts the table's values appear nowhere in the snapshot — the scenario "An uploaded
      бекап carries no secret and no captured payload" extended to the state table.

## 6. The rules that decide — pure

- [ ] 6.1 Create `src/backup/drive/schedule.ts`: `isBackupDue({ connected, lastSuccessAt, now,
      interval })` and the identical-бекап skip over the last uploaded checksum (design D9);
      verify: `src/backup/drive/schedule.test.ts` covering scenarios "A due backup runs in the
      background", "A missed window is caught up on opening", "An unchanged бекап is not
      uploaded again" and "A disconnected app never uploads", all with an injected `now`.
- [ ] 6.2 Create `src/backup/drive/rotation.ts`: given the folder's listing and a just-confirmed
      upload, which версії бекапу may be deleted — newest five kept, nothing deletable while no
      newer complete version exists (design D10); verify:
      `src/backup/drive/rotation.test.ts` covering scenarios "A failed upload leaves the folder
      untouched" and "Older versions are pruned only after a newer one is complete".
- [ ] 6.3 Create `src/backup/drive/restore.ts`: the admissibility rule — opens → checksum holds
      → schema version known → then and only then confirmable — as a pure function over a
      header and the app's own schema version, returning the preview the screen shows or a
      typed refusal; verify: `src/backup/drive/restore.test.ts` covering scenarios "A бекап
      from a newer app version is refused", "A corrupted версія бекапу is refused" and "The
      version and its date are named before anything is replaced".

## 7. The two runs

- [ ] 7.1 Write the backup run in `src/backup/drive/run-backup.ts`: due? → make the бекап →
      skip if unchanged → seal → upload → confirm → record success → prune per 6.2; every step
      a typed outcome, no throw; verify: `src/backup/drive/run-backup.test.ts` over the ports'
      doubles, covering "A new upload never destroys the last good one" and each failure state
      leaving the last success standing.
- [ ] 7.2 Write the restore run in `src/backup/drive/run-restore.ts`: list → open with the key
      or the код відновлення → 6.3's admissibility → preview → on confirmation hand the bytes
      to step 11's atomic import → report; verify: `run-restore.test.ts` covering "Restore
      replaces, it does not merge", "A phone without the key and without the code cannot open
      it", "A mistyped код відновлення is refused as mistyped" and "A restore that fails
      part-way leaves the phone exactly as it was".
- [ ] 7.3 Write the connect and disconnect runs: connect = authorise → make the key if none →
      show the код відновлення → record the acknowledgement (and only then connected);
      disconnect = forget the authorisation, keep the key, keep the Drive folder; verify:
      `src/backup/drive/connection.test.ts` covering "A cancelled connection leaves nothing
      behind", "The connection is not complete until the code is acknowledged" and
      "Disconnecting removes it".

## 8. Running it without being asked

- [ ] 8.1 Register the background task through `expo-background-task`/`expo-task-manager`,
      asking 6.1's predicate and running 7.1 (design D9); verify: registration happens only
      while connected, `npm run verify` green with no test loading the task module, and the
      real run is smoke task 10.4.
- [ ] 8.2 Ask the same predicate on the app's foreground entry so a window the system never
      granted is caught up (design D9); verify: the catch-up decision is 6.1's tested function
      and the wiring is a code-read plus smoke task 10.4.

## 9. The «Google Drive» section

- [ ] 9.1 Write `src/ui/drive-backup.ts`: every state of the section as data (not connected /
      connected with last success / last failure / running / restoring), and the mapping from
      every member of the failure unions to a Ukrainian sentence naming a next step (design
      D13); verify: `src/ui/drive-backup.test.ts` covering "The section speaks Ukrainian and
      never shows a secret" — exhaustive over the union, asserting no untranslated outcome name
      reaches a label — and "A failure is shown next to the last success".
- [ ] 9.2 Build the screen `src/app/manage/drive-backup.tsx` over 9.1: the not-connected offer,
      the connected state with account and last бекап, «Зберегти зараз», «Відновити»,
      «Від'єднати Google Drive», and showing the код відновлення only behind a deliberate
      action; verify: `src/ui/drive-backup.test.ts` reads the `.tsx` by path (rules/testing.md)
      to assert no label is built inline instead of coming from 9.1, and the screen's behaviour
      is smoke tasks 10.1–10.3.
- [ ] 9.3 Build the connect flow's код-відновлення step: the code, what it is for, that it
      cannot be recovered, copy, and the acknowledgement that completes the connection; verify:
      the scenarios "The code is shown with what it is for" and "Leaving without acknowledging
      does not complete the connection" — state in `src/ui/`, walked in smoke task 10.1.
- [ ] 9.4 Build the restore flow: the версії бекапу listed by date newest first, the code asked
      for when the phone holds no key, the named confirmation before replacing; verify:
      scenarios "The list is offered by date", "Confirmation is required and names what is
      replaced" and "A wrong код відновлення is said plainly and can be retyped" in
      `src/ui/drive-backup.test.ts`, and smoke task 10.5.
- [ ] 9.5 Add «Google Drive» to `src/ui/settings-sections.ts` and make the tab's outbound-traffic
      sentence conditional on the connection; verify: the existing settings-screen test covers
      the section list, and a new case covers scenarios "Not connected names monobank only" and
      "Connected names the backup too".

## 10. Emulator smoke (manual, scripted — rules/android.md)

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
      Рахунки matching what was backed up — the whole point of the change, proven once.

## 11. Verification

- [ ] 11.1 Run `npm run verify` and paste the final lines
- [ ] 11.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
