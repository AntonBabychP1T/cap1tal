## 1. Vocabulary and policy

- [x] 1.1 Add `Motion` (durations, easing control points, press spring, `pressedScale`,
  `pressedOpacity`, `shift`) and the `ripple` colour (light and dark) to `src/constants/theme.ts`.
  Test in `src/constants/theme.test.ts`: "Scenario: No animation the app drives outlasts the
  ceiling" (every token duration is 150, 220 or 300). `motion-usage.test.ts` in 9.1 completes it
  for delays.
- [x] 1.2 Add the pure `src/ui/motion.ts`: `routeTransition`, `stepDirection`, `changedFigures`,
  `fillStart`, `movementUnderReducedMotion` and the sheet phase machine. Tests in
  `src/ui/motion.test.ts`:
  - "Scenario: A pushed screen appears without sliding" (the reduced route transition is `fade`)
  - "Scenario: The entry form rises" (`transaction/new` and `transaction/scan` map to
    `slide_from_bottom`)
  - "Scenario: Opening and leaving a рахунок" (the default side transition)
  - "Scenario: Stepping a month slides from the side of the step"
  - "Scenario: The статок changes without counting" (a changed figure swaps, and nothing animates on
    first mount)
  - "Scenario: Only the currency that changed moves"
  - "Scenario: A meter shows its value at once" (`fillStart` with `reduced` is `null`)
  - "Scenario: A ліміт meter grows when a витрата is saved" (`fillStart` from the previous value)
  - "Scenario: Returning without a change does not replay"
  - "Scenario: Closing a sheet by the scrim" (`onDismiss` once when the close begins, `onExited`
    once on `closing → closed`, and `open` turning false mid-close starts no second close)
  - "Scenario: A choice is stored at once and the screen changes after the sheet leaves" (a parent
    close fires no dismissal and runs `onExited` on finish)
- [x] 1.3 Add `src/components/motion.tsx` with the Reanimated easing adapters over the `Motion`
  control points, a `useMotion()` hook folding `useReducedMotion()` into the prebuilt factories, and
  those factories (design D4). No `<ReducedMotionConfig>` is mounted (design D4 says why). Verify by `npm run verify` (typecheck) and a dev build launching cleanly on
  the emulator.

## 2. Press feedback

- [x] 2.1 Add `Tap` (ripple, pressed tone, spring press-in for `emphasis` that is off under reduced
  motion, nothing when `disabled`) in `motion.tsx`. Switch the shared components to it:
  - `surfaces.tsx`: Fab, ScreenHeader back, Card, ListCard, ListRow, Banner, IconRow,
    RoundIconButton, StatTile, MeterRow, HeroCard
  - `form.tsx`: DateField, Chip, Choices, Action, RowAction, Picker
  - `transaction-row.tsx` and `manage-list.tsx`

  Verify on the emulator: a row shows the ripple before the finger lifts.
- [x] 2.2 Replace the remaining bare `Pressable`s:
  - `(tabs)/index.tsx`, `reports.tsx`, `month.tsx`, `settings.tsx`, `accounts.tsx`
  - `net-worth-widget.tsx`, `category-widget.tsx`, `category-icon-picker.tsx`
  - `transaction/[id].tsx`, `progress.tsx`, `manage/*`

  Add `src/ui/motion-usage.test.ts` with three scenarios:
  - "Scenario: No tappable element is silent" and "Scenario: A row answers the touch": no
    `Pressable` outside the design D3 allowlist.
  - "Scenario: A disabled button does not answer": `Tap` passes `disabled` through and drops the
    ripple, tone and scale.

## 3. Screen transitions

- [x] 3.1 Set root `screenOptions.animation` and the per-route overrides from `routeTransition`,
  with `useReducedMotion()` read once in `src/app/_layout.tsx`. Declare the seven undeclared
  `manage/*` routes so they get the policy explicitly. A source test in `motion-usage.test.ts`
  asserts every `Stack.Screen` takes its animation from `routeTransition`. Verify on the emulator: a
  рахунок slides in and out, and the entry form rises, and sinks when it is left.
- [x] 3.2 Add `TabFade` on the five tab roots (design D8). Source test "Scenario: Tabs cross-fade"
  in `motion-usage.test.ts` (`TabFade` on each tab root at `Motion.fast`). Verify on the emulator.
  If `NativeTabs` shows a flash, stop and ask the owner before amending the artifacts (design D8).

## 4. Opening, closing, leaving

- [x] 4.1 Add the `Appear` wrapper and apply it to the чернетки section, the inline категорія picker
  and the service rows on Головний, with `reflow` on the sibling cards. Source test "Scenario:
  Opening чернетки moves the feed down smoothly" in `motion-usage.test.ts`. Verify on the emulator.
- [x] 4.2 Apply `Appear` to the `Picker` list (`form.tsx`) and to the статок points and explanation.
  Verify on the emulator.
