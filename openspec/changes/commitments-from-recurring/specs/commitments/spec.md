## MODIFIED Requirements

### Requirement: A зобов'язання holds what is paid, how often and from where

A зобов'язання SHALL hold: a назва, the сума of one платіж, a періодичність, the дата першого
платежу, the рахунок списання, optionally a категорія, optionally an ознака, whether its
нагадування про платіж is on, the moment it was recorded and, once stopped, its дата припинення.
The сума SHALL be integer minor units of the
currency of the рахунок списання, whatever that currency is. The періодичність SHALL be one of
«щомісяця», «щокварталу», «щопівроку» and «щороку». The ознака SHALL be kept trimmed, and an ознака
that is empty after trimming SHALL mean none. The нагадування про платіж of a зобов'язання SHALL be
off when it is recorded, until the owner turns it on. The app SHALL refuse to store a зобов'язання whose
назва is empty after trimming, whose сума is not above zero, whose періодичність is not one of the
four, whose рахунок списання does not exist or is archived when chosen, whose категорія is archived
when chosen, or whose ознака is shorter than three characters after trimming. Every refusal SHALL
be stated in Ukrainian and name the value it concerns.

#### Scenario: A complete зобов'язання is stored

- **WHEN** the owner stores «Netflix» of 29900 minor units UAH «щомісяця», first on 2026-10-15, on
  the UAH card «mono black», with the категорія «Підписки» and the ознака «  netflix »
- **THEN** the зобов'язання is stored with exactly those values and the ознака «netflix»

#### Scenario: A new зобов'язання does not remind

- **WHEN** the owner stores «Оренда» of 1500000 minor units UAH «щомісяця», first on 2026-10-10
- **THEN** its нагадування про платіж is off

#### Scenario: A зобов'язання on a USD card is in dollars

- **WHEN** the owner stores «ChatGPT» of 2000 minor units on the USD рахунок «mono USD»
- **THEN** its сума is 2000 minor units USD and nothing is converted

#### Scenario: A зобов'язання without a назва is refused

- **WHEN** the owner tries to store a зобов'язання whose назва is "   "
- **THEN** nothing is stored and the refusal says what is paid must be named

#### Scenario: A сума of zero is refused

- **WHEN** the owner tries to store a зобов'язання whose сума is 0
- **THEN** nothing is stored and the refusal says the сума must be above zero

#### Scenario: An archived рахунок or категорія is refused

- **WHEN** the owner tries to create a зобов'язання on an archived рахунок, or with an archived
  категорія
- **THEN** nothing is stored and the refusal names the archived one

#### Scenario: A two-letter ознака is refused

- **WHEN** the owner tries to store a зобов'язання whose ознака is «tv»
- **THEN** nothing is stored and the refusal says the текст в описі needs at least three characters

## ADDED Requirements

### Requirement: A regular payment no plan covers is offered as a пропозиція зобов'язання

