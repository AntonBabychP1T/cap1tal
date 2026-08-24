## 1. The native splash stops showing the Expo logo

- [x] 1.1 Add `assets/images/splash-blank.png` — a 1×1 fully transparent PNG. It exists only to
      satisfy Android's mandatory `windowSplashScreenAnimatedIcon`, which `expo-splash-screen`
      declares unconditionally (design decision 2). Requirement: "Launching the app shows the app's
      own identity" — this is what makes the native splash show no logo at all.
- [x] 1.2 `app.json`: point the `expo-splash-screen` entry at the blank image with `imageWidth: 1`,
      `backgroundColor: "#ffffff"`, and `dark: { backgroundColor: "#000000", image: <blank> }`.
      The two colours are `Colors.light.background` / `Colors.dark.background` from
      `src/constants/theme.ts`. *(Corrected during apply: `app.json` is strict JSON and cannot
      carry a comment, so the sync note lives on the other side of the pair, in
      `animated-icon.tsx` next to the matching `backgroundColor`.)* Proves
      scenarios "The launch view follows the system appearance" and "The handover from the system
      is seamless" (with 4.2). Expo blue `#208AEF` must not appear in the file afterwards.

## 2. The launch view carries the app's own name

- [x] 2.1 `src/components/animated-icon.tsx`: replace the `expo-logo.png` `<Image>` with the
      `cap1tal` wordmark as `<Text>`, and take the overlay background and the text colour from
      `Colors[useColorScheme()]` instead of the hardcoded `#208AEF` — matching the
      `scheme === 'unspecified' ? 'light' : scheme` guard `app-tabs.tsx` already uses (design
      decisions 1, 3, 4). Requirement: "Launching the app shows the app's own identity"; scenario
      "Launching shows the app's own name".
- [x] 2.2 Leave the keyframe, the `onLayout` → `SplashScreen.hideAsync()` call, the
      `scheduleOnRN(setVisible, false)` callback and the `visible`/`animate` states exactly as they
      are, and leave `_layout.tsx` and `animated-icon.web.tsx` untouched. This is what keeps the
      requirement "The launch view always gives way" true, including its scenario "A storage
      failure is not hidden behind the launch view". Verify by reading the diff: neither file may
      appear in it, and `hideAsync` must still have exactly one caller.

## 3. Nothing ships that nothing references

- [x] 3.1 Rename `assets/images/tabIcons/explore.png` and its `@2x`/`@3x` variants to
      `accounts.png`, and update the single `require` in `src/components/app-tabs.tsx`. Keeps all
      three scale variants together so Metro's resolution still works (design decision 5).
      Requirement: "The app ships no unreferenced image" — the scaffold's word for a tab
      that no longer exists.
- [x] 3.2 Delete the seven already-dead scaffold images: `logo-glow.png`, `react-logo.png`,
      `react-logo@2x.png`, `react-logo@3x.png`, `expo-badge.png`, `expo-badge-white.png`,
      `tutorial-web.png`. Before deleting, re-grep the repo for each basename and confirm zero
      hits outside `openspec/` prose.
- [x] 3.3 Delete `expo-logo.png` and `splash-icon.png` — byte-identical copies of the same white
      Expo logo, orphaned by tasks 1.2 and 2.1. Confirm by grep that neither `app.json` nor any
      source file mentions them. Requirement: "The app ships no unreferenced image".
- [x] 3.4 Confirm the images that stay are still referenced: `icon.png`, `favicon.png`,
      `android-icon-{foreground,background,monochrome}.png` and `assets/expo.icon/` from
      `app.json`, `tabIcons/{home,accounts}.png` from `app-tabs.tsx`, `splash-blank.png` from
      `app.json`. These are Expo artwork and stay by decision — proposal.md, Non-goals.

## 4. Evidence the specs cannot get from `verify`

- [x] 4.1 `npx expo export --platform android`: the export must succeed (a broken `require` of a
      renamed or deleted asset fails it) and its bundled-asset list must contain none of the nine
      deleted files. Paste the asset list. This is the evidence for scenario "No unreferenced image
      is bundled" — `verify` never bundles.

      Export succeeded, 1740 modules. The only project assets in the bundle:

      ```
      › Assets (33):
      assets/images/tabIcons/accounts.png (3 variations | 343B)
      assets/images/tabIcons/home.png (3 variations | 358B)
      ... 31 more, all from node_modules (expo-router internals, Material Symbols font)
      ```

      `expo-logo.png` was bundled before this change and is gone; none of the nine deleted files
      appear. "3 variations" confirms the `@2x`/`@3x` rename resolved. `splash-blank.png` is
      correctly absent — it is native config, referenced by `app.json`, never `require`d by JS.
- [x] 4.2 `npx expo prebuild --platform android`: confirm `values/colors.xml` has
      `splashscreen_background #ffffff`, `values-night/colors.xml` has `#000000`, and a
      `splashscreen_logo` drawable exists in every dpi bucket (light and `-night`) so
      `styles.xml`'s `@drawable/splashscreen_logo` resolves. This is the check that would have
      caught the image-less config in design decision 2. Note that `android/` is generated and
      gitignored, and that prebuild rewrites the `android` script in `package.json` — restore it.

      All ten drawables present — `drawable-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/splashscreen_logo.png`
      and the five `drawable-night-*` equivalents — so `styles.xml`'s
      `@drawable/splashscreen_logo` resolves. `values/colors.xml` → `splashscreen_background
      #ffffff`, `values-night/colors.xml` → `#000000`. `package.json` restored.
