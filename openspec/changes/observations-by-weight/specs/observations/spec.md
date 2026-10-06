## MODIFIED Requirements

### Requirement: Спостереження are listed in one fixed order

Every спостереження other than a можливий дубль SHALL have a **money weight**: the difference, in
minor units of its own currency, between the сума it states and the сума it compares it with.
Per kind, that is:
- a категорія against its типова сума: |A − T|, so a сума below its типова сума weighs as much as
  one equally far above it, and a категорія with no витрата this month weighs its whole T;
- a категорія that already reached last month's whole: S − P;
- a категорія's run: the last сума of the run minus the first;
- a regular payment whose price changed: |X − R|;
- a purchase far above its продавець: X − R.

The money weight SHALL be read from the сум the спостереження states and nothing else: no курс, no
conversion, no stored value and nothing the спостереження does not itself state. It is a key of the order only; it SHALL be shown
nowhere and feed no other number.

The спостереження of a month SHALL be ordered:
1. every можливий дубль before every other спостереження, because it is a question about a record
   rather than a fact about spending; among them UAH first, then the other currencies by code, then
   the later date of the pair first, then the larger сума;
2. every other спостереження after them, UAH first, then the other currencies by code; within one
   currency by money weight, larger first, whatever its kind;
3. at equal money weight in one currency, by kind in this order: a regular payment whose price
   changed; a purchase far above its продавець; a категорія that already reached last month's
   whole; a категорія against its типова сума; a категорія's run;
4. then, for any спостереження still tied, by the категорія's назва, the опис, the date, the
   транзакція's id and the категорія's id, so that no two спостереження ever tie. Text is compared
   by code unit, never by locale, so the phone and the test runner order alike.

Money weights of two currencies SHALL never be compared with each other: among the спостереження
other than a можливий дубль, a USD one is listed after every UAH one whatever its weight in minor
units. A можливий дубль in any currency is still listed before all of them.

#### Scenario: A дубль leads

- **WHEN** today is 2026-10-10 and October 2026 holds a можливий дубль of two витрати of 12500 minor
  units UAH, a Netflix price change of 34900 against the usual 29900, and Кафе at 420000 already
  above September's whole of 390000
- **THEN** they are listed as the дубль, then Кафе (money weight 30000), then the Netflix price
  change (money weight 5000)

#### Scenario: The largest difference leads whatever its kind

- **WHEN** September 2026 states Продукти at 1380000 minor units UAH against its типова сума of
  1000000, a purchase at «Сільпо» of 294000 against its usual 70000, Кафе's run from 210000 to
  390000, and a Netflix price change of 34900 against the usual 29900
- **THEN** they are listed Продукти (380000), Сільпо (224000), Кафе's run (180000), Netflix (5000)

#### Scenario: Below typical weighs as much as above

- **WHEN** September 2026 states Подорожі at 400000 minor units UAH against its типова сума of
  800000, Продукти at 1400000 against 1000000, and Кафе at 600000 against 400000
- **THEN** Подорожі and Продукти, both of money weight 400000, are listed before Кафе (money weight
  200000): a сума 400000 below its типова сума weighs exactly as much as one 400000 above it

#### Scenario: A категорія with no витрата weighs its whole типова сума

- **WHEN** September 2026 states that Оренда had no витрата against its типова сума of 1500000
  minor units UAH, and Продукти at 1380000 against 1000000
- **THEN** Оренда (money weight 1500000) is listed first, still in the words «цього місяця не
  було» and with no percentage

#### Scenario: Equal weight falls back to the kind order

- **WHEN** October 2026 states a price change of 34900 minor units UAH against the usual 29900 and
  Кава at 395000 already above September's whole of 390000, both of money weight 5000
- **THEN** the price change is listed before Кава

#### Scenario: Currencies do not mix in the order

- **WHEN** October holds a price change in USD of 9900 minor units against the usual 5000 (money
  weight 4900) and a price change in UAH of 31900 against the usual 29900 (money weight 2000)
- **THEN** the UAH one is listed first, and no сума or weight of one is compared with the other's

#### Scenario: A USD дубль before a UAH fact

- **WHEN** October 2026 holds a можливий дубль of two витрати of 1500 minor units USD on one USD
  рахунок, and a UAH price change of 34900 against the usual 29900
- **THEN** the USD дубль is listed first and the UAH price change second, and no сума of one is
  compared with the other's
