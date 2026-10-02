## Purpose

What a фраза means: how one Ukrainian sentence the owner dictated or typed is read into the values
of the entry form — сума, type, рахунок or рахунки, категорія or джерело, опис and date — by fixed
local rules, and what is left unchosen and said rather than guessed.

## ADDED Requirements

### Requirement: A фраза names values and stores nothing

Understanding a фраза SHALL yield only the values the фраза names, each either matched to one of
the owner's own records or reported as heard but not used, and SHALL NOT store, create or change
any транзакція, рахунок, категорія, джерело or правило. A value the фраза does not name — the type
included — SHALL be absent from what it yields, never filled with a default. The same фраза with the
same рахунки, категорії and джерела, on the same day and onto a form on the same type, SHALL always
yield the same values. Words the
rules below do not use SHALL change nothing. Punctuation SHALL be read as a space, except a comma or
point standing between two digits.

#### Scenario: A full фраза yields every field it names

- **WHEN** the рахунок Гаманець (UAH) and the категорія «Доставка їжі» exist and the фраза is
  «Додай витрату, п'ятсот гривень, з рахунку гаманець, категорія доставка їжі, опис покусать суші.»
- **THEN** it yields: type витрата, сума 500, рахунок Гаманець, категорія «Доставка їжі», опис
  «покусать суші» — and nothing is stored

#### Scenario: A фраза naming nothing known yields nothing

- **WHEN** the фраза is «ну от якось так»
- **THEN** it yields no сума, no type, no рахунок, no категорія, no джерело, no опис, no date and
  no report

#### Scenario: A фраза never creates a категорія

- **WHEN** no категорія «Суші» exists and the фраза is «категорія суші триста гривень»
- **THEN** it yields сума 300 and reports «суші» as a категорія heard but not matched, and the
  owner's категорії are unchanged

### Requirement: Names are matched whatever their grammatical ending, and only so

Two words SHALL be the same word when they are equal ignoring letter case and apostrophe form, or
when removing from each either nothing or any one ending of the app's fixed list of Ukrainian case
and number endings — not necessarily the longest — leaves the same rest of at least two letters,
the fleeting «е»/«о» before a rest's last consonant not counting (гаманець → гаманця, гаманцем;
Андрій → Андрія).
No other likeness — a shared beginning, a similar sound — SHALL make two words the same.

A рахунок, категорія or джерело SHALL be matched when the words of its name appear in the фраза one
after another, in the same order, each the same word. Only unarchived рахунки, the unarchived
категорії a витрата's picker offers and unarchived джерела SHALL be matched; «Коригування» SHALL
never be. When several records of the kind looked for match, the one whose name takes more words
SHALL win; among equally long ones, the one with more words equal letter for letter; when still
tied, none SHALL be chosen and the words SHALL be reported as matching more than one — unless the
фраза named a currency and exactly one of the tied рахунки is in it, which is then chosen.

Names SHALL be found before anything else is read, and a word a name took SHALL be part of that
name only: never read as a number, a date or a currency, and never part of a second name. A word of
the fixed lists below — type words, markers, prepositions, currency, date and опис words — SHALL be
read as such and SHALL NOT match a name on its own; it is part of a name only as one word of a
longer name matched whole. The words of the опис SHALL not be searched for names.

When the same words match records of more than one kind, the kind SHALL be decided by what stands
before them: after a marker, the marker's kind; after «з», «із», «зі», «від», «на», «в», «у» or
«до», a рахунок; otherwise — after «за» or with nothing before them — a категорія or джерело.

#### Scenario: Case endings still match

- **WHEN** the рахунок Гаманець and the категорії «Доставка їжі» and Їжа exist
- **THEN** «з гаманця» and «гаманцем» match Гаманець, «доставку їжі» matches «Доставка їжі», and
  «на їжу» matches Їжа

#### Scenario: A person's name in another case still matches

- **WHEN** the джерело Андрій exists and the фраза is «отримав тисячу від Андрія»
- **THEN** the джерело is Андрій

