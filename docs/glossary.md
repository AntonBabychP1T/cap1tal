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
- **Opening date** (дата початкового залишку) — the day from which a рахунок's початковий
  залишок holds: the day the рахунок was created in the app, the Saldo «Initial balance» date on
  import, or a дата the owner sets — never after today. It moves no баланс: the розрахунковий
  баланс is the початковий залишок plus every транзакція whatever their dates. It only says from
  when Історія статку counts the рахунок. A рахунок stored before it existed has none.
- **Bank balance** (баланс банку) — the balance the bank reports where an API exists; shown next
  to the computed one, never overwriting it.
- **Contributed** (вкладено) — for an інвестиційний рахунок: that рахунок's розрахунковий баланс —
  its початковий залишок plus every транзакція touching it, which for such a рахунок is what went
  in minus what came back out. Money that was already there before the app started counts as
  вкладено too. It is never a second, separately kept total: what was put in is what the
  транзакції say, and a number beside them could disagree with them.
- **Current value** (поточна вартість) — what an інвестиційний рахунок is worth today, as the owner
  types it in: a сума in the рахунок's own currency with the дата it was entered, at most one per
  рахунок, replaced when entered again and clearable. Entering it creates **no транзакція** and
  moves no баланс — it is an observation of the outside world rather than a consequence of the
  owner's money moving, and it is kept apart from the розрахунковий баланс exactly as баланс банку
  is. A вартість of zero is a вартість the owner entered: an інвестиція may be worth nothing.
- **Reconcile** (звірити) — create a correction for the difference between bank balance and
  computed balance, so every hryvnia stays explained.
- **Підказка про дубль** (duplicate hint) **[PROPOSED]** — one sentence the Saldo імпорт states on
  a рахунок of the account map when another рахунок of the same currency can only be the same one,
  offering to merge them. It is an offer and never an act: nothing merges until the owner takes it,
  it names only a рахунок the row could have been merged onto anyway, and dismissing it is
  remembered for that import and stored nowhere.

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
  «Uklon» — or a note the owner types while recording or editing a транзакція by hand. It changes
  no total and no баланс, and it survives every edit and retype, so a витрата retyped into a
  переказ still says where it came from. It decides two things. The first is the продавець the
  транзакція has: what the опис is recognised as (see «Продавці»), read from it whenever it is read.
  The second is a витрата's own категорія: the owner's правила read it, at recording exactly as at
  import, so typing «АТБ» proposes Groceries before «Записати» is pressed — a proposal, never an
  override, since a категорія the owner picked themselves always stands. Manual entry does ask for
  one. The ознака of a зобов'язання reads it too, to recognise a списання — and so, through the
  link, a «Без категорії» витрата may take the зобов'язання's категорія. It is the bank's words
  about the owner, or the owner's own, which is why it leaves the phone only under «Продавці» (see
  AI).
- **MCC** (merchant category code) — the whole number a bank names for an imported транзакція: a
  monobank statement item carries one. Kept on the транзакція, informational like the опис — no
  total, balance or type reads it — and matched by the правила and the шаблон, at import and in the
  розбір of stored history alike. The owner never types one; a транзакція recorded by hand, by
  Saldo or from a чернетка carries none, and it never recognises a продавець.
- **Uncategorised** (без категорії) — an imported transaction no rule matched. Still an
  expense, still counted as spent, highlighted for one-tap categorisation.
- **Unsourced** (без джерела) — the income half of "uncategorised": the джерело an imported
  arrival carries while the bank has said only that money came in. A visible starting state, never
  a verdict and never a classification of a refund — the owner retypes it into what it was.
- **Counterpart income** (зустрічний дохід) — the дохід «Без джерела» the *destination* рахунок of
  a переказ reports for the same movement the source рахунок already reports as that переказ: same
  рахунок, same arrived сума and currency, dated within one calendar day, carrying no фіскальний
  чек and no джерело the owner chose. A переказ made by a правило-переказ or by retyping absorbs it
  instead of leaving it beside the переказ — the money would otherwise be counted twice, once as
  the переказ and once as income. If none is stored yet, the переказ **awaits** its зустрічний
  дохід and absorbs the first monobank statement item that qualifies once it arrives; a переказ
  absorbs at most one, and once it has, it awaits nothing more.
- **Draft** (чернетка) — a транзакція an import proposes and the owner has not yet said a word
  about: it sits on a рахунок with a date, the text the bank sent, and a proposed amount, and it
  moves no money — no розрахунковий баланс and no monthly number reads it. Confirming it creates
  the транзакція it proposed; dismissing it creates nothing and it never returns.
- **Watched app** (відстежуваний застосунок) — a phone app whose push notifications the owner has
  opted this app into reading, mapped to exactly one рахунок. Only a watched app's notifications
  are read at all, and what is read never leaves the phone. The monobank app is never watched: of
  its notifications only the moment is noted, as a поштовх.

## Categories and sources

- **Category** (категорія) — a label on an expense from the owner's own flat list. No hierarchy,
  no tags in v1.
- **Category icon** (іконка категорії) — a picture from the app's fixed catalogue by which a
  category is recognised; it never replaces the category's name and counts toward no total,
  limit, goal, report or analysis package. The three reserved categories have fixed pictures;
  every other category starts with one from the starter set or its name and keeps it until the
  owner picks another. Sources carry none. A transaction line also leads with the app-fixed
  picture of its kind — «Переказ», «Дохід» or «Плюс-мінус» — which is not a category icon and is
  not owner-chosen.
- **Source** (джерело доходу) — the label on an income: salary, freelance, parents, gift,
  investments, interest, …
- **Starter set** **[PROPOSED]** — the owner's Saldo categories and sources, flattened.
- **Rule** (правило) — "merchant / MCC X → category Y", or "merchant / MCC X → переказ на рахунок
  Z" (see Transfer rule), editable by the owner. Its merchant criterion is a pattern — a piece of
  the опис — or a продавець, never both: «АТБ → Продукти» naming the продавець covers every
  spelling it is recognised by, and ranks as long as the написання that recognised the опис.
  Applied wherever a категорія is decided — the three import sources and manual entry alike —
  never only to imports; a правило-переказ applies only where a рахунок the money left is known,
  so manual entry and a чернетка's категорія never see one. A правило *matches* a транзакція; a
  продавець *recognises* an опис — the two words are kept apart.
