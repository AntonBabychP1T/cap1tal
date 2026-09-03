## ADDED Requirements

### Requirement: A picker shows at most a few choices and names what is behind the rest

Every picker on the recording path — the рахунок of a витрата, дохід or повернення, each of the
two рахунки of a переказ, the категорія of a витрата or повернення, and the джерело of a дохід —
SHALL show at most five offered choices at once, whether the транзакція is being recorded or
edited, plus whatever is currently chosen when that is not among the five. That enumeration is
every picker there is: a коригування is shown rather than edited, so it offers none. WHEN more
choices than that are offered, the picker SHALL also show one offer to see all of them, and that
offer SHALL name how many choices there are in total. WHEN five or fewer are offered, the picker
SHALL show all of them and SHALL show no such offer.

Throughout this capability, a choice being **offered** SHALL mean that the owner can pick it —
whether the picker shows it directly or it stands behind the offer to see all of them. A rule
about what is or is not offered therefore says nothing about which of the two places it is in.

The rule SHALL apply to what may be picked, not to what may be stored or asked: a choice reached
through the offer SHALL be stored exactly as one shown directly, and SHALL raise exactly the same
questions — including the сума asked anew when the chosen рахунок is of another currency.

#### Scenario: A long list of рахунки is five chips and an offer

- **WHEN** the owner has twenty-seven unarchived рахунки, none of them pre-chosen, and opens the
  recording form
- **THEN** the рахунок picker shows five of them and one offer naming all twenty-seven

#### Scenario: A pre-chosen рахунок outside the five is the sixth chip

- **WHEN** the owner has twenty-seven unarchived рахунки and the form opens on a remembered
  рахунок that is not among the five the picker would show
- **THEN** the picker shows those five and the remembered рахунок, six chips in all, with the
  remembered one marked as chosen, and one offer naming all twenty-seven

#### Scenario: A short list of рахунки is drawn whole

- **WHEN** the owner has three unarchived рахунки and opens the recording form
- **THEN** the рахунок picker shows all three and offers no way to see more

#### Scenario: Both legs of a переказ are shortened

- **WHEN** the owner has twenty-seven unarchived рахунки and records a переказ
- **THEN** «Звідки» shows at most five choices and its own offer, and «Куди» shows at most five
  choices and its own offer

#### Scenario: Editing a stored транзакція offers the same short pickers

- **WHEN** the owner opens a stored витрата for editing while twenty-seven категорії are offered
  and the категорія it carries is among the five most recently used
- **THEN** the категорія picker shows five of them and one offer naming all twenty-seven

#### Scenario: A choice made through the offer is stored like any other

- **WHEN** the owner records a витрата of "80" from a UAH рахунок and picks Groceries through the
  offer rather than from the five shown
- **THEN** a витрата of 8000 minor units UAH in категорії Groceries is stored, exactly as if
  Groceries had been shown directly

#### Scenario: A рахунок of another currency picked through the offer asks the сума anew

- **WHEN** the owner opens a stored витрата of 12550 minor units UAH and picks a USD рахунок
  through the offer rather than from the five shown
- **THEN** the сума is asked anew in USD exactly as it would be for a USD рахунок shown directly,
  and no UAH amount lands on the USD рахунок

### Requirement: The short list is what was reached for last, and always holds what is chosen

The short list of a категорія or джерело picker SHALL hold the категорії or джерела of the owner's
most recently stored транзакції carrying one, most recently used first and each at most once; the
short list of a рахунок picker SHALL hold the рахунки of the owner's most recently stored
транзакції the same way — every транзакція naming the рахунок it sits on, whatever its type, a
переказ naming both (the one the money left before the one it arrived at) and a коригування naming
the рахунок it was reconciled against. WHEN fewer than five have been reached for, the short list
SHALL be filled up to five from the head of the full list, so a picker is never shorter than the
choices allow. Whatever is currently chosen SHALL be in the short list — including a рахунок or категорія
that is archived and is there only because the stored транзакція already carries it — and a choice
the owner makes SHALL stay in the short list while the screen is open, so a row found through the
offer never has to be found through it twice.

Archived рахунки, archived категорії, archived джерела, «Коригування» and «Без джерела» SHALL be
offered neither in the short list nor behind the offer, exactly as today. Picking a choice SHALL
NOT reorder the short list, so nothing moves under the owner's finger.

#### Scenario: The last used категорія is one tap away

- **WHEN** the owner's latest витрати carry Groceries, then Eating out, then Groceries again, and
  the owner opens the категорія picker