#### Scenario: A name equal to a type word does not take it

- **WHEN** the джерело Кешбек and the категорія Продукти exist and the фраза is «кешбек сто
  гривень за продукти»
- **THEN** the type is повернення in категорія Продукти, not a дохід from Кешбек

#### Scenario: After «на» a рахунок wins over a same-named категорія

- **WHEN** the рахунок Відпустка of kind savings and the категорія Відпустка both exist
- **THEN** «тисяча на відпустку» is a переказ to the рахунок Відпустка, and «тисяча за відпустку»
  names the категорія Відпустка

#### Scenario: A shared beginning is not a match

- **WHEN** the категорії Кафе, Сумки, Авто and Продукти exist
- **THEN** «кави» matches no Кафе, «суші» no Сумки, «автобус» no Авто and «продав» no Продукти

#### Scenario: The longer name wins

- **WHEN** the категорії Кафе and «Кафе і ресторани» exist and the фраза says «категорія кафе і
  ресторани»
- **THEN** the категорія is «Кафе і ресторани»

#### Scenario: Two equal matches choose neither

- **WHEN** a UAH рахунок and a USD рахунок are both called Скарбничка and the фраза is «витрата
  сто зі скарбнички»
- **THEN** no рахунок is chosen and «скарбнички» is reported as matching more than one рахунок

#### Scenario: A named currency decides between same-named рахунки

- **WHEN** a UAH рахунок and a USD рахунок are both called Скарбничка and the фраза is «витрата
  сто доларів зі скарбнички»
- **THEN** the рахунок is the USD Скарбничка and the сума is 100

#### Scenario: A name keeps its own number

- **WHEN** the рахунок «Банка 2» of kind spending exists and the фраза is «п'ятсот з банки 2»
- **THEN** the рахунок is «Банка 2» and the сума is 500

#### Scenario: An archived рахунок is not matched

- **WHEN** the рахунок Заначка is archived and the фраза says «з заначки»
- **THEN** no рахунок is chosen

#### Scenario: «Коригування» is never matched

- **WHEN** the фраза is «сто гривень категорія коригування»
- **THEN** no категорія is chosen and «коригування» is reported as a категорія heard but not matched

### Requirement: The сума is read from digits or from Ukrainian number words

