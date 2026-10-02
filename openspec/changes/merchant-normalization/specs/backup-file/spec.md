## ADDED Requirements

### Requirement: A бекап carries продавці, a правило's продавець and a транзакція's MCC

A бекап SHALL carry every продавець with its назва and every написання it holds, with the moments
they were named and added, since the newest написання decides a tie. It SHALL carry the продавець
of every правило that names one, and the MCC of every транзакція that carries one. Restoring SHALL
bring all of it back exactly, replacing what the device held, as a відновлення replaces everything
else.

They SHALL be carried as optional parts of the existing format, with no change to the envelope's
format version. A бекап written before продавці existed carries no such part, and SHALL restore
with no продавець stored, every правило matching by the pattern or MCC it names, and no транзакція
carrying an MCC: exactly the state the device that wrote it was in.

Each of the following SHALL make the whole бекап contradict itself. It SHALL be refused whole,
before anything local is touched, as every other dangling reference in a бекап is:

- a правило naming a продавець that the same бекап does not carry;
- a написання whose продавець the бекап does not carry;
- a написання held by two продавці;
- a написання that is blank, or not stored trimmed and folded to lower case;
- two продавці whose назви differ only in letter case or surrounding whitespace, or a blank назва;
- a продавець holding no написання;
- a правило naming both a pattern and a продавець;
- an MCC on a транзакція that is not a whole number.

#### Scenario: Продавці survive the round trip

- **WHEN** a бекап made on a device holding «АТБ» with "атб" and "atb", the правило "АТБ →
  Groceries" naming it, and a витрата carrying MCC 5411 is restored onto storage holding nothing
- **THEN** «АТБ» holds "атб" and "atb" with their moments, the правило names «АТБ», and the
  витрата carries MCC 5411

#### Scenario: A бекап written before продавці existed restores without them

- **WHEN** a бекап carrying no продавці and no MCC, written before they existed, is restored
- **THEN** it is accepted, no продавець exists, every правило keeps its pattern, and no транзакція
  carries an MCC

#### Scenario: Two продавці with one назва are refused before anything changes

- **WHEN** restoring a бекап that carries the продавці «АТБ» and «атб»
- **THEN** it is refused as contradicting itself and nothing local changes

#### Scenario: A продавець with nothing to recognise it by is refused

- **WHEN** restoring a бекап that carries the продавець «Зерно» and no написання for it
- **THEN** it is refused as contradicting itself and nothing local changes

#### Scenario: An MCC that is not a whole number is refused

- **WHEN** restoring a бекап in which a транзакція carries the MCC 54.11
- **THEN** it is refused as contradicting itself and nothing local changes

#### Scenario: A правило naming an absent продавець is refused whole

- **WHEN** restoring a бекап whose правило names a продавець the same бекап does not carry
- **THEN** it is refused as contradicting itself and nothing local changes
