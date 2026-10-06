## MODIFIED Requirements

### Requirement: A категорія of a finished month is stated against its типова сума

For a завершений активний місяць M, each currency C and each категорія K, the system SHALL state
an спостереження when all of these hold:
- K has a positive типова сума T in C;
- K's витрачено A in M, in C, is not negative;
- A differs from T by at least 25 % of T;
- A differs from T by at least C's поріг помітності.

It SHALL state A and T, whether A is more or less than T, and the difference as a percentage of T,
rounded half away from zero to a whole percent. WHEN A is zero it SHALL say that K had no витрата
in M, with T, instead of stating a percentage — «Подорожі: цього місяця не було, зазвичай 7 056,58
UAH» — because «100 % менше» describes an absence as if it were a сума.

«Коригування» and «Без категорії» SHALL never be the subject of this or any other category-level
спостереження: each has its own line in the підсумок місяця. «Комісія» is an ordinary категорія
of витрачено here.

#### Scenario: Groceries well above typical

- **WHEN** September 2026 holds Продукти витрати of 1380000 minor units UAH, the типова сума of
  Продукти is 1000000 and the UAH поріг помітності is 180000
- **THEN** September states that Продукти was 1380000 minor units UAH, 38 % more than its типова
  сума of 1000000

#### Scenario: A категорія well below typical

- **WHEN** September holds Подорожі витрати of 400000 minor units UAH against a типова сума of
  800000 and a поріг of 180000
- **THEN** September states that Подорожі was 400000 minor units UAH, 50 % less than its типова
  сума of 800000

#### Scenario: A large percentage of a small сума is not noticeable

- **WHEN** September holds Кава витрати of 60000 minor units UAH against a типова сума of 30000 and
  a поріг of 180000
- **THEN** nothing is stated about Кава, although it doubled

#### Scenario: A сума inside the band is not stated

- **WHEN** September holds Продукти витрати of 1200000 minor units UAH against a типова сума of
  1000000
- **THEN** nothing is stated about Продукти: 20 % is inside the band

#### Scenario: A категорія absent this month is stated as all of it less

- **WHEN** Оренда has a типова сума of 1500000 minor units UAH, September holds no Оренда витрата,
  and the UAH поріг is 180000
- **THEN** September states that Оренда had no витрата in September, against its типова сума of
  1500000, and states no percentage

#### Scenario: Коригування are never the subject

- **WHEN** September holds negative коригування of 900000 minor units UAH and none in its window
- **THEN** no спостереження names «Коригування», and those коригування still count in September's
  витрачено as they always do

### Requirement: Two витрати that may be one purchase recorded twice are a можливий дубль

The system SHALL state a **можливий дубль** for every pair of витрати X and Y where all of these
hold:
- X and Y are on the same рахунок, with the same сума and currency;
- their dates are at most one calendar day apart;
- at least one of them falls in the month whose спостереження are shown;
- the pair has no «Не дубль» answer.

A pair where both carry an опис and their folded описи are equal SHALL NOT be a можливий дубль
when it is likely two records the bank itself sent: when either carries an MCC, or when their
рахунок is linked to monobank (the owner chose both tests on 2026-10-06; the link test exists
because the MCC is stored only on records imported since it was added, so older monobank
records carry none). Every other pair of equal описи SHALL be a можливий дубль: most often the same
витрата written twice by hand. Two real purchases with equal описи — two сповіщення of another bank
for two coffees, two Saldo rows — are then asked about too, and «Не дубль» answers them; two
records written by hand with one опис on a linked рахунок are not asked about, and neither is a
record written by hand beside the bank's record of it with the same опис, as before this change.

A витрата in «Комісія» SHALL never be one of the pair. A комісія is recorded with its переказ,
and two equal комісії on one day are the комісії of two перекази.

A stored транзакція does not say which door it came through. Two bank records with the same сума
at two different продавці a day apart are therefore stated too. «Не дубль» is the answer to
them; the detector does not guess.

It SHALL name both транзакції, each with its date, сума, опис (or that it has none) and рахунок.

A переказ, a дохід, a повернення and a коригування SHALL never be one of the pair. A pair that
spans two months SHALL be stated in each of them, and one «Не дубль» answers it in both.

This detector needs no поріг помітності and no window: a дубль makes the record wrong whatever
its size.

#### Scenario: A транзакція recorded by hand and a bank record of the same coffee

- **WHEN** mono black holds a витрата of 12500 minor units UAH on 2026-10-03 with опис «Aroma
  Kava», and a витрата of 12500 on 2026-10-04 recorded by hand with опис «кава»
- **THEN** October states a можливий дубль naming both

#### Scenario: A pair across two months is asked in both

- **WHEN** mono black holds a витрата of 12500 minor units UAH on 2026-09-30 with опис «Aroma Kava»
  and one of 12500 on 2026-10-01 recorded by hand without an опис
- **THEN** both September and October state that можливий дубль, and after one «Не дубль» neither
  does

#### Scenario: Two identical bank records are two purchases

- **WHEN** mono black, linked to monobank, holds two витрати of 12500 minor units UAH on 2026-10-03,
  both imported with опис «Aroma Kava» and MCC 5814
- **THEN** no можливий дубль is stated for them

#### Scenario: The same опис entered twice by hand is a дубль

