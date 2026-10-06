## ADDED Requirements

### Requirement: Зобов'язання offers every пропозиція above the list

WHEN the commitments capability offers any пропозиція зобов'язання, the «Зобов'язання» screen SHALL
show every one, in that capability's order, above the list of зобов'язання and above «Нове
зобов'язання», each as one sentence «Схоже на підписку: <назва>, <сума> щомісяця — записати
зобов'язанням?» with its сума written as the app writes every сума, and two actions, «Записати» and
«Ні». After «Ні» the пропозиція SHALL be replaced in place by one line saying it will not be offered
again, with «Скасувати», for as long as the owner stays on the screen; leaving the screen SHALL
remove the line. With no пропозиція the screen SHALL show nothing of them. The пропозиції SHALL
appear also when the owner holds no зобов'язання, above the sentence saying what a зобов'язання is
for.

#### Scenario: Netflix is asked about on the screen

- **WHEN** the пропозиція for «Netflix», 29900 minor units UAH, is offered and the owner opens
  «Зобов'язання»
- **THEN** above the list the screen says «Схоже на підписку: Netflix, 299,00 UAH щомісяця —
  записати зобов'язанням?» with «Записати» and «Ні»

#### Scenario: «Ні» leaves an undo until the screen is left

- **WHEN** the owner chooses «Ні» on the пропозиція for «Netflix»
- **THEN** in its place the screen says it will not be offered again and offers «Скасувати»; after
  the owner leaves and reopens «Зобов'язання», neither the line nor the пропозиція is shown

#### Scenario: «Скасувати» brings it back

- **WHEN** the owner chooses «Ні» and then «Скасувати» on the пропозиція for «Netflix»
- **THEN** the пропозиція for «Netflix» stands again with «Записати» and «Ні»

#### Scenario: An empty screen still asks

- **WHEN** the owner holds no зобов'язання and the пропозиція for «Netflix» is offered
- **THEN** the screen shows that пропозиція above the sentence saying what a зобов'язання is for and
  «Нове зобов'язання»

### Requirement: «Записати» opens the зобов'язання form holding what the пропозиція proposes

Choosing «Записати» on a пропозиція SHALL open the same form «Нове зобов'язання» opens, holding the
values the commitments capability says the пропозиція proposes in place of the form's starting
values, each editable like any value typed by hand. Nothing SHALL be stored until the owner stores
the form, under every refusal the form already states; leaving the form by any way that does not
store it SHALL store nothing and leave the пропозиція offered.

#### Scenario: The form arrives filled in

- **WHEN** the owner chooses «Записати» on the пропозиція for «Netflix», whose latest charge was
  299,00 UAH on 15 вересня 2026 on «mono black» in «Підписки»
- **THEN** the form holds «Назва» «Netflix», «Сума» 299,00 UAH, «Як часто» «Щомісяця», «Дата першого
  платежу» 15 вересня 2026, «Рахунок списання» «mono black», «Категорія» «Підписки» and an empty
  «Текст в описі списання»

#### Scenario: Stored, it leaves the пропозиції

- **WHEN** the owner stores that form unchanged
- **THEN** «Netflix» is listed among the зобов'язання and no пропозиція for «Netflix» is shown

#### Scenario: Discarded, nothing is stored

- **WHEN** the owner chooses «Записати», uses the device's back gesture and answers «Відкинути»
- **THEN** no зобов'язання is stored and the пропозиція for «Netflix» is still shown

### Requirement: One зобов'язання holds the switch of its нагадування про платіж

The opened зобов'язання SHALL hold one switch «Нагадувати за день до платежу» — its нагадування про
платіж — off until the owner turns it on, and a stopped зобов'язання SHALL show it unavailable.
Turning it on while the phone does not allow the app to notify, and the app has not yet asked on
behalf of the нагадування про платіж — of a розстрочка or of a зобов'язання — SHALL ask for the
permission once; turning it on later SHALL ask only while the app has not yet asked, never a second
time. While the switch is on and the phone does not allow the app to notify, the зобов'язання SHALL
say that no нагадування про платіж can arrive and offer the phone's own notification settings;
where the build cannot post notifications at all it SHALL say so and offer nothing.

#### Scenario: Off until turned on

- **WHEN** the owner opens «Оренда», just recorded
- **THEN** «Нагадувати за день до платежу» is off

#### Scenario: The first switch asks once

- **WHEN** the owner turns on the switch of «Оренда» on a phone that does not allow the app to
  notify, and the app never asked on behalf of the нагадування про платіж
- **THEN** the phone asks for the permission once, and turning on the switch of «Інтернет»
  afterwards does not ask again

#### Scenario: A розстрочка already asked

- **WHEN** storing a розстрочка already asked for the permission, which the owner refused, and the
  owner turns on the switch of «Оренда»
- **THEN** nothing is asked, and «Оренда» says no нагадування про платіж can arrive and offers the
  phone's notification settings

#### Scenario: A build that cannot notify says so

- **WHEN** the switch of «Оренда» is on and the build cannot post notifications at all
- **THEN** «Оренда» says no нагадування про платіж can arrive on this build and offers nothing

#### Scenario: A stopped зобов'язання cannot remind

- **WHEN** the owner opens «Netflix», stopped on 2026-10-02
- **THEN** its switch is shown unavailable
