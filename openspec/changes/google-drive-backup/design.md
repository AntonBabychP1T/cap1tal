# google-drive-backup — design

## Context

See proposal.md — Why. What shapes every decision below:

- **`backup-file` (step 11) has landed** (archived 2026-09-01). D1 was written before it and named
  the seam it *should* expose; it has since been reconciled against the seam that actually shipped,
  which is what this document existed to absorb. The specs did not move for it.
- **The repo's platform idiom is settled and this change repeats it exactly.** Anything that
  touches a device, a network or a keystore lives behind a port in `src/platform/` with an
  in-memory double beside it and a device adapter that `npm run verify` never loads —
  `monobank-token.ts` and `notification-capture.ts` are the two working examples. Failures are
  values, never exceptions: `src/monobank/api.ts` answers with a typed outcome the screen shows.
- **`npm run verify` is Node-only and must stay under a minute.** No test may load a native
  module or talk to Google. Everything provable as a pure function must be one — which, for a
  change whose core is cryptography, is the single strongest constraint on the crypto choice
  (D5).
- **`android/` is generated and never hand-edited** (rules/android.md); native changes are
  expressed in `app.json` or a config plugin, and every new dependency and permission is named
  here before it is added.
- **Money and the domain are untouched.** This change moves opaque bytes. It adds no
  транзакція, changes no рахунок, and computes nothing about a місяць.

## Goals / Non-Goals

**Goals:**

- One encrypted envelope format, defined once, provable end-to-end under Vitest in Node —
  sealing, opening, tampering, wrong key, wrong код відновлення.
- Every rule that decides *whether* something happens (is a backup due, may this version be
  pruned, may this бекап be restored) is a pure function of injected values, so the schedule and
  the rotation are tested without a clock, a network or a device.
- The smallest possible Google surface: one scope, plain HTTP, no vendor SDK, no client secret.
- A restore that cannot half-happen and cannot happen by surprise.

**Non-Goals:**

- No abstraction over "cloud providers". There is one provider, named in the spec, and a second
  one is not a foreseeable requirement (vision §14.9).
- No resumable/chunked uploads. A бекап of this size is one request; a failed request is retried
  as a whole at the next due run.
- No conflict resolution between two phones. Restore replaces; the spec says so.
- No background *restore*, no background prompting, no notification (step 13 owns alerts).

## Decisions

**D1. The seam `backup-file` exposes — reconciled against what step 11 actually shipped
(2026-09-01, `src/backup/backup.ts`).** This change consumes exactly four things and nothing else:

1. `saveBackup(store, now): Promise<BackupSnapshot>` — the current бекап as `{ bytes,
   formatVersion, schemaVersion, createdAt, checksum, figures }`. (`makeBackup(state, now)` is the
   synchronous pure core beneath it; the one-call form this change uses is `saveBackup`.)
2. `readBackup(bytes): BackupHeader | BackupRefusal` — a pure read of a бекап that yields its
   `createdAt`, `formatVersion`, `schemaVersion`, `figures` and parsed `state`, or one of five
   named refusals. Used to verify and to preview *before* anything local is touched.
3. `applyRestore(store, header): Promise<'ok' | BackupRefusal>` — the atomic replace-everything
   import, over a бекап **already read**. This change calls `applyRestore` and not
   `restoreBackup(store, bytes)` deliberately: the latter re-parses the text, and restoring must
   apply exactly the бекап whose date and figures the owner was just shown. Atomicity is step 11's
   contract; this design only guarantees the header handed over came from bytes that opened,
   checksummed and carried a known schema.
4. **An explicit exclusion list.** `BACKUP_TABLES` in `src/backup/format.ts` enumerates the
   snapshot, and `format.test.ts` asserts the excluded set exhaustively. The Drive state table
   (D11) joins that excluded set — a бекап restored on a new phone must not arrive claiming a
   Google connection that phone does not have.

Two consequences of the real seam, which the original D1 guessed at:

- **`bytes` is a `string`, not a buffer** — "the whole file as UTF-8 text". The envelope therefore
  encodes it with `TextEncoder` when sealing and decodes with `TextDecoder` when opening (D6), and
  the Drive port's `upload(name, bytes)` takes the sealed `Uint8Array`. The string↔octets edge
  lives in `envelope.ts` and nowhere else.
