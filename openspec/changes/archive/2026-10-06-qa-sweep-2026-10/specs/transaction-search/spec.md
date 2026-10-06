## ADDED Requirements

### Requirement: The list narrows to «Без джерела»

The «Транзакції» screen SHALL let the owner narrow the list to the доходи without a джерело:
exactly the доходи carrying «Без джерела». A витрата, a повернення, a переказ and a коригування
SHALL NOT be shown under it. The narrowing SHALL combine with the search, the рахунок and the
місяць like the other narrowings, SHALL be visible while in force, SHALL be cleared together with
them, and SHALL only ever remove транзакції from the result. It SHALL NOT be in force together with
«Без категорії»: choosing one takes the other off.

#### Scenario: Only the unsourced доходи are shown

- **WHEN** a дохід «Від: Міхаіл Кас'ян» in «Без джерела», a дохід in «Зарплата», a витрата in «Без
  категорії» and a переказ are stored and the owner narrows to «Без джерела»
- **THEN** only «Від: Міхаіл Кас'ян» is shown

#### Scenario: «Без джерела» and «Без категорії» take turns

- **WHEN** the list is narrowed to «Без категорії» and the owner chooses «Без джерела»
- **THEN** only the доходи «Без джерела» are shown and «Без категорії» is no longer in force

### Requirement: «Транзакції» can be opened already narrowed to «Без джерела»

The system SHALL be able to open «Транзакції» with the «Без джерела» narrowing already in force,
alone or with a місяць. It SHALL be an initial value and not a lock, exactly as the «Без категорії»
one is.

#### Scenario: Opened narrowed to one month's unsourced доходи

- **WHEN** «Транзакції» is opened asking for «Без джерела» in вересень 2026
- **THEN** only the доходи «Без джерела» dated in вересень 2026 are shown, and both narrowings read
  as in force

### Requirement: The search field's hint is read whole

The hint inside the search field of «Транзакції» SHALL fit the field at the phone's default text
size, so it is never drawn cut off.

#### Scenario: The hint fits

- **WHEN** «Транзакції» opens with an empty search on a phone 360 dp wide
- **THEN** the hint is drawn whole, with no word cut off at the field's edge
