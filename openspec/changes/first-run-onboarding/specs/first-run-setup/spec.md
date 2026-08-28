## ADDED Requirements

### Requirement: A device with nothing on it opens on the setup view

While the device holds no рахунок and no транзакція, launching the app SHALL open a setup view
rather than the empty Головний. Once the device holds at least one рахунок or one транзакція,
launching SHALL NOT open the setup view again. The setup view SHALL remain reachable from
Налаштування at any time, and leaving it SHALL always be possible without completing anything.

#### Scenario: A fresh install lands on setup

- **WHEN** the app is launched on a device with no рахунок and no транзакція
- **THEN** the setup view is shown

#### Scenario: A device in use lands where it always did

- **WHEN** the app is launched on a device holding at least one рахунок
- **THEN** Головний is shown and the setup view is not opened

#### Scenario: The checklist can be reopened after being skipped

- **WHEN** the owner leaves the setup view without completing a step and later opens it from
  Налаштування
- **THEN** the setup view is shown with the same steps and their current state

### Requirement: Every setup step names its state and leads to the screen that changes it

The setup view SHALL list the steps the app needs to be useful — a перший рахунок, the monobank
connection, the one-time Saldo import, and permission to read bank notifications — each with what
it is for and whether it is done, still to do, or not available. A step that can be acted on SHALL
offer exactly one action, opening the single screen where that step is done; a step that cannot be
acted on SHALL offer no action at all.

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

### Requirement: The notification permission is explained before it is asked for

The setup view SHALL state what reading bank notifications is for and that nothing read leaves
the device. While the installed build provides no way to grant that permission, the step SHALL
say so and SHALL NOT send the owner to a system screen. When the build provides a way to grant
it, the step SHALL report whether it is granted and its action SHALL open the system screen where
the owner grants it.

#### Scenario: An unsupported build says so instead of pointing nowhere

- **WHEN** the installed build has no way to grant notification access
- **THEN** the step says reading bank notifications is not available yet and offers no action

#### Scenario: A grantable permission offers the system screen

- **WHEN** the build can grant notification access and it is not granted
- **THEN** the step is shown as still to do and its action opens the system screen where
  notification access is granted

#### Scenario: A granted permission reads as done

- **WHEN** notification access has been granted
- **THEN** the step is shown as done

### Requirement: The setup view writes nothing

Opening, reading or leaving the setup view SHALL create, change or delete no рахунок, транзакція,
категорія, джерело, правило, link or token, and SHALL request no permission by itself.

#### Scenario: Opening and leaving changes nothing

- **WHEN** the owner opens the setup view and leaves without using any of its actions
- **THEN** the device holds exactly what it held before
