# observations Specification

## Purpose
The **спостереження**: a fact the app finds in the owner's own транзакції by a fixed,
deterministic detector and states in one sentence with its numbers — so what is unusual in a month
is pointed at rather than left for the owner to find on a chart. It answers "where did my money
go", changes nothing, and is never advice, a forecast or a language model's words.

## Requirements

### Requirement: An спостереження is a stated fact, computed when shown and stored nowhere

An спостереження SHALL be a fact about one calendar month of the owner's stored транзакції. A
detector of the closed catalogue below SHALL find it, with no language model, no network, no курс
and no randomness. The system SHALL compute the спостереження of a month whenever they are shown,
from the stored транзакції, категорії, рахунки, the «Не дубль» answers and today's date alone, and
SHALL store none of them: there is no seen state, no history of спостереження and no dismissal of
a fact. The same stored state on the same date SHALL yield the same спостереження in the same
order.

An спостереження SHALL change no транзакція, баланс, місячна картина, ліміт, ціль, статок,
досягнення or виклик, and no number anywhere SHALL be computed from one.

Спостереження exist for two kinds of month only:
- the **current month** (the calendar month holding today);
- a **завершений активний місяць**.

Any other month SHALL have none.

#### Scenario: The same state yields the same спостереження

- **WHEN** the спостереження of September 2026 are computed twice from the same stored state on
  2026-10-02
- **THEN** both lists hold the same спостереження with the same numbers in the same order

#### Scenario: Showing changes nothing

- **WHEN** Головний, Місяць and a підсумок місяця have each shown the спостереження of their month
- **THEN** showing them wrote no row and made no request beyond what those screens already make
  without them, and every number of every screen is what it was before

#### Scenario: A month with no транзакція has none

- **WHEN** the спостереження of a calendar month that holds no транзакція, and that is not the
  current month, are asked for
- **THEN** there are none

### Requirement: The past is read over a window of finished months, per currency

For a currency C and a month M, the **window** SHALL be the most recent завершені активні місяці
of C before M, up to six. These are calendar months that have ended by today and hold at least
one транзакція naming C: the same months a місячна норма витрат proposal is read from. M itself
SHALL never be in its own window.

Over the window the system SHALL derive three values:
- **Типова сума of a категорія** in C: the median of that категорія's витрачено (net of
  повернення) in each month of the window, a month without it counting as zero.
- **Типова сума of витрачено** in C: the median of C's whole витрачено in each month of the
  window.
- **Поріг помітності** of C: 3 % of the типова сума of витрачено.

Every median SHALL take the middle value, or for an even count the mean of the two middle values,
in minor units. That mean and the поріг SHALL be rounded half away from zero to whole minor units.

WHEN the window holds fewer than three months, or the типова сума of витрачено is not positive,
C SHALL have no типова сума and no поріг помітності. Every detector that needs either SHALL then
be silent for C.

Nothing SHALL ever be compared across currencies or converted.

#### Scenario: Six finished months make the window

- **WHEN** today is 2026-10-02 and UAH has транзакції in every month from 2026-01 to 2026-10
- **THEN** the UAH window for September 2026 is March to August 2026, and the window for October
  2026 is April to September 2026

#### Scenario: A month without the категорія counts as zero

- **WHEN** the UAH window holds six months and Подорожі has витрати in two of them, 800000 and
  1200000 minor units UAH
- **THEN** the типова сума of Подорожі is the median of 0, 0, 0, 0, 800000 and 1200000, which is 0

#### Scenario: A повернення lowers the month it lands in

- **WHEN** a window month holds Продукти витрати of 1100000 and a Продукти повернення of 100000
  minor units UAH
- **THEN** that month counts 1000000 minor units UAH toward the типова сума of Продукти

#### Scenario: Two finished months are not enough

- **WHEN** USD has транзакції in only two завершені місяці before October 2026
- **THEN** USD has no типова сума and no поріг помітності for October, and no спостереження that
  needs either is stated in USD

#### Scenario: The поріг is three per cent of the typical month

- **WHEN** the типова сума of UAH витрачено is 6000000 minor units
- **THEN** the поріг помітності of UAH is 180000 minor units

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

### Requirement: A категорія that has already reached last month's whole is stated in the current month

For the current month, each currency C and each категорія K, the system SHALL state an
спостереження when all of these hold:
- K's витрачено P in C over the whole previous calendar month is positive;
- P is at least C's поріг помітності;
- K's витрачено S in C from the first day of the current month through today is at least P.

