## Purpose

The visible half of FR-S3: the Налаштування section where the owner grants notification access
and watches bank apps mapped onto рахунки, the collection that drains the device's
captured-notification queue through the engine into storage without losing or doubling
anything, and the Головний surface where чернетки are confirmed, completed with a сума, or
dismissed.

## ADDED Requirements

### Requirement: The «Сповіщення банків» section explains the permission and reports its state

The «Сповіщення банків» section SHALL state what reading bank notifications is for and that
nothing read leaves the phone, and SHALL show notification access as the device reports it.
While access is denied it SHALL offer opening the system screen where the owner grants it, and
SHALL show the fresh state when the owner returns. While granting is not possible on this build
it SHALL say reading bank notifications is not available and SHALL offer no way to grant.
While access is granted it SHALL show the watched apps management.

#### Scenario: Granting flips the section to granted

- **WHEN** the section shows denied, the owner opens the offered system screen, grants access
  there and returns
- **THEN** the section shows granted and offers the watched apps management

#### Scenario: An unsupported build offers nowhere to go

- **WHEN** the owner opens the section on a build where notification access cannot be granted
- **THEN** the section says reading bank notifications is not available and offers no system
  screen

#### Scenario: Revoked access is reported as denied again

- **WHEN** access was granted, the owner revokes it in the system settings and reopens the
  section
- **THEN** the section shows denied and offers the system screen again

### Requirement: A watch is added by picking an app and its рахунок, accepted by the capture layer first

The section SHALL let the owner add a watch by choosing a known bank app by name or by naming
an app package by hand, mapped to exactly one existing unarchived рахунок; archived рахунки
SHALL NOT be offered. The watch SHALL be stored only after the capture layer accepts the
resulting watched set; a refused or unavailable answer SHALL leave the stored watches and the
list unchanged, with the answer shown. The monobank app SHALL never be offered among the known
apps, and a hand-named monobank package SHALL be refused — mono is synced by its API, and a
second capture path would only manufacture duplicates. An app already watched SHALL NOT gain a
second watch: adding it again SHALL be rejected while the existing watch stands. The list SHALL
show every watch with its app and its рахунок; a watch whose рахунок was later archived SHALL
stay listed and removable.

#### Scenario: A watched app appears with its рахунок

- **WHEN** access is granted and the owner watches a known bank app mapped to the unarchived
  UAH рахунок «Приват»
- **THEN** the capture layer was told the new watched set, and the list shows that app with
  «Приват»

#### Scenario: The monobank app is not offered and its package is refused

- **WHEN** the owner opens the known-apps picker, and then hand-names a package of the monobank
  family
- **THEN** monobank is not among the offered apps, the hand-named package is refused with the
  refusal shown, and the stored watches are unchanged

#### Scenario: A refused set changes nothing

- **WHEN** the capture layer refuses the watched set an addition would produce
- **THEN** no watch is stored, the list is unchanged, and the refusal is shown

#### Scenario: An already-watched app is rejected

- **WHEN** an app is already watched and the owner hand-names its package again
- **THEN** the addition is rejected and the existing watch stands unchanged

#### Scenario: An archived рахунок is not offered

- **WHEN** the owner adds a watch while a рахунок is archived
- **THEN** that рахунок is not among the offered рахунки, while an existing watch mapped to it
  stays listed

### Requirement: Removing a watch stops capture and keeps everything recorded

Removing a watch SHALL tell the capture layer the reduced watched set and SHALL remove the
stored watch, so that app's notifications are no longer captured; every existing чернетка and
транзакція SHALL remain, pending чернетки from that app still confirmable and dismissable.

#### Scenario: A removed watch leaves its чернетки

- **WHEN** a watch with one pending чернетка is removed
- **THEN** the capture layer was told the set without that app, the list no longer shows the
  watch, and the чернетка still awaits the owner on Головний

### Requirement: Waiting captures are collected, decided and stored atomically

WHEN the app opens or returns to the foreground while notification access is granted, the
system SHALL collect the waiting captured notifications and decide each one against the stored
watches, the remembered fingerprints and the owner's правила. Each decided outcome SHALL be
stored atomically — the fingerprint together with the чернетка it drafted, or together with
the транзакція it auto-confirmed — and a collected notification SHALL be acknowledged to the
capture layer only after its outcome is safely stored; an outcome that stores nothing (an
unwatched package, an already-seen fingerprint) SHALL be acknowledged without storing. A
redelivered capture SHALL yield nothing the second time, so a crash between collecting and
storing loses nothing and doubles nothing.

#### Scenario: A notification captured while the app was closed becomes a чернетка

- **WHEN** a watched app posted a purchase notification while the app was not running, and the
  owner opens the app
- **THEN** a чернетка proposing that витрата awaits on Головний, on the watch's рахунок

#### Scenario: A crash before acknowledgement does not double the чернетка

- **WHEN** a collection's чернетка was stored but the acknowledgement never happened, and the
  app collects again
- **THEN** exactly one чернетка exists for that notification and the redelivery is acknowledged
  with nothing new stored

#### Scenario: A правило match lands in the feed without waiting

- **WHEN** the правило "сільпо → Groceries" exists and a watched app's parsed money-out
  notification containing "СІЛЬПО" is collected
- **THEN** a витрата in Groceries is stored and appears in the feed, and no чернетка awaits the
  owner

