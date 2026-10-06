## ADDED Requirements

### Requirement: The «Без категорії» mark offers a shown категорія припущення

When a витрата carrying «Без категорії» shows a категорія припущення, the short picker its mark
opens SHALL offer «Схоже на: <категорія>» ahead of the категорії, together with «Ні». Like «Це
переказ», it stands beside the категорії and is not one of the five категорії the picker shows.
Tapping it SHALL store that категорія on the витрата without opening editing, exactly as picking
that категорія there does, and the правило offer SHALL follow. «Ні» SHALL remove the припущення and
leave the picker as it otherwise is. A витрата showing no припущення SHALL get the picker exactly
as before.

#### Scenario: One tap in the feed

- **WHEN** the owner opens the «Без категорії» mark on a витрата showing «Схоже на: COFFEE ☕» while
  twenty-six категорії are offered
- **THEN** «Схоже на: COFFEE ☕» is offered first, at most five категорії are still shown beside it,
  and tapping it puts the витрата into COFFEE ☕ and brings the правило offer

#### Scenario: «Ні» in the feed

- **WHEN** the owner taps «Ні» on «Схоже на: COFFEE ☕» in that picker
- **THEN** the picker shows the категорії as it does for a витрата with no припущення, and the
  витрата still carries «Без категорії»

### Requirement: Editing offers a shown категорія припущення

Transaction editing of a витрата carrying «Без категорії» that shows a категорія припущення SHALL
offer «Схоже на: <категорія>» and «Ні» beside the категорія field, while the field itself still
reads «Без категорії». Accepting SHALL set the field to that категорія exactly as picking it does,
to be stored with the save. «Ні» SHALL remove the припущення.

#### Scenario: Editing offers it too

- **WHEN** the owner opens a витрата showing «Схоже на: Transport» in editing
- **THEN** the категорія field still reads «Без категорії» and offers «Схоже на: Transport» to
  accept or refuse