- **`checksum` is `crc32(canonicalJson(state))`** — a CRC-32 over the бекап's *body*, not over the
  file. It is an integrity value and not an authenticator: it catches a damaged бекап, and the
  envelope's AEAD tag is what catches a deliberately altered one. That is why the head carries it
  (D6) — for the preview and for D11's "has anything changed since the last upload" — and never as
  a security claim.

**D2. OAuth by PKCE through the system browser, with `expo-auth-session`; no client secret exists.**
An installed-app OAuth client (Android type, bound to the package name and the signing
certificate) has no secret by construction, which is why this is the only flow that can live in a
public repo: the client id is configuration, not a credential, and `guard-bash.sh`'s secret rules
never come into play. `expo-auth-session` provides the authorization request with PKCE and the
code exchange over `expo-web-browser`, which is already a dependency; `expo-crypto` supplies the
verifier's randomness. Alternatives rejected: `@react-native-google-signin/google-signin` (a
native module plus a Play-services dependency and a second "web client" just to get offline
access, for a flow we can do in two HTTP calls), and a hand-rolled PKCE flow (same work, none of
the library's redirect handling). The redirect scheme the Google Android client requires is added
to `app.json`'s `scheme` as a second entry beside `cap1tal`.

**D3. One scope: the app's own hidden folder in the owner's Drive.**
`https://www.googleapis.com/auth/drive.appdata`, and files created with `parents:
['appDataFolder']`. It is the narrowest thing that satisfies the spec: the app can never read the
owner's own documents, the folder is invisible in the Drive UI so nothing there gets tidied away
by accident, and it survives reinstalling the app. **Consequence to confirm before implementing:**
Google's scope classification decides whether the OAuth consent screen needs verification, and an
OAuth client left in *Testing* publishing status expires refresh tokens after seven days — which
would silently turn a daily backup into a weekly re-consent. The implementation task therefore
checks the current classification and the client's publishing status against Google's console
before the first upload is wired, and the fallback, if the owner will not publish the client, is
`drive.file` with a visible `cap1tal` folder — a change of two constants and no change to any
requirement, because the spec says "the app's own folder" and never names the mechanism. Either
way, D9's "authorisation withdrawn" state is the same state a seven-day expiry produces, so the
app degrades into a visible "connect again", never into silent data loss.

**D4. Drive over `fetch`, three endpoints, no SDK.**
Upload is a multipart `POST` to `/upload/drive/v3/files?uploadType=multipart` with the metadata
part naming `appDataFolder` as parent; listing is `GET /drive/v3/files?spaces=appDataFolder`
ordered by name; download is `GET /drive/v3/files/{id}?alt=media`; pruning is `DELETE
/drive/v3/files/{id}`. Parsing and error mapping follow `src/monobank/api.ts` exactly — the HTTP
call lives behind the port, the *shape* of what comes back is parsed by a pure function under
test, and a 401, a 403 `storageQuotaExceeded`, a network failure and a malformed body are four
different typed outcomes, not one thrown error. The `googleapis` SDK is Node-shaped and enormous;
rejected.

**D5. The envelope is XChaCha20-Poly1305 from `@noble/ciphers`, because the whole thing must be
provable in Node.**
This is the decision the rest hangs on. `expo-crypto` offers digests and randomness but no
symmetric cipher; React Native has no WebCrypto `subtle`; a native crypto module would put the
one part of this change that must never be wrong (D-nothing-opens-that-should-not) outside
`verify` forever. `@noble/ciphers` is audited, dependency-free, pure TypeScript, and runs
identically in Vitest and on the device — so "an altered upload does not open" and "the wrong key
does not open it" are ordinary unit tests. XChaCha20-Poly1305 over AES-GCM: a 24-byte random
nonce makes nonce reuse a non-issue without any counter state to persist, and JS ChaCha needs no
hardware AES. Throughput is irrelevant at the size of a бекап of ~5 000 транзакцій; the sealing
happens off the interaction path anyway.

**D6. The envelope's header is plaintext and authenticated.**
Layout, as two newline-terminated lines followed by binary:

```
cap1tal-drive\n
{"envelopeVersion":1,"schemaVersion":19,"createdAt":"…","keyId":"…"}\n
<24 bytes of nonce><ciphertext and its tag>
```

The head is passed as the AEAD's associated data, so it cannot be edited to make the app open a
бекап under wrong assumptions, and it is plaintext so that `Відновити` can read a версія's real
date, refuse a newer schema and tell which код відновлення it needs **before** asking for one and
before a whole body is fetched. Being newline-delimited makes it a *prefix*: a range read of
`ENVELOPE_HEAD_MAX_BYTES` (512) answers a listing, so listing five версії costs a few kilobytes
rather than five whole бекапи. Reading the head is therefore a claim, and opening is what proves
it. The envelope-format version is separate from the бекап's schema version on purpose: changing
the cipher later must not look like a database migration.

`keyId` is D14's addition: eight bytes of keystream under the sealing key at a reserved fixed
nonce, as hex. It is a PRF output, so it names the key without revealing anything about it, and it
is what lets the app say *which* код відновлення a версія needs and refuse to prune a версія it
cannot open — both decidable from a 512-byte read.

**The бекап's checksum is deliberately *not* in the head**, though an earlier draft of this design
put it there. Nothing needs it in the clear: the date, the schema version and the key are what a
listing reads; D11 keeps `last_uploaded_checksum` on the phone, so the "has anything changed" test
never reads Drive; and `readBackup` re-verifies the бекап's own integrity value once the envelope
has opened, which is the only check that means anything. Leaving it plaintext would have published
a 32-bit fingerprint of the owner's whole state to anyone holding the folder — enough to tell that
two версії are identical, or that a phone's state matches a guessed one. It costs nothing to leave
out, so it is left out: the head carries exactly what a listing must decide from and not one field
more.

**D7. The код відновлення is the key in Crockford base32 with a checksum, in groups.**
32 random bytes → 52 base32 characters + 4 check characters, shown as eight groups of seven so a
person can copy it onto paper without losing their place. (Four check characters and not the two
this decision first named: 52 + 2 is 54, which does not divide into eight groups of seven, and the
two extra characters cost the owner nothing while widening the check from 10 bits to 20.) The
check runs over the code's own **symbols**, not over the key's bytes — a person mistypes a
character, so a substitution must move exactly one symbol by 1…31 and can never cancel out; taken
over the bytes instead, two different codes decode to the same key, because the last character
carries one significant bit and four of padding. Crockford's alphabet folds `I/L/1` and
`O/0` on read, which is exactly the transcription mistake to survive; the check characters are
what let the app say "цей код неправильний" before it downloads or decrypts anything, which is
the spec's "refused as wrong before anything is opened". Rejected: BIP-39 words (a wordlist and a
Ukrainian/English question for no gain here) and a raw hex dump (64 characters, no checksum, `b`
and `6` transcribed wrong at 3 a.m.).

