## ADDED Requirements

### Requirement: A досягнення is a permanent fact, earned at most once

A досягнення SHALL be a statement about a result the owner has already reached, proved from the
stored транзакції, цілі, рахунки and норми. Once earned it SHALL be kept until the owner replaces
their whole state by a відновлення: no later запис, редагування or видалення of a транзакція, and
no evaluation, SHALL remove one. Each досягнення SHALL be identified by a **stable key** that
carries every parameter making the fact distinct, and a key already earned SHALL NOT be earned a
second time, however many times the system evaluates.

Earning a досягнення SHALL change no money: no розрахунковий баланс, no number of the місячна
картина, no ліміт, ціль or звіт SHALL differ because a досягнення exists.

#### Scenario: Evaluating twice earns nothing twice

- **WHEN** the stored history holds 120 транзакції, the system evaluates, and the system evaluates
  again with nothing changed
- **THEN** «100 транзакцій» is earned exactly once and the second evaluation writes nothing

#### Scenario: Deleting history does not unearn

- **WHEN** «100 транзакцій» is earned and the owner then deletes twenty-five транзакції, leaving 95
- **THEN** «100 транзакцій» is still earned, and the system does not earn it again when the count
  next passes 100

#### Scenario: An earned досягнення moves no money

- **WHEN** a досягнення is earned on a device holding рахунки with розрахункові баланси and a
  місячна картина
- **THEN** every розрахунковий баланс, every number of the місячна картина, every ліміт and every
  ціль is exactly what it was before

### Requirement: A досягнення carries a свідчення that is never read as money

Each earned досягнення SHALL carry a **свідчення**: the number that justified it at the moment it
was earned — a count of транзакції, a span of місяці, a сума with its currency code, a місяць, or
the ціль it is about. The свідчення SHALL be shown as what was true then, never as a current
number, and SHALL NOT be read by anything that computes money: no сума, no місячна картина, no
ліміт, no ціль and no звіт SHALL take any value from a свідчення.

#### Scenario: The свідчення keeps the number of its moment

- **WHEN** «1000 транзакцій» is earned while storage holds exactly 1000 транзакції and the owner
  later deletes fifty
- **THEN** the досягнення still states 1000 as its свідчення, and the current count shown beside it
  is 950

#### Scenario: A money свідчення carries its currency

- **WHEN** a резерв досягнення is earned at 3000000 minor units UAH
- **THEN** its свідчення is 3000000 minor units with the currency code UAH, and no amount without a
  currency is stored

### Requirement: A досягнення is dated by the history where the history dates it

An earned досягнення SHALL carry a **дата досягнення**. WHEN the condition is one the stored
history dates — the first транзакція, the Nth транзакція, the end of the Nth активний місяць, the
first переказ onto a рахунок of a вид — the дата досягнення SHALL be that date from the history,
whatever day the system evaluated. WHEN the condition is a balance — a ціль's progress, the резерв,
the інвестиційний капітал — the дата досягнення SHALL be the day the system recorded it, because a
розрахунковий баланс is a number about now and the history does not date it.

The system SHALL also record the moment it wrote the row, distinct from the дата досягнення.

#### Scenario: A retroactive count is dated in the history

- **WHEN** the stored history's 100th транзакція by дата is dated 2024-12-03 and the system
  evaluates for the first time on 2026-09-02
- **THEN** «100 транзакцій» is dated 2024-12-03, not 2026-09-02

#### Scenario: A retroactive месяць count is dated at the month's end

- **WHEN** the sixth активний місяць of the history is 2025-03 and the system evaluates on 2026-09-02
- **THEN** «6 активних місяців» is dated 2025-03-31

#### Scenario: A balance condition is dated the day it was recorded

- **WHEN** a ціль created today already stands at 60 % because its рахунок has held money for a year,
  and the system evaluates on 2026-09-02
- **THEN** «Ціль — 50 %» is dated 2026-09-02 and no earlier date is claimed for it

### Requirement: Evaluation is retroactive over the whole stored history

