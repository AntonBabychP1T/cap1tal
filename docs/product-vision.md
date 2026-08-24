# cap1tal — product vision

Built from an interview with the owner on 2026-08-23. Lines marked **[PROPOSED]** did not come from
the owner's answers; they are the interviewer's proposals that the owner accepted as defaults and may
still overturn. Everything else is the owner's own decision, in their words where possible.

This document describes the product, not the implementation. It must stay true after a rewrite of
the UI. Terms are defined in [glossary.md](glossary.md).

## 1. Who it is for and the problem

- One person, one phone. Data is not shared with anyone and not synchronised anywhere.
- Other people may install the app for themselves, so nothing personal is hardcoded into it.
- The problem, in the owner's words: *"I don't know where my money went this month"* and
  *"I don't know how much I can still spend."* Both must be answered.

## 2. The current workaround and why it fails

- Today: the Saldo app.
- Why it fails: it stopped being updated, it has bugs, and it only tracks monobank automatically.
  The owner wants more transactions captured automatically, from more sources, and wants to trust
  the numbers.

## 3. What the user needs first

- On opening the app: add a transaction, and see the latest transactions. Everything else lives
  elsewhere and is one step away.

## 4. Core entities and their boundaries

### Accounts
- The owner holds many cards at several banks. At monobank: black (main), white, EUR, USD, and
  jars (банки) in UAH and USD. Every other bank is one account per bank.
- Cash exists as two accounts: the wallet (гаманець) and cash at home (готівка).
- Investment accounts (military bonds, Inzhur, IBKR, Binance, …) are accounts too.
- **[PROPOSED]** Every account has a kind: **spending** (cards), **savings** (jars, reserves,
  envelopes), **investment**, **cash**, or **debt**. The kind decides how a transfer into the account
  is counted in the monthly picture (section 8). Account kinds are the only thing that separates
  "saved", "invested" and "lent" from a plain transfer.
- A **debt account** exists per person the owner lends money to (see *Lending* below).

### Transactions
- **Expense** is the default. In the owner's words: *"every transaction is spending until I mark it
  as a transfer or an investment."* Uncategorised imports are expenses too.
- **Income** is a transaction type with a source label (salary, freelance, parents, gift, …).
- **Transfer** is its own type: money moving between the owner's own accounts — card to card,
  topping up a jar, ATM withdrawal (card → cash) and the reverse (cash → card). Balances change;
  the monthly "spent" number does not.
- **Investment** is a transfer from a spending account to an investment account ("from mono black to
  military bonds or Inzhur"), regardless of what is bought with the money afterwards.
- **Refund** (returned purchase, cashback, a friend paying back) is a negative expense in the same
  category, in the month it arrives. It is not income.
- **Correction** is what the app records when reality and the app disagree. It has its own category
  ("unknown / correction"); a negative correction counts as spent, a positive one as income.
- **[PROPOSED]** A transfer between two accounts in the same currency where the amount that left
  differs from the amount that arrived records the difference as an expense in a "Fees" category.

### Lending
- The owner sometimes lends money and gets it back with a small interest. This must work.
- Lending is a transfer into that person's debt account: not spent, but no longer available (it
  reduces "left"). Repayment is a transfer back. Anything repaid above the principal is income
  ("interest").
- No due dates, rates or schedules in v1.

### Categories, limits, goals
- Categories are the owner's own flat list, seeded with a starter set.
  **[PROPOSED]** The starter set is the owner's existing Saldo list of expense categories and income
  sources, with the one nested income source ("parents → Andriy, Lena") flattened.
- A category may carry an optional monthly limit (section 9).
- Goals exist (section 11).

## 5. Money rules

- Hryvnia accounts are shown in UAH; foreign-currency accounts in their own currency. Somewhere the
  app also shows an approximate total in UAH.
- Exchange rate for the approximation: monobank's rate.
  **[PROPOSED]** The approximation uses the current rate, not the rate on the transaction date,
  because it is secondary and explicitly approximate.
