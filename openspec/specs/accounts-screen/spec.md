# accounts-screen Specification

## Purpose
The Рахунки screen — every account with its розрахунковий баланс, grouped by вид, and the place
where accounts are created, renamed and archived. It answers "where the money sits" from
transactions alone.

## Requirements

### Requirement: Accounts are shown grouped by kind with their computed balance

The Рахунки screen SHALL show every account under its вид, each with its розрахунковий баланс in
the account's own currency; archived accounts SHALL be shown apart from the active ones, not
mixed into their kind groups.

#### Scenario: An account shows its computed balance

- **WHEN** a UAH account has an opening balance of 100000 minor units and one expense of 30000
  minor units UAH
- **THEN** the Рахунки screen shows it with a balance of 70000 minor units UAH

#### Scenario: Accounts group by kind, archived apart

- **WHEN** the owner has an active `spending` account, an active `savings` account and an
  archived `spending` account
- **THEN** the two active accounts appear each under its вид and the archived one appears in a
  separate archived group

### Requirement: An account can be created from the screen

The owner SHALL create an account by giving a назва, a вид (`spending`, `savings`, `investment`,
`cash`, `debt`) and a валюта offered from UAH, EUR and USD; the початковий залишок SHALL be
optional and default to zero. The created account SHALL appear on the screen and be offered when
a transaction is recorded.

#### Scenario: A created account is usable immediately

- **WHEN** the owner creates a `cash` account "гаманець" in UAH without an opening balance
- **THEN** it appears under its вид with a balance of 0 minor units UAH and is offered as an
  account choice when recording a transaction

#### Scenario: The screen invites the first рахунок

- **WHEN** the owner opens Рахунки while no account exists
- **THEN** no вид groups and no archived group are shown, and the screen offers creating the
  first рахунок

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

### Requirement: A linked рахунок shows the bank balance and can be reconciled

The Рахунки screen SHALL show the latest known баланс банку beside the розрахунковий баланс of a
linked рахунок, both in that рахунок's currency, and SHALL offer «Звірити». Confirming «Звірити»
SHALL create the accounts capability's коригування for the difference and SHALL never overwrite
either balance without a транзакція.

#### Scenario: The two balances remain distinct

- **WHEN** a linked UAH рахунок has a розрахунковий баланс of 47000 minor units and its latest
  баланс банку is 50000 minor units UAH
- **THEN** Рахунки shows both amounts as UAH and offers «Звірити»

#### Scenario: Reconcile explains a surplus

- **WHEN** the owner confirms «Звірити» for those balances
- **THEN** a positive коригування of 3000 minor units UAH is created and the resulting
  розрахунковий баланс is 50000 minor units UAH

#### Scenario: Equal balances create no correction

- **WHEN** a linked рахунок's розрахунковий баланс equals its latest баланс банку and the owner
  chooses «Звірити»
- **THEN** no коригування is created and both balances remain unchanged

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

### Requirement: An інвестиційний рахунок shows вкладено, поточна вартість and прибуток

For each рахунок of вид `investment` the Рахунки screen SHALL show its вкладено — the рахунок's
розрахунковий баланс, named as вкладено rather than repeated as a second amount — and, when the
рахунок has a поточна вартість, that вартість together with the дата it carries and the
прибуток / збиток between the two, all in the рахунок's own currency and each named so none is
mistaken for another. A рахунок with no поточна вартість yet SHALL show its вкладено alone and
SHALL say that a вартість can be recorded. A рахунок of any other вид SHALL show none of this.

#### Scenario: All three numbers stand beside each other

- **WHEN** an `investment` рахунок in UAH has вкладено of 500000 minor units and a поточна
  вартість of 560000 minor units dated 2026-08-28
- **THEN** Рахунки shows it with вкладено 500000, поточна вартість 560000 as of 2026-08-28 and a
  прибуток of 60000, all as UAH

#### Scenario: A збиток is shown as the negative it is

- **WHEN** that рахунок's поточна вартість is 450000 minor units UAH against вкладено of 500000
- **THEN** Рахунки shows a збиток of −50000 minor units UAH

#### Scenario: Without a вартість only вкладено is shown

- **WHEN** an `investment` рахунок has no поточна вартість
- **THEN** Рахунки shows its вкладено, shows no прибуток, and offers recording a вартість

#### Scenario: Other вид рахунки are untouched

- **WHEN** a `spending` рахунок and a `savings` рахунок are shown
- **THEN** each shows its розрахунковий баланс as before, with no вкладено, no поточна вартість
  and no прибуток

### Requirement: The поточна вартість is recorded, replaced and cleared from the рахунок's row

From an інвестиційний рахунок on the Рахунки screen the owner SHALL record a поточна вартість in
that рахунок's own currency, replace it with a newer one, and clear it — with the semantics the
investments capability defines, including its rejections. The дата the recorded вартість carries
SHALL be the day it was entered. Nothing on the screen SHALL write a транзакція for it: the
рахунок's розрахунковий баланс SHALL be unchanged by recording, replacing or clearing, and no
«Звірити» SHALL be offered **against the поточна вартість** — the difference between a вартість and
a розрахунковий баланс is a прибуток, and a коригування for it would make it дохід. The звірка an
інвестиційний рахунок already has — against a фактичний залишок the owner types on the рахунок's
рухи — is untouched by this and stays exactly as it is for every вид of рахунок.

#### Scenario: A recorded вартість appears at once

- **WHEN** the owner records a поточна вартість of 560000 minor units for a UAH `investment`
  рахунок on 2026-08-28
- **THEN** the рахунок shows that вартість as of 2026-08-28 with its прибуток, and its
  розрахунковий баланс is what it was

#### Scenario: Replacing shows the newer figure and дата

- **WHEN** the owner records 575000 minor units UAH for that рахунок on 2026-09-30
- **THEN** the рахунок shows 575000 as of 2026-09-30 and the earlier figure is gone

#### Scenario: Clearing returns the рахунок to вкладено alone

- **WHEN** the owner clears that рахунок's поточна вартість
- **THEN** the рахунок shows вкладено alone and offers recording a вартість again, its
  транзакції and баланс untouched

#### Scenario: A rejected вартість changes nothing

- **WHEN** the owner tries to record a вартість the investments capability rejects, such as a
  negative сума
- **THEN** the screen says it was not saved and the рахунок's numbers are unchanged

#### Scenario: No коригування is ever offered for a вартість

- **WHEN** an `investment` рахунок's поточна вартість differs from its вкладено
- **THEN** nothing offers to звірити the two and no коригування is created for that difference

#### Scenario: The рахунок's own звірка is untouched

- **WHEN** the owner opens the рухи of that same `investment` рахунок
- **THEN** «Звірити» against a typed фактичний залишок is offered there exactly as it is for every
  other unarchived рахунок, and it compares the фактичний залишок with the розрахунковий баланс and
  never with the поточна вартість

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
