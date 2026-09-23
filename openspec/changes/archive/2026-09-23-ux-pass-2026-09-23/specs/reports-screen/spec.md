## ADDED Requirements

### Requirement: The category chooser takes one row

The chooser of «Одна категорія за місяцями» SHALL be one row of the offered categories that
scrolls sideways, so the chosen category's chart follows directly under it, whatever the number of
categories offered.

#### Scenario: Twenty-nine categories

- **WHEN** the history carries 29 categories and the owner picks «Продукти»
- **THEN** the chooser is one row, «Продукти» is visibly chosen in it, and the monthly chart of
  «Продукти» is drawn directly under that row

### Requirement: A month strip never opens on a half-drawn month

When a month chart is wider than its card and scrolls to bring the marked month into view, it
SHALL come to rest with its leftmost visible month drawn whole, never with a month label cut at
the edge.

#### Scenario: The newest month is marked

- **WHEN** the history spans 24 months and «Вер 2026» is marked
- **THEN** the strip shows «Вер 2026» whole and the leftmost month it shows is also drawn whole

### Requirement: An empty цілі group leads to creating a ціль

WHEN no ціль exists, the цілі on «Звіти» SHALL say so and SHALL offer the way to where a ціль is
created, in one tap.

#### Scenario: No ціль yet

- **WHEN** the owner has no ціль and opens «Звіти»
- **THEN** the цілі card says there is no ціль yet and offers «Створити ціль», which opens «Цілі»
