## ADDED Requirements

### Requirement: Головний leads with the month's залишилось

Головний SHALL open with the status of the current calendar month — the month of the device's
today — as its first and largest figure: залишилось, per currency, exactly as the monthly-picture
capability computes it from the stored транзакції, named together with the month it is about so it
cannot be read as a balance. Витрачено for the same month SHALL be shown with it, per currency,
under its own name. Amounts of different currencies SHALL NOT be summed into one figure; two
currencies read as two amounts. Nothing SHALL be stored to produce these numbers and no new
calculation SHALL be introduced: they are the same numbers Місяць shows for that month.

The status SHALL show these two numbers and no more. Залишилось SHALL keep the meaning the
monthly-picture capability gives it — дохід minus витрачено, інвестовано, відкладено and позичено —
so the difference between the two shown numbers is not the month's whole story, and Місяць, one tap
away, is where інвестовано, відкладено, позичено and дохід are read.

WHEN a currency of the month has no дохід above zero, the status SHALL state plainly that no дохід
is recorded in it yet, so a залишилось that is negative by construction carries its reason beside
it; the statement SHALL name the currency when the month holds more than one. WHEN the month holds
no транзакція at all, the status SHALL say so instead of showing zeroes.

Tapping the status SHALL open Місяць, where the same month is read in full.

#### Scenario: The month's залишилось is the first thing on the screen

- **WHEN** the owner opens the app in вересень, whose picture holds залишилось of 6031500 minor
  units UAH and витрачено of 168500 minor units UAH
- **THEN** Головний shows 6031500 minor units UAH as its main figure, named as вересень's
  залишилось, with 168500 minor units UAH as витрачено beside it

#### Scenario: Two currencies stay apart

- **WHEN** the current month holds залишилось in UAH and залишилось in USD
- **THEN** Головний shows the UAH amount and the USD amount as two amounts and no combined figure

#### Scenario: A month before its first дохід says why залишилось is negative

- **WHEN** the current month holds UAH витрати of 265000 minor units and no дохід in any currency
- **THEN** Головний shows залишилось as −265000 minor units UAH and states that no дохід is
  recorded for the month yet

#### Scenario: The currency without дохід is the one named

- **WHEN** the current month holds UAH дохід with UAH витрати, and USD витрати with no USD дохід
- **THEN** Головний states that no дохід is recorded in USD yet and says nothing of the kind about
  UAH

#### Scenario: Money moved into a jar is missing from neither number

- **WHEN** the current month holds UAH дохід of 5000000 minor units, UAH витрати of 200000 and a
  transfer of 1000000 minor units UAH into a jar
- **THEN** Головний shows витрачено of 200000 minor units UAH and залишилось of 3800000 minor units
  UAH — the jar top-up counted in залишилось as відкладено, and named as such on Місяць, not on
  Головний

#### Scenario: A transfer onto an інвестиційний рахунок is not витрачено either

- **WHEN** the current month holds UAH дохід of 5000000 minor units and a transfer of 800000 minor
  units UAH onto an інвестиційний рахунок, and no витрата
- **THEN** Головний shows витрачено of 0 and залишилось of 4200000 minor units UAH — the money is
  інвестовано, which is neither spent nor still available

#### Scenario: An empty month says it is empty

- **WHEN** the current month holds no транзакція
- **THEN** Головний states that nothing is recorded for the month yet rather than showing zeroes

#### Scenario: The status leads to Місяць

- **WHEN** the owner taps the month's status on Головний
- **THEN** Місяць opens on that month

### Requirement: The money held is a secondary line that leads to Рахунки

Below the month's status Головний SHALL show the money held the accounts capability defines — the
total of every unarchived рахунок, per currency — as one secondary line, with the approximate UAH
equivalent beside it, visibly marked as approximate, only when a non-UAH currency participates and
every participating currency has a known monobank rate. It SHALL NOT be the screen's main figure,
and it SHALL be named so it cannot be read as a monthly number: it is what the рахунки hold, not
the month's залишилось, and the two SHALL NOT share a name. How balances are computed SHALL be
unchanged. Tapping the line SHALL open Рахунки.

