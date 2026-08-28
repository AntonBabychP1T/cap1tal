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
      `Test Files 61 passed (61) / Tests 954 passed (954)`,
      `✔ verify passed (093ac943be2c5dcd176962ae98a919affa8886e8)`
- [ ] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
