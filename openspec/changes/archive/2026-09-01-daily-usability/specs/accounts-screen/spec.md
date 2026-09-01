## ADDED Requirements

### Requirement: Рахунки shows how much money there is

The Рахунки screen SHALL show the money held the accounts capability defines: a total on every
вид group, and one total across all unarchived рахунки, each per currency and in the same
currencies the рахунки themselves are shown in. The archived group SHALL carry no total, since
archived рахунки count toward nothing. Beside the per-currency totals the screen SHALL show the
approximate UAH equivalent, visibly marked as approximate, only when a non-UAH currency
participates and every participating currency has a known monobank rate; in every other case the
approximate figure SHALL be absent and the per-currency totals SHALL be shown in full. Opening
the screen SHALL obtain monobank's current rates when a participating currency has no stored rate
or one older than an hour, and a failure to obtain them SHALL change nothing visible.

#### Scenario: The screen says how much money there is

- **WHEN** the owner has an unarchived `spending` рахунок of 705000 minor units UAH and an
  unarchived `savings` рахунок of 600000 minor units UAH
- **THEN** Рахунки shows 705000 minor units UAH on the `spending` group, 600000 minor units UAH on
  the `savings` group, and a total of 1305000 minor units UAH

#### Scenario: Currencies are totalled apart

- **WHEN** the unarchived рахунки hold 705000 minor units UAH and 20000 minor units USD
- **THEN** the total is shown as 705000 minor units UAH and 20000 minor units USD, never as one
  combined number

#### Scenario: A known rate adds a marked approximation

- **WHEN** the totals hold UAH and USD amounts and a monobank rate for USD is known
- **THEN** an approximate UAH equivalent of the total is shown beside them and is marked as
  approximate

#### Scenario: An unknown rate hides the approximation, not the totals

- **WHEN** the totals hold UAH and USD amounts and no monobank rate for USD is known
- **THEN** no approximate figure is shown and both per-currency totals are shown in full

#### Scenario: The archived group is not totalled

- **WHEN** an archived рахунок holds 100000 minor units UAH
- **THEN** the archived group shows that рахунок with its balance and no total, and the screen's
  total is unchanged by it

### Requirement: Tapping a рахунок opens its рухи

Tapping a рахунок on the Рахунки screen SHALL open that рахунок's рухи: its назва, its
розрахунковий баланс, the latest known баланс банку when a link feeds one, and every транзакція
touching the рахунок — transfers on either leg included — ordered newest first, each reading as
it does in the latest-transactions feed and opening for editing on tap. A рахунок with no
транзакція SHALL say so rather than showing an empty list. The рухи SHALL show what is stored and
SHALL create, change or delete nothing by being opened.

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

### Requirement: Звірити is offered for every рахунок against a typed фактичний залишок

From a рахунок's рухи the owner SHALL be able to звірити any unarchived рахунок by entering the
фактичний залишок — the actual balance, in the рахунок's own currency, whether or not any bank
feeds it. Before anything is written the screen SHALL name the signed difference the коригування
would carry; on confirmation exactly the accounts capability's коригування SHALL be created, and
neither balance SHALL be overwritten without a транзакція. WHEN the entered фактичний залишок
equals the розрахунковий баланс, nothing SHALL be created and the screen SHALL say so. An entry
that is not an amount in that currency SHALL be rejected and SHALL create nothing.

#### Scenario: Cash is brought into line with a recount

- **WHEN** a `cash` рахунок's розрахунковий баланс is 47000 minor units UAH, the owner enters a
  фактичний залишок of "450,00" and confirms
- **THEN** a коригування of −2000 minor units UAH dated today is created on that рахунок and its
  розрахунковий баланс becomes 45000 minor units UAH

#### Scenario: The difference is named before it is written

- **WHEN** the owner enters a фактичний залишок of "500,00" against a розрахунковий баланс of
  47000 minor units UAH
- **THEN** the screen names a коригування of +3000 minor units UAH and creates nothing until the
  owner confirms

#### Scenario: An equal фактичний залишок creates nothing

- **WHEN** the owner enters a фактичний залишок equal to the розрахунковий баланс and confirms
- **THEN** no коригування is created and the screen says the two already agree

#### Scenario: A rejected entry writes nothing

- **WHEN** the owner enters "" or "abc" as the фактичний залишок and confirms
- **THEN** the entry is rejected, the reason is stated, and no коригування is created

## MODIFIED Requirements

### Requirement: An account can be renamed and archived from the screen

From a рахунок the owner SHALL be able to rename it, edit its opening balance, archive it, and
unarchive an archived one — with the semantics the accounts capability defines; no delete action
SHALL exist. That editing SHALL be reached by an action of its own, from the рахунок's рухи;
tapping the рахунок itself SHALL NOT open editing.

#### Scenario: Renaming is immediately visible

- **WHEN** the owner opens the editing action for "mono black" and renames it to "mono чорна"
- **THEN** the screen shows the account under the new name with its balance unchanged

#### Scenario: Archiving moves the account to the archived group

- **WHEN** the owner archives an account
- **THEN** it leaves its kind group for the archived group, its balance still shown

#### Scenario: The tap is not the editing gesture

- **WHEN** the owner taps a рахунок on Рахунки
- **THEN** no editing form appears, and the editing action is offered from the рахунок's рухи
