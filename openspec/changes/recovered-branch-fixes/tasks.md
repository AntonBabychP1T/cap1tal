## 1. Proposals only from this opening's answer (monobank-sync-screen, design D8)

- [x] 1.1 Add `proposalsForReview({ fetched, accounts, links })` to `src/ui/monobank-screen.ts`: `[]` while `fetched` is `undefined`, otherwise `proposalRows` over `suggestLinks` of `fetched`. Prove "Scenario: No successful answer this opening proposes nothing" in `src/ui/monobank-screen.test.ts` (no fetch → `[]`; with the same account fetched → one proposal for «Monobank Black»). Evidence: `npx vitest run src/ui/monobank-screen.test.ts` — 79 passed.
- [x] 1.2 Wire `src/app/manage/monobank.tsx` to `proposalsForReview` over `fetched` (not `shown`); drop its direct `suggestLinks`/`proposalRows` use. Evidence: `grep -n "suggestLinks\|proposalRows" src/app/manage/monobank.tsx` — no matches; typecheck green in `npm run verify`.

## 2. The arrival's опис for a blank departure (saldo-import, design D9)

- [x] 2.1 Failing test first: "Scenario: A blank departure takes its arrival’s опис" in `src/saldo/interpret.test.ts` (blank departure with a fee, arrival « Зарахування ») — red before the fix (`AssertionError: expected [ { type: 'transfer', …(6) }, …(1) ] to match object …`).
- [x] 2.2 In `src/saldo/interpret.ts`, resolve the pair's опис once as `{ ...описOf(arrival), ...описOf(departure) }` and spread it onto both the переказ and its «Комісія». Evidence: `npx vitest run src/saldo/interpret.test.ts` — 45 passed.

## 3. Gate

- [x] 3.1 `npm run verify` green on the tree that is committed (quoted in the commit message).
- [x] 3.2 Emulator smoke: NOT RUN in this lane (recovered-branch port, no emulator); the monobank screen change is to be smoke-tested with the next wave that touches «monobank».
