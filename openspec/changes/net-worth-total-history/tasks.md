## 1. Shared conversion

- [x] 1.1 Enabling refactor (design D1, no behaviour change): extract `convertTotalsToUah` from `approximateNetWorthUah` in `src/ui/net-worth.ts`; the existing `approximateNetWorthUah` tests in `src/ui/net-worth.test.ts` (full approximation, missing EUR incl. zero total, stale cached rates, UAH-only/overflow) pass unmodified

## 2. Combined history model

- [x] 2.1 Add the combined series builder (every held currency known, rate required even for a zero balance, overflow gap, leading-gap trim) and prove scenarios "Each date converts at the one current rate", "Changing today's rate revalues every point together", "An unknown currency makes the point a gap, not a partial sum", "Leading gaps do not become empty chart" and "Overflow is a gap that says so", "Stale cached rates stay marked and nothing is requested" in `src/ui/net-worth.test.ts`
- [x] 2.2 Withhold the combined history with the missing-rate message and prove "A missing rate withholds the whole history" and "A currency held only in an archived рахунок still needs its rate" (net-worth) and "A withheld combined history says why" (main-screen) in `src/ui/net-worth.test.ts`
- [x] 2.3 Generalize `historyPointRows` to a per-point value-or-reason reader with «≈» amounts for the combined view; the per-currency point-row tests stay green unmodified and a new test proves the combined rows fold same-reason gaps
- [x] 2.4 Add the combined change line through `netWorthChange` (any-currency valuation substitution, any future-dated account, «≈» amount) and prove "Positive comparable baseline" and "Zero or negative baseline has no percentage", "A substituted valuation withholds the change", "A future-dated record withholds the change" and "A missing baseline withholds the change" in `src/ui/net-worth.test.ts`
- [x] 2.5 Put the chip label, its accessibility label, the caption and the withheld message on the model (design D6) and prove in `src/ui/net-worth.test.ts` "The combined choice is announced to TalkBack" (labels and «≈» point rows), "The point list folds runs of the same reason only", and that the exact per-currency headline and currency choices are unchanged
- [x] 2.6 Replace `requestedHistoryCurrency` by `requestedHistory` with `TOTAL_HISTORY`; expose `historyChoices` / `historyTotalSelected`; prove "The combined choice is offered only when it adds something", "The combined choice is never the default and does not outlive its currencies", "History currency has a deterministic default" and that "Today's valuation never changes past points" still holds for the per-currency series, in `src/ui/net-worth.test.ts`

## 3. Glossary and screen

- [x] 3.0 Amend `docs/glossary.md` (already amended in the working tree — re-verified, not redone) «Історія статку», «Зміна статку» and «Приблизний статок» to name the «Усе ≈ грн» reading and its current-rate exception, and verify `npm run verify` still passes

- [ ] 3.1 Draw the model's chip, labels, caption and message in `src/components/net-worth-widget.tsx`, and wire the state in `src/app/(tabs)/index.tsx`; verify with `npm run typecheck` and the "The owner reads the whole статок in time" scenario in the emulator smoke test (`scripts/android.sh`, `.claude/rules/android.md`)

## 4. Close

- [ ] 4.0 After 4.2 and the commit, record in the change, before archive, whether the `smoke-runner` pass on the emulator ran or was not run and why (CLAUDE.md order: diff-reviewer PASS → commit → smoke-runner → archive)

- [x] 4.1 Run `npm run verify` and paste the final lines
- [x] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
