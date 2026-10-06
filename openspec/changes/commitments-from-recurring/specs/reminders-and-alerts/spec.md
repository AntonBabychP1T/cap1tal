## MODIFIED Requirements

### Requirement: Nothing the app posts carries money, a name or bank text

What the app posts SHALL contain only the app's own words: the invitation to record expenses, the
warning of a платіж tomorrow that the installments capability defines, the warning of a платіж
tomorrow that the commitments capability defines, or the name of the action that failed. It SHALL
NOT contain a сума in any currency, the назва of a
рахунок, категорія, джерело, розстрочка or зобов'язання, the опис of a транзакція, any part of a
captured bank notification's title, text or package, the monobank token or any part of it, or any
Google authorisation.

#### Scenario: A collection failure says nothing about what was captured

- **WHEN** collecting captured notifications fails after a captured notification naming
  «Продукти 250,00 UAH» from a bank's app
- **THEN** what is posted contains neither that сума, nor that text, nor the app it came from —
  only that collecting bank notifications failed

#### Scenario: The нагадування carries no numbers

- **WHEN** the нагадування is posted on a device holding транзакції, рахунки and цілі
- **THEN** what is posted names no сума, no рахунок and no категорія

#### Scenario: The warning of a зобов'язання names nothing of it

- **WHEN** the warning for the платіж of «Оренда», 15 000,00 UAH from «mono black», is posted on
  2026-10-09
- **THEN** what is posted contains neither «Оренда», nor that сума, nor «mono black»