Evaluating SHALL consider the whole stored history, not only what changed, so every досягнення the
stored data already proves is earned. This SHALL hold equally after a Saldo імпорт commits, after a
відновлення, after a monobank sync commits transactions, and after an old транзакція is edited or
deleted. Evaluating SHALL only ever add earned досягнення.

#### Scenario: An existing history earns everything it proves at once

- **WHEN** the system evaluates for the first time on a device already holding 2459 транзакції
  spanning 2024-10 to 2026-09 across 23 активні місяці
- **THEN** «Перша транзакція», «100 транзакцій», «500 транзакцій», «1000 транзакцій», «2000
  транзакцій», «3 активні місяці», «6 активних місяців», «12 активних місяців», «18 активних
  місяців» and «Рік історії» are all earned in that one evaluation

#### Scenario: A Saldo імпорт earns what it brought

- **WHEN** a device holding 40 транзакції commits a Saldo імпорт of 2000 more spanning two years
- **THEN** the evaluation that follows the імпорт earns the count and місяць досягнення the
  imported history proves, each dated from that history

#### Scenario: A відновлення earns what the бекап holds

- **WHEN** a бекап holding two years of транзакції is restored onto a device holding nothing
- **THEN** the evaluation that follows the відновлення earns what the restored history proves, in
  addition to the earned досягнення the бекап itself carried

#### Scenario: Editing an old транзакція earns nothing new by itself

- **WHEN** the owner changes the категорія of a транзакція dated two years ago and the system
  evaluates
- **THEN** no already-earned key is written again, and only a досягнення the change newly makes true
  is earned

### Requirement: Evaluation happens at named moments and never while a screen draws

The system SHALL evaluate досягнення at these moments and no others: once when the app starts; after
a транзакція is recorded, edited or deleted; after a monobank sync commits anything; after a
чернетка is confirmed or dismissed; after a Saldo імпорт commits; after a відновлення; after a ціль
is created, edited or deleted; and after a місячна норма витрат is confirmed or changed. Drawing a
screen SHALL NOT evaluate, and no screen SHALL earn a досягнення as a consequence of being shown.

#### Scenario: Opening Головний repeatedly evaluates once

- **WHEN** the app starts and the owner opens Головний, leaves it and returns to it four times
  without recording anything
- **THEN** the system evaluated once, at start

#### Scenario: Recording a транзакція evaluates

- **WHEN** the owner records the транзакція that makes the stored count 100
- **THEN** the system evaluates after it is stored and «100 транзакцій» is earned

### Requirement: Evaluating reads bounded aggregates, never the транзакції one by one

Evaluating SHALL read the history as a **зведення прогресу** whose size is bounded by the number of
(місяць, currency) pairs, the number of (вид рахунку, currency) pairs and a fixed number of single
values. The system SHALL NOT load individual транзакції to evaluate досягнення, with one exception:
finding the дата of the Nth транзакція for a count досягнення the evaluation is newly earning, which
SHALL read exactly that one транзакція.

#### Scenario: A large history is evaluated without reading its транзакції

- **WHEN** the system evaluates on a device holding 5000 транзакції across 24 місяці and 3 currencies
- **THEN** the reading it does returns at most one row per (місяць, currency), one row per (вид
  рахунку, currency) and the fixed single values, and no reading returns 5000 rows

#### Scenario: A crossed tier reads exactly one транзакція for its дата

- **WHEN** the evaluation newly earns «500 транзакцій»
- **THEN** it reads the 500th транзакція alone to date it, and no other транзакція individually

### Requirement: A money досягнення is per currency and never converted

Every досягнення whose condition is a сума SHALL be decided in one currency, against amounts in that
same currency, and SHALL carry that currency in its key — so the same milestone reached in two
currencies is two досягнення. No exchange rate, and no приблизний гривневий еквівалент, SHALL take
part in deciding any досягнення.

#### Scenario: Two currencies earn two досягнення

- **WHEN** the резерв reaches one місячна норма витрат in UAH and, later, one місячна норма витрат
  in USD
- **THEN** two досягнення are earned, one keyed to UAH and one keyed to USD, each with its own
  свідчення in its own currency

#### Scenario: Currencies are never added together to reach a milestone

