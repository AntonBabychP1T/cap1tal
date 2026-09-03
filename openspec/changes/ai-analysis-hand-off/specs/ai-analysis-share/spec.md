## ADDED Requirements

### Requirement: The файл opens by saying what it is and asking for the analysis

The файл для аналізу SHALL begin with a запит: the first section of the файл, following only the
файл's own title and preceding everything else — the header line that names the schema, the
version and the day the файл was built, and every number in it. It SHALL be plain Ukrainian prose an owner and an assistant
read the same way, and it SHALL say four things — that this is a пакет of financial data from the
cap1tal app; that the assistant is asked to analyse the data and give the owner a practical
financial overview of the period; which kind of AI-аналіз it is and which period it covers; and
that everything the assistant needs — the rules to follow, the meaning of every term and the data
itself — is further down in this same файл. The запит SHALL ask for nothing the instruction
section forbids and SHALL introduce no number of its own.

The запит exists because a файл handed to another app arrives as an attachment: what the receiving
app shows is a name, and what the assistant reads first is the top of the файл. A файл whose first
words are an identifier and a version has not asked for anything.

#### Scenario: The request is the first thing in the файл

- **WHEN** a файл для аналізу is rendered
- **THEN** its first section is the запит, appearing after the файл's title and before the header
  line that names the schema, the version and the day the файл was built

#### Scenario: The request names the task, the kind and the period

- **WHEN** a файл для аналізу is rendered for «Місячна картина» over 2026-06 — 2026-08
- **THEN** the запит says the файл is a пакет of financial data from cap1tal, asks for an analysis
  and a practical financial overview for the period, names «місячна картина» and the period
  2026-06 — 2026-08, and says the instructions, the definitions and the data follow below

#### Scenario: The request adds no number

- **WHEN** a файл для аналізу is rendered
- **THEN** the запит carries no сума, no share and no count — the period it names is the only
  figure in it; every сума, share and count of the файл is in the summary section or the data
  section, and the schema, the version, the day the файл was built and the days of a partial month
  belong to the header line, which stands below the запит

#### Scenario: The request asks for nothing the instructions forbid

- **WHEN** a файл для аналізу is rendered
- **THEN** the запит asks only for the data below it to be analysed and explained: it asks for no
  forecast, for no figure the assistant works out or recomputes itself, and for no recommendation
  presented as a finding — everything the instruction section forbids, the запит leaves forbidden

### Requirement: A короткий запит accompanies the файл where the platform carries it, and nothing depends on it

A короткий запит — one or two sentences asking the recipient to analyse the attached cap1tal файл
and saying that the файл itself holds the full context and the instructions — SHALL be offered to
the system alongside the файл при передачі, where the platform can carry text and a file in one
hand-off. The app SHALL know, for every hand-off, whether the короткий запит was carried, and
SHALL claim it was only when it was.

The correctness of an AI-аналіз SHALL NOT depend on the короткий запит reaching anyone. Whether
the chosen app reads a message that came with an attachment, ignores it, or is never offered one
because the platform cannot carry both, the файл для аналізу SHALL remain sufficient on its own —
it is the source of truth for what the assistant is asked to do, and the короткий запит never
carries an instruction, a definition or a number that is not already in the файл.

WHEN the platform cannot carry a короткий запит with the файл, the hand-off SHALL proceed with the
файл alone and SHALL NOT be reported as a failure.

No adapter the app ships today carries it: the phone's own share sheet takes a file or text and not
both, and buying a native module for a hint the receiving app may discard is not a trade this
change makes (design.md D2). This requirement therefore holds vacuously on the device until an
adapter that can carry text exists — which is the point of stating it now, so that adapter is an
adapter and not a change of contract.

#### Scenario: The файл is sufficient with no message at all

- **WHEN** a файл для аналізу is handed over and the короткий запит is carried nowhere
- **THEN** the файл still opens with the запит, still carries the instructions, the context, the
  summary and the пакет, and the hand-off is reported as handed over

