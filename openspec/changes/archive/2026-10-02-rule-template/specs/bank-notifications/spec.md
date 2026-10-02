## MODIFIED Requirements

### Requirement: Confirmation creates the транзакція the чернетка proposed

Confirming a чернетка SHALL create exactly the транзакція it proposes on its рахунок, dated
the чернетка's date, carrying the чернетка's text as the транзакція's опис, and SHALL settle
the чернетка so it awaits nothing further. A витрата-чернетка SHALL be categorised by the
owner's правила — and, when no правило matches, by the шаблон категоризації — applied at the
moment of confirmation to the чернетка's text with no MCC, and SHALL fall back to «Без категорії»
when neither matches. A дохід-чернетка SHALL create its
дохід with the джерело «Без джерела». A raw чернетка SHALL NOT confirm without a сума the
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

- **WHEN** a дохід-чернетка of 50000 minor units UAH is confirmed
- **THEN** a дохід of 50000 minor units UAH with the джерело «Без джерела» exists, retypeable
  by the owner as ever

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

### Requirement: A правило auto-confirms a parsed витрата-чернетка

A newly drafted витрата-чернетка whose text is matched by one of the owner's правила at the
moment of drafting — or, when no правило matches it, by a базова категорія of the шаблон
категоризації that lands on a категорія of this device — SHALL confirm itself immediately into a
витрата of the категорія that match gives, with no owner action — FR-S3's "або автоматично за
правилом". Matching SHALL run on the чернетка's text with no MCC, so a правило whose only
criterion is an MCC, and the MCC codes the шаблон carries, SHALL never auto-confirm a чернетка. A дохід-чернетка and a raw чернетка SHALL never auto-confirm: the
one has no expense category to gain, the other has no сума to trust.

#### Scenario: A recognised merchant confirms itself

- **WHEN** the правило "сільпо → Groceries" exists and a movement of money out, 12550 minor
  units UAH, with text containing "СІЛЬПО" drafts on a watched UAH рахунок
- **THEN** a витрата of 12550 minor units UAH in Groceries exists at once and no чернетка
  awaits the owner

#### Scenario: An MCC-only правило does not auto-confirm

- **WHEN** the owner's only правило carries an MCC and no merchant pattern, and a money-out
  movement whose text no базова категорія matches drafts
- **THEN** the чернетка awaits the owner, unconfirmed

#### Scenario: Money in never auto-confirms

- **WHEN** a movement of money in drafts while правила exist
- **THEN** the дохід-чернетка awaits the owner, unconfirmed

#### Scenario: A raw чернетка never auto-confirms

- **WHEN** a watched notification yields unparsed while правила exist
- **THEN** the raw чернетка awaits the owner, unconfirmed