- **Transfer rule** (правило-переказ) — a правило whose target is a destination рахунок instead of
  a category: money leaving a linked рахунок that this правило matches is a переказ to that
  destination, not a витрата. Ranked on the same ladder as every other правило, so the most
  specific one wins whichever kind it is. Takes no part in matching money leaving its own
  destination, money in another currency than its destination, or a категорія being decided by
  hand or from a chernetka — there it is simply not a категорія.
- **Sweep** (розбір) — what storing a правило, newly created or edited, does about history — and
  so does pointing a базова категорія elsewhere or switching it off, every change to the продавці
  but a rename (naming one, adding or removing a написання, merging, deleting), and the first open
  under a шаблон категоризації version not yet swept: every stored витрата sitting in «Без
  категорії» that the two tiers now match — on its опис and on the MCC it carries, when it carries
  one — moves onto what they give it, the правила first, the шаблон where none of them answers, at
  once and without asking — a категорія, or a переказ when the best правило is a правило-переказ.
  It only ever fills the gap — a категорія the owner chose, or an earlier правило gave, is never
  revisited.
- **Rule template** (шаблон категоризації) — the built-in knowledge that «АТБ» is продукти and MCC
  5411 is продукти, shipped with the app as data and updated with it: a fixed set of базові
  категорії, each holding merchant patterns, MCC codes or both. It is the second tier of
  автокатегоризація — consulted only when none of the owner's правила matches, so a правило of the
  owner's own always wins. Its merchant patterns are fragments («ярня», «kava») matched anywhere
  in the опис, still inside words — unlike a правило's pattern or a написання, which match only
  where a word begins. Never stored and never carried in a бекап; only the owner's mapping of it
  is.
- **Base category** (базова категорія) — one group of the шаблон категоризації («Продукти»,
  «Транспорт», «Здоровʼя», …). Not a категорія of the device and not a parent of one: it points at
  exactly one категорія of this device — its типова категорія unless the owner chose another — or,
  switched off, at nothing. Managed in Налаштування → «Базові категорії»; what it covers is shown
  there and is not editable.
- **Default category** (типова категорія) — the starter категорія a базова категорія lands in until
  the owner points it elsewhere, named by the starter row's stable id so a rename does not move it.
  A типова категорія this device does not hold makes its базова категорія match nothing.
- **Limit** (ліміт) — an optional monthly ceiling on a category: at most one per category, a сума
  with a currency code. A category is **over its ліміт** for a month when that month's spent of it
  **in the ліміт's own currency** — the net-of-повернення amount the monthly-picture breakdown
  holds — is strictly greater than the ліміт; equality is not over, and spending in any other
  currency neither counts toward it nor is converted toward it. Exceeding it marks the category
  red in the monthly picture and in the transaction list. Nothing is blocked, nothing is pushed.
  A ліміт **is** that категорія's ціль витрат — one сума under two names, set, changed and cleared
  from either place, so no second ceiling exists that could disagree with it.
- **Goal** (ціль) — something the owner is aiming at, of exactly one of two kinds: a
  ціль-накопичення or a ціль витрат. The kind is chosen when the ціль is created and never changes
  afterwards — the two hold different fields and mean opposite things, so they never wear each
  other's words: nothing calls a ціль витрат досягнута, and nothing calls a ціль-накопичення
  перевищена.
- **Accumulation goal** (ціль-накопичення) — «накопичити N»: a назва, a target сума in the ціль's
  own currency, **optionally** a дата, and a склад. It is **reached** (досягнута) when its прогрес
  is at or above its target, and **overdue** (прострочена) when it has a дата, that дата has passed
  and it is not reached. A reached ціль is never overdue, a ціль without a дата is never overdue,
  and a ціль whose прогрес cannot be counted is neither — an unknown прогрес is not a verdict.
- **Spending goal** (ціль витрат) — «витратити не більше N цього місяця» on one категорія. It **is**
  that категорія's ліміт read as a ціль: the same сума, the same currency, the same calendar month
  and the same arithmetic, and it holds no сума, currency, назва or period of its own — its назва is
  its категорія's. Its states are **в межах**, **перевищено** and, once a month has ended at or
  below the ceiling, **завершено в межах**; it is never досягнута and never прострочена.
- **Goal composition** (склад цілі) — the рахунки whose money counts toward a ціль-накопичення: a
  stored set of рахунок ids, one or more, each standing in it at most once. It is what the owner
  ticked and not a live query by вид рахунку — a рахунок created later does not join a ціль, and
  archiving one does not take it out. A рахунок of any вид may stand in a склад, борг included.
- **Account contribution** (внесок рахунку) — what one рахунок of a склад brings to a ціль: that
  рахунок's розрахунковий баланс in its own currency — except for an інвестиційний рахунок, whose
  внесок is its поточна вартість where the app holds one, and its розрахунковий баланс otherwise. A
  негативний внесок is subtracted like any other. No внесок is ever entered by hand.
- **Goal progress** (прогрес цілі) — the sum of the внески of a ціль-накопичення's склад, expressed
  in the ціль's own currency and read at the moment the ціль is shown — never a second number
  entered by hand, which could drift from the stored truth, so money reaches a ціль only the way
  money reaches its рахунки. A ціль's currency is its own: UAH, the only currency the app can
  convert into, or the single currency every рахунок of its склад shares.
- **Approximate progress** (приблизний прогрес) — a прогрес цілі any внесок of which had to be
  converted into the ціль's currency at monobank's current rate, each внесок converted and rounded
  on its own before the sum. It is marked «≈» wherever it, its percentage or what is left of it is
  shown, and nothing converted is stored anywhere. Where a rate it needs is unknown the прогрес is
  **absent** — no total, no percentage and no verdict — and the currency that cannot be converted
  is named: a missing rate is never counted as zero.

## Продавці

Owner's decision, 2026-10-02 (vision §7 «Продавці»). Lines marked **[PROPOSED]** are defaults the
owner may overturn.

