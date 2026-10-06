## ADDED Requirements

### Requirement: A long press on the app icon offers «Записати витрату»

On Android, a long press on the app's icon in the launcher SHALL offer one shortcut, «Записати
витрату». Choosing it SHALL open the entry form on a витрата: the same form the «+» on Головний
opens, with the same remembered рахунок, the same fields, refusals and proposals, and the сума
focused. This SHALL hold whether the app was not running, in the background, or open on any
screen.

Leaving the form SHALL return to the screen that was open when the app was running, and to Головний
when it was not.

The shortcut SHALL store nothing by itself: nothing is recorded until «Записати» or «Записати і ще
одну» is tapped. WHEN the entry form is already open, choosing the shortcut SHALL bring that form
forward with what it holds — its тип, рахунки and every typed field — even when that тип is not
витрата. It SHALL NOT open a second one, and SHALL NOT switch the open form to витрата.

The shortcut SHALL need no permission.

#### Scenario: The shortcut is offered on the icon

- **WHEN** the owner long-presses the cap1tal icon in the Android launcher
- **THEN** the launcher offers «Записати витрату»

#### Scenario: From a closed app straight to the сума

- **WHEN** the app is not running, the remembered рахунок is the UAH рахунок «гаманець», and the
  owner chooses «Записати витрату»
- **THEN** the entry form opens on a витрата with «гаманець» chosen and the cursor in «Сума» with
  the digit keyboard shown

#### Scenario: Recording from the shortcut lands on Головний

- **WHEN** the app was not running, the owner chooses «Записати витрату», types «85» and taps
  «Записати»
- **THEN** a витрата of 8500 minor units UAH in «Без категорії» is stored on «гаманець», and
  Головний is shown with it at the top of the latest-transactions section

#### Scenario: Leaving without recording lands on Головний

- **WHEN** the app was not running, the owner chooses «Записати витрату» and presses «назад»
  without typing anything
- **THEN** Головний is shown and nothing is stored

#### Scenario: From a running app the form opens over the screen in use

- **WHEN** the app is open on Звіти, the owner goes to the launcher, chooses «Записати витрату»
  and then presses «назад» without typing
- **THEN** the entry form opened over Звіти, and Звіти is shown again

#### Scenario: An open form is not opened twice

- **WHEN** the entry form is open with «120» typed in «Сума», the owner goes to the launcher and
  chooses «Записати витрату»
- **THEN** the same form is shown with «120» still in «Сума», and one «назад» leaves the entry
  form altogether

#### Scenario: An open переказ is not turned into a витрата

- **WHEN** the entry form is open on a переказ from «гаманець» to «банка» with «500» typed in
  «Скільки пішло», and the owner chooses «Записати витрату» from the launcher
- **THEN** the same form is shown, still a переказ from «гаманець» to «банка» with «500», and
  nothing is stored

#### Scenario: The shortcut on a device with no рахунок

- **WHEN** no unarchived рахунок exists and the owner chooses «Записати витрату»
- **THEN** the entry screen states that a рахунок must be created first and offers going to
  Рахунки, nothing can be recorded, and the setup view does not replace the entry screen