WHEN no unarchived рахунок exists, no total SHALL be shown, Головний SHALL state that a рахунок
must be created first and SHALL offer going to Рахунки, and the latest-transactions section SHALL
still show what is stored.

#### Scenario: The total is secondary to the month

- **WHEN** the owner opens the app with unarchived рахунки holding 32974800 minor units UAH while
  the month's залишилось is 6031500 minor units UAH
- **THEN** Головний shows the month's залишилось as its main figure and the 32974800 minor units
  UAH as a secondary line under its own name

#### Scenario: The month's number is not this number

- **WHEN** the month's залишилось is −265000 minor units UAH while the рахунки hold 1305000 minor
  units UAH
- **THEN** the two are shown under different names and neither is presented as the other

#### Scenario: The total leads to Рахунки

- **WHEN** the owner taps the money-held line on Головний
- **THEN** Рахунки opens

#### Scenario: Two currencies read as two amounts

- **WHEN** the unarchived рахунки hold 32974800 minor units UAH and 70000 minor units USD
- **THEN** the line shows both amounts separately and no combined figure

#### Scenario: With no рахунок the screen says so and still shows what is stored

- **WHEN** the app is opened while no unarchived рахунок exists and транзакції are stored
- **THEN** no total is shown, Головний states that a рахунок must be created first and offers
  going to Рахунки, and the latest-transactions section still shows the stored транзакції

#### Scenario: Every рахунок archived is the same case

- **WHEN** the app is opened while every рахунок is archived
- **THEN** Головний says the same thing it says when no рахунок exists at all, and shows no total

### Requirement: «Потребує уваги» appears only when something is waiting

Головний SHALL carry a «Потребує уваги» section that exists only while something is actually
waiting on the owner: транзакції carrying «Без категорії», and pending чернетки зі сповіщень.
WHEN neither exists, the section SHALL NOT be rendered at all — no heading, no empty state and no
space held for it.

The section SHALL name how many stored транзакції carry «Без категорії», counted over everything
stored and not only over what the latest-transactions section shows, and SHALL offer going to
«Транзакції», where they are marked as the transaction-search capability defines. A дохід carrying
«Без джерела» SHALL NOT be counted: it is a different reserved row, and naming it here would ask
the owner to fix something this section never leads to.

The section SHALL hold the pending чернетки surface the bank-notifications capability defines,
unchanged — each чернетка with its рахунок, its date, its text and what it proposes, confirmed or
dismissed in place.

The section SHALL introduce no new state, no new type of транзакція and no stored number: it is a
reading of what «Без категорії» and the pending чернетки already are.

#### Scenario: Nothing waiting, no section

- **WHEN** no stored транзакція carries «Без категорії» and no чернетка is pending
- **THEN** Головний shows no «Потребує уваги» section and no empty placeholder in its place

#### Scenario: Uncategorised транзакції are named and counted

- **WHEN** two stored транзакції carry «Без категорії»
- **THEN** «Потребує уваги» says that two транзакції are without a категорія and offers going to
  «Транзакції»

#### Scenario: The count is of everything stored, not of the latest ones

- **WHEN** seven stored транзакції carry «Без категорії» and only one of them is among the latest
  the section shows
- **THEN** «Потребує уваги» names seven

#### Scenario: A дохід «Без джерела» is not counted

- **WHEN** the only thing stored without a label is a дохід carrying «Без джерела»
- **THEN** «Потребує уваги» is not shown

#### Scenario: A pending чернетка puts the section on the screen

- **WHEN** one чернетка is pending and no транзакція carries «Без категорії»
- **THEN** «Потребує уваги» is shown, holding that чернетка with its рахунок, its date, its text
  and what it proposes, to confirm or dismiss

#### Scenario: Answering the last item takes the section away

- **WHEN** the only pending чернетка, dated today and matched by a правило to a категорія, is
  confirmed while no транзакція carries «Без категорії»
