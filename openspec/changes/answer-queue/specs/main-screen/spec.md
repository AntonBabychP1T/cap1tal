## ADDED Requirements

### Requirement: One rail row names what waits for an answer and opens the queue

WHEN anything waits for the owner's answer — a pending чернетка, a можливий дубль the answer-queue
capability lists unnarrowed, a витрата or повернення «Без категорії», or a дохід «Без джерела» —
the fixed service rail directly below Головний's header SHALL carry one compact row «Що потребує
відповіді» naming how many entries wait in all and, in the queue's order of groups, how many of
each kind present: «N чернеток», «N дублів», «N без категорії», «N без джерела», each in the
grammatical form its number asks. Its count SHALL be exactly the count of entries the unnarrowed
queue holds; the bank the app cannot hear SHALL not be counted in it, as the rail states that in
its own row. Its tap SHALL open the queue unnarrowed. The row SHALL follow the rail's rules: outside
the configurable widgets, never hidden or reordered, visible when «Останні 5 транзакцій» is hidden,
taking no space when nothing waits, and making no network request of its own. The offer of the
latest-transactions section to go to all транзакції SHALL keep opening the whole history.

#### Scenario: Count and destination agree

- **WHEN** two чернетки are pending, seven витрати and one повернення carry «Без категорії» across
  several months, one дохід carries «Без джерела», and one можливий дубль of October is stated
- **THEN** the rail row reads «Що потребує відповіді: 12» with «2 чернетки · 1 дубль · 8 без
  категорії · 1 без джерела», and its tap opens the queue holding exactly those twelve entries

#### Scenario: Hiding the feed does not hide the row

- **WHEN** seven витрати carry «Без категорії» and «Останні 5 транзакцій» is hidden
- **THEN** the rail row is still visible and opens the queue

#### Scenario: Answering the last entry removes the row

- **WHEN** one дохід «Без джерела» is the only entry and the owner gives it «Зарплата» from the
  feed's mark
- **THEN** the rail row disappears without an empty attention heading

#### Scenario: A bank without a token is its own row and is not counted

- **WHEN** nine рахунки are linked to monobank, no token is configured and three витрати carry «Без
  категорії»
- **THEN** the rail carries the no-token row and the row «Що потребує відповіді: 3», and the bank is
  not among the three

#### Scenario: The feed's way to all транзакції is not narrowed

- **WHEN** the owner follows the latest-transactions section's offer to see all транзакції
- **THEN** «Транзакції» opens on the whole history with no narrowing in force

## MODIFIED Requirements

### Requirement: The feed shows the latest five legible records

The latest-transactions section SHALL show at most five records across all history in descending date then recording-recency order, each with a category/type icon plus text, the назва of the продавець its опис is recognised as — or the stored опис itself when it is recognised as none — when an опис is present, date, account (both for a переказ) and exact amount/currency with explicit money direction (expense −, income/повернення +, коригування its sign, переказ a directional arrow with both leg amounts when different), and offer «Усі» and existing editing and one-tap categorisation.

#### Scenario: Five of a long history
- **GIVEN** eight records including equal-date records and a backdated newly entered record
- **WHEN** the feed is read
- **THEN** it shows the first five in date/recording-recency order, not insertion order alone, and «Усі» opens the existing complete searchable history

#### Scenario: Short or empty history
- **GIVEN** three records, or none
- **WHEN** the feed is read
- **THEN** it shows those three, or «Поки нічого не записано», and «Усі» is available in both cases

#### Scenario: Description and type stay distinguishable
- **GIVEN** a «Без категорії» expense with опис «СІЛЬПО Київ» that no написання recognises, an income «Без джерела» and a cross-currency transfer
- **WHEN** their rows are read
- **THEN** description never replaces category/source/type, the transfer exposes both accounts/amounts, and no meaning depends only on color
- **AND** row taps open existing transaction editing, with existing correction restrictions

#### Scenario: A recognised опис reads as its продавець
- **GIVEN** «АТБ» holds the написання "atb" and a витрата carries the опис «ATB MARKET 23»
- **WHEN** its row is read
- **THEN** it shows «АТБ» where it would show the опис, and never in place of its category

#### Scenario: Categorisation stays in place
- **GIVEN** an uncategorised expense with a stored опис in the feed
- **WHEN** its categorisation action is used
- **THEN** the existing short picker and rule offer work without opening the editor, and the refreshed categories and the rail row «Що потребує відповіді» reflect the stored choice

### Requirement: Operational alerts remain compact and actionable

An existing actionable sync failure SHALL occupy at most one collapsed service row in the fixed service rail directly below the header and before every widget, leading to existing details/retry. Pending чернетки SHALL NOT have a row of their own: they are counted in the rail row «Що потребує відповіді» and confirmed or dismissed in the queue, as the answer-queue capability defines. These rows SHALL remain outside the configurable widget list, SHALL NOT be hideable or reorderable, and SHALL take no space when absent.

#### Scenario: Many drafts do not bury the dashboard
- **GIVEN** fifty pending чернетки, a rejected token and every configurable widget hidden
- **WHEN** Головний opens
- **THEN** two compact service rows remain visible directly below the header — the failure row and «Що потребує відповіді» naming fifty чернеток — no draft body renders on Головний, and the failure action opens monobank details

#### Scenario: Draft confirmation updates the same record
- **GIVEN** a pending чернетка listed in the queue opened from the rail row
- **WHEN** the owner confirms its proposed amount or supplies the required amount
- **THEN** existing rules create the transaction, every visible financial widget of Головний is refreshed on return, and the draft no longer waits
- **AND** dismissal uses existing confirmation and creates no transaction

