## MODIFIED Requirements

### Requirement: Головний presents the daily dashboard

Головний SHALL present a compact cap1tal header, then the fixed service rail with any currently actionable item, then the known dashboard widgets in the owner's saved visible order. The fixed service rail SHALL appear directly below the header and before every widget regardless of widget order or which widget, if any, is first. With no saved preference the widgets SHALL present, in order, the current month's витрачено, the latest five stored транзакції, top categories and Статок, with recording available through «+» without scrolling and with no entry form, separate money-held card, large attention section or visible Progress widget.

#### Scenario: The first screen is entry plus the feed
- **GIVEN** recorded expenses, accounts, twelve unseen досягнення, pending чернетки and no saved dashboard preference
- **WHEN** the owner opens Головний
- **THEN** the month leads, the latest records immediately follow, categories and Статок follow them, the fixed service rail sits directly below the header before every widget, and Progress does not precede the financial widgets
- **AND** «+» opens the existing separate recording form with its existing validation and confirmation

#### Scenario: A saved layout controls only known widgets
- **GIVEN** the owner saved Статок before the month widget and hid top categories
- **WHEN** Головний opens
- **THEN** Статок appears before the month widget, top categories do not appear, and each visible known widget appears once

#### Scenario: With no рахунок nothing can be recorded yet
- **GIVEN** no account exists or every account is archived
- **WHEN** Головний is opened
- **THEN** a compact invitation leads to Рахунки, recording still requires an unarchived account, and any visible feed still shows stored records
- **AND** archived money is handled by net-worth rather than silently erased

#### Scenario: A recorded transaction appears at the top of the feed
- **GIVEN** no later-dated transaction exists and «Останні 5 транзакцій» is visible
- **WHEN** the owner records an expense dated today and returns from the recording form
- **THEN** it appears at the top of the feed, with every visible financial widget refreshed

### Requirement: Uncategorised records are a compact feed banner

A nonzero count of stored витрати and повернення carrying «Без категорії» SHALL appear as one compact actionable service banner, counted over all history and opening the matching uncategorised filter, with no banner or reserved space at zero. The banner SHALL remain visible outside the configurable widget list when «Останні 5 транзакцій» is hidden and SHALL NOT be hideable or reorderable as a dashboard widget.

#### Scenario: Count and destination agree
- **GIVEN** seven matching records across several months, only one in the latest five, plus an income «Без джерела»
- **WHEN** the banner is shown and tapped
- **THEN** it reads «7 транзакцій без категорії · Переглянути» and opens exactly those seven through the existing filter

#### Scenario: Hiding the feed does not hide the required action
- **GIVEN** seven matching records and «Останні 5 транзакцій» is hidden
- **WHEN** Головний opens
- **THEN** the compact uncategorised banner is still visible and opens those seven records

#### Scenario: Answering the last record removes the banner
- **GIVEN** one matching record
- **WHEN** it is categorised, deleted or retyped out of the filter
- **THEN** the banner disappears without an empty attention heading

### Requirement: Operational alerts remain compact and actionable

Pending чернетки and an existing actionable sync failure SHALL occupy at most one collapsed service row each in the fixed service rail directly below the header and before every widget, with draft expansion retaining existing in-place confirm/dismiss behavior and failure leading to existing details/retry. These rows SHALL remain outside the configurable widget list, SHALL NOT be hideable or reorderable, and SHALL take no space when absent.

#### Scenario: Many drafts do not bury the dashboard
- **GIVEN** fifty pending чернетки, a rejected token and every configurable widget hidden
- **WHEN** Головний opens
- **THEN** two compact service rows remain visible directly below the header, no draft bodies render before expansion, and the failure action opens monobank details

#### Scenario: Draft confirmation updates the same record
- **GIVEN** an expanded pending чернетка
- **WHEN** the owner confirms its proposed amount or supplies the required amount
- **THEN** existing rules create the transaction, every visible financial widget refreshes, and the draft no longer waits
- **AND** dismissal uses existing confirmation and creates no transaction

#### Scenario: Routine postponement is not an error
- **GIVEN** a healthy sync ended «перенесено» with no existing needs-owner condition
- **WHEN** Головний opens
- **THEN** no failure row is displayed

#### Scenario: Confirming the last чернетка into «Без категорії» hands off between both alerts
- **GIVEN** the only pending чернетка, whose text no правило matches, is the only thing needing attention
- **WHEN** the owner expands and confirms it
- **THEN** the draft row disappears and the uncategorised banner appears naming one транзакція, so the owner is never left facing neither alert nor the transaction it produced

## ADDED Requirements

### Requirement: The header opens dashboard editing

The compact Головний header SHALL offer an action named «Налаштувати Головний» with at least a 48 × 48 dp target, and invoking it SHALL open dashboard editing without starting sync or changing any widget preference by itself.

#### Scenario: Header action opens the editor
- **GIVEN** Головний is open
- **WHEN** the owner invokes «Налаштувати Головний»
- **THEN** dashboard editing opens with the current order and visibility of every known widget
- **AND** no sync or network request starts
