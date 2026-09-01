# backup-file — tasks

## 1. The format, as pure functions

- [x] 1.1 Create `src/backup/canonical.ts` — `canonicalJson(value)` (object keys sorted, no
      insignificant whitespace, arrays in order) and `crc32(text)` over its UTF-8 bytes, hex
      (design D4); verify with `src/backup/canonical.test.ts`: the CRC-32 known vector
      (`"123456789"` → `cbf43926`), a value serialised identically whatever order its keys were
      built in, and re-indenting a serialised body leaving the checksum unchanged when it is
      recomputed from the parsed value.
- [x] 1.2 Create `src/backup/format.ts` — the envelope types, `BACKUP_FORMAT_VERSION = 1`,
      `BACKUP_SCHEMA_VERSION` and the enumerated list of what a бекап holds (design D1, D5);
      verify with `src/backup/format.test.ts`: the tripwire reading `drizzle/meta/_journal.json`
      and asserting `BACKUP_SCHEMA_VERSION` equals the number of committed migrations, and the
      exclusion assertions — the list names no rates table, no fingerprints, no чернетки, no
      capture queue and nothing that could hold the monobank token (`backup-file` scenario
      "Nothing secret and nothing overheard reaches the file").
- [x] 1.3 Implement `makeBackup(state, now)` in `src/backup/backup.ts` — the envelope over a
      canonical body with its checksum, versions and moment (D1, D2, D3, including each
      транзакція's `storedAt` and each правило's `createdAt`); verify with
      `src/backup/backup.test.ts` covering the `backup-file` scenario "Identifiers are preserved"
      over `makeBackup` → `readBackup` on the same value.
- [x] 1.4 Implement `readBackup(bytes)` in the same module — parse, then every refusal as a value:
      not a бекап, damaged (checksum), truncated, newer format version, newer schema version
      (D5, D6); verify with `backup.test.ts` covering the `backup-file` scenarios "An edited бекап
      is refused", "A truncated бекап is refused", "A file that is not a бекап is refused", "A
      бекап from a newer app is refused, not half-read" and "A бекап from a newer storage shape is
      refused".
- [x] 1.5 Add the self-consistency check to `readBackup` — a транзакція, ліміт, ціль or watch
      naming a рахунок, категорія or джерело the бекап does not hold; a ціль whose currency is not
      its рахунок's; a сума that is not an integer in minor units or has no currency code; verify
      with `backup.test.ts` covering the `backup-file` scenarios "A transaction pointing outside
      the бекап stops the restore" and "A ціль in another currency than its рахунок stops the
      restore".
- [x] 1.6 Add the preview counts to `readBackup`'s header — the moment, the count of рахунки and
      транзакції and the first and last month its транзакції fall in (D11); verify with
      `backup.test.ts` covering the `backup-file` scenario "The бекап describes itself before it is
      restored", and the `backup-file` scenario "An older бекап still restores" over a body naming
      no watches.

- [x] 1.7 Make `asEnvelope` require `createdAt` to name a real instant, not merely to be a string —
      the checksum covers the body and not the envelope (D4), so a hand-edited or third-party file
      naming a moment that is not one was read as `ok` and only threw later, in
      `previewOf` → `todayIso`, where the screen has no refusal to show; verify with
      `backup.test.ts` covering the `backup-file` scenario "A бекап whose moment is not one is
      refused".

## 2. Storage

- [x] 2.1 Create `src/db/backup-repo.ts` with the whole-state read — every рахунок, категорія,
      джерело, правило, ліміт, ціль and транзакція with its `storedAt`, the Saldo marker, the
      monobank accounts, links, cursors and imported ids, and the watches — and register it in
      `src/db/repos.ts`; verify with `src/db/backup-repo.test.ts` covering the `persistence`
      scenarios "Everything stored is in the snapshot exactly once" and "The snapshot leaves out
      the cache and the captures".
- [x] 2.2 Implement `replaceAll(snapshot)` in the same repository — one `db.transaction`, deleting
      in reference order (чернетки with the state they named) and inserting in dependency order,
      leaving the fingerprints and the rate cache alone (design D6, D7); verify with
      `backup-repo.test.ts` covering the `persistence` scenarios "A replaced state is the
      snapshot's and nothing else", "A replacement that fails partway stores nothing" and "The
      rate cache and the fingerprints survive a replacement".
