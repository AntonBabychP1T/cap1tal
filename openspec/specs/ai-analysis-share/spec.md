# ai-analysis-share Specification

## Purpose

Handing a пакет для аналізу to an assistant the owner already has — ChatGPT, Claude, Gemini or
any other app — as one self-contained файл для аналізу through the phone's own chooser of
apps: what the файл says, how it is rendered, that it leaves only by the owner's hand, what the
app may and may not claim afterwards, and that no key, connection or server of cap1tal is ever
involved.

## Requirements

### Requirement: The файл для аналізу is self-contained

The файл для аналізу SHALL be one text that an assistant can answer from with nothing added by
the owner: an instruction section, a context section, a summary section and a data section. The
instruction section SHALL tell the assistant, in Ukrainian, to use only the data in the файл,
to keep facts apart from assumptions and to mark every recommendation as one, never to invent a
number, a категорія, a транзакція or a currency that is not in the data, never to recompute a
figure the data already gives, never to add or convert across currencies, to treat the partial
month as partial, to make no forecast (vision §14.10), to answer in Ukrainian, and what the answer
is for: a short description of the
situation, the main changes and why the period differs from the one before, категорії that grew
markedly, what looks discretionary, how stable відкладено and інвестовано are, the large or
unusual витрати, and three to five concrete things worth attention — interpreting the numbers,
not repeating the table. The context section SHALL define, in the glossary's own words, the six
numbers of the month and their identity, and the distinctions the data relies on: a переказ is
not a витрата, an інвестиція is not a витрата, a повернення is not a дохід, a коригування is
unexplained money, and every number is per currency. The data section SHALL be the пакет для
аналізу itself, serialised whole.

#### Scenario: The instructions forbid what the assistant must not do

- **WHEN** a файл для аналізу is rendered
- **THEN** its instruction section tells the assistant to use only the data given, to mark
  assumptions and recommendations as such, not to invent or recompute numbers, not to combine
  currencies, not to forecast, and to answer in Ukrainian

#### Scenario: The context defines the month

- **WHEN** a файл для аналізу is rendered
- **THEN** its context section defines витрачено, дохід, інвестовано, відкладено, позичено and
  залишилось, states that залишилось = дохід − витрачено − інвестовано − відкладено − позичено,
  and states that a переказ, an інвестиція and a повернення are not витрати and a повернення is
  not a дохід

#### Scenario: The data section is the пакет

- **WHEN** a файл для аналізу is rendered from a пакет
- **THEN** its data section, read back, is that пакет in every value

### Requirement: The файл is rendered deterministically and agrees with itself

The same пакет для аналізу SHALL always render to the same файл, character for character. Every
number the summary section states SHALL be a number the data section carries, formatted the way
the app shows money, with its currency beside it; the summary SHALL add no figure of its own.
The файл SHALL name the day it was built for and the period it covers, and SHALL say when the
last month is partial.

#### Scenario: Rendering is repeatable

- **WHEN** one пакет is rendered twice
- **THEN** the two файли are identical

#### Scenario: The summary repeats the data, formatted

- **WHEN** the пакет's August UAH витрачено is `4125.34 UAH`
- **THEN** the summary section shows August витрачено as «4 125,34 UAH» — the сума formatted the
  way every screen of the app formats one — and no summary figure is absent from the data section

### Requirement: The файл leaves only through the system's chooser, by the owner's hand

The файл для аналізу SHALL be handed to another app only through the phone's own chooser of
apps, opened only by the owner's explicit action, and the owner alone SHALL pick the app. The
app SHALL NOT name, prefer, open or link to any particular assistant, SHALL open no network
connection for an AI-аналіз, SHALL hold no key of any assistant, and SHALL send nothing to any
server of its own — there is none. The chooser SHALL be offered the файл under its own name and
a plain-text type, so any app that can take a text file can be chosen.

#### Scenario: The chooser is the only way out

- **WHEN** the owner performs the explicit action
- **THEN** the system's chooser opens with the файл, and no app was chosen or opened by cap1tal

#### Scenario: No connection is made

- **WHEN** an AI-аналіз is run from choosing a period through the chooser closing
- **THEN** cap1tal has opened no network connection and holds no key for any assistant

### Requirement: What the app may claim after the chooser closes

The phone does not tell the app whether the owner picked an app or dismissed the chooser. The
app SHALL therefore claim only that the файл was handed to the system, never that it was
received, read or answered. WHEN the platform has no chooser to hand a файл to, or WHEN the
файл could not be written — the storage being full among the reasons — each SHALL be an answer
the owner reads, never an exception, and the app SHALL leave the stored state exactly as it was
in every case. Whether the owner's assistant is among the apps the chooser offers is the
phone's matter and not an outcome the app can see; the clipboard alternative is what covers it.

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

### Requirement: The файл lives in private storage, one at a time, and never in a бекап

Until handed over, the файл для аналізу SHALL exist only in the app's own private storage. At
most one файл SHALL be kept there: preparing a new one SHALL remove the previous one first. Only
the app the owner picks SHALL be granted reading it. The файл SHALL never be part of a бекап,
and the app SHALL keep no record of it, of the run or of any answer.

#### Scenario: One файл at a time

- **WHEN** the owner hands a файл over on Monday and prepares another on Tuesday
- **THEN** Monday's файл is gone before Tuesday's exists, and only Tuesday's remains in private
  storage

#### Scenario: The бекап knows nothing of it

- **WHEN** a бекап is made after an AI-аналіз was run
- **THEN** the бекап holds no файл для аналізу, no пакет and no record of the run

### Requirement: The same text can be copied instead

The owner SHALL be able to put the whole файл для аналізу on the clipboard instead of handing it
to an app, whether or not a chooser is available. The text copied SHALL be the same text that
would have been handed over.

#### Scenario: Copy equals the файл

- **WHEN** the owner copies the файл
- **THEN** the clipboard holds the файл character for character
