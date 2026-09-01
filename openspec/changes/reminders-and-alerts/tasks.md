# reminders-and-alerts — tasks

## 1. The dependency and the config

- [x] 1.1 `npx expo install expo-notifications` (57.0.x, matching SDK 57 — design D1), add its
      config plugin and Android's `POST_NOTIFICATIONS` to `app.json`, and run `npx expo-doctor`;
      verify `npm run verify` stays green and Node-only — nothing under `src/` imports the module
      yet, and no test may ever load it.

## 2. The pure parts

- [x] 2.1 Create `src/reminders/time.ts` — `TimeOfDay`, `parseTimeOfDay(text)` returning a value or
      a named refusal, `formatTimeOfDay`, `DEFAULT_REMINDER_TIME` 21:00 (design D3, D11); verify
      with `src/reminders/time.test.ts` covering the `reminders-screen` scenarios "A new time is
      taken", "A value that is not a time changes nothing" and "An empty time changes nothing" —
      «09:30», «9:30», «21:00» accepted, «25:70», «abc», «» and «12:60» refused.
- [x] 2.2 Create `src/reminders/notices.ts` — the table of everything the app can post: the
      нагадування and one entry per failure kind (collecting bank notifications, monobank sync,
      Saldo import commit, local save, бекап file), each with its stable id, its Ukrainian title
      and body as parameterless constants, and its route; plus `routeOf(data)` (design D4, D9,
      D10); verify with `src/reminders/notices.test.ts` covering the `reminders-and-alerts`
      scenarios "A collection failure says nothing about what was captured", "The нагадування
      carries no numbers" and "An unrecognised destination opens Головний" — the test walks every
      entry and asserts no digit, no currency code and no interpolation slot appears in any of the
      words, and that every route is one the app defines.
- [x] 2.3 Create `src/reminders/alerts.ts` — `decideAlert({ kind, outstanding, attended })` →
      `{ post } | 'attended' | 'already-outstanding'`, and the clearing decision (design D5, D6);
      verify with `src/reminders/alerts.test.ts` covering the `reminders-and-alerts` scenarios "The
      same failure three times is one сповіщення", "A failure the owner is looking at raises
      nothing" and "Two different failures stand side by side".
- [x] 2.4 Create `src/reminders/schedule.ts` — `reconcile({ preference, permission, scheduled })` →
      `{ act: 'schedule', at } | { act: 'cancel' } | { act: 'nothing' }`, answering `schedule`
      whenever the нагадування is on and the permission is granted, even when one is already
      arranged (design D12); verify with `src/reminders/schedule.test.ts` covering the
      `reminders-and-alerts` scenarios "A fresh install reminds the owner of nothing", "What the
      app believes is reconciled with what the phone holds", "A time zone change keeps the hour the
      owner chose", "A permission revoked behind the app's back is not hidden" and "Changing the
      time moves the one нагадування" — including the case where the system holds a нагадування the
      preference says is off.

## 3. The port

- [x] 3.1 Create `src/platform/local-notifications.ts` — the port (`permission()`, `ask()`,
      `openSettings()`, `scheduleDaily(notice, at)`, `cancelDaily(id)`, `scheduledIds()`,
      `post(notice)`, `clear(id)`, answering `granted | denied | unsupported`) and
      `inMemoryLocalNotifications()` beside it, on the `notification-access.ts` model (design D2);
      verify with `src/platform/local-notifications.test.ts` that the double records what was
      scheduled, posted, cancelled and cleared, that an `unsupported` double offers no system
      screen, and that `verify` loads no native module — the `reminders-and-alerts` scenario "A
      build that cannot notify says so".
- [x] 3.2 Create the device adapter `src/platform/local-notifications-device.ts` over
      `expo-notifications` — the permission request and its three answers, the daily trigger with a
      stable identifier, the two channels «Нагадування» and «Збої» with private lock-screen
      visibility, immediate posting, dismissal, and the system notification-settings screen (design
      D1, D9); verify it is imported by no test and that `npm run verify` stays Node-only — the
      emulator smoke of section 9 is what proves this file.

## 4. Storage

