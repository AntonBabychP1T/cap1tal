## Context

See proposal.md for why. These facts constrain how the motion is built:

- **Stack.** The root Stack (`src/app/_layout.tsx`) is expo-router's native stack on
  react-native-screens 4.26. Every route is `presentation: 'card'` with no `animation` set. The
  entry form is a pushed screen on purpose (`home-daily-overview` design D1 rejected a modal and a
  Reanimated bottom sheet for it). Since 2d50e41 it leaves after a successful store
  (`transaction/new.tsx`), although main-screen still says it stays open; that drift is not this
  change's to settle. This change keeps the screen pushed and changes only its transition.
- **Android transition lengths are fixed by react-native-screens resources.** They cannot be tuned
  (`transitionDuration` is iOS-only):
  - `slide_from_right` and `slide_from_bottom`: `config_mediumAnimTime` (400 ms)
  - `ios_from_right`: `config_shortAnimTime` (200 ms)
  - `fade`: 150 ms

  Hence the spec's carve-out for platform-drawn transitions.
- **Tabs.** They are `NativeTabs` (Android's native bottom navigation), which exposes no content
  transition.
- **Reanimated.** 4.5.1 with worklets 0.10 is installed and the worklets Babel plugin is applied by
  `babel-preset-expo`. It is used only by `animated-icon.tsx` (the launch view, `DURATION = 900`).
  The New Architecture is the only one on RN 0.86.
- **React Compiler is on.** Shared values are read and written with `.get()` / `.set()`, not
  `.value`.
- **No motion tokens exist.** Pressed styles are ad-hoc: opacity 0.6, 0.7 or 0.75, and scale 0.96 on
  the Fab. About 30 `Pressable`s have no pressed style at all.
- **Programmatic scrolls stay instant.** `index.tsx:317`, `reports.tsx:202,236` and `form.tsx:458`
  are `animated: false` by earlier decisions.
- **`redesign-foundation` dropped a `motion.tsx`.** Its reason was "no consumer yet". This change is
  that consumer.
- **Charts.** All three are hand-drawn, no charting library:
  - the статок history is one react-native-svg `Path` built from `historyGeometry`
    (`src/ui/dashboard-charts.ts`): normalised points in runs, split where a value is unknown
  - the категорії donut is `Path` sectors from `donutGeometry` and `donutSectorPath`
  - the Звіти bars are plain `View`s with a height
- **Haptics.** `expo-haptics` 57.0.3 matches SDK 57. On Android, `performAndroidHapticsAsync` calls
  `View.performHapticFeedback`: it needs no permission and plays nothing while the system
  touch-feedback setting is off. `impactAsync` and `notificationAsync` use the `Vibrator` instead,
  and the module's manifest declares `android.permission.VIBRATE` for them. `Confirm` and `Reject`
  exist from API 30 and `Segment_Tick` from API 34; below that the call rejects with "not
  supported". On iOS, `notificationAsync` and `selectionAsync` drive the Taptic Engine with no
  permission. The emulator plays no haptics, so their device proof is the owner's phone.
- **Preferences.** Single-row tables are the idiom (`daily_reminder`, `entry_defaults`,
  `dashboard_layout`): a CHECK on a fixed id, and no row means the default. A deliberate
  customisation travels in a бекап (`dashboard_layout`, `src/backup/format.ts`).
- **Tests.** Vitest runs Node-only. Components are not rendered in tests, so the policy lives in
  pure modules and the "everywhere" rules are proven by source inspection (the established
  `src/ui/*` pattern). The emulator is the visual proof.

## Goals / Non-Goals

**Goals:**
- **Cost.** Every app-driven animation runs on the UI thread (Reanimated layout animations, CSS
  transitions or shared values) and touches only `opacity` and `transform`. The exceptions are
  Reanimated's own layout transitions, a morphing chart's path `d` and a ring's `strokeDashoffset`
  (D5, D12). Zero frames are drawn for motion on a settled screen.
- **One place to tune.** Changing `Motion.standard` changes every standard animation.
- **Haptics are rare and honest.** One effect per owner action, system effects only, nothing from
  work the owner did not start.

**Non-Goals:**
- Gesture-driven animations (swipe-to-delete, drag). They are out of scope and would need new specs.
- Anything in `bug-report-here.tsx`, `app-tabs.web.tsx` or the launch view.

## Decisions

### D1. Tokens and a pure policy

`src/constants/theme.ts` gains:

```ts
export const Motion = {
  fast: 150, standard: 220, emphasis: 300,
  enter: [0.2, 0, 0, 1],      // cubic-bezier control points, decelerate
  exit: [0.3, 0, 1, 1],       // accelerate
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  pressedScale: 0.97,
  pressedOpacity: 0.7,
  shift: 16,                  // px a figure rises / a month slides
} as const;
```

Plain numbers only, so `theme.ts` gains no Reanimated import and `theme.test.ts` stays Node-only.

`src/ui/motion.ts` is pure and holds every decision that is not drawing:
- `routeTransition(route, reduced)`
- `stepDirection(fromMonth, toMonth)` returns `'from-left' | 'from-right'`
- `changedFigures(prev, next)`: per currency, which formatted figures changed; nothing on first
  mount
- `fillStart({ prev, next, firstDraw, switched, reduced })`: returns the value to animate from, or
  `null` for "draw at value"
- `movementUnderReducedMotion(kind)`: returns `'instant' | 'fade-fast'`
- the sheet phase machine `closed → opening → open → closing → closed`, with a `closedBy` of
  `'sheet' | 'parent'`, which decides whether `onDismiss` fires and when `onExited` runs

### D2. Screen transitions are native-stack `animation`

Root `screenOptions.animation` comes from `routeTransition`:
- **Default:** `ios_from_right` on Android (200 ms, underlying screen parallaxing) and the platform
  default on iOS.
- **Rising routes:** `transaction/new` and `transaction/scan` use `slide_from_bottom` (400 ms on
  Android).
- **Reduced motion:** every route uses `fade`.

These are fully native, platform-timed (the spec's carve-out) and run no JS per frame. Android's
"remove animations" setting zeroes the animator scale, so native transitions obey it on their own.
The `fade` fallback covers iOS's Reduce Motion and Android's reduced (not removed) settings.

`useReducedMotion()` is read once in the root layout. A change of the setting while the app runs
applies from the next launch, as the spec allows. `ios_from_right` against `slide_from_right` is
the owner's pick on the emulator (task 9.2). Both are platform-drawn and within the spec.

### D3. One `Tap` for every press

`src/components/motion.tsx` exports `Tap`, a `Pressable`. It has three parts:
- **Ripple.** `android_ripple={{ color: theme.ripple, foreground: true }}` on Android. It is native
  and costs nothing.
- **Pressed tone.** Opacity `Motion.pressedOpacity` on iOS and web through the `pressed` style
  callback.
- **Press-in.** `emphasis` variants (primary `Action`, the Fab, `RoundIconButton`) also scale to
  `Motion.pressedScale` through a shared value driven by `onPressIn`/`onPressOut` with
  `withSpring(Motion.press)`. The scale is off under reduced motion.

`disabled` removes all three.

`Tap` replaces every direct `Pressable` in `src/app/**` and `src/components/**`. The allowlist,
matching the spec's carve-outs, is `motion.tsx` itself, the sheet scrim in `sheet.tsx`,
`bug-report-here.tsx` and `app-tabs.web.tsx`. Switches (`ThemedSwitch`) and the native tab bar are
not `Pressable`s and keep their own feedback.

A theme colour `ripple` (text colour at 12 % alpha, light and dark) joins `Colors`. `Tap` sets
`overflow: 'hidden'` when it carries a radius, so the ripple does not bleed past the corners.

**Alternative considered:** gesture-handler's `Pressable`. Mixing touch systems inside
`ScrollView`/`FlatList` is a known source of missed taps. Rejected.

### D4. Opening, closing, leaving: Reanimated layout animations

All animation factories are imported only in `motion.tsx`. It exports prebuilt ones (`enterFade`,
`exitFade`, `reflow`, `riseIn`, `riseOut`, `stepIn(direction)`) that always carry `Motion`
durations and easings and `.reduceMotion(ReduceMotion.System)`. Under reduced motion they become a
`fast` fade or nothing, per `movementUnderReducedMotion`. The reduced forms carry
`ReduceMotion.Never`, since they already are the reduced movement. No `<ReducedMotionConfig>` is
mounted: in Reanimated 4.5 `ReduceMotion.System` is already the global default, so it would change
nothing, and in a development build it logs a LogBox warning on every launch that would sit over
the screen during emulator checks.

`Appear` wraps `Animated.View` with `entering={enterFade}` and `exiting={exitFade}`. `reflow`
(`LinearTransition` at `Motion.standard`) goes on the siblings that must move. It is used for:
- the чернетки section and the inline категорія picker on Головний
- the service rows in the service rail
- the `Picker` expanded list (`form.tsx`)
- the статок points and explanation (`net-worth-widget.tsx`)

**List rows.** `app-speed-pass` draws the three long lists through one `FlatList` in `ListScreen`
(`surfaces.tsx`). `motion.tsx` exports `MotionList`, an `Animated.FlatList` with
`itemLayoutAnimation={reflow}` whose rows sit in `Animated.View exiting={exitFade}`, and
`ListScreen` renders it, so `surfaces.tsx` still imports no Reanimated API. A leaving row fades and
the gap closes. Rows never get `entering`. The list is wrapped in
`<LayoutAnimationConfig skipEntering>`, so the first draw, a «Показати ще» page and a newly arrived
row all appear at once. `removeClippedSubviews` stays on for Android: a row detached off-screen is
not in sight, and a row leaving in sight is attached. The emulator check covers the pair.

A транзакція is removed in its editor. The row leaves when the рахунок re-reads on return, which
`app-speed-pass` does on focus. `exitFade` plays then.

### D5. Filling progress without layout passes

- **`Meter`** (`surfaces.tsx`): the bar is a full-width child in an `overflow: hidden` track,
  moved with `transform: [{ translateX: '-(100 - pct)%' }]`. The rounded leading edge stays round.
  `scaleX` was rejected because it squashes the radius. A shared value takes
  `withTiming(pct, { duration: Motion.emphasis, easing: enter })` in an effect on `pct`, starting
  from `fillStart(...)`.
- **When it fills.**
  - First draw starts from 0.
  - Returning to a mounted screen with the same `pct` runs no effect, so nothing replays. Tabs and
    stacked screens stay mounted.
  - A switch of a meter or a ring (`switched` true: категорія, month) or reduced motion draws at
    the value.
  - A Звіти bar is a chart (D12): a currency or категорія switch moves it from its previous height,
    so `FillColumn` never passes `switched`.
- **`ProgressRing`**: `Animated.createAnimatedComponent(Circle)` with `useAnimatedProps` on
  `strokeDashoffset`, on the same timing.
- **Звіти bars**: a full-height bar inside its half of the column, which clips, slid out of the
  baseline with `translateY` (up for a positive bar, down for a negative one), like the meter.
  `scaleY` was rejected for the same reason: it squashes the bar's rounded end. All bars share one
  `Motion.emphasis` timing with no stagger, so the whole fill ends within 300 ms.

Each of these updates one transform or prop on the UI thread for at most 300 ms.

All three are built as `motion.tsx` wrappers: `FillBar` (the Meter track), `FillRing` (the animated
`Circle`) and `FillColumn` (a Звіти bar). `surfaces.tsx` and `reports.tsx` render those wrappers and
import no Reanimated API themselves, so the D11 guard holds without an allowlist.

### D6. Changing figures swap per currency, never count

`ChangingFigure` is one figure: one currency's formatted сума. A multi-currency line renders one
`ChangingFigure` per currency, keyed by currency, so only the changed currency moves.

Inside, the `Text` sits in `Animated.View key={formatted}` with `entering={riseIn}` (a fast fade
plus `Motion.shift`) and `exiting={riseOut}`. The outgoing view is absolutely positioned while it
exits, so the line does not reflow. `numberOfLines={1}` is kept, so a сума never splits across
lines (`app-shell`). The first mount is skipped with `LayoutAnimationConfig skipEntering`.

Only two real strings are ever on screen. It is used for exactly the figures the `motion` spec lists,
and every other сума on a screen changes at once:
- the статок headline figures
- the Рахунки balances and a рахунок's header balance
- the витрачено and залишилось on Місяць and the Головний month widget
- the витрачено in the категорії donut's center (D12)

### D7. Month stepping and chart switches

- **Month stepping.** Місяць's body is keyed on the shown month, with `entering={stepIn(dir)}` (a
  `Motion.shift` offset plus a fade, not a full-width slide) and `exiting={exitFade}`. The body is
  new content, so its meters draw at their values and its figures mount without `ChangingFigure`
  animating. The meters learn it from a `DrawAtValue` context in `motion.tsx`: Місяць provides
  `true` once the owner has stepped at least once, so the tab's first drawing still fills from
  empty and every stepped body draws at its values. `FillBar` and `FillRing` read the context as
  their `switched`.
- **Chart switches.** They morph (D12). Only a shape that cannot be matched is re-keyed, which
  cross-fades it with `entering={enterFade}` at `Motion.fast`.

### D8. Tab cross-fade

`TabFade` wraps each tab screen's root. It fades opacity 0 → 1 with
`withTiming(1, { duration: Motion.fast })` when its tab is focused after *another tab* was: every
`TabFade` records the tab it belongs to as the last one focused, and a focus whose last recorded tab
is a different one is a tab switch. A tab regaining focus because a pushed screen was popped finds
itself recorded, and does not fade under the native slide. The launch tab's first focus finds
nothing recorded and does not fade either. It also covers the one empty frame `app-speed-pass`
accepts on a tab's first open.

This is the one piece whose look depends on how `NativeTabs` swaps views. If the emulator shows a
flash of the previous tab, the task stops and the owner is asked. The fallback is an instant switch:
the artifacts are amended to say so before anything is shipped. Nothing silently diverges.

### D9. Sheet

`Sheet` becomes:
- `Modal animationType="none"`
- an `Animated.View` scrim with an opacity shared value
- a panel with a `translateY` shared value

Both are driven by the D1 phase machine through `useSheetMotion()` in `motion.tsx`. `sheet.tsx`
renders the animated views that hook returns and imports no Reanimated API itself.

- **Open.** Scrim 0 → 1 over `Motion.standard`. Panel from its height to 0 with `enter`.
- **Close.** The reverse with `Motion.fast` and `exit`. When the exit finishes,
  `scheduleOnRN(finish)` hides the `Modal`.

**Who closes decides what fires.**
- A close the sheet starts (scrim, back gesture) calls `onDismiss` once, when the close begins, so
  the parent records the decline at once, as today.
- A close the parent starts (`open` turning false after a choice) animates the same way and calls no
  dismissal.
- Whoever started it, `onExited` runs once when the exit finishes.
- The `open` prop turning false while the sheet is already closing (the parent clearing its state
  after `onDismiss`) does not start a second close.
- During the exit the sheet keeps rendering the last children it had while open, so the panel never
  sinks blank.

`RuleOfferSheet` stores the choice in its button handler as today, then lets `open` go false.
`transaction/[id].tsx` moves its `router.back()` from right after accept/decline into `onExited`.
So on accept, decline, scrim or back alike, the choice is stored at once and the editor closes after
the panel has left.

### D10. Busy spinner

`ActivityIndicator size="small"` (native) is rendered only while `busy`, beside the existing busy
lines:
- `manage/monobank.tsx`: beside the status line while the screen's `busy` is true, which covers
  «Синхронізувати» (the `sync` handler, a прогін), the token check («Перевірити і зберегти»,
  «Замінити токен»: `submitToken`) and «Оновити з monobank» (`refresh`, which asks the bank with the
  stored token)
- the Головний header line while a прогін the owner started with «Оновити» runs. Not for a run
  nobody started, and not for the pull gesture, which already shows `RefreshControl`'s own spinner
- the Drive backup line while its step is `busy`

A source test pins `ActivityIndicator` to those sites, each under a busy condition.

### D11. Proving "everywhere" and "never" without rendering

`src/ui/motion-usage.test.ts` reads every `.tsx` under `src/app` and `src/components` and asserts:
- no `withRepeat`, `repeat(-1`, `Infinity`, and neither `LayoutAnimation` nor `Animated` imported
  from `react-native` (`LayoutAnimationConfig` from Reanimated is allowed)
- no Reanimated animation factory (`FadeIn`, `LinearTransition`, `withTiming`, `withSpring`, …)
  imported outside `motion.tsx`, with `animated-icon.tsx` (the launch view) allowlisted
- inside `motion.tsx`, every `duration` is a `Motion.*` token and no `delay` is used
- no `Pressable` outside the D3 allowlist
- `ActivityIndicator` only at the D10 sites
- the історія статку through `MorphLine`, the donut through `MorphDonut` and the Звіти bars through
  `FillColumn`, with a re-key only on `kind: 'fade'`
- `expo-haptics` imported only in `src/platform/haptics-device.ts`; `haptics-device` imported only
  in `src/hooks/haptics-ports.ts`; no background entry (`index.ts`, `*-task.ts`,
  `src/notifications/`, `src/monobank/`, `src/reminders/`) reaching the haptics port
- `useHaptics().play(...)` only at the D13 sites, with the event each site names
- `TabFade` on the five tab roots
- `Appear` around the чернетки section, with `reflow` on its siblings
- `itemLayoutAnimation` on the list in `ListScreen` (`surfaces.tsx`, from `app-speed-pass`), drawn
  through `motion.tsx`'s `MotionList`, the three list screens on `ListScreen`, and no `entering` on
  list rows

The "no frames on a still screen" scenario has a source half (nothing loops) and a device half (the
GPU profiler bars in task 9.2).

**The device half found one source outside the app's own motion: the native tab bar.** Every tab
switch drew ~340–410 frames over ~7 s with nothing on screen changing, on this tree and on HEAD
alike (an earlier HEAD baseline of 1–2 frames was measured on a stray «Hello World» route, not on
the tabs). An atrace showed them as RenderThread-only frames (`prepareAndDraw`, no UI traversal),
7.0 s from the touch down: the noise loop of the Android 12+ ripple. `react-native-screens` 4.26
re-applies the whole tab bar appearance on every selection, and Material's `setItemRippleColor`,
`setItemActiveIndicatorEnabled` and `setItemActiveIndicatorColor` rebuild every item's background
`RippleDrawable` without an equality check, so the tapped item's ripple is replaced mid-press and
its loop runs to the end. `patches/react-native-screens+4.26.2.patch` sets those three only when
they change. After it, a switch draws 22–76 frames (the ripple, the label, `TabFade`) and then
none. No new native module; the patch reaches the phone only through a rebuilt APK and must be
re-checked when `react-native-screens` is upgraded.

### D12. Charts morph on the UI thread, and cross-fade when shapes do not match

**Matching is pure.** `src/ui/dashboard-charts.ts` gains:
- `lineMorph(prev, next)` over two `HistoryGeometry`s. It returns
  `{ kind: 'morph', from, to }` (per-point heights on a shared x layout) only when both have the
  same runs holding the same `seriesIndex` (the same day) at every position. `historyGeometry`
  downsamples each series on its own and keeps that series' extremes, so two histories over the
  same days can have equal counts at different days; those return `{ kind: 'fade' }`. There is no
  resampling, so a morph never invents a point.
- `donutMorph(prev, next)` over two donut geometries, keyed by категорія id. It returns the sectors
  as `{ key, from: [start, end], to: [start, end] }`. An arriving key starts at zero sweep where it
  will sit, and a leaving key ends at zero sweep where it was. `neutral` on either side, or keys
  present on both sides in another order, returns `{ kind: 'fade' }`, so sectors never overlap
  mid-morph.
- `columnMorph(prev, next)` over two Звіти bar models (`src/ui/reports-*`), keyed by month and bar
  key. It returns `morph` with each bar's `from` and `to` size, where an arriving column starts at
  0. It returns `fade` when a shared bar changes sign, or when the chart's room below the baseline
  appears or goes (`historyHasNegative` for the history chart, `categoryChartHasNegative` for the
  category chart), since that would shift the chart in one frame.
- `linePath` (moved out of `net-worth-widget.tsx`) and `donutSectorPath` carry the `'worklet'`
  directive. It is a string, so they stay pure and Node-tested.

**Drawing.** `motion.tsx` gains three wrappers:
- `MorphLine` and `MorphDonut` hold one progress shared value. A new target runs
  `withTiming(1, { duration: Motion.emphasis, easing: enter })` from 0.
- `useAnimatedProps` on an animated `Path` builds `d` in a worklet from `from`, `to` and the
  progress.
- A change during a morph starts the next one from the shape on screen, which is read from the
  progress, so nothing jumps.

`FillColumn` mounts at `columnMorph`'s `from` (0 on the screen's first drawing and for an arriving
column, the old size when a switch re-lays the strip out, which `MonthStrip`'s `spanOf` key does
when the span changes) and moves to its size; a mounted bar whose size changes moves from where it
is. `reports.tsx` keeps the last model drawn beside the current one (adjusted during render) to ask
`columnMorph`. A positive bar slides up out of the baseline, and a negative bar, which sits in the
half below it, slides down. Reduced motion, or `kind: 'fade'`, puts the target shape up at once; the
fade path re-keys the strip inside a `Swap`, which cross-fades it.

