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
- **Description** (опис) — the text the bank sent with an imported транзакція — «СІЛЬПО»,
  «Uklon» — kept on it for information. Nothing computes with it: no total, no баланс and no
  категорія is decided by an опис, and it survives every edit and retype, so a витрата retyped
  into a переказ still says where it came from. Manual entry never asks for one. It is the bank's
  words about the owner, which is why it leaves the phone only under «Продавці» (see AI).
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
- **Monthly picture** (місячна картина) — the six numbers below taken together for one
  calendar month, per currency: витрачено, дохід, інвестовано, відкладено, позичено and
  залишилось. The term the code has used since `monthly-picture`. It is computed from the
  транзакції of the month and never entered.
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
  balance, every категорія, джерело, правило, ліміт and ціль, every транзакція, what the app has
  already imported, and every фіскальний чек with its позиції and the source document the tax
  service served — so a restored phone shows a чек without asking the tax service again. It never
  holds the monobank token, the чернетки awaiting a word, or the text of the notifications behind
  them. It is not encrypted: whoever holds the file can read the
  money in it.
- **Restore** (відновлення) — putting a бекап back. It **replaces** everything now on the phone —
  it never merges, and there is no undo — so the app shows what the бекап holds beside what is on
  the phone, and asks, before anything changes. It either lands whole or does not happen.

## The fiscal receipt

- **Фіскальний чек** (fiscal receipt) — what the seller's registrar registered with the tax
  service for one purchase: the позиції bought, their prices, the total, the seller and the moment.
  The app fetches it by the реквізити printed as a QR code on the paper чек, and keeps it as
  detail **beneath** a транзакція. It moves no money: no розрахунковий баланс, no number of the
  місячна картина, no ліміт, ціль or звіт changes because a чек was attached.
- **Позиція чека** (receipt line) — one line of a чек: the product name exactly as printed, the
  quantity with its unit, the unit price and the line total where the чек names them, a line
  discount, and the barcode and УКТЗЕД code where it carries them. A позиція is never a
  транзакція, carries no категорія, and nothing renames, cleans, groups or classifies it.
- **Реквізити чека** (receipt particulars) — what the QR carries and the lookup needs: the
  фіскальний номер чека, the фіскальний номер реєстратора, the date, the time and the сума.
- **Реєстратор** (registrar, РРО/ПРРО) — the seller's cash register, hardware (РРО) or software
  (ПРРО), which registers each чек with the tax service. The two serve documents in two different
  formats; the app reads both.
- **Фіскальний номер чека** — the number the tax service gave this чек. **Фіскальний номер
  реєстратора** — the number it gave the registrar that issued it. Together with the date issued
  they are the чек's identity: two чеки with those three values are one чек.
- **Прикріпити чек** (attach) / **відкріпити чек** (detach) — putting a чек under a транзакція and
  taking it away again. Attaching stores the чек, its позиції and the source document as one unit,
  and only after the owner has seen what it holds. Detaching deletes them and leaves the
  транзакція exactly as it was. A транзакція holds at most one чек; a чек hangs on at most one
  транзакція.

## What the app says first

- **Reminder** (нагадування) — one notification the phone posts once a day, at a time the owner
  chose, inviting them to record the day's витрати and answer the чернетки waiting. It is off
  until they turn it on, and it says nothing else: no сума, no рахунок, no категорія. Tapping it
  opens Головний.
- **Failure alert** (сповіщення про збій) — one notification saying that work the app was doing on
  its own did not succeed: collecting the push сповіщення of other banks, a monobank sync, the
  Saldo імпорт, saving a транзакція, or a бекап. It names the action and nothing more, and leads
  to the screen where the reason is written and the retry is offered. One failed action is one
  сповіщення however often it fails; it goes when that action next succeeds, or when the owner
  opens the screen it leads to. A failure whose screen the owner is already looking at raises none.

## AI

