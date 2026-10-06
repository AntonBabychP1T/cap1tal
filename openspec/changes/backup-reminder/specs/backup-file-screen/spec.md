## ADDED Requirements

### Requirement: «Бекап» shows the last бекап, after leaving it and after a restart

The «Бекап» section SHALL show, every time it is opened, what the phone remembers of its last file
бекап: its дата in words, the name the file was given and how many рахунки and транзакції it held.
WHEN the phone's last confirmed restore is later than its last file бекап, or the phone has
restored a бекап and never saved a file бекап, the section SHALL instead say that the phone was restored on that дата from the бекап made on its дата. WHEN this
phone has neither saved a file бекап nor restored one, the section SHALL say so plainly and show
no дата. The section SHALL show no folder or path, which the app cannot reliably know. A save
that lands SHALL update what is shown at once, and a save the owner backed out of or that failed
SHALL leave it as it was.

#### Scenario: The last save is still shown the next day

- **WHEN** the owner saved a file бекап on 2026-10-05 holding 12 рахунки and 4300 транзакції,
  restarted the phone, and opens «Бекап» on 2026-10-06
- **THEN** the section says the last бекап was saved on 5 жовтня as «cap1tal-2026-10-05.json» with
  12 рахунків and 4300 транзакцій

#### Scenario: A phone that never saved a бекап says so

- **WHEN** the owner opens «Бекап» on a phone that has never saved or restored a бекап
- **THEN** the section says no бекап has been saved on this phone yet, and shows no дата

#### Scenario: A restore later than the last save is what is shown

- **WHEN** the last file бекап was saved on 2026-09-21 and on 2026-10-06 the owner restored a бекап
  made on 2026-08-30
- **THEN** «Бекап» says the phone was restored on 6 жовтня from the бекап of 30 серпня

#### Scenario: A restored phone that never saved a file shows the restore

- **WHEN** a new phone has never saved a file бекап and on 2026-10-06 the owner restored a бекап
  made on 2026-10-05, then opens «Бекап»
- **THEN** the section says the phone was restored on 6 жовтня from the бекап of 5 жовтня, and does
  not say that no бекап has been saved

#### Scenario: A new save replaces what is shown at once

- **WHEN** «Бекап» shows the last бекап of 21 вересня and the owner saves a file бекап on
  2026-10-06 holding 12 рахунки and 4310 транзакцій
- **THEN** the section shows 6 жовтня, «cap1tal-2026-10-06.json», 12 рахунків and 4310 транзакцій
  without being reopened

#### Scenario: Backing out leaves the last бекап shown

- **WHEN** «Бекап» shows the last бекап of 21 вересня and the owner taps «Зберегти у файл» and
  dismisses the destination chooser
- **THEN** the section still shows the last бекап of 21 вересня and claims no new one
