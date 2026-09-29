## 1. Parser dates by the phone's calendar

- [x] 1.1 Add a Europe/Kyiv `dateOf` fixture to `src/saldo/test-fixtures.ts`; in `src/saldo/parse.test.ts` write failing tests for "A late-evening UTC time is the next day in Kyiv" and "A date-only Saldo entry keeps the day the owner chose, summer and winter", and update "The datetime becomes a calendar date"; verify they fail with `npx vitest run src/saldo/parse.test.ts`
- [x] 1.2 Make `parseSaldoExport(text, dateOf)` date each leg by `dateOf(Date.UTC(...))` of its Transaction Date, keeping the calendar check and the UTC `datetime`; update every caller in `src/saldo/` tests and fixtures; verify `npx vitest run src/saldo` passes

## 2. Accrual divergence against the export's date

- [x] 2.1 In `src/saldo/interpret.test.ts` write a failing test for "A month-end evening entry is not a divergence"; compare Accrual Month with the leg's export `datetime` month in `src/saldo/interpret.ts`; make the divergence detail quote the export's own Transaction Date; verify `npx vitest run src/saldo/interpret.test.ts` passes, including "An accrual-month divergence is noted, not obeyed"

## 3. Wiring

- [x] 3.1 Thread `dateOf` through `startWithText` in `src/ui/saldo-import.ts` and its tests, and pass `dateOfEpochMs` from `src/app/manage/saldo-import.tsx` and `scripts/saldo-dry-run.ts`; "The same inputs replay into the same plan" is proved by the existing `src/saldo/interpret.test.ts` test, whose fixtures now pin one zone; verify `npx vitest run src/ui/saldo-import.test.ts` and `npm run typecheck`

## 4. Close

- [x] 4.1 Run `npm run verify` and paste the final lines
- [x] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