- **AI-аналіз** (AI analysis) — an explanation, by a language model, of numbers the app has
  already computed: an assistant the owner already has, or later a model on the phone. The model
  is never a source of truth and changes nothing — it reads out what the app computed and the app
  is not touched by what it says. A kind of AI-аналіз is named by the glossary term it reads —
  «Місячна картина» now, «Інвестиції» later — and never «бюджет», which vision §9 uses for ліміти.
- **Пакет для аналізу** (analysis package) — the versioned, deterministic bundle of numbers the
  app builds locally for one AI-аналіз: per currency, never mixed, every сума exact, from the
  stored транзакції alone. It carries no identifier, no назва of a рахунок, no secret and no text
  a bank sent. Описи and individual транзакції are in it only by the owner's explicit choice for
  that one run.
- **Файл для аналізу** (analysis file) — the пакет rendered as one self-contained text: the
  instructions to the assistant, the context that defines the terms, a readable summary and the
  пакет itself. It is what an assistant answers from with nothing added by the owner.
- **Передати** (hand over) — giving one file the app made — a файл для аналізу, a репорт про
  помилку — to an app the owner picks in the phone's own chooser; on the AI-аналіз screen the
  action reads «Поділитися з AI». It is the owner's act, not a connection the app makes: the app
  names no recipient, opens no app of its own, and never learns what the chosen app did with the
  file — so whatever is handed over, it says only that the file was handed to the system.
- **Продавець** (merchant) — the опис of a витрата, folded and trimmed, as the пакет groups
  витрати by it. An опис that a confirmed чернетка left on its транзакція is an опис like any
  other — the bank's own text — and leaves the phone only under «Продавці», the switch that lets
  описи into a пакет at all.
- **Тренди** (trends) — the month-over-month figures of a пакет: the changes of the six numbers,
  the averages before the period, the largest категорії and their changes, the notable витрати and
  the recurring candidates. Every one of them is computed by the app, deterministically, before
  any assistant sees the пакет — never by the assistant.

## Keeping the app honest

- **Журнал** (journal) — the app's own bounded record of what it has been doing lately, kept on
  the phone for one purpose: so a bug met on the phone can be reproduced at the laptop. It holds
  an entry per moment for every screen opened (by its route), every action that failed with the
  exact text the owner was shown, every сповіщення про збій raised or cleared, and every crash
  with its message and stack. It keeps the most recent 500 entries and drops the oldest beyond
  that. It never holds a сума, a назва, an опис, the text of a bank's сповіщення or the monobank
  token — an action is named by its kind, a screen by its route, a failure by the app's own words.
  Where the app's own refusal quotes what the owner typed into the refused field, the quote lives
  in that one entry and nowhere else. It leaves the phone only inside a репорт про помилку the
  owner hands over, and it is never in a бекап.
- **Репорт про помилку** (bug report) — what the owner wrote down after something went wrong —
  what they did (required), what happened, what they expected — together with what the app
  attaches by itself at that moment: its version and build, the platform, the device, the number
  of migrations applied, the route of the screen it was filed from, the moment, the whole журнал,
  the failure or crash that prompted it, and counts of what the phone holds as numbers only; plus
  any screenshots the owner adds afterwards. It is stored on the phone and read there whole, and
  it leaves only when the owner hands it over («Передати») or copies its text. It is never in a
  бекап, and a відновлення leaves репорти and the журнал untouched.

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
| Фіскальний чек | Квитанція | the чек is what the seller's реєстратор registered with the tax service and names the позиції; a квитанція (monobank's `receiptId`, check.gov.ua) only proves a payment happened and names no product — it cannot be used to find a чек |
| Позиція чека | Транзакція | a позиція is detail under one транзакція; it has no категорія, no рахунок and no effect on any number the app computes |
| Репорт про помилку | Сповіщення про збій | the репорт is what the owner writes for the developer; the сповіщення is what the app posts to the owner |
