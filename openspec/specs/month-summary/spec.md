# month-summary Specification

## Purpose
The **підсумок місяця**: one finished month read as a whole — what it cost against the month
before and a typical month, what changed, where the rest of the money went, how the статок, the
цілі and the record itself came out of it — so the history is a set of explained months rather than
an archive of numbers. It is a reading of existing rules, adds no money rule of its own, and is
computed when shown.

## Requirements

### Requirement: Every завершений активний місяць has a підсумок, and no other month does

The system SHALL offer a підсумок місяця for every завершений активний місяць: a calendar month
that has ended by today and holds at least one транзакція of any type. The current month, a month
after it, and a month that holds no транзакція SHALL have none.

The підсумок SHALL be computed from stored truth when it is shown and stored nowhere. It SHALL
write nothing and request nothing over the network, and it SHALL change no number it reads.

Every сума in it SHALL be exact and per currency, as the month's own транзакції name it, with no
«≈» conversion. A currency **of the month** is one that some транзакція of the month names.

#### Scenario: September has a підсумок in October

- **WHEN** today is 2026-10-02 and September 2026 holds транзакції
- **THEN** September 2026 has a підсумок, and October 2026 has none

#### Scenario: A month of перекази alone still has one

- **WHEN** August 2026 holds only a переказ from mono black to a банка
- **THEN** August has a підсумок, with витрачено of zero

#### Scenario: An empty month has none

- **WHEN** July 2026 holds no транзакція
- **THEN** July has no підсумок

#### Scenario: Reading it twice changes nothing

- **WHEN** the підсумок of September is read twice with nothing written in between
- **THEN** both readings hold the same numbers, and no row has been written

### Requirement: The підсумок states витрачено against the month before and a typical month

For each currency of the month, the підсумок SHALL state:
- the month's витрачено, equal to the витрачено Місяць shows for that month and currency, and,
  WHEN коригування are part of it, how much of it they are — so the «Витрати» of the зміна статку,
  which keep коригування on their own line, is not read as a second, contradicting витрачено;
- the previous calendar month's витрачено in that currency, with the difference and, when the
  previous one is positive, the difference as a whole percentage rounded half away from zero;
- the типова сума of витрачено of that currency, as the observations capability defines it over
  the month's window, naming how many months it was read from, with the difference and its
  percentage.

The typical comparison SHALL be absent, and say so, when the window holds fewer than three months
(too little history), or when the типова сума of витрачено is not positive (nothing typical to
compare with).

#### Scenario: September against August and the median of six

- **WHEN** September's UAH витрачено is 5230000 minor units, August's is 4810000, and the median
  of UAH витрачено over March to August is 5000000
- **THEN** the підсумок states 5230000, +420000 (+9 %) against August, and +230000 (+5 %) against
  the typical 5000000 read from 6 months

#### Scenario: Коригування inside витрачено are named

- **WHEN** September's UAH витрачено of 6868249 minor units holds a negative коригування of 77686
- **THEN** the підсумок states 6868249 and that 77686 of it is коригування

#### Scenario: Too little history for a типова сума

- **WHEN** September is only the third active UAH month
- **THEN** the підсумок states September against August and says there is too little history for a
  типова сума

#### Scenario: A переказ into a банка is not витрачено

- **WHEN** September holds a переказ of 1000000 minor units UAH from mono black to a банка
- **THEN** the stated витрачено does not include it, and the same 1000000 appears as відкладено in
  the місячна картина of the підсумок

### Requirement: The підсумок names the категорії that changed most

For each currency of the month, the підсумок SHALL name up to three категорії with the largest
absolute difference between the month's витрачено and the previous calendar month's, larger
first, ties broken by назва. Each SHALL be named with both сум and, when the previous сума is
positive, the percentage. A категорія **present** in a month is one with at least one витрата or
повернення in that month and currency, whatever its net. A категорія present in only one of the
two months SHALL be marked as new, or as absent this month.

A difference of zero SHALL never be named. «Коригування» and «Без категорії» SHALL never be named
here: each has its own line in the підсумок.

WHEN the previous calendar month holds no транзакція in that currency, the підсумок SHALL say
there is nothing to compare with rather than name every категорія as new.

#### Scenario: The three largest changes

- **WHEN** September against August in UAH changed Продукти by +380000, Подорожі by −400000, Кафе by
  +85000 and Аптека by +20000 minor units
- **THEN** the підсумок names Подорожі, Продукти and Кафе in that order, and not Аптека

#### Scenario: A повернення is part of its категорія's change