The сума SHALL be read from digits — a group of exactly three digits after a space or a
non-breaking space belonging to the number before it, and a comma or a point between two digits
standing before the fractional part — or from Ukrainian number words in any grammatical form, from
«нуль» to the millions, including «тисяча», «тис.», «пів» and «півтори»; digits and words SHALL
combine («10 тисяч», «5 тисяч 200», «2,5 тисячі»). «Півтори» and «півтора» SHALL both read as one and
a half. A number SHALL be one unbroken run of such words
and digits: «і», «та», a comma and any other word end it. A fractional part MAY be named after the
main unit in копійки («копійка», «копійки», «копійок», «коп») or центи («цент», «центи», «центів»).
Every apostrophe form («'», «’», «ʼ») SHALL read the same. The сума SHALL be an exact amount in
minor units; it SHALL never pass through a fractional number.

#### Scenario: Words make the сума

- **WHEN** the фраза contains «п'ятсот гривень»
- **THEN** the сума is 500

#### Scenario: Thousands in words

- **WHEN** the фраза contains «десять тисяч», or «тисяча двісті п'ятдесят», or «дві тисячі триста»
- **THEN** the сума is 10000, 1250 or 2300 respectively

#### Scenario: Halves

- **WHEN** the фраза contains «півтори тисячі», or «пів тисячі», or «2,5 тисячі»
- **THEN** the сума is 1500, 500 or 2500 respectively

#### Scenario: Digits and words together

- **WHEN** the фраза contains «10 тисяч», or «10 тис.», or «5 тисяч 200»
- **THEN** the сума is 10000, 10000 or 5200 respectively

#### Scenario: Копійки make the fractional part

- **WHEN** the фраза contains «сто двадцять п'ять гривень п'ятдесят копійок» or «125 грн 50 коп»
- **THEN** the сума is 125.50, that is 12550 minor units

#### Scenario: Grouped digits with a comma

- **WHEN** the фраза contains «1 250,50»
- **THEN** the сума is 1250.50

#### Scenario: A comma with a space is no decimal point

- **WHEN** the фраза is «двісті, 50 на каву»
- **THEN** «двісті» and «50» are two numbers

#### Scenario: Every apostrophe reads the same

- **WHEN** the фраза contains «п’ятсот» or «пʼятсот»
- **THEN** the сума is 500

### Requirement: Exactly one number is taken as the сума, or none

When the фраза holds one number, that SHALL be the сума. When it holds several, the сума SHALL be
the one the currency marks; when none or more than one of them is marked, no сума SHALL be taken
and the сума SHALL be reported as heard but not decided. Numbers inside the опис or inside a name
SHALL never be taken as the сума.

#### Scenario: The number with a currency word wins

- **WHEN** the фраза is «двісті гривень за дві кави»
- **THEN** the сума is 200

#### Scenario: A currency word marks only the number before it

- **WHEN** the фраза is «сто гривень 2 кави»
- **THEN** the сума is 100

#### Scenario: Two bare numbers decide nothing

- **WHEN** the фраза is «витрата триста і сорок»
- **THEN** no сума is taken and the сума is reported as not decided

#### Scenario: A fee said beside the сума decides nothing

- **WHEN** the фраза is «п'ятсот гривень комісія двадцять гривень»
- **THEN** no сума is taken and the сума is reported as not decided

#### Scenario: A number in the опис stays in the опис

- **WHEN** the фраза is «вісімдесят гривень опис 2 кави»
- **THEN** the сума is 80 and the опис is «2 кави»

### Requirement: A сума in another currency than the рахунок's is never reinterpreted

The currency words SHALL be exactly these, in any letter case. Гривня: «гривня», «гривні»,
«гривню», «гривень», «гривнею», «гривнями», «гривнях», «грн», «uah», «₴». Долар: «долар», «долара»,
«долари», «доларів», «доларами», «доларах», «дол», «бакс», «бакси», «баксів», «usd», «$». Євро:
«євро», «eur», «€». Currencies the app is not asked about here SHALL be recognised too, so that they
are never read as another: «злотий», «злотого», «злоті», «злотих», «pln», «фунт», «фунта», «фунти»,
«фунтів», «gbp», «£», «франк», «франка», «франки», «франків», «chf», «крона», «крони», «крон»,
«єна», «єни», «єн», «юань», «юані», «юанів». A currency word or code SHALL mark the number standing
directly before it; a symbol SHALL mark the number standing directly next to it on either side, and
SHALL be read as a word even where other punctuation is read as a space. A run of копійки or центи
after a marked number SHALL be that сума's fractional part, never a second number. The фраза SHALL report the currency its сума was named in, if any.

When the рахунок the entry form ends up on — for a переказ, the one the money left — is in another
currency than the one named, the сума SHALL NOT be filled and SHALL be reported as heard in that
currency; it SHALL never be converted or reread in the рахунок's currency. A сума named with no
currency word SHALL be read in the рахунок's currency. The amount that arrived on a переказ SHALL
never be filled from a фраза.

#### Scenario: Dollars onto a hryvnia рахунок fill no сума

- **WHEN** the фраза is «двадцять доларів з гаманця» and Гаманець is a UAH рахунок
- **THEN** the сума is not filled and it is reported that 20 доларів was heard, while Гаманець is
  still chosen

#### Scenario: A currency the app does not hold is never read as гривні

- **WHEN** the фраза is «п'ятдесят злотих з гаманця» and Гаманець is a UAH рахунок
- **THEN** the сума is not filled and it is reported that 50 злотих was heard

#### Scenario: A symbol or a singular form marks the currency too

- **WHEN** Гаманець is a UAH рахунок and the фраза is «$20 з гаманця» or «2,5 долара з гаманця»
- **THEN** the сума is not filled and it is reported that 20 or 2.50 доларів was heard

#### Scenario: No currency word takes the рахунок's currency

- **WHEN** the фраза is «двадцять з рахунку сейф» and Сейф is a USD рахунок of kind cash
- **THEN** the сума is 20 in USD

#### Scenario: A cross-currency переказ fills only what left

- **WHEN** Чорна is UAH, Сейф is USD and the фраза is «тисяча гривень з чорної на сейф»
- **THEN** the type is переказ from Чорна to Сейф, the сума that left is 1000, and the amount that
  arrived is not filled

### Requirement: The type is yielded only when the фраза names one, by a fixed precedence

The фраза SHALL yield a type only by the first of these that applies, and none otherwise — so a
фраза that names no type leaves the form's own:

1. It names two different рахунки, one after «з», «із», «зі» or «від» and the other after «на»,
   «в», «у» or «до»: **переказ**, from the first to the second, whatever type word it also holds.
2. It names a рахунок of kind debt: **переказ** between that рахунок and the other рахунок the
   фраза names, or the рахунок the form is on when it names none — from the debt рахунок when that
   stands after «з», «із», «зі» or «від» or the фраза holds a повернення or дохід word, otherwise
   to it.
3. It holds a повернення word — «повернення», «повернули», «повернув», «повернула», «кешбек»:
   **повернення**, never a дохід, because money returned for a purchase is a negative витрата in
   its категорія.
4. It holds a дохід word — «дохід», «надходження», «отримання», «отримав», «отримала», «прийшло»,
   «прийшли», «заробив», «заробила» — or the marker «джерело», or its only label is unmarked and matches a
   джерело and no категорія: **дохід**.
5. It holds a переказ word — «переказ», «переказав», «переказала», «переклав», «переклала»,
   «перекинув», «перекинула», «зняв», «зняла»: **переказ**. A рахунок it names after «на», «в»,
   «у» or «до» is where the money arrived and any other where it left; a source it does not name
   stays the рахунок the form is on, and a destination it does not name is left unchosen and
   reported as missing.
6. It holds a витрата word — «витрата», «витрату», «витрати», «витратив», «витратила», «потратив»,
   «потратила», «заплатив», «заплатила», «купив», «купила»: **витрата**.
7. The form is on витрата or переказ, and the фраза's only рахунок stands after «на», «в», «у» or
   «до»: **переказ** to that рахунок, the money leaving the рахунок the form is on — money put
   *onto* a рахунок of the owner's is never a витрата from it. On a form on дохід or повернення
   that рахунок is simply where the money arrived, and the type stays the form's.

#### Scenario: Naming no type leaves the form's type

- **WHEN** the категорія Кафе exists and the фраза is «категорія кафе»
- **THEN** no type is yielded

#### Scenario: Отримання is a дохід

- **WHEN** the фраза is «отримав десять тисяч на рахунок гаманець»
- **THEN** the type is дохід and the рахунок is Гаманець

#### Scenario: A повернення is never a дохід

- **WHEN** the категорія Електроніка and the рахунки Гаманець and Готівка exist and the фраза is
  «десять тисяч готівкою на отримання на рахунок гаманець повернення за електроніку»
- **THEN** the type is повернення, the сума is 10000, the рахунок is Гаманець and the категорія is
  Електроніка

#### Scenario: Two рахунки from and to are a переказ

- **WHEN** the рахунки Чорна and Гаманець exist and the фраза is «отримав дві тисячі з чорної на
  гаманець»
- **THEN** the type is переказ, the money left Чорна and arrived at Гаманець

#### Scenario: A jar top-up is a переказ

- **WHEN** Скарбничка is a рахунок of kind savings and the фраза is «тисяча на скарбничку»
- **THEN** the type is переказ and the money arrived at Скарбничка, leaving the рахунок the form is
  on

#### Scenario: Cash put into the гаманець is a переказ

- **WHEN** Гаманець is a рахунок of kind cash and the фраза is «тисяча на гаманець»
- **THEN** the type is переказ and the money arrived at Гаманець, leaving the рахунок the form is
  on

#### Scenario: On a дохід form «на» names the рахунок

- **WHEN** the form is on дохід with джерело Зарплата picked and the фраза is «п'ять тисяч на чорну»
- **THEN** no type is yielded, the рахунок is Чорна and the сума 5000, and the джерело stays
  Зарплата

#### Scenario: Lending is a переказ

- **WHEN** the рахунок Ярослав is of kind debt and the фраза is «позичив Ярославу дві тисячі»
- **THEN** the type is переказ and the money arrived at Ярослав, leaving the рахунок the form is on

#### Scenario: A repayment is a переказ back

- **WHEN** the рахунок Ярослав is of kind debt, Гаманець exists, and the фраза is «Ярослав
  повернув дві тисячі на гаманець»
- **THEN** the type is переказ, the money left Ярослав and arrived at Гаманець

#### Scenario: A переказ to someone who is no рахунок says what is missing

- **WHEN** the рахунок Чорна exists, no рахунок is called Олег, and the фраза is «переказав
  п'ятсот Олегу з чорної»
- **THEN** the type is переказ, the money left Чорна, and where it arrived is reported as missing

#### Scenario: A джерело alone makes a дохід

- **WHEN** the джерело Зарплата and the рахунок Чорна exist, no категорія is called Зарплата, and
  the фраза is «зарплата тридцять тисяч на чорну»
- **THEN** the type is дохід with джерело Зарплата on Чорна

#### Scenario: The marker «джерело» makes a дохід

- **WHEN** the джерело Фриланс and the категорія Фриланс both exist and the фраза is «п'ять тисяч
  джерело фриланс»
- **THEN** the type is дохід with джерело Фриланс and no категорія

### Requirement: Markers say what the next words are, and where they stop

The words «рахунок», «рахунку», «рахунком» SHALL say a рахунок follows; «категорія», «категорії»,
«категорію», «категорією» a категорія — or a джерело when the type in force is дохід; «джерело»,
«джерела», «джерелом» a джерело. A name after a marker SHALL be matched against that kind only. The name SHALL be the longest match starting at the next word, and a preposition
standing directly before the marker SHALL count as standing before the name. When no name matches
there, the words from there up to the next marker, number, currency word, type word, date word or
the end SHALL be reported as heard but not matched for that kind.

A рахунок introduced by a marker SHALL win over one merely mentioned. Outside the cases where the
type rules use two рахунки, a фраза naming two or more рахунки with nothing to choose between them
SHALL choose none and report them as matching more than one. A name after «за», «на», «в» or «у» or
merely mentioned SHALL be taken when it matches exactly one record of the kind looked for and SHALL
otherwise change nothing. For a витрата, дохід or повернення the one рахунок SHALL be taken
whichever preposition stands before it; for a переказ the type rules say which end it is.

#### Scenario: A marker after a preposition keeps the direction

- **WHEN** the рахунки Чорна and Гаманець exist and the фраза is «з рахунку чорна на рахунок
  гаманець тисяча»
- **THEN** the type is переказ from Чорна to Гаманець and the сума is 1000

#### Scenario: The said рахунок wins over a mentioned one

- **WHEN** the рахунки Гаманець and Готівка exist and the фраза is «витрата десять тисяч готівки з
  рахунку гаманець»
- **THEN** the рахунок is Гаманець

#### Scenario: A said рахунок that does not exist is reported up to the next number

- **WHEN** no рахунок is called Скриня and the фраза is «з рахунку скриня триста гривень»
- **THEN** no рахунок is chosen, «скриня» is reported as a рахунок heard but not matched, and the
  сума is 300

#### Scenario: Two mentioned рахунки for a витрата choose neither

- **WHEN** the рахунки Гаманець and Готівка exist and the фраза is «витрата сто гривень гаманець
  готівка»
- **THEN** no рахунок is chosen and both are reported as matching more than one рахунок

#### Scenario: «За» names the категорія of a повернення

- **WHEN** the категорія Електроніка exists and the фраза is «повернення тисяча за електроніку»
- **THEN** the type is повернення and the категорія is Електроніка

#### Scenario: A word after «на» that is no name changes nothing

- **WHEN** no категорія, джерело or рахунок is called Суші and the фраза is «п'ятсот на суші»
- **THEN** the сума is 500, no категорія is yielded and nothing about «суші» is reported

### Requirement: A категорія or джерело is taken for the type in force

The type in force SHALL be the type the фраза yields, or, when it yields none, the type the entry
form is on. For a витрата and a повернення in force a label SHALL be matched against категорії; for
a дохід against джерела; a переказ takes neither, and a label the фраза names for a переказ SHALL
be reported as not used by a переказ. An unmarked label that matches exactly one джерело and no
категорія SHALL make the type дохід by the type rules, whatever the form is on.

#### Scenario: A дохід takes a джерело, not a категорія

- **WHEN** the джерело Фриланс and the категорія Фриланс both exist and the фраза is «отримав
  п'ять тисяч категорія фриланс»
- **THEN** the джерело is Фриланс and no категорія is yielded

#### Scenario: A marker keeps its kind without a type

- **WHEN** the form is on витрата, only the джерело Зарплата exists under that name, and the фраза
  is «категорія зарплата»
- **THEN** no type and no label are yielded and «зарплата» is reported as a категорія heard but not
  matched

#### Scenario: A typeless label follows the form's type

- **WHEN** the джерело Фриланс and the категорія Фриланс both exist and the фраза «категорія
  фриланс» is applied to a form on дохід, and then to a form on витрата
- **THEN** the first yields the джерело Фриланс and the second the категорія Фриланс

#### Scenario: A переказ takes no label

- **WHEN** the категорія Кафе exists and the фраза «категорія кафе» is applied to a form on переказ
- **THEN** no label is yielded and «кафе» is reported as not used by a переказ

### Requirement: The опис is what follows «опис»

The опис SHALL be the words after «опис», «описом», «з описом», «коментар» or «примітка», up to the
end of the фраза or up to a marker said after it that is followed by a matching name — together
with a preposition standing directly before that marker — kept as heard with the surrounding spaces
and punctuation trimmed. A marker inside the опис followed by no matching name SHALL stay part of
the опис. A фраза without one of the опис words SHALL yield no опис; the rest of the фраза SHALL
never become an опис by itself.

#### Scenario: The опис runs to the end

- **WHEN** the фраза is «п'ятсот гривень, опис покусать суші.»
- **THEN** the опис is «покусать суші»

#### Scenario: A marker with a name ends the опис

- **WHEN** the рахунок Гаманець exists and the фраза is «двісті з описом кава з другом з рахунку
  гаманець»
- **THEN** the опис is «кава з другом» and the рахунок is Гаманець

#### Scenario: A marker with no name stays in the опис

- **WHEN** no рахунок is called «за світло» and the фраза is «тисяча опис оплата рахунку за світло»
- **THEN** the опис is «оплата рахунку за світло»

#### Scenario: No опис word, no опис

- **WHEN** the фраза is «п'ятсот гривень на суші гаманець»
- **THEN** no опис is yielded

### Requirement: «Вчора» and «позавчора» set the date

The фраза SHALL yield the day before today for «вчора» and two days before today for «позавчора»,
counted from the day the фраза is understood; «сьогодні» and a фраза naming no day SHALL yield no
date, leaving the form's own.

#### Scenario: Yesterday and the day before

- **WHEN** the фрази «вчора триста гривень» and «позавчора триста гривень» are understood on
  2026-10-01
- **THEN** the dates are 2026-09-30 and 2026-09-29

#### Scenario: Today changes nothing

- **WHEN** the фраза «сьогодні триста гривень» is understood
- **THEN** no date is yielded