- [x] 2.3 Wire `saveBackup()` and `restoreBackup(bytes)` in `src/backup/backup.ts` over the
      repository (D1) — read → `makeBackup`; `readBackup` → `replaceAll`, refusals passed through
      untouched; verify with `src/db/backup-repo.test.ts` covering the `backup-file` scenarios
      "Every transaction type survives the round trip", "The distinctions of the glossary survive
      the round trip", "Configuration comes back with the money", "What the бекап does not hold is
      gone", "Restoring the same бекап twice changes nothing the second time", "The чернетки go,
      the fingerprints stay", "Sync does not re-import what was already imported" and "A restore
      that fails partway leaves the phone as it was", against real migrations on the in-memory
      database.
- [x] 2.4 Carry the moment a link last synced, which `month-start-and-polish` added to
      `monobank_links` after 2.1 was written — the optional `lastSyncedAtMs` on
      `BackupMonobankLink` and its parse in `src/backup/format.ts`, the `monobankLinks` read and
      insert in `src/db/backup-repo.ts` — so a restored link says when it was last synced instead
      of reading as one that never has. Absent stays absent rather than becoming a moment (D5: an
      older бекап names fewer things); verify with `backup-repo.test.ts` covering the `persistence`
      scenario "Everything stored is in the snapshot exactly once" and the `backup-file` scenarios
      "Configuration comes back with the money" and "A link that has never synced is restored as
      one that never has".
- [x] 2.5 Delete `entry_defaults` in `replaceAll` ahead of `accounts`, whose рахунок it references
      with `onDelete: 'restrict'` — without it every restore on a phone where the owner has ever
      recorded by hand dies with `FOREIGN KEY constraint failed`, so the exclusion `format.ts`
      already declares («A restored phone learns it again the first time they record by hand») is
      a promise the delete order could not keep; verify with `backup-repo.test.ts` covering the
      `backup-file` scenario "The remembered рахунок goes with the phone it was learned on".

## 3. The file, behind a port

- [x] 3.1 Create `src/platform/backup-file.ts` — the port (`save(name, text)` →
      `ok | cancelled | unavailable | failed`, `pick()` → `ok(text) | cancelled | unreadable`) and
      `inMemoryBackupFiles()` beside it, on the `monobank-token.ts` model (design D8, D9); verify
      with `src/platform/backup-file.test.ts` that the double answers each outcome and that
      `verify` loads no native module.
- [x] 3.2 Create the device adapter `src/platform/backup-file-device.ts` — Storage Access
      Framework from `expo-file-system/legacy` for saving (folder permission dismissed =
      `cancelled`), `expo-document-picker` plus `File(...).text()` for picking, exactly the path
      `src/app/manage/saldo-import.tsx` already walks; verify it is imported by no test and that
      `npm run verify` stays Node-only (the emulator smoke is what proves the device path).

## 4. The «Бекап» screen

- [x] 4.1 Implement the screen's logic in `src/ui/backup-screen.ts` — the state machine of design
      D11, the file name carrying the date, the preview rows putting the бекап beside the phone,
      and every refusal and result as Ukrainian text; verify with `src/ui/backup-screen.test.ts`
      covering the `backup-file-screen` scenarios "A saved бекап is reported by what it holds",
      "Backing out claims nothing", "A save that fails says so", "A file that is not a бекап is
      named as such", "A damaged бекап is named as damaged", "A бекап from a newer app is named as
      such", "The preview puts the бекап beside the phone", "Backing out of the preview restores
      nothing" and "A failed restore changes nothing", over `inMemoryBackupFiles()` and the test
      database.
- [x] 4.2 Create the screen `src/app/manage/backup.tsx` over that logic — the two actions, the
      words that the file is unencrypted and that restoring replaces everything, the preview and
      its confirmation — and add the «Бекап» row to `src/ui/settings-sections.ts`; verify with
      `src/ui/settings-sections.test.ts` covering the `settings-screen` scenarios "The tab opens on
      its sections" and "The backup section opens saving and restoring", and the
      `backup-file-screen` scenarios "The section opens on its two actions and its warning" and "A
      successful restore is reported and visible" read from the `.tsx` by path the way
      `src/ui/` tests already read screens.

## 5. Words and the map

- [x] 5.1 Add **бекап** and **відновлення** to `docs/glossary.md` in the owner's terms, and move
      `docs/tech-task.md` §5 row 11 to its real state; verify `npm run verify` stays green and the
      terms the specs use appear verbatim in the glossary.

## 6. Verification

- [x] 6.1 Run `npm run verify` and paste the final lines
      `Test Files 89 passed (89)` / `Tests 1477 passed (1477)` /
      `✔ verify passed (767e72660852c84327a02787008fca0d899cf53f)` — the tree carrying 1.7 and 2.5,
      the two CRITICAL findings of the 6.2 review. The stamp is the run that proved that code;
      writing this note moved it, as ticking any box does.