**D8. The key is made once, lives in the keystore, and survives disconnecting.**
Generated at first connect from `expo-crypto`'s CSPRNG (behind a random-bytes port so tests
inject fixed bytes) and stored under a versioned key in `expo-secure-store` with
`WHEN_UNLOCKED_THIS_DEVICE_ONLY` — the same options and reasoning as
`monobank-token-store.ts`, and the reason it can never migrate to a new phone by itself, which is
what makes the код відновлення necessary rather than decorative. Disconnecting removes the Google
authorisation and **keeps** the key: reconnecting on the same phone then continues the same
backup line instead of orphaning every version already uploaded. The screen says what stays
(spec: «Від'єднати Google Drive»). Rejected: destroying the key on disconnect (turns a routine
action into irreversible data loss for anyone who did not write the code down) and deriving the
key from a passphrase (the owner chose otherwise; it also makes every daily upload wait on a KDF
or keep a derived key around anyway).

**D9. "Due" is a pure function; the background runner only asks it.**
`isBackupDue({ connected, lastSuccessAt, now, interval })` and its sibling for the catch-up path
decide everything; `expo-background-task` (WorkManager on Android, via `expo-task-manager`)
registers a task that asks it, and the app's foreground entry asks the same function. This is
what makes the whole schedule testable without fake timers, and it is why the spec can promise
"at least once per 24 hours, best-effort" honestly: the OS decides *when* we are asked, the pure
function decides *whether* we act. `expo-background-fetch` is deprecated in this SDK; a foreground-
only schedule was rejected because a phone opened rarely is exactly the phone that gets lost.
*Amended by `monobank-background-sync` (its design D2, D4):* the interval this task registers with
is now the app's one shared `BACKGROUND_TURN_INTERVAL_MINUTES`, because every registered task
rides a single WorkManager request whose delay is whichever registered last, and the task's
definition is reached from the bundle's entry (`index.ts`) rather than from the root layout, so a
chance on a process with no Activity finds it defined. Nothing this decision promises changes: a
chance every quarter of an hour costs `runBackup` one row read and one pure function when nothing
is due.