#### Scenario: The message says nothing the файл does not

- **WHEN** the короткий запит is rendered
- **THEN** it asks for the attached cap1tal файл to be analysed, says the файл holds the full
  context and the instructions, and states no сума, no категорія, no period figure and no rule
  absent from the файл

#### Scenario: A platform that cannot carry text with a file is not a failure

- **WHEN** the platform can hand over a file but no text with it
- **THEN** the файл is handed to the system, the app records that the короткий запит was not
  carried, and the owner is told the файл was handed to the system — not that anything failed

#### Scenario: The app does not claim a message it did not send

- **WHEN** the короткий запит was not carried with the файл
- **THEN** the app never says a request was sent with the файл

## MODIFIED Requirements

### Requirement: The файл для аналізу is self-contained

The файл для аналізу SHALL be one text that an assistant can answer from with nothing added by
the owner: a запит, an instruction section, a context section, a summary section and a data
section, in that order. The instruction section SHALL tell the assistant, in Ukrainian, to use
only the data in the файл, to keep facts apart from assumptions and to mark every recommendation
as one, never to invent a number, a категорія, a транзакція or a currency that is not in the data,
never to recompute a figure the data already gives, never to add or convert across currencies, to
treat the partial month as partial, to make no forecast (vision §14.10), to answer in Ukrainian,
and what the answer is for: a short description of the situation, the main changes and why the
period differs from the one before, категорії that grew markedly, what looks discretionary, how
stable відкладено and інвестовано are, the large or unusual витрати, and three to five concrete
things worth attention — interpreting the numbers, not repeating the table. It SHALL further name,
as things to look at, the changes from month to month, the largest категорії, the changes that
stand out against the months before, and the ліміти and цілі the data carries. The context section
SHALL define, in the glossary's own words, the six numbers of the month and their identity, and
the distinctions the data relies on: a переказ is not a витрата, an інвестиція is not a витрата, a
повернення is not a дохід, a коригування is unexplained money, and every number is per currency.
Because the instruction section now points the answer at the ліміти and цілі, the context section
SHALL further define both in the glossary's own words: a ліміт is a monthly ceiling on one
категорія in the ліміт's own currency, exceeded only when that month's spent of it is strictly
greater — equality is not over — and spending in any other currency neither counts toward it nor is
converted toward it; a ціль's progress is the розрахунковий баланс of the рахунок it is linked to,
in that рахунок's own currency and never converted, reached when the progress is at or above the
target and прострочена when the date has passed and it is not.
The data section SHALL be the пакет для аналізу itself, serialised whole.

WHEN the owner has switched «Продавці» or «Окремі транзакції» on for that run, the instruction
section SHALL additionally say that those are context beside the aggregates, to be read for what
they explain and never summed, counted or turned into a figure of the assistant's own. WHEN a
switch is off, the файл SHALL carry no instruction about the detail it would have added.

#### Scenario: The instructions forbid what the assistant must not do

- **WHEN** a файл для аналізу is rendered
- **THEN** its instruction section tells the assistant to use only the data given, to mark
  assumptions and recommendations as such, not to invent or recompute numbers, not to combine
  currencies, not to forecast, and to answer in Ukrainian

#### Scenario: The instructions name what is worth looking at

- **WHEN** a файл для аналізу is rendered
- **THEN** its instruction section names the month-to-month changes, the largest категорії, the
  changes that stand out against the months before, and the ліміти and цілі as things the answer
  should attend to

#### Scenario: The context defines the month

- **WHEN** a файл для аналізу is rendered
- **THEN** its context section defines витрачено, дохід, інвестовано, відкладено, позичено and
  залишилось, states that залишилось = дохід − витрачено − інвестовано − відкладено − позичено,
  and states that a переказ, an інвестиція and a повернення are not витрати and a повернення is
  not a дохід