- [x] 4.3 List rows: `exiting={exitFade}` plus `itemLayoutAnimation={reflow}` on the `FlatList`s
  from `app-speed-pass` («Транзакції», a рахунок, a категорія's month) and on the `manage-list.tsx`
  and `manage/rules.tsx` rows, with `LayoutAnimationConfig skipEntering`. Source tests in
  `motion-usage.test.ts`:
  - "Scenario: A long list appears at once" (no `entering` on list rows)
  - "Scenario: A removed транзакція's row closes the gap" (`itemLayoutAnimation` and `exiting` on the
    рахунок list)

  Verify both on the emulator.

## 5. Progress and figures

- [x] 5.1 Add `FillBar` in `motion.tsx` and render `Meter` through it: a translateX percentage in a
  clipped track, driven by `fillStart` (design D5), which also covers `MeterRow`. Verify on the
  emulator, with reduced motion off and on.
- [x] 5.2 Add `FillRing` (`strokeDashoffset` through `useAnimatedProps`) in `motion.tsx` and render
  `ProgressRing` through it. `FillColumn` follows in 7.3, once `columnMorph` exists.
- [x] 5.3 Add `ChangingFigure`, one per currency, and apply it to the статок headline, the Рахунки
  balances, a рахунок's header balance, витрачено and залишилось on Місяць and the Головний month
  widget, and the витрачено in the категорії donut's center. Verify on the emulator: record at
  60 fps and confirm no intermediate amount appears in any frame, and a UAH-only change leaves USD
  and EUR still.

## 6. Switching, sheet, busy

- [x] 6.1 Key Місяць's body on the shown month, entering from the `stepDirection` side, with meters
  drawn at their values. Verify on the emulator.
- [x] 6.2 Add `useSheetMotion()` in `motion.tsx` and rebuild `Sheet` on it and the phase machine
  (design D9): fading scrim, rising panel, last children kept during the exit, `onDismiss` for a
  sheet-started close and `onExited` after every close. Move `router.back()` in
  `transaction/[id].tsx` into `onExited`. Verify through `RuleOfferSheet` on the emulator: the
  правило is stored at once, and scrim tap, back gesture and a choice each finish after the panel
  leaves.
- [x] 6.3 Add the busy `ActivityIndicator` at the design D10 sites, each under its busy condition.
  Add the pinned-sites source test "Scenario: A прогін shows a spinner until it ends" in
  `motion-usage.test.ts`.

## 7. Charts morph

- [x] 7.1 In `src/ui/dashboard-charts.ts`, move `linePath` out of `net-worth-widget.tsx`, mark it and
  `donutSectorPath` `'worklet'`, and add `lineMorph` and `donutMorph` (design D12). Tests in
  `src/ui/dashboard-charts.test.ts`:
  - "Scenario: Switching the історія статку morphs the line" (the same runs with the same
    `seriesIndex` at every position give `morph`, with `from` and `to` heights per point)
  - "Scenario: A shape that cannot be matched cross-fades" (another point count, another run split,
    or equal counts at other `seriesIndex`es after downsampling give `fade`)
  - "Scenario: A new категорія grows into the donut" (an arriving key starts at zero sweep, a
    leaving key ends at zero sweep; `neutral` on either side, or shared keys in another order, give
    `fade`)
- [x] 7.2 Add `columnMorph` beside the Звіти model in `src/ui/reports-screen.ts` (design D12). Tests
  in `src/ui/reports-screen.test.ts`:
  - "Scenario: Switching the Звіти currency moves the bars" (each shared bar's `from` is its old
    size and `to` its new one; an arriving column starts at 0; the scale in the new model is in the
    new currency)
  - "Scenario: A bar that changes sign cross-fades" (a sign flip, or `historyHasNegative` or
    `categoryChartHasNegative` changing, gives `fade`)
- [x] 7.3 Add `MorphLine`, `MorphDonut` and `FillColumn` in `motion.tsx` (one progress value,
  `Motion.emphasis`, a re-target starting from the shape on screen, the target at once under reduced
  motion, and `FillColumn` growing up from the baseline for a positive bar and down for a negative
  one). Draw the історія статку, the donut and the Звіти bars through them, re-keyed with
  `enterFade` only on `fade`. Source test in `motion-usage.test.ts`: all three charts go through
  the wrappers, and nothing else animates their text. Verify on the emulator:
  - a UAH → USD switch flows, and a switch to a history with a gap cross-fades
  - a new категорія grows into the donut
  - a Звіти currency switch moves the bars, a sign flip cross-fades, and returning to Звіти with
    nothing written replays nothing

## 8. Haptics

- [x] 8.1 Run `npx expo install expo-haptics` and add `android.blockedPermissions:
  ["android.permission.VIBRATE"]` to `app.json`. Add:
  - the port `src/platform/haptics.ts` with `recordingHaptics()`, tested in `haptics.test.ts`
    beside it
  - `HAPTIC_EFFECTS` in `src/ui/haptics.ts`: the Android constant, its fallback and the iOS call per
    effect (design D13)
  - the adapter `haptics-device.ts`: `playAndroid` and `playIos` look the table up; fire-and-forget,
    one fallback retry, further errors swallowed

  Tests in `src/ui/haptics.test.ts`: the table maps confirm, reject and tick to the design D13
  constants and fallbacks, and a source check that reads `haptics-device.ts` as text pins that
  `playAndroid` calls only `performAndroidHapticsAsync` and that `impactAsync` appears nowhere.
  Build a new dev build and confirm the merged manifest has no `VIBRATE`.
- [x] 8.2 Add `hapticFor`, `syncOutcomeEvent`, `choiceEvent` and `strongestHaptic` to
  `src/ui/haptics.ts` (design D13). Tests in `src/ui/haptics.test.ts`:
  - "Scenario: Storing a транзакція is felt"
  - "Scenario: A refusal is felt differently"
  - "Scenario: A found чек is felt"
  - "Scenario: Stepping a month ticks"
  - `choiceEvent`: a chip or `Choices` re-pick of the current value plays nothing
  - "Scenario: A cancelled прогін does not vibrate" (`syncOutcomeEvent`: скасовано and перенесено
    give nothing; a рахунок ending in an error gives `failed`, which plays reject)
  - "Scenario: Vibration off plays nothing" (`enabled` false gives `null` for every event)
- [x] 8.3 Add the `haptics_preference` table to `src/db/schema.ts`, run `npm run db:generate`, bump
  `BACKUP_SCHEMA_VERSION` in `src/backup/format.ts` to the new journal count, and add
  `src/db/haptics-preference-repo.ts` reading through a `stampedMemo` (design D14). Tests:
  - "Scenario: Vibration is on from the start" and "Scenario: The switch is on by default" (no row
    reads as on)
  - "Scenario: Turning vibration off is kept" (off, then on, round-trips across a fresh repo)
  - the migration test: an existing database gains the empty table
- [x] 8.4 Add `src/hooks/haptics-ports.ts` (`useHaptics()`) and the «Вібрація» row on
  `(tabs)/settings.tsx`, storing first and playing after. Verify on the emulator: the switch shows
  on by default and survives a restart.
- [x] 8.5 Carry the preference in the бекап: `haptics_preference` joins `BACKUP_TABLES`, and the
  format gains the optional `haptics` field, parsed strictly and restored in the same transaction
  (design D14). Tests in `src/backup/format.test.ts` (parsing) and `src/db/backup-repo.test.ts`
  (the round trip against storage, beside the dashboard layout's):
  - "Scenario: Vibration off survives the round trip" (including a repo read memoised before the
    restore answering off after it)
  - "Scenario: An older бекап restores with vibration on"
  - "Scenario: The preference restores atomically with the money"
  - "Scenario: A malformed vibration preference refuses the бекап"
- [x] 8.6 Call `play(...)` at every design D13 site, after the outcome is known. For `refused`, only
  the `failureAlert` catch and `buildEntry`'s refusal, not the future-date question or the delete
  confirmation. Source tests in `motion-usage.test.ts`:
  - calls only at the D13 sites, with their events
  - no `play(` inside an `entryDateCheck` or delete-confirmation `Alert` branch
  - "Scenario: Background work never vibrates": no background entry reaches the port
  - `expo-haptics` imported only in the adapter, and the adapter only in `haptics-ports.ts`

## 9. Guardrails and proof

- [x] 9.1 Complete `src/ui/motion-usage.test.ts` with "Scenario: No animation loops" and "Scenario: A
  still screen draws nothing" (the source half, design D11): no loops, no factories outside
  `motion.tsx` apart from `animated-icon.tsx`, every duration a `Motion` token, no `delay`.
- [ ] 9.2 Emulator check in a dev build, before review, once with animations on and once with
  Developer options → "Remove animations" on:
  - every scenario of `motion`
  - the GPU profiler bars on a settled Головний (no frames)
  - the owner's pick of `ios_from_right` or `slide_from_right` (design D2), recorded here

  Recorded so far (2026-09-30, `dumpsys gfxinfo`, 8 s after each tap): a settled Головний draws 0
  frames. A tab switch drew ~340–410 frames, from the native tab bar's ripple and not from the
  app's motion (design D11). With `patches/react-native-screens+4.26.2.patch` in a rebuilt APK it
  draws 22–76 frames, and 0 once settled.

  The emulator plays no haptics. The owner checks the `motion` haptics scenarios on their phone,
  with «Вібрація» on and off and the system touch feedback off, and the result is recorded here.

  The formal smoke-runner pass follows diff-reviewer, per CLAUDE.md step 6.
- [x] 9.3 Run `npm run verify` and paste the final lines
- [ ] 9.4 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
