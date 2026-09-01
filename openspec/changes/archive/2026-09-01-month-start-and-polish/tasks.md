# month-start-and-polish — tasks

Seven groups in the order of design D11. Groups 1–2 both edit `src/ui/month-screen.ts` and
`src/app/(tabs)/month.tsx`; groups 5–6 both edit `src/ui/notification-settings.ts`; groups 6
(native) and 7 (migration) never parallelise with anything. Every group ends on a green
`npm run verify`.

## 1. Місяць leads with a number that means something

- [x] 1.1 Add `lead: NumberKey` and `note: string | null` to `MonthCurrencyGroup` in
      `src/ui/month-screen.ts` (design D1): `lead` is `'left'` while that currency's дохід is above
      zero and `'spent'` otherwise, and `note` carries the sentence saying no дохід is recorded for
      the month yet exactly when the lead is `'spent'`. All six rows keep their names, their сума
      and their order. Verify with `src/ui/month-screen.test.ts` covering the month-screen scenarios
      "A month before its first дохід leads with витрачено", "A month with дохід leads with
      залишилось" and "Each currency decides its own leading number".
- [x] 1.2 Render it in `src/app/(tabs)/month.tsx`: the row whose key is `lead` in the `lead` text
      type, the note under it, the other five below in the order the model gives them — the screen
      adds no decision. Proves the same three scenarios against the tested model; `npm run verify`
      green.

## 2. An empty month points at the month that has numbers

- [x] 2.1 Extend `monthView` in `src/ui/month-screen.ts` with `previousTransactions` and a
      `previous: { month, label, spent: readonly MonthNumberRow[] } | null` (design D2), non-null
      only when the shown month holds no транзакція and the previous month holds at least one, its
      витрачено per currency taken from the monthly picture of that month. Verify with
      `src/ui/month-screen.test.ts` covering the month-screen scenarios "The first day of a month
      points at the month that has numbers", "Two empty months in a row offer nothing" and "The
      previous month is stated per currency".
- [x] 2.2 Load `transactionsRepo.listMonth(prevMonth(month))` alongside the shown month in
      `src/app/(tabs)/month.tsx` and render the previous-month line with one action that sets the
      shown month to `prevMonth(month)` — the same state the back step writes. Proves the
      month-screen scenario "Taking the offer shows the previous month" in two halves: the model's,
      in `month-screen.test.ts`, and the wiring's, structurally in the same file — the screen is
      held to writing `setShown(prevMonth(shown))` exactly twice, once for the back arrow and once
      for the offer, so a second way to be on the previous month fails `verify` rather than a
      device. Smoked on the emulator besides. `npm run verify` green.

## 3. Звіти opens on a month that happened

- [x] 3.1 Change the spelled-out-month fallback in `src/ui/reports-screen.ts` (design D3) to the
      newest month of the span in which витрачено, дохід or інвестовано is non-zero in the shown
      currency, falling back to the newest month of the span when none is; the same fallback
      catches a picked month the span no longer holds. Verify with `src/ui/reports-screen.test.ts`
      covering the reports-screen scenarios "A month that has not started yet is not the one
      spelled out", "An all-zero history still spells out its newest month" and "The newest month
      is spelled out first"; `npm run verify` green.

## 4. Three one-file readings

- [x] 4.1 Return `` `Готово ${done}/${total}` `` from `onboardingSummary` in `src/ui/onboarding.ts`
      (design D4) and update the existing expectations. Verify with `src/ui/onboarding.test.ts`
      covering the first-run-setup scenarios "The count cannot be read as a third number" and "The
      view says how much of the setup is behind the owner".
- [x] 4.2 Add the pure `overLimitBy(spent, limit): Money | null` to `src/domain/limits.ts` beside
      `overLimit` — `spent − limit` in the ліміт's currency when over, `null` otherwise. Verify
      with `src/domain/limits.test.ts` covering over, exactly at, under and no ліміт, in integer
      minor units.