- **WHEN** September holds Одяг витрати of 300000 and an Одяг повернення of 300000 minor units UAH,
  and August held Одяг витрати of 200000
- **THEN** Одяг's September сума is 0 and its change is −200000 minor units UAH

#### Scenario: A new категорія is marked new

- **WHEN** September holds Ремонт витрати of 900000 minor units UAH and August held none, and
  every other UAH категорія changed by less than 100000
- **THEN** Ремонт is named first, with its September сума, marked as new, and with no percentage

#### Scenario: An empty August leaves nothing to compare with

- **WHEN** September holds UAH витрати and August holds no UAH транзакція at all
- **THEN** the підсумок says there is nothing in August to compare September's категорії with, and
  names no категорія as new

### Requirement: The підсумок states the month's місячна картина

For each currency of the month, the підсумок SHALL state the six numbers of the місячна картина
for that month: дохід, витрачено, інвестовано, відкладено, позичено and залишилось. They SHALL be
equal to the numbers Місяць shows for that month and currency. Дохід SHALL also be stated against
the previous calendar month's.

#### Scenario: The картина equals Місяць

- **WHEN** the підсумок of September and Місяць on September are both read
- **THEN** the six UAH numbers of both are identical

#### Scenario: A repayment above the principal is дохід only for the відсотки

- **WHEN** September holds a repayment of 1050000 minor units UAH onto mono black for a loan of
  1000000, recorded as a переказ back of 1000000 and дохід «Відсотки» of 50000
- **THEN** the підсумок's позичено is reduced by 1000000 and its дохід includes 50000 alone

#### Scenario: A positive коригування is дохід

- **WHEN** September holds a positive коригування of 30000 minor units UAH
- **THEN** the підсумок's дохід includes it, exactly as Місяць's does

#### Scenario: Дохід against August

- **WHEN** September's UAH дохід is 6100000 minor units and August's was 5800000
- **THEN** the підсумок states September's дохід with +300000 (+5 %) against August

### Requirement: The підсумок states the зміна статку with its розбивка

For each currency of the статок, the підсумок SHALL state the month's зміна статку and its
розбивка: дохід, витрати, коригування, перекази й обмін, and нові рахунки. Each SHALL be equal to
what the «Статок» screen states for that month and currency, on the same recorded-balance basis.

The first month of the history SHALL say it has nothing to compare with. A month whose level
cannot be represented SHALL say so and state no зміна, exactly as «Статок» does. The підсумок SHALL
lead to the «Статок» screen.

#### Scenario: The зміна equals Статок's

- **WHEN** «Статок» states a UAH зміна of +1240000 minor units for September, made of дохід
  6100000, витрати −5230000, коригування −30000, перекази й обмін 400000 and нові рахунки 0
- **THEN** the підсумок of September states the same зміна and the same five parts

#### Scenario: The first month of the history

- **WHEN** September 2026 is the first month any рахунок entered the history of Статок
- **THEN** the підсумок says the зміна статку of September has nothing before it to compare with,
  and states its нові рахунки

#### Scenario: An інвестиційний рахунок counts its вкладено

- **WHEN** an інвестиційний рахунок has a поточна вартість above its вкладено
- **THEN** the підсумок's зміна статку counts that рахунок's вкладено, as the history of Статок
  does, and states no прибуток as a part of the month

### Requirement: The підсумок states what moved toward each ціль and which ліміти held

For every ціль-накопичення, the підсумок SHALL state the net movement during the month of the
розрахункові баланси of the рахунки in its склад, per currency of those рахунки. A переказ
between two рахунки of the same склад in one currency moves nothing. A склад that did not move
SHALL be stated as unchanged. No percentage, no progress at the month's end and no «≈» SHALL be
stated.

For every категорія carrying a ліміт, the підсумок SHALL state the month's витрачено of that
категорія in the ліміт's currency, and either that the month finished within the ліміт or by how
much it exceeded it. The judgement SHALL be against the ліміт as it is stored today, exactly as
Місяць judges that month.

Each ціль-накопичення SHALL lead to its breakdown screen, and each ліміт to its категорія's
month.

#### Scenario: A cushion grew in September

- **WHEN** the склад of «Подушка» is two банки, and September holds a переказ of 1000000 minor
  units UAH from mono black into one and a переказ of 200000 from that one into the other
- **THEN** the підсумок states «Подушка» moved by +1000000 minor units UAH in September

#### Scenario: A ціль that did not move

- **WHEN** no транзакція of September touches a рахунок in the склад of «Відпустка»
- **THEN** the підсумок states «Відпустка» as unchanged in September, with no percentage

