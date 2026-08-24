# app-shell-branding

## Why

`accounts-manual-transactions` replaced the Expo template demo screens with Головний and Рахунки,
but it deliberately left the app shell alone: the launch splash still shows the **Expo logo** on
Expo blue, and seven template images nothing references any more still sit in `assets/images/`.
A personal money tracker whose data never leaves the phone (vision §12) should not open every
morning under someone else's brand — the first thing the owner sees should say the app is theirs.

This change answers neither "where did the money go" nor "how much is left": it records no
transaction and computes no number. It is shell hygiene on the boundary of the two screens that do
answer them, and it is worth doing now because the template's leftovers are at their smallest —
one screen-replacing change has just finished, and nothing else has been built on top of them yet.

## What Changes

- **Launch stops showing the Expo logo.** Opening the app shows the app's own name — the `cap1tal`
  wordmark, as text, on the app's own background — and nothing else, until the first screen is
  ready. The wordmark is typography, not artwork: no image asset is introduced, so nothing has to
  be drawn and nothing can go stale.
- **The native splash becomes a plain, theme-aware colour** matching the background the wordmark
  sits on, so the handover from the system splash to the app is seamless in both light and dark
  mode instead of flashing Expo blue. It shows no logo — but it cannot show *nothing*: Android's
  splash API always demands an icon drawable, and `expo-splash-screen` always declares one, so a
  deliberately blank (fully transparent) image is committed for the sole purpose of satisfying
  that declaration. Verified against `expo prebuild` — see design.md, decision 2.
- **Nine unreferenced images are deleted** (and one blank one added, per the bullet above). Seven are already dead: `logo-glow.png`,
  `react-logo{,@2x,@3x}.png`, `expo-badge.png`, `expo-badge-white.png`, `tutorial-web.png`. Two
  become dead with the two bullets above: `expo-logo.png` and `splash-icon.png` — which are
  **byte-identical** (md5 `5ee5db91…`), both being the white Expo logo, so the splash is losing one
  picture, not swapping one for another.
- **The Рахунки tab icon is renamed** from `tabIcons/explore.png` to `tabIcons/accounts.png` (with
  its `@2x`/`@3x` variants). "explore" is the template's word for a tab that no longer exists;
  rule 7 asks for glossary terms, and this file is read every time someone edits the tab bar.

### Non-goals (deliberately out of scope)

1. **The app icon stays Expo's.** `icon.png`, `android-icon-{foreground,background,monochrome}.png`,
   `favicon.png` and `assets/expo.icon/` are all still the Expo chevron, and the adaptive-icon
   background `#E6F4FE` is Expo's blue. Replacing them needs artwork the project does not have and
   an owner decision about what cap1tal should look like — a design question, not a cleanup. This
   change flags it; it does not answer it. **The Expo chevron therefore remains on the home
   screen and in the launcher after this change.**
2. **No screen behaviour changes.** Головний, Рахунки and the editing screen keep every requirement
   `accounts-manual-transactions` gave them; the tab labels stay Головний and Рахунки.
3. No vision §13 item is touched.

## Capabilities

### New Capabilities

- `app-shell`: what the owner meets before any screen — what launching the app shows, and that it
  shows the app's own identity rather than a toolchain's. It is the one piece of owner-visible
  behaviour that belongs to no single screen.

### Modified Capabilities

<!-- None. No existing requirement changes: this change adds launch behaviour that was never
     specified, and otherwise deletes files nothing references. -->

## Impact

- `app.json` — the `expo-splash-screen` plugin entry points `image` at the blank asset and gains a
  `dark` variant; `backgroundColor` moves off Expo blue onto the app's own palette. Changing
  `app.json` makes CI run its `android` job (prebuild + `assembleDebug`), so this change is
  exercised by a real native build.
- `src/components/animated-icon.tsx` — renders the wordmark instead of `expo-logo.png`, and takes
  its colours from `@/constants/theme` instead of the hardcoded `#208AEF`. It stays the only caller
  of `SplashScreen.hideAsync()`, so `_layout.tsx` keeps its shape and its comment stays true.
- `src/components/app-tabs.tsx` — the one `require` of the renamed tab icon.
- `assets/images/` — nine files deleted, one blank splash image added, three renamed.
- No dependency, no native module, no permission, no migration, no domain or storage code.
