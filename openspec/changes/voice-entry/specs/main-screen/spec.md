## ADDED Requirements

### Requirement: The entry form can be filled from a фраза

The entry form SHALL offer, above its fields, a фраза: a line the owner can dictate with one tap
on «Надиктувати» or type, and that the form turns into its fields when the dictation ends or when
the owner confirms the typed line. Applying a фраза SHALL set every field the фраза names and SHALL
leave every other field as it was — the type, the рахунок the form opened on, the date, the
категорія the form would show for the опис, and whatever the owner had already chosen — with the
two exceptions the form already has: when the фраза names a type other than the form's, the form
SHALL switch to it first exactly as tapping that type does, which drops the категорія or джерело
picked for the previous type; and when the фраза names a рахунок in another currency and no сума,
the сума SHALL be cleared as choosing that рахунок by hand clears it.

A категорія or джерело the фраза names SHALL count as the owner's own pick, so the категорія no
longer follows the опис; when the фраза names none, the категорія SHALL follow the опис the фраза
filled exactly as it follows a typed one. Applying a фраза SHALL store nothing: recording still
happens only on «Записати», with every refusal the form already has. Every field of the form SHALL
stay usable by hand before, during and after a dictation.

#### Scenario: A dictated витрата fills the form and waits

- **WHEN** the рахунок Гаманець and the категорія «Доставка їжі» exist and the owner dictates «додай
  витрату п'ятсот гривень з рахунку гаманець категорія доставка їжі опис покусать суші»
- **THEN** the form shows витрата, сума 500, рахунок Гаманець, категорія «Доставка їжі» and опис
  «покусать суші», and nothing is stored until the owner presses «Записати»

#### Scenario: What the фраза does not name keeps the form's default

- **WHEN** the form opened on the remembered рахунок Чорна and the owner dictates «сто п'ятдесят
  гривень опис АТБ» while the правило "атб → Groceries" exists
- **THEN** the type stays витрата, the рахунок stays Чорна, the сума is 150, the опис is «АТБ» and
  the категорія shown is Groceries, as for a typed опис

#### Scenario: A named категорія beats the правило

- **WHEN** the правило "атб → Groceries" exists and the owner dictates «сто гривень опис АТБ
  категорія кафе» while the категорія Кафе exists
- **THEN** the категорія shown is Кафе and «Записати» stores the витрата in Кафе

#### Scenario: A фраза without a type keeps a переказ a переказ

- **WHEN** the form is on переказ from Чорна to Скарбничка and the owner dictates «тисяча гривень»
- **THEN** the form is still a переказ from Чорна to Скарбничка, with сума 1000

#### Scenario: A повернення is filled as a повернення

- **WHEN** the owner dictates «десять тисяч готівкою на отримання на рахунок гаманець повернення за
  електроніку» while Гаманець, Готівка and Електроніка exist
- **THEN** the form shows повернення, сума 10000, рахунок Гаманець and категорія Електроніка, and
  «Записати» stores a повернення, leaving the month's дохід unchanged

#### Scenario: A дохід without a джерело is still refused

- **WHEN** the owner dictates «отримав п'ять тисяч на гаманець» and presses «Записати» without
  picking a джерело
- **THEN** recording is rejected as it is for a typed дохід, and nothing is stored

#### Scenario: A second фраза corrects the first

- **WHEN** the form was filled from «витрата п'ятсот гривень гаманець» and the owner then dictates
  «категорія кафе»
- **THEN** the form is still a витрата, the категорія becomes Кафе, and the сума and рахунок stay
  as the first фраза set them

#### Scenario: A named type drops the previous label

- **WHEN** the owner picked Кафе on a витрата and then dictates «отримав тисячу»
- **THEN** the form switches to дохід with no джерело chosen, as tapping дохід would

#### Scenario: A typed фраза fills the form the same way

- **WHEN** the owner types «300 грн з гаманця» into the фраза and confirms it
- **THEN** the form shows сума 300 and рахунок Гаманець, as if it had been dictated

