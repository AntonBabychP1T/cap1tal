## MODIFIED Requirements

### Requirement: Confirmation creates the транзакція the чернетка proposed

Confirming a чернетка SHALL create exactly the транзакція it proposes on its рахунок, dated
the чернетка's date, carrying the чернетка's text as the транзакція's опис, and SHALL settle
the чернетка so it awaits nothing further. A витрата-чернетка SHALL be categorised by the
owner's правила — and, when no правило matches, by the шаблон категоризації — applied at the
moment of confirmation to the чернетка's text with no MCC, and SHALL fall back to «Без категорії»
when neither matches. A дохід-чернетка SHALL create its дохід with the джерело the best of the
owner's правила-джерела gives the чернетка's text at the moment of confirmation, matched with no
MCC, and with the джерело «Без джерела» when none matches; the шаблон категоризації gives no
джерело. A raw чернетка SHALL NOT confirm without a сума the
owner supplies; with one supplied it SHALL confirm as a витрата of that сума in the
рахунок's currency, categorised the same way, and a raw чернетка holding an original-currency
reference SHALL pass it to that витрата as its original-currency amount — kept as
information, exactly as the transactions spec requires of a source that names the currency.
Dismissing a чернетка SHALL create nothing and SHALL settle it the same way.

#### Scenario: Confirming an unmatched витрата lands in «Без категорії»

- **WHEN** a витрата-чернетка of 25000 minor units UAH with text "Оплата 250.00UAH. НОВИЙ
  ЗАКЛАД" is confirmed and no правило and no базова категорія matches
- **THEN** a витрата of 25000 minor units UAH in «Без категорії» with опис carrying the
  чернетка's text exists, and the чернетка is settled

#### Scenario: A правило added after drafting is honoured at confirmation

- **WHEN** a витрата-чернетка with text containing "СІЛЬПО" exists, the owner then creates
  the правило "сільпо → Groceries", and the чернетка is confirmed
- **THEN** the витрата's категорія is Groceries

#### Scenario: Confirming a дохід-чернетка keeps «Без джерела»

- **WHEN** a дохід-чернетка of 50000 minor units UAH whose text no правило-джерело matches is
  confirmed
- **THEN** a дохід of 50000 minor units UAH with the джерело «Без джерела» exists, retypeable
  by the owner as ever

#### Scenario: A правило-джерело gives a confirmed дохід its джерело

- **WHEN** the правило-джерело "зарплата → Зарплата" exists and a дохід-чернетка of 3000000 minor
  units UAH with text "Зарахування: Зарплата ТОВ Ромашка" is confirmed
- **THEN** a дохід of 3000000 minor units UAH with the джерело «Зарплата» exists

#### Scenario: A правило naming a категорія gives a дохід-чернетка nothing

- **WHEN** only the правило "зарплата → Groceries" exists and a дохід-чернетка with text
  "Зарплата" is confirmed
- **THEN** the дохід carries «Без джерела» and no категорія

#### Scenario: A raw чернетка needs the owner's сума

- **WHEN** a raw чернетка is confirmed without a сума
- **THEN** confirmation is rejected and the чернетка still awaits

#### Scenario: A raw чернетка confirms with the owner's сума

- **WHEN** a raw чернетка on a UAH рахунок is confirmed with a supplied сума of 30000 minor
  units
- **THEN** a витрата of 30000 minor units UAH with опис carrying the чернетка's text exists

#### Scenario: A foreign reference rides the confirmed витрата as information

- **WHEN** a raw чернетка on a UAH рахунок holding 1000 minor units USD as its
  original-currency reference is confirmed with a supplied сума of 42000 minor units
- **THEN** a витрата of 42000 minor units UAH exists carrying 1000 minor units USD as its
  original-currency amount, kept as information only

#### Scenario: Dismissal creates nothing

- **WHEN** a чернетка is dismissed
- **THEN** no транзакція exists for it, no balance changed, and the чернетка awaits nothing
  further

### Requirement: Notifications never invent the owner's distinctions

A чернетка SHALL propose, and its confirmation SHALL create, only the default types — витрата
or дохід — a дохід carrying «Без джерела» unless one of the owner's own правила-джерела names its
джерело — and the system SHALL NOT infer a переказ, інвестиція, повернення, коригування, комісія
or a джерело from notification text on its own; the owner retypes the created транзакція exactly
as with every other imported source.

#### Scenario: An ATM withdrawal is a витрата until retyped

- **WHEN** a notification whose text reads "Зняття готівки 1000.00 грн" drafts and is
  confirmed
- **THEN** the result is a витрата of 100000 minor units UAH, not a переказ to a cash
  рахунок, until the owner retypes it

#### Scenario: A «повернення» notification is money in, never a повернення verdict

- **WHEN** a notification whose text carries «повернення» parses
- **THEN** the movement is money in, the чернетка proposes a дохід «Без джерела», and only
  the owner's retype makes it the повернення the glossary defines

#### Scenario: «Відсотки» only by the owner's правило

- **WHEN** no правило-джерело exists and a дохід-чернетка with text "Нараховані відсотки 12.34" of
  1234 minor units UAH is confirmed
- **THEN** the дохід carries «Без джерела», not «Відсотки»
