# saldo-import — tasks

Every test name quotes its spec scenario (`.claude/rules/testing.md`); all fixtures are
synthetic inline CSV strings — the real export is gitignored and touched only by the dry-run.

## 1. Parsing

- [x] 1.1 Create `src/saldo/parse.ts`: leg and transaction types, RFC-4180 CSV parsing (quoted
      fields holding commas, line breaks and doubled quotes; BOM and CRLF tolerated), header
      validation rejecting with the missing column named. Tests in `src/saldo/parse.test.ts`:
      "Scenario: An alien header rejects the file", "Scenario: A quoted description with commas
      parses whole", "Scenario: A quoted description containing a newline and a doubled quote
      parses whole".
- [x] 1.2 In `parse.ts`, convert amounts to integer minor units from `^\d+\.\d{2}$` text only
      (reject otherwise, naming row and amount), take the calendar date from the datetime, and
      group rows into transactions by Transaction ID. Tests in `parse.test.ts`:
      "Scenario: Two legs sharing an id form one transaction", "Scenario: The datetime becomes
      a calendar date", "Scenario: A malformed amount rejects the file with a reason".

## 2. Survey and decisions

- [x] 2.1 Create `src/saldo/survey.ts`: one entry per real (Saldo account, currency) pair with
      a proposed рахунок (name, currency, вид by account type), zero-only pairs dropped and
      noted for the report. Tests in `src/saldo/survey.test.ts`: "Scenario: An investment
      account proposes вид investment", "Scenario: A zero-only pair creates no entry".
- [x] 2.2 Define the serializable `Decisions` value and account-map resolution: redirects onto
      another entry's рахунок or an existing рахунок, вид overrides, same-currency validation.
      Tests in `survey.test.ts`: "Scenario: Duplicates of one card merge into one рахунок",
      "Scenario: A cross-currency redirect is rejected".
- [x] 2.3 Category and source mapping in `survey.ts`: exact-name match (parent flattened as
      "parent — name"; archived rows match, unarchived preferred), creation proposals with
      redirect decisions, and the four special EXPENSES names ("Fees" → «Комісія»,
      "Uncategorised expense" → «Без категорії», "Balance correction" and «Борг» never
      categories). Tests in `survey.test.ts`: "Scenario: A flattened income child matches the
      starter source", "Scenario: An unknown category is proposed for creation and can be
      redirected", "Scenario: No category «Борг» and no category \"Balance correction\" are
      ever proposed", "Scenario: No джерело \"Balance correction\" is ever proposed",
      "Scenario: \"Uncategorised income\" is proposed as an ordinary джерело",
      "Scenario: The owner sets вид savings on a jar account".

## 3. Interpretation — plain shapes

- [x] 3.1 Create `src/saldo/interpret.ts`: EQUITY-paired legs become початковий залишок
      contributions — summed across merged entries, proposed as a replacement on an existing
      рахунок, never a транзакція. Tests in `src/saldo/interpret.test.ts`: "Scenario: An
      initial balance becomes the opening balance", "Scenario: Merged accounts sum their
      initial balances", "Scenario: Mapping onto an existing рахунок proposes replacing its
      opening balance".
- [x] 3.2 Two real legs become a переказ: credited рахунок → debited рахунок; one amount when
      one currency, left/arrived amounts and no rate when two; a move whose two ends the owner
      merged onto one рахунок becomes no переказ and a dropped row. Tests in `interpret.test.ts`:
      "Scenario: A same-currency move is one переказ", "Scenario: A cross-currency move
      carries two amounts and no rate", "Scenario: A move whose two ends were merged into one
      рахунок is dropped".
- [x] 3.3 EXPENSES debit becomes a витрата on the credited рахунок in the mapped category, a
      differing expense-leg currency kept as the original-currency amount, "Fees" landing in
      the reserved «Комісія» row. Tests in `interpret.test.ts`: "Scenario: A plain expense
      keeps its category and amount", "Scenario: A foreign purchase keeps the original-currency
      amount", "Scenario: Fees map to the reserved row".
- [x] 3.4 EXPENSES credit becomes a повернення in the same category on the debited рахунок,
      never a дохід; a cross-currency повернення keeps only the рахунок-currency amount and the
      dropped amount is counted for the report. Test in `interpret.test.ts`: "Scenario: A
      cancellation is a повернення in its category".
- [x] 3.5 INCOME legs become доходи with mapped джерела; an INCOME debit becomes a negative
      дохід — and a test proves the negative amount flows through the domain's розрахунковий
      баланс and monthly дохід computations unchanged. Tests in `interpret.test.ts`:
      "Scenario: A salary arrival is a дохід with its source", "Scenario: An income debit is a
      negative дохід".
