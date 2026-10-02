## ADDED Requirements

### Requirement: Editing names the транзакція's продавець

Transaction editing SHALL show a «Продавець» row for a транзакція that carries an опис. When the
опис is recognised as a продавець, the row SHALL show that продавець's назва, and tapping it SHALL
open that продавець's screen. When the опис is recognised as none, the row SHALL offer «Назвати
продавця», which opens the naming form for that опис. A транзакція carrying no опис SHALL show no
such row. The row SHALL read the опис as it stands when the screen is shown. An опис changed in
the same editing SHALL be read once it is saved, since the продавець is what the stored опис is
recognised as.

#### Scenario: A recognised транзакція names its продавець

- **WHEN** «АТБ» holds "atb" and the owner opens a витрата carrying the опис "ATB MARKET 23"
- **THEN** editing shows the опис "ATB MARKET 23" and a «Продавець» row reading «АТБ», which opens
  «АТБ»'s screen

#### Scenario: An unrecognised транзакція offers naming

- **WHEN** the owner opens a витрата carrying the опис "ЗЕРНО 12" that no написання recognises
- **THEN** the «Продавець» row offers «Назвати продавця», which opens the naming form proposing
  «Зерно» and "зерно"

#### Scenario: No опис, no row

- **WHEN** the owner opens a витрата recorded by hand with no опис
- **THEN** editing shows no «Продавець» row

## MODIFIED Requirements

### Requirement: The feed shows the latest five legible records

The latest-transactions section SHALL show at most five records across all history in descending date then recording-recency order, each with a category/type icon plus text, the назва of the продавець its опис is recognised as — or the stored опис itself when it is recognised as none — when an опис is present, date, account (both for a переказ) and exact amount/currency with explicit money direction (expense −, income/повернення +, коригування its sign, переказ a directional arrow with both leg amounts when different), and offer «Усі» and existing editing and one-tap categorisation.

#### Scenario: Five of a long history
- **GIVEN** eight records including equal-date records and a backdated newly entered record
- **WHEN** the feed is read
- **THEN** it shows the first five in date/recording-recency order, not insertion order alone, and «Усі» opens the existing complete searchable history

#### Scenario: Short or empty history
- **GIVEN** three records, or none
- **WHEN** the feed is read
- **THEN** it shows those three, or «Поки нічого не записано», and «Усі» is available in both cases

#### Scenario: Description and type stay distinguishable
- **GIVEN** a «Без категорії» expense with опис «СІЛЬПО Київ» that no написання recognises, an income «Без джерела» and a cross-currency transfer
- **WHEN** their rows are read
- **THEN** description never replaces category/source/type, the transfer exposes both accounts/amounts, and no meaning depends only on color
- **AND** row taps open existing transaction editing, with existing correction restrictions

#### Scenario: A recognised опис reads as its продавець
- **GIVEN** «АТБ» holds the написання "atb" and a витрата carries the опис «ATB MARKET 23»
- **WHEN** its row is read
- **THEN** it shows «АТБ» where it would show the опис, and never in place of its category

#### Scenario: Categorisation stays in place
- **GIVEN** an uncategorised expense with a stored опис in the feed
- **WHEN** its categorisation action is used
- **THEN** the existing short picker and rule offer work without opening the editor and refreshed categories/banner reflect the stored choice

### Requirement: The опис is visible everywhere and correctable

The latest-transactions feed SHALL show, for a транзакція carrying an опис, the назва of the
продавець that опис is recognised as, and the stored опис itself when it is recognised as none; it
SHALL omit both when no опис exists. Transaction editing SHALL show the stored опис, as stored,
whether or not it is recognised. From editing, the owner SHALL be able to write, change or clear
the опис of any транзакція, whatever put it there — an import, a чернетка or the owner's own hand
— and the опис SHALL be named neutrally rather than as the bank's alone. Changing any other field
SHALL preserve the опис, and neither the опис nor the назва shown for it SHALL replace or be
treated as the категорія, джерело, account name, amount, currency, date or type.

#### Scenario: An uncategorised merchant can be identified in the feed

- **WHEN** monobank imports a витрата in «Без категорії» with опис "СІЛЬПО Київ" that no написання
  recognises
- **THEN** the latest feed shows "СІЛЬПО Київ" with that витрата while its category remains «Без
  категорії»

#### Scenario: A recognised опис shows its продавець in the feed and itself in editing

- **WHEN** «АТБ» holds "атб" and monobank imports a витрата with опис "Оплата послуг АТБ-Маркет 1234
  Київ"
