## 1. The reason, in `api.ts` (pure)

- [x] 1.1 In `src/monobank/api.ts`, export `UnavailableReason = 'unparseable-body' |
      'unreadable-payload' | 'currency-mismatch'` and give `Outcome<T>`'s `unavailable` variant an
      optional `reason?: UnavailableReason`. Give `ask()` an optional fifth parameter `classify?:
      (payload: unknown) => UnavailableReason`, called only when `response.json()` succeeded but
      `parse` rejected the payload (threw or returned `undefined`); when absent, default to
      `'unreadable-payload'`. `response.json()` itself throwing answers `{ kind: 'unavailable',
      reason: 'unparseable-body' }` directly, without calling `classify`. The three existing
      failure branches — fetch rejects, 401/403/429, any other non-ok status — are unchanged and
      carry no `reason` (design.md: already legible on the request's own `network` journal entry).
      Failing tests first in `src/monobank/api.test.ts`: extend "A network failure is unavailable"
      and "A 500, an unparseable body and an alien payload are all unavailable" to assert `reason`
      is `undefined` on the network/status cases, `'unparseable-body'` when `response.json()`
      throws, and — since `fetchClientInfo` passes no `classify` — `reason: 'unreadable-payload'`
      on that same test's "alien payload" (`{ nothing: true }`) case, which today only asserts
      `kind: 'unavailable'` and must not be left unassert on `reason`. Verify:
      `npx vitest run src/monobank/api.test.ts`.
- [x] 1.2 In the same file, refactor `parseItem` to route through a new private `readItem(row,
      ctx): { ok: true; value: StatementItem } | { ok: false; reason: UnavailableReason }` —
      `'currency-mismatch'` for the `currencyCode` check design D12 already documents,
      `'unreadable-payload'` for every other unreadable row, a row that is not a record, or
      `ctx.dateOf(time)` throwing (wrapped in its own try/catch inside `readItem` — design.md's
      "`readItem` catches a throwing converter" decision; this is what keeps `readItem`, and
      therefore `statementUnavailableReason`, total). `parseItem` becomes a two-line wrapper over
      `readItem` that discards the reason on failure — `parseStatement`'s own external behavior
      (which rows import, to what `StatementItem`, and that a bad row still fails the whole
      payload) MUST be unchanged, so every existing `parseStatement` assertion in `api.test.ts`
      passes with no edits to those test bodies; the one exception is "A converter that throws is
      unavailable, not a crash", which asserted `fetchStatement`'s *outcome* rather than
      `parseItem`'s mechanism and must now also assert `reason: 'unreadable-payload'` on that
      outcome (still `kind: 'unavailable'`, still resolved rather than a rejected promise). Add
      `statementUnavailableReason(payload, ctx): UnavailableReason` that answers
      `'unreadable-payload'` when `payload` is not an array, else walks it with the same
      `readItem` and answers the first row's reason (unreachable fallback: `'unreadable-payload'`
      if every row happens to read — `parseStatement` would have returned a value in that case).
      Wire it as `fetchStatement`'s `classify`. Failing tests first in `api.test.ts`: the updated
      "A converter that throws" case above; a scenario where a statement payload's row has a
      `currencyCode` not matching the account's currency answers `reason: 'currency-mismatch'`; a
      scenario where a row is missing a required field answers `reason: 'unreadable-payload'`; a
      scenario where the payload is not an array at all answers `reason: 'unreadable-payload'`;
      and a property/table-style check that for every existing "unreadable payload" fixture in
      this file (including one whose `dateOf` throws), `statementUnavailableReason` never throws
      and always answers one of the three `UnavailableReason` values. Verify: `npx vitest run
      src/monobank/api.test.ts`.

## 2. Threading the reason through the coordinator