The **description key** of a витрата SHALL be its опис trimmed, its inner runs of spaces made
one and its letters lower-cased — the folded опис; a витрата without an опис, or whose опис folds
to nothing, has none. It is not a продавець:
two описи one продавець recognises are two description keys. For the current month M, every
currency C and every description key V, the **charges** SHALL be V's largest витрата in C in each of the three calendar months immediately
before M (of equally large витрати in one month, the earlier дата, then the транзакція's id), R
their median, and the **latest charge** the charge of the month immediately before M. The app
SHALL offer a **пропозиція зобов'язання** for V in C when all of these hold:

- V has a витрата in C in each of those three months;
- each of the three charges lies within 5 % of R — the regularity the price-change спостереження
  reads, with the same band;
- none of the three charges is linked to a платіж of a зобов'язання or of a розстрочка;
- no зобов'язання that is not stopped, whose currency is C and whose рахунок списання is the latest
  charge's рахунок, would recognise the latest charge: its ознака occurs in the charge's опис,
  letters compared without regard to case, or, having no ознака, its сума equals the charge's сума;
- the latest charge's рахунок is not archived;
- the owner has not declined V in C.

A пропозиція SHALL name the latest charge the way its transaction line names it and state the
latest charge's сума in C and «щомісяця». Only витрати SHALL form one: a переказ, an інвестиція, a
повернення, a дохід and a коригування never count as a charge. Пропозиції SHALL be computed
whenever they are shown, from the stored транзакції, зобов'язання, розстрочки, рахунки and declined
пропозиції and today's дата, with no network and no randomness, and SHALL NOT be stored; the same
stored state on the same дата SHALL yield the same пропозиції. A пропозиція SHALL change no
транзакція, баланс, number of the monthly picture, «Вільно після зобов'язань», ліміт, ціль, статок
or досягнення. Пропозиції SHALL be ordered UAH first, then the other currencies by code, then by the
latest charge's сума, larger first, then by the name stated, compared by code unit. A stored
«Ні» SHALL decline only the description key it names: should the grouping ever change, an answer
naming a key no витрата has any more declines nothing, and the regular payment is asked anew.

#### Scenario: Netflix is offered

- **WHEN** today is 2026-10-06, «Netflix» was charged 29900 minor units UAH on «mono black» on
  2026-07-15, 2026-08-15 and 2026-09-15, and no зобов'язання or розстрочка covers it
- **THEN** one пропозиція is offered for «Netflix»: 29900 minor units UAH, «щомісяця»

#### Scenario: A subscription at a moving rate is still regular

- **WHEN** today is 2026-10-06 and «OpenAI ChatGPT» was charged 82000, 83500 and 81900 minor units
  UAH in July, August and September 2026
- **THEN** a пропозиція is offered for it with the сума 81900 minor units UAH, the latest charge

#### Scenario: Two months are not a regular payment

- **WHEN** today is 2026-10-06 and «Megogo» was charged 19900 minor units UAH in August and
  September 2026 and not in July
- **THEN** no пропозиція is offered for «Megogo»

#### Scenario: A large order breaks the regularity

- **WHEN** the description key «Rozetka» charged 29900 minor units UAH in July and September 2026 and, as its largest
  витрата in August, 150000
- **THEN** no пропозиція is offered for it in October

#### Scenario: A linked charge means a plan already covers it

- **WHEN** the September charge of «Інтернет», 30000 minor units UAH, is linked to a платіж of the
  зобов'язання «Інтернет»
- **THEN** no пропозиція is offered for «Інтернет»

#### Scenario: A зобов'язання whose ознака recognises the latest charge covers it

- **WHEN** an unstopped зобов'язання on «mono black» in UAH has the ознака «netflix», and the
  latest charge «NETFLIX.COM» of 34900 minor units UAH on «mono black» is not linked to it
- **THEN** no пропозиція is offered for «NETFLIX.COM»

#### Scenario: A розстрочка's debits are not offered

- **WHEN** the three charges of «Покупка частинами», 100000 minor units UAH each, are linked to
  платежі of the розстрочка «iPhone»
- **THEN** no пропозиція is offered for them

#### Scenario: A monthly переказ to a банка is not a charge

- **WHEN** on the 1st of July, August and September 2026 the owner moved 500000 minor units UAH
  from «mono black» to the банка «Резерв» as a переказ
- **THEN** no пропозиція is offered for it

#### Scenario: A monthly cashback повернення is never a charge

- **WHEN** on the 5th of July, August and September 2026 a повернення «Кешбек» of 15000 minor units
  UAH reached «mono black», and nothing else carries that опис
- **THEN** no пропозиція is offered for «Кешбек»

#### Scenario: Every currency on its own

- **WHEN** «Spotify» was charged 1099 minor units USD on «mono USD» in July, August and September
  2026, and 29900 minor units UAH on «mono black» in July and August only
- **THEN** one пропозиція is offered for «Spotify» in USD, of 1099 minor units USD, and none in UAH

#### Scenario: A monthly top-up of a банка left as a витрата is offered

- **WHEN** on the 1st of July, August and September 2026 an untyped «Поповнення банки Резерв» of
  500000 minor units UAH reached «mono black» as a витрата, never typed as a переказ
- **THEN** a пропозиція is offered for it, since until it is typed it is a витрата, and the owner
  answers «Ні» or retypes the three as перекази, after which none is offered

#### Scenario: An archived card is not offered

- **WHEN** «Netflix» was charged 29900 minor units UAH on «mono white» in July, August and September
  2026 and «mono white» has since been archived
- **THEN** no пропозиція is offered for «Netflix»

#### Scenario: Equal charges in one month take the earlier дата

- **WHEN** in September 2026 «Netflix» was charged 29900 minor units UAH on 2026-09-03 on «mono
  white» and 29900 on 2026-09-15 on «mono black», and 29900 in July and August
- **THEN** the latest charge is the one of 2026-09-03 and the пропозиція proposes «mono white»

#### Scenario: The пропозиції are ordered UAH first, then by сума

- **WHEN** пропозиції qualify for «Spotify» of 1099 minor units USD, «Netflix» of 29900 minor units
  UAH, «Megogo» of 19900 minor units UAH and «Apple» of 19900 minor units UAH
- **THEN** they are offered in the order «Netflix», «Apple», «Megogo», «Spotify»

#### Scenario: Offering changes no number

- **WHEN** the пропозиція for «Netflix» is offered on 2026-10-06
- **THEN** витрачено, залишилось and «Вільно після зобов'язань» of October 2026 are what they were
  without it, and no зобов'язання exists for «Netflix»

### Requirement: A пропозиція proposes a зобов'язання and records nothing

A пропозиція SHALL propose the values of one зобов'язання: the назва it states; the latest charge's
сума in C; «щомісяця»; the latest charge's дата as the дата першого платежу; the latest charge's
рахунок as the рахунок списання; the latest charge's категорія, unless it is «Без категорії» or
archived, in which case none; and, only when the three charges are not all of one сума, the latest
charge's опис trimmed as the ознака, when that is at least three characters long — none otherwise.
A пропозиція SHALL NOT itself store a зобов'язання, create, change or schedule any транзакція, or
link anything: a зобов'язання SHALL exist only once the owner stores it, exactly as one entered by
hand, and from then on it is linked like any other.

#### Scenario: Netflix accepted becomes a plan with its first платіж paid

- **WHEN** the пропозиція for «Netflix» — charges of 29900 minor units UAH on 2026-07-15,
  2026-08-15 and 2026-09-15 on «mono black», the latest in the категорія «Підписки» — is accepted
  and stored as proposed on 2026-10-06
- **THEN** «Netflix» is a зобов'язання of 29900 minor units UAH «щомісяця» from 2026-09-15 on «mono
  black» in «Підписки» with no ознака, its платіж of 2026-09-15 is linked to the September charge,
  its платіж of 2026-10-15 is очікується, and no транзакція was created or changed

#### Scenario: A moving сума proposes the опис as ознака

- **WHEN** the charges of «OpenAI ChatGPT» were 82000, 83500 and 81900 minor units UAH, the latest
  with the опис « OpenAI *ChatGPT »
- **THEN** the proposed ознака is «OpenAI *ChatGPT»

#### Scenario: An uncategorised charge proposes no категорія

- **WHEN** the latest charge of «Netflix» is «Без категорії»
- **THEN** the proposed зобов'язання has no категорія

#### Scenario: Nothing is stored until the owner stores it

- **WHEN** the пропозиція for «Netflix» is accepted and the owner leaves without storing
- **THEN** no зобов'язання exists, every транзакція is unchanged, and the пропозиція is still offered

### Requirement: «Ні» to a пропозиція is remembered for its description key and currency

The owner SHALL be able to decline a пропозиція with «Ні». The answer SHALL be stored for that
description key and currency with the moment it was given, and no пропозиція SHALL be offered for that
description key in that currency again, whatever its later charges. It SHALL change no транзакція and no
зобов'язання, and SHALL NOT keep the owner from recording a зобов'язання for those витрати by
hand. It SHALL be undoable from where it was given, for as long as the screen says it was given,
which removes the stored answer and offers the пропозиція again exactly as before. Declining a
description key in one currency SHALL NOT decline it in another.

#### Scenario: Declined once, never offered again

- **WHEN** the owner answers «Ні» to the пропозиція for «Сільпо» in UAH on 2026-10-06, and
  «Сільпо» keeps charging within 5 % of its usual сума through January 2027
- **THEN** no пропозиція for «Сільпо» in UAH is offered in October 2026 or any later month

#### Scenario: «Ні» given by mistake is undone

- **WHEN** the owner answers «Ні» to the пропозиція for «Netflix» and at once chooses «Скасувати»
- **THEN** the пропозиція for «Netflix» is offered again and no answer is stored for it

#### Scenario: Another currency is asked anew

- **WHEN** «Spotify» in UAH was declined and «Spotify» in USD qualifies
- **THEN** the пропозиція for «Spotify» in USD is offered

#### Scenario: A declined description key can still be recorded by hand

- **WHEN** «Сільпо» in UAH was declined and the owner records a зобов'язання «Сільпо» by hand
- **THEN** it is stored like any other

### Requirement: The app warns the day before an expected платіж of a зобов'язання whose нагадування is on

While the phone allows the app to post notifications, the app SHALL have the phone hold one local
notification at 10:00 phone time on the day before each дата on which some зобов'язання that is
not stopped and whose нагадування про платіж is on has a платіж that is очікується, for every such
дата whose 10:00 the day before is still ahead — one per дата however many платежі of such
зобов'язання fall on it, and apart from the розстрочка's warning of the same дата. The
notification's title and body SHALL be fixed texts that name no сума, no назва and no рахунок, and
tapping it SHALL open the «Зобов'язання» screen. The app SHALL re-assert what the phone holds at
every moment it re-asserts the розстрочка's warnings — every launch, the end of every background
monobank run, every restore, whenever Головний, Місяць or the «Зобов'язання» screens are opened
and linking changed something — and after every change the owner makes to a зобов'язання, its switch or a
платіж of it, so a платіж that became сплачено or пропущено is no longer warned about and a phone
carried into another time zone warns at its own 10:00. Stopping a зобов'язання SHALL keep its
switch as it was, and resuming it SHALL warn again by that switch. A зобов'язання whose нагадування is off, a
платіж of a stopped зобов'язання, or a phone that does not allow notifications SHALL make the phone
hold none for it.

#### Scenario: One warning for the day before

- **WHEN** «Оренда» has its нагадування on and a платіж of 2026-10-10 of 1500000 minor units UAH that
  is очікується, and today is 2026-10-06
- **THEN** the phone holds a notification for 2026-10-09 at 10:00 that names neither «Оренда» nor
  the сума, and tapping it opens «Зобов'язання»

#### Scenario: Off means none

- **WHEN** «Netflix» has its нагадування off and a платіж of 2026-10-15 that is очікується, and no
  other зобов'язання with its нагадування on has a платіж that day
- **THEN** the phone holds no зобов'язання notification for 2026-10-14

#### Scenario: Two зобов'язання on one day give one warning

- **WHEN** «Оренда» and «Інтернет» both have their нагадування on and a платіж of 2026-11-10 that is
  очікується
- **THEN** the phone holds exactly one зобов'язання notification for 2026-11-09 at 10:00

#### Scenario: An early debit withdraws the warning

- **WHEN** the only reminded платіж of 2026-10-10, of «Оренда», is linked to a витрата that arrived
  on 2026-10-08
- **THEN** the phone no longer holds the зобов'язання notification for 2026-10-09

#### Scenario: A skipped платіж is not warned about

- **WHEN** the owner marks the only reminded платіж of 2026-11-10 пропущено
- **THEN** the phone holds no зобов'язання notification for 2026-11-09

#### Scenario: Resuming warns again by the kept switch

- **WHEN** «Оренда», its нагадування on, is stopped on 2026-10-06 and resumed on 2026-10-07, its
  платіж of 2026-10-10 being очікується
- **THEN** its нагадування is still on and the phone holds the notification for 2026-10-09

#### Scenario: Stopping withdraws the warnings

- **WHEN** the owner stops «Оренда», whose нагадування is on, on 2026-10-06
- **THEN** the phone holds no зобов'язання notification for any платіж of «Оренда»
