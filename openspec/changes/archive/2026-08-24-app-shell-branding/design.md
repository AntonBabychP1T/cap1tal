# app-shell-branding — design

## Context

See proposal.md — Why. The relevant current state:

- `_layout.tsx` renders `<AnimatedSplashOverlay />` in **every** branch and relies on it being the
  only caller of `SplashScreen.hideAsync()`. If it stops rendering, the native splash never lifts
  and the migration-failure message stays invisible. Its shape must not change.
- `AnimatedSplashOverlay` shows `expo-logo.png` on a hardcoded `#208AEF` (Expo blue) and reads no
  theme. `animated-icon.web.tsx` already renders `null` — web has no native splash.
- `app.json` configures `expo-splash-screen` with `image: splash-icon.png`, `imageWidth: 76`,
  `backgroundColor: #208AEF`. **`splash-icon.png` and `expo-logo.png` are byte-identical**
  (md5 `5ee5db91d59518c45ebcc99a2f5afc57`) — the same white Expo logo, referenced twice.
- `src/constants/theme.ts` owns the palette: light `background #ffffff` / `text #000000`, dark
  `background #000000` / `text #ffffff`. `app-tabs.web.tsx` already renders `cap1tal` as a text
  wordmark in the web tab bar, so a text wordmark is the established brand treatment, not a new one.
- CI's `android` job (`.github/workflows/ci.yml`) runs `expo prebuild` + `gradlew assembleDebug`
  and is triggered by changes to `app.json` — so this change is checked by a real native build.

## Goals / Non-Goals

**Goals:**

- No Expo logo, wordmark or brand colour anywhere in the launch sequence.
- The launch view carries the app's own name and follows light/dark.
- Nothing ships that nothing references.
- Zero change to `_layout.tsx`'s structure and to the `hideAsync` contract.

**Non-Goals:**

- The app icon (see proposal.md — Non-goals). The launcher icon stays the Expo chevron.
- Any new dependency, font, or design system. Nothing here needs a designer.
- Changing the fade animation itself — the existing keyframe is kept as-is.

## Decisions

### 1. The wordmark is live text, not an image

The overlay renders `cap1tal` with `<Text>`, in the platform's own UI font, coloured from
`Colors[scheme].text` on `Colors[scheme].background`.

*Alternative considered — a generated wordmark PNG.* Rejected on two counts. First, licensing: the
fonts available on this machine (SF/`SFNS.ttf`, Helvetica, Avenir, Arial) are licensed for Apple or
Microsoft platforms and may not be rasterised into an asset shipped in an Android APK; no
open-licensed text font exists in the project (`node_modules/@expo-google-fonts/material-symbols`
is an icon font), so this would mean adding a font dependency to draw seven letters. Second, an
image would have to be pixel-matched against the text the overlay draws or the handover would jump.
Live text has neither problem and costs nothing.

### 2. The native splash shows a colour and a deliberately blank icon

`app.json` keeps `image`, but points it at `assets/images/splash-blank.png` — a 1×1 fully
transparent PNG — with `imageWidth: 1`, `backgroundColor: #ffffff` and
`dark: { backgroundColor: #000000, image: <same blank> }`.

This looks odd and is worth stating plainly, because the obvious alternative was tried and is
broken. *Alternative considered — drop `image` entirely.* **Verified to break the Android build.**
`withAndroidSplashStyles.addSplashScreenStyle` writes `windowSplashScreenAnimatedIcon` →
`@drawable/splashscreen_logo` **unconditionally**, while `withAndroidSplashImages` deletes every
`splashscreen_logo` drawable and writes a replacement only when an image is configured
(`getAndroidSplashConfig` gives `image` no default). Running `expo prebuild --platform android`
with an image-less config produced exactly that: `styles.xml` referencing
`@drawable/splashscreen_logo` and `find res -name 'splashscreen_logo*'` returning nothing — a
dangling resource reference, which fails AAPT2 linking. Re-running prebuild with the blank image
produced `splashscreen_logo.png` in all five dpi buckets plus all five `-night` buckets, and
`values-night/colors.xml` with `#000000`. Android's splash API requires an icon; the only way to
show none is to make it invisible.

*Alternative considered — `android.drawable.icon` pointing at an empty vector XML.* Also works, but
it is Android-only (iOS would need separate handling) for no gain over one transparent pixel.

### 3. The splash colour is the theme background, not a brand colour

`#ffffff` / `#000000` are taken from `Colors.light.background` / `Colors.dark.background`, so the
system splash, the overlay behind the wordmark, and the first screen are all the same colour and
the handover is invisible. A brand colour would be better — but the project has no brand colour,
and inventing one is the design question the proposal put out of scope.

`app.json` is JSON and cannot import `Colors`. The two must be kept in sync by hand, and `app.json`
is strict JSON that cannot carry a comment either — so the note lives on the side that can hold
one, in `animated-icon.tsx` beside the matching `backgroundColor` (see Risks).

### 4. The overlay becomes theme-aware; everything else about it stays

`useColorScheme()` picks the palette, exactly as `app-tabs.tsx` already does
(`scheme === 'unspecified' ? 'light' : scheme`). The keyframe, the `hideAsync`-in-`onLayout` dance,
the `scheduleOnRN(setVisible, false)` callback and the `visible`/`animate` state machine are
untouched — they implement "the launch view always gives way", including the failure path, and this
change has no reason to touch them. `animated-icon.web.tsx` keeps returning `null`.

### 5. Renames and deletions

`tabIcons/explore.png` → `tabIcons/accounts.png` with its `@2x`/`@3x` variants, so Metro's scale
resolution keeps working; `app-tabs.tsx` has the single `require`. Deletions are the seven already
dead files plus `expo-logo.png` and `splash-icon.png`, which decision 1 and decision 2 orphan.

## Risks / Trade-offs

- **The splash colour in `app.json` and the palette in `theme.ts` can drift.** → A comment in
  `animated-icon.tsx` naming `app.json`; strict JSON cannot carry the mirror comment. Drift is
  visible as a flash at launch, and task 4 checks both themes.
- **A 1×1 transparent splash image reads like a mistake to the next person.** → It is explained in
  decision 2 and the file is named `splash-blank.png` rather than something neutral; `app.json`
  cannot say so itself. This is the cost of Android's mandatory splash icon, not a preference.
- **The launcher icon is still the Expo chevron**, so the app is only half de-branded after this
  change. Accepted and stated in the proposal; it needs artwork and an owner decision.
- **On Android 12+ the system splash is themed at install time** from `values`/`values-night`, so
  switching system theme while the app is backgrounded can briefly show the previous colour. Not
  worth engineering around for a splash.

## Verification split

`verify` (lint, typecheck, Vitest) cannot execute JSX — `.claude/rules/testing.md` — so it proves
only that the tree compiles and that nothing references a deleted asset. The three launch scenarios
of `app-shell` are proven by:

- `npx expo export --platform android` — the asset list is the evidence for "No leftover images are
  bundled", and a broken `require` of a renamed or deleted file fails the export.
- `npx expo prebuild --platform android` — the evidence that the splash config resolves; already
  run once for decision 2, and re-run on the final config.
- A manual launch on Android in **both** light and dark appearance for "Launching shows the app's
  own name", "The launch view follows the system appearance" and "The handover from the system is
  seamless" — the same stated exception `accounts-manual-transactions` task 4.5 uses.

This mirrors the split that change established: JSX wiring is compile-checked and smoke-checked, and
the result of the manual smoke is written into tasks.md before archive.
