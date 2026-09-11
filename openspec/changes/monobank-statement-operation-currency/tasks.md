## 1. The failing test first

- [x] 1.1 In `src/monobank/api.test.ts`, add the regression the owner's card sent: a statement
      parsed for a UAH рахунок holding two well-formed rows naming UAH and one well-formed row
      naming USD (spec scenario «A row naming another currency does not fail the window»). Assert
      `fetchStatement` answers `ok` with all three items, each amount in minor units UAH. Verify it
      **fails** on the current tree with `npx vitest run src/monobank/api.test.ts` — the failure is
      `unavailable` with reason `currency-mismatch`, which is the defect reproduced.
- [x] 1.2 In the same file, add the two remaining readability regressions: a row naming a currency
      outside `CURRENCY_BY_NUMERIC` altogether (spec scenario «A row naming a currency the app does
      not offer still parses») and a row carrying no currency field or a non-numeric one (spec
      scenario «A row naming no currency at all still parses»). Assert each item parses with its
      amount in minor units UAH. Verify both fail the same way on the current tree.
- [x] 1.3 In the same file, add the symmetric case (spec scenario «A hryvnia row on a
      foreign-currency рахунок parses»): a statement parsed for a USD рахунок holding a row naming
      UAH parses with its amount in minor units USD. This is the latent wedge under the owner's
      `black ··7583` and `black ··4969`; verify it fails on the current tree too.

## 2. The parser stops reading a row's currency as the рахунок's

- [x] 2.1 In `src/monobank/api.ts`, delete `readItem`'s `currencyCode` comparison and the
      `MISMATCHED_CURRENCY` result it returns (design D1). `amount` keeps being read as
      `money(amount, ctx.currency)`; the `id`, `time`, `mcc`, `amount`, `description` and `hold`
      checks are untouched. Verify with `npx vitest run src/monobank/api.test.ts` — 1.1–1.3 now
      pass. Exactly four pre-existing tests fail, and each is a test of a scenario an approved
      delta removes or rewords: `api.test.ts:238` (task 2.3), `:251` (task 2.5), `:329` (task 2.4)
      and `:361` (task 2.6). No other test may be touched to get green (hard rule 6).
- [x] 2.2 In `src/monobank/api.ts`, drop `currency-mismatch` from `UnavailableReason` and rewrite
      the type's doc comment, which currently calls it "the one cause worth its own word"
      (design D2). `Outcome`'s shape, `unparseable-body` and `unreadable-payload` stay as they are.
      Verify with `npm run typecheck` — every consumer of the union still compiles.
- [x] 2.3 Delete `src/monobank/api.test.ts`'s `it("Scenario: A row of another currency is not this
      рахунок's statement")` (around line 238). It is the parse-level test of the scenario the
      `monobank-sync` delta removes, so it goes with the scenario and is not rewritten into
      something else — the behaviour it asserted is now asserted in reverse by 1.1. This is a
      scenario removed by an approved spec delta, not a failing test being made to pass
      (hard rule 6). Verify with `npx vitest run src/monobank/api.test.ts`.
- [x] 2.4 Delete `src/monobank/api.test.ts`'s `it("Scenario: A рахунок whose currency does not
      match the row's is unavailable with a reason")` (around line 329) — title and body both assert
      the removed scenario at the outcome level, so like 2.3 it goes with the scenario rather than
      being rewritten. Also drop the "not a currency mismatch" clause from the comment just above it
      (around line 325). Verify with `npx vitest run src/monobank/api.test.ts`.
- [x] 2.5 In `src/monobank/api.test.ts`'s «Scenario: One unreadable row fails the whole answer»
      (around line 251), drop the `{ ...ITEM, currencyCode: undefined }` fixture from the loop of
      broken rows (around line 261) — that row is now well-formed, and the `monobank-sync` delta's
      added scenario «A row naming no currency at all still parses» says so in as many words. The
      scenario stays and its five remaining fixtures still prove it; this is a fixture removed by an
      approved delta, not a failing assertion being made to pass (hard rule 6). Verify with
      `npx vitest run src/monobank/api.test.ts`.
- [x] 2.6 Rewrite `src/monobank/api.test.ts`'s `['unreadable-payload', 'currency-mismatch']`
      assertion (around line 361) whose fixtures `{currencyCode: undefined}`, `{currencyCode: 840}`
      and `{currencyCode: 985}` now all parse: the three move to the readable side, and the test's
      title naming "three reasons" becomes two. Verify with `npx vitest run src/monobank/api.test.ts`.
- [x] 2.7 Replace `src/monobank/coordinator.test.ts`'s `it("Scenario: A statement row whose currency
      does not match the рахунок's is unavailable with a reason")` (around line 776) with the
      run-level regression for the ADDED scenario «A row naming another currency does not fail the
      window». The old test feeds one well-formed `currencyCode: 840` row, so after 2.1 its outcome,
      reason and stored-транзакції assertions all become the opposite — which is exactly what the
      new one asserts: the run ends `complete` with no reason, both витрати stored in the рахунок's
      currency, and the cursor advanced. Inverting rather than only deleting is what keeps the
      defect's real cost — a рахунок frozen for ever — under a test. Its sibling just below still
      covers a genuinely unreadable row. Verify with `npx vitest run src/monobank/coordinator.test.ts`.
- [x] 2.8 Update `src/reporting/report.test.ts`'s журнал fixture (around line 490), which only
      carries the retired word as a string, to a reason that still exists. Verify with
      `npx vitest run src/reporting/report.test.ts`.