- **Продавець** (merchant; code `Merchant`) — the owner's one name for whoever was paid — «АТБ» —
  behind every way a bank spells it. A **назва**, unique once letter case and surrounding spaces
  are folded, and one or more написання. Never stored on a транзакція: a транзакція's продавець is
  what its опис is recognised as, read whenever it is read **[PROPOSED]**, so a new написання
  re-reads the whole history at once. It changes no сума, баланс, monthly number, ліміт or ціль,
  and puts no витрата in any категорія on its own — only a правило naming it does. Until 2026-10-02
  the word meant the folded опис the пакет grouped by; it is now this entity.
- **Написання** (spelling; code `MerchantSpelling`) — one text a продавець is **recognised** by in
  an опис: stored trimmed and folded to lower case, held by exactly one продавець. An опис is
  recognised as the продавець holding the longest написання that occurs in it where a word begins
  — at the start of the опис or right after a character that is neither a letter nor a digit, so
  «коло» recognises «Коло 12» and «WFP*Коло» but not «Навколо»; a написання that itself starts
  with such a character («*megogo», «-маркет») is recognised wherever it occurs. Case folded and
  nothing else — no transliteration, so a продавець the bank spells in both scripts carries both;
  of two of equal length the newest decides **[PROPOSED]**. An опис nothing occurs in is
  recognised as no продавець.
- **Без продавця** (nameless) — the first part of Налаштування → «Продавці»: the stored витрати and
  повернення whose опис no продавець recognises, grouped by the написання the proposal gives that
  опис («АТБ-Маркет 1234» and «АТБ-Маркет 5678» are one row for «атб»), the largest groups first,
  twenty of them, each with «Назвати». A дохід, a переказ and a коригування are not listed, nor
  is a payment to a person or a банка — an опис whose folded text begins with «від:», «переказ на
  картку», «переказ з картки» or «поповнення «» — which can still be named from its own editing.
- **Назвати** (name) — making an опис recognised: a new продавець with a назва and one написання,
  or one написання added to a продавець that exists. The написання must occur in that опис. The
  form proposes the назва and the написання **[PROPOSED]**: the bank's leading service words
  skipped, in Cyrillic, English or Latin transliteration («Оплата послуг», «PAYMENT», «Oplata
  poslug», «Pokupka»), then a payment processor's prefix («LIQPAY*», «WFP*», «GOOGLE *», «SUMUP*»
  and the like), the leading name of at most two words kept, an all-capitals word longer than
  three letters written as a name («СІЛЬПО» → «Сільпо», «АТБ» stays). The proposed написання
  always begins where a word begins in that опис.
- **«Продавці»** names two things: the AI-аналіз choice that lets описи — and the назви the owner
  gave their продавці — into a пакет, and the Налаштування section where продавці are named and
  managed. Which one is meant is always clear from where it is read.

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
- **Gain / loss** (прибуток / збиток) — for an інвестиційний рахунок: its поточна вартість minus
  its вкладено, in that рахунок's own currency. A рахунок with no поточна вартість has no
  прибуток / збиток at all — вкладено alone is what is known about it — and equal amounts are a
  прибуток of zero, which is a different answer from having none. It is **not** a monthly number:
  it is neither дохід nor інвестовано, it reaches залишилось nowhere, and it is listed here beside
  them only so it is never mistaken for one of them.

## Розстрочки

Owner's decision, 2026-10-01 (vision §4 «Розстрочки»).

- **Розстрочка** (installment plan; code `installment`) — an interest-free purchase the owner pays
  for in monthly платежі, such as monobank «Покупка частинами». A **plan** the owner enters by
  hand: назва (what was bought), повна сума, кількість платежів (2–60), щомісячний платіж, дата
  першого платежу, рахунок списання, сплачено раніше and optionally a категорія. In UAH. It is not
  a транзакція and not a рахунок: its повна сума is counted nowhere, because the bank never debits
  it — it debits the платежі.
- **Платіж** (code `InstallmentPart` — a part, as monobank says «частинами»; never `Payment`, which
  would read as a synonym of транзакція) — one scheduled monthly debit of a розстрочка: a number, a дата and a сума.
  Every платіж but the last is the щомісячний платіж; the last is the повна сума minus the others,
  so they add up exactly. The щомісячний платіж is offered as повна сума ÷ кількість rounded down.
  A зобов'язання has платежі too (code `CommitmentDue`, see «Зобов'язання»): the word means one
  scheduled debit of either plan, and nothing else.
- **Графік** (schedule) — the платежі of a plan: for a розстрочка one a month on the day of the
  first, for a зобов'язання one every period of its періодичність on that day — in either case on
  the month's last day where that day does not exist. Derived, never entered платіж by платіж.
- **Рахунок списання** (debit account) — the рахунок the платежі are debited from: a UAH рахунок
  for a розстрочка, a рахунок of any currency for a зобов'язання.
- **Списання** (debit) — the витрата a платіж is linked to: the bank's debit, arrived by monobank,
  a notification or by hand. The app links a витрата on the рахунок списання within three days of
  the платіж's дата: for a розстрочка a UAH витрата of exactly the платіж's сума; for a зобов'язання
  a витрата in its currency of exactly its сума, or — when it has an ознака — one whose опис contains
  the ознака, whatever the сума. The owner can unlink (remembered), pick one by hand within ten days,
  or mark a платіж paid without one. Linking never creates or moves money; it only gives a «Без
  категорії» витрата the plan's категорія. One транзакція is the списання of one платіж at most,
  whichever plan the платіж belongs to; of the витрати not yet linked, one that could be either is
  the розстрочка's, and one already linked stays where it is.
- **Сплачено раніше** (paid before) — how many of the first платежі were already paid when the
  розстрочка was recorded; they need no списання.
- **Стан платежу** (payment state) — exactly one of: **сплачено** (linked, paid before or marked),
  **закрито** (the розстрочка was closed early), **очікується** (no later than three days after its
  дата), **списання не знайдено** (more than three days after it, with nothing linked).
- **Залишок розстрочки** (remaining) — повна сума minus the scheduled сума of every сплачено
  платіж, and 0 once the розстрочка is closed early. A розстрочка with all платежі сплачено is
  **сплачена**.
- **Закрити достроково** (close early) — the owner's word that a розстрочка is paid off: its
  unpaid платежі become закрито and are no longer expected, counted or reminded of.
- Their платежі that are still owed this month are counted in **«Вільно після зобов'язань»** (see
  «Зобов'язання»), which replaced «Вільно після розстрочок» on 2026-10-02.
