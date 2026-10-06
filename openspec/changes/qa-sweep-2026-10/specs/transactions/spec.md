## ADDED Requirements

### Requirement: A коригування opened from a list shows what it did

Opening a коригування SHALL show its signed сума, its рахунок, its дата in words and its опис,
and SHALL let the owner write, change or clear that опис and save it. Its сума, рахунок, дата and
type SHALL NOT be offered for change: a коригування is what «Звірити» wrote. Deleting it SHALL ask
first, naming the сума and the рахунок, and SHALL change that рахунок's розрахунковий баланс by
exactly that сума. No sentence SHALL say a коригування cannot yet be recorded.

#### Scenario: A коригування reads as one

- **WHEN** the owner opens the коригування of −77686 minor units UAH on «РЕЗЕРВ» dated 2026-09-16
- **THEN** the screen shows −776,86 UAH, «РЕЗЕРВ» and «16 вересня», an editable опис and
  «Видалити транзакцію», and no type, сума or рахунок can be changed

#### Scenario: Its опис is corrected

- **WHEN** the owner writes «перерахунок готівки» into that коригування's опис and saves
- **THEN** the коригування carries that опис and its сума, рахунок and дата are unchanged

#### Scenario: Deleting it says what goes

- **WHEN** the owner taps «Видалити транзакцію» on it
- **THEN** the confirmation names −776,86 UAH on «РЕЗЕРВ», and on confirming the розрахунковий
  баланс of «РЕЗЕРВ» rises by 776,86 UAH