- **THEN** the confirmed транзакція stands at the top of the latest-transactions section and
  Головний shows no «Потребує уваги» section

#### Scenario: A чернетка confirmed into «Без категорії» keeps the section

- **WHEN** the only pending чернетка, whose text no правило matches, is confirmed while no
  транзакція carries «Без категорії»
- **THEN** «Потребує уваги» is still shown, now naming one транзакція without a категорія instead
  of the чернетка

#### Scenario: Categorising from the feed lowers the count

- **WHEN** «Потребує уваги» names three транзакції without a категорія and the owner picks a
  категорія on one of them from the latest-transactions section
- **THEN** «Потребує уваги» names two

### Requirement: Recording opens from a «+» on Головний

Головний SHALL offer recording a транзакція from a control reachable without scrolling — a «+»
standing over the screen's bottom-right corner — and SHALL NOT hold the entry form in its own
content. Tapping the «+» SHALL open the entry form on its own screen, pushed over Головний, which
records exactly what this capability's recording requirements define: витрата, переказ, дохід and
повернення, the same fields, the same refusals, the same комісія and дохід «Відсотки» proposals,
the same remembered рахунок and the same recently used категорії and джерела. There SHALL be one
entry form in the app, not two.

Leaving that screen SHALL return to Головний, where a транзакція just recorded stands in the
latest-transactions section in the place its date gives it — at the top when it is dated today.
WHEN no unarchived рахунок exists, the entry screen SHALL state that a рахунок must be created
first and SHALL offer going to Рахунки, and nothing SHALL be recorded until one exists.

#### Scenario: The «+» opens the form

- **WHEN** the owner taps the «+» on Головний
- **THEN** the entry form opens as its own screen, offering витрата, переказ, дохід and повернення

#### Scenario: Головний holds no form of its own

- **WHEN** the owner opens Головний
- **THEN** no сума field, no категорія picker and no «Записати» stand in the screen's content

#### Scenario: What was recorded is on Головний when the owner returns

- **WHEN** the owner records a витрата of "1200" dated today from the entry screen and goes back
- **THEN** Головний shows that витрата at the top of the latest-transactions section and the
  month's витрачено counts it

#### Scenario: A back-dated транзакція takes its own place

- **WHEN** the owner records a витрата dated a week ago and goes back
- **THEN** it stands in the latest-transactions section in the place its date gives it, not
  necessarily first

#### Scenario: With no рахунок nothing can be recorded yet

- **WHEN** the owner opens the entry screen while no unarchived рахунок exists
- **THEN** it offers no рахунок, states that a рахунок must be created first, offers going to
  Рахунки, and nothing can be recorded

### Requirement: Opening Головний again shows it from the month's status

WHEN the owner opens the Головний tab after having been on another tab, the screen SHALL be shown
from its top — the month's status — rather than at the position it was scrolled to when it was
left. Scrolling within Головний without leaving it SHALL NOT be affected, and the
latest-transactions section SHALL keep showing what is stored: only where the screen starts
changes, never what it holds.

#### Scenario: Coming back lands on the month's status

- **WHEN** the owner scrolls Головний down into its latest transactions, opens Місяць, and opens
  Головний again
- **THEN** Головний is shown from its top, on the month's status, not from the middle of the list

#### Scenario: Scrolling within Головний is untouched

- **WHEN** the owner scrolls Головний down and stays on it
- **THEN** the screen stays where it was scrolled to

## MODIFIED Requirements

### Requirement: Recording is visibly confirmed

WHEN a транзакція is stored from the entry form, the entry screen SHALL confirm it where the owner
is already looking, without scrolling, naming the сума with its currency and what it was recorded
as — the категорія of a витрата or повернення, the джерело of a дохід, both рахунки of a переказ.
WHEN a комісія or a дохід «Відсотки» was stored alongside a переказ, the confirmation SHALL say
so. A refused recording SHALL show its own refusal and no confirmation.

