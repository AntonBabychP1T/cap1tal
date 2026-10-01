## Why

The owner asked for this on 2026-09-29: transitions between screens and on most actions that are
simple and pleasant to look at, but tuned so they cost neither battery nor processor. An earlier
change (`redesign-foundation`) put motion off. This change picks it up on the owner's request. It is
not on BACKLOG.md. The same day the owner widened it: vibration on the moments that matter, charts
that morph from one shape to the next, and new dependencies where they earn their place.

Apart from the launch view, nothing in the app moves. Every change of state is a cut:
- Screens replace each other with whatever the platform happens to default to.
- A section that opens (чернетки, the inline категорія picker, the статок explanation) shoves
  everything under it down in one frame.
- A service row that appears or leaves makes the dashboard jump.
- A meter or a progress ring snaps to its new value.
- A new місяць on Місяць replaces the old one without saying which way the owner went.
- About 30 tappable elements give no sign that they were touched, and the rest disagree on how they
  show it (opacity 0.6, 0.7 and 0.75, and one scale).

- Nothing is felt. A stored транзакція, a refusal and a scanned чек are only seen, so a store made
  while looking away is not confirmed at all.
- A chart that gets new data or another currency is redrawn in one frame, so the owner cannot see
  what changed in its shape.

The app reads as unfinished, and the owner cannot always tell whether a tap landed. A small set of
short, purposeful transitions fixes both. They must not cost battery: nothing loops, nothing runs
while the screen is still, and everything respects the phone's "remove animations" setting.

This serves no vision problem directly (where money went / how much is left). It makes both
answers read as one continuous place. It is a presentation change: no number, rule or order moves.

## What Changes

- **One motion vocabulary** for everything the app animates itself: three durations (fast 150 ms,
  standard 220 ms, emphasis 300 ms), one easing for entering and one for leaving, and one spring for
  press feedback. Platform-drawn motion keeps its own timing: screen transitions, the ripple,
  switches and the spinner.
- **Screen transitions:**
  - A pushed screen enters from the side and goes back the way it came.
  - The entry form (нова транзакція) and the receipt scanner rise from the bottom. They stay pushed
    screens, not modals, and what the entry form does after a store does not change.
  - Switching tabs cross-fades the content within 150 ms.
- **Press feedback on everything tappable:**
  - one pressed look (a native ripple on Android, one pressed tone elsewhere)
  - a slight press-in on the primary buttons and the add button
- **What opens, closes or leaves** fades and moves its neighbours smoothly instead of jumping: the
  чернетки, the inline категорія picker, the Picker list, the service rows, the статок points and
  explanation, and a row leaving a list. Rows arriving in a list appear at once.
- **Progress that fills:** meters, progress rings and the Звіти bars move from their previous value
  to the new one. On the first drawing of a screen they fill from empty, once. Switching a meter or
  a ring to another категорія or місяць does not fill; the Звіти bars morph on a switch instead.
