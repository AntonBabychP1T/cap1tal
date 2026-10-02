## ADDED Requirements

### Requirement: A бекап carries the «Не дубль» answers

A бекап SHALL carry every «Не дубль» answer the owner gave, with the two транзакції it names and
the moment it was given. Restoring SHALL make the answers exactly the бекап's, replacing what the
device held, as a відновлення replaces everything else. They are carried because they are the
owner's word and cannot be recomputed: dropped, a restored phone would ask again about every pair
already answered.

No спостереження SHALL be carried: each is recomputed from the restored транзакції whenever it is
shown.

The answers SHALL be carried as one more optional section of the existing format, with no change
to the envelope's format version. A бекап written before the answers existed carries no such
section and SHALL restore with no answer stored.

An answer naming a транзакція the бекап does not also carry, an answer pairing a транзакція with
itself, or two answers naming the same pair in either order SHALL make the whole бекап contradict
itself. Such a бекап SHALL be refused whole, as every other dangling reference or repetition in a
бекап is. The order in which an answer names its two транзакції SHALL carry no meaning: a pair is
unordered, so either order restores the same answer.

#### Scenario: The answers survive the round trip

- **WHEN** a бекап made on a device holding two «Не дубль» answers is restored onto storage holding
  nothing
- **THEN** both answers are back with their pairs and moments, and neither pair is stated as a
  можливий дубль

#### Scenario: A бекап written before the answers existed restores with none

- **WHEN** a бекап carrying no answers section is restored
- **THEN** it is accepted, no answer is stored, and every pair that qualifies is stated as a
  можливий дубль again

#### Scenario: An answer naming an absent транзакція is refused whole

- **WHEN** restoring a бекап whose answers name a транзакція the same бекап does not carry
- **THEN** it is refused as contradicting itself and nothing local changes

#### Scenario: An answer pairing a транзакція with itself, or one pair twice, is refused whole

- **WHEN** restoring a бекап whose answers pair транзакція `a` with `a`, or name the pair `a`, `b`
  and also the pair `b`, `a`
- **THEN** it is refused as contradicting itself and nothing local changes

#### Scenario: Either order restores the same answer

- **WHEN** a бекап names its one answer as the pair `b`, `a`
- **THEN** it is accepted, and the pair `a`, `b` is answered afterwards

#### Scenario: No спостереження is in the file

- **WHEN** a бекап is made on a device whose current month has five спостереження
- **THEN** the file carries the «Не дубль» answers and no спостереження
