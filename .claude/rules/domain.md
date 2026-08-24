---
paths:
  - "src/domain/**"
---

# Domain logic rules

Source of truth: `docs/product-vision.md` and `docs/glossary.md`. If code and those docs disagree,
stop and say so; do not "fix" the docs silently.

## Keep the domain pure
- No imports from React, React Native, Expo, Drizzle or `src/db/**`. Domain code takes plain
  values and returns plain values; it does not touch I/O, clocks or randomness. Pass `now` in.
- Every exported function has a colocated `*.test.ts` whose test names quote the spec scenario
  they prove.

## Money
- Amounts are integers in minor units (kopiykas, cents) with an explicit ISO-4217 currency code
  next to them. Never `number` arithmetic on decimals, never floats, never parse `"12.50"` in the
  domain. [PROPOSED — owner has not confirmed the representation]
- Never add amounts of different currencies. Monthly numbers are computed per currency; the
  "approximate UAH" figure is a display-only conversion at monobank's current rate and is never
  stored as if it were the truth.
- A foreign-currency purchase from a UAH card is spent in the UAH the bank charged; the original
  currency amount is informational.
- A transfer between accounts of different currencies carries two amounts (left / arrived). Do not
  derive or store a rate.

## Entities and invariants
- Account kinds: `spending`, `savings`, `investment`, `cash`, `debt`. The kind, not the name,
  decides how a transfer into the account counts in the month.
- Transaction types: `expense` (the default), `income`, `transfer`, `refund`, `correction`.
  An investment, a jar top-up, an ATM withdrawal and lending are all `transfer`s; only the
  destination account kind differs.
- Default is expense: anything not explicitly typed otherwise is `expense`, including imports that
  no rule recognised (they land in "Uncategorised" and still count as spent).
- Refund = negative expense in the same category, dated when it arrives. Never model it as income.
- Correction has its own category; negative counts as spent, positive as income. It is the only
  way to make a computed balance agree with the bank or a cash count.
- Same-currency transfer where `arrived < left` records the difference as a `Fees` expense.
- Repayment of a debt above the principal is income (`interest`); the principal is a transfer back.
- Balance is always derived from an opening balance plus transactions. Never store a balance that
  transactions cannot explain.

## Monthly picture (calendar month)
- spent = expenses net of refunds (uncategorised, corrections<0 and fees included)
- invested = net transfers into `investment` accounts (returns reduce it; may go negative)
- saved = net transfers into `savings`; lent = net transfers into `debt`
- left = income − spent − invested − saved − lent. Keep this identity as a property test.
- Category limits are per calendar month and only ever mark a category as over; nothing blocks.

## Naming
- Use glossary terms verbatim in types and identifiers: `Account`, `AccountKind`, `Transaction`,
  `Transfer`, `Refund`, `Correction`, `Category`, `Limit`, `Goal`, `spent/invested/saved/lent/left`.
  Do not introduce synonyms (no `Wallet`, `Budget`, `Payment`, `Movement`).
