Every new test goes in the test file of the module it proves, under a `describe` naming the
capability (`backup-file`, `backup-file-screen`, `main-screen`), with the spec scenario's title as
the test name.

## 1. Storage (backup-file: "The phone remembers its last бекап, and only a real one counts")

- [ ] 1.1 Add `BackupRecord`/`BackupRecordStore` and `inMemoryBackupRecord` in `src/backup/record.ts` (design D2): `read`, `startCounting(now)` (no-op when present), `saved(now, name, figures)`, `restored(now, madeAt)`, `keepDriveUpload(at)` — the three writes upsert with `counting_since = now` when the row is missing — plus a pure `lastBackupAt(record, drive)` (design D1). Prove in `src/backup/record.test.ts`: "A Google Drive upload is a бекап", "A confirmed restore counts at the moment it lands" and "A Google Drive upload is a бекап" with all four inputs varied — file save, restore, current upload, kept upload — the latest always winning, and the `startCounting` half of "A phone with no бекап yet knows since when it has been counting"
- [ ] 1.2 Add table `backup_record` to `src/db/schema.ts` (single-row CHECK, design D2), run `npm run db:generate` (check `schema.ts` for other sessions' edits first), and write `src/db/backup-record-repo.ts` implementing `BackupRecordStore`, exported as `backupRecord` from `src/db/repos.ts`. Prove in `src/db/backup-record-repo.test.ts` against the real migrations: the table's shape, "A saved file is remembered across a restart" (a second connection reads it), that `startCounting` twice keeps the first moment, and that `keepDriveUpload` writes `last_drive_upload_at` which a second connection reads back, and that `saved` on an empty table creates the row with `counting_since` = that moment
- [ ] 1.3 Prove `backup_record` is outside the бекап and survives `applyRestore`: in `src/db/backup-repo.test.ts`, "The remembered moments do not travel in a бекап" (the made бекап holds no `backup_record` data; a restore leaves the row's `counting_since` as it was)

## 2. Recording a бекап (backup-file)

- [ ] 2.1 Give `BackupScreenPorts` a `record: BackupRecordStore`; `saveToFile` calls `record.saved` only on `ok`, `confirmRestore` calls `record.restored(now, header.createdAt)` only on `ok` (design D5). Prove in `src/ui/backup-screen.test.ts`: "A saved file is remembered across a restart" (name «cap1tal-2026-10-05.json», 12/4300), "A dismissed chooser is not a бекап", "A failed save is not a бекап", "A confirmed restore counts at the moment it lands", "A refused restore changes nothing remembered"
- [ ] 2.2 Add `restoreVersion(ports, record, preview, now)` to `src/ui/drive-backup.ts`, wrapping run-restore's `confirmRestore` and calling `record.restored` on `restored` (design D5); switch `src/app/manage/drive-backup.tsx` (`doRestore`) to it. Prove in `src/ui/drive-backup.test.ts` that a landed Drive restore sets `last_restored_*` and a refused one ("A corrupted версія бекапу is refused") does not
- [ ] 2.2a Add `disconnectKeepingLastUpload(ports, record)` to `src/ui/drive-backup.ts` (copies `lastSuccessAt` via `record.keepDriveUpload`, then disconnects) and switch the screen's disconnect to it. Prove in `src/ui/drive-backup.test.ts` "Disconnecting Google Drive after uploads" (backup-file) and in `src/backup/absence.test.ts` the main-screen scenario of the same name
- [ ] 2.3 Call `backupRecord.startCounting(new Date())` once after migrations succeed in `src/app/_layout.tsx` (design D4) and bind `record: backupRecord` in `src/app/manage/backup.tsx` PORTS (the start's idempotence is 1.2's test). Prove "A пакет для аналізу is not a бекап" in `src/backup/record.test.ts` with a structural test: the only modules under `src/` that call the store's `saved`/`restored`/`keepDriveUpload` are `src/ui/backup-screen.ts` and `src/ui/drive-backup.ts`

## 3. «Бекап» status line (backup-file-screen)

- [ ] 3.1 Add pure `lastBackupLine(record, now)` to `src/ui/backup-screen.ts` (design D8). Prove in `src/ui/backup-screen.test.ts`: "The last save is still shown the next day", "A phone that never saved a бекап says so", "A restore later than the last save is what is shown", "A restored phone that never saved a file shows the restore"
- [ ] 3.2 Render the line in `src/app/manage/backup.tsx`, read on focus and re-read after `settle`. Prove in `src/ui/backup-screen.test.ts`: "A new save replaces what is shown at once" and "Backing out leaves the last бекап shown" (the state after `saveToFile` plus `lastBackupLine` over the in-memory record)

## 4. The rail row (main-screen)

- [ ] 4.1 Add `BACKUP_ABSENCE_DAYS = 14` and pure `backupAbsence({ accountCount, record, drive }, now)` in `src/backup/absence.ts` (design D3). Prove in `src/backup/absence.test.ts`: "Fifteen days without a бекап are said", "Fourteen days are still quiet", "A phone that never had a бекап, counted from when it started counting", "A freshly updated phone is given its 14 days", "A phone with nothing to lose stays quiet", "An archived рахунок-борг is still something to lose"
- [ ] 4.2 Extend `backupAbsence` tests for the Drive half in `src/backup/absence.test.ts`: "A working Google Drive with an old upload is quiet", "A failing Google Drive is named", "The Google Drive row names Google Drive's own дата", "A recent failure after a recent upload is quiet", "Withdrawn access is named as Google Drive's", "An unfinished connection that never uploaded", "Reconnecting after a disconnect names the upload kept from before", "A newer file бекап answers for a failing Google Drive", "Saving a file clears the row", "A restore clears the row"
- [ ] 4.3 Add `backupRow` (text + destination, design D7) to `HomeAlerts` in `src/ui/home-screen.ts`, fed from `backupAbsence`; the home data load reads `backupRecord` and `driveBackupRepo` (no request). Prove in `src/ui/home-screen.test.ts`: the four wordings with «21 вересня» via `calendarLabel`, destinations «Бекап»/«Google Drive», and "The row announces nothing" (the view model carries no сума, no назва, no count; the load path touches no network/notification port)
- [ ] 4.4 Render the row in the service rail of `src/app/(tabs)/index.tsx` beside the `bank-unheard` row (neutral style, no dismiss control), routing to `/manage/backup` or `/manage/drive-backup`; recomputed on Головний's existing focus refresh. Prove "Reopening does not make it go away" in `src/ui/home-screen.test.ts` (the row depends only on stored values and `now`, with no seen/dismissed input)

## 5. Docs and smoke

- [ ] 5.1 Tick the BACKLOG item «"Останній бекап", який переживає перезапуск» as done by this change, and note in `docs/roadmap.md` §1.6 that the password remains open. Verify with `npm run verify`
- [ ] 5.2 Emulator smoke via the `smoke-runner` subagent (`.claude/rules/android.md`): «Бекап» line before/after «Зберегти у файл» and after an app restart; with the device clock set 15 days ahead, the rail row on Головний at 360 × 640 dp and 200 % text, its tap opening «Бекап»; record the verdict in this file

## 6. Gate

- [ ] 6.1 Run `npm run verify` and paste the final lines
- [ ] 6.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