- **THEN** the feed shows «АТБ» with that витрата, and editing shows the опис "Оплата послуг
  АТБ-Маркет 1234 Київ" as stored

#### Scenario: An arriving item keeps its source distinct from its description

- **WHEN** monobank imports a дохід «Без джерела» with опис "Повернення за замовлення"
- **THEN** the feed shows both «Без джерела» and "Повернення за замовлення", without treating the
  description as a джерело

#### Scenario: A manual transaction stays compact

- **WHEN** a manually recorded транзакція has no опис
- **THEN** the feed and editor show no empty description row or placeholder for it

#### Scenario: A wrong опис is corrected from editing

- **WHEN** the owner opens a stored витрата carrying the опис "шини на зиму" and changes it to
  "шини на літо"
- **THEN** the same транзакція now carries "шини на літо" and its сума, категорія, рахунок, дата
  and type are unchanged

#### Scenario: An опис can be cleared

- **WHEN** the owner clears the опис of a stored транзакція
- **THEN** the same транзакція is stored with no опис and the feed shows no description row for it

#### Scenario: Editing another field leaves the опис alone

- **WHEN** the owner changes only the сума of a витрата carrying an imported опис
- **THEN** the опис is still exactly what the import stored

### Requirement: Categorising a транзакція offers to remember it as a правило

After a категорія is set on a stored витрата or повернення that carries an опис — through the
«Без категорії» mark in the feed or through the editing screen alike — the owner SHALL be offered
a правило that would make the same decision next time, with the merchant criterion already
proposed from that опис — the продавець it is recognised as, or a pattern — and changeable before
it is stored: a pattern is editable, and a продавець can be switched to the pattern proposed from
the опис. After a stored витрата that carries an опис is
retyped into a переказ from editing, the owner SHALL likewise be offered a правило-переказ onto the
destination рахунок just chosen. Accepting SHALL store the правило; declining
SHALL store none and SHALL leave the категорія just set — or the переказ just stored — exactly as it
is. Whether the правило is stored or not, the категорія or переказ SHALL already be stored before
the offer is made, so dismissing the offer — or leaving the screen — can never lose the owner's
decision.

The offer SHALL name what it would remember in words the owner can check before accepting: the
pattern, or «продавець» and the продавець's назва, and the категорія it would target, or the same
criterion and «переказ на» the destination рахунок's назва. The cases in which no offer is made at
all belong to the categorisation-rules capability.

#### Scenario: One tap in the feed, then the offer

- **WHEN** the owner uses the «Без категорії» mark on a витрата carrying the опис "СІЛЬПО 123
  Київ", which no написання recognises, and picks Groceries
- **THEN** the витрата carries Groceries and an offer appears naming the pattern "сільпо" and
  Groceries

#### Scenario: A recognised опис offers its продавець

- **WHEN** «АТБ» holds "atb", no правило names it, and the owner uses the «Без категорії» mark on a
  витрата carrying the опис "ATB MARKET 23" and picks Groceries
- **THEN** an offer appears naming «продавець АТБ» and Groceries, with a way to switch to the
  pattern "atb market"

#### Scenario: Accepting the offer stores the правило

- **WHEN** the offer naming the pattern "сільпо" and Groceries is accepted unchanged
- **THEN** the правило "сільпо → Groceries" exists

#### Scenario: Declining keeps the категорія

- **WHEN** that offer is declined
- **THEN** the витрата still carries Groceries and no правило was stored

#### Scenario: The editing screen offers it too

- **WHEN** the owner opens a витрата carrying the опис "УКЛОН" in editing, changes its категорія
  to Transport and saves
- **THEN** the витрата carries Transport and an offer appears naming the pattern "уклон" and
  Transport

#### Scenario: Retyping into a переказ offers the правило-переказ

- **WHEN** the owner retypes a витрата on platinum carrying the опис "Округлення балансу «Резерв»"
  into a переказ onto РЕЗЕРВ and saves
- **THEN** the переказ is stored and an offer appears naming the pattern "округлення балансу" and
  «переказ на РЕЗЕРВ»

#### Scenario: Accepting the правило-переказ pairs the history too

- **WHEN** that offer is accepted while two more «Без категорії» витрати carrying "Округлення
  балансу «Резерв»" are stored on platinum
- **THEN** the правило-переказ exists, both витрати are перекази onto РЕЗЕРВ, and the owner is told
  two витрати became перекази
