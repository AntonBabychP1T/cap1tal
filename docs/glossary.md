# cap1tal — glossary

Domain terms with the meaning the owner gave them in the interview of 2026-08-23. Ukrainian terms in
brackets are the owner's own words and are the preferred labels in the product. Entries marked
**[PROPOSED]** are the interviewer's proposals the owner accepted as defaults.

Companion to [product-vision.md](product-vision.md). No implementation detail here.

## Accounts

- **Account** (рахунок) — a place money sits: a bank card, a jar, a cash stash, an investment
  account, or a person who owes the owner money. Every transaction touches one or two accounts.
- **Account kind** (вид рахунку) **[PROPOSED]** — one of *spending*, *savings*, *investment*,
  *cash*, *debt*. The kind decides how a transfer into the account is counted in the month:
  spending → nothing; savings → "saved"; investment → "invested"; debt → "lent"; cash → nothing.
- **Card** (картка) — a bank account of kind *spending*. monobank black is the main one.
- **Jar** (банка) — a monobank savings sub-account; kind *savings*. Putting money in a jar is a
  transfer, **not** an investment.
- **Wallet** (гаманець) — cash carried around; kind *cash*.
- **Cash** (готівка) — cash kept at home; kind *cash*. Wallet and cash are two separate accounts.
- **Investment account** (інвестиційний рахунок) — military bonds, Inzhur, IBKR, Binance, …;
  kind *investment*. The app knows only money in and out, plus a hand-entered current value.
- **Debt account** (рахунок-борг) — one per person the owner has lent money to; kind *debt*.
  Its balance is what that person still owes. The Saldo import is the one exception: its debts are
  all closed and nameless, so it puts them on a single «Борги» account per currency.
- **Computed balance** (розрахунковий баланс) — opening balance plus every transaction since; the
  balance the app believes.
- **Bank balance** (баланс банку) — the balance the bank reports where an API exists; shown next
  to the computed one, never overwriting it.
- **Reconcile** (звірити) — create a correction for the difference between bank balance and
  computed balance, so every hryvnia stays explained.

## Transactions

- **Transaction** (транзакція) — one movement of money on a date, with an amount and a currency,
  touching one or two accounts. Types below.
- **Expense** (витрата) — money leaving an account to the outside world. The **default**: "every
  transaction is spending until I mark it as a transfer or an investment."
- **Income** (дохід) — money arriving from the outside world, with a **source** (see Categories).
- **Transfer** (переказ) — money moving between two of the owner's own accounts: card → card,
  card → jar, card → cash (ATM), cash → card, card → investment account, card → debt account.
  Balances change; "spent" does not. A transfer across currencies carries two amounts (what left,
  what arrived) **[PROPOSED]**.
- **Investment** (інвестиція) — a transfer from a spending account into an investment account
  ("from mono black to military bonds or Inzhur"). What is bought with the money afterwards is not
  a transaction.
- **Refund** (повернення) — returned purchase, cashback, a friend paying back: a **negative expense
  in the same category**, in the month it arrives. Not income.
- **Correction** (коригування) — the transaction that absorbs a disagreement between reality and
  the app (cash recount, missing transaction, reconcile). Own category "unknown / correction";
  negative counts as spent, positive as income.
- **Fee** (комісія) **[PROPOSED]** — the difference when a same-currency transfer arrives smaller
  than it left; recorded as an expense in a "Fees" category.
- **Interest** (відсотки) — what a borrower repays above the principal; income.
- **Original-currency amount** (сума в оригінальній валюті) **[PROPOSED]** — for a foreign
  purchase from a hryvnia card, the amount in the merchant's currency; kept for information. The
  expense itself is the UAH the bank charged.
- **Uncategorised** (без категорії) — an imported transaction no rule recognised. Still an
  expense, still counted as spent, highlighted for one-tap categorisation.
- **Unsourced** (без джерела) — the income half of "uncategorised": the джерело an imported
  arrival carries while the bank has said only that money came in. A visible starting state, never
  a verdict and never a classification of a refund — the owner retypes it into what it was.
- **Draft** (чернетка) — a транзакція an import proposes and the owner has not yet said a word
  about: it sits on a рахунок with a date, the text the bank sent, and a proposed amount, and it
  moves no money — no розрахунковий баланс and no monthly number reads it. Confirming it creates
  the транзакція it proposed; dismissing it creates nothing and it never returns.
- **Watched app** (відстежуваний застосунок) — a phone app whose push notifications the owner has
  opted this app into reading, mapped to exactly one рахунок. Only a watched app's notifications
  are read at all, and what is read never leaves the phone.

## Categories and sources

- **Category** (категорія) — a label on an expense from the owner's own flat list. No hierarchy,
  no tags in v1.
- **Source** (джерело доходу) — the label on an income: salary, freelance, parents, gift,
  investments, interest, …