- **Нагадування про платіж** (payment reminder) — one local notification at 10:00 the day before a
  дата with an очікується платіж of a розстрочка (never of a зобов'язання), one per дата, with a fixed text naming no сума and no назва.
  Behind one switch, on until the owner turns it off.

## Зобов'язання

Owner's decision, 2026-10-02 (vision §4 «Зобов'язання», §8). Lines marked **[PROPOSED]** are
defaults the owner may overturn.

- **Зобов'язання** (commitment; code `Commitment`) — a payment the owner already knows will recur:
  оренда, інтернет, мобільний, підписка, страхування. A **plan** the owner enters by hand: назва,
  сума of one платіж, періодичність, дата першого платежу, рахунок списання, and optionally a
  категорія and an ознака. It runs until the owner stops it. It is not a транзакція and not a
  рахунок: it records, moves and counts no money by itself, and a платіж never debited counts
  nowhere. **[PROPOSED]** Its сума is in the currency of its рахунок списання, any currency, never
  converted.
- **Періодичність** (how often) **[PROPOSED]** — one of **щомісяця**, **щокварталу**, **щопівроку**,
  **щороку**: a платіж every 1, 3, 6 or 12 months on the day of the first, on the month's last day
  where that day does not exist — the розстрочка's графік rule. The графік has no end until the
  зобов'язання is stopped.
- **Ознака** (marker; UI «Текст в описі списання») **[PROPOSED]** — a piece of the bank's опис, at
  least three characters, that recognises the списання of a зобов'язання whatever its сума. Without
  an ознака only a витрата of exactly the сума is recognised; with one, only a витрата whose опис
  contains it, letters compared without regard to case. It exists for bills that vary and for
  підписки charged in hryvnia at a moving rate.
- **Стан платежу зобов'язання** — exactly one of: **сплачено** (linked, or marked by the owner),
  **пропущено**, **очікується** (no later than three days after its дата), **списання не знайдено**
  (more than three days after it, nothing linked). There is no закрито: a stopped зобов'язання
  simply has no платежі after its дата припинення.
- **Пропущено** (skipped) **[PROPOSED]** — the owner's word that a платіж of a зобов'язання did not
  and will not happen: a paused підписка, a waived оренда. Neither expected, nor owed, nor linked.
- **Припинити** (stop) — the owner's word that a зобов'язання has ended: its **дата припинення** is
  today, and every платіж after it ceases to exist. **Відновити** removes the дата again.
- **Оновити суму** (update the сума) **[PROPOSED]** — offered when the latest linked списання of a
  зобов'язання differs from its сума; sets the сума to the debited one, for every платіж not yet
  сплачено. Never done without the owner.
- **Вільно після зобов'язань** (free after commitments) — for the current month only, separately
  per currency: залишилось minus the сума of this month's платежі that are очікується or списання не
  знайдено, of every зобов'язання and every розстрочка alike. A розстрочка is not a зобов'язання,
  but its платежі are as promised as any, so the reading counts them too. A secondary reading
  beneath залишилось; it changes no number of the monthly picture and is not a forecast.
- **Платежі місяця** (the month's платежі) — the Місяць block listing the платежі of розстрочки and
  зобов'язання dated in the shown month, закрито ones left out; it totals their scheduled сума per
  currency, пропущено ones left out of the totals, and says how much is still not сплачено.

## Net worth

- **Статок** (net worth) — the sum, separately per currency, of every recorded рахунок's
  розрахунковий баланс — archived and рахунок-борг included, each with its signed effect — except
  that an інвестиційний рахунок contributes its latest поточна вартість where the owner has entered
  one, and its вкладено otherwise, never both. It stores no second баланс, moves no money, and
  changes no транзакція, місячна картина, ліміт, ціль or досягнення: it is read at the moment it is
  shown, never entered or kept.
- **Приблизний статок** (approximate net worth) — a secondary «≈» UAH total converting every
  non-UAH currency's статок at monobank's most recently cached rate. It appears only when every
  participating currency has one — a single missing rate withholds the whole conversion and names
  the currency that is missing — and never stands in place of the exact per-currency readings.
  Along the history it is also drawn as «Усе ≈ грн»: each dated per-currency баланс converted at
  that same current rate and summed, marked «≈», present only where every currency held (archived
  included) is known and every non-UAH currency has a rate — never a partial sum. A currency first
  held later contributes nothing before its рахунки enter, so it never shortens the whole.
- **Історія статку** (net worth history) — per-currency розрахункові баланси reconstructed from
  opening balances and dated транзакція effects alone, at the first date, month-ends and today.
  Each рахунок enters it at its дата початкового залишку, or at its first транзакція when that is
  earlier, or today when it has neither: before that it contributes nothing, from then its
  початковий залишок plus its транзакції. An entry is a step marked «нові рахунки», never growth,
  and a later рахунок never hides the history before it — only a sum too large to represent
  exactly leaves a point without a value. It never treats an інвестиційний рахунок's поточна
  вартість, a баланс банку, свідчення досягнення or today's курс as a past market value — an
  інвестиційний рахунок's history is always its вкладено, named as such, whatever its current
  reading uses. A транзакція dated after today is disclosed rather than folded into the curve. The
  one place today's курс touches it is the separately marked «Усе ≈ грн» approximation (see
  Приблизний статок), which converts these unchanged balances, alters none of them, and is the
  default reading whenever more than one currency is held and every rate is cached.
- **Зміна статку** (net worth change) — today's point of Історія статку against the preceding
  calendar month-end's, in the same currency and on the same recorded-balance basis, leaving out
  the початкові залишки of рахунки that entered between them («нові рахунки», stated beside it).
  An entered поточна вартість never enters or withholds it; how far поточна вартість differs from
  вкладено is read on its own line. A percentage appears only over a strictly positive month-end.
  On «Усе ≈ грн» it compares the two «≈» points at the same current rates.
- **Розбивка зміни статку** (change breakdown) — a month's зміна per currency, read as parts that
  add up to it exactly: дохід; витрати net of повернення; коригування; **перекази й обмін** — the
  net of every переказ leg in that currency, zero for a переказ between two рахунки of one currency
  and non-zero only for an exchange between currencies or legs of unequal amounts; and **нові
  рахунки** — the початкові залишки of рахунки entering that month, which the зміна leaves out.
  «Витрати» here is not Місяць's витрачено: коригування stay their own line. On «Усе ≈ грн» each
  part is converted at the current rate, the rounding difference carried by перекази й обмін.