**D10. One file per версія бекапу, named by its instant; keep the newest five; prune only after a
confirmed upload.**
File name `cap1tal-YYYYMMDDTHHmmssZ.c1b` in the app folder — sortable by name, so listing needs
no metadata read, and the date the owner sees in `Відновити` comes from the authenticated header
(D6), never from the file name. Upload → read back the created file's id and size → only then
delete anything older than the newest five **of the same line** (D14): a версія this phone cannot
open is never a candidate for pruning, however old it is. Drive's own file revisions were rejected: revision
retention on appDataFolder is not something the app controls, and "five files we delete
ourselves" is a rule the spec can state and a test can prove. Which version is "current" is simply
the newest; there is no mutable pointer file to get out of step with reality.

**D11. One new singleton table, `drive_backup`, excluded from the бекап.**
Columns: `id` (CHECK single row, the `saldo_import` idiom), `account_label`, `recovery_code_-
acknowledged_at`, `last_success_at`, `last_uploaded_checksum`, `last_failure_kind`,
`last_failure_at`. No token, no key, no code — the `monobank_accounts` precedent: secrets live in
the keystore and the table exists to say what the screen shows.

`last_uploaded_checksum` is what implements "an unchanged бекап is not uploaded again" — the
бекап's own CRC-32 over its body, compared locally and never read back from Drive. Two things
follow and are accepted: a CRC-32 collision would skip one upload until the state changes again
(nothing is lost, the copy is a day older), and the owner must be told the copy is *current* rather
than left reading an ageing date as a silent failure, which is why the screen spec has a scenario
about exactly that.

Connectedness is `account_label IS NOT NULL AND recovery_code_acknowledged_at IS NOT NULL`, one
definition, so a connection abandoned on the код-відновлення step is not connected anywhere in the
app. **Both doors of D14 set that column.** A phone that mints a key sets it when the owner
acknowledges the code they were shown; a phone joining an existing line sets it the moment the код
відновлення they typed opens a версія — typing the code *is* the demonstration that they hold it,
and asking for an acknowledgement afterwards would be asking twice. Without this, the flagship
new-phone flow would connect, register no background task and never upload, which is the defect the
spec review caught in D14's first draft. One generated migration plus a
migration test, per rules/database.md; the exclusion from the snapshot is D1's fourth item.

**D12. Ports, doubles, and where each rule is proven.**
`src/platform/google-auth.ts` (authorise → typed outcome; a fresh access token from the kept
authorisation; forget), `src/platform/drive.ts` (list / upload / download / delete over D4),
`src/platform/backup-key.ts` (the keystore key, `monobank-token.ts` shape verbatim) and
`src/platform/random.ts` (CSPRNG bytes) — each a port, a double and a `*-device.ts` adapter
`verify` never loads, each with the source-hygiene test the repo already writes. Everything else
is pure and lives in `src/backup/drive/`: the envelope (D5–D6), the код відновлення codec (D7),
the schedule predicate (D9), the rotation rule (D10), the restore admissibility rule (opens →
checksum → schema known → then and only then confirmable), and the mapping from every typed
failure to the Ukrainian sentence the section shows.

**D13. The Ukrainian text of every refusal is part of this change, not an afterthought.**
The emulator smoke of `limits-goals-reports` found English engine strings surfacing in the
Ukrainian UI; the spec here therefore has a requirement about it, and the implementation puts the
failure→sentence mapping in `src/ui/` where `verify` reaches it, with a test that every member of
the failure union maps to a Ukrainian sentence that names a next step. No refusal reaches the
screen as a raw outcome name.

**D14. One line of версії has one key; a new phone joins the line rather than starting a second.**
This is the hole the spec review found, and it is the one that loses history. D8 makes the key at
*first connect*; on a new phone that is a **new** key, so the версії already in Drive become
unopenable — and D10, keeping only the newest five, would prune every one of them within five days
of a phone the owner replaced. The change would then have failed at exactly the thing it exists to
do, in the one scenario it exists for.