- [x] 4.3 Manual smoke on Android of the launch, in **both** light and dark appearance — the stated
      exception to `.claude/rules/testing.md`, since Vitest never runs JSX. Covers "Launching shows
      the app's own name", "The launch view follows the system appearance", "The handover from the
      system is seamless" and "The launch view gives way to the first screen". Confirm no Expo blue
      and no Expo logo appears at any point. Write the result here before archive.

      `scripts/android.sh up` on `Pixel_10_Pro` (API 36), debug APK over Metro. Each appearance was
      set with `adb shell cmd uimode night no|yes`, the app force-stopped, relaunched, and caught
      with a burst of ~24 `screencap`s; screenshots in `.cache/android/` (gitignored).

      Frames are described by measurement, not by eye: for each one the centre band (y 46–54 %,
      x 30–70 %, where the wordmark sits) was compared against the flat splash colour, and
      `maxDev` below is the largest per-channel departure from it, out of 255.

      **Light** (`light2-01…24`, `light2-settled`, background `#ffffff`): frames 02–20 are a flat
      white screen — `maxDev ≤ 8`, i.e. nothing is drawn there at all: no logo, no wordmark, no
      image of any kind. Frame 21 carries the wordmark **cap1tal** at `maxDev 22`, frame 22 at
      `maxDev 125` — the strongest the wordmark was ever caught. Frames 23, 24 and
      `light2-settled` are already Головний (the whole band is screen content).

      **Dark** (`dark-01…24`, `dark-settled`, background `#000000`): the same shape in black —
      frames 02–22 flat at `maxDev ≤ 8`, the wordmark at `maxDev 16` on frame 23 and `maxDev 112`
      on frame 24, and Головний in `dark-settled`. The launch view follows the system appearance
      in both directions and gives way to the first screen; it does not come back.

      In both runs the background colour never changes across the whole sequence: the system's
      splash background, the surface behind the wordmark, and the first screen are one continuous
      `#ffffff` / `#000000`. No third colour appears in any frame — the handover is invisible.

      No Expo blue (`#208AEF`) and no Expo logo appears in any frame of either run, and
      `grep -rni '208AEF\|expo-logo\|splash-icon\|react-logo\|expo-badge\|logo-glow\|tutorial-web'`
      over `src/` and `app.json` returns nothing. (`plugins/` does not exist in this repo — the
      layout in CLAUDE.md lists it for the day a config plugin is needed.)

      Two honest limits, both worth the owner's attention rather than burying:

      1. **The wordmark was never caught at full opacity** — its peak was `maxDev 125/255` (light)
         and `112/255` (dark), roughly half contrast. Captures are ~200 ms apart, so this does not
         prove the fully-opaque moment is short; it proves only that it was never sampled. That
         the text is drawn at `theme.text` (`#000000` light / `#ffffff` dark) over
         `theme.background` is `animated-icon.tsx:45` + `themed-text.tsx:17` — code, not a
         screenshot.
      2. **For most of the launch the screen carries no name at all**: 19 of 24 light frames and
         21 of 24 dark frames are flat, empty background. The requirement "Launching the app shows
         the app's own identity" is met in the sense the scenarios state — what is shown is the
         app's own name and nothing else's — but what the owner mostly sees is a blank screen,
         with the name a brief low-contrast appearance at the end. Making the name the whole launch
         rather than its last moment is a change this one does not make.

## 5. Gate

- [x] 5.1 Run `npm run verify` and paste the final lines

      ```
      Test Files  15 passed (15)
           Tests  157 passed (157)
      ✔ verify passed (d87847c6e43f028b24c24f27724969e8637ca154)
      ```

      The earlier paste here quoted `b56fa09e…`, a tree from before tasks 1.2, 2.1 and the 4.3
      write-up — stale evidence. The hash above is from the run immediately before this paste;
      writing evidence into a watched file necessarily moves the fingerprint on, so `verify` is
      re-run once more before the commit and the commit hook checks that run, not this quote.
- [x] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      First pass: **FAIL**, 3 critical.
      1. `.claude/settings.json` carried an uncommitted, unrelated rewrite of the permission model
         (`git push` `ask`→`allow`; the destructive git set `deny`→`ask`), contradicting CLAUDE.md
         hard rule 5. Taken to the owner, who kept it: it is now its own commit together with
         CLAUDE.md rule 5, workflow step 5 and the `guard-bash.sh` comment, all rewritten to say
         what is true. `guard-bash.sh` still hard-blocks the destructive set regardless of the
         permission layer, so enforcement did not move — only the prompt on a plain push did.
      2. Task 4.3 was unticked and was the sole evidence for four scenarios. Run and written up.
      3. The app-shell requirement claimed the app ships no scaffold image, while proposal.md
         Non-goal 1 keeps the Expo icon set. Narrowed to "no image that nothing references", with
         the referenced icon set named as the stated exception, and retitled to match.

      Second pass: **PASS**, 0 critical. Two of its warnings are fixed above — the frame
      attribution in 4.3 (the first write-up described a fade that the pixels do not show; it is
      now measurement, independently re-measured here before trusting the reviewer) and the
      requirement title. Deliberately left for later, none of them regressions from this change:
      the storage-failure scenario has no test and no smoke (behaviour is pre-existing and this
      diff does not touch it); "no unreferenced image ships" has no automated guard, though a
      pure-Node Vitest walk of `assets/` against `app.json` + `require(` would fit inside
      `verify`; and `expo-image` is now imported nowhere in `src/` — this change orphaned its last
      consumer, which is the same argument the change makes about images, unapplied to a dependency.
