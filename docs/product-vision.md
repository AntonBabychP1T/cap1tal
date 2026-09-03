# cap1tal — product vision

Built from an interview with the owner on 2026-08-23. Lines marked **[PROPOSED]** did not come from
the owner's answers; they are the interviewer's proposals that the owner accepted as defaults and may
still overturn. Everything else is the owner's own decision, in their words where possible.

This document describes the product, not the implementation. It must stay true after a rewrite of
the UI. Terms are defined in [glossary.md](glossary.md).

## 1. Who it is for and the problem

- One person, one primary phone. Data is not shared with anyone, except one file the owner
  themselves hands to an app they pick (§17). **[PROPOSED]** The database remains local-first;
  the owner may opt into a private daily backup in their own Google Drive for recovery on a new
  phone. This is backup synchronisation, not a shared account or live multi-device editing.
- Other people may install the app for themselves, so nothing personal is hardcoded into it.
- The problem, in the owner's words: *"I don't know where my money went this month"* and
  *"I don't know how much I can still spend."* Both must be answered.

## 2. The current workaround and why it fails

- Today: the Saldo app.
- Why it fails: it stopped being updated, it has bugs, and it only tracks monobank automatically.
  The owner wants more transactions captured automatically, from more sources, and wants to trust
  the numbers.

## 3. What the user needs first

- On opening the app: read the state of the month in a few seconds — how much is left of it, what
  it has cost, what is waiting for an answer — and see the latest transactions. Adding a
  transaction is one tap away, behind the «+»: the app is opened to look far more often than to
  record, and the form used to stand between the owner and everything worth reading.

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
- A category may carry an optional monthly limit (section 9). That limit is also the spending goal
  of its category — one amount under two names, never two ceilings that could disagree.
- Goals exist (section 11), of two kinds. A goal of the accumulating kind counts the money of one
  **or more** accounts, chosen by the owner; a spending goal is a category's monthly limit read as
  a goal.

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
- Goals of two kinds, with progress: accumulate N — optionally by a date — over one or more
  accounts the owner picks, and spend no more than N a month in a category, which is that
  category's limit seen as a goal. A progress that has to add up accounts in several currencies is
  converted into hryvnia and shown as explicitly approximate; where a rate is missing it is shown
  as not countable rather than as a smaller number.

Not in v1: forecasts ("at this pace you will have X left").

## 12. Trust and privacy **[PROPOSED]**

- The phone's database is the primary truth and the app works offline. Outbound connections are
  limited to the monobank API and exchange rate, plus Google Drive only after the owner explicitly
  connects it for backup. There is no analytics and no cap1tal server account.
- An AI-аналіз hands a file of already computed numbers to an app the owner picks in the phone's
  own chooser. That is the owner's hand-off, not a connection the app makes; the app never reads
  an answer back, and nothing about the file, the run or the answer is stored. **[PROPOSED]**
- A репорт про помилку is the app's own record of a bug — what the owner wrote, the build, the
  device, the журнал, how the репорт was opened, and its screenshots — kept on the phone and handed
  to an app the owner picks, one file at a time, exactly like an AI-аналіз. Everything the app
  *writes* into it carries no сума, назва, опис, bank text or token; the one thing it quotes is the
  app's own refusal, which the owner reads whole before handing it over. The app sends none of it
  anywhere on its own, and there is no service to send it to. **[PROPOSED]**
- A скріншот is the one thing a репорт carries that can show the owner's money, and it is named
  here rather than left implied. Screenshots reach a репорт two ways: the owner picks one, or —
  when the репорт is filed from the screen the problem is on — the app photographs that screen
  itself, which is the whole point of filing from there. Either way the app never reads,
  interprets, redacts or blurs it: it cannot know which pixels are a сума, and a promise it could
  not keep would be worse than the plain warning it can. So the owner is shown the скріншот and
  told, in as many words, that it carries whatever was on the screen — суми and назви included —
  before anything is handed over, and it leaves by their hand or not at all. **[PROPOSED]**
