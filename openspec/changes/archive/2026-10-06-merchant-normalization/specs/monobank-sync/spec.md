## ADDED Requirements

### Requirement: A statement item's MCC is kept on the транзакція it becomes

When a statement item becomes a транзакція, that транзакція SHALL carry the item's MCC, whatever
type the item became: a витрата, a дохід or a переказ made by a правило-переказ. An item that
becomes no транзакція, such as a zero amount or an absorbed зустрічний дохід, SHALL leave its MCC
nowhere. The MCC SHALL be the code the sync already matches the правила and the шаблон against at
import, never a code the app derived. A транзакція imported before the MCC was kept SHALL stay as it is: the sync never
re-reads an item it has already imported.

#### Scenario: A purchase keeps the code the bank gave it

- **WHEN** an item of amount −12550 with description "СІЛЬПО Київ" and MCC 5411 is mapped
- **THEN** the resulting витрата carries MCC 5411

#### Scenario: A переказ made by a правило keeps it too

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists and an item of amount −479
  with description "Округлення балансу «Резерв»" and MCC 4829 is mapped on the UAH рахунок platinum
- **THEN** the resulting переказ carries MCC 4829

#### Scenario: An item already imported is not revisited

- **WHEN** a витрата imported before the MCC was kept carries no MCC and the next sync reads a
  statement covering the same item
- **THEN** that витрата still carries no MCC and no second транзакція is created