- [x] 4.1 Add the `daily_reminder` and `alerts` tables to `src/db/schema.ts` (design D7 — the
      single-row CHECK on the preference, no CHECK on the failure kind, and the reason in the
      comment) and generate migration 0008 with `npm run db:generate`; verify with
      `src/db/migrations.test.ts` covering the `persistence` scenarios "Existing data survives the
      migration" and "A fresh database starts with nothing to announce".
- [x] 4.2 Create `src/db/reminders-repo.ts` — reading and writing the preference, listing the
      outstanding сповіщення, raising one (keeping the moment of the first raise) and clearing one
      — and register it in `src/db/repos.ts`; verify with `src/db/reminders-repo.test.ts` covering
      the `persistence` scenarios "The setting round-trips", "A device never asked loads as off",
      "Changing the setting leaves one setting", "An outstanding failure round-trips", "Raising the
      same action twice stores one" and "Clearing one leaves the others", and that a kind not in
      `notices.ts` is refused.
- [x] 4.3 Sort the two tables into the бекап (design D8) — `daily_reminder` into `BACKUP_TABLES`
      and the бекап body, `alerts` among the named exclusions, `BACKUP_SCHEMA_VERSION` 8 → 9, and
      the snapshot and replacement in `src/db/backup-repo.ts`; verify with
      `src/backup/format.test.ts` (the journal tripwire and the exclusion assertions) and
      `src/db/backup-repo.test.ts` covering the `reminders-and-alerts` scenarios "The reminder
      comes back with the бекап" and "Another phone's failures do not arrive", plus an older бекап
      naming no reminder restoring as off.

## 5. Raising and clearing

- [x] 5.1 Create `src/ui/alerting.ts` — `raise(kind, { attended }, ports)` and `clear(kind, ports)`
      over the port and the repository, on the `notification-drain.ts` model (design D5, D6);
      verify with `src/ui/alerting.test.ts` against `inMemoryLocalNotifications()` and the test
      database, covering the `reminders-and-alerts` scenarios "A failed collection raises a
      сповіщення", "The same failure three times is one сповіщення", "Success clears it", "A
      restart does not announce the same failure again", "A failure is announced with no network"
      and "A failure without notifications is still remembered".
- [x] 5.2 Create `src/ui/reminder-schedule.ts` — applying a `reconcile` answer through the port
      (ask the permission when turning on, schedule, cancel) and returning what the section should
      show; verify with `src/ui/reminder-schedule.test.ts` covering the `reminders-and-alerts`
      scenarios "Turning it on arranges it for the chosen time", "A granted permission arranges
      it", "A refused permission leaves it off", "Turning it off leaves nothing arranged" and "No
      network is needed".

## 6. The «Нагадування» screen

- [x] 6.1 Implement the section's logic in `src/ui/reminders-screen.ts` — the permission state in
      Ukrainian, whether the system screen is offered, the switch's state, the time as text and its
      refusals, and the sentences about what the app posts and never posts; verify with
      `src/ui/reminders-screen.test.ts` covering the `reminders-screen` scenarios "The section says
      what the app will post", "A refused permission offers where to grant it", "A device that
      cannot notify offers nothing to press", "Turning it on with permission granted", "Turning it
      on with permission refused", "Turning it off asks nothing", "A value that is not a time
      changes nothing", "An empty time changes nothing" and "The privacy promise is on the screen".
- [x] 6.2 Create the screen `src/app/manage/reminders.tsx` over that logic — the switch, the time
      field, the permission line with its way to the system settings, and the two sentences about
      what is posted — refreshing the permission on foreground with `use-on-foreground.ts` (design
      D12), and add the «Нагадування» row to `src/ui/settings-sections.ts` between «Сповіщення
      банків» and «Бекап»; verify with `src/ui/settings-sections.test.ts` covering the
      `settings-screen` scenarios "The tab opens on its sections" and "The reminders section opens
      the reminder and its time", and with `src/ui/reminders-screen.test.ts` reading the `.tsx` by
      path for the `reminders-screen` scenario "Returning from the system screen updates the
      state", the way `src/ui/` tests already read screens.