#### Scenario: Routine postponement is not an error
- **GIVEN** a healthy sync ended «перенесено» with no existing needs-owner condition
- **WHEN** Головний opens
- **THEN** no failure row is displayed

#### Scenario: Confirming the last чернетка into «Без категорії» hands off between both alerts
- **GIVEN** the only pending чернетка, whose text no правило matches, is the only thing needing attention
- **WHEN** the owner confirms it in the queue and returns to Головний
- **THEN** the rail row «Що потребує відповіді» names one entry, «1 без категорії», instead of one чернетка, so the owner is never left facing neither the row nor the transaction it produced

### Requirement: Categorising a транзакція offers to remember it as a правило

After a категорія is set on a stored витрата or повернення that carries an опис — through the
«Без категорії» mark in the feed, through the queue «Що потребує відповіді» or through the editing
screen alike — the owner SHALL be offered a правило that would make the same decision next time,
with the merchant criterion already proposed from that опис — the продавець it is recognised as,
or a pattern — and changeable before it is stored: a pattern is editable, and a продавець can be
switched to the pattern proposed from the опис. After a stored витрата that carries an опис is
retyped into a переказ from editing, the owner SHALL likewise be offered a правило-переказ onto the
destination рахунок just chosen. After a джерело is set on a stored дохід that carries an опис —
through the «Без джерела» mark, through the queue or through editing alike — the owner SHALL
likewise be offered a правило-джерело naming that джерело. Accepting SHALL store the правило;
declining SHALL store none and SHALL leave the категорія or джерело just set — or the переказ just
stored — exactly as it is. Whether the правило is stored or not, the категорія, джерело or переказ
SHALL already be stored before the offer is made, so dismissing the offer — or leaving the screen —
can never lose the owner's decision.

The offer SHALL name what it would remember in words the owner can check before accepting: the
pattern, or «продавець» and the продавець's назва, and the категорія it would target, or the same
criterion and «переказ на» the destination рахунок's назва, or the same criterion and the джерело
it would give. The cases in which no offer is made at all belong to the categorisation-rules
capability.

#### Scenario: One tap in the feed, then the offer

- **WHEN** the owner uses the «Без категорії» mark on a витрата carrying the опис "СІЛЬПО 123
  Київ", which no написання recognises, and picks Groceries
- **THEN** the витрата carries Groceries and an offer appears naming the pattern "сільпо" and
  Groceries

#### Scenario: A recognised опис offers its продавець

- **WHEN** «АТБ» holds "atb", no правило names it, and the owner uses the «Без категорії» mark on a
  витрата carrying the опис "ATB MARKET 23" and picks Groceries
- **THEN** an offer appears naming «продавець АТБ» and Groceries, with a way to switch to the
  pattern "atb market"

#### Scenario: Accepting the offer stores the правило

- **WHEN** the offer naming the pattern "сільпо" and Groceries is accepted unchanged
- **THEN** the правило "сільпо → Groceries" exists

#### Scenario: Declining keeps the категорія

- **WHEN** that offer is declined
- **THEN** the витрата still carries Groceries and no правило was stored

#### Scenario: The editing screen offers it too

- **WHEN** the owner opens a витрата carrying the опис "УКЛОН" in editing, changes its категорія
  to Transport and saves
- **THEN** the витрата carries Transport and an offer appears naming the pattern "уклон" and
  Transport

#### Scenario: Retyping into a переказ offers the правило-переказ

- **WHEN** the owner retypes a витрата on platinum carrying the опис "Округлення балансу «Резерв»"
  into a переказ onto РЕЗЕРВ and saves
- **THEN** the переказ is stored and an offer appears naming the pattern "округлення балансу" and
  «переказ на РЕЗЕРВ»

#### Scenario: Accepting the правило-переказ pairs the history too

- **WHEN** that offer is accepted while two more «Без категорії» витрати carrying "Округлення
  балансу «Резерв»" are stored on platinum
- **THEN** the правило-переказ exists, both витрати are перекази onto РЕЗЕРВ, and the owner is told
  two витрати became перекази

#### Scenario: Giving a дохід its джерело offers the правило-джерело

- **WHEN** the owner uses the «Без джерела» mark on a дохід of 1250 minor units UAH carrying the
  опис "Відсотки 12.50 UAH", which no написання recognises, and picks «Відсотки»
- **THEN** the дохід carries «Відсотки» and an offer appears naming the pattern "відсотки" and the
  джерело «Відсотки»

#### Scenario: Declining the правило-джерело keeps the джерело

- **WHEN** that offer is declined
- **THEN** the дохід still carries «Відсотки» and no правило was stored

## REMOVED Requirements

### Requirement: Uncategorised records are a compact feed banner

**Reason**: The banner counted only «Без категорії» and opened «Транзакції»; it is replaced by the
rail row «Що потребує відповіді», which counts every kind of unanswered entry and opens the queue
where each is answered in place.
**Migration**: See "One rail row names what waits for an answer and opens the queue"; the «Без
категорії» narrowing of «Транзакції» stays reachable from the list itself.

### Requirement: «Потребує уваги» leads to the транзакції without a категорія

**Reason**: The row it governed is gone; what waits is answered in the queue, whose «Без категорії»
group lists the same set the narrowing shows.
**Migration**: See "One rail row names what waits for an answer and opens the queue" and the
answer-queue capability; the feed's offer to see all транзакції keeps opening the whole history,
as that requirement now states.
