## MODIFIED Requirements

### Requirement: The entry form shows the категорія a правило gives the typed опис

While a витрата is being recorded, the entry form SHALL show as chosen the категорія the owner's
правила give the опис currently typed — or, when no правило matches it, the категорія the шаблон
категоризації gives it — for as long as the owner has picked no категорія themselves. The chosen
категорія SHALL follow the опис as it is typed and cleared: clearing the опис, or changing it to
text neither a правило nor a базова категорія matches, SHALL return the form to «Без категорії». The
moment the owner picks a категорія, the form SHALL keep that pick and SHALL stop following the
опис for the rest of that recording.

The категорія a правило or the шаблон gives SHALL be shown in the short list like any other, so it is visible
before «Записати» is pressed and can be changed with one tap. Recording SHALL store exactly the
категорія shown.

#### Scenario: Typing a known merchant chooses its категорія

- **WHEN** the правило "атб → Groceries" exists and the owner types "АТБ 421" as the опис of a
  витрата without having picked a категорія
- **THEN** the form shows Groceries as the chosen категорія, and «Записати» stores the витрата in
  Groceries

#### Scenario: Clearing the опис gives the категорія back

- **WHEN** the правило "атб → Groceries" exists, the owner types "АТБ 421" and then clears the
  опис, having picked no категорія
- **THEN** the form shows «Без категорії»

#### Scenario: A picked категорія stops following the опис

- **WHEN** the owner picks Eating out and then types "АТБ 421" while the правило "атб →
  Groceries" exists
- **THEN** the form still shows Eating out, and «Записати» stores the витрата in Eating out

#### Scenario: The proposed категорія is one tap from being changed

- **WHEN** the form shows Groceries because a правило matched the typed опис
- **THEN** Groceries is shown among the short list of категорії and picking another one replaces it
