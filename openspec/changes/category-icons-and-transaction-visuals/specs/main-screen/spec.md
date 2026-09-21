## ADDED Requirements

### Requirement: A transaction line leads with the іконка of what the транзакція is

Every line of the latest-transactions feed, and every line of another screen that lists
транзакції as the feed does — «Транзакції», the рухи of a рахунок and a категорія's month — SHALL
be the same line, and it SHALL lead with one іконка in a tile:

- a витрата: its категорія's іконка — «Питання» for «Без категорії», «Відсоток» for «Комісія»;
- a повернення: its категорія's іконка, the same one a витрата in that категорія shows;
- a переказ: «Переказ», whatever the вид of the рахунок it went to — an інвестиція, a top-up of a
  банка and a переказ onto a рахунок-борг included;
- a дохід: «Дохід», whatever its джерело — «Відсотки» and «Без джерела» included;
- a коригування: «Плюс-мінус», of either sign.

The іконка SHALL NOT depend on the currency of the транзакція. It SHALL NOT replace a word: the line
SHALL keep showing its label — the категорія, the джерело, or the рахунки of a переказ or a
коригування — its опис when it has one, its рахунок (both рахунки of a переказ, from → to), its
дата and its сума with its currency, and it SHALL keep the «Без категорії» highlight and the
over-limit mark exactly as before. Because the words already say what the іконка shows, a screen
reader SHALL read the line's words and SHALL NOT announce the іконка separately.

#### Scenario: A витрата leads with its категорія's іконка

- **WHEN** the feed holds a витрата of 12000 minor units UAH in Groceries, which carries
  «Продукти», with the опис «СІЛЬПО»
- **THEN** its line leads with «Продукти» and still shows Groceries, «СІЛЬПО», its рахунок, its дата
  and its сума in UAH

#### Scenario: An uncategorised витрата leads with «Питання» and keeps its highlight

- **WHEN** the feed holds a витрата in «Без категорії»
- **THEN** its line leads with «Питання» and is still highlighted with its one-tap categorisation

#### Scenario: A комісія leads with «Відсоток»

- **WHEN** the feed holds the витрата «Комісія» a short-arriving переказ proposed
- **THEN** its line leads with «Відсоток», and the переказ it came from leads with «Переказ»

#### Scenario: A переказ leads with «Переказ» and names both рахунки

- **WHEN** the feed holds a переказ of 50000 minor units UAH from mono black to the банка «Подушка»
- **THEN** its line leads with «Переказ», names mono black → «Подушка», and shows no категорія

#### Scenario: An інвестиція and a переказ onto a рахунок-борг are still перекази on the line

- **WHEN** the feed holds a переказ onto a рахунок of вид `investment` and a переказ onto a
  рахунок-борг
- **THEN** both lines lead with «Переказ», and neither shows a категорія's іконка

#### Scenario: A дохід leads with «Дохід» whatever its джерело

- **WHEN** the feed holds a дохід in Salary, a дохід in «Без джерела» and a дохід in «Відсотки»
- **THEN** all three lines lead with «Дохід», each still names its джерело, and none leads with
  «Відсоток»

#### Scenario: A коригування leads with «Плюс-мінус» of either sign

- **WHEN** the feed holds a коригування of −3000 and one of +3000 minor units UAH
- **THEN** both lines lead with «Плюс-мінус», and each shows its сума with its own sign

#### Scenario: The same категорія leads with the same іконка in every currency

- **WHEN** the feed holds a Travel витрата in UAH and a Travel витрата in USD
- **THEN** both lines lead with Travel's іконка, each with its own currency

#### Scenario: A screen reader reads the line's words, not its іконка

- **WHEN** a screen reader reads a line of a витрата in Groceries
- **THEN** it reads the line's words — Groceries, its рахунок, its дата, its сума — and announces no
  separate element for the іконка

#### Scenario: The same line appears on every list of транзакції

- **WHEN** a витрата in Groceries is found in «Транзакції», seen in its рахунок's рухи, and seen in
  Groceries' month list on Місяць
- **THEN** in all three places its line leads with «Продукти» and reads exactly as it does in the
  feed

#### Scenario: A renamed категорія's lines keep its іконка

- **WHEN** Groceries carries «Продукти» and the owner renames it to «Їжа»
- **THEN** every line of its витрати reads «Їжа» and still leads with «Продукти»

### Requirement: A повернення reads as a повернення on its line

A повернення's line SHALL say «повернення» in words beside its рахунок and SHALL show its сума with
a «+» — money that came back to the рахунок. Because a повернення is a negative витрата in its
категорія and not a дохід, its line SHALL NOT lead with «Дохід» and its сума SHALL NOT be drawn in
the tone a дохід's сума is drawn in.

#### Scenario: A повернення is told apart from a витрата of the same сума

- **WHEN** the feed holds a витрата of 5000 and a повернення of 5000 minor units UAH, both in
  Groceries, which carries «Продукти»
- **THEN** both lines lead with «Продукти»; the повернення says «повернення» and shows its сума with
  «+», and the витрата shows neither

#### Scenario: A повернення is not dressed as a дохід

- **WHEN** the feed holds a повернення in Groceries and a дохід in Salary of the same сума
- **THEN** only the дохід leads with «Дохід» and has its сума drawn in the дохід tone

### Requirement: Іконки on a line share one calm tone and stay legible in both themes

Every категорія's іконка on a line SHALL be drawn in the same neutral tone on the same tile — no
категорія is told apart from another by colour. The tone SHALL change only together with a state
the line already marks: the over-limit red that the категорія's назва on the line already turns
when it is over its ліміт for that транзакція's month, and the дохід tone that a дохід's сума is
already drawn in. In the light theme and in the dark theme alike, every tone an
іконка on a line can be drawn in SHALL contrast with its tile by at least 3:1.

#### Scenario: Two категорії are not told apart by colour

- **WHEN** the feed holds a витрата in Groceries and a витрата in Travel, neither over its ліміт
- **THEN** their іконки differ and are drawn in the same tone on the same tile

#### Scenario: Over its ліміт, the іконка turns red with its name

- **WHEN** Groceries is over its ліміт for August and the feed holds an August Groceries витрата
- **THEN** that line's «Продукти» іконка and its Groceries label are both drawn in the over-limit
  red, and a July Groceries line is drawn in the neutral tone

#### Scenario: The dark theme keeps every іконка legible

- **WHEN** the app is shown in the dark theme and the feed holds a витрата, a витрата over its
  ліміт, a переказ, a дохід, a повернення and a коригування
- **THEN** every іконка contrasts with its tile by at least 3:1, as it does in the light theme