- **WHEN** the резерв holds 60 % of the UAH норма in UAH and 60 % of the USD норма in USD
- **THEN** no «one month of витрати» досягнення is earned in either currency, whatever the курс says

### Requirement: A місяць is активний when it holds a транзакція, and завершений when it is over

An **активний місяць** SHALL be a calendar місяць holding at least one транзакція, whether that
транзакція was recorded by hand, imported or synced — the app SHALL NOT distinguish them, and SHALL
NOT count a місяць by whether the owner opened the app in it. A **завершений місяць** SHALL be an
активний місяць whose last day is before the device's today. A **чистий місяць** SHALL be a
завершений місяць in which no витрата carries «Без категорії» and no дохід carries «Без джерела»; a
місяць holding no транзакція SHALL NOT be чистий, because it is not активний.

#### Scenario: An imported місяць is активний

- **WHEN** a Saldo імпорт brings транзакції into 2024-11 and the owner never opened the app in 2024
- **THEN** 2024-11 is an активний місяць

#### Scenario: The current місяць is not завершений

- **WHEN** today is 2026-09-02 and 2026-09 holds транзакції
- **THEN** 2026-09 is активний and not завершений, and cannot be чистий

#### Scenario: A місяць with no транзакція is not чистий

- **WHEN** 2025-07 holds no транзакція at all
- **THEN** 2025-07 is not активний, not завершений and not чистий, and it breaks any run of чисті
  місяці that would otherwise pass through it

#### Scenario: One «Без категорії» is enough to spoil a місяць

- **WHEN** a завершений місяць holds 180 транзакції of which one витрата carries «Без категорії»
- **THEN** that місяць is not чистий

### Requirement: The облік досягнення count what the record holds

The catalogue SHALL hold these досягнення about the record itself, and each SHALL be earned when its
stated condition is true of the stored history:

- **«Перша транзакція»** — at least one транзакція is stored.
- **«N транзакцій»** for N of 100, 500, 1000 and 2000 — the stored count is at least N.
- **«N активних місяців»** for N of 3, 6, 12 and 18 — at least N активні місяці exist. They need not
  be consecutive.
- **«Рік історії»** — the span from the earliest to the latest stored транзакція covers at least 12
  calendar місяці. It SHALL be named and explained as the span of the history, never as a run of
  days on which the owner used the app.

No досягнення SHALL count витрати, purchases, a category, a card or an amount spent.

#### Scenario: The count tiers are crossed in order

- **WHEN** the stored count of транзакції reaches 100, later 500 and later 1000
- **THEN** «100 транзакцій», «500 транзакцій» and «1000 транзакцій» are each earned once, each dated
  at its own Nth транзакція

#### Scenario: Активні місяці need not be consecutive

- **WHEN** the history holds транзакції in six місяці separated by two місяці holding none
- **THEN** «3 активні місяці» and «6 активних місяців» are earned

#### Scenario: A gapped year still spans a year

- **WHEN** the earliest транзакція is dated 2024-10-05, the latest 2025-11-02, and four місяці
  between them hold nothing
- **THEN** «Рік історії» is earned and «12 активних місяців» is not

### Requirement: The якість досягнення reward a record that answers questions

The catalogue SHALL hold these досягнення about the quality of the record:

- **«Чистий місяць»** — a first чистий місяць exists.
- **«3 чисті місяці поспіль»** and **«6 чистих місяців поспіль»** — that many consecutive calendar
  місяці are each чистий. A місяць that is not активний breaks the run.
- **«Місяць без чернеток»** — a завершений місяць exists in which no чернетка bearing a дата inside
  it is still waiting for a word.

Each SHALL be dated at the last day of the місяць that completed it.

#### Scenario: Three consecutive чисті місяці earn the run

- **WHEN** 2026-04, 2026-05 and 2026-06 are each чистий
- **THEN** «Чистий місяць» and «3 чисті місяці поспіль» are earned, the run dated 2026-06-30

#### Scenario: An empty місяць breaks the run

- **WHEN** 2026-03 and 2026-04 are чисті, 2026-05 holds no транзакція, and 2026-06 and 2026-07 are
  чисті
- **THEN** «3 чисті місяці поспіль» is not earned

