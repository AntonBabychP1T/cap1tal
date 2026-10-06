## Context

See proposal.md (Why). What exists today:

- **File бекап** (`src/ui/backup-screen.ts`, `src/app/manage/backup.tsx`): `saveToFile` makes the
  бекап, hands it to the Storage Access Framework through `BackupFilePort.save`
  (`src/platform/backup-file-device.ts`: `requestDirectoryPermissionsAsync` → `createFileAsync` →
  `writeAsStringAsync`) and returns a `saved` state whose sentence lives in React state only.
  Nothing is persisted; the BACKLOG item is exactly this.
- **Google Drive** (`src/backup/drive/*`, table `drive_backup`, `src/db/drive-backup-repo.ts`):
  `lastSuccessAt`, `lastFailureKind`/`lastFailureAt` and `accountLabel` are persisted; `isConnected`
  = account **and** код acknowledged; `recordWithdrawn` clears the acknowledgement and keeps the
  label and `lastSuccessAt`; `disconnect` clears everything. An unchanged бекап is not uploaded and
  leaves `lastSuccessAt` untouched (google-drive-backup, "An unchanged бекап is not uploaded
  again"). `drive_backup` is deliberately outside `BACKUP_TABLES`.
- **Головний's service rail** (`src/ui/home-screen.ts` `HomeAlerts`, `src/app/(tabs)/index.tsx`):
  the uncategorised banner, the drafts row, the monobank failure row and the `bank-unheard` row.
  `calendarLabel(dateOfEpochMs(ms), now)` already writes «21 вересня» in words.
- **Failure сповіщення** (`src/ui/alerting.ts`, kind `'backup'`): a failed save or upload already
  notifies once (§13). Unchanged by this change.

## Goals / Non-Goals

**Goals:** one pure rule for the rail row, testable under `verify` with `now` passed in; one small
local table holding what the phone remembers about its file бекапи and restores; no new network,
permission or native code.

**Non-Goals:** touching the Drive upload/run logic or `drive_backup`'s shape; touching the бекап
format or `BACKUP_SCHEMA_VERSION`; a settings entry for the threshold.

## Decisions

### D1. What counts as a бекап

| Event | Counts? | Why |
|---|---|---|
| «Зберегти у файл» returns `ok` (file written via SAF to the chosen folder) | yes, at `now` of the save | the file exists where the owner put it |
| chooser dismissed (`cancelled`), `unavailable`, `failed` | no | backup-file-screen already forbids claiming these |
| Drive upload completes (`recordSuccess`) | yes, `lastSuccessAt` | already persisted |
| Drive run finds the бекап unchanged | does not move the date | but a connected Drive with no failure silences the row anyway (D3) |
| confirmed restore lands (file or Drive) | yes, at the moment it lands | the phone then holds exactly what a бекап the owner has holds; counting the restored бекап's own older date would show the row right after a restore on a new phone, which is noise, not risk |
| refused/failed restore, пакет для аналізу, репорт | no | nothing was saved |

| Google Drive disconnected | keeps the last upload | `drive_backup`'s row is deleted on disconnect (`drive-backup-repo.ts` `disconnect`), so its `lastSuccessAt` is copied into `backup_record.last_drive_upload_at` first (D5) |

`lastBackupAt = max(lastFileSaveAt, lastRestoreAt, drive.lastSuccessAt, keptDriveUploadAt)`.

Counting a restore is **[PROPOSED]** in the proposal, like the 14 days.

Alternative considered: only a file save and a Drive upload count, never a restore. Rejected: a
new phone restored from a file would be told on day one that it has no бекап.

### D2. Storage: one new single-row table `backup_record`

Columns (instants as `timestamp_ms`): `id` (`'phone'`, single-row CHECK — the `drive_backup`
idiom), `counting_since` NOT NULL, `last_saved_at`, `last_saved_name`, `last_saved_accounts`,
`last_saved_transactions` (integers, counts not money), `last_restored_at`,
`last_restored_made_at`, `last_drive_upload_at` (the last completed upload, kept across a
disconnect). `saved`, `restored` and `keepDriveUpload` are upserts: when the row is missing they
create it with `counting_since = now`, so no write depends on the launch having run first. Generated migration via `npm run db:generate`; no hand-written data
statement (the counting start is written by the app, D4). Not added to `BACKUP_TABLES`, so a бекап
never carries it and `applyRestore`'s replacement leaves it alone; the restore path then writes
`last_restored_*` itself (D5). Repository `src/db/backup-record-repo.ts`, exposed as
`backupRecord` from `src/db/repos.ts`; port + in-memory double `BackupRecordStore` in
`src/backup/record.ts` (the `DriveBackupStateStore` pattern), so `src/ui` logic is tested without
SQLite and the repo is tested against the real migrations.

Alternative considered: a key/value preference row. Rejected: the repo has no generic settings
table, and every comparable bookkeeping item (`drive_backup`, `saldo_import`) is its own row.

### D3. The rule (pure): `backupAbsence(input, now)` in `src/backup/absence.ts`

Input: `accountCount` (all рахунки, archived and debt included), the `backup_record` value, and
the `DriveBackupState`. Output: `null` or `{ kind: 'file' | 'drive', since?: Date }`.

1. `accountCount === 0` → `null`.
2. `remembered = drive.accountLabel !== undefined`. If `isConnected(drive)` and no
   `lastFailureKind` → `null`.
3. `anchor = lastBackupAt ?? countingSince`; `days = calendarDaysBetween(localDate(anchor),
   localDate(now))`. `days <= BACKUP_ABSENCE_DAYS` (14, named constant) → `null`.
4. Otherwise `remembered` → `{ kind: 'drive', since: drive.lastSuccessAt ?? record.keptDriveUploadAt }`, else
   `{ kind: 'file', since: lastBackupAt }`; `since` absent when there is none. The 'drive' row is
   worded from Google Drive's own last upload only (the current connection's, else the one kept
   from before a disconnect) — never a file save's or a restore's дата — while
   its 14-day condition stays on `lastBackupAt`.

