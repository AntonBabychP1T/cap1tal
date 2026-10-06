# first-run-exit — tasks

> Ported on 2026-10-06 from `claude/distracted-banach-8b67f6` (9375826). The behaviour had
> already reached main under other names: the rule is `leaveOnboarding({ canGoBack })` →
> `'back' | 'to-app'` (the branch's `setupExit` → `'pop' | 'to-app'`), and main also answers the
> phone's back press on the launch-opened checklist with `useCloseOnBack(!router.canGoBack(),
> toApp)`, which the branch had left as a non-goal. The names below follow main.

## 1. The rule

- [x] 1.1 Add `leaveOnboarding(input: { canGoBack: boolean }): 'back' | 'to-app'` to `src/ui/onboarding.ts` — `'back'` when
      there is a view underneath, `'to-app'` when there is not (D1, D2) — with the comment saying
      why the question is asked of the navigator and not of a remembered flag. Verify with
      `src/ui/onboarding.test.ts` covering requirement "The way back off the setup view always
      leads somewhere" scenarios "The setup view opened from Налаштування returns to
      Налаштування" (back) and "The setup view the launch opened leads on to Головний" and "The way
      back still leads on after a step has been done from it" (both `to-app`, one function, two
      stack shapes that answer the same). Write the test first and watch it fail — the function
      does not exist yet.

## 2. The screen asks it

- [x] 2.1 Wire `src/app/onboarding.tsx`: one `leave` handler that asks
      `leaveOnboarding({ canGoBack: router.canGoBack() })` and performs the answer — `router.back()` or
      `router.replace('/')` — and give it to `ScreenHeader`'s `back` in place of
      `() => router.back()`. «До застосунку» is untouched (D3).
- [x] 2.2 Hold the wiring in `src/ui/onboarding-screen.test.ts` — requirement "The way back off
      the setup view always leads somewhere", scenario "The way back is never a control that does
      nothing": the screen must import and call `leaveOnboarding`, the heading's `back` must be that
      handler, and `back={() => router.back()}` must not appear. Extend the existing file's
      allowed-calls assertion for `router.canGoBack` only if it trips.

## 3. The gate

- [x] 3.1 Run `npm run verify` and paste the final lines

      ```
      ▶ npm run -s test
       Test Files  89 passed (89)
            Tests  1484 passed (1484)
      ✔ verify passed (56ba353e42d4f7ad1900f4e03d70a0b4c6f93e74)
      ```
- [x] 3.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      Reviewed inline rather than by subagent (the session forbids dispatching agents). One
      finding, fixed: `onboarding-screen.test.ts` asserted `router.replace('/')` against the whole
      file, where «До застосунку» already contains it — so the assertion would have passed on a
      screen whose «←» still did nothing. It now slices out the `leave` handler and asserts
      against that; mutating the handler back to a bare `router.back()` fails the test.

## 4. On the device

- [x] 4.1 Smoke on the emulator (`scripts/android.sh reset` → `up` → `shot`/`tap`), all four
      scenarios of the requirement, screenshots in `.cache/android/`:
      - `01-first-run` → `02-after-back`: launch on an empty device lands on «Перші кроки»
        («Готово 0/4»); «←» shows Головний with the tab bar, and the setup view does not re-open.
      - `03-settings` → `04-pop-to-settings`: opened from Налаштування, «←» returns to
        Налаштування — the pushed case still pops.
      - `05-saldo` → `06-back-on-setup` → `07-after-saldo-back`: launch on an empty device, open
        «Імпорт Saldo» from the checklist, «←» back onto the checklist, «←» again → Головний.
        This is the stack shape the report got stuck in.
      - `logcat`: zero `The action 'GO_BACK' was not handled by any navigator` in the run window;
        the one in the buffer is from the pre-fix build 48 minutes earlier.