#### Scenario: The context defines a ліміт and a ціль

- **WHEN** a файл для аналізу is rendered
- **THEN** its context section says that a ліміт is a monthly ceiling on one категорія in the
  ліміт's own currency, that equality is not over and that spending in another currency neither
  counts toward it nor is converted toward it, and that a ціль's progress is the розрахунковий
  баланс of its linked рахунок in that рахунок's own currency, never converted

#### Scenario: Опис detail is instructed as context only

- **WHEN** «Продавці» is on for that run
- **THEN** the instruction section says the продавці are context beside the aggregates and are not
  to be summed, counted or made into a figure of the assistant's own

#### Scenario: One switch on does not speak for the other

- **WHEN** «Продавці» is on and «Окремі транзакції» is off
- **THEN** the instruction section says the продавці are context beside the aggregates, and says
  nothing about окремі транзакції

#### Scenario: A switch that is off leaves no instruction behind

- **WHEN** «Продавці» and «Окремі транзакції» are both off
- **THEN** the instruction section says nothing about продавці and nothing about окремі транзакції

#### Scenario: The data section is the пакет

- **WHEN** a файл для аналізу is rendered from a пакет
- **THEN** its data section, read back, is that пакет in every value

### Requirement: What the app may claim after the chooser closes

The phone does not tell the app whether the owner picked an app or dismissed the chooser. The
app SHALL therefore claim only that the файл was handed to the system, never that it was
received, read or answered. WHEN the platform has no chooser to hand a файл to, or WHEN the
файл could not be written — the storage being full among the reasons — each SHALL be an answer
the owner reads, never an exception, and the app SHALL leave the stored state exactly as it was
in every case. Whether the owner's assistant is among the apps the chooser offers is the
phone's matter and not an outcome the app can see; the clipboard alternative is what covers it.

WHEN the platform reports that the короткий запит was carried to the system together with the
файл, the app SHALL be permitted one further sentence, and only this one: that the запит was
handed to the system with the файл. It SHALL NOT say that the запит was sent to, delivered to,
received by, read by or answered by anyone — the app learns none of that about the запит for
exactly the reason it learns none of it about the файл. WHEN the platform reports that the
короткий запит was not carried, the app SHALL say nothing whatever about a запит having
accompanied the файл.

#### Scenario: A dismissed chooser is not a failure and not a success

- **WHEN** the owner dismisses the chooser
- **THEN** the app says the файл was handed to the system and nothing more

#### Scenario: A platform without a chooser answers honestly

- **WHEN** the platform cannot hand a файл to another app
- **THEN** the app answers that it is unavailable here, and the owner can still copy the файл

#### Scenario: A файл that cannot be written is a reason, not a crash

- **WHEN** the файл cannot be written to the app's private storage
- **THEN** the app answers that the файл could not be prepared and why, and nothing was handed
  over

#### Scenario: A запит that travelled is claimed no further than the файл

- **WHEN** the platform reports that the короткий запит was carried with the файл
- **THEN** the app says the файл and the запит were handed to the system, and says nothing about
  either being sent to, received by, read by or answered by any app

### Requirement: The same text can be copied instead

The owner SHALL be able to put the whole файл для аналізу on the clipboard instead of handing it
to an app, whether or not a chooser is available. The text copied SHALL be the same text that
would have been handed over.

The owner SHALL additionally be able to put the короткий запит alone on the clipboard, in one
action, so that an assistant which took the attachment and no message can be asked in the owner's
next message without the owner writing one. The text copied SHALL be exactly the короткий запит
that would accompany the файл.

#### Scenario: Copy equals the файл

- **WHEN** the owner copies the файл
- **THEN** the clipboard holds the файл character for character

#### Scenario: The короткий запит can be copied alone

- **WHEN** the owner copies the запит
- **THEN** the clipboard holds exactly the короткий запит and not the файл
