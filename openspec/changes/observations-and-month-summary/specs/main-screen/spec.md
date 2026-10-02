## MODIFIED Requirements

### Requirement: Головний presents the daily dashboard

Головний SHALL present a compact cap1tal header, then the fixed service rail with any currently actionable item, then the known dashboard widgets in the owner's saved visible order. The fixed service rail SHALL appear directly below the header and before every widget regardless of widget order or which widget, if any, is first. With no saved preference the widgets SHALL present, in order, the current month's витрачено, the latest five stored транзакції, the current month's спостереження, top categories and Статок, with recording available through «+» without scrolling and with no entry form, separate money-held card, large attention section or visible Progress widget.

#### Scenario: The first screen is entry plus the feed
- **GIVEN** recorded expenses, accounts, twelve unseen досягнення, pending чернетки and no saved dashboard preference
- **WHEN** the owner opens Головний
- **THEN** the month leads, the latest records immediately follow, the спостереження follow them, categories and Статок follow those, the fixed service rail sits directly below the header before every widget, and Progress does not precede the financial widgets
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

## ADDED Requirements

### Requirement: The «Спостереження» widget points at what is notable this month

When visible, the «Спостереження» widget SHALL show up to three спостереження of the current
month. It SHALL take the first three in the order the observations capability defines, each in
its one sentence, each leading where that capability says. A можливий дубль SHALL carry its «Не
дубль» answer, which takes effect in place without leaving Головний.

WHEN the current month has more than three спостереження, the widget SHALL offer «Усі (N)»,
naming how many there are and leading to Місяць on the current month.

WHEN the current month has none, the widget SHALL say so in one sentence and keep its place.

On the first seven days of a month, WHEN the previous month is a завершений активний місяць, the
widget SHALL open with one more row, «Підсумок <місяця>», leading to that month's підсумок. From
the eighth day that row SHALL no longer be shown. It is not remembered as seen.

Showing the widget SHALL write nothing, post nothing and request nothing.

#### Scenario: Three of five

- **WHEN** October 2026 has five спостереження and the widget is visible
- **THEN** the widget shows the first three in order and «Усі (5)», which opens Місяць on October

#### Scenario: Nothing notable yet

- **WHEN** today is 2026-10-10 and the current month has no спостереження
- **THEN** the widget says there is nothing unusual this month so far, and nothing else

#### Scenario: September's підсумок in the first week of October

- **WHEN** today is 2026-10-02 and September 2026 holds транзакції
- **THEN** the widget opens with «Підсумок вересня», which opens the підсумок of September

#### Scenario: The підсумок row leaves after the seventh day

- **WHEN** today is 2026-10-08
- **THEN** the widget shows no «Підсумок вересня» row, and the підсумок is still reachable from
  Місяць

#### Scenario: «Не дубль» on Головний

- **WHEN** the widget shows a можливий дубль and the owner answers «Не дубль»
- **THEN** the pair disappears from the widget, the next спостереження takes its place if there is
  one, and Головний is not left

#### Scenario: A hidden widget shows nothing

- **WHEN** the owner has hidden «Спостереження» in dashboard editing
- **THEN** Головний shows no спостереження and no «Підсумок» row, and the service rail is unchanged