- [x] 4.3 Extend `categoryMonthHeading` in `src/ui/category-transactions.ts` with the category's
      per-currency витрачено for the shown month, from the same `categoryBreakdown` the row came
      from, and the overrun from `overLimitBy` (design D5). Verify with
      `src/ui/category-transactions.test.ts` covering the month-screen scenarios "The category's
      own сума is stated", "An over-limit category says by how much", "Spending at the ліміт states
      no overrun", "A category with no ліміт states no overrun" and "Two currencies are stated
      apart".
- [x] 4.4 Render the сума and the overrun in `src/app/category/[month]/[categoryId].tsx` above the
      транзакції, and give `Screen` in `src/components/surfaces.tsx` an optional
      `scrollRef` it passes to its `ScrollView` (design D6). No behaviour change to any other
      screen: the proof is `npm run verify` staying green with every existing test untouched.
- [x] 4.5 Hold that ref in `src/app/(tabs)/index.tsx` and scroll it to the top from
      `useFocusEffect`, without touching what the feed shows. Proves the main-screen scenarios
      "Coming back lands at the start of the entry form" and "Scrolling within the screen is
      untouched"; `npm run verify` green.

## 5. «Сповіщення банків» says one thing

- [x] 5.1 Reproduce the two labels on the emulator (`scripts/android.sh up`, then open
      «Сповіщення банків», open the add form, cancel it, and read the screenshots) and record in
      this file what the second label was and where it came from — or record that it did not
      reproduce (design D7). No code change in this task.

      **Reproduced.** On `emulator-5554` (Pixel, API 37): «Сповіщення банків» drew
      «Додати застосунок» before the add form had been opened, and «Додати» after the form was
      opened and cancelled — the last word gone. It then stayed «Додати» on every later visit to
      the screen, including after leaving to Налаштування and coming back; only restarting the app
      brought the whole label back.

      It came from `Action` (`src/components/form.tsx`), not from the section: the label is drawn
      once, from one literal, and nothing in `notifications.tsx` can change it. `Action`'s
      `ThemedText` carried no `numberOfLines`, so Android re-measured the label after the add
      form's `Field` had resized the window and painted it a word short. This is the same defect
      `RowAction` right below it documents and guards against («Усі транзакції та пошук» → «Усі
      транзакції та») — that guard is `daily-usability`'s, in flight beside this change rather than
      committed at `ac6fe2f`; it was simply never applied to `Action`. `Action` takes
      `adjustsFontSizeToFit` with it, which `RowAction` does not need: `RowAction`'s pill is sized
      to its whole title, while `Action` fills its column, so at a large system font the longest
      verbs would have ellipsized where they used to wrap. Shrinking the word beats losing it.
- [x] 5.2 Move the label of the affordance that opens the add form into
      `src/ui/notification-settings.ts` as one exported constant, use it wherever that affordance
      is drawn in `src/app/manage/notifications.tsx`, and fix whatever 5.1 found. Verify with
      `src/ui/notifications-screen.test.ts` covering the bank-notifications-screen scenario "The
      label of the add affordance does not change"; `npm run verify` green.

## 6. Only the bank apps this phone has

- [x] 6.1 Add `installedAmong(packages): Promise<readonly string[] | 'unknown'>` to
      `NotificationCapturePort` in `src/platform/notification-capture.ts` and to
      `inMemoryNotificationCapture` (answering `'unknown'` unless the double is told otherwise, and
      always `'unknown'` when `unavailable`). Verify with
      `src/platform/notification-capture.test.ts` covering the double's two answers.
- [x] 6.2 Change `appChoices` in `src/ui/notification-settings.ts` to
      `appChoices({ watches, installed })`, keeping every rule it has — monobank never offered, an
      already-watched app never offered — and filtering the known apps by `installed` unless it is
      `'unknown'`. Verify with `src/ui/notification-settings.test.ts` covering the
      bank-notifications-screen scenarios "Only installed bank apps are offered", "A device that
      cannot answer offers the whole list" and "No installed bank app leaves the hand-named
      package".
- [x] 6.3 Add the `<queries>` block naming every `KNOWN_BANK_APPS` package to
      `modules/notification-capture/android/src/main/AndroidManifest.xml` (design D8 — named
      packages, never `QUERY_ALL_PACKAGES`), and add the Node-only test that reads that manifest as
      text and asserts every `KNOWN_BANK_APPS` package appears in it, so `verify` fails the day the
      two lists drift.
