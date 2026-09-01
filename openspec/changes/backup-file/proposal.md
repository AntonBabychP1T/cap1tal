# backup-file — proposal

## Why

Everything the owner knows about their money — every рахунок, every транзакція since the Saldo
import, every категорія, правило, ліміт and ціль — is one SQLite file inside one app's private
storage on one phone. There is currently no way to get a copy of it out, and no way to put one
back. A wiped phone, a reinstall, an Android «Очистити дані» tap or a new device ends both
product questions at once: «куди пішли гроші» has no history to answer from, and «скільки ще
можна витратити» has no balances to compute from.

This change is step 11 of tech-task §5 (FR-B1–B2): one versioned file the owner can save by hand
and, on a clean installation, restore from — with its integrity checked and what it would replace
shown before anything local is touched. It is also the foundation the next step stands on:
`google-drive-backup` (step 12) already wrote its design against a seam this change must expose
(its D1), and cannot start until this one is archived.

## What Changes

- **New capability `backup-file`** — what a бекап *is* and what may be done with one:
  - **One file, one format, versioned.** A бекап is a single text file carrying a format version,
    the schema version it was written under, the moment it was made, an integrity value, and the
    owner's whole state: рахунки with their opening balances and archived flags, категорії,
    джерела, правила, ліміти, цілі, every транзакція of all five types with описи and
    original-currency amounts, the Saldo import marker, the monobank accounts a token has shown
    with their links, sync boundaries, cursors and imported item ids, and the відстежувані
    застосунки of bank notifications. Ids are preserved verbatim — the schema was built for this.
  - **Named exclusions, and they are not an oversight.** The monobank token is never in a бекап
    (FR-B2); it does not live in the database at all. Neither are the raw payloads of bank
    notifications, their fingerprints, the pending чернетки or the on-device capture queue
    (vision §12, and the promise `bank-notifications-capture` made), nor the monobank rate cache,
    which is a cache and re-fetches itself. A бекап holds what the owner has confirmed as their
    money, not what the phone has merely overheard.
  - **Integrity is checked before trust.** The file carries a checksum over its own body; a
    truncated, half-written or edited бекап is refused by name, not silently half-restored.
  - **Versions are compared, not assumed.** A бекап from a newer format or a newer schema than
    this installation understands is refused with what to do about it; a бекап from an older
    schema is still read, because what the file holds is the domain's entities and not table rows.
  - **Restore replaces, and says so first.** Before anything local changes, the owner is told the
    бекап's date and what it holds — how many рахунки and транзакції, which months it spans — and
    that restoring replaces everything now on the phone (vision §12: recovery, not merging).
    Restoring is one unit: it either replaces the whole state or leaves the phone exactly as it
    was. There is no partial and no selective restore. The pending чернетки go with the world
    they named; the fingerprints stay, so a notification already decided cannot be drafted twice.
  - **Every refusal is a state.** An unreadable file, a wrong format, a failed checksum, a newer
    schema, a бекап whose own contents contradict each other (a транзакція on a рахунок the бекап
    does not contain) — each is an answer the owner is shown, and each leaves local data untouched.
- **New capability `backup-file-screen`** — the «Бекап» section of Налаштування: «Зберегти у
  файл», which produces the file and hands it to the system so the owner can put it wherever they
  keep such things, and «Відновити з файлу», which picks a file, shows the бекап's date and
  contents beside what would be replaced, asks for confirmation, and reports the result or the
  refusal in the owner's own words. It also states plainly that the file holds financial data and
  is not encrypted.
- **Modified capability `settings-screen`** — the tab's section list gains «Бекап», which opens
  that screen.
- **Modified capability `persistence`** — storage learns two things it cannot do today: read the
  whole stored state as one consistent snapshot, and replace the whole stored state with a
  restored one as a single unit that either lands completely or changes nothing.

Non-goals, deliberately:

- **No encryption of the local file.** Vision §12 requires the encryption and recovery-key
  contract to be decided and tested before *Google Drive* backup ships; a file the owner saves by
  hand and keeps themselves is plaintext in v1, and the screen says so instead of implying
  otherwise. Step 12 owns the envelope.
- **No automatic, scheduled or background backup, no status history, no Google Drive** — all of
  that is step 12 (FR-B3–B4). This change stores no «last backup» state and adds no table.
- **No local notification when a backup fails** — actionable alerts are step 13 (FR-N2).
- **No merging, no selective restore, no second editing device** (vision §14.1).
- **No new migration and no schema change.** Everything a бекап holds is already stored.
- **No iOS work beyond staying possible** (§14.15): the one device-facing step — handing a
  finished file to the system — sits behind a port like every other.

## Capabilities

### New Capabilities

- `backup-file`: the бекап contract — the versioned single-file format and exactly what it holds;
  the exclusions that may never appear in it; the integrity value; the format- and schema-version
  rules; the preview a restore must produce before it replaces anything; the atomic
  replace-everything restore; and every refusal as a named state.
- `backup-file-screen`: the «Бекап» section of Налаштування — «Зберегти у файл» and «Відновити з
  файлу», the preview and confirmation before replacing, the plain statement that the file is
  unencrypted, and success and failure in Ukrainian.

### Modified Capabilities

- `settings-screen`: the section list gains «Бекап», which opens the backup and restore flow.
- `persistence`: storage SHALL read the whole stored state as one snapshot and SHALL replace the
  whole stored state atomically from a restored one — neither exists today.

## Impact

- **Unblocks `google-drive-backup`** (step 12), whose design D1 names the seam: a snapshot with
  its bytes, versions, moment and checksum; a pure header read for the preview; an atomic restore;
  and an enumerated exclusion list its own test asserts against. This change is built to that
  seam, and reconciles D1's one loose end — the checksum covers the бекап's body, not the
  envelope that carries it.
- **No new npm dependency**: the file leaves the phone through Android's Storage Access
  Framework and comes back through the document picker — `expo-file-system` and
  `expo-document-picker` are already dependencies and are the path the Saldo import already
  walks. Design D8 names the alternative that was rejected and why.
- **Native/config**: nothing. No new permission, no config plugin, no hand edit under `android/`.
- **New code**: `src/backup/**` for the pure parts — the snapshot shape, the canonical
  serialisation the checksum is computed over, the checksum itself, the version rules, the
  restore preview and every refusal — plus `src/platform/backup-file.ts` as the port with an
  in-memory double beside it and a device adapter `verify` never loads; `src/db/backup-repo.ts`
  for the whole-state read and the atomic replace; `src/ui/backup-screen.ts` for the screen's
  pure logic and `src/app/manage/backup.tsx` for the screen itself.
- **Database**: no migration, no new table, no changed column. The atomic replace runs inside one
  SQLite transaction over the existing tables.
- **`npm run verify` stays Node-only and under a minute**: the format, the checksum, the version
  rules, the preview and every refusal are pure functions over injected values, and the repo
  round-trip runs against the same in-memory SQLite the other repositories are tested on.
- **Docs**: `docs/glossary.md` gains **бекап** and **відновлення** so specs and screens use the
  owner's terms verbatim; `docs/tech-task.md` §5 row 11 moves from ⏳ to its real state at archive
  time.
- **Scheduling note**: `settings-screen` is also modified by `bank-notifications-screen`,
  `first-run-onboarding` and `google-drive-backup`. Per BACKLOG's own rule, this change does not
  run in the same wave as those.
