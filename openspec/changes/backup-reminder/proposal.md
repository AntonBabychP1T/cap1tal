## Why

Every answer the app gives to the vision's two questions — where the money went this month and how
much is left — lives only in this phone's database. A phone lost or reset without a бекап takes
months of history and with it the «залишилось» the owner was learning to trust (§15). The app can
already make a бекап two ways — a file the owner saves by hand («Бекап») and an opt-in sealed copy
in their own Google Drive («Google Drive») — but nothing tells the owner when neither has happened
for weeks. Worse, «Бекап» forgets its own success: «Бекап від 2026-09-01 збережено: …» vanishes
with the screen and is gone after a restart (BACKLOG «"Останній бекап", який переживає
перезапуск»), so the owner cannot even look up when they last saved one. This is roadmap item 1.6
of «Горизонт 1», without the password for the file.

## What Changes

- **The phone remembers its last бекап.** A file бекап counts the moment it is written to the
  folder the owner chose (not when the chooser is dismissed, not when writing fails). A Google
  Drive upload counts when it completes; that moment is already kept, and disconnecting Google
  Drive no longer forgets it. **[PROPOSED]** A confirmed restore counts too, at the moment it lands: the phone then holds exactly what a бекап the owner has holds.
  Nothing else counts — not a пакет для AI-аналізу, not a репорт про помилку, not a Drive run that
  found nothing changed.
- **«Бекап» shows the last бекап and keeps showing it.** After leaving the section and after a
  restart, it says when the last file бекап was saved, under which name, and how many рахунки and
  транзакції it held — or, after a restore, which бекап the phone was restored from and when — or,
  plainly, that this phone has not saved one yet. No folder path: the system's folder chooser does
  not reliably tell the app where the file went, and the app does not pretend to know.
- **Головний quietly says when there is no бекап for longer than 14 days.** One compact row in the
  service rail under the header, like the no-token row: no notification, no sound, no dialog, no
  colour of a failure, nothing to dismiss — the answer is a бекап. It appears only when the phone
  holds at least one рахунок and either:
  - Google Drive is not looking after it (no Google account remembered for backup): «Бекапу не
    було з 21 вересня» or «Бекапу ще не було», and its tap opens «Бекап»; or
  - a Google account is remembered but the copy is not going up — a failure is standing, Google
    withdrew access, or connecting was never finished: «Google Drive не зберігає бекап з 1
    вересня», dated by Google Drive's own last upload (or «ще не зберіг» when there was none), and
    its tap opens «Google Drive».

  While Google Drive is connected and no failure stands, the row never appears, however old the
  last upload: an unchanged бекап is deliberately not uploaded again, so an old date there is not a
  sign of trouble. **[PROPOSED]** 14 days, counted in calendar days, is a named constant.
- **A phone that never had a бекап** counts from the first time a version of the app with this
  change was opened on it, so the owner's own phone gets 14 days after the update, and a fresh
  install 14 days after its first opening, before the row appears.
- **Nothing new leaves the phone.** The row is computed from local data, makes no request, and the
  remembered last бекап is this phone's own bookkeeping: it is not in a бекап, a пакет для
  аналізу or a репорт про помилку.

### Non-goals

- A password or encryption for the file бекап (the other half of roadmap 1.6) — a separate change.
- A notification about a missing бекап. §13 allows a local notification only for an action that
  failed, the daily нагадування and the нагадування про платіж; a бекап nobody started is not a
  failed action, and the vision wants this said quietly. Not adding one; see design D6.
- Automatic file бекапи, a backup schedule of its own, or prompting to connect Google Drive from
  Головний.
- Snoozing or hiding the row, and a setting for the 14 days (open question for the owner).
- Any change to how Google Drive uploads, retries, rotates or restores, or to the бекап format.

## Vision mapping

Neither question can be answered from a history that is gone. This change protects both: it
serves §12 ("The app shows the last successful backup and failures") and §3 (what waits for an
answer stays put beneath the header). §13 stands: it adds no notification of any kind. It touches no
§14 item: §14.9 stands (Google Drive stays the only cloud service and opt-in), §14.1 stands
(backup is recovery for one phone).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backup-file`: ADDED — what counts as this phone's last бекап, that it survives a restart and
  is never carried in a бекап.
- `backup-file-screen`: ADDED — «Бекап» shows the last бекап (or the restore, or none yet) and it
  survives leaving the section and restarting.
- `main-screen`: ADDED — the service-rail row for a бекап absent longer than 14 days, its two
  wordings and destinations, and when it stays silent.

## Impact

- **Code**: a new pure rule (when the row shows and what it says) in a domain/ui module taking
  `now`; a new one-row local table for the last file бекап and the counting start, with its
  repository and an append-only migration; `src/ui/backup-screen.ts` and `src/app/manage/backup.tsx`
  write and show it; the restore paths (file and Drive) record a restore; Головний's service rail
  gains one row (`src/ui/home-*.ts`, `src/app/(tabs)/index.tsx`). Reads the existing
  `drive_backup` row; changes nothing in it.
- **No** new native module, permission, package, `app.json` or config-plugin change; no network.
- **Sequencing with siblings**:
  - `answer-queue` restructures what sits under Головний's header into one «Що потребує
    відповіді» entry. Not in the same wave: whichever lands second either keeps this row in the
    rail or turns it into a queue entry with the same condition and destination.
  - `uniform-fields` owns the one date text format; this change writes dates «21 вересня» in words
    already and must follow whatever it decides for a date in another year.
  - `quick-entry`, `observations-by-weight` and `commitments-from-recurring` also edit
    `main-screen`, in other requirements; no conflict in content, but the delta files touch the
    same main spec — archive one at a time.
