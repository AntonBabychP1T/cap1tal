# answer-queue Specification

## Purpose
The «Що потребує відповіді» screen: one place listing everything that waits for the owner's word —
a bank the app cannot hear, pending чернетки, можливі дублі, records «Без категорії» and доходи
«Без джерела» — each answered where it stands, so a month can be made clean on one screen.

## Requirements

### Requirement: The queue is a reading over stored state and stores nothing

The «Що потребує відповіді» screen SHALL be computed from the stored транзакції, чернетки, «Не
дубль» answers and monobank state each time it is shown, and SHALL keep no list, count, «seen»,
«snoozed» or position of its own. Showing it SHALL write nothing, post nothing and send no request.
An entry SHALL leave the queue only because what made it unanswered stopped being true — a
категорія or джерело was given, a чернетка was confirmed or dismissed, a дубль was answered or one
of its транзакції deleted, the bank became readable — and never because the owner looked at it.
No entry SHALL be dismissable without its answer.

#### Scenario: Categorising elsewhere empties the queue too

- **WHEN** the queue lists one витрата of 12500 minor units UAH «СІЛЬПО Київ» in «Без категорії»,
  and the owner leaves the queue and gives that витрата «Продукти» from its editing
- **THEN** the queue, opened again, no longer lists it, and nothing about the queue was stored at
  any point

#### Scenario: Looking is not answering

- **WHEN** the queue lists three доходи «Без джерела» and the owner opens and closes the queue five
  times without answering any
- **THEN** the queue still lists those three доходи, and no stored row changed

### Requirement: The queue holds six kinds of entry in one fixed order

The queue SHALL show its entries in groups, in this order, each group headed by its name and how
many entries it holds, and a group with no entry SHALL take no space:
1. the bank the app cannot hear;
2. the line leading to the most recent завершений активний місяць, when the queue is not narrowed
   to a місяць;
3. «Чернетки» — every pending чернетка;
4. «Можливі дублі» — every можливий дубль, as the observations capability defines it, that is
   stated for the current month or the month before it and holds no «Не дубль» answer, each pair
   once even when it is stated in both;
5. «Без категорії» — every stored витрата and повернення carrying «Без категорії», over all history;
6. «Без джерела» — every stored дохід carrying «Без джерела», over all history.

Within «Чернетки», «Без категорії» and «Без джерела» the newest дата SHALL stand first; within
«Можливі дублі» the order SHALL be the observations capability's. A переказ, a коригування, a
витрата or повернення in any other категорія and a дохід with any other джерело SHALL never be an
entry. WHEN nothing waits, the screen SHALL say «Нічого не чекає відповіді» in one sentence and
nothing else.

#### Scenario: Groups stand in order and empty ones are absent

- **WHEN** today is 2026-10-06, two чернетки are pending, seven витрати and one повернення carry
  «Без категорії», no дохід carries «Без джерела», no можливий дубль is stated and monobank is
  readable
- **THEN** the queue shows «Чернетки» with 2 and then «Без категорії» with 8, and no bank entry, no
  «Можливі дублі» and no «Без джерела» group

#### Scenario: A переказ and a коригування are never asked about

- **WHEN** a переказ of 500000 minor units UAH from mono black to «Резерв», a negative коригування
  of 3000 minor units UAH and a витрата of 4500 minor units UAH in «Без категорії» are stored
- **THEN** the queue lists only the витрата

#### Scenario: A повернення in «Без категорії» is a question, a дохід in «Зарплата» is not

- **WHEN** a повернення of 45000 minor units UAH «Rozetka» carries «Без категорії» and a дохід of
  5000000 minor units UAH carries «Зарплата»
- **THEN** the повернення is listed under «Без категорії» and the дохід is not listed at all

#### Scenario: A дубль of three months ago is not in the unnarrowed queue

- **WHEN** today is 2026-10-06 and the only можливий дубль is a pair of 12500 minor units UAH dated
  2026-07-03 and 2026-07-04
- **THEN** the unnarrowed queue shows no «Можливі дублі» group, and the queue narrowed to липень
  2026 shows that pair

#### Scenario: A pair across September and October is listed once

- **WHEN** today is 2026-10-06 and mono black holds a витрата of 12500 minor units UAH on
  2026-09-30 «Aroma Kava» and one of 12500 on 2026-10-01 recorded by hand without an опис