- **Прогноз статку** (net worth forecast) — an opt-in continuation of Історія статку on the
  «Статок» screen only, for the end of the current month and the five after it: from today's point
  at the **темп** — the median зміна of the last six complete months — with a range from the
  spread of the last twelve. Always marked «≈ якщо темп збережеться», withheld with fewer than six
  complete months, computed when shown, stored nowhere, and never feeding Статок, a ціль, a
  досягнення or any other number. It is not a promise and not a plan.

## Progress

- **Achievement** (досягнення) — постійний факт про результат, якого власник уже досяг: віха
  обліку (стільки-то транзакцій, стільки-то активних місяців), якість запису (чистий місяць), або
  гроші, що дійшли до значущої позначки (ціль досягнута, резерв дорівнює місячній нормі витрат).
  Досягнення описує минуле, тому його **не забирають**: пізніше редагування історії його не
  скасовує. Кожне отримується щонайбільше один раз.
- **Evidence** (свідчення) — число, яким досягнення пояснює себе в мить отримання: скільки
  транзакцій, які місяці, яка сума з якою валютою. Це заморожене «як було тоді», а не баланс:
  жодна сума, жодна місячна картина, жоден ліміт чи ціль з нього не рахуються.
- **Challenge** (виклик) — одна річ, яку варто зробити зараз: причина, з якої його запропоновано,
  вимірюваний прогрес, однозначний критерій завершення й одна дія, з якої почати. Одночасно стоять
  щонайбільше три. Виклик можна прийняти або відхилити, а відхилений — повернути; відмова не
  коштує нічого й ніде не рахується.
- **Active month** (активний місяць) — календарний місяць, у якому є щонайменше одна транзакція.
  Імпортована транзакція робить місяць активним так само, як записана рукою: активність — це про
  дані, а не про те, чи власник відкривав застосунок.
- **Completed month** (завершений місяць) — активний місяць, останній день якого вже минув.
- **Clean month** (чистий місяць) — завершений активний місяць, у якому жодна витрата не має «Без
  категорії» і жоден дохід — «Без джерела». Повернення тут рахують за витрату: це від'ємна витрата
  в тій самій категорії, і «Без категорії» на ній лишає те саме питання відкритим.
- **Monthly spending norm** (місячна норма витрат) — сума на місяць, яку **власник підтвердив** як
  міру «одного місяця витрат», окремо для кожної валюти. Застосунок пропонує медіану «витрачено»
  за останні шість завершених активних місяців тієї валюти й показує, які саме це місяці; поки
  власник не підтвердив число, норми немає. Застосунок ніколи не вгадує «базові витрати» за
  назвами категорій.
- **Reserve** (резерв) — сума розрахункових балансів рахунків виду `savings` в одній валюті.
  Ніколи не змішує валюти й ніщо в ньому не конвертується.

## Спостереження і підсумок місяця

Owner's decision, 2026-10-02 (vision §19). Lines marked **[PROPOSED]** are defaults the owner may
overturn.

- **Спостереження** (observation; code `Observation`) — a fact the app finds in the owner's own
  транзакції of one month by a fixed, deterministic detector and states in one sentence with its
  numbers. Computed when shown, stored nowhere, never dismissed; it changes no number, is never
  advice, praise, blame or a forecast, and is never a language model's words. It exists for the
  current month and for a завершений активний місяць, and leads to the records it is about.
- **Типова сума** (typical amount) — the median, in one currency, of up to six завершені активні
  місяці of that currency before a month, never fewer than three **[PROPOSED]**: of a категорія's
  витрачено (net of повернення, a month without it counting as zero), or of the whole витрачено.
  Fewer than three such months, or a typical витрачено that is not positive, and there is none.
  It is read from the history, never confirmed by the owner, and feeds no other number.
- **Поріг помітності** (noticeable threshold) **[PROPOSED]** — 3 % of a currency's типова сума of
  витрачено: a difference smaller than it is not stated, however large its percentage.