It SHALL state how many days of the month have passed (today's day of the month), S and P.

It SHALL say nothing about the rest of the month: no projection, no pace and no end-of-month
сума. This compares two recorded facts and is not a forecast.

#### Scenario: Ten days of cafés already exceed September

- **WHEN** today is 2026-10-10, Кафе had витрати of 390000 minor units UAH in September, Кафе has
  витрати of 420000 in October so far, and the UAH поріг помітності is 180000
- **THEN** October states that in its first 10 days Кафе took 420000 minor units UAH, already more
  than the whole of September's 390000

#### Scenario: No projection is stated

- **WHEN** that спостереження is stated
- **THEN** it names no сума for the end of October and no pace of spending

#### Scenario: A finished month is not judged this way

- **WHEN** September 2026 has ended and is shown in its підсумок
- **THEN** no спостереження of this kind is stated for September

### Requirement: A категорія that has grown three months running is stated

For a завершений активний місяць M, each currency C and each категорія K, let the **run** be
the largest k for which all of these hold:
- K's витрачено in C grew strictly from each calendar month to the next over the k months ending
  at M;
- each of the k + 1 consecutive calendar months involved is a завершений активний місяць of C, so
  a month with no транзакція of C between them ends the run;
- the first of them holds a positive витрачено of K.

The system SHALL state an спостереження when all of these hold:
- the run is at least three;
- M's сума exceeds the first month's by at least C's поріг помітності;
- no спостереження against the типова сума is stated for K in M.

It SHALL state the run as an ordinal («третій», «четвертий», …) and the k + 1 сум, oldest first.

#### Scenario: Cafés grow for the third month running

- **WHEN** Кафе's UAH витрачено was 400000 in March, 380000 in April, 350000 in May, 210000 in
  June, 260000 in July, 305000 in August and 390000 in September 2026 — so its типова сума for
  September is 327500, and September is 19 % above it — and the UAH поріг is 180000
- **THEN** September states that Кафе grew for the third month running: 210000, 260000, 305000,
  390000 minor units UAH

#### Scenario: Above-typical takes precedence over the run

- **WHEN** a категорія's September сума is both 40 % above its типова сума and the end of a
  three-month run
- **THEN** September states the спостереження against its типова сума and not the run

#### Scenario: A flat month breaks the run

- **WHEN** Кафе's UAH витрачено was 200000 in June, 260000 in July, 260000 in August and 390000 in
  September
- **THEN** no run is stated for Кафе: August did not grow

### Requirement: A regular payment whose price changed is stated

The продавець of a витрата is the glossary's **продавець** of its опис, the same grouping the
пакет для аналізу uses. A витрата without an опис has none. This requirement and the next read
whatever the glossary defines it to be, and define no продавець of their own.

For the current month or a завершений активний місяць M, each currency C and each продавець V,
let R be the median of V's largest витрата in C in each of the three calendar months immediately
before M. The system SHALL state an спостереження when all of these hold:
- V has a витрата in C in each of those three months;
- each of those three largest витрати lies within 5 % of R, which is what makes it a regular
  payment;
- V has at least one витрата in C in M, and none of them lies within 5 % of R;
- the one nearest R is at least half of R and at most twice R.

Ties for the nearest SHALL be broken by the earlier date, then by the транзакція's id. The
спостереження SHALL name the транзакція the way its transaction line names it, and state its
сума, R, and the change as a signed percentage of R, rounded half away from zero.

This detector needs no поріг помітності and no window: a subscription that changed by fifty
hryvnias is worth knowing.

#### Scenario: Netflix got dearer

- **WHEN** «Netflix» was charged 29900 minor units UAH in July, August and September 2026, and
  34900 on 2026-10-05
- **THEN** October states that Netflix was 34900 minor units UAH instead of the usual 29900, +17 %

#### Scenario: A rate wobble inside the band is not a price change

- **WHEN** a продавець was charged 41000, 41500 and 40800 minor units UAH in the three months
  before October, and 42300 in October
- **THEN** nothing is stated: 42300 lies within 5 % of 41000

#### Scenario: An unrelated purchase at the same продавець is not a price change

- **WHEN** a продавець charged 29900 minor units UAH in each of the three months before October,
  and once 150000 in October
- **THEN** no price change is stated: 150000 is more than twice 29900

#### Scenario: No charge yet this month says nothing

- **WHEN** it is 2026-10-03 and Netflix has not yet charged in October
- **THEN** nothing is stated about Netflix for October

### Requirement: A purchase far above what its продавець usually costs is stated

For the current month or a завершений активний місяць M, each витрата X of M in currency C with
a продавець V, let E be V's витрати in C dated on or after the first day of the twelfth calendar
month before X's month and strictly before X's date — earlier days of X's own month count, and a
витрата of the same date as X does not — and R their median. The system SHALL state an спостереження
when all of these hold:
- E holds at least three витрати;
- R is positive;
- X is at least three times R;
- X exceeds R by at least C's поріг помітності.

It SHALL name X the way its transaction line names it, and state X's date, its сума, the ratio
of X to R to one decimal place (rounded half away from zero, written with a decimal comma), and R.

A повернення, a дохід, a переказ and a коригування SHALL never be the subject.

#### Scenario: A purchase four times the usual

- **WHEN** «Сільпо» was charged 60000, 70000 and 80000 minor units UAH earlier in the year, it is
  charged 294000 on 2026-10-12, and the UAH поріг is 180000
- **THEN** October states that Сільпо on 2026-10-12 was 294000 minor units UAH, 4,2 times its usual
  70000

#### Scenario: Two earlier purchases are not a usual

- **WHEN** a продавець has two earlier витрати in the twelve months before a purchase three times
  their median
- **THEN** nothing is stated about that purchase

#### Scenario: A large ratio of a small сума is not noticeable

- **WHEN** a кав'ярня usually costs 5000 minor units UAH and is charged 20000 once, against a UAH
  поріг of 180000
- **THEN** nothing is stated about that purchase

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

### Requirement: Спостереження are listed in one fixed order

The спостереження of a month SHALL be ordered first by kind, in this order:
1. можливий дубль;
2. a regular payment whose price changed;
3. a purchase far above its продавець;
4. a категорія that already reached last month's whole;
5. a категорія against its типова сума;
6. a категорія's run.

Within a kind they SHALL be ordered:
1. UAH first, then the other currencies by code;
2. then by the size of what is stated, in minor units, larger first. Per kind, that is:
   - можливий дубль: the later date of the pair first, then the larger сума;
   - price change: |X − R|;
   - purchase above its продавець: X − R;
   - already more than last month: S − P;
   - against the типова сума: |A − T|;
   - run: the last сума minus the first;
3. then by the категорія's назва, the опис, the date, the транзакція's id and the категорія's
   id, so that no two спостереження ever tie. Text is compared by code unit, never by locale, so
   the phone and the test runner order alike.

#### Scenario: A дубль leads

- **WHEN** October holds a можливий дубль, a Netflix price change and Кафе above last month's
  whole
- **THEN** they are listed in that order

#### Scenario: Currencies do not mix in the order

- **WHEN** October holds a price change in USD and a price change in UAH
- **THEN** the UAH one is listed first, and no сума of one is compared with the other's

### Requirement: An спостереження states itself in one sentence and leads to its records

Every спостереження SHALL be stated as one sentence in Ukrainian. It SHALL carry the сума or
сум it is about and the сума it is compared with, each with its currency and written as the app
writes every сума, plus the percentage or ratio its kind defines. It SHALL name a категорія by
its current назва.

It SHALL contain no advice, praise, blame or forecast: no «варто», «слід», «молодець» or «якщо так
піде», and no сума the month has not reached.

Choosing an спостереження SHALL lead to the records it is about:
- a категорія's спостереження → that категорія's month;
- a price change or a purchase → that транзакція's editing;
- a можливий дубль → each of its two транзакції's editing, one per транзакція.

#### Scenario: A категорія leads to its month

- **WHEN** the owner chooses «Продукти … на 38 % більше за типові» of September
- **THEN** the транзакції of Продукти in September open

#### Scenario: A дубль opens either транзакція

- **WHEN** the owner chooses the half of a можливий дубль that was recorded by hand
- **THEN** that транзакція opens for editing, where it can be deleted

#### Scenario: Two currencies are two sentences

- **WHEN** Продукти is above its типова сума in UAH and in USD in September
- **THEN** two спостереження are stated, one per currency, each with its own currency's сум only

### Requirement: Спостереження never leave the phone and never call for attention

No спостереження SHALL be put into a пакет для аналізу, a бекап, the text of a репорт про
помилку or the журнал. The one way one can reach a репорт is as pixels of a скріншот of a screen
that showed it, which vision §12 already discloses and the owner sees before handing it over. None
SHALL be announced by a notification, a sound, a vibration or a dialog. Only the «Не дубль»
answers are stored, and only they travel in a бекап.

#### Scenario: Nothing is posted

- **WHEN** a background прогін of monobank imports a витрата that forms a можливий дубль
- **THEN** no notification is posted and the дубль is stated the next time a screen showing
  October's спостереження is opened

#### Scenario: The пакет does not carry them

- **WHEN** a пакет для аналізу is built for a month that has five спостереження
- **THEN** the пакет carries none of them
