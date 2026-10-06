## 0. Order

- [x] 0.1 Before `/opsx:archive`, confirm `qa-sweep-2026-10` is archived first: this change is
  branched from it and its code uses the `monthInYearLabel` port that change adds.
  Confirmed 2026-10-06: archived as `archive/2026-10-06-qa-sweep-2026-10`.

## 1. The ліміт виклик in its case

- [x] 1.1 Failing tests first in `src/progress/challenges.test.ts`, with the real month labels:
  "Scenario: The ліміт виклик names the місяць that went over in its case" (reason begins «У липні
  2026 ліміт «Продукти» перевищено востаннє», no «у Липень»), "Scenario: A місяць that opens its
  sentence keeps its capital" («Вересень 2026 закрито»), and "Scenario: No виклик puts a
  heading's місяць inside a sentence" (design M2). Run them; the first and third must fail.
- [x] 1.2 Rewrite `limitHold`'s reason in `src/progress/challenges.ts` per design M1, with
  `monthInYearLabel` and `sentenceStart`; the three tests of 1.1 pass.
- [x] 1.3 Check `docs/app-overview.md` and `docs/` for the old ліміт reason text and update any
  quote of it.
- [x] 1.4 Rename «Закрий 2026-08» / «Закрий 2026-07» in the two other scenarios of the `challenges`
  spec that quote a виклик's name (MODIFIED blocks in this change's delta).

## 2. Gate

- [x] 2.1 Run `npm run verify` and paste the final lines
- [x] 2.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

## 3. Emulator

Not run: the change is a domain sentence covered by `challenges.test.ts`; archived on the owner's
request (2026-10-06) with the smoke explicitly recorded as not run.