- [x] 2.1 In `src/monobank/coordinator.ts`, add `reason?: UnavailableReason` (imported from
      `./api`) to `AccountResult`. Add a small `reasonOf(answer: Outcome<unknown>):
      UnavailableReason | undefined` beside `outcomeOf`, answering `answer.reason` when `answer.kind
      === 'unavailable'` and `undefined` otherwise. Give `finish()` an optional trailing `reason?:
      UnavailableReason` parameter, included on the `AccountResult` it builds. Wire it at both
      places `outcomeOf(...)` is read: the bulk client-info-failure loop (`for (const link of
      links) finish(link, outcome, 0)`, now also passing `reasonOf(info)`) and
      `syncOneAccount`'s statement-failure return (`return { outcome: outcomeOf(answer), imported
      }`, now also carrying `reason: reasonOf(answer)`, threaded through `syncOneAccount`'s return
      type and into its call site's `finish(link, account.outcome, account.imported, runToMs,
      account.reason)`). The two coordinator-native `unavailable`s that are not an `api.ts` parse
      failure — the account missing from the token's fetched map (`finish(link, 'unavailable',
      0)`), and the storage-write catch inside `syncOneAccount` (`return { outcome: 'unavailable',
      imported }`) — get no `reason` (design.md Non-Goals); leave them exactly as they are.
      Failing tests first in `src/monobank/coordinator.test.ts`: a statement request whose payload
      fails with a classifiable reason produces an `AccountResult` carrying it; a рахунок missing
      from the token's accounts still answers `unavailable` with `reason: undefined`; a
      client-info request that itself answers `unavailable` produces every linked рахунок's
      `AccountResult` carrying the same `reason` (design.md's accepted Non-Goal: one word repeated
      per link, not per-link classification — this test is what confirms it merely repeats rather
      than crashing or diverging); and the token appears nowhere in any `AccountResult` this test
      produces (grep the serialized results for the fixture token, matching the existing design-D3
      style of proof in this file). Verify: `npx vitest run src/monobank/coordinator.test.ts`.

## 3. Journaling it

- [x] 3.1 In `src/ui/monobank-sync.ts`'s `journalProgress`, in the `'finished-account'` case,
      after writing the existing outcome entry, write one more `journal.record('step',
      accountStepName(progress.result.monobankAccountId), progress.result.reason, { run })` when
      `progress.result.reason !== undefined`. Failing tests first in
      `src/ui/monobank-sync.test.ts` for `bug-report`'s new scenarios: «A недоступно рахунок names
      a currency that does not match its own», «A недоступно рахунок names a body it could not
      read at all» and «A недоступно рахунок names a body of the wrong shape» — one case each, a
      finished-account progress event carrying the respective `reason` writes a second entry, same
      `accountStepName`, same `run`, `detail` equal to that reason — plus «A недоступно рахунок
      with no answer to read names no reason» (a finished-account event with no `reason` writes
      only the one outcome entry it writes today — assert the journal's entry count for that
      account's turn is unchanged from before this task). Verify: `npx vitest run
      src/ui/monobank-sync.test.ts`.
- [x] 3.2 Confirm, without changing it, that `src/reporting/journal.ts`'s `entryLine` and
      `src/reporting/report.ts`'s rendering need no edit: add one scenario to
      `src/reporting/report.test.ts` (or extend an existing sync-timeline test) building a журнал
      that includes a reason entry as task 3.1 writes it, and asserting the rendered репорт text
      contains that entry's line immediately after the outcome line it belongs to. Verify: `npx
      vitest run src/reporting/report.test.ts`.

## 4. The gate

- [x] 4.1 Run `npm run verify` and paste the final lines.

      ```
       Test Files  164 passed (164)
            Tests  3292 passed (3292)
      ✔ verify passed (88a0ace3c66fea9245b0c5f66eaa4b0d976edf32)
      ```
- [x] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS.

      **PASS on the first pass.** 0 critical, 0 warning. Confirmed `readItem`'s totality holds
      beyond `ctx.dateOf` too (`money()`'s inputs are always pre-validated), that
      `parseItem`/`parseStatement`'s externally observable behavior is unchanged except the one
      fixture design.md calls out, and that the token cannot leak through `Outcome`,
      `AccountResult`, or any journal entry this change adds.

## 5. Smoke

- [x] 5.1 Run the `smoke-runner` subagent on the emulator: `scripts/android.sh up`, confirm the
      monobank screen still renders and «Синхронізувати» without a token still answers
      `not-configured` exactly as before — a plain regression check, since reproducing the
      `currency-mismatch`/`unparseable-body` reasons themselves needs the real bank answering the
      real рахунок's next turn on the owner's own phone, which the emulator cannot fabricate any
      more than `monobank-sync-cadence`'s own §9.2 could. Fix what it finds; record what was seen.

      **PASS, 2026-09-10** — Pixel_10_Pro / emulator-5554. The monobank screen opened with «ТОКЕН
      ЩЕ НЕ ВВЕДЕНО»/«Поки нічого не отримано»; «Синхронізувати» flipped it to «Спершу введіть
      токен monobank» with «Ввести токен» — the exact `not-configured` path, unreached by this
      change's new reason-classification code. `scripts/android.sh logs 300` showed no crash, no
      unhandled rejection, nothing journal-related. No defects found; one out-of-scope dev-only
      `GO_BACK` warning noted and not acted on (an artifact of the smoke's own navigation, not of
      this change).