- **[PROPOSED]** A foreign-currency purchase from a hryvnia card is spent in UAH — the amount the
  bank charged; the amount in the original currency is kept for information only. (This is how the
  owner's history already reads.)
- **[PROPOSED]** A transfer between accounts in different currencies carries two amounts — what left
  and what arrived. No separate rate is stored; the rate is whatever the bank gave.
- An account's balance is computed from its transactions (opening balance plus everything since).
  Where the bank exposes a balance, it is shown next to the computed one, with a "reconcile" action
  that creates a correction transaction for the difference. Every hryvnia stays explained.
- When reality and the app disagree (cash recount, missing transaction), the owner records a
  correction; see *Correction* in section 4 for how it counts.

## 6. Where transactions come from, in priority order

1. Manual entry — must work first; it is needed regardless.
2. monobank API — the main value.
3. Push notifications from other banks' apps, parsed on the phone — how every non-monobank account
   gets captured automatically.
4. CSV import — at minimum once, to load the history exported from Saldo.

Not in v1: recurring or scheduled transactions, SMS parsing, other banks' APIs. **[PROPOSED]**

## 7. Categorisation

- Imported transactions are categorised automatically by merchant / MCC using rules the owner can
  edit.
- Anything not recognised goes to "Uncategorised", counts as spent (it is an expense by default), and
  is highlighted among the latest transactions so it can be categorised in one tap.

## 8. The monthly model

- **[PROPOSED]** The period is the calendar month. The owner's income arrives 4–9 times a month on
  scattered days, so there is no natural pay-day; a custom start day can become a setting later.
- Definitions for a month:
  - **Spent** — expenses (including uncategorised ones, negative corrections, fees), net of refunds.
  - **Invested** — net transfers into investment accounts. Money coming back from an investment
    account reduces "invested" for that month and can make it negative. **[PROPOSED]** If the owner
    knows which part of a return is profit (a bond coupon), they record that part as income
    ("investments") — the owner already did this in Saldo.
  - **Saved** — net transfers into savings accounts (jars, reserves). **[PROPOSED]**
  - **Lent** — net transfers into debt accounts. **[PROPOSED, follows from Lending]**
  - **Left** — what is still available to spend: **income − spent − invested − saved − lent**.
    **[PROPOSED]** Equivalently: income = spent + invested + saved + lent + left. Money moved into a
    jar or lent out must not look available.
- Monthly numbers are shown per currency, plus the approximate UAH equivalent. **[PROPOSED]**

## 9. Budgets

- A category may have a monthly limit. When it is exceeded, the category is shown as over limit (red)
  in the monthly picture and in the transaction list. No push notifications.
- **[PROPOSED]** Limits are optional per category; there is no overall monthly limit in v1.

## 10. Investments

- The app tracks money in and out of each investment account; the account's contributed amount is the
  sum of those transfers.
- The owner occasionally enters the current value of each investment account by hand; the app shows
  gain or loss against the money put in.
- Positions, instruments, quantities and prices — later. Automatic prices — not in v1.

## 11. Reports and goals

In v1:
- Spent / income / invested by month, over the whole history.
- A category by month.
- Goals: set aside N by a date, with progress.

Not in v1: forecasts ("at this pace you will have X left").

## 12. Trust and privacy **[PROPOSED]**

- All data lives on the phone. The only outbound connections are the monobank API (with the owner's
  own token, stored on the device) and monobank's exchange rate. No accounts, no cloud, no analytics.
- Bank notifications are parsed on the device and never sent anywhere.
- Backup is a complete export to a file (accounts, categories, rules, limits, goals, transactions)
  that the owner stores wherever they like, and an import that restores it on a new phone. Losing the
  phone means losing everything since the last export. Trade-off accepted: no sync, nothing leaks.

## 13. Explicitly not in v1 **[PROPOSED list, confirmed by the owner]**

1. Shared data, multiple users, sync between devices, login.
2. Investment positions / instruments and automatic prices (only a hand-entered value per account).
3. Loan details: due dates, interest rates, repayment schedules (only a debt account per person).
4. "Money in transit" / bank holds as a separate state — a hold is just a transaction.
5. Splitting one purchase across several categories.
6. Recurring or scheduled transactions.
7. Bank integrations beyond the monobank API and notification parsing (no PrivatBank API, no SMS).
8. Category hierarchy and tags.
9. Cloud backup or sync — file export/import only.
10. Forecasts ("at this pace…").
11. Moving a transaction to a different month than its date.
12. Payments or transfers initiated from the app — it records money, it never moves it.
13. An overall monthly limit (only per-category limits).
14. Push notifications of any kind.
15. An iOS build — but nothing in the product model may depend on Android or stand in the way of iOS.

## 14. How we know v1 worked **[PROPOSED]**

For three consecutive calendar months: every transaction from every account is in the app, "left" is
a number the owner trusts without opening a bank app or recounting cash, and the month's corrections
total less than 2 % of that month's spending. (The 2 % is the interviewer's figure; the owner may
replace it.)

## 15. Import notes and what is left open

Decided for the one-time import of the Saldo history:

- Saldo holds two accounts for the same card: the hand-maintained one ("mono black", "mono white",
  "валюта моно") the owner used while auto-import was broken, and the auto-import one
  ("Monobank UAH, Black", "Monobank UAH, White", "Monobank USD/EUR, Black"). They are the same card
  and merge into one account.
- Saldo records lending as an expense category "Борг" with repayments as refunds. That is the same
  thing this product models as debt accounts; the history maps onto debt accounts (lend = transfer
  out, repayment = transfer back).

Still open, to be decided when relevant:

- How to identify the person behind each historic "Борг" transaction (probably from its
  description), so it lands in the right debt account.
- Whether the monthly picture should also show the approximate-UAH totals per account kind, or only
  the grand total.
