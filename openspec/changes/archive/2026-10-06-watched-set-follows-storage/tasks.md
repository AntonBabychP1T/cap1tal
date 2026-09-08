# watched-set-follows-storage — tasks

## 1. The reconciliation

- [x] 1.1 Write the failing tests first in `src/ui/notification-drain.test.ts`, against
      `inMemoryNotificationCapture`'s `setWatchedCalls()` and `watched()`, covering the four
      `bank-notifications-screen` scenarios that can fail before the fix: "A collection after a
      відновлення reads the restored watches" — the rows written by `replaceAll`, the real restore
      path, inside its own transaction and with the device never told, and `setWatchedCalls()`
      holding exactly those packages after the drain; "A collection tells the capture layer the stored watches" — two watches, and
      the one call holds exactly those two packages, made before anything was collected; "No
      watches tells the capture layer to watch nothing" — no watch rows and an empty queue, and the
      empty set is told all the same, which is what proves the reconciliation runs before the
      early return for an empty collection; "A stored monobank watch does not disable the others" —
      a row naming `com.ftband.mono…` beside `ua.privatbank.ap24`, and the set told holds the
      Приват package and not the monobank one, so `setWatchedCalls()` is not empty (the whole-set
      refusal is what this scenario exists to rule out). All four must fail before task 1.4.
- [x] 1.2 Two more failing tests in the same file, for what `setWatchedCalls()` alone cannot see.
      "Watches changed between two collections are told again" — drain, add a watch row straight to
      storage, drain again, and assert two calls with the second holding the new package, which is
      what rules out a "already told this session" memo. And the ordering the requirement's "SHALL
      first tell … SHALL then collect" states: wrap the capture port in a decorator that appends
      each method name to one array — the same shape the storage-failure test already uses for
      `DrainStorage` — and assert `setWatched` is logged before `collect`. Both must fail before
      task 1.4.
- [x] 1.3 Add the last scenario, "A build that cannot capture still collects", over the
      combination a device actually reaches — the native write threw while the queue and the
      collection are fine — rather than a wholly `unavailable` double, where `collect` answers
      nothing waiting too and a drain that aborted on a non-`ok` outcome would report the very same
      zero. Assert the happy path's own report, `{ collected: 1, acknowledged: 1, drafted: 1 }`
      with the чернетка stored, and confirm by mutation that an early return on non-`ok` fails it.
- [x] 1.4 In `src/ui/notification-drain.ts`, move the `input.storage.watches()` read to the top of
      `drainCaptures`, and before `collect` and before the empty-collection early return tell
      `input.capture.setWatched` those packages with the monobank family filtered out via
      `monobankPackagesIn` from `src/platform/notification-capture.ts` — ignoring the outcome, with
      the reason at the call site (design: "The monobank family is filtered out of what is told"
      and "`refused` and `unavailable` change nothing and stop nothing"). Run
      `npx vitest run src/ui/notification-drain.test.ts src/ui/notification-settings.test.ts` — the
      seven new scenarios pass and every existing one still does, the settings screen's own
      `setWatched` refusal and unavailability paths included.

## 2. The gate

- [x] 2.1 Run `npm run verify` and paste the final lines.

      ```
       Test Files  160 passed (160)
            Tests  3106 passed (3106)
         Duration  4.49s

      ✔ verify passed (739c9732d0ac2b46d2ffc4520cf56591e521de36)
      ```

      Ported onto integrate/2026-10-06 (lane/port-small, 2026-10-06): the drain had since gained
      the журнал step, so the reconciliation now opens `drained()`, inside the step, ahead of
      `collect` and the empty-collection early return. On that tree, before these notes:

      ```
         Duration  13.68s

      ✔ verify passed (3954157ddc18cd98143a48062910049faec932c9)
      ```

      The hash names the tree as it stood when that run finished — `openspec/` is itself in the
      fingerprint's watched set, so writing these lines into this file moves it. The source under
      review is exactly what the run covered; re-run `npm run verify` for the stamp of the tree
      that carries this note.
- [ ] 2.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS. Not run in the
      port lane (no subagent available there); left to the review of lane/port-small.
- [x] 2.3 Emulator smoke: not run. No screen changed; what a device would show after a
      відновлення is the absence of a drop, which the drain tests cover against `replaceAll`.
