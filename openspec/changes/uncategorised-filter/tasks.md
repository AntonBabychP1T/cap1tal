## 1. Storage: one predicate for «without a категорія»

- [x] 1.1 Failing test first in `src/db/transactions-repo.test.ts`: store a витрата in «Без
      категорії», a витрата in «Продукти», a дохід in «Без джерела», a переказ, a повернення in «Без
      категорії» and a повернення in «Продукти»; assert `search({ uncategorised: true, … })` returns
      exactly the two «Без категорії» rows, that `countUncategorised()` is 2 (today 1 — the failing
      half), and that every returned row reads `transactionLine(...).uncategorised` (proves «Only
      the uncategorised витрати are shown», «A повернення in «Без категорії» is a question too»,
      «The list and Головний's count agree», main-screen «A повернення in «Без категорії» is
      counted»). Then add the shared `uncategorised` predicate, use it in `countUncategorised` and
      in `search` (D1); the test passes and the existing count tests stay green.
- [x] 1.2 In the same file prove combination and order: `uncategorised` with `accountId`, with
      `month`, and with a text `match` returns only rows satisfying all, newest first (proves «Без
      категорії» combines with a рахунок and a місяць»). `npx vitest run
      src/db/transactions-repo.test.ts` green.

## 2. Screen logic, pure

- [x] 2.1 Add `uncategorisedFromRoute(asked)` to `src/ui/transaction-search.ts` (D2) with tests in
      `src/ui/transaction-search.test.ts`: «uncategorised» → true; «продукти», «», `undefined` →
      false (proves «Opened narrowed, and widened by hand» on the reading side and «Anything else
      asked for narrows nothing»).
- [x] 2.2 Add `searchLineTitle(line, uncategorisedOnly)` (D4) with tests: narrowing on + опис
      «Uklon» → «Uklon»; narrowing on + no опис → `feedTitle(line)`; narrowing off + опис →
      `feedTitle(line)` (proves «The опис is what the owner reads first» and «A line without an
      опис keeps its usual title»). Add a test that `emptyMessage({ shown: 0, narrowed: true })`
      is the nothing-found sentence, standing for «Nothing left uncategorised says so».

## 3. «Транзакції»

- [x] 3.1 In `src/app/transactions.tsx`: read `only` from the route, seed the narrowing state with
      `uncategorisedFromRoute`, pass `uncategorised` to `transactionsRepo.search`, add the
      «Категорія: Всі / Без категорії» `Choices` (D3), include it in `narrowed` and in
      `clearNarrowing`. Verify with `npm run typecheck` and on the emulator in 5.1.
- [x] 3.2 Render the line title through `searchLineTitle`, dropping the separate опис line when the
      title already is the опис (D4). Verify on the emulator in 5.1.
- [x] 3.3 Add the one-tap categorisation under the mark of every «Без категорії» line (D5): picker
      rows and recents as Головний computes them, `recategorise` + `evaluateProgress` + failure
      alert + reload, `useCloseOnBack` for the full list; no правило offer. Verify `npm run lint`
      and on the emulator in 5.1 («One tap categorises from «Транзакції»», «A categorised line
      leaves the uncategorised list»).

## 4. Головний

- [x] 4.1 Failing test first: in `src/ui/home-screen.test.ts`, change «The counted «Без категорії»
      row leads where those транзакції are marked» to expect the attention block to push
      `{ pathname: '/transactions', params: { only: 'uncategorised' } }`, and add an assertion that
      the latest-transactions section's «Усі ›» still pushes the plain `'/transactions'`; run it and
      see the first fail. Then change the attention row's push in `src/app/(tabs)/index.tsx` (D2);
      the test passes (proves ««Переглянути» opens only what is waiting» and «The feed's way to all
      транзакції is not narrowed» on the wiring side).

## 5. The emulator and the map

- [x] 5.1 Run the `smoke-runner` subagent over this change's scenarios: with several витрати in «Без
      категорії» among categorised ones, follow «Переглянути» from Головний — only the uncategorised
      are listed, the chip reads «Без категорії», titles are описи; pick a категорія on one — it
      leaves the list and Головний's count drops by one; add a рахунок narrowing; «Показати все»
      shows the whole history; «Усі ›» from the feed opens unnarrowed.
      Smoke 2026-09-15 on Pixel_10_Pro API 37: PASS, no defects. Not reachable on that device: the
      повернення scenarios (none created) and a non-matching `?only=` value (no UI path) — both
      proven in `transactions-repo.test.ts` / `transaction-search.test.ts`; the рахунок narrowing
      ran on a one-рахунок device, so it removed nothing. Seen, not specified: the subtitle «Уся
      історія» and footer «Це вся історія.» still read under a narrowing.
- [x] 5.2 Update `docs/app-overview.md` where it describes «Транзакції»: the «Без категорії»
      narrowing and the one-tap categorisation there.
- [ ] 5.3 Archive only after `home-daily-overview` is archived (its «Потребує уваги» requirement is
      what this change's `main-screen` delta refers to); check with `openspec list`.

## 6. The gate

- [x] 6.1 Run `npm run verify` and paste the final lines
- [x] 6.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