- **THEN** «Можливі дублі» holds that pair once

#### Scenario: Nothing waits

- **WHEN** no чернетка is pending, nothing carries «Без категорії» or «Без джерела», no можливий
  дубль is stated for October or September and monobank is readable
- **THEN** the screen says «Нічого не чекає відповіді» and shows no group

### Requirement: Every entry states its сума in its own currency and no group adds currencies

Each entry of «Чернетки», «Без категорії» and «Без джерела» SHALL show its дата, its рахунок, its
сума with its currency as the app writes every сума, and its опис — or the продавець its опис is
recognised as, as every transaction line does — or that it has none. A можливий дубль SHALL show
both транзакції as the observations capability states them. A group heading SHALL carry a count
of entries and no сума: a group may hold several currencies, and none SHALL ever be added together
or converted.

#### Scenario: Two currencies in one group

- **WHEN** a витрата of 12500 minor units UAH and a витрата of 1500 minor units USD both carry «Без
  категорії»
- **THEN** «Без категорії» is headed with 2, one entry shows 125,00 UAH and the other 15,00 USD, and
  no total of the two is shown anywhere

### Requirement: The bank the app cannot hear stands first and leads to monobank

WHEN Головний's service rail carries a monobank row — a linked bank without a token, or monobank
needing the owner as the monobank-sync capability defines it — the queue SHALL open with one entry
saying the same thing in the same words, and its tap SHALL open the monobank screen. It SHALL be
answered there, not in the queue, and SHALL leave the queue exactly when that row leaves Головний.
It SHALL not be counted in the number Головний's queue row names, because it is not a record.

#### Scenario: Twelve days without a token lead the queue

- **WHEN** nine рахунки are linked to monobank, no token is configured, the oldest last sync of
  them completed on 2026-09-21, today is 2026-10-05, and three витрати carry «Без категорії»
- **THEN** the queue opens with the entry saying monobank is not read without a token for 9
  рахунків since 21 вересня, then «Без категорії» with 3, and the entry's tap opens monobank

#### Scenario: A configured token clears the entry

- **WHEN** the owner enters the token on the monobank screen and returns to the queue
- **THEN** the bank entry is gone and the rest of the queue is unchanged

### Requirement: A чернетка is confirmed or dismissed in the queue

Each pending чернетка SHALL show its рахунок, its дата, the notification text and what it
proposes — a витрата of its сума, a дохід «Без джерела» of its сума, or a raw чернетка with no сума
and its original-currency reference when it carries one — and SHALL offer «Підтвердити» and
«Відхилити» in place. Confirming SHALL create exactly the транзакція the bank-notifications
capability says confirmation creates; a raw чернетка SHALL first ask for the сума under the rules
of a manual витрата. Dismissing SHALL ask for confirmation and create nothing. Either way the
чернетка SHALL leave «Чернетки» at once, and a транзакція confirmed into «Без категорії» or «Без
джерела» SHALL appear in that group at once, so the answer is never lost from sight.

#### Scenario: A confirmed витрата with no правило moves to «Без категорії»

- **WHEN** the queue lists a чернетка proposing a витрата of 25000 minor units UAH on «Приват» dated
  2026-10-04 with text «Оплата 250.00UAH. НОВИЙ ЗАКЛАД», no правило or базова категорія matches it,
  and the owner chooses «Підтвердити»
- **THEN** a витрата of 25000 minor units UAH in «Без категорії» is stored, the чернетка is gone
  from «Чернетки», and that витрата stands in «Без категорії» without the queue being left

#### Scenario: A confirmed дохід with no правило-джерело moves to «Без джерела»

- **WHEN** the queue lists a чернетка proposing a дохід of 50000 minor units UAH on «Приват» dated
  2026-10-04, no правило-джерело matches its text, and the owner chooses «Підтвердити»
- **THEN** a дохід «Без джерела» of 50000 minor units UAH is stored and stands in «Без джерела» at
  once, without the queue being left

#### Scenario: A raw чернетка asks for its сума

- **WHEN** the owner chooses «Підтвердити» on a raw чернетка holding 1000 minor units USD as its
  original-currency reference on a UAH рахунок, and supplies 415,00
- **THEN** a витрата of 41500 minor units UAH carrying 1000 minor units USD as its original-currency
  amount is stored and the чернетка is gone

