## MODIFIED Requirements

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