#### Scenario: Fields stay usable while listening

- **WHEN** a dictation is listening and the owner taps the сума field and types «40»
- **THEN** the сума becomes 40, and a фраза ending afterwards sets only what it names

### Requirement: The form says what it heard and did not use

The фраза SHALL stay visible and editable after it has been applied, as it was heard. For every
value the фраза named that was not filled — a рахунок, категорія or джерело that matches none of the
owner's records or more than one, a destination of a переказ not named, a label a переказ does not
take, a сума not decided, a сума in another currency than the рахунок's — the form SHALL say, beside the field it concerns, what was
heard and why it was not used, and SHALL leave that field as it was. A field the owner changes
afterwards SHALL drop what was said about it, and each фраза applied SHALL replace everything said
about the previous one.

#### Scenario: An unknown категорія is said beside the picker

- **WHEN** no категорія «Суші» exists and the owner dictates «триста гривень категорія суші»
- **THEN** the сума is 300, the категорія stays as it was, and beside the категорія picker the
  form says that «суші» was heard and no such категорія exists

#### Scenario: Dollars onto a hryvnia рахунок are said, not converted

- **WHEN** Гаманець is a UAH рахунок and the owner dictates «двадцять доларів з гаманця»
- **THEN** the рахунок is Гаманець, the сума field stays as it was, and beside it the form says
  that 20 доларів was heard while the рахунок is in гривні

#### Scenario: Picking the field clears the note

- **WHEN** the form says «суші» was heard as a категорія and the owner picks Кафе
- **THEN** the note about «суші» is gone

#### Scenario: A new фраза replaces the old notes

- **WHEN** the form says «суші» was heard as a категорія and the owner dictates «триста гривень»
- **THEN** the note about «суші» is gone and the сума is 300

### Requirement: Dictation says where it stands and never blocks typing

While dictating, the form SHALL show that it is listening and what it has heard so far, and SHALL
offer stopping. When dictation cannot run or ends without a фраза — recognition unavailable on this
phone, Ukrainian not installed or being added, the microphone permission refused or blocked, the
recogniser busy, nothing heard, or a failure — the form SHALL say which in words, offer what can be
done about it (the phone's settings, the app's system settings, trying again),
and keep the фраза open for typing. It SHALL NOT point the owner to any other way of turning speech
into text.

#### Scenario: Listening is visible and can be stopped

- **WHEN** the owner taps «Надиктувати» and starts speaking
- **THEN** the form shows that it is listening and the words heard so far, and offers stopping

#### Scenario: A phone without on-device Ukrainian offers typing

- **WHEN** recognition is unavailable on this phone and the owner taps «Надиктувати»
- **THEN** the form says that dictation is not available on this phone and that the фраза can be
  typed, and the фраза stays open for typing

#### Scenario: Nothing heard invites another try

- **WHEN** a dictation ends as nothing heard
- **THEN** the form says it heard nothing, offers dictating again, and no field changes

### Requirement: Holding the «+» opens the entry form listening

Holding the «+» on Головний SHALL open the entry form exactly as tapping it does and SHALL start
dictating at once, under the same permission and availability rules as tapping «Надиктувати».
Tapping the «+» SHALL keep opening the form without dictating. The «+» SHALL offer the hold as a
named action to assistive technology, so it can be reached without a long press.

#### Scenario: Holding opens the form listening

- **WHEN** the owner holds the «+» on Головний and the microphone permission is granted
- **THEN** the entry form opens and is already listening

#### Scenario: Tapping is unchanged

- **WHEN** the owner taps the «+»
- **THEN** the entry form opens and is not listening

#### Scenario: Holding with the permission not yet given asks first

- **WHEN** the owner holds the «+» and the microphone permission is deniable
- **THEN** the entry form opens and the system permission dialog is shown, and listening starts
  only if it is granted

#### Scenario: The hold is a named action

- **WHEN** assistive technology reads the «+»
- **THEN** it offers an action named «Надиктувати транзакцію» besides opening the form
