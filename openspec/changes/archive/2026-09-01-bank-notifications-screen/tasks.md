# bank-notifications-screen — tasks

## 1. Storage

- [x] 1.1 Add the three tables to `src/db/schema.ts` — `notification_watches`,
      `notification_fingerprints`, `notification_drafts` per design D1 — and generate
      migration 0007 with `npm run db:generate`; verify with `src/db/migrations.test.ts`
      covering the persistence scenarios "Existing data survives the migration" and "A fresh
      database starts empty of notification state".
- [x] 1.2 Create `src/db/notifications-repo.ts` with reads and watch writes: `watches()`
      joined with accounts so each watch carries its рахунок's currency (D1), `addWatch` /
      `removeWatch`, `pendingDrafts()` newest first, `seenFingerprints()`; register it in
      `src/db/repos.ts`; verify with `src/db/notifications-repo.test.ts` covering the
      persistence scenarios "A watch round-trips", "A removed watch stays removed" and "A
      pending чернетка round-trips whole".
- [x] 1.3 Add the atomic commits to the repo (D2): `commitOutcome` (fingerprint + draft, or
      fingerprint + auto-confirmed транзакція, in one storage transaction; nothing for
      duplicate/ignored), `confirm` (insert транзакція + delete draft), `dismiss` (delete
      draft); verify with `notifications-repo.test.ts` covering the persistence scenarios "A
      failed draft stores no fingerprint", "A committed outcome survives restart whole", "A
      settled чернетка does not return" and "A deleted транзакція keeps its fingerprint".

## 2. The drain

- [x] 2.1 Extract the epoch→date mapping to `dateOfEpochMs` in `src/ui/dates.ts` (design D6)
      and rewire the inline use at `src/app/manage/monobank.tsx:430` to it; verify with
      `src/ui/dates.test.ts` (same date across the day's bounds) and a green
      `npm run verify` proving mono's behaviour unchanged.
- [x] 2.2 Implement `drainCaptures` in `src/ui/notification-drain.ts` (design D3): collect,
      decide each capture through `processCapture` feeding committed fingerprints back into
      the seen set, commit each outcome, acknowledge only the committed prefix; verify with
      `src/ui/notification-drain.test.ts` covering the screen-spec scenarios "A notification
      captured while the app was closed becomes a чернетка", "A crash before acknowledgement
      does not double the чернетка", "A правило match lands in the feed without waiting" and
      "Outcomes that store nothing still drain the queue", using
      `inMemoryNotificationCapture` and the test db.
- [x] 2.3 Call the drain from `src/app/_layout.tsx` on mount and on AppState turning
      `active`, only while notification access answers granted (D3); the effect stays a thin
      call into the tested driver with no logic of its own; verify `npm run verify` stays
      green and Node-only (the emulator smoke exercises the real path before archive).

## 3. The «Сповіщення банків» section

- [x] 3.1 Implement the access-state logic in `src/ui/notification-settings.ts`: the section's
      explanation (what reading is for, nothing leaves the phone), the three access answers
      with their offers (denied → system screen, unsupported → nothing, granted → management),
      re-read on return; verify with `src/ui/notification-settings.test.ts` covering the
      scenarios "Granting flips the section to granted", "An unsupported build offers nowhere
      to go" and "Revoked access is reported as denied again".
- [x] 3.2 Implement watch management in the same module (design D4): the curated known-apps
      list without monobank plus hand entry, add = engine `addWatch` then
      `setWatched(full set)` with the row stored only on `ok` and refused/unavailable shown
      unchanged, remove = reduced set then row delete; verify with
      `notification-settings.test.ts` covering "A watched app appears with its рахунок", "The
      monobank app is not offered and its package is refused", "A refused set changes
      nothing", "An already-watched app is rejected", "An archived рахунок is not offered"
      and "A removed watch leaves its чернетки".
- [x] 3.3 Create the screen `src/app/manage/notifications.tsx` over that logic (access state
      re-read on focus, list, picker, removal — design D5) and add the «Сповіщення банків»
      row to `src/ui/settings-sections.ts` and the Налаштування tab; verify with
      `src/ui/settings-sections.test.ts` covering the settings-screen scenarios "The tab
      opens on its sections" and "The bank-notifications section opens access and watches",
      and a green `npm run verify`.

## 4. The Головний surface

- [x] 4.1 Implement the pending-чернетки lines in `src/ui/drafts-section.ts`: newest first,
      each with рахунок name, date, text and its proposal label (витрата / дохід
      «Без джерела» with сума and currency, raw with no сума, the original-currency
      reference as information), and no surface when none pending; verify with
      `src/ui/drafts-section.test.ts` covering "A drafted витрата shows its proposal", "A
      raw чернетка shows its text and the missing сума", "The newest чернетка stands first"
      and "No pending чернетки, no surface".
- [x] 4.2 Implement confirm and dismiss decisions in the same module: confirm = engine
      `confirmDraft` with the правила re-read at that moment then `repo.confirm`; raw
      confirm asks the сума through the manual-entry amount rules (`parseAmountInput`);
      dismiss = confirmed `repo.dismiss`; verify with `drafts-section.test.ts` covering "An
      unmatched витрата confirms into «Без категорії»", "A правило created after drafting is
      honoured", "A чернетка on an archived рахунок still confirms", "A confirmed дохід
      keeps «Без джерела»", "A raw чернетка without a сума
      stays pending", "The supplied сума becomes the витрата", "A foreign reference rides
      the confirmed витрата", "A dismissed чернетка is gone for good" and "The dismissed
      notification does not come back".
- [x] 4.3 Render the чернетки block above the feed in `src/app/(tabs)/index.tsx` wired to the
      repo and the tested handlers, the dismiss behind the same confirmed gesture deletion
      uses (design D5); verify `npm run verify` stays green (the block's logic lives in the
      tested module; the emulator smoke sees the pixels before archive).

## 5. Verification

- [x] 5.1 Run `npm run verify` and paste the final lines
- [x] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
