## Purpose

The device side of the local model: the owner's switch, the model's state said in words, the
phone's own model fetched only on the owner's tap, guesses asked in small batches while the app is
open, nothing leaving the phone, and an app that is exactly today's wherever there is no model.

## ADDED Requirements

### Requirement: The local model is off until the owner turns it on

The local model SHALL be off until the owner turns it on, and the switch SHALL survive a restart.
While it is off, the model SHALL be asked nothing, and no припущення SHALL be shown anywhere.
Turning it on SHALL be the owner's consent for the model to read, on the phone, the facts the
model-guesses capability lists, описи included. Turning it off SHALL forget every stored
припущення, every «Ні» and the counts of accepted and refused guesses.

#### Scenario: A fresh install asks nothing

- **WHEN** the app is opened for the first time on a phone whose model is ready
- **THEN** the switch is off, the model is asked nothing and no припущення appears anywhere

#### Scenario: Turning off forgets

- **WHEN** the switch is on, three припущення are shown, one «Ні» was given, and the owner turns
  the switch off and on again
- **THEN** no припущення from before remains and the refused thing may be asked about again

### Requirement: The model's state is said in words

The system SHALL know the model in exactly one of these states:

- **недоступна** — this phone or platform cannot run it, with the reason in words when the phone
  gives one;
- **телефон ще не має моделі** — the phone can run it but has not fetched it;
- **завантажується** — the phone is fetching it;
- **готова** — it can answer.

An **opening** is each time the app comes to the foreground, launched or returned to. The state
SHALL be read again at every opening and whenever the «Локальна модель» section is opened. The
model SHALL be asked only while the switch is on and the state is готова. A state other than
готова SHALL leave every припущення already shown as it is, and SHALL ask nothing new.

#### Scenario: A platform without a model says so

- **WHEN** the app runs where no local model exists, such as an emulator without one or an iOS
  build
- **THEN** the state is недоступна, the switch can be turned on and asks nothing, and every screen
  reads exactly as it does with the switch off

#### Scenario: A model that disappears stops the asking

- **WHEN** the switch is on, two припущення are shown, and at the next opening the state is
  недоступна
- **THEN** the two припущення are still shown and the model is asked nothing new

### Requirement: The phone fetches its model only on the owner's tap

The app SHALL NOT ask the phone to fetch its model on its own. When the state is «телефон ще не має
моделі», the owner SHALL be offered fetching it, and only their tap SHALL ask the phone's system to
fetch it. The app itself SHALL open no connection for the model: what is fetched, and from where,
is the phone's system's. A fetch that fails SHALL be said in words, with the state back to «телефон
ще не має моделі».

#### Scenario: Nothing is fetched without a tap

- **WHEN** the switch is turned on while the state is «телефон ще не має моделі»
- **THEN** nothing is fetched, the state stays, and fetching is offered

#### Scenario: The owner's tap fetches

- **WHEN** the owner taps the offer to fetch the model
- **THEN** the state becomes завантажується, and готова once the phone has it

#### Scenario: A failed fetch is said in words

- **WHEN** the phone's system reports that fetching the model failed
- **THEN** the section says in Ukrainian that the model could not be fetched, the state is «телефон
  ще не має моделі» again, and fetching is offered again

### Requirement: Guesses are asked only while the app is open, a few at a time

The model SHALL be asked only while the app is in the foreground. It is asked after the first screen
of an opening is drawn, one question at a time, and at most thirty times per opening. Things SHALL
be asked about in this order:

1. raw чернетки, the oldest first, because they wait for a confirmation;
2. «Без категорії» витрати, the newest first;
3. «Без продавця» groups, in the order that list shows them.

A thing that already has a припущення shown or accepted, or a «Ні», SHALL NOT be asked about again
while the thing itself is unchanged, as the model-guesses capability defines it. A thing whose
answer was dropped SHALL NOT be asked about again until the thing itself, the model or the way it
is asked changes. Going to the background SHALL stop the asking. An answer arriving
after that SHALL be thrown away unchecked and unstored, and the next opening SHALL go on from where
the order stands. No background task, alarm or lock-screen moment SHALL ever ask the model.

