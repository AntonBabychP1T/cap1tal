## ADDED Requirements

### Requirement: A бекап never carries a припущення

A бекап SHALL NOT contain any припущення, «Ні», dropped-answer mark, failed-question count, count of
accepted or refused припущення, or the switch of the local model. Restoring SHALL leave no
припущення on the device and SHALL leave the switch as the device had it.

#### Scenario: Nothing of the model reaches the file

- **WHEN** a бекап is made on a device with the switch on, four shown припущення and two «Ні»
- **THEN** the бекап contains none of them, nor the switch, while every транзакція and продавець of
  that device is in it

#### Scenario: A відновлення leaves no припущення

- **WHEN** a бекап is restored onto a device showing three припущення
- **THEN** no припущення remains afterwards
