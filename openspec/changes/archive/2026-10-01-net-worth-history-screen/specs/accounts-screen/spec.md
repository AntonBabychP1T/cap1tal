## ADDED Requirements

### Requirement: «Станом на» is set beside the початковий залишок

The form that creates or edits a рахунок SHALL show «станом на» with the дата початкового залишку beside a nonzero початковий залишок. It SHALL default to today on creation and show the stored дата, or none, on editing, and SHALL be chosen with the same date control as a транзакція's дата. A rejected дата SHALL be explained in the form without losing what was typed.

#### Scenario: The owner dates an old balance
- **WHEN** the owner edits «готівка EUR» with початковий залишок 300 EUR and sets «станом на» to 8 червня 2026
- **THEN** the рахунок's дата початкового залишку is 2026-06-08 and Статок's history counts it from that day, or from its first транзакція if that is earlier

#### Scenario: A future date is explained in the form
- **WHEN** the owner sets «станом на» to a day after today and saves
- **THEN** the form says the дата cannot be in the future, keeps the typed назва and сума, and saves nothing

#### Scenario: A zero opening asks for no date
- **WHEN** the owner creates a рахунок without a початковий залишок
- **THEN** no «станом на» is shown, and the рахунок still records the day it was created
