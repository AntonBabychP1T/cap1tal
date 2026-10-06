## ADDED Requirements

### Requirement: Налаштування offers «Локальна модель» right after «Продавці»

Among the sections the «Налаштування» tab offers, it SHALL offer «Локальна модель», placed
immediately after «Продавці», showing beside its name whether the switch is on and the model's state
in words. Every other section SHALL stay where it is. The tab's statement of what leaves the phone
SHALL stay true without naming the model, since the app opens no connection for it.

#### Scenario: The tab offers «Локальна модель» after «Продавці»

- **WHEN** the owner opens «Налаштування»
- **THEN** «Локальна модель» is offered immediately after «Продавці», reading «вимкнено» or the
  model's state, and every section offered before it is still offered in the same order

#### Scenario: The outbound statement is unchanged

- **WHEN** the owner opens «Налаштування» with the local model on and готова
- **THEN** the tab names the same outbound connections it names with the model off