- Bank notifications are captured and parsed on the device. Raw notification payloads and the local
  capture queue never enter the Google Drive backup and are never sent to a server.
- Backup has one versioned file format. The owner can export/import that file manually. When Google
  Drive backup is enabled, the same backup is sent automatically about once a day, retried when the
  phone next has network/app execution time, and can be restored explicitly on a new phone. The app
  shows the last successful backup and failures; it never claims an exact daily time Android cannot
  guarantee. Tokens and OAuth secrets are never included.
- Google Drive is recovery, not silent two-way merging. A second device does not concurrently edit
  the same data in v1; restore always names the backup version and date before replacing local state.
- The backup contains sensitive financial data. Its encryption and recovery-key contract must be
  decided and tested before Google Drive backup ships.

## 13. Reminders and operational notifications

- The owner may enable one local daily reminder at a chosen time to record and review expenses.
  Tapping it opens Головний, where the pending drafts wait and the «+» records the day's expenses.
- cap1tal may send a local notification when an action failed and needs attention: import, save,
  local or Google Drive backup, or notification capture/processing. The notification says only what
  action failed, exposes no bank text or secret on the lock screen, and leads to details and retry.
- These are device-local notifications scheduled by the app. There is no remote push-notification
  service, marketing messaging or analytics channel.

## 14. Explicitly not in v1 **[PROPOSED list, confirmed by the owner]**

1. Shared data, multiple users, cap1tal accounts, or live two-way sync between devices.
2. Investment positions / instruments and automatic prices (only a hand-entered value per account).
3. Loan details: due dates, interest rates, repayment schedules (only a debt account per person).
4. "Money in transit" / bank holds as a separate state — a hold is just a transaction.
5. Splitting one purchase across several categories.
6. Recurring or scheduled transactions.
7. Bank integrations beyond the monobank API and notification parsing (no PrivatBank API, no SMS).
8. Category hierarchy and tags.
9. Cloud services other than the owner's opt-in Google Drive backup.
10. Forecasts ("at this pace…").
11. Moving a transaction to a different month than its date.
12. Payments or transfers initiated from the app — it records money, it never moves it.
13. An overall monthly limit (only per-category limits).
14. Remote push notifications; the daily reminder and actionable error alerts are local only.
15. An iOS build — but nothing in the product model may depend on Android or stand in the way of iOS.

## 15. How we know v1 worked **[PROPOSED]**

For three consecutive calendar months: every transaction from every account is in the app, "left" is
a number the owner trusts without opening a bank app or recounting cash, and the month's corrections
total less than 2 % of that month's spending. (The 2 % is the interviewer's figure; the owner may
replace it.)

## 16. Import notes and what is left open

Decided for the one-time import of the Saldo history:

- Saldo holds two accounts for the same card: the hand-maintained one ("mono black", "mono white",
  "валюта моно") the owner used while auto-import was broken, and the auto-import one
  ("Monobank UAH, Black", "Monobank UAH, White", "Monobank USD/EUR, Black"). They are the same card
  and merge into one account.
- Saldo records lending as an expense category "Борг" with repayments as refunds. That is the same
  thing this product models as debt accounts; the history maps onto debt accounts (lend = transfer
  out, repayment = transfer back).
- The person behind a historic "Борг" transaction is not kept. Every debt the export carries is
  already repaid, so what is worth keeping is that the money went out and came back — not who
  held it. The import puts all of them on one debt account «Борги» per currency and asks nothing.
  Debts entered by hand from now on still name their person, one account each.

Still open, to be decided when relevant:

- Whether the monthly picture should also show the approximate-UAH totals per account kind, or only
  the grand total.

## 17. AI-аналіз **[PROPOSED]**

The app may explain its numbers with the help of a language model — an assistant the owner already
has, or later a model on the phone. The model is never a source of truth: every number it sees is
computed by the app, per currency; it interprets, and it changes nothing. By default it sees
aggregates only; описи and individual транзакції leave the phone only when the owner switches them
on for that run.
