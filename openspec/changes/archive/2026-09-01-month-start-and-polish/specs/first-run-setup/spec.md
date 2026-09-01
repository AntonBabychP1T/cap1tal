## MODIFIED Requirements

### Requirement: Every setup step names its state and leads to the screen that changes it

The setup view SHALL list the steps the app needs to be useful — a перший рахунок, the monobank
connection, the one-time Saldo import, and permission to read bank notifications — each with what
it is for and whether it is done, still to do, or not available. A step that can be acted on SHALL
offer exactly one action, opening the single screen where that step is done; a step that cannot be
acted on SHALL offer no action at all. The view SHALL also say how many of the steps that can be
acted on are done, counting only those — a step that is not available is not one the owner is
failing at.

The two numbers of that count SHALL be separated by a mark that no styling of the view can render
as a digit, so how many are done and how many there are cannot be read as a third number. A single
Ukrainian letter between them is not such a mark: the view sets that line in capitals with letters
spaced apart, where «З» is indistinguishable from «3».

#### Scenario: The view says how much of the setup is behind the owner

- **WHEN** the setup view is opened with one of three actionable steps done and one further step
  not available on this device
- **THEN** it reports one of three done, and the unavailable step is in neither number

#### Scenario: The count cannot be read as a third number

- **WHEN** the setup view is opened with two of four actionable steps done
- **THEN** it reports «Готово 2/4», and no character between the two numbers can be read as a digit

#### Scenario: A finished step reads as finished

- **WHEN** the device holds a рахунок and monobank is configured
- **THEN** the рахунок step and the monobank step are shown as done

#### Scenario: An outstanding step leads to one screen

- **WHEN** no Saldo import has been committed on this device
- **THEN** the Saldo import step is shown as still to do and its action opens the Saldo import
  flow

#### Scenario: A step that cannot be acted on offers nothing

- **WHEN** a step is not available on this device
- **THEN** it is shown with its reason and no action is offered for it
