## ADDED Requirements

### Requirement: A категорія the import creates starts with the іконка its Saldo name suggests

Every категорія the committed import creates SHALL be stored with the іконка its Saldo name
suggests, by the same keyword table and with the same «Інше» for a name nothing matches as a
категорія created by hand. A Saldo name that maps onto an existing категорія — by name, onto a
reserved row, or because the owner redirected the proposal — SHALL create nothing and SHALL leave
that категорія's іконка exactly as it was. The import SHALL give no джерело an іконка.

#### Scenario: Saldo import gives a created категорія its suggested іконка

- **WHEN** the export holds the EXPENSES account «Кафе», no категорія of that name exists, and the
  plan is committed
- **THEN** the created категорія «Кафе» carries «Кава»

#### Scenario: A Saldo name nothing matches starts generic

- **WHEN** the export holds the EXPENSES account «Юрко», no категорія of that name exists, and the
  plan is committed
- **THEN** the created категорія «Юрко» carries «Інше»

#### Scenario: A redirected proposal leaves the existing іконка alone

- **WHEN** the plan proposes creating «Кафе», the owner redirects it onto the existing Groceries,
  which carries «Продукти», and the plan is committed
- **THEN** no категорія «Кафе» exists and Groceries still carries «Продукти»

#### Scenario: A name matched to an existing категорія keeps the owner's іконка

- **WHEN** the owner has given булка the іконка «Кава», the export holds the EXPENSES account
  «булка», and the plan is committed
- **THEN** булка's витрати land in булка, and булка still carries «Кава»

#### Scenario: Fees keep «Відсоток»

- **WHEN** an EXPENSES leg carries the account "Fees" and the plan is committed
- **THEN** the витрата lands in «Комісія», which still carries «Відсоток», and no категорія "Fees"
  exists