## 7. Wiring

- [x] 7.1 Reconcile on launch in `src/app/_layout.tsx` — after the migrations, read the preference,
      the permission and what the system holds, and apply `reconcile`, re-asserting the schedule
      rather than checking it (design D12); verify with a code-read plus
      `src/ui/reminder-schedule.test.ts`'s reconciliation cases, and by the `reminders-and-alerts`
      scenarios "A restart does not lose it" and "A time zone change keeps the hour the owner
      chose" in the smoke of section 9.
- [x] 7.2 Route a tapped notification in `src/app/_layout.tsx` — the cold-start response once and a
      subscription to warm ones, both after the migrations, through `routeOf` (design D10); verify
      with `src/reminders/notices.test.ts`'s routing cases and the `reminders-and-alerts` scenarios
      "A tap while the app is closed opens Головний" and "A tap while the app is running opens
      Головний" in the smoke of section 9.
- [x] 7.3 Raise and clear at the five call sites — the drain in `src/app/_layout.tsx`
      (`attended: false`), the sync in `src/app/manage/monobank.tsx`, the commit in
      `src/app/manage/saldo-import.tsx`, saving and restoring in `src/app/manage/backup.tsx`, and
      the чернетка commit and manual entry in `src/app/(tabs)/index.tsx` (each passing whether the
      app is in front of the owner), plus the clear on opening each of those screens and Головний
      (design D5, D6); verify with `src/ui/alerting.test.ts` covering the `reminders-and-alerts`
      scenarios "A sync that fails after the owner left the app raises a сповіщення", "A failed
      import commit leads back to the import", "A failure the owner is looking at raises nothing"
      and "Opening the screen it leads to clears it", and by a code-read that no existing failure
      message on those screens changed.
- [x] 7.4 Raise the collection kind when notification access is withdrawn while відстежувані
      застосунки exist — in the same drain path in `src/app/_layout.tsx`, before it gives up
      (design D5a); verify with `src/ui/alerting.test.ts` covering the `reminders-and-alerts`
      scenarios "Withdrawn notification access is announced like a failed collection" and
      "Withdrawn access with nothing watched announces nothing".

## 8. Words and the map

- [x] 8.1 Add **нагадування** and **сповіщення про збій** to `docs/glossary.md` in the owner's
      terms, and move `docs/tech-task.md` §5 row 13 to its real state; verify `npm run verify`
      stays green and the terms the specs use appear verbatim in the glossary.

## 9. Emulator smoke (manual, scripted — rules/android.md)

- [ ] 9.1 Prebuild and install after the new dependency (`scripts/android.sh up`), open
      «Налаштування» → «Нагадування», turn the switch on, and screenshot the system permission
      dialog and the section afterwards showing the нагадування on for its time.
- [ ] 9.2 Set the time a couple of minutes ahead, lock the phone, and screenshot the нагадування as
      it arrives on the lock screen — confirming it names no сума and no рахунок — then tap it and
      screenshot Головний.
- [ ] 9.3 Deny the permission in Android's settings while the app is closed, reopen the app, and
      screenshot the section reporting the refusal with the way to the system screen, and nothing
      claiming a нагадування will arrive.
- [ ] 9.4 Force a failure the owner is not watching — turn off the network mid-sync from «monobank»
      and leave the app — and screenshot the сповіщення про збій, the screen it leads to, and the
      section afterwards; confirm a second failure of the same action adds no second сповіщення and
      that a successful retry clears it.
- [ ] 9.5 Restart the phone with the нагадування on and confirm it still arrives the next day (or
      with the device clock moved), so the boot case is proven on a device and not only in a test;
      then change the emulator's time zone, reopen the app, and confirm exactly one нагадування is
      arranged and it still names the hour the owner chose.
- [ ] 9.6 Withdraw «Доступ до сповіщень» in Android's settings while a відстежуваний застосунок
      exists, reopen the app, and screenshot the сповіщення про збій and «Сповіщення банків» it
      leads to; confirm reopening a second time adds no second one.

## 10. Verification

- [x] 10.1 Run `npm run verify` and paste the final lines
- [ ] 10.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