**A message instead of a chart.** Where a chart gives way to a message (no history yet, «Оберіть
категорію…» on Звіти) or a message to a chart, the two are siblings keyed by which one is shown, and
the arriving one enters with `crossFade`. That is the fourth cross-fade case of the spec.

**Honest numbers.** Only `d`, or a bar's `scaleY`, is animated. Captions, the date span, the points
list, legends, the scale and the витрачено in the donut's center are plain text from the new model,
or a `ChangingFigure` (the donut's center joins the D6 list). The in-between shape is drawn but
carries no number. The equalities `reports-screen` (a spelled-out сума identical to its bar) and
`main-screen` (sector proportions sum to the center) state between a chart and its numbers hold once
the chart has settled; the `motion` chart requirement says so explicitly, so no screen spec is
modified.

**Cost.** Building one path string per frame for ≤ 300 ms, on the UI thread, over at most the
history's points and the donut's sectors. Nothing runs once the morph ends.

**Alternatives considered:**
- Skia: a second renderer and a large native dependency for three small charts.
- `d3-interpolate-path` or `react-native-redash`: they resample paths and so draw points that do
  not exist, and they are dependencies for one function each.
- Always morphing by resampling to a fixed count: it bends the line through invented values when
  gaps differ.

### D13. Haptics behind a port, played by outcome

- **Port.** `src/platform/haptics.ts`: `HapticsPort { play(effect: 'confirm' | 'reject' | 'tick') }`,
  plus `recordingHaptics()`, a double that lists what was played. `haptics.test.ts` covers the
  double.
- **Mapping is data.** `src/ui/haptics.ts` holds `HAPTIC_EFFECTS`: for each effect, the Android
  constant name, its fallback, and the iOS call, as plain strings. The adapter only looks them up,
  so the mapping and the fallbacks are tested in Node:

  | Effect | Android | iOS |
  |---|---|---|
  | `confirm` | `performAndroidHapticsAsync(Confirm)` | `notificationAsync(Success)` |
  | `reject` | `performAndroidHapticsAsync(Reject)` | `notificationAsync(Error)` |
  | `tick` | `performAndroidHapticsAsync(Segment_Tick)` | `selectionAsync()` |

  On an Android API level that rejects the constant, it retries once with a constant every level
  has: `Context_Click` for confirm, `Long_Press` for reject, `Clock_Tick` for tick. Any further
  rejection is swallowed. The call is fire-and-forget and never awaited by a screen.
- **Adapter.** `haptics-device.ts` has `playAndroid` and `playIos`, chosen by `Platform.OS`.
- **No permission.** `app.json` sets `android.blockedPermissions: ["android.permission.VIBRATE"]`,
  since `impactAsync` and `notificationAsync` are never called on Android. The adapter is never
  imported by a test (`.claude/rules/testing.md`). A source test in `src/ui/haptics.test.ts` reads
  `haptics-device.ts` as text and pins that `playAndroid` calls only `performAndroidHapticsAsync`,
  and that `impactAsync` appears nowhere.
- **Policy.** `src/ui/haptics.ts` is pure:
  - `hapticFor(event, { enabled })`, where event is one of `stored | removed | merged |
    rule-accepted | scanned | refused | failed | stepped | chosen | toggled`. It returns the effect,
    or `null` when `enabled` is false.
  - `syncOutcomeEvent(run)` turns a finished прогін into `failed` when `syncFailed(run)`
    (`src/ui/monobank-screen.ts`, the rule the screen already shows) holds, and into nothing
    otherwise: a run whose рахунки are all done, перенесено or скасовано is not a failure. The sites
    call it rather than choosing the event by hand.
  - `choiceEvent(prev, next, event)` returns nothing when the value did not change.
  - `strongestHaptic(events)` settles one owner action: of the events it raised, an outcome
    (confirm or reject) wins over a tick, and one effect plays at most.

  Its test quotes the `motion` scenarios.
- **Binding.** `src/hooks/haptics-ports.ts` exports `useHaptics()`. It returns
  `play(event)`, which reads the preference through the repo (D14) and calls the adapter.
  It is the only file importing the adapter. `play` collects the events raised in the same JS task
  and plays `strongestHaptic` of them once, in a microtask: a chip tick raised by the tap that also
  stores a категорія on a feed line gives way to the store's confirm.
- **Sites.** Each call sits where the outcome is known, after the write succeeds, never in the
  press handler before it:
  - `stored`: `transaction/new.tsx` after a store, `transaction/[id].tsx` after a save, a чернетка
    confirmed on Головний, and a категорія picked on a feed line (Головний and «Транзакції»)
  - `removed`: `transaction/[id].tsx`
  - `merged`: the merge in `account/[id].tsx`
  - `rule-accepted`: the sheet's accept, in `useRuleOffer`'s `accept` once the правило is stored
    (a failed store plays nothing)
  - `scanned`: `transaction/scan.tsx`, the first decode only
  - `refused`: one site per screen in the entry form and the editor: the `catch` that shows
    `failureAlert` («Не записано» on the form, «Не збережено» in the editor), which `buildEntry`'s
    refusal also lands in, so a refusal plays once. The future-date question (`entryDateCheck`'s
    `Alert`), the переказ question (`askAboutTransfer`) and the delete confirmation are questions and
    play nothing.
  - `failed`: a прогін the owner started («Оновити» on Головний, «Синхронізувати» on
    `manage/monobank.tsx`), per `syncOutcomeEvent`; the Drive бекап the owner started and the token
    check (`submitToken`, and `refresh` when the owner asked), when they end in failure
  - `stepped`: Місяць's step handlers
  - `chosen`: `Chip` in `form.tsx` (which `Choices` and `Picker` draw), when the chip was not
    already the picked one
  - `toggled`: `ThemedSwitch`'s `onValueChange` wrapper. The «Вібрація» switch stores first and
    plays after, so turning it on ticks and turning it off plays nothing.
- **Once per action.** A store that also opens a правило offer plays `stored` only. The sheet's own
  accept is a second owner action, so it plays `rule-accepted`. A `chosen` that re-picks the
  current value plays nothing.
- **Background.** Background tasks run with no screen and never import the port (D11).

### D14. The «Вібрація» preference

- **Storage.** A `haptics_preference` table: `id` text primary key, CHECK `id = 'haptics'`, and
  `enabled` integer boolean not null. No row means on.
  - `npm run db:generate` produces the migration. A migration test proves an existing database
    gains the empty table and reads as on.
  - `src/db/haptics-preference-repo.ts` has `read()` and `set(enabled)` (an upsert). Its test covers
    no row, off and back on.
- **Freshness.** `haptics-preference-repo.ts` answers `read()` through a `stampedMemo`
  (`src/db/stamp.ts`), like the other repositories that use it. Between writes the answer comes from memory. Any write, whether the switch,
  a restore or anything else, makes the next read fresh, so a restored preference governs the next
  action with no restart. The switch's own screen re-reads on focus like every other settings
  screen.
- **Screen.** `(tabs)/settings.tsx` renders a `ListCard` under the sections with one row:
  «Вібрація» and a `ThemedSwitch`. It is not a `SETTINGS_SECTIONS` entry, because it opens nothing.
- **Бекап.**
  - `haptics_preference` joins `BACKUP_TABLES`, as `dashboard_layout` did.
  - The format gains an optional `haptics: { enabled }`, which is absent when there is no row. An
    older file without it restores to no row, which reads as on.
  - It is written in the same restore transaction as everything else.
  - `BACKUP_FORMAT_VERSION` stays 2: the field is optional, like `dashboardLayout`.
  - `BACKUP_SCHEMA_VERSION` goes up by one with the new migration, as its tripwire in
    `format.test.ts` demands. `app-speed-pass` adds a migration too, and this change lands after
    it, so the number is whatever the journal holds then.
  - A present `haptics` whose `enabled` is not a boolean fails the parse, and the бекап is refused
    whole.

## Risks / Trade-offs

- **[Reanimated CSS transitions or layout animations ignore reduced motion in 4.5]** → The prebuilt
  factories in `motion.tsx` never rely on the default. `useMotion()` reads `useReducedMotion()` and
  swaps each movement for its reduced form itself (D4); `ReduceMotion.System` on the moving set is
  only a second guard.
- **[Layout animations inside FlatList cost on long lists]** → Only `exiting` and
  `itemLayoutAnimation`, never `entering`. Rows outside the window are not mounted, so they are not
  animated.
- **[A figure keyed on its text remounts its subtree]** → The subtree is one `Text`.
- **[`ios_from_right` feels foreign on Android]** → Swapping it for `slide_from_right` is one token
  (D2). The owner picks during the emulator check.
- **[The sheet's deferred `router.back()` leaves a window where the owner taps again]** → The panel
  is non-interactive while `closing`, and the exit lasts 150 ms.
- **[A morph between two currencies draws shapes that are neither]** → Only the path moves, for
  300 ms. Every number shown is real (D12), and the owner chose morphing over a cross-fade.
- **[Haptics on a phone below API 30 feel different]** → The fallback constants are the platform's
  own. The owner's phone is the proof (task 9.2).
- **[`blockedPermissions` hides a call that needs `VIBRATE`]** → Only `performAndroidHapticsAsync`
  is called on Android, and the source check in `src/ui/haptics.test.ts` pins it. The merged manifest is checked in the dev
  build (task 8.1).
- **[Too many ticks]** → Ticks fire only on a real change of a choice, never on scroll or on a
  repeated value, and the owner can switch vibration off.
- **[Battery]** → Every app-driven animation is one-shot and ≤ 300 ms. The spinner lives only while
  work runs. No `withRepeat` is allowed (D11). The idle frame count is checked on the emulator.