The screen SHALL stay open after a store, ready for the next транзакція: the сума, the сума that
arrived and the опис SHALL be cleared, the picked категорія and джерело SHALL be dropped and the
дата SHALL return to today, while the type and the рахунок SHALL stay as they were — the рахунок
being the one this recording has just remembered. Any change to any field afterwards SHALL end the
confirmation, so it never describes a form that has moved on.

#### Scenario: The owner sees what was recorded

- **WHEN** the owner records a витрата of "1200" in Groceries from a UAH рахунок
- **THEN** the screen confirms that 120000 minor units UAH in Groceries was recorded, without the
  owner scrolling anywhere

#### Scenario: An accepted комісія is part of the confirmation

- **WHEN** the owner records a same-currency переказ that arrives short and accepts the proposed
  комісія
- **THEN** the confirmation names the переказ and the комісія that was stored with it

#### Scenario: A refusal is not a confirmation

- **WHEN** the owner taps «Записати» with no сума entered
- **THEN** the refusal is shown, nothing is stored, and no confirmation appears

#### Scenario: The form is ready for the next транзакція

- **WHEN** a витрата in Groceries from «гаманець» is stored from the entry screen
- **THEN** the screen stays open with the confirmation, the сума and опис empty, no категорія
  picked and the дата back to today, while витрата and «гаманець» are still chosen

### Requirement: Everything stored is reachable from Головний

The latest-transactions section SHALL show at most the five latest транзакції, ordered newest
first — by date, then by recording recency — each showing its amount with currency, its account
(both accounts for a переказ) and its date. It SHALL make it plain that it shows only the latest
ones, and SHALL offer a way to all of them, where they can be searched and narrowed as the
transaction-search capability defines. The offer SHALL be present whether or not more транзакції
are stored than the section shows.

#### Scenario: The section stops at five

- **WHEN** twelve транзакції are stored
- **THEN** Головний shows the five latest, newest first, and no more

#### Scenario: The whole history is one tap from the feed

- **WHEN** more транзакції are stored than the latest-transactions section shows
- **THEN** the section says it shows the latest only and offers going to all транзакції

#### Scenario: The way there does not depend on having a long history

- **WHEN** three транзакції are stored
- **THEN** the offer to go to all транзакції is still shown

## REMOVED Requirements

### Requirement: Opening the app shows quick entry and the latest transactions

**Reason**: Головний no longer carries the entry form in its content: it opens on the month's
status, the money held, what needs attention and the five latest транзакції, and recording opens
from the «+» over its bottom-right corner. Replaced by «Головний leads with the month's
залишилось» (what the screen opens with), «Recording opens from a «+» on Головний» (recording,
including the case where no рахунок exists yet), «The money held is a secondary line that leads to
Рахунки» (the same case as seen from Головний) and «Everything stored is reachable from Головний»
(the latest-transactions section, its order, what a line shows and its ceiling).

**Migration**: Nothing stored changes and no behaviour is lost — every field of the form, every
refusal and every proposal behaves exactly as before, one tap further away, and the ordering and
content of the latest-transactions section are carried verbatim into «Everything stored is
reachable from Головний»; only its ceiling moves from fifty to five.

### Requirement: Головний opens with how much money there is

**Reason**: The money held is no longer what Головний opens with, and «above the entry form» names
a form the screen no longer holds. The month's залишилось is the screen's figure now, and the total
is the secondary line beneath it. Replaced by «The money held is a secondary line that leads to
Рахунки», which keeps the total itself, the approximation and its honesty rule, the name that
cannot be read as a monthly number, and the invitation to create the first рахунок, and adds where
tapping it leads.

**Migration**: None. The total is the same number, computed the same way from the same balances;
only where it stands on the screen and what tapping it does have changed.

### Requirement: Opening Головний again shows it from its top

**Reason**: The top of Головний is no longer «the money and the entry form» the requirement names:
it is the month's status. The behaviour itself — coming back to the tab starts at the top, while
scrolling within the screen is untouched — is kept verbatim under «Opening Головний again shows it
from the month's status».

**Migration**: None. Nothing stored changes and the screen behaves as before on returning to the
tab; only what stands at the top of it has moved.