- [x] 6.4 Implement `installedBankApps` in
      `modules/notification-capture/.../NotificationCaptureModule.kt` over `PackageManager` and wire
      it through `src/platform/notification-capture-device.ts`, then ask the device from
      `src/app/manage/notifications.tsx` and pass the answer to `appChoices`. This slice needs a
      fresh native build: smoke it with `scripts/android.sh up` (rebuild, not an existing APK) and
      check the picker against what the emulator actually has installed. `npm run verify` green.

      **Smoked** on `emulator-5554` after a real `assembleDebug`: the `<queries>` block is in the
      merged app manifest, and «Додати застосунок» now opens a form with no «Банк» picker at all —
      the emulator has none of the eight known bank apps — while «Або пакет застосунку» and its
      rules are untouched. The picker's absence is itself the proof the native call answered: an
      `'unknown'` would have offered the whole list.

      `scripts/android.sh` did not consider `modules/` when deciding whether the APK was stale, so
      `up` would have reinstalled the old APK and the new native method would simply not have been
      there — the very "green `verify`, dead call" failure the function's own comment describes.
      `apk_is_stale` now looks at `modules/` too (its own `android/build/` output excepted).

## 7. monobank says when it last synced

- [x] 7.1 Add the nullable `last_synced_at` (`timestamp_ms`) column to `monobank_links` in
      `src/db/schema.ts`, generate the migration with `npm run db:generate` (design D9 — additive,
      no backfill), and add `markSynced(monobankAccountId, at)` plus the moment on
      `StoredMonobankLink` to `src/db/monobank-repo.ts`. Verify with `src/db/migrations.test.ts`
      covering the persistence scenarios "An existing link survives gaining the moment" and "A
      fresh database supports monobank metadata but not the token", and with the monobank repo test
      covering "A stored moment reads back unchanged", "A link that never synced holds no moment",
      "A newer moment replaces the older one", "Two links keep their moments apart" and "Removing
      the link removes only the moment".

      The migration is `drizzle/0010_white_wraith.sql` — `ALTER TABLE monobank_links ADD
      last_synced_at integer`, additive and unbackfilled. It tripped `src/backup/format.test.ts`'s
      migration-count tripwire, whose question is "does a бекап still hold everything it should",
      and `BACKUP_SCHEMA_VERSION` is bumped to 11 here — the constant is the count of committed
      migrations, so it is this change's migration that moves it.

      This change's own answer to the tripwire was **no, deliberately**: the `backup-file` spec
      enumerates what a бекап holds — "the monobank accounts a token has shown with their links,
      sync boundaries, cursors and imported item ids" — the moment is not among them, and carrying
      it would have been a behaviour change no requirement asked for. A restored бекап would then
      read as a link that has never synced, which is the safe direction (design D9).

      **That is no longer what the tree does.** The `backup-file` change took the question up
      separately and now carries the moment: `src/backup/format.ts` (an optional
      `lastSyncedAtMs`, absent from files written before it existed), `src/db/backup-repo.ts` on
      both the snapshot and the restore, round-tripped in `src/db/backup-repo.test.ts` with the
      older-file case asserted alongside. Nothing had shipped under the omission, so no бекап in
      the wild is mislabelled, and no new migration came with the field — 11 still counts the
      migrations. This paragraph is the record: the omission was this change's decision, and the
      `backup-file` change reversed it in its own scope, where the requirement for it belongs.
- [x] 7.2 Call `markSynced` from `src/monobank/coordinator.ts` for each account whose outcome
      settles as `complete`, and for those alone — not from `commitStatementAnswer` (design D9).
      Verify with the coordinator's test covering the monobank-sync-screen scenario "A failed run
      leaves the moment alone" and a completed account moving its moment.
- [x] 7.3 Add the pure `momentLabel(ms, now)` to `src/ui/dates.ts` (design D10) — a Ukrainian date
      and time of day, computed from the passed `now` and never from an ambient clock. Verify with
      `src/ui/dates.test.ts`.