- **WHEN** «гаманець», which no monobank рахунок is linked to, holds two витрати of 25000 minor
  units UAH on 2026-10-05, both recorded by hand with опис «Silpo», neither carrying an MCC
- **THEN** October states a можливий дубль naming both

#### Scenario: Two equal сповіщення on an unlinked рахунок are asked about

- **WHEN** «Приват», not linked to monobank, holds two витрати of 7500 minor units UAH on
  2026-10-03, both confirmed from сповіщення with опис «Aroma Kava» and no MCC
- **THEN** October states a можливий дубль naming both, and «Не дубль» removes it for good

#### Scenario: Equal описи on a linked рахунок are not asked about

- **WHEN** mono black, linked to monobank, holds two витрати of 12500 minor units UAH on 2026-10-03
  recorded by hand, both with опис «кава» and no MCC
- **THEN** no можливий дубль is stated for them

#### Scenario: A hand record and the bank's record of one purchase with one опис are not asked about

- **WHEN** mono black, linked to monobank, holds a витрата of 25000 minor units UAH on 2026-10-05
  recorded by hand with опис «Сільпо» and no MCC, and a витрата of 25000 on 2026-10-05 imported from
  monobank with опис «Сільпо» and MCC 5411
- **THEN** no можливий дубль is stated for them: one of the pair carries an MCC and the рахунок is
  linked, so the equal описи read as the bank's own records — as before this change, when no pair
  of equal описи was ever asked about

#### Scenario: Two days apart is not a дубль

- **WHEN** the two витрати of 12500 minor units UAH are dated 2026-10-03 and 2026-10-05
- **THEN** no можливий дубль is stated for them

#### Scenario: Different рахунки are not a дубль

- **WHEN** a витрата of 12500 minor units UAH on mono black and one of 12500 on mono white are both
  dated 2026-10-03
- **THEN** no можливий дубль is stated for them

#### Scenario: A переказ is never a дубль

- **WHEN** a переказ of 500000 minor units UAH from mono black to a банка and a витрата of 500000
  on mono black are both dated 2026-10-03
- **THEN** no можливий дубль is stated

#### Scenario: Two equal комісії of two перекази are not a дубль

- **WHEN** mono black holds two витрати «Комісія» of 1500 minor units UAH without an опис on
  2026-10-03, each recorded with its own переказ
- **THEN** no можливий дубль is stated for them

#### Scenario: Two bank records at two продавці are asked, not guessed

- **WHEN** mono black holds a витрата of 7500 minor units UAH on 2026-10-03 with опис «Aroma Kava»
  and one of 7500 on 2026-10-04 with опис «Львівські круасани»
- **THEN** October states a можливий дубль naming both, and «Не дубль» removes it for good

### Requirement: A можливий дубль is answered with «Не дубль», and nothing else is dismissed

Wherever a можливий дубль is shown, the owner SHALL be able to answer it «Не дубль». The answer
SHALL:
- remove that pair from every list of спостереження at once and for good;
- change neither транзакція;
- be stored for the pair, whichever of the two the owner answered from;
- survive editing either транзакція;
- go away when either транзакція is deleted;
- be undoable from where it was given, for as long as the screen says it was given, which brings
  the pair back exactly as it was stated.

A third витрата that pairs with either of them SHALL form a new pair, asked anew.

A real дубль SHALL be removed the way any транзакція is, from its own editing, which each of the
two names leads to, or with «Видалити одну» on the спостереження itself: it asks which of the two
to delete, naming each with its дата, сума and опис, and deletes the chosen one after a
confirmation, exactly as its editing would. The спостереження SHALL otherwise delete, merge and
retype nothing.

No other спостереження SHALL be dismissable. A fact stays stated while it is true and goes away
when the транзакції stop making it true.

#### Scenario: Answered once, gone everywhere

- **WHEN** the owner answers «Не дубль» to the pair of 2026-10-03 and 2026-10-04 on Головний
- **THEN** that pair is stated neither on Головний, nor on Місяць for October, nor in the підсумок
  of October, and both транзакції are unchanged

#### Scenario: A third identical витрата is asked anew

- **WHEN** after that answer a third витрата of 12500 minor units UAH without an опис is recorded on
  mono black on 2026-10-04
- **THEN** the new pairs it forms are stated, and the answered pair is not

#### Scenario: Deleting the дубль ends the question

- **WHEN** the owner opens one транзакція of a можливий дубль from the спостереження and deletes it
- **THEN** no можливий дубль remains for that pair and nothing else changed

#### Scenario: «Не дубль» given by mistake is undone

- **WHEN** the owner answers «Не дубль» to a pair on Головний and at once chooses to undo it
- **THEN** the pair is stated again on Головний, Місяць and the підсумок, and no answer is stored
  for it

#### Scenario: One of the two is deleted from the спостереження

- **WHEN** the owner chooses «Видалити одну» on a можливий дубль, picks the later of the two and
  confirms
- **THEN** that транзакція is deleted as its editing would delete it, the other is unchanged, and
  no можливий дубль remains for the pair

#### Scenario: A fact cannot be hidden

- **WHEN** Продукти is stated 38 % above its типова сума for September
- **THEN** no action hides that спостереження, and it is stated whenever September's спостереження
  are shown while the транзакції still make it true
