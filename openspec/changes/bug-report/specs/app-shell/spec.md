## ADDED Requirements

### Requirement: An uncaught error while drawing a screen shows a fallback, not a dead app

WHEN an error is thrown while a screen is being drawn and no screen caught it, the app SHALL
record it in the журнал with its message and stack before anything else, and SHALL show, in
Ukrainian and following the system appearance, that the screen failed, with the error's message,
an offer to file a репорт про помилку, and a way back to Головний. The app SHALL NOT close on
its own, and returning from the fallback SHALL NOT show the launch view again.

WHEN an error is thrown in work a screen started after it was drawn, or a promise is rejected
and nobody answers it, the app SHALL record it in the журнал with its message and stack before
the platform's own handling of it, which is otherwise unchanged: such an error is remembered, not
caught.

#### Scenario: A crashed screen is replaced by the fallback

- **WHEN** drawing «Рахунки» throws
- **THEN** the журнал holds the crash with its message and stack, and the owner sees a Ukrainian
  fallback naming the failure with «Повідомити про помилку» and «Повернутися»

#### Scenario: An error in started work is remembered

- **WHEN** work a screen started throws after the screen was drawn, or a promise is rejected
  with nobody answering it
- **THEN** the журнал holds the crash with its message and stack, and what the platform does
  with the error afterwards is what it did before

#### Scenario: The fallback follows the system appearance

- **WHEN** a screen crashes while the system is in dark appearance
- **THEN** the fallback uses the app's dark background and remains legible

#### Scenario: Returning from the fallback shows no launch view

- **WHEN** the owner chooses «Повернутися» on the fallback
- **THEN** Головний is shown and the launch view does not appear in between
