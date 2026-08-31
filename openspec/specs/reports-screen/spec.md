# reports-screen Specification

## Purpose

The «Звіти» tab — where the owner reads the whole history instead of one month: витрачено, дохід
and інвестовано by month, one category by month, and the цілі with their progress. It shows what
the reports and goals capabilities compute; it records nothing.

## Requirements

### Requirement: The Звіти tab shows the history by month

The app SHALL offer a «Звіти» tab, placed between «Рахунки» and «Налаштування». For the whole
stored history it SHALL show витрачено, дохід and інвестовано by calendar month, exactly as the
reports capability computes them, each month identifiable by its month and year. The numbers
SHALL be shown one currency at a time, never mixed: the tab SHALL hold one shown currency that
governs every chart on it — the history chart and the category chart alike. WHEN more than one
currency occurs in the stored history the owner SHALL be able to switch the shown currency, and
the tab SHALL open on UAH when UAH occurs in the history, otherwise on the first of the
occurring currencies in alphabetical order. WHEN no транзакція is stored the tab SHALL say so plainly instead of showing
an empty chart.

#### Scenario: The history is shown by month

- **WHEN** the stored history holds UAH транзакції in June, July and August and the owner opens
  «Звіти»
- **THEN** витрачено, дохід and інвестовано are shown for June, July and August, each equal to
  that month's monthly picture

#### Scenario: One currency at a time, UAH first

- **WHEN** the history holds транзакції in UAH and USD and the owner opens «Звіти»
- **THEN** the UAH series is shown, no number mixes the currencies, and the owner can switch to
  USD

#### Scenario: A single-currency history offers no switch

- **WHEN** every stored транзакція is in UAH
- **THEN** the UAH series is shown and no currency switch is offered

#### Scenario: An empty history says it is empty

- **WHEN** no транзакція is stored and the owner opens «Звіти»
- **THEN** the tab states the history is empty instead of showing a chart

### Requirement: One category can be chosen and read by month

The «Звіти» tab SHALL offer choosing one category among every category some stored транзакція
carries — archived ones included, shown under their names from the editable list — and SHALL
show the chosen category's spent by month over the same span, per the reports capability, in
the tab's shown currency, negative months included — switching the shown currency switches the
category chart with the history chart. A category no stored транзакція carries SHALL NOT be offered — its
series would be an empty answer to an honest question.

#### Scenario: The chooser offers the categories of the history

- **WHEN** stored транзакції carry Groceries and «Комісія», the category Pets is archived with
  stored витрати, and the category book carries no транзакція
- **THEN** the chooser offers Groceries, «Комісія» and Pets, and does not offer book

#### Scenario: The chosen category is shown by month

- **WHEN** the owner chooses Groceries
- **THEN** Groceries' spent is shown for every month of the span, each month equal to its
  breakdown amount, months without Groceries at zero

#### Scenario: A two-currency category follows the shown currency

- **WHEN** Groceries holds витрати in UAH and in USD, and the owner reads Groceries with UAH
  shown, then switches the shown currency to USD
- **THEN** the months first show Groceries' UAH breakdown amounts and, after the switch, its USD
  breakdown amounts, and no month mixes the two

#### Scenario: A renamed category is offered under its new name

- **WHEN** the owner renames Groceries to «Продукти» and opens the chooser
- **THEN** the category is offered as «Продукти» and its series is unchanged

### Requirement: The цілі are shown with their progress

The «Звіти» tab SHALL list every ціль with its назва, its target сума with currency, its дата
and its progress — the linked рахунок's розрахунковий баланс, as the goals capability defines
it. A reached ціль SHALL be visibly marked reached; an overdue ціль SHALL be visibly marked
overdue. WHEN no ціль exists the tab SHALL say so plainly.

#### Scenario: A ціль shows its progress

- **WHEN** the ціль «Авто» targets 20000000 minor units UAH by 2026-12-31 and its рахунок's
  розрахунковий баланс is 5000000 minor units UAH
- **THEN** «Авто» is listed with its target, its дата and a progress of 5000000 minor units UAH

#### Scenario: A reached ціль is marked

- **WHEN** a ціль's progress is at or above its target
- **THEN** it is visibly marked reached

#### Scenario: An overdue ціль is marked

- **WHEN** a ціль's дата has passed and its progress is below its target
- **THEN** it is visibly marked overdue

#### Scenario: No цілі is said plainly

- **WHEN** no ціль exists and the owner opens «Звіти»
- **THEN** the tab states there are no цілі yet