- **Можливий дубль** (possible duplicate) — two витрати on one рахунок with the same сума, dated at
  most a day apart, whose описи are not the same bank text — a purchase that may have arrived
  through two doors (the bank and the owner's hand), or the same витрата written twice by hand.
  Equal описи count as bank text only when a bank is behind them: either of the two carries an MCC,
  or the рахунок is linked to monobank; equal описи without either are a можливий дубль too. Never
  a переказ, a дохід, a повернення, a коригування or a «Комісія». The app asks and does not guess:
  **«Не дубль»** is the owner's answer, remembered for that unordered pair, carried in the бекап,
  undoable with «Скасувати» while the screen still shows it was given, and gone when either
  транзакція is deleted. A real дубль is deleted like any транзакція — from its editing, or with
  **«Видалити одну»** on the спостереження, which asks which of the two and confirms.
- **Підсумок місяця** (month summary) — one finished month read as a whole on its own screen,
  per currency: витрачено against the month before and the типова сума, the категорії that changed
  most, the місячна картина, the зміна статку with its розбивка, what moved toward each ціль and
  which ліміти held, what is still unanswered, the коригування with their частка, and the month's
  спостереження. Every завершений активний місяць has one; the current month does not. Computed
  when shown, stored nowhere.
- **Частка коригувань** (corrections share) **[PROPOSED]** — the sum of a month's коригування taken
  by their absolute сум, divided by that month's витрачено in the same currency, to one decimal
  place rounded toward zero. Vision §15's measure of a trusted month is below 2 %.

## Keeping the data

- **Backup** (бекап) — one file holding everything the owner has: every рахунок with its opening
  balance, every категорія, джерело, правило, ліміт and ціль, every транзакція, what the app has
  already imported, and every фіскальний чек with its позиції and the source document the tax
  service served — so a restored phone shows a чек without asking the tax service again. It also
  holds every розстрочка and every зобов'язання with the states of their платежі — the owner's word
  about money no statement shows in advance — and the прогрес the owner has built up: кожне отримане досягнення зі своєю датою й свідченням,
  кожне рішення про виклик і кожна підтверджена місячна норма витрат — жодне з них не рахується з
  транзакцій, тож без них відновлений телефон виглядав би так, ніби нічого не досягнуто. It holds
  the owner's «Не дубль» answers too, and no спостереження: those are recomputed when shown. It never
  holds the monobank token, the чернетки awaiting a word, or the text of the notifications behind
  them. The file the owner saves by hand is not encrypted: whoever holds it can read the money in
  it. The copy that goes to Google Drive is a different matter — it is sealed under the owner's own
  key before it leaves the phone, and only the код відновлення opens it elsewhere.
- **Restore** (відновлення) — putting a бекап back. It **replaces** everything now on the phone —
  it never merges, and there is no undo — so the app shows what the бекап holds beside what is on
  the phone, and asks, before anything changes. It either lands whole or does not happen.
- **Версія бекапу** (backup version) — one бекап as it sits in the owner's Google Drive: sealed,
  named by the moment it was made, and carrying which key it was sealed under. The app keeps
  several of the most recent ones and never removes one while it holds no newer complete one, so a
  бекап written from data that had already gone wrong is not the only thing left to go back to.
- **Код відновлення** (recovery code) — the key that seals the версії бекапу, written so a person
  can copy it onto paper: eight groups of seven characters, with check characters that catch a
  mistyped one before anything is opened. It is made when Google Drive is first connected, shown
  once with the owner asked to confirm they have kept it, and shown again on request while
  connected. It lives in the phone's secure storage and nowhere else — never among the owner's
  financial data, never in a бекап, never uploaded — so a phone lost together with the код
  відновлення loses the копії with it. A new phone that has it joins the same line of версії;
  a new phone without it can start a fresh line, and the копії already there are left alone rather
  than deleted.

## The monobank sync

- **Прогін** (run) — one sweep of the linked рахунки: one statement request per рахунок, paced to
  the bank's one statement request a minute. It reads the balances first — a client-info request,
  which the bank limits apart from the statement — unless this phone stored an answer inside the
  межа свіжості; the balances are what tell it which рахунки are позачергові. A прогін the owner
  asked for — «Синхронізувати», the жест or «Оновити» on Головний — always asks the bank, because
  all three are the owner saying «now», and makes every рахунок позачерговий. Only one прогін
  exists on the phone at a time; anything that would start a second waits for the one going on and
  reports what *it* came to. A прогін commits each page as it reads it, so a прогін that stops
  early loses nothing and leaves the next one both a cursor and, for a рахунок stopped in the
  middle of a вікно, the place гортання reached — see позиція гортання.
- **Хід** (turn) — one request sent about one рахунок, whatever the answer. What the order of a
  прогін is rationed by: позачергові рахунки without a хід since first, then прострочені, then the
  rest, and in each group the рахунок that has waited longest since its хід goes first — so a
  прогін cut short over and over still reaches every рахунок instead of looping on the first few.
  A хід the run never spent a request on is not a хід.
- **Позачерговий рахунок** (owed; code `owedSince`, `oweAll`) — a linked рахунок the app knows the
  bank holds something about that it has not read yet: its баланс банку moved in a stored
  client-info answer, it was just linked, or the owner asked for a sync. It goes before every other
  рахунок until its next хід, and a прогін that leaves one unread off screen asks for a
  дочитування. A completed синхронізація up to that moment clears it; an unchanged balance never
  makes a рахунок current by itself.
- **Прострочений рахунок** (overdue) — a linked рахунок that has had no хід for three hours (or
  never). It goes before every рахунок that is merely waiting, which is what keeps a busy card from
  taking every chance while the others wait for good.
- **Відкладений рахунок** (set aside; code `not-shown`) — a linked рахунок the token no longer
  shows (a closed or reissued card). No request is sent about it and nothing of its history is
  touched; it is said plainly on its row, and it decides neither how a прогін is remembered nor how
  fresh the bank reads. Not «відкладено» of a банка, which is money put aside.
- **Межа свіжості** (staleness bound) — the minute a client-info answer this phone stored goes on
  serving a прогін nobody asked for. Inside it such a прогін sends no client-info request; outside
  it the прогін reads the balances first. A прогін imports nothing later than the answer it used,
  so the баланс банку a рахунок carries and the транзакції committed beside it describe the same
  instant and «Звірити» stays meaningful.
- **Тихий інтервал** (quiet interval) — the quarter of an hour a прогін nobody asked for waits
  after the last one. It governs only the runs the owner did not ask for: «Синхронізувати» ignores
  it, and so does a прогін that was перенесено, one a поштовх makes due, and a chance or
  дочитування while a рахунок is позачерговий or прострочений.
- **Фоновий прогін** (background run) — a прогін started on a chance the phone gives while the app
  is not in front of the owner, or by a дочитування. The same прогін under the same rules, with one
  difference: it never waits. It sends what the bank's minute already allows — the balances and
  about one statement request — and ends; what continues it is the phone: its own periodic chances,
  about a quarter of an hour apart, or a дочитування the app asked for. The app asks for chances
  only while a рахунок is linked, claims no cadence, and a фоновий прогін announces nothing unless
  monobank needs the owner.
- **Дочитування** (continuation; code `continueLater`, `SyncContinuationWork`) — a one-off chance
  the app asks the phone for, as soon as the bank's minute allows, when a прогін ended off screen
  with a позачерговий or прострочений рахунок перенесено. Each дочитування runs one фоновий прогін
  and asks for the next by the same rule, so the rest is read about one a minute; each рахунок keeps
  a chain going for one хід at most, so it always ends. At most one is pending at a time.
- **Поштовх** (nudge) — a notification the monobank app posted, taken only as a sign that something
  moved: its moment is noted and a дочитування is asked for a little over a minute later. Only the
  posting app, the moment and the notification's flags are looked at; its title and text are never
  read or kept, and the monobank app stays never watched.
- **Поступитися** (yield) — what a прогін in front of the owner does when the app leaves the
  foreground: it stops before its next request and lets the background have the phone. Not
  «передати», which the глосарій gives to handing a file to another app.
- **Позиція гортання** (paging position) — where a рахунок's half-read вікно got to, stored beside
  its cursor: the end of the вікно being paged and the end the next request should ask for. A
  вікно that answers with a full page is asked again, narrowed backwards, until an answer comes
  back short, and the cursor cannot move while that goes on — so without this the place lived in
  the прогін's own memory and died with it, and a рахунок needing more pages than one прогін can
  afford could never finish at all. It is this phone's own progress, so it is not in a бекап, and a
  position whose вікно ends at or before the cursor is discarded rather than trusted.
- **Перенесено** (postponed) — how a рахунок ends that a прогін stopped before finishing: for want
  of the minute still owed to the bank, of time, or of foreground. The ordinary outcome of a
  healthy phone, not an exceptional one — a фоновий прогін stops at the first request it may not
  yet send, so there is nearly always more it owes. Neither a failure of the bank nor a decision of the owner: whatever the
  прогін committed stays committed, the last-sync moment does not move, and the next прогін
  continues from the cursor and from the позиція гортання, so перенесено on a рахунок mid-вікно is
  progress and not repetition. Not «відкладено», which in this app is money put into a банка.
- **Скасовано** (cancelled) — how a рахунок ends that the owner stopped the прогін before. Told
  apart from перенесено everywhere an outcome is reported, because one is their decision and the
  other is the app running out of time.

## The fiscal receipt

- **Фіскальний чек** (fiscal receipt) — what the seller's registrar registered with the tax
  service for one purchase: the позиції bought, their prices, the total, the seller and the moment.
  The app fetches it by the реквізити a QR code carries — printed on a paper чек, or in a photo or
  file already on the phone for an electronic one — and keeps it as detail **beneath** a
  транзакція. It moves no money: no розрахунковий баланс, no number of the місячна картина, no
  ліміт, ціль or звіт changes because a чек was attached.
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
  a bank sent. Описи — grouped under the назви the owner gave their продавці, with those назви —
  and individual транзакції are in it only by the owner's explicit choice for that one run; a
  написання and a продавець's id never are.
- **Файл для аналізу** (analysis file) — the пакет rendered as one self-contained text, in five
  sections and in this order: the запит, the instructions to the assistant, the context that
  defines the terms, a readable summary and the пакет itself. It is what an assistant answers from
  with nothing added by the owner.
- **Запит** (request) — the opening section of a файл для аналізу: what the файл is, and the ask to
  analyse it, in the owner's own language. It names the kind of AI-аналіз and the period, says that
  the instructions, the definitions and the data are further down in the same файл, and introduces
  no number of its own — every сума, share and count in the файл is in the summary or the data.
- **Короткий запит** (short request) — the one or two sentences offered to the phone beside the
  файл при передачі, and copyable on their own. It asks for the attached файл to be analysed and
  says the файл itself holds the full context and the instructions; it holds no number, no
  категорія and no rule the файл does not. Whether it is carried at all is the platform's matter,
  and nothing depends on it: the файл для аналізу is what an assistant answers from.
- **Передати** (hand over) — giving one file the app made — a файл для аналізу, a репорт про
  помилку — to an app the owner picks in the phone's own chooser; on the AI-аналіз screen the
  action reads «Поділитися з AI». It is the owner's act, not a connection the app makes: the app
  names no recipient, opens no app of its own, and never learns what the chosen app did with the
  file — so whatever is handed over, it says only that the file was handed to the system.
- **Merchant row of a пакет** — under «Продавці», one продавець (see «Продавці») by its назва,
  whatever spelling the bank used, or — where an опис is recognised as none — that опис, folded and
  trimmed, per currency. An опис that a confirmed чернетка left on its транзакція is an опис like
  any other — the bank's own text — and leaves the phone only under «Продавці», the switch that
  lets описи into a пакет at all.
- **Тренди** (trends) — the month-over-month figures of a пакет: the changes of the six numbers,
  the averages before the period, the largest категорії and their changes, the notable витрати and
  the recurring candidates. Every one of them is computed by the app, deterministically, before
  any assistant sees the пакет — never by the assistant.

## Keeping the app honest

- **Журнал** (journal) — the app's own bounded record of what it has been doing lately, kept on
  the phone for one purpose: so a bug met on the phone can be reproduced at the laptop. It holds
  an entry per moment for every screen opened (by its route), every action that failed with the
  exact text the owner was shown, every сповіщення про збій raised or cleared, every crash with
  its message and stack, every request that left the phone, every operation the app performed, and
  what the device did to it. An entry may additionally carry the mark tying it to one operation,
  how long the thing it names took, and the counts that thing measured; every count is a number,
  so no text of the owner's can enter one. It keeps the most recent 2000 entries and drops the
  oldest beyond that. It never holds a сума, a назва, an опис, the text of a bank's сповіщення or
  the monobank token — an action is named by its kind, a screen by its route, a failure by the
  app's own words, and a request by its method, its host and the shape of its path. It carries one
  identifier of the owner's beside the app's own refusal text and nothing more: the monobank
  account a request or an operation was about, which is the only thing that answers «which card is
  not syncing». Where the app's own refusal quotes what the owner typed into the refused field,
  the quote lives in that one entry and nowhere else. It leaves the phone only inside a репорт про
  помилку the owner hands over, and it is never in a бекап.
- **Репорт про помилку** (bug report) — what the owner wrote down after something went wrong —
  what they did (required), what happened, what they expected — together with what the app
  attaches by itself at that moment: its version and build, the platform, the device, the number
  of migrations applied, the route of the screen it was filed from, the moment, the whole журнал,
  the failure or crash that prompted it, **походження репорту**, and counts of what the phone
  holds as numbers only; plus any screenshots — the one the app takes itself when the репорт is
  filed from the screen, and any the owner adds afterwards. Where the app could not take that
  скріншот, the репорт carries the reason instead, in Ukrainian, and is filed all the same. It is
  stored on the phone and read there whole, and it leaves only when the owner hands it over
  («Передати») or copies its text. It is never in a бекап, and a відновлення leaves репорти and
  the журнал untouched.
- **Походження репорту** (report origin) — which of the four doors a репорт came through: from the
  screen the problem was on, from a failure dialog, from the crash fallback, or from «Репорти про
  помилки». The app records it; the owner is never asked. A репорт stored before the app recorded
  it has no походження rather than a guessed one.
- **Жест репорту** (report gesture) — two fingers held still on any screen for about a second and
  a fifth, which files a репорт про помилку about that screen without leaving it. On until the
  owner turns it off. Nothing the owner does in ordinary use can reach it: every other interaction
  in the app is one finger.
- **Маркер репорту** (report handle) — a small «⚑» drawn above every screen that does exactly what
  the жест does. Off until the owner turns it on. It exists because a multi-finger gesture is not
  guaranteed to reach the app while TalkBack is on, and because an emulator cannot press two
  fingers.
- **Аркуш репорту** (report sheet) — the short form the жест and the маркер open over the screen,
  never in place of it: «Що не так?» (required), «Чого я очікував?» (optional), the скріншот, and
  «Зберегти», «Зберегти й передати», «Скасувати». It asks nothing else — «Що я робив» is written
  by the app from the route. Leaving it without saving stores nothing and keeps no скріншот.

## Distinctions the owner drew

| This | is not that | because |
| --- | --- | --- |
| Transfer (card → jar, ATM, card → card) | Expense | the money is still the owner's; only "where it sits" changed |
| Досягнення | Виклик | одне про те, що вже сталося, і не забирається; інший про те, що ще можна зробити, і його прогрес перечитується щоразу |
| Активний місяць | день, коли власник відкривав застосунок | активність міряють транзакції, а не візити: імпортована історія робить місяці активними так само |
| Свідчення досягнення | Розрахунковий баланс | свідчення — заморожене число «як було тоді»; баланс — правда «як є зараз», і рахують завжди його |
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
| Продавець | Категорія | who was paid, against what the money was for: «АТБ» may be Продукти one day and Побут the next, and a продавець puts nothing in a категорія on its own |
| Продавець | Опис | one name behind many texts: the опис is what the bank sent, kept as it was; the продавець is what the owner calls whoever sent it |
| Написання | Правило | a написання recognises who was paid, everywhere an опис is read; a правило decides where the money lands |
| Написання | Ознака | a написання recognises a продавець in every опис; an ознака (the `commitments` change) only links a витрата to one зобовʼязання |
| Restore (відновлення) | Import (імпорт) | an import adds to what is there; a restore replaces all of it with the бекап's |
| Код відновлення | Відновлення | the код is a key written down — a thing the owner keeps; the відновлення is the act of putting a бекап back. Having the код restores nothing by itself, and a відновлення on the phone that made the бекап needs no код at all |
| Reminder (нагадування) | Failure alert (сповіщення про збій) | the нагадування asks the owner to do something; the сповіщення says the app failed to |
| Reminder (нагадування) | Нагадування про платіж | the нагадування invites recording, daily, at the owner's time; the нагадування про платіж warns of a розстрочка платіж tomorrow, at 10:00, only before one |
| Розстрочка | Транзакція / рахунок-борг | a розстрочка is a plan the bank's debits are linked to: its повна сума is no витрата and no balance, and it owes money to a bank on a графік — a рахунок-борг is money the owner lent to a person, with no графік |
| Зобов'язання | Регулярна / запланована транзакція | a зобов'язання is a plan the real debit is linked to when it arrives; a scheduled транзакція would be recorded by the app before any money left, and the app never records one |
| Зобов'язання | Розстрочка | a розстрочка is a purchase with a повна сума, a кількість платежів and a залишок; a зобов'язання has none of these and runs until stopped — their платежі are alike, so «Вільно після зобов'язань» counts both |
| Зобов'язання | monobank «Регулярні платежі» | the bank's standing order moves money by itself; a зобов'язання only expects a debit and moves nothing |
| Зобов'язання | Recurring candidates (тренди) | a зобов'язання is declared by the owner; a recurring candidate is what the app noticed in the history for a пакет, and becomes nothing by itself |
| Пропущено | Сплачено | both stop a платіж from being owed; сплачено says the money left (linked, or paid where the app does not see), пропущено says it never will |
| Failure alert (сповіщення про збій) | Bank notification (сповіщення банку) | one the app posts about itself; the other is what another bank's app posted and this app read |
| Фіскальний чек | Квитанція | the чек is what the seller's реєстратор registered with the tax service and names the позиції; a квитанція (monobank's `receiptId`, check.gov.ua) only proves a payment happened and names no product — it cannot be used to find a чек |
| Позиція чека | Транзакція | a позиція is detail under one транзакція; it has no категорія, no рахунок and no effect on any number the app computes |
| Репорт про помилку | Сповіщення про збій | the репорт is what the owner writes for the developer; the сповіщення is what the app posts to the owner |
| Ціль витрат | Ціль-накопичення | they point in opposite directions — one is a ceiling not to be crossed, the other a сума to be reached — so they share no word: spending under a ліміт is never «досягнуто», and saving is never «перевищено» |
| Прогрес цілі | Розрахунковий баланс | a прогрес may sum several рахунки, may read an інвестиційний рахунок's поточна вартість instead of its баланс, and may be приблизний; a баланс is one рахунок's own number in its own currency and is never approximate |
| Спостереження | AI-аналіз | an спостереження is a fact a fixed rule found and the app states in its own fixed words, on the phone; AI-аналіз is a language model explaining numbers the owner chose to hand over |
| Спостереження | Досягнення | an досягнення is earned once, stored and never taken back; an спостереження is recomputed whenever shown and goes away when the транзакції stop making it true |
| Типова сума | Місячна норма витрат | the норма needs six завершені місяці and the owner's confirmation, and Прогрес reads it; a типова сума needs three, is never confirmed, and feeds nothing |
| Типова сума | Типова категорія | the same adjective for two unrelated things: a median сума of past months, and the starter категорія a базова категорія lands in |
| Типова сума | Typical amount of a recurring candidate (тренди) | the тренди's typical amount is the median of one категорія's or продавець's largest витрата per month inside a пакет's period; a типова сума is the median of whole months before the month read |
| Можливий дубль | Підказка про дубль | the можливий дубль is two транзакції that may be one purchase, answered «Не дубль»; the підказка is about two рахунки in a Saldo імпорт that may be one рахунок, offered as a merge |
| Можливий дубль | Зустрічний дохід | a зустрічний дохід is the other leg of a переказ, absorbed by it; a можливий дубль is two витрати on one рахунок, and the app never merges or deletes either on its own; «Видалити одну» is the owner's own delete, offered beside «Не дубль» |
| Підсумок місяця | Місячна картина | the картина is the six numbers of a month; the підсумок is one finished month read as a whole, with the картина as one of its parts |
