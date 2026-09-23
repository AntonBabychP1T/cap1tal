## MODIFIED Requirements

### Requirement: Tapping a рахунок opens its рухи

Tapping a рахунок on the Рахунки screen SHALL open that рахунок's рухи: its назва, its
розрахунковий баланс, the latest known баланс банку when a link feeds one, and every транзакція
touching the рахунок — transfers on either leg included — ordered newest first, each opening for
editing on tap. A рахунок with no транзакція SHALL say so rather than showing an empty list. The
рухи SHALL show what is stored and SHALL create, change or delete nothing by being opened.

Each line SHALL read as it does in the latest-transactions feed — its категорія or джерело, its
опис, its дата and its marks — except that it SHALL say what the транзакція did to *this*
рахунок: a переказ arriving at it SHALL read as money in («+») and name the рахунок it came from
(«з …»), a переказ leaving it SHALL read as money out («−») and name the рахунок it went to
(«на …»), in both cases with the сума of this рахунок's own leg and still named a переказ, never
drawn as a дохід or a витрата. No line SHALL repeat the рахунок's own name, which the screen
already states.

#### Scenario: The natural gesture shows the money's movements

- **WHEN** the owner taps a рахунок on Рахунки
- **THEN** that рахунок's транзакції are shown newest first with its розрахунковий баланс, and no
  editing form for the рахунок is opened

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

## ADDED Requirements

### Requirement: Звірити opens when the owner asks for it

In the рухи of an unarchived рахунок, «Звірити» SHALL be offered as one action; the фактичний
залишок field and its confirmation SHALL appear only after the owner chooses it. It SHALL close
again once a коригування is created or the owner cancels it; when the entered фактичний залишок
equals the розрахунковий баланс, or the entry is refused, the screen SHALL say so in its existing
words and the field SHALL stay open with what was typed, so it can be corrected. An archived
рахунок SHALL offer no «Звірити» at all, as today. While it is closed, the рухи SHALL follow the
balance directly.

#### Scenario: The history follows the balance

- **WHEN** the owner opens the рухи of «гаманець»
- **THEN** the balance, one «Звірити» action and then the рухи are shown, with no фактичний залишок
  field

#### Scenario: Звірити opens and closes

- **WHEN** the owner taps «Звірити», enters "18 000,00" and confirms the коригування
- **THEN** the коригування the existing Звірити requirement names is created and the field closes

#### Scenario: A refused entry keeps the field open

- **WHEN** the owner taps «Звірити», enters "abc" and confirms
- **THEN** the refusal is stated, nothing is created, and the field stays open holding "abc"

#### Scenario: An archived рахунок offers no Звірити

- **WHEN** the owner opens the рухи of an archived рахунок
- **THEN** no «Звірити» action is shown

### Requirement: «Усього грошей» reads one currency per line

«Усього грошей» on Рахунки SHALL show each currency's total on a line of its own, in the same
currency order the рахунки use, whether or not they would fit one line together, so no total is
broken between its number and its currency.

#### Scenario: Three currencies

- **WHEN** the unarchived рахунки hold UAH, EUR and USD
- **THEN** «Усього грошей» shows three lines, one per currency, each whole