#### Scenario: A waiting чернетка spoils the місяць

- **WHEN** 2026-05 is завершений and one чернетка dated 2026-05-18 is still waiting
- **THEN** «Місяць без чернеток» is not earned for 2026-05

### Requirement: The ціль досягнення follow the goals capability and know nothing of рахунки

The catalogue SHALL hold these досягнення about цілі, each decided from the ціль's target, its
progress and its дата exactly as the `goals` capability defines them, and from nothing else — no
досягнення SHALL read which рахунок or рахунки a ціль's progress came from:

- **«Перша ціль»** — at least one ціль exists.
- **«Ціль “<назва>” — 25 %»**, **«… 50 %»**, **«… 75 %»** — that ціль's progress is at least that
  fraction of its target. The key SHALL carry the ціль's identifier, so each ціль earns its own.
- **«Ціль “<назва>” досягнута»** — the ціль is reached as `goals` defines reached.
- **«Ціль “<назва>” досягнута вчасно»** — the ціль is reached and the device's today is not after
  its дата.

There SHALL be no досягнення at any other fraction of a ціль.

#### Scenario: A ціль at 60 % earns two quarters at once

- **WHEN** a ціль's progress first stands at 60 % of its target
- **THEN** «25 %» and «50 %» are earned for that ціль and «75 %» is not

#### Scenario: Each ціль earns its own

- **WHEN** two цілі each pass 25 % of their own targets
- **THEN** two досягнення are earned, one keyed to each ціль

#### Scenario: A ціль reached after its дата is not reached in time

- **WHEN** a ціль whose дата was 2026-06-30 first reaches its target and the device's today is
  2026-07-04
- **THEN** «досягнута» is earned and «досягнута вчасно» is not

#### Scenario: No досягнення at five per cent

- **WHEN** a ціль's progress moves from 25 % to 30 %, 35 % and 40 % of its target
- **THEN** no досягнення is earned between 25 % and 50 %

### Requirement: The резерв досягнення are measured in місячні норми витрат

The **резерв** in a currency SHALL be the sum of the розрахункові баланси of the рахунки of вид
`savings` in that currency, and nothing else. The catalogue SHALL hold:

- **«Перше відкладення»** — a переказ onto a рахунок of вид `savings` exists. It SHALL be dated at
  that переказ's дата and SHALL NOT require a норма.
- **«Чверть місяця витрат у резерві»**, **«Пів місяця витрат у резерві»** and **«Місяць витрат у
  резерві»** — the резерв in a currency is at least 25 %, 50 % or 100 % of that currency's місячна
  норма витрат. Each SHALL exist only for a currency whose норма the owner has confirmed, and each
  SHALL be keyed to that currency.

No досягнення SHALL be defined at a round absolute сума.

#### Scenario: Without a confirmed норма the milestones do not exist

- **WHEN** the резерв in UAH is 4000000 minor units and no місячна норма витрат is confirmed for UAH
- **THEN** no резерв milestone is earned for UAH, and none is shown as waiting or locked

#### Scenario: A confirmed норма earns what the резерв already covers

- **WHEN** the owner confirms a UAH місячна норма витрат of 3000000 minor units while the резерв in
  UAH is 4000000 minor units
- **THEN** «Чверть місяця витрат у резерві», «Пів місяця витрат у резерві» and «Місяць витрат у
  резерві» are earned for UAH in the evaluation that follows the confirmation

#### Scenario: Перше відкладення needs no норма

- **WHEN** the owner records a переказ of 100000 minor units UAH from a картка onto a банка and no
  норма is confirmed
- **THEN** «Перше відкладення» is earned, dated at that переказ's дата

### Requirement: The інвестиційні досягнення reward contributing, not the market

The catalogue SHALL hold:

- **«Перший внесок в інвестиції»** — a переказ onto a рахунок of вид `investment` exists, dated at
  that переказ's дата.
- **«Внески у 3 місяцях»**, **«… у 6 місяцях»**, **«… у 12 місяцях»** — that many distinct активні
  місяці each hold інвестовано above zero in at least one currency. Counting місяці SHALL NOT add
  amounts of different currencies together.