- [x] 6.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      **PASS** (0 critical, 4 warnings), on `git diff ac6fe2f..ace3b3e` restricted to the 19 files
      this change names — that commit carries several changes at once. The reviewer filled the
      requirement → implementation → test table for every scenario of `backup-file`,
      `backup-file-screen`, the `settings-screen` delta and the two `persistence` requirements with
      no empty cell, and checked besides: no сума is a float or a decimal string (every one goes
      through `money()` in `src/backup/format.ts:238`), `figuresOf` never sums across currencies,
      the delete order in `replaceAll` covers every `restrict` FK onto `accounts`, `categories`,
      `sources` and `monobank_accounts`, no committed migration was edited, and
      `BACKUP_SCHEMA_VERSION = 11` still matches `drizzle/meta/_journal.json`.

      Two warnings fixed here:
      - `src/db/backup-repo.test.ts:310` asserted `not.toContain('СІЛЬПО ')`, which cannot fail:
        «СІЛЬПО» ends the чернетка's text, so the searched substring is absent whether the
        чернетка leaked into the snapshot or not. It is now `not.toContain('Приват24 Списання')`.
        «СІЛЬПО» alone cannot be asserted — a транзакція of the same fixture carries it as its own
        опис, and that one belongs in the бекап; the comment beside it now says so.
      - `src/ui/backup-screen.ts:161` re-implemented `failureMessage(error)`, which already exists
        at `src/ui/labels.ts:110` in a file this one already imports from. It now calls it.

      Two recorded rather than fixed:
      - This change's `settings-screen` delta enumerates ten sections; `reminders-and-alerts`
        modifies the same requirement with eleven, «Нагадування» included. Whichever is archived
        last overwrites the other, so the decision is recorded here: **`backup-file` is archived
        first**, and `reminders-and-alerts` — which is not finished — carries «Нагадування» in
        afterwards. Archiving them the other way round would silently delete «Нагадування» from
        the spec.
      - §7.1's fix is a StyleSheet value (`column: { flex: 1 }`) that `verify` cannot see, and the
        re-smoke §7 asks for is not recorded. It is the one thing standing between this change and
        `/opsx:archive`.

## 7. What the emulator showed (2026-09-01)

The smoke of this change found one defect. Everything else it exercised held: the section's two
actions and both warnings, a бекап saved through Android's own folder chooser and reported as
«Бекап від 2026-09-01 збережено: 2 рахунки, 8 транзакцій.», the file named by its date, the
preview reached from a picked file, and «Скасувати» leaving the section with nothing claimed and
nothing changed.

- [x] 7.1 The preview cuts the phone's own column. `src/app/manage/backup.tsx:152` styles the pair
      as `columns: { flexDirection: 'row', gap: Spacing.four }` over `column: { gap: Spacing.half }`
      with no `flex`, so each half takes the width its own text wants. «Рахунки» (2 / 2) and
      «Транзакції» (8 / 8) fit; «Місяці» does not — the бекап's «Червень 2026 — Вересень 2026»
      takes what it wants and the phone's span is pushed past the card and clipped to
      «Червень 2026 — В».
      Requirement: backup-file-screen «The preview puts the бекап beside the phone» — the phone's
      half is the half that goes unread, and it is half of the comparison the preview exists for.
      Fix: `flex: 1` on `.column`, so the two halves share the width and a long span wraps instead
      of leaving the card. Re-smoke the preview afterwards.

## 8. The re-smoke §7.1 asked for (2026-09-01, after the fix)

`emulator-5554` (Pixel_10_Pro, API 37), on a device carrying 6 рахунків and 83 транзакції, so the
«Місяці» span is long on both sides — the condition that produced the defect.

- **The preview** — «Бекап» and «Телефон» now sit in equal columns, and each renders «Червень 2026
  — Вересень 2026» wrapped onto two lines wholly inside the card. «Рахунки» 6 / 6 and «Транзакції»
  83 / 83 both read in full. Compared frame by frame against the original defect shot, where the
  phone's half read «Червень 2026 — В» and ran off the card's edge. §7.1 is closed.
- **Saving**, on the way there, reported «Бекап від 2026-09-01 збережено: 6 рахунків, 83
  транзакції.» through Android's own folder chooser.
- **«Скасувати»** returned the section to its two plain actions with no result line, and Головний
  still showed the pre-restore money — nothing was replaced.
