# domain-core — tasks

## 1. Setup

- [x] 1.1 Add `fast-check` as a devDependency (design D7); confirm `npm run verify` still passes
      and stays under a minute before any domain code lands

## 2. Money

- [x] 2.1 Create `src/domain/money.ts`: `CurrencyCode`, `Money`, validating factory
      (`Number.isSafeInteger`), `add`/`subtract` that throw on currency mismatch (design D1).
      Tests in `src/domain/money.test.ts` prove the money spec scenarios: "Creating a valid
      amount", "Rejecting a fractional amount", "A negative amount is valid", "Adding two amounts
      of the same currency", "Cross-currency sum is rejected"

## 3. Accounts

- [x] 3.1 Create `src/domain/account.ts`: `AccountKind`, `Account` (one kind, one currency), and
      the single transfer-classification function keyed on both accounts' kinds
      (design D6, accounts spec). Tests in `src/domain/account.test.ts` prove: "A jar is a savings
      account in UAH", "Jar top-up is saved, not invested", "Transfer to an investment account is
      invested", "Lending is lent", "Withdrawing from a jar subtracts from saved", "ATM withdrawal
      is only a move", "Card to card is only a move"

## 4. Transactions

- [x] 4.1 Create `src/domain/transaction.ts`: discriminated union `Expense` / `Income` /
      `Transfer` / `Refund` / `Correction`, ISO date strings (design D2, D4), reserved
      `FEES_CATEGORY_ID` / `CORRECTION_CATEGORY_ID` / `UNCATEGORISED_CATEGORY_ID` constants
      (design D3), and the factory that
      defaults untyped input to `expense`. Tests in `src/domain/transaction.test.ts` prove the
      transactions spec scenarios: "An untyped transaction is an expense", "An unrecognised import
      is an expense", "Income with a source", "Card to jar", "Transfer amounts are positive",
      "UAH card to USD account", "USD purchase from a UAH card"
- [x] 4.2 Add `proposeFee(transfer)` to the domain (design D5). Tests in
      `src/domain/transaction.test.ts` prove: "Transfer with a shortfall", "Transfer without a
      shortfall"

## 5. Monthly picture

- [x] 5.1 Create `src/domain/monthly-picture.ts`: `monthlyPicture({ month, accounts,
      transactions })` returning per-currency `{ spent, invested, saved, lent, income, left }`
      (design D6). Example-based tests in `src/domain/monthly-picture.test.ts` prove:
      "Transactions fall into the month of their date", "Two currencies stay apart", "Refund
      reduces spent", "Negative correction is spent", "Return exceeds contributions", "Jar top-up
      and withdrawal", "Lending and partial repayment", "Positive correction joins income", "Money
      moved into a jar or lent out is not available", "UAH top-up of a USD jar is saved in UAH",
      "Jar top-up arriving short is saved at what arrived",
      "Money back from a USD jar reduces saved in UAH" — plus the transactions-spec scenarios that
      surface here: "Negative correction counts as spent", "Positive correction counts as income",
      "Returned purchase", "USD purchase from a UAH card" (originalAmount enters no total),
      "An unrecognised import is an expense" (counts as spent)
- [x] 5.2 Add fast-check property tests in `src/domain/monthly-picture.test.ts` with arbitraries
      for valid dates, accounts and transactions (cross-currency transfers included), proving "The
      identity holds for any transactions" (income = spent + invested + saved + lent + left, per
      currency — with the five nets recomputed independently of `monthlyPicture`, per design D6)
      and that no cross-currency amount ever mixes

## 6. Verification

- [x] 6.1 Run `npm run verify` and paste the final lines
- [x] 6.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
