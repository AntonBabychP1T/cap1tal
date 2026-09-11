## ADDED Requirements

### Requirement: A бекап carries the owner's шаблон mapping

A бекап SHALL carry, for every базова категорія the owner has made a choice about, that choice —
the категорія it lands in, or that it is switched off. A базова категорія the owner never touched
SHALL be carried as nothing at all, so restoring it onto a later app version lets it follow
whatever типова категорія that version's шаблон gives it.

The шаблон itself SHALL NOT be carried: which merchants and MCC codes a базова категорія covers is
the app's, not the owner's state, and a бекап that carried it would restore an old app's knowledge
onto a new app.

Restoring SHALL make the mapping exactly the бекап's, replacing what the device held, as a
відновлення replaces everything else. A бекап of the format version that comes before this one
SHALL restore with no choice stored for any базова категорія — which is every базова категорія
following its типова категорія, exactly the state the device that wrote it was in.

A restored choice naming a категорія the бекап does not also carry SHALL make the whole бекап
contradict itself and SHALL be refused whole, as every other dangling reference in a бекап is.

#### Scenario: The mapping survives the round trip

- **WHEN** a бекап made on a device where «Продукти» points at «Їжа» and «Алкоголь і тютюн» is
  switched off is restored onto storage holding nothing
- **THEN** «Продукти» points at «Їжа», «Алкоголь і тютюн» is off, and every other базова категорія
  follows its типова категорія

#### Scenario: A відновлення replaces the mapping

- **WHEN** a бекап holding one choice is restored onto a device holding five
- **THEN** the device holds exactly that one choice afterwards

#### Scenario: A бекап of the previous format restores the defaults

- **WHEN** a бекап written under the format version before this one is restored
- **THEN** it is accepted, and every базова категорія follows its типова категорія

#### Scenario: A choice naming an absent категорія is refused whole

- **WHEN** restoring a бекап whose mapping names a категорія the same бекап does not carry
- **THEN** it is refused as contradicting itself and nothing local changes