- **Money figures that change in sight** (the статок per currency, a рахунок's balance, the month's
  витрачено and залишилось, the витрачено in the категорії donut's center) replace the old figure
  with a short fade-and-rise. They never count through amounts that are not real.
- **Switching what is shown:** month stepping on Місяць slides the new month in from the side of
  the step.
- **Charts morph:** the історія статку, the категорії donut and the Звіти bars move from their old
  shape to the new one when their data or their selection (history, currency, категорія) changes.
  A shape that cannot be matched (other days, a gap that appears or closes, donut sectors changing
  order, a bar changing sign) cross-fades instead. Every number beside a chart is real at every
  moment; only the drawn shape passes through in-between states.
- **Vibration (haptics):** a short system haptic marks an outcome, not a touch:
  - confirm: a транзакція stored or removed, рахунки merged, a правило accepted, a чек found by the
    scanner
  - reject: a store refused, or a прогін, бекап or token check the owner started failing
  - a light tick: a choice changed (month step, a chip, `Choices`, a switch)

  A question the app asks plays nothing, and a прогін that is перенесено or скасовано is not a
  failure.

  At most one per owner action, never from background work. A new «Вібрація» switch on
  Налаштування turns it off; it is on by default, travels in a бекап, and the phone's own
  touch-feedback setting still silences it.
- **The bottom sheet:** the scrim fades while the panel rises. Closing plays in reverse. A choice is
  stored at once; only the dismissal and the navigation after it wait for the panel.
- **Busy states:** a small native spinner sits beside the existing busy line, only while busy.
- **Reduced motion:** with the system setting on, every movement becomes an instant change or a plain
  cross-fade. Screens still change, nothing slides.

**Non-goals:**
- Vibration on every tap. The ripple acknowledges a touch; haptics mark outcomes only.
- Custom vibration patterns, or the `VIBRATE` permission: only the system's own haptic effects.
- Shared-element transitions.
- Skeleton loaders: local reads have no loading phase.
- A launch hand-off fade: the launch view's hand-over stays exactly as `app-shell` specifies.
- Lottie, Skia, or a charting or path-interpolation library. The one new dependency is
  `expo-haptics`; morphing is built on Reanimated and react-native-svg, which are installed.
- Predictive back (stays off, `app.json`).
- Animating programmatic scrolls that earlier changes made instant on purpose.
- The entry-form confirmation line (main-screen ends it on any field change) and onboarding.
- The bug-report sheet (`bug-report-here.tsx`), which stays untouched until a change owns
  `bug-report-screen`.
- Tab-bar icon animations.

Vision §14 is not touched.

**Order:** land after `app-speed-pass`. Both touch Головний, «Транзакції», a рахунок and Звіти, and
list-row motion depends on the list components that change introduces.

## Capabilities

### New Capabilities

- `motion`: the app-wide rules for movement:
  - the shared vocabulary and its ceiling
  - never looping or idling
  - reduced motion
  - press feedback
  - screen transitions
  - what opens, closes or leaves
  - filling progress
  - changing sums
  - switching what is shown
  - sheets
  - busy states
  - charts that morph
  - haptics and when they play

### Modified Capabilities

- `settings-screen`: the Налаштування tab gains the «Вібрація» switch.
- `backup-file`: a бекап carries the vibration preference.

Every other screen spec keeps its requirements. `motion` states the cross-cutting rules they all
follow, including that a chart equals its numbers (`reports-screen`, `main-screen`) once it has
settled, not during its 300 ms morph. This is accepted explicitly rather than written as MODIFIED
deltas: `reports-screen`'s "a spelled-out сума identical to its bar" and `main-screen`'s donut
proportions are read as statements about the settled chart, and `motion` is the one place that says
what happens during the 300 ms between two settled states.

## Impact

- **New:**
  - `src/constants/theme.ts`: a `Motion` export, covered by `theme.test.ts`
  - `src/ui/motion.ts` (+ test): the pure policy (which transition a route gets; what a movement
    becomes under reduced motion; fill starts; the sheet phases)
  - `src/components/motion.tsx`: small wrappers (`Tap`, `Appear`, `FillBar`, `FillRing`,
    `FillColumn`, `MorphLine`, `MorphDonut`, `ChangingFigure`, `TabFade`), the `stepIn` factory
    and `useSheetMotion()`, and the only place Reanimated animation factories are imported
- **Changed:**
  - `src/app/_layout.tsx`: stack `animation` per route
  - `src/components/surfaces.tsx`, `form.tsx`, `transaction-row.tsx`, `manage-list.tsx`,
    `sheet.tsx`, `rule-offer-sheet.tsx`, `net-worth-widget.tsx`, `category-widget.tsx`
  - the screens in `src/app/(tabs)/`, `transactions.tsx`, `account/[id].tsx`,
    `transaction/[id].tsx`, `progress.tsx` and `manage/*`, where bare `Pressable`s get the shared
    `Tap`
  - `src/components/net-worth-widget.tsx`, `category-widget.tsx` and `(tabs)/reports.tsx`: charts
    drawn through the morphing wrappers (`MorphLine`, `MorphDonut`, `FillColumn`)
  - `src/ui/dashboard-charts.ts`: the line and sector path builders become worklet-safe pure
    functions, plus the pure shape matching (`lineMorph`, `donutMorph`); `columnMorph` for the
    Звіти bars
- **Haptics:**
  - dependency `expo-haptics` (~57.0.3, installed with `npx expo install`). It is a native module,
    so a new dev build is needed; `android/` stays generated.
  - `app.json`: `android.blockedPermissions` gains `android.permission.VIBRATE`. The module's
    manifest declares it, but only `performAndroidHapticsAsync` is used, which needs no permission.
  - `src/platform/haptics.ts` (port and a recording double, + test) and `haptics-device.ts`
    (adapter); `src/ui/haptics.ts` (+ test): the pure event → effect policy
  - `src/hooks/haptics-ports.ts`: binds the adapter and the preference
  - the haptic sites: `transaction/new.tsx`, `transaction/[id].tsx`, `transaction/scan.tsx`,
    `account/[id].tsx`, `rule-offer-sheet.tsx`, `form.tsx` (`Chip`, `Choices`, `ThemedSwitch`),
    `(tabs)/month.tsx`, `(tabs)/index.tsx`, `manage/monobank.tsx` and the Drive бекап screen
  - schema: a single-row `haptics_preference` table (no row = on), a new migration,
    `BACKUP_SCHEMA_VERSION` up by one, and `src/db/haptics-preference-repo.ts` (+ test)
  - `src/backup/format.ts`: an optional `haptics` field, restored all-or-nothing; older бекапи
    restore with vibration on
  - `(tabs)/settings.tsx`: the «Вібрація» switch
- Reanimated 4.5, worklets and gesture-handler are already installed, and the worklets Babel plugin
  is already applied by `babel-preset-expo`.