The resolution has three parts, all of them decidable from the 512-byte head:

1. **The head names its key** (`keyId`, D6) — eight bytes of keystream under the key at a reserved
   fixed nonce, as hex. A PRF output: it identifies the key without weakening it. Publishing
   keystream at a nonce that is never used for real data reveals nothing, and a random 24-byte
   nonce colliding with the reserved one is a 2⁻¹⁹² event.
2. **A phone with no key joins the line it finds.** Connecting where the folder already holds
   версії asks for a код відновлення and adopts the key it decodes, rather than minting one — and
   because part 3 leaves abandoned lines in the folder, two can coexist, so the line adopted is
   *whichever one the entered code opens*, decided by `keyId` and not by asking the owner which is
   which. Restoring with a код відновлення adopts it the same way. Reconnecting on a phone that
   still holds the key keeps it, exactly as D8 already said. So «the same backup line continues» is
   one rule with three doors into it, and a code that opens nothing in the folder is refused by all
   three.
3. **The app never deletes a версія it cannot open.** Rotation is scoped to the current `keyId`.
   An owner who lost the код відновлення may start afresh — after being told what it costs — and
   the old версії simply stay, unopenable and unpruned, which is the honest outcome and cheap
   (five files).

Rejected: sealing under a new key and re-uploading everything (the app cannot open the old версії
to re-seal them, which is the entire point), and deriving the key from the Google account (it would
make Google able to open the бекапи, which is what the sealing exists to prevent).

## Risks / Trade-offs

- **The OAuth client sits in Testing and refresh tokens die after seven days** → D3's check
  happens before any upload code is written; the app degrades to the already-specified "connect
  again" state, and the fallback scope needs no requirement change.
- **Google's consent screen shows an "unverified app" warning** → expected for a personal client;
  the connect flow's copy says so, and the emulator smoke test walks through it deliberately
  rather than being surprised by it.
- **The owner loses the phone and the код відновлення together** → unrecoverable by design, and
  the spec makes the app say so at the moment the code is shown. The mitigation is honesty at
  connect time, not a second copy of the key somewhere weaker.
- **`@noble/ciphers` is a new cryptographic dependency** → audited, zero-dependency, pinned; and
  because the envelope is pure TypeScript, replacing it later is a contained change behind
  D6's envelope-format version.
- **A бекап written from already-corrupted local data goes up and gets rotated in** → five kept
  versions is the whole mitigation (D10), and it is a real limit worth stating: the app does not
  audit the data it backs up.
- **A restore that goes wrong is total** → nothing local is touched until the бекап has opened,
  checksummed and parsed, and the replace itself is step 11's atomic import; this change adds no
  partial-write path of its own.
- **Uploading blocks on sealing a multi-megabyte бекап in JS** → it happens off the interaction
  path (background task or an explicit «Зберегти зараз» that shows it is running); if it ever
  proves slow enough to matter, the envelope is the one place to change.

## Migration Plan

1. `backup-file` (step 11) is implemented, archived, and exposes D1's seam.
2. This change adds the `drive_backup` table as one generated migration with its migration test.
   Nothing else in the schema moves, and no existing row is rewritten.
3. Dependencies and `app.json` change in a single task, followed by `npx expo-doctor` and a
   native build — rules/android.md's requirement, since `verify` cannot see any of it.
4. The feature ships switched off: no code path runs until the owner connects, so rollback is
   "do not connect", and reverting the change leaves a phone that has connected with an unused
   table and an unread key.
5. The emulator smoke test is the acceptance step: connect through a real Google account, watch a
   file appear, force a failure by revoking access, restore onto a wiped install with the код
   відновлення typed by hand.

## Open Questions

- How many версії бекапу to keep: five is D10's proposal and the spec deliberately says "several
  most recent", so the number can change without touching a requirement. It counts версії of the
  current line only (D14).
- Whether the daily run should also fire on a Wi-Fi-only constraint. WorkManager can express it;
  the owner has not asked, and a бекап of this size on mobile data is negligible. Deferred until
  the owner says otherwise — it changes no requirement, only the task's registration options.