- [x] 2.9 Remove the test in `src/ui/monobank-sync.test.ts` (around line 646) that backs the
      retired `bug-report` scenario «A недоступно рахунок names a currency that does not match its
      own» — it is that scenario's test by name, and the scenario is gone from the spec, so it goes
      with it. The tests backing the two surviving reasons stay. Verify with
      `npx vitest run src/ui/monobank-sync.test.ts`.

## 3. The comments and the changed scenarios stop asserting the false premise

- [x] 3.1 In `src/monobank/api.ts`, rewrite the module comment, `readItem`'s comment and
      `parseStatement`'s doc comment where they say a statement "names no currency for
      `operationAmount` at all" and that a row's `currencyCode` is "the *account's* currency, not
      the operation's" (design D3). The corrected text says what the field is and rests the
      unchanged decision — no original-currency amount — on what is genuinely missing: the sync
      does not read the bank's own сума, and no screen shows one. Two further comments in the same
      file repeat the retired rule and must go with them: `readItem`'s "it is not a currency
      mismatch, so it takes the generic reason and not the specific one" (around line 306) and
      `parseStatement`'s "rows of this рахунок's currency" (around line 376). Verify with
      `grep -ni "operationAmount\|currencyCode\|mismatch\|рахунок's currency" src/monobank/api.ts`
      — every hit outside `parseCard` and `parseJar` states the new reading. Those two read a
      **client-info** row, where `currencyCode` really is the рахунок's currency; they are not
      touched by this change.
- [x] 3.2 Do the same in `src/monobank/coordinator.ts` (around line 76), where `RunAccount`'s doc
      comment calls its currency "the currency every транзакція of its statement is in" — the other
      half of the same retired premise, and the one a future agent would read as grounds for putting
      the check back. Nothing else in the file changes. Verify with
      `grep -n "every транзакція of its statement" src/monobank/coordinator.ts` returning nothing.
- [x] 3.3 Do the same in `src/monobank/sync.ts` (around line 302, "a monobank statement never names
      the currency of a foreign purchase's own amount, so there is none to carry"). The `expense`
      it builds is unchanged — it still carries no `originalAmount`; only the reason is corrected.
      Verify with `grep -n "never names the currency" src/monobank/sync.ts` returning nothing.
- [x] 3.4 Update the two tests of the scenarios whose THEN this change rewords:
      `src/monobank/api.test.ts`'s «A foreign purchase is the сума the bank charged, and nothing
      more» (around line 228) must set the row's `currencyCode` to USD to match the spec's new WHEN,
      still assert the amount is 420000 minor units UAH and still assert no `originalAmount`; and
      `src/monobank/sync.test.ts`'s «A foreign purchase is a витрата of what the bank charged»
      (around line 239) keeps its assertions and loses the comment claiming the statement names no
      currency. Both tests' comments are the false premise in full ("the currency it is denominated
      in is not, anywhere", api.test.ts:229) and are rewritten, not just the code around them.
      Verify with `npx vitest run src/monobank/api.test.ts src/monobank/sync.test.ts`.
- [x] 3.5 Prove the `transactions` delta's added scenario «A purchase imported from a monobank
      statement keeps none yet» with a test whose name contains that title (`.claude/rules/testing.md`
      — every delta scenario needs one). It belongs in `src/monobank/api.test.ts`, because only a
      statement **row** names a currency: `mapStatement` is handed `StatementItem`s, which have no
      currency field at all, so `sync.test.ts` cannot exercise the WHEN. The test asserts a row
      carrying both `operationAmount` and a `currencyCode` naming USD parses to an item of 420000
      minor units UAH with no original-currency amount. Verify with
      `npx vitest run src/monobank/api.test.ts`.
- [x] 3.6 Rewrite the comment on `src/domain/transaction.test.ts`'s «A purchase whose original
      currency the source does not name» (around line 164), which says "A monobank statement names
      the merchant's сума but never the currency it is in" — the sentence the `transactions` delta
      now contradicts. The scenario is about any source that names no currency, so the replacement
      is source-neutral and names no bank. The test's assertions are unchanged. Verify with
      `npx vitest run src/domain/transaction.test.ts` and
      `grep -n "monobank" src/domain/transaction.test.ts` returning nothing.
- [x] 3.7 Land `scripts/mono-statement-probe.ts` — the owner-run diagnostic written during this
      change, which produced the evidence the whole thing rests on. It was drafted against the old
      rule, so it must not ship naming «currency-mismatch» or calling another currency a mismatch.
      The currency histogram stays — it is what found the defect — but as information about which
      currencies the bank carried транзакції out in, never as a verdict: the verdict comes from
      `parseStatement` and `statementUnavailableReason` themselves, so the script can never disagree
      with the app, and its per-field list is labelled a hint. `CURRENCY_BY_NUMERIC` is exported from
      `api.ts` rather than hand-copied, for the same reason. Verify by running `npm run typecheck`
      and reading the file: no line names a reason the app no longer has.
- [x] 3.8 Add the follow-up to `BACKLOG.md`: the currency of the bank's own сума is readable after
      all, and `Expense.originalAmount` with its columns already exists, so an original-currency
      amount «kept for information» (vision §5, glossary) needs only that `mapStatement` read it and
      that a screen show it — deliberately not in this change. The entry must carry the other half
      of archived D12's reasoning, which still stands: `CURRENCY_BY_NUMERIC` holds only the
      currencies a рахунок may be opened in, and a code outside it needs its minor-digit exponent
      (JPY has none, TND has three) before its сума can be printed at all. Verify the entry exists,
      names this change as where the fact came from, and carries that caveat.

## 4. The gate

- [x] 4.1 Run `npm run verify` and paste the final lines
- [ ] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
