# first-run-onboarding — tasks

## 1. The permission port

- [x] 1.1 Add `src/platform/notification-access.ts` — the `NotificationAccess` answer
      (`granted` / `denied` / `unsupported`), the port with `state()` and `openSettings()`, and
      the in-memory double `verify` uses (D3), in the shape `monobank-token.ts` established;
      verify with `src/platform/notification-access.test.ts` that the double answers every state
      and that the module imports nothing from React, Expo or `src/db/**`.
- [x] 1.2 Add the device adapter beside it — `state()` answering `unsupported` because this
      build installs no notification listener, and `openSettings()` opening
      `android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS` through `Linking.sendIntent` —
      with the one comment saying what has to change when the listener lands (D3). Not loaded by
      `verify`; the completion note names the file and its single import.

## 2. The steps

- [x] 2.1 Add `src/ui/onboarding.ts`: `firstRun(...)` — no рахунок and no транзакція (D1) — and
      `onboardingSteps(...)` deriving each step's title, what it is for, its state and its route,
      with a route present only where an action exists (D2); verify with
      `src/ui/onboarding.test.ts` covering requirement "Every setup step names its state and
      leads to the screen that changes it" scenarios "A finished step reads as finished", "An
      outstanding step leads to one screen" and "A step that cannot be acted on offers nothing",
      and requirement "A device with nothing on it opens on the setup view" scenarios "A fresh
      install lands on setup" and "A device in use lands where it always did" expressed through
      `firstRun`.
- [x] 2.2 Cover the notification step's three answers in `onboarding.test.ts` — requirement "The
      notification permission is explained before it is asked for" scenarios "An unsupported
      build says so instead of pointing nowhere", "A grantable permission offers the system
      screen" and "A granted permission reads as done" — including that the unsupported step
      carries no route and that every wording says the reading is local to the device.

## 3. The screen and the way in

- [x] 3.1 Add `src/app/onboarding.tsx` rendering the steps, reading рахунки, транзакції, the
      monobank connection state, the Saldo import marker and the permission port, and register
      the route in `src/app/_layout.tsx` — requirement "Every setup step names its state and
      leads to the screen that changes it".
- [x] 3.2 Redirect Головний to `/onboarding` while `firstRun` holds (D4) — requirement "A device
      with nothing on it opens on the setup view" scenarios "A fresh install lands on setup" and
      "A device in use lands where it always did".
- [x] 3.3 Add «Перші кроки» first in `SETTINGS_SECTIONS`; verify with
      `src/ui/settings-sections.test.ts` covering the modified requirement "The Налаштування tab
      hosts the management sections" scenarios "The tab opens on its sections" and "The
      first-steps section opens the setup view".

## 4. Verification

- [x] 4.1 Run `npm run verify` and paste the final lines —
      `Test Files 62 passed (62) / Tests 942 passed (942)`, `✔ verify passed`. This change's own
      six test files account for 44 of those.
      Neither the fingerprint nor the tree-wide total is pinned here. `openspec/**` is in
      `scripts/fingerprint.sh`'s watch list, so writing a hash into this file is what invalidates
      it; and the total moves whenever a sibling change lands in the same working tree (it read
      961 before `saldo-import-simple-debts` reworked its own tests). The commit hook compares
      the tree to its own last green run, which is the check that matters.
- [x] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS — **PASS**, 0 critical.
      The first pass returned FAIL on two: the `settings-screen` delta collided with
      `limits-goals-reports`'s MODIFIED of the same requirement (now the union, see 4.4), and the
      setup view wired a write-capable monobank connection into a view specified to write nothing
      (now a direct token-store read, guarded by `src/ui/onboarding-screen.test.ts`). Of the four
      warnings on the second pass, three are closed: the duplicated "a kept token means
      configured" rule is now one `tokenKept` predicate in `src/platform/monobank-token.ts` used
      by both the connection and the setup view, the writes-nothing guard asserts on imports
      rather than call-site aliases, and 4.1 no longer quotes a self-invalidating hash. The
      fourth became 4.4. Those three fixes landed after the PASS; `verify` is green on them and
      the smoke of 4.3 was re-run against them.
- [x] 4.3 Smoke the two things `verify` cannot reach, on the emulator after
      `scripts/android.sh reset` (the "no рахунок yet" state) — screenshots in
      `.cache/android/first-run*.png`:
      - the launch lands on «Перші кроки», not on an empty Головний;
      - the four steps render with «Готово 0 з 3», each actionable one with exactly one button,
        and «Читання сповіщень банків» reading «поки недоступно» with **no** button at all;
      - «До застосунку» leaves for Головний and nothing pulls the owner back.

      This smoke caught a bug `verify` could not: the guard test first written as
      `src/app/onboarding.test.ts` was bundled by expo-router's `require.context`, and its
      `node:fs` import broke the bundle on launch — green `verify`, dead app. It now lives at
      `src/ui/onboarding-screen.test.ts`, and `.claude/rules/testing.md` says why.

- [x] 4.4 **Precondition for archiving, not a code task.** Archive this change only *after*
      `limits-goals-reports` is archived. Both changes MODIFY the requirement "The Налаштування
      tab hosts the management sections", and a MODIFIED requirement replaces the whole
      requirement: this change's delta carries the union of both section lists, so archiving it
      first lets that change's seven-section version overwrite it and drop «Перші кроки» from
      `openspec/specs/settings-screen/spec.md` while `src/ui/settings-sections.ts` and its test
      still carry it. Tick this only once `openspec list` no longer shows `limits-goals-reports`.