- [x] 3.6 "Balance correction" legs become коригування — negative when money left the рахунок,
      positive when it arrived. Tests in `interpret.test.ts`: "Scenario: A correction expense
      is a negative коригування", "Scenario: A correction income is a positive коригування".

## 4. Interpretation — pairing and борг

- [x] 4.1 MONEY_ON_THE_WAY pairing in `interpret.ts`: bucket departures and arrivals by
      (source, destination, in-transit amount and currency), match nearest datetime first, and
      collapse each pair into one переказ dated the departure. Tests in `interpret.test.ts`:
      "Scenario: A same-currency pair collapses into one переказ", "Scenario: A cross-currency
      pair carries both amounts".
- [x] 4.2 The departure's "Fees" leg yields the extra витрата «Комісія» of the same date, and
      an unpairable MONEY_ON_THE_WAY leg becomes no транзакція and is kept for the report.
      Tests in `interpret.test.ts`: "Scenario: The three-legged fee departure yields переказ
      plus комісія", "Scenario: An unpaired in-transit leg is reported, not imported".
- [x] 4.3 «Борг» legs become перекази with the assigned person's рахунок-борг (lend out,
      repayment back). The assignment is per «Борг» transaction: a description assigns every
      transaction carrying it, a transaction assignment overrides its description's, and
      unassigned transactions collect into the unresolved list and mark the plan incomplete.
      Tests in `interpret.test.ts`: "Scenario: Lending lands on the person's рахунок-борг",
      "Scenario: A repayment is the переказ back", "Scenario: An unassigned description leaves
      the plan incomplete", "Scenario: Two «Борг» transactions with no description go to
      different people", "Scenario: A transaction assignment overrides its description's".
- [x] 4.4 An unrecognised transaction becomes no транзакція and every one of its real legs is
      listed as unexplained with the effect its рахунок therefore misses — interpretation never
      throws. Test in `interpret.test.ts`: "Scenario: An unknown shape becomes a visible
      difference".

## 5. Plan and verification

- [x] 5.1 Plan assembly in `interpret.ts`: транзакції sorted by (datetime, export row
      position), each carrying its stable Saldo key(s); no clock, no randomness, no reliance
      on map iteration order. Tests in `interpret.test.ts`: "Scenario: The same inputs replay into
      the same plan", "Scenario: Same-date transactions keep their intra-day order".
- [x] 5.2 Create `src/saldo/verify.ts`: per-рахунок per-currency Saldo-implied balance vs the
      plan's розрахунковий баланс (including an existing рахунок's stored state, passed in as
      plain values); differences listed with their explaining rows; dropped and unexplained
      rows (unpaired in-transit legs, zero-only pairs, dropped повернення original amounts,
      Accrual Month divergences) listed, plus every рахунок-борг's resulting розрахунковий
      баланс so an over-repaid one is visible. Tests in `src/saldo/verify.test.ts`: "Scenario: A
      fully interpreted рахунок reconciles exactly", "Scenario: A dropped row shows up as the
      difference", "Scenario: An accrual-month divergence is noted, not obeyed", "Scenario: A
      difference explained by existing stored транзакції is named as such", "Scenario: An
      over-repaid рахунок-борг is visible before commit".
- [x] 5.3 End-to-end engine test `src/saldo/engine.test.ts` over one synthetic export
      exercising every shape at once (expense, foreign purchase, повернення, дохід, negative
      дохід, коригування, initial balances, direct and paired перекази, fee, борг both ways),
      asserting the report reconciles every рахунок exactly — the balance-preservation
      invariant behind "Scenario: A fully interpreted рахунок reconciles exactly".

## 6. Dry-run on the real export

- [x] 6.1 Add devDependency `tsx` and `scripts/saldo-dry-run.ts`: read a CSV path from argv,
      run parse → survey → interpret (empty decisions) → verify, print the survey, the
      unresolved «Борг» descriptions and the verification report. Never wired into `verify`.
- [x] 6.2 Run `npx tsx scripts/saldo-dry-run.ts "saldo_export_478575 (1).csv"` locally; every
      transaction must interpret or be listed. A gap it reveals may be fixed here only when the
      spec already names the shape — write the synthetic regression test first. Anything the
      spec does not cover stops the change and goes back to `/opsx:update`, not into the code.
      Do not commit the output or the file: both are personal data.

## 7. Gate

- [x] 7.1 Run `npm run verify` and paste the final lines
- [x] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
