## MODIFIED Requirements

### Requirement: Confirming a чернетка creates its транзакція in the feed

Confirming a pending чернетка SHALL create exactly the транзакція it proposes — the категорія
decided by the owner's правила — or, when none matches, by the шаблон категоризації — at the moment
of confirmation with «Без категорії» when neither matches, a дохід keeping «Без джерела», the чернетка's text carried as the опис, dated the
чернетка's date — and the транзакція SHALL be stored as an ordinary транзакція, editable and
retypeable like any other, taking the place its date gives it among the latest transactions and
reachable in «Транзакції» whatever that place is. The confirmed чернетка SHALL leave the pending
surface and SHALL never return.

#### Scenario: An unmatched витрата confirms into «Без категорії»

- **WHEN** the owner confirms a чернетка proposing a витрата of 25000 minor units UAH whose
  text no правило and no базова категорія matches
- **THEN** a витрата of 25000 minor units UAH in «Без категорії» with the text as its опис is
  stored, taking the place its date gives it among the latest transactions, and the чернетка is
  gone — also after the app restarts

#### Scenario: A чернетка on an archived рахунок still confirms

- **WHEN** the рахунок a pending чернетка sits on is archived and the owner confirms the
  чернетка
- **THEN** the транзакція is created on that рахунок all the same — the money moved on the
  real account, and archiving hides a рахунок from pickers, never from its own history

#### Scenario: A правило created after drafting is honoured

- **WHEN** a чернетка with text containing "СІЛЬПО" was drafted, the owner then creates the
  правило "сільпо → Groceries" and confirms the чернетка
- **THEN** the created витрата carries Groceries

#### Scenario: A confirmed дохід keeps «Без джерела»

- **WHEN** the owner confirms a чернетка proposing a дохід of 50000 minor units UAH
- **THEN** a дохід of 50000 minor units UAH with the джерело «Без джерела» is stored, retypeable
  by the owner as ever