#### Scenario: Outcomes that store nothing still drain the queue

- **WHEN** a collection hands over a notification whose fingerprint is already remembered
- **THEN** nothing new is stored, the capture is acknowledged, and the next collection hands
  over nothing for it

### Requirement: Pending чернетки are visible on Головний

Головний SHALL show every pending чернетка, newest first, each with its рахунок, its date, the
notification text, and what it proposes: a витрата of its сума with currency, a дохід
«Без джерела» of its сума with currency, or a raw чернетка with no сума — showing its
original-currency reference as information when it carries one. While no чернетка is pending,
Головний SHALL show no чернетки surface and no empty placeholder.

#### Scenario: A drafted витрата shows its proposal

- **WHEN** a чернетка proposing a витрата of 25000 minor units UAH dated 2026-08-26 with text
  "Оплата 250.00UAH. Сільпо" is pending on the рахунок «Приват»
- **THEN** Головний shows it with «Приват», the date, the text and 25000 minor units UAH as a
  proposed витрата

#### Scenario: A raw чернетка shows its text and the missing сума

- **WHEN** a raw чернетка carrying only notification text is pending
- **THEN** Головний shows the text and that no сума was read, and a raw чернетка holding 1000
  minor units USD as its original-currency reference shows that amount as information

#### Scenario: The newest чернетка stands first

- **WHEN** a чернетка was drafted yesterday and another is drafted today
- **THEN** Головний shows today's чернетка above yesterday's

#### Scenario: No pending чернетки, no surface

- **WHEN** every чернетка has been confirmed or dismissed
- **THEN** Головний shows no чернетки surface and the entry form with the feed stand as before

### Requirement: Confirming a чернетка creates its транзакція in the feed

Confirming a pending чернетка SHALL create exactly the транзакція it proposes — the категорія
decided by the owner's правила at the moment of confirmation with «Без категорії» when none
matches, a дохід keeping «Без джерела», the чернетка's text carried as the опис, dated the
чернетка's date — and the транзакція SHALL appear in the feed as an ordinary транзакція,
editable and retypeable like any other. The confirmed чернетка SHALL leave the pending surface
and SHALL never return.

#### Scenario: An unmatched витрата confirms into «Без категорії»

- **WHEN** the owner confirms a чернетка proposing a витрата of 25000 minor units UAH whose
  text no правило matches
- **THEN** a витрата of 25000 minor units UAH in «Без категорії» with the text as its опис
  appears in the feed, and the чернетка is gone — also after the app restarts

#### Scenario: A чернетка on an archived рахунок still confirms

- **WHEN** the рахунок a pending чернетка sits on is archived and the owner confirms the
  чернетка
- **THEN** the транзакція is created on that рахунок all the same — the money moved on the
  real account, and archiving hides a рахунок from pickers, never from its own history

#### Scenario: A правило created after drafting is honoured

- **WHEN** a чернетка with text containing "СІЛЬПО" was drafted, the owner then creates the
  правило "сільпо → Groceries" and confirms the чернетка
- **THEN** the created витрата carries Groceries

#### Scenario: A confirmed дохід keeps «Без джерела»

- **WHEN** the owner confirms a чернетка proposing a дохід of 50000 minor units UAH
- **THEN** a дохід of 50000 minor units UAH with the джерело «Без джерела» appears in the feed,
  retypeable by the owner as ever

### Requirement: A raw чернетка confirms only with the owner's сума

Confirming a raw чернетка SHALL ask the owner for the сума, entered in major units in its
рахунок's currency under the same rules as recording a manual витрата; without a valid сума
nothing SHALL be stored and the чернетка SHALL still await. With one supplied it SHALL confirm
as a витрата of that сума, and an original-currency reference it holds SHALL ride the витрата
as its informational original-currency amount.

#### Scenario: A raw чернетка without a сума stays pending

- **WHEN** the owner tries to confirm a raw чернетка leaving the сума empty or not positive
- **THEN** nothing is stored and the чернетка still awaits

#### Scenario: The supplied сума becomes the витрата

- **WHEN** the owner confirms a raw чернетка on a UAH рахунок supplying "300"
- **THEN** a витрата of 30000 minor units UAH with the чернетка's text as its опис appears in
  the feed

#### Scenario: A foreign reference rides the confirmed витрата

- **WHEN** the owner confirms a raw чернетка holding 1000 minor units USD as its
  original-currency reference, supplying "420" on a UAH рахунок
- **THEN** the витрата of 42000 minor units UAH carries 1000 minor units USD as its
  informational original-currency amount

### Requirement: Dismissing a чернетка creates nothing and it never returns

Dismissing a pending чернетка SHALL be confirmed first, SHALL create no транзакція and change
no розрахунковий баланс and no monthly number, and SHALL settle the чернетка so it never
returns — not after a restart, and not when the same notification is captured again.

#### Scenario: A dismissed чернетка is gone for good

- **WHEN** the owner dismisses a pending чернетка and confirms
- **THEN** no транзакція exists for it, the feed and every розрахунковий баланс are unchanged,
  and the чернетка is absent from Головний after the app restarts

#### Scenario: The dismissed notification does not come back

- **WHEN** a чернетка was dismissed and the capture layer redelivers the same notification
- **THEN** no new чернетка appears
