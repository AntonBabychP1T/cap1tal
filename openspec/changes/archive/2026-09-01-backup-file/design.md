# backup-file — design

## Context

See proposal.md — Why. What shapes every decision below:

- **`google-drive-backup` (step 12) already wrote its design against a seam this change must
  expose** (its D1: a snapshot with bytes, versions, moment and checksum; a pure header read for a
  preview; an atomic restore; and an enumerated exclusion list). That document is a consumer
  contract, and D1 below answers it point by point rather than inventing a different shape.
- **Everything a бекап holds is already stored.** The schema was built for this: «Ids are
  app-generated TEXT so export/import can preserve them» (`src/db/schema.ts`). No table, no column
  and no migration is needed — which is also why this change adds none.
- **The repo's platform idiom is settled.** Anything touching a device sits behind a port in
  `src/platform/` with an in-memory double beside it and a device adapter `npm run verify` never
  loads (`monobank-token.ts`, `notification-capture.ts`). Failures are values, not exceptions.
- **`npm run verify` is Node-only and under a minute.** Repositories are tested against
  `better-sqlite3` with the real migrations applied; the domain and `src/ui` are pure. Nothing
  here may need an emulator to be proven.
- **`android/` is generated and never hand-edited**; a native need is expressed in `app.json` or a
  config plugin, and every new dependency is named before it is added. This change needs neither.
- **Money and the domain are untouched.** This change copies stored values out and puts them back.
  It computes no місячна картина, invents no транзакція and converts no currency.

## Goals / Non-Goals

**Goals:**

- One file format, defined once, provable end to end under Vitest in Node: writing, reading,
  damage, truncation, a wrong version, a self-contradicting бекап, and a full round trip through
  real migrations on an in-memory database.
- Every rule that decides *whether* something happens — is this file a бекап, is its integrity
  value right, is its version acceptable, does its content stand together, what would a restore
  replace — is a pure function over injected values, with no clock, no device and no file system.
- A restore that cannot half-happen and cannot happen by surprise.
- A seam step 12 can pick up without reopening this design.

**Non-Goals:**

- No abstraction over «backup destinations». There is one destination in this change — a file the
  owner puts somewhere — and Drive is step 12's, behind its own port.
- No streaming or chunked writing. A бекап of this history is about a megabyte (D10 measures it);
  it is one string.
- No encryption and no key handling (proposal's non-goals; vision §12 ties that contract to step
  12). The screen says the file is unencrypted rather than implying otherwise.
- No undo of a restore, no merge, no selective restore. The preview and the confirmation are what
  stand between the owner and a replacement.

## Decisions

**D1. The seam is exactly what step 12's design asked for, with one reconciliation.**
`src/backup/` exports:

1. `makeBackup(state, now): BackupSnapshot` — `{ bytes, formatVersion, schemaVersion, createdAt,
   checksum }`, where `bytes` is the whole file as UTF-8 text. The database read that produces
   `state` is `src/db/backup-repo.ts`'s, so the pure part takes a value and returns a value; the
   thin `saveBackup()` the screen calls is what does the reading and returns a `Promise`, which is
   the signature step 12's D1 names.
2. `readBackup(bytes): BackupHeader | BackupRefusal` — a pure parse and check: format, versions,
   integrity, self-consistency, and the counts a preview needs (moment, рахунки, транзакції, first
   and last month). It touches no storage, which is what makes «preview before anything is
   replaced» true rather than merely intended.
3. `restoreBackup(bytes): Promise<'ok' | BackupRefusal>` — `readBackup` first, then one atomic
   replacement through `backup-repo`.