#### Scenario: Dismissing asks first and stores nothing

- **WHEN** the owner chooses «Відхилити» on a чернетка proposing a дохід of 50000 minor units UAH
  and confirms
- **THEN** no транзакція is created, the чернетка is gone from the queue and never returns

### Requirement: A можливий дубль is answered in the queue as it is on an спостереження

Each можливий дубль in the queue SHALL offer «Не дубль» and «Видалити одну», behaving exactly as
the observations capability defines for an спостереження: «Не дубль» removes the pair everywhere and
offers «Скасувати» while the queue still shows it was given; «Видалити одну» asks which of the two,
naming each with its дата, сума and опис, and deletes the chosen one after a confirmation. Choosing
either транзакція of the pair SHALL open its editing. Nothing else SHALL be deleted, merged or
retyped from the queue.

#### Scenario: «Не дубль» in the queue, then undone

- **WHEN** the queue lists the pair of 12500 minor units UAH on mono black dated 2026-10-03 «Aroma
  Kava» and 2026-10-04 «кава», and the owner answers «Не дубль» and at once «Скасувати»
- **THEN** the pair is listed again under «Можливі дублі» and stated again on Головний and Місяць,
  and no answer is stored for it

#### Scenario: Either half of a pair opens its editing

- **WHEN** the owner chooses the half of 2026-10-04 «кава» of that pair in the queue
- **THEN** the editing of that витрата opens, and nothing was changed by choosing it

#### Scenario: The queue merges and retypes nothing of a pair

- **WHEN** the queue lists that pair and the owner answers neither «Не дубль» nor «Видалити одну»
  and leaves the queue
- **THEN** both витрати of 12500 minor units UAH are stored exactly as before, neither merged with
  the other nor retyped

#### Scenario: One of the two deleted from the queue

- **WHEN** the owner chooses «Видалити одну» on that pair, picks the one of 2026-10-04 and confirms
- **THEN** that витрата is deleted as its editing would delete it, the витрата of 2026-10-03 is
  unchanged, and «Можливі дублі» no longer holds the pair

### Requirement: A «Без категорії» record takes its категорія in the queue

Each entry of «Без категорії» SHALL offer the same quick категорія picker the feed's «Без
категорії» mark offers — the categories the main-screen capability defines for it, a правило's or
the шаблон's suggestion first — and storing a pick SHALL put that категорія on the same транзакція
without opening editing. An entry that is a витрата SHALL also offer «Це переказ», which opens its
editing as a переказ exactly as the feed's mark does; a повернення SHALL NOT offer it. After a pick
the offer to remember a правило SHALL follow as it does from the feed. Tapping the entry outside
its picker SHALL open its editing.

#### Scenario: One pick from the queue

- **WHEN** the queue lists a витрата of 12500 minor units UAH «СІЛЬПО 123 Київ» in «Без категорії», no
  правило matches it, and the owner picks «Продукти»
- **THEN** that витрата carries «Продукти», editing never opened, it leaves «Без категорії», and the
  offer to remember the правило "сільпо → Продукти" appears

#### Scenario: «Це переказ» leaves the queue for editing

- **WHEN** the owner chooses «Це переказ» on a витрата of 479 minor units UAH «Округлення балансу
  «Резерв»» on platinum
- **THEN** its editing opens with the type переказ, platinum as the рахунок the money left and no
  destination chosen, and returning without saving leaves it in «Без категорії»

#### Scenario: A повернення is offered категорії only

- **WHEN** the owner opens the picker of a повернення of 45000 minor units UAH in «Без категорії»
- **THEN** категорії are offered and «Це переказ» is not

### Requirement: A «Без джерела» дохід takes its джерело in the queue

Each entry of «Без джерела» SHALL offer the same quick джерело picker the main-screen capability
defines for a дохід «Без джерела», only джерела and never «Без джерела» itself, and storing a pick
SHALL put that джерело on the same дохід without opening editing. After a pick the offer to
remember a правило-джерело SHALL follow, as the categorisation-rules capability defines. A дохід
that is really a повернення or one leg of a переказ SHALL be retyped from its editing, which
tapping the entry outside its picker opens; the queue SHALL offer no retype of its own.

#### Scenario: Зарплата is given its джерело and remembered

