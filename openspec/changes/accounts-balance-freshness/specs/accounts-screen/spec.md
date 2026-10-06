## MODIFIED Requirements

### Requirement: A linked рахунок shows the bank balance and can be reconciled

The Рахунки screen SHALL show the latest known баланс банку beside the розрахунковий баланс of a
linked рахунок, both in that рахунок's currency, together with how long ago that баланс банку was
obtained. Once the рахунок's first sync has completed, the screen SHALL offer «Звірити» whenever the two
balances differ, and, before creating anything, SHALL name the age of the баланс банку it
reconciles against alongside the difference it would record. Before the рахунок's first sync has
completed, «Звірити» SHALL NOT be offered — whether or not the two balances currently happen to
agree — and the screen SHALL say that no sync has completed yet instead, exactly as it does for
the same рахунок on the monobank connect screen. Confirming «Звірити» SHALL create the accounts
capability's коригування for the difference and SHALL never overwrite either balance without a
транзакція.

#### Scenario: The two balances remain distinct

- **WHEN** a linked UAH рахунок whose first sync has completed has a розрахунковий баланс of 47000
  minor units and its latest баланс банку is 50000 minor units UAH
- **THEN** Рахунки shows both amounts as UAH, how long ago the баланс банку was obtained, and
  offers «Звірити»

#### Scenario: The age is named before anything is written

- **WHEN** the owner opens «Звірити» for a linked рахунок whose баланс банку was obtained some
  time ago
- **THEN** the screen names that age alongside the difference it would record, and creates nothing
  until the owner confirms

#### Scenario: Reconcile explains a surplus

- **WHEN** the owner confirms «Звірити» for those balances
- **THEN** a positive коригування of 3000 minor units UAH is created and the resulting
  розрахунковий баланс is 50000 minor units UAH

#### Scenario: Equal balances create no correction

- **WHEN** a linked рахунок's розрахунковий баланс equals its latest баланс банку and the owner
  chooses «Звірити»
- **THEN** no коригування is created and both balances remain unchanged

#### Scenario: Звірити waits for the first sync

- **WHEN** a linked рахунок's first sync has not yet completed
- **THEN** Рахунки shows its баланс банку and how long ago it was obtained, offers no «Звірити»
  for it, and says that no sync has completed yet

#### Scenario: The wait is said even when the balances happen to agree

- **WHEN** a linked рахунок's first sync has not yet completed and its баланс банку currently
  equals its розрахунковий баланс
- **THEN** Рахунки still says that no sync has completed yet, exactly as it would if the two
  balances differed

### Requirement: Tapping a рахунок opens its рухи

Tapping a рахунок on the Рахунки screen SHALL open that рахунок's рухи: its назва, its
розрахунковий баланс, the latest known баланс банку together with how long ago it was obtained
when a link feeds one, and every транзакція touching the рахунок — transfers on either leg
included — ordered newest first, each reading as it does in the latest-transactions feed and
opening for editing on tap. A рахунок with no транзакція SHALL say so rather than showing an empty
list. The рухи SHALL show what is stored and SHALL create, change or delete nothing by being
opened.

#### Scenario: The natural gesture shows the money's movements

- **WHEN** the owner taps a рахунок on Рахунки
- **THEN** that рахунок's транзакції are shown newest first with its розрахунковий баланс, and no
  editing form for the рахунок is opened

#### Scenario: A linked рахунок's рухи show the balance's age

- **WHEN** the owner opens the рухи of a linked рахунок
- **THEN** its баланс банку is shown together with how long ago it was obtained

#### Scenario: Both legs of a переказ belong to the рахунок

- **WHEN** a рахунок has a витрата of its own and a переказ arriving at it from another рахунок
- **THEN** its рухи show both

#### Scenario: A транзакція is edited from the рухи

- **WHEN** the owner taps a транзакція in a рахунок's рухи
- **THEN** it opens for editing exactly as it does from the latest-transactions feed

#### Scenario: A рахунок with no history says so

- **WHEN** the owner opens the рухи of a рахунок that has no транзакція
- **THEN** the screen states that nothing is recorded on it yet and its розрахунковий баланс is
  still shown

#### Scenario: A переказ arriving at гаманець

- **WHEN** the owner opens the рухи of «гаманець» holding a переказ of 100,00 UAH from
  «platinum ··6628»
- **THEN** that line reads «з platinum ··6628», says «переказ», and carries «+100,00 UAH» in the
  plain text tone, not the tone of a дохід

#### Scenario: A переказ leaving гаманець

- **WHEN** the same рухи hold a переказ of 10 000,00 UAH from «гаманець» to «mono black»
- **THEN** that line reads «на mono black», says «переказ», and carries «−10 000,00 UAH»

#### Scenario: A cross-currency переказ shows this рахунок's leg

- **WHEN** a переказ left «mono black» as 4 100,00 UAH and arrived at «валюта моно» as 100,00 USD
- **THEN** in the рухи of «валюта моно» it reads «+100,00 USD», and in the рухи of «mono black»
  «−4 100,00 UAH»

#### Scenario: The рахунок's name is not repeated

- **WHEN** the owner opens the рухи of «гаманець» holding a витрата in Кава
- **THEN** that line reads «Кава» over its дата, without «гаманець»
