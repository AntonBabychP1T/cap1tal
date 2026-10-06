## ADDED Requirements

### Requirement: Under «Без категорії» a line offers its shown припущення

WHILE the «Без категорії» narrowing is in force, a line whose витрата shows a категорія припущення
SHALL carry «Схоже на: <категорія>», accepted with one tap and refused with «Ні», without opening the
транзакція. The line SHALL otherwise read exactly as that requirement on lines under «Без категорії»
says. Accepting SHALL store the категорія exactly as picking it does, the line SHALL leave the list
as it no longer carries «Без категорії», and the правило offer SHALL follow. «Ні» SHALL remove the
припущення and leave the line in the list.

#### Scenario: Answering a list of them in «Транзакції»

- **WHEN** «Транзакції» narrowed to «Без категорії» holds five витрати, three of them showing a
  категорія припущення, and the owner accepts two and refuses one
- **THEN** the two accepted leave the list, the refused one stays without a припущення, and the
  other two stay as they were