- **WHEN** the queue lists a дохід of 5000000 minor units UAH «Зарахування зарплати» in «Без
  джерела», no правило-джерело matches it, and the owner picks «Зарплата»
- **THEN** that дохід carries «Зарплата», it leaves «Без джерела», and the offer to remember a
  правило-джерело naming the pattern "зарахування зарплати" and «Зарплата» appears

#### Scenario: A refund that arrived as a дохід is retyped from editing

- **WHEN** the owner taps the entry of a дохід «Без джерела» of 45000 minor units UAH «Скасування
  покупки Rozetka» outside its picker
- **THEN** its editing opens, where it can be retyped as a повернення, and the picker itself offered
  nothing but джерела

### Requirement: A long group shows its newest entries first and the rest on request

A group holding more than twenty entries SHALL show its newest twenty and one offer naming how many
more it holds; choosing the offer SHALL show the next twenty. An answer given in a group SHALL
remove that entry at once and SHALL keep the entries already shown, so the owner never loses their
place.

#### Scenario: 127 unsourced доходи

- **WHEN** 127 доходи carry «Без джерела»
- **THEN** «Без джерела» is headed with 127, shows the newest twenty and offers to show 107 more

#### Scenario: Answering keeps the place

- **WHEN** forty entries of «Без категорії» are shown and the owner categorises the thirty-first
- **THEN** it disappears, the heading says the count less one, and the other thirty-nine stay shown
  in their order

### Requirement: The queue narrows to one місяць

The queue SHALL be openable narrowed to one calendar місяць and SHALL let the owner narrow it to one
or take the narrowing off. While narrowed to a місяць it SHALL hold only: the чернетки dated in it;
the можливі дублі stated for it by the observations capability, whatever month that is; the витрати
and повернення «Без категорії» dated in it; the доходи «Без джерела» dated in it; and the bank
entry, which is about no місяць. The narrowing SHALL be named while in force and SHALL be an initial
value, not a lock. WHEN a narrowed queue holds nothing, it SHALL say that nothing in that місяць
waits for an answer, naming the місяць as Ukrainian grammar asks.

#### Scenario: September only

- **WHEN** September 2026 holds three витрати «Без категорії» of 45000 minor units UAH in total and
  nine доходи «Без джерела», October holds two витрати «Без категорії», and the queue is opened
  narrowed to вересень 2026
- **THEN** it shows «Без категорії» with 3 and «Без джерела» with 9, the narrowing reads «Вересень
  2026», and taking it off shows «Без категорії» with 5

#### Scenario: A clean narrowed month says so

- **WHEN** the queue is narrowed to вересень 2026 and the owner gives the last дохід «Без джерела»
  of September its джерело
- **THEN** the queue says nothing in вересні 2026 waits for an answer

### Requirement: The unnarrowed queue leads to the most recent finished month that is not clean

WHEN the queue is not narrowed and the most recent завершений активний місяць still holds a
витрата or повернення «Без категорії», a дохід «Без джерела», or a pending чернетка dated in it, the
queue SHALL show one line, after the bank entry and before every group, naming that місяць and how
many such records remain in it — «У вересні 2026 ще 12 без відповіді» — and its tap SHALL narrow
the queue to that місяць. The line SHALL be shown whether or not the виклик «Закрий <місяць>» was
accepted, dismissed or never offered, because it states a fact of the record, not the виклик. It
SHALL be absent once that місяць holds none of the three, and a можливий дубль SHALL not count
toward it, as it does not count toward a чистий місяць.

#### Scenario: September is named in October

- **WHEN** today is 2026-10-06, September 2026 holds three витрати «Без категорії», nine доходи «Без
  джерела» and no pending чернетка, and the queue is opened unnarrowed
- **THEN** it shows «У вересні 2026 ще 12 без відповіді» before its groups, and its tap narrows the
  queue to вересень 2026

#### Scenario: A dismissed виклик does not hide the fact

- **WHEN** the owner dismissed «Закрий вересень 2026» and September still holds one дохід «Без
  джерела»
- **THEN** the unnarrowed queue still shows «У вересні 2026 ще 1 без відповіді»

#### Scenario: A clean September shows no line

- **WHEN** September 2026 holds no record «Без категорії» or «Без джерела» and no чернетка dated in
  it, but a можливий дубль of 2026-09-20
- **THEN** no month line is shown, and the дубль still stands under «Можливі дублі»