Withdrawn access (`accountLabel` kept, acknowledgement cleared) and an unfinished connection both
land on `'drive'`; `disconnect` clears the label and lands on `'file'`. Calendar days in local
time, matching how the rest of Головний speaks of dates; reuses `src/domain/dates.ts` helpers.

### D4. The counting start is written once at launch

After `useStorageMigrations` succeeds in `src/app/_layout.tsx`, `backupRecord.startCounting(now)`
inserts the row if absent (`INSERT … ON CONFLICT DO NOTHING`). Background tasks do not call it:
they never render Головний, and the next opening writes it. Writing it from Головний's render
was rejected — the rail reads, it does not write.

### D5. Where the record is written

- `saveToFile` (`src/ui/backup-screen.ts`) on `ok`: `record.saved(now, name, figures)`; the
  `BackupScreenPorts` gains `record: BackupRecordStore`.
- `confirmRestore` (`src/ui/backup-screen.ts`) on `ok`: `record.restored(now, header.createdAt)`.
- Drive restore: today `src/app/manage/drive-backup.tsx` calls run-restore's `confirmRestore`
  directly. A new `restoreVersion(ports, record, preview, now)` in `src/ui/drive-backup.ts` wraps
  it and calls `record.restored(now, madeAt)` on `restored`; the screen calls that instead. The
  Drive run module keeps its six ports.
- Drive disconnect: a new `disconnectKeepingLastUpload(ports, record)` in `src/ui/drive-backup.ts`
  calls `record.keepDriveUpload(state.lastSuccessAt)` when there is one, then the existing
  disconnect; the screen calls it instead of disconnecting directly.
- So the only writers of the record besides `startCounting` are `src/ui/backup-screen.ts` and
  `src/ui/drive-backup.ts`, which a structural test holds.
- The «Бекап» section reads `record.read()` on focus and after a save, and renders the status
  line from a pure `lastBackupLine(record, now)` in `src/ui/backup-screen.ts`.

### D6. No notification (vision §13)

The row is the whole of it. §13 allows the app to post only for a failed action, the daily
нагадування and the нагадування про платіж; a бекап that nobody started has not failed, and §3's
rail exists precisely so what waits for an answer is seen on opening without being pushed. A
failed save or upload already raises the `'backup'` сповіщення про збій and that stays. Adding a
fourth kind of notification would need the owner's decision in the vision first.

### D7. Wording (Ukrainian, in `src/ui/home-screen.ts`)

- `'file'`: «Бекапу не було з 21 вересня · Зберегти» / «Бекапу ще не було · Зберегти» → «Бекап».
- `'drive'`: «Google Drive не зберігає бекап з 1 вересня · Подробиці» (Drive's own date) / «Google Drive ще не
  зберіг бекап · Подробиці» → «Google Drive».

The date goes through `calendarLabel`, so `uniform-fields`' decision for another year applies
here automatically. Neutral rail styling (the `bank-unheard` row's), not the failure colour.

### D8. «Бекап» status line

«Останній бекап: 5 жовтня, cap1tal-2026-10-05.json — 12 рахунків, 4300 транзакцій» /
«Телефон відновлено 6 жовтня з бекапу від 30 серпня» (also when no file was ever saved) / «На цьому телефоні бекапу у файл ще не
було». The plural helpers in `src/ui/labels.ts` are reused.

## Risks / Trade-offs

- [SAF may save under a different display name than requested, e.g. «cap1tal-2026-10-05 (1).json»
  when the folder already holds one] → the line shows the name the app gave; acceptable, the date
  is the load-bearing part. If the adapter can read the created document's display name cheaply it
  may return it in `ok`, but that is not required.
- [A phone where nothing changes for 15 days shows the row although its last бекап is still
  complete] → unlikely for a daily tracker with monobank sync; deliberately not solved by comparing
  checksums for file бекапи, which would make every Головний load build a бекап.
- [The owner's phone sees no row for 14 days after the update even if their last real file бекап
  was months ago] → accepted: the app cannot know about a save it did not record; «Бекап» says «ще
  не було» from the first day.
- [Headless Drive upload updates `drive_backup` while Головний is open] → the rail is recomputed
  on Головний's existing focus/refresh path, like the monobank rows.

## Migration Plan

One generated, append-only migration creating `backup_record`. No data migration; the counting
row appears at the first launch. Rollback: an older build ignores the table.

## Open Questions

- **For the owner:** is 14 days right, and should it be a setting in «Бекап»? (Default 14,
  constant only.)
- **For the owner:** confirm the **[PROPOSED]** rule that a restore counts as a бекап (D1).
- **For the owner:** should the `'file'` row also point at «Google Drive» as the way to stop
  thinking about it, or stay as plain as it is?