- **«Інвестовано на N місяців витрат»** for N of 1, 3, 6 and 12 — the sum of the розрахункові
  баланси of the рахунки of вид `investment` in one currency is at least N місячні норми витрат of
  that currency. It SHALL exist only for a currency whose норма is confirmed, and SHALL be keyed to
  that currency.

No досягнення SHALL be decided from a поточна вартість, a прибуток or a збиток: what the owner
controls is what they put in, and a market that moved is not a behaviour to reinforce.

#### Scenario: Contribution months count across currencies without summing money

- **WHEN** three місяці each hold an інвестиція, one in UAH and two in USD
- **THEN** «Внески у 3 місяцях» is earned and no сума of the two currencies was formed

#### Scenario: A gain earns nothing

- **WHEN** the owner enters a поточна вартість that puts an інвестиційний рахунок 40 % above its
  вкладено
- **THEN** no досягнення is earned

### Requirement: The місячна норма витрат is confirmed by the owner and never inferred

The system SHALL hold at most one **місячна норма витрат** per currency: a positive integer
minor-units сума the owner has confirmed. The system SHALL propose a value — the median of
«витрачено» over the last six завершені активні місяці in that currency, exactly as the
monthly-picture capability computes витрачено — and SHALL show which місяці the proposal was
derived from. WHEN fewer than six завершені активні місяці exist in that currency, the system SHALL
propose nothing and SHALL let the owner enter the сума.

The system SHALL NOT derive a норма from the names of категорії, and SHALL NOT decide which витрати
are «базові» by any means of its own. A currency with no confirmed норма SHALL have no норма: every
досягнення and виклик needing one SHALL simply not exist for that currency.

A норма SHALL be changeable. Changing it SHALL re-derive every progress that depends on it and SHALL
NOT remove any earned досягнення.

#### Scenario: The proposal is the median of six місяці

- **WHEN** the last six завершені активні місяці hold витрачено of 2800000, 3100000, 2900000,
  4900000, 3000000 and 3200000 minor units UAH
- **THEN** the proposed UAH норма is 3050000 minor units, and the six місяці it came from are named

#### Scenario: Too little history offers no proposal

- **WHEN** only three завершені активні місяці hold витрачено in USD
- **THEN** no USD норма is proposed and the owner may enter one

#### Scenario: A норма is never guessed from category names

- **WHEN** the owner's категорії include «Продукти», «Оренда» and «Розваги» and no норма is confirmed
- **THEN** no норма exists for any currency, and no резерв or інвестиційний milestone is earned

#### Scenario: Lowering the норма keeps what was earned

- **WHEN** «Місяць витрат у резерві» is earned for UAH and the owner then raises the UAH норма so
  that the резерв covers only 40 % of it
- **THEN** the досягнення is still earned, and the progress shown beside it is 40 %

### Requirement: Nothing here rewards spending, and nothing punishes a closed app

No досягнення SHALL be defined by an amount spent, a number of purchases, a категорія of витрата, a
card, a credit or a debt taken on. No досягнення SHALL be defined by consecutive days, by opening
the app, or by any measure that a working автоматичний імпорт cannot satisfy on the owner's behalf.

#### Scenario: A month of heavy spending earns nothing

- **WHEN** a місяць holds витрачено four times the previous місяць's
- **THEN** no досягнення is earned because of it

#### Scenario: A closed app with working import loses nothing

- **WHEN** the owner does not open the app for six weeks while monobank sync and чернетки keep the
  record complete, and then opens it
- **THEN** every досягнення the record proves is earned, and no run of місяці was broken by the
  absence

### Requirement: Досягнення leave the phone only inside a бекап

No досягнення, свідчення or місячна норма витрат SHALL appear in a пакет для аналізу or a файл для
аналізу, and none SHALL be sent anywhere by the app. They SHALL leave the device only inside a
бекап the owner makes.

#### Scenario: A пакет для аналізу holds no досягнення

- **WHEN** a пакет для аналізу is built on a device holding twenty earned досягнення, two accepted
  виклики and a confirmed норма
- **THEN** the пакет holds none of them, in no form and under no name