A question that fails, because the model errs, does not answer within twenty seconds or the phone
refuses it for its own limits, SHALL be counted as failed. The thing SHALL be asked about again at
a later opening, at most three times in all for the same thing, model and way of asking.

#### Scenario: Raw чернетки first

- **WHEN** an opening finds one raw чернетка, ten «Без категорії» витрати and five «Без продавця»
  groups with nothing asked yet
- **THEN** the raw чернетка is asked about first, then the витрати newest first, then the groups

#### Scenario: Thirty per opening

- **WHEN** an opening finds fifty things to ask about
- **THEN** thirty are asked about in that opening, and the next opening goes on with the rest

#### Scenario: The background stops it

- **WHEN** the owner leaves the app while a question is being answered
- **THEN** that answer is not stored and no further question is asked until the app is opened
  again

#### Scenario: A failed question is retried, three times at most

- **WHEN** the question about a витрата fails at three openings in a row
- **THEN** it is not asked about at a fourth opening while the витрата, the model and the way of
  asking are unchanged

#### Scenario: A dropped answer is not asked for again

- **WHEN** the model's answer about a витрата was dropped by its check, and the app is opened again
  with nothing changed
- **THEN** that витрата is not asked about

#### Scenario: Coming back to the app is an opening

- **WHEN** an opening asked thirty questions, the owner switched to another app, and then returned
- **THEN** the return is a new opening, and up to thirty more questions are asked

#### Scenario: No background work ever asks

- **WHEN** a background chance runs the monobank sync or the Google Drive бекап while the switch is
  on and things wait to be asked about
- **THEN** the model is asked nothing

### Requirement: Asking never holds up a screen

Every screen SHALL open and respond while guesses are being asked. A припущення that becomes shown
SHALL appear in place on the screen that shows its thing, without reopening it, and no screen SHALL
wait for the model to draw its first content.

#### Scenario: Головний is drawn before any question

- **WHEN** the app is opened with the switch on and things to ask about
- **THEN** Головний is drawn before the first question is asked, and a категорія припущення that
  arrives while «Транзакції» is open appears on its line there

### Requirement: Nothing about the model leaves the phone

No network traffic SHALL leave the app's own process on behalf of the model, at any time, in the
foreground or the background, neither the app's own nor any made by the model's library inside it.
The app SHALL carry no component of that library that reports its use: a background job, service or
receiver for usage reporting SHALL be removed from the app, and a library that cannot work without
one SHALL NOT be used. The app SHALL hold no permission the model's library would add: such a
permission SHALL be blocked in the app's configuration, and a library that cannot work without one
SHALL NOT be used. The facts given to the model and its answers SHALL be kept
nowhere but in a shown or accepted припущення, a «Ні», or a dropped-answer mark, all on the
phone. The журнал SHALL record, per opening, how many questions were asked, how many припущення
were shown, how many answers were dropped by a check and how many questions failed, and nothing
else. It holds no опис, no назва, no сума, no answer and no fact. A failed question SHALL be
recorded only as one of «error», «timeout» or «quota», never with a message the phone or the
library gave.

#### Scenario: No permission arrives with the model

- **WHEN** the model's library declares permissions, as recorded for the pinned version
- **THEN** the app's configuration blocks every one of them that the app did not hold before

#### Scenario: No reporting component arrives with the model

- **WHEN** the model's library declares a usage-reporting job, service or receiver, as recorded for
  the pinned version
- **THEN** the app's configuration removes every one of them

#### Scenario: A failure's message never reaches the журнал

- **WHEN** a question fails with a message from the library that quotes the опис it was asked about
- **THEN** the журнал records one failure as «error» and holds no part of that message

#### Scenario: The журнал holds counts alone

- **WHEN** an opening asks twelve questions, shows eight припущення, drops three answers and has
  one failure
- **THEN** the журнал holds one entry for it with the counts twelve, eight, three and one, and no
  опис, назва, сума or text of the model's
