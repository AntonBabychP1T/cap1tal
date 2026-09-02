## 1. The pure decisions Головний will read

- [x] 1.1 Add the twelve locative month names and `monthInLabel(month)` («у вересні») to
      `src/ui/months.ts`; verify `src/ui/months.test.ts` covers all twelve months and a rejected
      malformed month, as the existing `monthLabel` tests do.
- [x] 1.2 Add `countUncategorised()` to `src/db/transactions-repo.ts` — one `COUNT(*)` over the
      витрати carrying `UNCATEGORISED_CATEGORY_ID`, no schema change (design D4);
      verify `src/db/transactions-repo.test.ts` proves spec scenarios «The count is of everything
      stored, not of the latest ones» and «A дохід «Без джерела» is not counted», plus 0 on an
      empty database.
- [x] 1.3 Create `src/ui/home-screen.ts` with `homeViewModel(...)` producing the month status —
      title, залишилось line, витрачено line, the per-currency no-дохід note, the empty-month
      sentence — from `monthlyPicture` (design D2, D5); verify `src/ui/home-screen.test.ts` proves
      spec scenarios «The month's залишилось is the first thing on the screen», «Two currencies
      stay apart», «A month before its first дохід says why залишилось is negative», «The currency
      without дохід is the one named», «Money moved into a jar is missing from neither number» and
      «An empty month says it is empty».
- [x] 1.4 Extend `homeViewModel` with the money-held line (reusing `accountTotals`, `totalsLine`,
      `approximateTotals` — no new calculation) and the «Потребує уваги» items with their Ukrainian
      plurals (design D3); verify `src/ui/home-screen.test.ts` proves «The total is secondary to
      the month», «The month's number is not this number», «With no рахунок the screen says so and
      still shows what is stored», «Nothing waiting, no section» and «Uncategorised транзакції are
      named and counted».

## 2. The entry form on its own screen

- [x] 2.1 Add the `overlay` slot to `Screen` and a `Fab` to `src/components/surfaces.tsx`
      (design D6); verify `npm run typecheck` and `npm run lint` pass and no existing screen
      changes shape (no `overlay` passed anywhere else).
- [x] 2.2 Create `src/app/transaction/new.tsx` by moving the entry form off
      `src/app/(tabs)/index.tsx` verbatim — state, `chooseFrom`/`chooseTo`/`chooseEntry`, `record`,
      `store`, `askAboutTransfer`, `entryDefaults.remember`, `recordedConfirmation`, the
      `raiseAlert`/`clearAlert('local-save')` pair that lives inside recording, and the no-рахунок
      card — under a `ScreenHeader` with «Назад»; register it in `src/app/_layout.tsx` beside
      `transaction/[id]` (design D1); verify no function from `src/ui/entry-form.ts` gains a second
      caller and the spec scenario «The «+» opens the form» has a screen to open.
- [x] 2.3 Keep the confirmation on that screen with the fields cleared as the spec now names them —
      сума, «скільки прийшло», опис and picked labels cleared, дата back to today, type and рахунок
      kept (design D7); verify a test in `src/ui/entry-form.test.ts` proves spec scenario «The form
      is ready for the next транзакція».
- [x] 2.4 Re-point, never relax, the structural assertions whose subject task 2.2 moves
      (design D9): in `src/ui/entry-form.test.ts`, the walk that proves exactly one screen calls
      `entryDefaultsRepo.remember(` now expects `transaction/new.tsx`, and
      `defaultAccountId(stored.rememberedAccountId` / `entryDefaultsRepo.remembered()` are read
      from that file; in `src/ui/alerting.test.ts`, the entry screen is asserted to raise
      `local-save`, to clear it on success and to say `Alert.alert('Не записано',
      failureMessage(error))`, while Головний keeps `useClearAlertOnOpen('local-save')`, its own
      `raiseAlert('local-save'` from confirming a чернетка and its
      `Alert.alert('Не підтверджено', …)`. Verify no assertion is deleted or weakened and
      `npm run test` is green.

## 3. Головний as the overview

- [x] 3.1 Rewrite `src/app/(tabs)/index.tsx` top half: month status card (tap → Місяць), the
      money-held secondary row (tap → Рахунки) with the no-рахунок statement, both read off
      `homeViewModel`; verify the screen holds no сума field, no категорія picker and no
      «Записати» (spec «Головний holds no form of its own»).