- **Starter set** **[PROPOSED]** — the owner's Saldo categories and sources, flattened.
- **Rule** (правило) — "merchant / MCC X → category Y", applied to imports; editable by the owner.
- **Limit** (ліміт) — an optional monthly ceiling on a category: at most one per category, a сума
  with a currency code. A category is **over its ліміт** for a month when that month's spent of it
  **in the ліміт's own currency** — the net-of-повернення amount the monthly-picture breakdown
  holds — is strictly greater than the ліміт; equality is not over, and spending in any other
  currency neither counts toward it nor is converted toward it. Exceeding it marks the category
  red in the monthly picture and in the transaction list. Nothing is blocked, nothing is pushed.
- **Goal** (ціль) — "set aside N by a date", with progress shown: a назва, a target сума, a дата
  and one linked рахунок. Its **progress is that рахунок's розрахунковий баланс**, read when the
  ціль is shown — never a second number entered by hand, which could drift from the stored truth,
  so money reaches a ціль only the way money reaches its рахунок. The target lives in the linked
  рахунок's currency; nothing is ever converted. A ціль is **reached** (досягнута) when its
  progress is at or above its target, and **overdue** (прострочена) when its дата has passed and
  it is not reached; a reached ціль is never overdue.

## The month

- **Month** (місяць) **[PROPOSED]** — the calendar month; the period every number below is about.
- **Spent** (витрачено) — expenses in the month (including uncategorised, negative corrections,
  fees), net of refunds.
- **Invested** (інвестовано) — net transfers into investment accounts in the month; money coming
  back reduces it and can make it negative.
- **Saved** (відкладено) **[PROPOSED]** — net transfers into savings accounts in the month.
- **Lent** (позичено) **[PROPOSED, follows from debt accounts]** — net transfers into debt
  accounts in the month.
- **Income** (дохід за місяць) — all income received in the month, including positive corrections
  and interest.
- **Left** (залишилось) **[PROPOSED]** — income − spent − invested − saved − lent: what is still
  available to spend. Equivalently, income = spent + invested + saved + lent + left.
- **Approximate UAH equivalent** (приблизно в гривні) — a secondary conversion of non-UAH amounts
  at monobank's current rate **[current rate: PROPOSED]**; the per-currency numbers are the truth.
- **Gain / loss** (прибуток / збиток) — for an investment account: hand-entered current value
  minus money put in.

## Keeping the data

- **Backup** (бекап) — one file holding everything the owner has: every рахунок with its opening
  balance, every категорія, джерело, правило, ліміт and ціль, every транзакція, and what the app
  has already imported. It never holds the monobank token, the чернетки awaiting a word, or the
  text of the notifications behind them. It is not encrypted: whoever holds the file can read the
  money in it.
- **Restore** (відновлення) — putting a бекап back. It **replaces** everything now on the phone —
  it never merges, and there is no undo — so the app shows what the бекап holds beside what is on
  the phone, and asks, before anything changes. It either lands whole or does not happen.

## What the app says first

- **Reminder** (нагадування) — one notification the phone posts once a day, at a time the owner
  chose, inviting them to record the day's витрати and answer the чернетки waiting. It is off
  until they turn it on, and it says nothing else: no сума, no рахунок, no категорія. Tapping it
  opens Головний.
- **Failure alert** (сповіщення про збій) — one notification saying that work the app was doing on
  its own did not succeed: collecting the sms/push сповіщення of other banks, a monobank sync, the
  Saldo імпорт, saving a транзакція, or a бекап. It names the action and nothing more, and leads
  to the screen where the reason is written and the retry is offered. One failed action is one
  сповіщення however often it fails; it goes when that action next succeeds, or when the owner
  opens the screen it leads to. A failure whose screen the owner is already looking at raises none.

## Distinctions the owner drew

| This | is not that | because |
| --- | --- | --- |
| Transfer (card → jar, ATM, card → card) | Expense | the money is still the owner's; only "where it sits" changed |
| Investment (card → bonds / Inzhur) | Expense | it is a transfer into an investment account; counted as "invested", not "spent" |
| Jar top-up | Investment | a jar is savings — "saved", not "invested" |
| Lending (card → debt account) | Expense | not spent, but not available either — it reduces "left" until repaid |
| Repayment of principal | Income | it is the transfer back; only the part above principal is income ("interest") |
| Refund / cashback / friend paying back | Income | it is a negative expense in the original category |
| Correction | Ordinary expense / income | it is unexplained money; it has its own category so it is visible, but it still counts as spent (−) or income (+) |
| Return from an investment account | Income | it is a transfer back that reduces "invested"; only a known profit part is income |
| Fee on a transfer | Part of the transfer | the shortfall is an expense ("Fees") **[PROPOSED]** |
| Bank balance | Computed balance | the bank's number is shown for comparison; the computed one is the truth until a correction explains the gap |
| Original-currency amount | The expense | the expense is the UAH the bank charged **[PROPOSED]** |
| Draft (чернетка) | Transaction | it only proposes; nothing counts it until the owner confirms it |
| Restore (відновлення) | Import (імпорт) | an import adds to what is there; a restore replaces all of it with the бекап's |
| Reminder (нагадування) | Failure alert (сповіщення про збій) | the нагадування asks the owner to do something; the сповіщення says the app failed to |
| Failure alert (сповіщення про збій) | Bank notification (сповіщення банку) | one the app posts about itself; the other is what another bank's app posted and this app read |