- [x] 7.4 Produce the per-account line, the screen's own last-sync line (the most recent of the
      accounts' moments) and the two "has not synced yet" sentences in
      `src/ui/monobank-screen.ts`. Verify with `src/ui/monobank-screen.test.ts` covering the
      monobank-sync-screen scenarios "A completed sync is dated on the screen", "A never-synced
      account says so", "No linked account has ever synced" and "The screen's last sync is the most
      recent of the accounts".
- [x] 7.5 Render those lines in `src/app/manage/monobank.tsx`, leaving sync something the owner
      starts. Proves the monobank-sync-screen scenario "The moments survive a restart" together
      with 7.1; `npm run verify` green.

## 8. Closing

- [x] 8.1 Run `npm run verify` and paste the final lines

      ```
       Test Files  89 passed (89)
            Tests  1471 passed (1471)
      ✔ verify passed (014bba431628861fb60c2d3a3e8b4bbfb40ecc12)
      ```
- [x] 8.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      First pass: **FAIL** — 1 critical, 4 warnings. All five addressed, re-checked, second pass
      **PASS** (0 critical, 0 warnings).

      - *Critical.* Task 7.1's recorded decision had gone stale: the `backup-file` change, in
        flight beside this one, now carries the moment in the бекап. 7.1 rewritten to say what the
        tree does and who owns `BACKUP_SCHEMA_VERSION` 11.
      - `Action`'s new `numberOfLines={1}` was safe on width but not on system font scale — the
        longest verbs would have ellipsized where they used to wrap, trading one lost word for
        another. `adjustsFontSizeToFit` added beside it, both attributes pinned by the test.
      - A previous month holding only transfers between рахунки is offered with no сума. Kept —
        the requirement's SHALL is conditioned on that month holding a транзакція, and a transfer
        is one — and the delta spec widened to say so, with a scenario and two tests.
      - `momentLabel`'s two-line `HH:MM` padding duplicates `formatTimeOfDay`. Declined with the
        reason written at `twoDigits`: reusing it would invert the layering and would build a
        `TimeOfDay` out of the instant that type is defined not to be.
      - Task 2.2 claimed more than its tests proved. The screen's wiring is now held structurally
        — `setShown(prevMonth(shown))` counted at exactly 2, the back arrow and the offer.

      Not covered by the review, and recorded rather than implied: the Kotlin `PackageManager`
      call and the merged manifest on a device, `Action` layouts in `manage-list.tsx` and the
      Saldo screens beyond a grep, and the emulator — the reviewer took the smoke below at face
      value rather than repeating it.

## Smoke — emulator, 2026-09-01

`emulator-5554` (Pixel, API 37), device date 1 September 2026, after a real `assembleDebug`.

- **Місяць, вересень** — leads «Витрачено 292,00 UAH» with «У цьому місяці ще не записано дохід.»
  under it; «Залишилось −292,00 UAH» is still listed under its own name. **Серпень** shows the
  proposal's own example the right way round: «Витрачено 1650,00 UAH» leading, «Залишилось
  −2650,00 UAH» in the list.
- **Місяць, липень** (empty) — «У цьому місяці ще нічого не записано.», then «Червень 2026 /
  Витрачено 300,00 UAH» and «Показати Червень 2026». Taking it shows Червень 2026 with витрачено
  300,00 UAH — the same number the offer stated.
- **Категорія** — Groceries · Вересень 2026 states «Витрачено 250,00 UAH» above its транзакції; no
  ліміт on it, so no overrun, as specified.
- **Головний** — scrolled into the feed, left to Місяць, came back: the screen shows «Усього
  грошей» and the entry form from the top.
- **Перші кроки** — «ГОТОВО 2/4» under the uppercase style, with nothing between the numbers that
  can be read as one.
- **Сповіщення банків** — «Додати застосунок» before, during and after opening and cancelling the
  add form (task 5.1); no «Банк» picker, because the emulator has none of the known bank apps
  (task 6.4).
- **Звіти** — opens on «Вер 2026», which holds 292,00 UAH: the newest month of the span that has a
  сума. This device has no empty newest month, so the change's own case is covered by
  `reports-screen.test.ts` rather than by this run.
- **monobank** — no token and no link on this device, so the screen says nothing about the last
  sync, which is the `null` case. The dated case needs a real token and was not run.