- **THEN** Groceries and Eating out are among the five shown, Groceries before Eating out and each
  named once

#### Scenario: The рахунки with recent movement are the ones shown

- **WHEN** the owner's latest транзакції touch «гаманець», then a переказ from «mono біла» to
  «Банка на відпустку», while twenty-seven рахунки exist
- **THEN** «гаманець», «mono біла» and «Банка на відпустку» are among the five рахунки shown

#### Scenario: A fresh device still shows five choices

- **WHEN** no транзакція has been recorded yet and twenty-seven категорії are offered
- **THEN** the категорія picker shows five of them and one offer naming all twenty-seven

#### Scenario: An archived категорія is not resurrected by having been used

- **WHEN** a recently used категорія is archived
- **THEN** it is neither among the five shown nor behind the offer

#### Scenario: The рахунок the form opens on is visible

- **WHEN** the remembered рахунок carries no recent транзакція and twenty-seven рахунки exist
- **THEN** it is pre-chosen and it is among the choices shown, without the owner opening the offer

#### Scenario: An archived рахунок a stored транзакція sits on stays visible

- **WHEN** the owner opens a stored витрата whose рахунок has since been archived
- **THEN** that рахунок is shown as the chosen one, and it is offered for nothing else

#### Scenario: Picking does not move the chips

- **WHEN** the owner picks the third of the five категорії shown and looks at the picker again
- **THEN** the same five категорії stand in the same order, with the picked one marked as chosen

#### Scenario: A рахунок found through the offer does not have to be found twice

- **WHEN** the form opens on the remembered рахунок, the owner picks another through the offer,
  and then wants the remembered one back
- **THEN** both stand in the picker, the newly picked one marked as chosen, and going back to the
  remembered рахунок is one tap and not another trip through the offer

### Requirement: The offer opens the full list with a search

WHEN the owner takes the offer to see all choices, the picker SHALL show every choice it offers
together with a field that narrows them by name — matching anywhere in the name, ignoring letter
case in Ukrainian and in Latin. A search matching nothing SHALL say so rather than show an empty
picker. Picking a choice SHALL close the full list and leave that choice chosen and standing among
the few the picker shows. The owner SHALL also be able to close the full list without picking,
leaving the previous choice untouched, and on every screen that can have one open the phone's own
«назад» SHALL close the full list before it leaves the screen.

The full list SHALL keep the order it already has: рахунки and джерела by name in Ukrainian order,
категорії the same but with «Без категорії» leading them wherever it is offered at all — it is
what a витрата arrives carrying, so the default belongs under the thumb. That order is also what the short list is topped up from,
so what a picker shows before the owner has recorded anything is the head of it and not an
arbitrary few.

#### Scenario: A fresh device is topped up from the head of the list

- **WHEN** no транзакція has been recorded yet and the owner opens the категорія picker
- **THEN** «Без категорії» is shown first and the four categories after it are the first four of
  the Ukrainian order, and the same four are shown again on the next opening

#### Scenario: The full list is searched by name

- **WHEN** the owner opens all категорії and types «прод»
- **THEN** only the категорії whose names contain «прод», in any letter case, are shown

#### Scenario: A search that matches nothing says so

- **WHEN** the owner opens all рахунки and types text no рахунок's name contains
- **THEN** the picker says that nothing was found, and no рахунок is shown

#### Scenario: Picking from the full list collapses it

- **WHEN** the owner opens all рахунки, picks one that was not among the few shown, and looks at
  the picker again
- **THEN** the full list is closed, that рахунок is chosen, and it is among the few the picker now
  shows

#### Scenario: Closing the full list changes nothing

- **WHEN** the owner opens all категорії and closes them without picking
- **THEN** the категорія chosen before is still chosen and nothing was stored

#### Scenario: «Назад» closes the full list before the screen

- **WHEN** the owner has the full list of рахунки open on the recording form and uses the phone's
  «назад»
- **THEN** the full list closes and the form is still open, with everything typed into it kept

## MODIFIED Requirements

### Requirement: A manual expense needs only amount and account

Recording SHALL default to витрата and SHALL require only the сума and the рахунок; the date
SHALL default to today and be changeable. The amount SHALL be entered in the account's currency
as major units with an optional fractional part and SHALL be stored exactly as integer minor
units; an amount that is not positive, has more fractional digits than the currency's minor
unit, or is not a number SHALL be rejected. The expense SHALL default to the category "Без
категорії" — the reserved uncategorised row — and the owner SHALL be able to pick any unarchived
category of the editable list instead; archived categories SHALL NOT be offered, and neither
SHALL «Коригування» — a коригування is a transaction type, not a pickable label.

