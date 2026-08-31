# limits-goals-reports-polish — tasks

## 1. The owner's language on a refusal

- [x] 1.1 Refuse a typed сума in Ukrainian — `src/ui/amount-input.ts`: `parseAmount`'s three
      refusals become the owner's sentences (not a сума, more than two digits after the comma, not
      greater than zero), and `parseOpeningBalance` inherits them unchanged.
      Requirement: app-shell «A refusal the owner reads is in Ukrainian».
      Tests: `src/ui/amount-input.test.ts` — scenarios «A ліміт that is not positive is refused in
      Ukrainian», «A сума that is not a number is refused in Ukrainian», «Too many fractional
      digits are refused in Ukrainian»: each asserts the thrown message verbatim and that no
      English is left in it once the currency code — not a word of any language — is set aside.

- [x] 1.2 Refuse a typed дата in Ukrainian — `src/ui/dates.ts`: `parseTypedDate(typed)` trims,
      refuses the wrong shape and a day the calendar does not hold in Ukrainian, and returns the
      domain's `IsoDate`. `src/domain/transaction.ts` is not touched.
      Requirement: app-shell «A refusal the owner reads is in Ukrainian».
      Tests: `src/ui/dates.test.ts` — scenarios «A дата in the wrong shape is refused in
      Ukrainian» and «A day that does not exist is refused in Ukrainian», plus that a valid дата
      round-trips to the same `IsoDate` `isoDate` returns.

- [x] 1.3 Put both parsers where the forms reach them — `src/ui/goals-section.ts` parses the
      deadline with `parseTypedDate`; `src/ui/entry-form.ts` parses the date with it and names the
      same-рахунок переказ in Ukrainian before `transfer` can refuse it in English.
      Requirement: app-shell «A refusal the owner reads is in Ukrainian» (scenarios «A дата in the
      wrong shape…» and «A переказ onto the same рахунок…»).
      Tests: `src/ui/goals-section.test.ts` — a ціль with «31.12.2026» as its дата is refused in
      Ukrainian; `src/ui/entry-form.test.ts` — a переказ with one рахунок on both legs is refused
      in Ukrainian, and a draft with a malformed date is too.

- [x] 1.4 The two storage refusals that were half-English — `src/db/limits-repo.ts` («no category
      … to carry a ліміт») and `src/db/goals-repo.ts` («no рахунок … for the ціль …») say it in
      Ukrainian, like every other refusal in that layer.
      Requirement: app-shell «A refusal the owner reads is in Ukrainian».
      Tests: `src/db/limits-repo.test.ts` and `src/db/goals-repo.test.ts` — the existing
      unknown-id cases assert the Ukrainian message.

## 2. The back gesture on Ліміти and Цілі

- [x] 2.1 The rule, provable — `src/ui/back-gesture.ts`: `backGesture(editorOpen)` returns
      `'close-editor'` or `'leave-screen'`, with the comment saying why the editor goes first.
      Requirement: settings-screen «The Ліміти section manages the limits» (back-gesture
      scenarios).
      Tests: `src/ui/back-gesture.test.ts` — scenarios «The back gesture closes an open ліміт
      editor» and «The back gesture leaves the section when no editor is open».

- [x] 2.2 The wiring — `src/hooks/use-close-on-back.ts` subscribes to `hardwareBackPress` under
      `useFocusEffect` and answers per `backGesture`; `src/app/manage/limits.tsx` and
      `src/app/manage/goals.tsx` use it to close their editor. No screen decides anything itself.
      Requirement: settings-screen «The Ліміти section manages the limits» and «The Цілі section
      manages the цілі» (back-gesture scenarios).
      Tests: `src/ui/back-gesture.test.ts` reads both screens and asserts each one asks the hook,
      closes «Скасувати» through the same function and holds no `BackHandler` of its own —
      scenarios «The back gesture closes an open ліміт editor» and «…an open ціль form». The
      subscription itself is React Native and is smoke-tested on the emulator.

## 3. The scale and the numbers on Звіти

- [x] 3.1 The axis, in the view model — `src/ui/reports-screen.ts`: each chart returns
      `{ top, zero, bottom }` in the shown currency, `bottom` null unless that chart holds a
      negative month, and a scale of zero when every month is zero.
      Requirement: reports-screen «Every chart on Звіти states its scale».
      Tests: `src/ui/reports-screen.test.ts` — the five scenarios of that requirement.

- [x] 3.2 The spelled-out month, in the view model — `src/ui/reports-screen.ts` takes
      `chosenMonth?`, resolves it against the span (newest as the default and as the fallback),
      marks that column `selected` on both charts, and returns the read-outs: three numbers for
      the history chart, one for the category chart.
      Requirement: reports-screen «One month of each chart is spelled out in full».
      Tests: `src/ui/reports-screen.test.ts` — the five scenarios of that requirement, the
      fall-back-after-a-currency-switch case among them.

- [x] 3.3 Draw them — `src/app/(tabs)/reports.tsx`: the axis labels down the left edge of each
      plot, a hairline at the baseline, each column a `Pressable` that picks its month, the picked
      column marked, and the read-out under each chart. No number is computed here.
      Requirement: reports-screen, both requirements.
      Tests: `src/ui/reports-screen.test.ts` reads the tab and asserts it draws both axes and both
      read-outs, hands the tapped month back to the model, and formats no сума of its own. The
      drawing itself is smoke-tested on the emulator.

## 4. The gate

- [x] 4.1 Run `npm run verify` and paste the final lines

      ```
       Test Files  64 passed (64)
            Tests  991 passed (991)
      ✔ verify passed (fb685227ea59456ec1ecb86fa7c1dc07a88b6a11)
      ```
- [ ] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