#### Scenario: A ліміт exceeded is stated with its overrun

- **WHEN** Кафе carries a ліміт of 300000 minor units UAH and September's Кафе витрачено is 390000
- **THEN** the підсумок states that Кафе exceeded its ліміт by 90000 minor units UAH in September

#### Scenario: A ліміт kept is stated as kept

- **WHEN** Продукти carries a ліміт of 1500000 minor units UAH and September's Продукти витрачено is
  1380000
- **THEN** the підсумок states that September finished within the ліміт of Продукти

### Requirement: The підсумок states what is still unanswered, or that the month is clean

The підсумок SHALL state, for the month:
- how many витрати and повернення are «Без категорії», with their сума per currency, net of
  повернення as the breakdown by category counts it;
- how many доходи are «Без джерела», with their сума per currency;
- how many чернетки dated in the month still wait.

WHEN there is no витрата or повернення «Без категорії» and no дохід «Без джерела», it SHALL say the
month is a чистий місяць. Waiting чернетки SHALL be stated apart, as they are not part of that
definition.

Each count SHALL lead to where it is answered: «Без категорії» to the month's транзакції narrowed
to «Без категорії», «Без джерела» to them narrowed to «Без джерела», and the waiting чернетки to
Головний, where чернетки are confirmed or dismissed.

#### Scenario: Three uncategorised and one unsourced

- **WHEN** September holds three витрати «Без категорії» of 45000 minor units UAH in total and one
  дохід «Без джерела» of 200000
- **THEN** the підсумок states 3 «Без категорії» of 45000 and 1 «Без джерела» of 200000, and does
  not call September a чистий місяць

#### Scenario: «Без джерела» opens the unsourced доходи

- **WHEN** September holds nine доходи «Без джерела» and no витрата «Без категорії», and the owner
  taps the «Без джерела» count
- **THEN** «Транзакції» opens narrowed to вересень 2026 and «Без джерела», showing those nine

#### Scenario: A clean month is called clean

- **WHEN** September holds no витрата or повернення «Без категорії» and no дохід «Без джерела», and
  one чернетка still waits
- **THEN** the підсумок says September is a чистий місяць, and separately that one чернетка waits

### Requirement: The підсумок states the коригування and their частка

For each currency of the month, the підсумок SHALL state how many коригування the month holds and
the sum of their absolute сум. It SHALL also state the **частка коригувань**: that sum divided by
the month's витрачено in the currency, in percent to one decimal place, rounded toward zero, so
a частка below 2 % never reads «2,0 %». The частка SHALL be stated only when the витрачено is
positive.

WHEN the exact частка is 2 % or more, the підсумок SHALL mark it in words as at or above the 2 %
that vision §15 names as the measure of a trusted month, not by colour alone. A month without
коригування SHALL say so.

#### Scenario: Corrections of both signs count by size

- **WHEN** September's UAH витрачено is 5230000 minor units and it holds a коригування of −40000
  and one of +23000
- **THEN** the підсумок states 2 коригування of 63000 minor units UAH, a частка of 1,2 %, and no
  mark

#### Scenario: A частка of two per cent is marked

- **WHEN** September's UAH витрачено is 5000000 minor units and its коригування sum to 100000 in
  absolute сума
- **THEN** the частка is 2,0 % and it is marked in words as at the measure of vision §15

#### Scenario: No витрачено, no частка

- **WHEN** September's only USD транзакція is a positive коригування of 1000 minor units
- **THEN** the підсумок states the USD коригування and states no частка for USD, since USD витрачено
  is zero

#### Scenario: Just under the measure is not rounded up to it

- **WHEN** September's UAH витрачено is 5000000 minor units and its коригування sum to 98000 in
  absolute сума
- **THEN** the частка reads 1,9 % and is not marked

### Requirement: The підсумок carries the month's спостереження

The підсумок SHALL carry the спостереження of the month as Місяць lists them: the first five in the
observations capability's order and «Ще N» for the rest, with the «Не дубль» answer where one
applies.

#### Scenario: The спостереження are the month's

- **WHEN** September has a можливий дубль and Продукти above its типова сума
- **THEN** the підсумок of September carries both, the дубль first

#### Scenario: More than five спостереження fold under «Ще N»

- **WHEN** September has a можливий дубль and seven категорії outside their типова сума, eight
  спостереження in all
- **THEN** the підсумок of September carries the five the observations order puts first, the дубль
  among them with «Не дубль», and «Ще 3», which shows the other three without leaving the підсумок