#### Scenario: Typed amount becomes exact minor units

- **WHEN** the owner records an expense of "125.50" from a UAH account
- **THEN** an expense of 12550 minor units UAH dated today is stored, in category "Без категорії"

#### Scenario: A whole amount needs no fractional part

- **WHEN** the owner records an expense of "200" from a UAH account
- **THEN** an expense of 20000 minor units UAH is stored

#### Scenario: Too many fractional digits are rejected

- **WHEN** the owner enters "12.345" as the amount for a UAH account
- **THEN** recording is rejected and nothing is stored

#### Scenario: A non-positive amount is rejected

- **WHEN** the owner enters "0" or "-5" as the amount
- **THEN** recording is rejected and nothing is stored

#### Scenario: A date other than today can be chosen when recording

- **WHEN** the owner records an expense of "125.50" from a UAH account with the date set to
  2026-07-31 instead of today
- **THEN** an expense of 12550 minor units UAH dated 2026-07-31 is stored and belongs to July

#### Scenario: A picked category is stored

- **WHEN** the owner records an expense of "80" from a UAH account and picks the category
  Groceries
- **THEN** an expense of 8000 minor units UAH in category Groceries is stored

#### Scenario: Archived categories are not offered

- **WHEN** the category Pets is archived and the owner opens the category picker while recording
- **THEN** Pets is not among the offered categories, neither among those shown directly nor behind
  the offer to see all of them

#### Scenario: «Коригування» is not offered

- **WHEN** the owner opens the category picker while recording a витрата and then opens all
  categories
- **THEN** «Коригування» is among the offered categories in neither place, while «Комісія» and
  «Без категорії» are offered

### Requirement: «Без категорії» is highlighted and categorised in one tap

The feed SHALL visibly mark every transaction carrying "Без категорії". From that mark the owner
SHALL be able to pick an unarchived category and have it stored on that transaction without
opening editing; the mark SHALL disappear with the pick. The categories offered there SHALL follow
the same rule as the recording form's: at most five shown, the rest behind one offer naming how
many категорії it offers in all, the five being those the owner reached for most recently and topped up from the
head of the full list. "Без категорії" itself SHALL NOT be among them — it is what the transaction
is being moved away from.

#### Scenario: An uncategorised expense is marked in the feed

- **WHEN** the feed holds a витрата in "Без категорії" and a витрата in Groceries
- **THEN** the "Без категорії" one is visibly marked and the Groceries one is not

#### Scenario: One tap categorises from the feed

- **WHEN** the owner uses the mark on a "Без категорії" витрата and picks Groceries
- **THEN** the same transaction now carries Groceries, without the editing screen having opened,
  and the mark is gone

#### Scenario: The feed's picker is short too

- **WHEN** the owner uses the mark on a "Без категорії" витрата while twenty-six категорії are
  offered
- **THEN** at most five категорії are shown, "Без категорії" is not one of them, and one offer
  names all twenty-six

#### Scenario: A категорія behind the offer still categorises in the feed

- **WHEN** the owner uses the mark on a "Без категорії" витрата and picks Pets through the offer
  to see all категорії
- **THEN** the same transaction now carries Pets, the editing screen never opened, and the mark is
  gone

## REMOVED Requirements

### Requirement: Recently used категорії and джерела are offered ahead of the full list

**Reason**: The recent row and the full list below it were two pickers answering one question, and
the full list is precisely the wall this change removes. Every rule it carried is kept, split
across the three requirements that replace it: recency, most recently used first, each once, and
archived rows and «Коригування» offered in neither go to "The short list is what was reached for
last, and always holds what is chosen", which extends them to рахунки; "the full list SHALL remain
available, in the order it already has" goes to "The offer opens the full list with a search",
which keeps that order, names it, and makes it what the short list is topped up from.

One rule it carried is deliberately reversed rather than kept: "WHEN nothing has been recorded yet,
only the full list SHALL be shown", with its scenario "A fresh device offers only the full list".
There is no full list on the screen any more for a fresh device to fall back to, so a picker that
has no recents to show is topped up from the head of the list instead — see the scenarios "A fresh
device still shows five choices" and "A fresh device is topped up from the head of the list", which
say what replaces it. That reversal is the point of the change: the wall goes for the fresh device
too.

**Migration**: None for stored data — nothing was ever stored for this. On screen the two rows
become one: the label of the surviving row is the question's («Категорія», «Джерело», «Рахунок»),
and the full list is behind the offer to see all of them.