4. **The exclusion list is enumerated in one place** — `src/backup/format.ts` — as the tables a
   бекап holds, so step 12's «the Drive state table is not among them» test has something to
   assert against, and so adding a table forces a decision here (D5's version test is the tripwire).

The reconciliation: step 12's D1 says the checksum is «over those bytes». It cannot be — the value
lives inside the file it would cover. It covers the бекап's **body**, canonically serialised
(D4); the envelope carries it. Nothing in step 12 depends on which of the two it was.

**D2. The file is JSON over the domain's own values, not a copy of the SQLite file.**
A бекап is UTF-8 JSON: an envelope (`app`, `kind`, `formatVersion`, `schemaVersion`, `createdAt`,
`checksum`) around a `data` object of arrays — рахунки, категорії, джерела, правила, ліміти, цілі,
транзакції, the Saldo marker, monobank accounts/links/imported ids, відстежувані застосунки.
Rejected alternatives: **shipping the `.db` file** (opaque to the owner, pins a бекап to the exact
schema it was written under — the thing D5 deliberately avoids — and needs the live database handle
closed and swapped under a running app), and **a SQL dump** (the same coupling, in a format nothing
else in the repo can read or test). JSON is what `verify` can prove line by line, what a person can
open when something goes wrong, and what step 12 can hand to a cipher unchanged.

**D3. The snapshot carries the two pieces of storage metadata that decide order.**
Domain entities alone would restore a history that lists differently: `transactions.createdAt` is
what breaks ties between transactions of the same дата in the latest listing, and `rules.createdAt`
is the tie-break between two equally specific правила — the schema calls the second «domain data
here, not storage metadata». Both travel in the бекап; `backup-repo` writes them verbatim rather
than stamping «now», so a restored phone lists exactly what the old one listed. Every other piece
of storage metadata (row ids of tables that have none, SQLite rowids) is not in the бекап and is
not depended on.

**D4. Integrity is a CRC-32 over a canonical serialisation of the body.**
The checksum covers `canonicalJson(data)` — object keys sorted, no insignificant whitespace, arrays
in their stored order — so the value can be recomputed from the *parsed* бекап and survives a file
being re-indented by whatever tool the owner passes it through. Rejected: **SHA-256 from a new
dependency** (`@noble/hashes`) — a dependency and a promise of tamper-resistance this file cannot
keep anyway, since anyone who can edit an unencrypted бекап can recompute any checksum in it;
**a hand-rolled SHA-256** — writing crypto by hand for a job that is not cryptographic; **a checksum
over the raw file bytes** — breaks on any reformatting, and cannot be verified from the parsed
object. What CRC-32 is for is stated in the spec's own words: damage, truncation, a half-written
file. Tamper-resistance is step 12's AEAD envelope, where it belongs.

**D5. Two versions, both explicit; the storage-shape version is asserted against the migration journal.**
`formatVersion` (1) is the shape of the envelope and is bumped by hand when that shape changes.
`schemaVersion` is the number of committed migrations the бекап was written under, kept as a
constant in `src/backup/format.ts` — and a test reads `drizzle/meta/_journal.json` and fails unless
the constant equals the number of entries. Adding a migration therefore fails `verify` until
someone looks at this file and asks whether a бекап still holds everything it should; that tripwire
is the point, not the number. Restore refuses a бекап naming a version higher than the app's, and
accepts a lower one, because the file holds entities and not table rows: an older бекап simply
names fewer things.

**D6. Restore is validate-then-replace: a pure check for the message, one SQLite transaction for the truth.**
`readBackup` produces every named refusal — not a бекап, damaged, newer version, self-contradicting
— before storage is touched at all, because that is the only way the screen can say *why* in the
owner's words. `backup-repo.replaceAll(snapshot)` then does the writing inside a single
`db.transaction`, deleting in reference order and inserting in dependency order (рахунки, категорії
and джерела first; правила, ліміти, цілі, транзакції, monobank rows and watches after). The
transaction is the safety net, not the validation: if anything is still rejected — a CHECK, a
foreign key — nothing is written and the phone is as it was. `import-repo.ts` already does exactly
this for the Saldo plan and is the model to follow.

**D7. What a restore does to what the бекап does not hold.**
The pending чернетки are deleted with the state they named: each references a рахунок of the world
being replaced, so keeping them is neither meaningful (they propose money on a рахунок that may be
gone) nor possible (the reference is `onDelete: 'restrict'`). The fingerprints of already-decided
notifications survive untouched — they reference nothing, and keeping them is what stops a
notification the owner already decided from being drafted a second time after a restore. The
monobank rate cache survives because it is a cache. The monobank token is neither read nor written
by any part of this change, which is what makes FR-B2 a property of the code and not a promise.

**D8. The file leaves the phone through Android's Storage Access Framework, with no new dependency.**
`StorageAccessFramework` from `expo-file-system/legacy` asks the owner for a folder, creates the
file in it and writes it. Rejected: **`expo-sharing`** — a new dependency whose `shareAsync`
resolves the same way whether the owner saved the file or dismissed the sheet, which would make the
spec's «backing out claims nothing» unprovable and the screen's success message a guess; and
**writing into the app's own storage and showing a path** — on Android that folder is not reachable
by the owner, so nothing was backed up in any sense that matters. The port's outcome is
`ok | cancelled | unavailable | failed`, and «cancelled» is exactly the permission dialog the owner
dismissed. The API is deprecated in Expo's newer file-system surface; it lives behind the port, so
replacing it later is one file (see Risks).

**D9. The file comes back the way a Saldo export already does.**
`expo-document-picker` picks it and `expo-file-system`'s `File(...).text()` reads it — the exact
path `src/app/manage/saldo-import.tsx` uses today, both already dependencies. A picked file that
cannot be read is `unreadable`, one more value the screen shows.

**D10. Where the code lives, and why every piece of it is provable in Node.**

| Where | What | Proven by |
| --- | --- | --- |
| `src/backup/format.ts` | the envelope, the versions, the enumerated table list | pure unit tests |
| `src/backup/canonical.ts` | canonical serialisation + CRC-32 | pure tests incl. known vectors |
| `src/backup/backup.ts` | `makeBackup`, `readBackup`, refusals, the preview counts | pure tests |
| `src/db/backup-repo.ts` | the whole-state read and the atomic `replaceAll` | in-memory SQLite over real migrations |
| `src/platform/backup-file.ts` | the port + `inMemoryBackupFiles()` double | used by the screen's tests |
| `src/platform/backup-file-device.ts` | SAF + document picker; `verify` never loads it | emulator smoke |
| `src/ui/backup-screen.ts` | the screen's states, labels and the preview rows | pure tests |
| `src/app/manage/backup.tsx` | the screen | emulator smoke |

Size: the owner's imported history is 27 рахунки and 188 транзакцій today, and the vision's
performance target names ~5 000 транзакцій. At roughly 200 bytes of JSON per транзакція that is
about a megabyte — one string, read and written whole, the same way the Saldo CSV already is.

**D11. The screen is a small state machine, and «Відновити» has two stops.**
States: `idle` → (save) `saving` → `saved | cancelled | failed`; and `idle` → (restore) `picking` →
`refused(reason)` | `previewing(бекап beside the phone)` → (confirm) `restoring` → `restored |
failed`. Nothing restores without passing `previewing`, and the preview's figures for «the phone»
come from the same snapshot read the бекап's do, so the two columns are counted the same way. The
confirmation names what is about to be replaced in numbers, not in adjectives.

## Risks / Trade-offs

- **`expo-file-system/legacy`'s SAF is deprecated and may be removed in a future SDK** → it is
  reached only through `src/platform/backup-file.ts`; the replacement (a small local module, or
  `expo-sharing` with a weaker success claim) changes one file and no spec except, possibly, the
  «backing out claims nothing» scenario. Named here so that trade-off is a decision and not a
  surprise.
- **CRC-32 detects damage, not tampering** → stated in the spec and on the screen: the file is
  unencrypted and anyone holding it can change it. Step 12's envelope is what makes a бекап
  unforgeable, and it is a step away.
- **A restore is destructive and has no undo** → the preview shows both sides in numbers and the
  owner confirms; the screen's copy invites saving a бекап of the current state first. Nothing
  automates a restore, and nothing restores at app start.
- **One string in memory** → about a megabyte at the vision's own history size; if a history ever
  outgrows that, the port and the format both allow a stream later without changing the spec.
- **The `settings-screen` requirement is edited by four in-flight changes at once** → whichever
  archives last defines the section list, so this change must not share a wave with
  `bank-notifications-screen`, `first-run-onboarding` or `google-drive-backup`, and its delta
  already carries their sections.
- **The schema-version tripwire fires on every migration**, including ones that change nothing a
  бекап holds → that is the intent; bumping the constant is one line, and the alternative is a
  бекап that silently stops holding a new table.

## Migration Plan

No database migration: no table, column or index changes, and `drizzle/` is untouched.

Rollout is the ordinary one — `verify`, `diff-reviewer`, commit, then the emulator smoke, which for
this change must cover: saving a бекап to a real folder and reading the file back; restoring it
onto a phone with different data; a file that is not a бекап; a бекап edited by hand so its
checksum fails; and backing out of both the folder chooser and the confirmation. A passing test
suite is not evidence that SAF works on the device.

Rollback is reverting the code. Nothing this change ships changes stored data on its own — the only
destructive act is a restore the owner explicitly confirmed, and a бекап of the previous state is
the thing the screen tells them to make first.

## Open Questions

- **The file's extension and MIME type** — `.json` with `application/json` is what SAF will be
  asked for first; if Android's own chooser handles a `.cap1tal` extension better on the device,
  the smoke run will show it. Neither choice changes a requirement, the format or a task.