- [x] 3.2 Render «Потребує уваги» — the counted «Без категорії» row leading to `/transactions`,
      then the existing `draftLines` block with its «Підтвердити»/«Відхилити» unchanged — and
      nothing at all when both are empty (spec «Потребує уваги» scenarios, and the
      bank-notifications-screen delta's «No pending чернетки, no surface»); verify the literal in
      `src/ui/notifications-screen.test.ts` that matches the drafts block still matches what wraps
      it — re-pointed at nothing, since the чернетки stay on Головний.
- [x] 3.3 Drop `FEED_SIZE` to 5 and replace the section's note and row action — «Усі ›» to
      `/transactions` instead of «Усі транзакції та пошук» — keeping the title «Останні
      транзакції», the newest-first order, the «Без категорії» mark with its one-tap picker and
      the over-limit mark (spec «Everything stored is reachable from Головний»); verify
      `src/ui/transaction-line.test.ts` is untouched and still green, and rename both scenarios of
      the «Головний shows itself from its top» block in `src/ui/entry-form.test.ts` to the delta's
      «Coming back lands on the month's status» and «Scrolling within Головний is untouched».
- [x] 3.4 Add the «+» over the bottom-right corner opening `/transaction/new`, and keep the
      focus-scroll-to-top now that the top is the month's status (spec «Recording opens from a «+»
      on Головний», «Opening Головний again shows it from the month's status»); update the
      `expect(main).toContain('<Screen scrollRef={scrollRef}>')` literal in
      `src/ui/entry-form.test.ts` to the call Головний now makes with the overlay slot, keeping
      what it proves — that Головний, and only Головний, holds the ref `Screen` lends.

## 4. The words that describe the screen

- [x] 4.1 Rewrite docs/product-vision.md §3 and the Purpose of both
      `openspec/specs/main-screen/spec.md` and `openspec/specs/month-screen/spec.md` — the latter
      still reads «Головний records the money, Місяць says where it went and how much is left» —
      to describe the screens this change makes — opening the
      app answers how the month is going, and recording is one tap away behind the «+» (design D8);
      check §13's «Tapping it opens the place where a transaction can be added» still reads true of
      Головний and reword it if not;
      verify `openspec validate --all` passes and neither text still promises the entry form on
      opening.
- [x] 4.2 Reword the `reminders-and-alerts` requirement «Tapping the нагадування opens where a
      транзакція is recorded» — its heading, its body («Головний — where a транзакція is added») and its
      scenario saying the app opens on Головний "showing quick entry and any pending чернетки" — in
      `openspec/changes/reminders-and-alerts/specs/reminders-and-alerts/spec.md` while that change
      is in flight, or in `openspec/specs/reminders-and-alerts/spec.md` if it archived first
      (design D10); verify `openspec validate --all` passes.
- [x] 4.3 Update `docs/app-overview.md`'s Головний section to the new screen; verify it names the
      «+», «Потребує уваги» and the five latest транзакції, and no longer describes the inline form.

## 5. Gate

- [x] 5.1 Run `npm run verify` and paste the final lines
- [x] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

## 6. The emulator

- [ ] 6.1 Run the smoke-runner subagent over this change's scenarios: Головний in its normal state,
      with «Потребує уваги» and without it, the «+» opening the form, recording and returning, and
      the four navigations (Місяць, Рахунки, «Транзакції», transaction editing); fix what it finds
      and re-run; re-run `npm run verify` after every fix.
- [ ] 6.2 Only if the smoke pass shows `/transaction/new` resolving to the editor instead of the
      form (design D1): move the screen to the collision-free route `src/app/entry.tsx`, update the
      «+», `_layout.tsx` and every path-based assertion task 2.4 pointed at
      `src/app/transaction/new.tsx` (`readFileSync` on a path that no longer exists turns the suite
      red), then re-run `npm run verify` green and re-run the smoke. Tick as not needed otherwise.
- [ ] 6.3 If the smoke pass changed any code, run the diff-reviewer subagent once more over the
      whole diff and fix its CRITICAL findings until PASS.
