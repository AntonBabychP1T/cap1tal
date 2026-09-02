## ADDED Requirements

### Requirement: The Звіти tab offers AI-аналіз

The «Звіти» tab SHALL offer «AI-аналіз», which opens the AI-аналіз screen over the tabs. The
offer SHALL be a way in and nothing more: showing it on «Звіти» SHALL compute nothing, build
no пакет для аналізу and hand nothing to any other app — the пакет is built only by the
AI-аналіз screen, once it is open. WHEN no транзакція is stored the offer SHALL still be shown,
and the AI-аналіз screen SHALL be the one to say there is nothing to analyse.

#### Scenario: The offer opens the AI-аналіз screen

- **WHEN** the owner opens «Звіти» and chooses «AI-аналіз»
- **THEN** the AI-аналіз screen opens over the tabs with its choices at their defaults, and
  nothing has left the phone

#### Scenario: The offer says nothing about the data

- **WHEN** the owner opens «Звіти»
- **THEN** «AI-аналіз» is offered without any number, preview or file having been prepared
