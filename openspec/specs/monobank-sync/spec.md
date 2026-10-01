# monobank-sync Specification

## Purpose

The engine that turns the monobank personal API's payloads into the app's truth: parsing the
owner's monobank рахунки and банки with their bank balances, the model linking them to the
app's рахунки, statement fetching planned within the API's limits, and the deterministic
mapping of statement items to транзакції — categorised by the owner's правила, deduplicated by
the bank's own item ids. Everything here is decided by inputs alone: the same payloads, правила
and decisions always produce the same транзакції.

## Requirements

### Requirement: Client-info parsing yields the owner's monobank accounts

The system SHALL parse a client-info payload into the owner's monobank accounts — cards and
банки (jars) — each holding the monobank account id, its currency code, a human-readable name,
and the баланс банку as integer minor units of that currency. A card's name SHALL be derived
from its type and masked card number; a банка's name SHALL be its title. A card's баланс банку
SHALL be the payload's balance minus its credit limit — the credit money is the bank's, not the
owner's — and MAY therefore be negative; a банка has no credit limit and SHALL report its
balance as is. Accounts in currencies the app does not offer (anything but UAH, EUR, USD,
recognised by ISO-4217 numeric code) SHALL be left out. Parsing SHALL be total: a payload that
is not the expected shape SHALL yield the unavailable outcome, never a throw and never a
half-read list.

#### Scenario: A card's баланс банку subtracts the credit limit

- **WHEN** a client-info payload holds a UAH card with balance 500000 minor units and credit
  limit 200000 minor units
- **THEN** parsing yields that card with a баланс банку of 300000 minor units UAH

#### Scenario: A card deep in its credit limit is negative

- **WHEN** a client-info payload holds a UAH card with balance 150000 minor units and credit
  limit 200000 minor units
- **THEN** parsing yields that card with a баланс банку of −50000 minor units UAH

#### Scenario: A банка arrives with its title and balance

- **WHEN** a client-info payload holds a jar titled "На відпустку" with balance 1200000 minor
  units UAH and no credit limit field
- **THEN** parsing yields an account named "На відпустку" with a баланс банку of 1200000 minor
  units UAH

#### Scenario: A card is named by its type and masked number

- **WHEN** a client-info payload holds a card of type "black" with masked number
  "537541******1234"
- **THEN** the parsed account's name contains "black" and "1234"

#### Scenario: A currency the app does not offer is left out

- **WHEN** a client-info payload holds a UAH card and a PLN (numeric 985) card
- **THEN** parsing yields only the UAH card

#### Scenario: A hostile payload is unavailable, not a crash

- **WHEN** a client-info payload is an arbitrary JSON value that is not client-info
- **THEN** the outcome is unavailable and no accounts are yielded

### Requirement: Fetch outcomes are typed and never leak the token

Fetching client-info or a statement SHALL send the owner's token with the request and SHALL
yield exactly one typed outcome: the parsed answer, invalid-token (the API rejected the token),
rate-limited (the API asked to wait), or unavailable (offline, any other error, or an
unparseable body). No fetch SHALL throw, and no outcome SHALL contain the token.

#### Scenario: A 429 answer is rate-limited

- **WHEN** the API answers a statement request with status 429
- **THEN** the outcome is rate-limited and no items are yielded

#### Scenario: A rejected token is invalid-token

- **WHEN** the API answers client-info with status 403
- **THEN** the outcome is invalid-token

#### Scenario: A network failure is unavailable

- **WHEN** the request itself fails before any answer arrives
- **THEN** the outcome is unavailable, and nothing was thrown

#### Scenario: No outcome carries the token

- **WHEN** any fetch completes with any outcome
- **THEN** the token string appears nowhere in the outcome's data

### Requirement: Statement windows cover the span within the API's limits

Given a moment to sync from and the current moment, the system SHALL plan statement requests
whose windows each span at most the API's maximum (31 days plus one hour), together cover the
whole span, and neither overlap nor leave a gap. WHEN an answer is full (the API's maximum of
500 items), the system SHALL continue that window with requests ending at the oldest received
item's moment until an answer is short, so no item is lost to paging.

#### Scenario: A long span becomes consecutive windows

- **WHEN** requests are planned from a moment 90 days ago to now
- **THEN** every planned window spans at most 31 days plus one hour, the windows together
  cover the whole 90 days, and no two windows overlap

#### Scenario: A short span is one window

- **WHEN** requests are planned from a moment 3 days ago to now
- **THEN** exactly one window is planned, spanning those 3 days

#### Scenario: A full answer continues the window

- **WHEN** a window's answer holds exactly 500 items, the oldest at moment T
- **THEN** the window is continued with a request ending at T, and a later short answer ends
  the continuation

### Requirement: A link joins one monobank account to one рахунок of the same currency

A link SHALL join exactly one monobank account to exactly one рахунок whose currency equals the
monobank account's; a link whose currencies differ SHALL be rejected, and a link SHALL be
rejected while either side is already linked. A card SHALL suggest вид `spending` and a банка
SHALL suggest вид `savings` for a рахунок created to be linked; the suggestion SHALL NOT
overrule the owner's choice. An unlinked monobank account SHALL take no part in sync.

#### Scenario: A currency mismatch is rejected

- **WHEN** a UAH monobank card is linked to a USD рахунок
- **THEN** the link is rejected

#### Scenario: A second link on either side is rejected

- **WHEN** a monobank card already linked to a рахунок is linked to another рахунок, or a
  second monobank account is linked to an already-linked рахунок
- **THEN** the link is rejected and the existing link stands

#### Scenario: A банка suggests a savings рахунок

- **WHEN** a рахунок is proposed for an unlinked банка
- **THEN** the suggested вид is `savings`, and the owner may still pick another вид

### Requirement: Statement items map deterministically to транзакції

The system SHALL map each statement item of a linked рахунок to at most one транзакція on it,
dated the item's date, carrying the item's description as its опис:

- An item with a negative amount SHALL become a витрата of the absolute amount in the
  рахунок's currency; its category SHALL be the owner's правила applied to the item's
  description and MCC, and «Без категорії» when no правило matches. When the best matching
  правило is a правило-переказ, the item SHALL instead become a переказ from this рахунок to the
  правило's destination, carrying the absolute amount on both legs.
- An item with a positive amount SHALL become a дохід of that amount with the reserved джерело
  «Без джерела» — unless it is the зустрічний дохід of a переказ that awaits one, in which case it
  SHALL become no транзакція and that переказ SHALL await nothing. A дохід «Без джерела» is a
  starting state, never a verdict:
  an arriving повернення or cashback is retyped by the owner through витрата into повернення
  (the main-screen retype rules), because the glossary forbids a повернення to end up as
  income.
- An item on hold SHALL map exactly as a settled one — a hold is just a transaction.
- An item with a zero amount SHALL map to no транзакція.

An item that became no транзакція SHALL still count as imported, so it never imports later.

#### Scenario: A recognised merchant lands in its category

- **WHEN** the правило "сільпо → Groceries" exists and an item of amount −12550 with
  description "СІЛЬПО Київ" is mapped
- **THEN** the result is a витрата of 12550 minor units in category Groceries with опис
  "СІЛЬПО Київ"

#### Scenario: An unrecognised merchant is «Без категорії»

- **WHEN** no правило matches an item of amount −8000 with description "НОВИЙ ЗАКЛАД"
- **THEN** the result is a витрата of 8000 minor units in «Без категорії», carrying the
  description as its опис

#### Scenario: A правило-переказ makes the item a переказ

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists and an item of amount −479
  with description "Округлення балансу «Резерв»" is mapped on the UAH рахунок platinum
- **THEN** the result is a переказ of 479 minor units UAH from platinum to РЕЗЕРВ with that опис,
  and no витрата

#### Scenario: Arriving money is a дохід «Без джерела»

- **WHEN** an item of amount +5000000 with description "Зарахування зарплати" is mapped
- **THEN** the result is a дохід of 5000000 minor units with the reserved джерело
  «Без джерела» and that опис

#### Scenario: A foreign purchase is a витрата of what the bank charged

- **WHEN** a UAH card's item of amount −420000 for a purchase made abroad is mapped
- **THEN** the result is a витрата of 420000 minor units UAH, carrying no original-currency
  amount — the sync does not read the one the statement names

#### Scenario: A hold maps like anything else

- **WHEN** an item of amount −30000 marked hold is mapped
- **THEN** the result is a витрата of 30000 minor units — nothing about it says hold

#### Scenario: A zero amount maps to nothing

- **WHEN** an item of amount 0 is mapped
- **THEN** no транзакція results

### Requirement: A statement item imports at most once, forever

The system SHALL keep the set of statement item ids already imported per monobank account, and
SHALL map only items whose id is not in the set; mapping an item SHALL add its id. An id once
in the set SHALL keep the item out even after the транзакція it created was edited, retyped or
deleted — deleting a транзакція never resurrects it on the next sync.

#### Scenario: The same item does not import twice

- **WHEN** the same statement item arrives in two answers
- **THEN** exactly one транзакція results and the second arrival is skipped

#### Scenario: A deleted транзакція stays deleted

- **WHEN** an item's id is in the imported set and the транзакція it created no longer exists
- **THEN** the item is still skipped on the next sync

#### Scenario: A zero item's id is still remembered

- **WHEN** an item of amount 0 is mapped to no транзакція
- **THEN** its id joins the imported set all the same, and the item is not examined again

### Requirement: Each linked account resumes from a committed sync cursor

The system SHALL import a linked monobank account from its confirmed first-sync boundary and,
after each completely stored statement answer, resume later work from the committed cursor without
importing any remembered item twice. The cursor SHALL advance only with the транзакції and imported
item ids produced by that answer; a failed or unreadable answer SHALL leave the cursor, the
транзакції, the imported ids and the paging position below unchanged and retryable.

A window whose answer came back full is asked again, narrowed to the oldest item it returned, and
so on until an answer comes back short. That narrowing walks **backwards** through the window, so
the cursor — which means «everything before this is imported» — cannot move while it is going on.
The position that narrowing has reached SHALL therefore be remembered beside the cursor and SHALL
survive the run: a run that stops in the middle of a window SHALL leave the next run able to
continue from the page it stopped at, and the next run SHALL continue from there rather than
asking the window's first page again.

WHEN a window finally answers short, the cursor SHALL move to the end of **the window that was
being paged** — the end remembered when the paging began — and the position SHALL be forgotten.
Not to the end of the run that finished it: a later run plans a window that reaches its own later
end, and moving the cursor there would step over the slice between the two, which no request ever
read. The remainder is a window of its own and is planned as one.

A remembered position SHALL be trusted only while it still describes work left to do: WHEN the
window end it names is not after the cursor — which a boundary the owner moved, or a бекап
restored over this phone's progress, can leave behind — the position SHALL be discarded and the
window planned afresh from the cursor.

Without this, an account whose window needs more pages than a single run can spend requests on can
never complete, however many runs are given to it: every run re-reads the pages the run before it
read, stops in the same place, and leaves the cursor where it was. Its транзакції do arrive — every
page commits its own — but its last-sync moment never moves and the screen says «Ще не
синхронізовано» for ever.

#### Scenario: A later sync resumes after committed work

- **WHEN** a linked account completes a statement answer through moment T and a later sync starts
- **THEN** the later sync resumes from T, and any boundary item seen again is skipped by its
  monobank item id

#### Scenario: A failed commit advances nothing

- **WHEN** storing one транзакція from a statement answer fails
- **THEN** none of that answer's транзакції or imported ids are stored, its cursor does not
  advance, and the same answer can be retried

#### Scenario: An API failure leaves the cursor retryable

- **WHEN** a linked account is rate-limited or unavailable while fetching its next statement
  answer
- **THEN** its cursor and imported ids remain unchanged and that account can resume from the same
  place later

#### Scenario: Paging stopped in the middle of a window continues in the next run

- **WHEN** a рахунок's window answers full twice and the run stops before the third request
- **THEN** the two answers' транзакції are stored, the cursor has not moved, and the next run's
  first request about that рахунок asks the window narrowed to where the second answer left it —
  not the window's first page

#### Scenario: An account larger than one run finishes over several runs

- **WHEN** a рахунок's window needs four pages and no run affords more than two requests for it
- **THEN** successive runs work through the pages instead of repeating the first two, and once the
  last page answers short the рахунок completes and its last-sync moment moves

#### Scenario: The cursor moves to the paged window's end, not the run's

- **WHEN** a window paged over two runs answers short in the second, whose own end is later than
  the first run's
- **THEN** the cursor moves to the end of the window that was being paged, and the span between
  that end and the later run's end is asked for as a window of its own

#### Scenario: A failure over a half-paged window keeps the position

- **WHEN** a рахунок is rate-limited or unavailable on the third page of a window
- **THEN** its cursor, транзакції, imported ids and remembered position are all unchanged, so the
  next run resumes that window at the third page rather than at the first

#### Scenario: A position that no longer describes work left is discarded

- **WHEN** a рахунок carries a remembered window whose end is not after its cursor
- **THEN** the position is discarded and the window is planned from the cursor as if none had been
  remembered

#### Scenario: A finished window leaves no position

- **WHEN** a window answers short on its first request
- **THEN** the cursor moves to that window's end, nothing is remembered about paging, and the next
  run plans from the cursor as it always has

### Requirement: Sync preserves the transaction distinctions until the owner retypes them

Sync SHALL apply the existing item mapping without inferring relationships between separate
statement rows on its own: money leaving starts as a витрата, money arriving starts as a дохід «Без
джерела», and sync SHALL NOT invent a переказ, інвестиція, повернення, коригування, комісія or дохід
«Відсотки» from a рахунок-борг without the owner's explicit action defined by those capabilities. A
правило-переказ the owner stored, and a переказ the owner retyped, are such explicit action: the
переказ they produce, and the зустрічний дохід it absorbs, are the owner's decision applied, not an
inference of sync's own.

#### Scenario: Two own-account legs are not paired automatically

- **WHEN** no правило-переказ matches, and a card-to-банка movement arrives as a negative card item
  and a positive банка item
- **THEN** sync stores a витрата and a дохід «Без джерела», and neither is called a переказ or
  інвестиція until the owner retypes it

#### Scenario: A правило-переказ pairs the two legs

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists, and a rounding arrives as an
  item of −20 on platinum and an item of +20 on РЕЗЕРВ of the same date
- **THEN** exactly one транзакція is stored for it — a переказ of 20 minor units UAH from platinum to
  РЕЗЕРВ — whichever of the two рахунки is synced first

#### Scenario: Cashback is not silently finalised as income

- **WHEN** a positive cashback item arrives
- **THEN** it is imported as a дохід «Без джерела» that the owner can retype to a повернення, and
  sync does not choose a final джерело for it

#### Scenario: Lending and interest are not inferred

- **WHEN** incoming money could be repayment of a debt account with interest
- **THEN** sync imports the one item as a дохід «Без джерела» and does not invent a переказ of
  principal or a separate дохід «Відсотки»

### Requirement: A statement answer pairs a переказ with its зустрічний дохід in one commit

Pairing SHALL be part of committing one statement answer, whole or not at all, together with that
answer's транзакції, imported item ids, баланс банку and cursor:

- a переказ a правило-переказ made from an outgoing item SHALL absorb its зустрічний дохід if one is
  already stored, and SHALL await one otherwise;
- an incoming item that is the зустрічний дохід of a stored переказ awaiting one SHALL store no
  дохід and SHALL make that переказ await nothing.

An answer that fails to commit SHALL leave every переказ awaiting exactly what it awaited before and
every дохід exactly where it was.

#### Scenario: The card is synced before рахунок РЕЗЕРВ

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists, platinum's answer holding an
  item of −978 dated 2026-09-14 commits while nothing is stored on РЕЗЕРВ, and later РЕЗЕРВ's answer
  holding an item of +978 dated 2026-09-14 commits
- **THEN** after the first commit a переказ of 978 minor units UAH awaits its зустрічний дохід, and
  after the second no дохід of 978 is stored on РЕЗЕРВ and the переказ awaits nothing

#### Scenario: Рахунок РЕЗЕРВ is synced before the card

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists, РЕЗЕРВ's answer holding an
  item of +978 dated 2026-09-14 commits first, and platinum's answer holding an item of −978 dated
  2026-09-14 commits later
- **THEN** after the first commit a дохід «Без джерела» of 978 is stored on РЕЗЕРВ, and after the
  second that дохід is gone and one переказ of 978 minor units UAH awaits nothing

#### Scenario: An incoming item with no awaiting переказ stays a дохід

- **WHEN** an item of +978 dated 2026-09-14 on РЕЗЕРВ is committed and no переказ onto РЕЗЕРВ awaits a
  зустрічний дохід of that сума within one day
- **THEN** a дохід «Без джерела» of 978 minor units UAH is stored

#### Scenario: A failed commit pairs nothing

- **WHEN** committing РЕЗЕРВ's answer holding the зустрічний дохід of an awaiting переказ fails
- **THEN** the переказ still awaits, no дохід from that answer is stored, and the item is not
  remembered as imported

### Requirement: The latest bank balance is committed in the account's currency

For every client-info answer used by sync, the system SHALL keep the latest баланс банку of each
linked account in integer minor units of that account's currency, without changing its
розрахунковий баланс and without converting either amount.

#### Scenario: Refreshing the bank balance changes no transaction

- **WHEN** a linked USD card's new client-info answer reports a баланс банку of 12345 minor units
  USD
- **THEN** 12345 minor units USD becomes its latest баланс банку and no транзакція or
  розрахунковий баланс changes until the owner chooses «Звірити»

### Requirement: A statement payload is read whole or not at all

The system SHALL parse a statement payload into items, each holding the bank's item id, the
moment the bank carried the item out, the calendar date of that moment in the device's timezone, the
description, the MCC, the signed amount as integer minor units of the account's currency, and the
hold flag. A payload holding any row the parser cannot read SHALL yield the unavailable outcome
and no items — a window is imported whole or not at all, so no транзакція is ever silently
dropped.

The currency a row names SHALL NOT be read as a claim about the рахунок, and SHALL NOT make the
row unreadable — neither when it is a currency a рахунок may be opened in, nor when it is one the
app does not offer, nor when the row names none at all. What identifies the рахунок a statement
belongs to is the account the request named, never a field inside the answer. The amount SHALL be
read as minor units of the рахунок's currency whatever the row names, that being the currency the
bank states the amount in and the сума it charged.

An item SHALL carry no original-currency amount. The statement does name that сума and the
currency it is in, so this is a deferral and not a refusal: what the bank charged the рахунок is
the one сума kept until reading the other one is built.

#### Scenario: A statement item parses whole

- **WHEN** a statement payload holds an item with id "a1", time in the device's August 26th,
  description "СІЛЬПО", MCC 5411, amount −12550 and hold false
- **THEN** parsing yields one item with id "a1", date 2026-08-26, description "СІЛЬПО",
  MCC 5411, amount −12550 minor units and hold false

#### Scenario: A foreign purchase is the сума the bank charged, and nothing more

- **WHEN** a UAH account's statement item holds amount −420000 with an operation amount of −10000
  and names USD as the currency that second сума is in
- **THEN** the parsed item holds amount −420000 minor units UAH and no original-currency amount

#### Scenario: A row naming another currency does not fail the window

- **WHEN** a statement being parsed for a UAH рахунок holds two rows naming UAH and one row naming
  USD, every row otherwise well-formed
- **THEN** parsing yields all three items, each with its amount in minor units UAH

#### Scenario: A row naming a currency the app does not offer still parses

- **WHEN** a row of a statement being parsed for a UAH рахунок names a currency no рахунок can be
  opened in
- **THEN** parsing yields that item too, with its amount in minor units UAH

#### Scenario: A row naming no currency at all still parses

- **WHEN** a row of a statement being parsed for a UAH рахунок carries no currency field, or one
  that is not a number, every other field well-formed
- **THEN** parsing yields that item too, with its amount in minor units UAH

#### Scenario: A hryvnia row on a foreign-currency рахунок parses

- **WHEN** a statement being parsed for a USD рахунок holds a row naming UAH, otherwise well-formed
- **THEN** parsing yields that item with its amount in minor units USD

#### Scenario: One unreadable row fails the whole answer

- **WHEN** a statement payload holds two well-formed items and one item without an id
- **THEN** the outcome is unavailable and no items are yielded

### Requirement: A sync also runs on the chances the phone gives while the app is not in front of the owner

The system SHALL ask the phone for chances to run in the background while monobank has at least
one linked рахунок, and SHALL stop asking when none is linked. On every chance the phone gives,
the system SHALL start a **background run** — the same sync an opening starts, under the same
rules: the quiet interval (and what makes a run due inside it), the one-request-a-minute pace held
across runs, the order of turns, the one-run lock and the remembered attempt — so a chance that is
not due, or that comes while a run is going on, sends nothing. The token SHALL reach the bank
exactly as it does in front of the owner: read for the run and kept nowhere else.

Periodic chances SHALL be asked for no oftener than about every fifteen minutes. Beside them the
system SHALL ask for one-off chances only as a дочитування — after a прогін that left a позачерговий
or overdue рахунок unread, or after a поштовх — never more than one pending at a time. WHEN the phone gives
either is the phone's decision: the system SHALL claim no cadence, and the runs an opening, a pull or
the owner start SHALL remain exactly as they are, so a phone that gives no chance syncs as it does
today.

#### Scenario: A background run after the quiet interval syncs without the app being opened

- **WHEN** monobank is configured, a рахунок is linked, the last attempt was twenty minutes ago,
  and the phone gives a chance to run
- **THEN** a background run starts, the транзакції it imports are stored, and the moments it moved
  are what the app shows when it is next opened

#### Scenario: A chance inside the quiet interval sends nothing

- **WHEN** the last attempt was five minutes ago and complete, no рахунок is позачерговий or
  overdue, no поштовх came since, and the phone gives a chance to run
- **THEN** no request is sent and the remembered attempt is unchanged

#### Scenario: A chance while a run is going on starts no second one

- **WHEN** a run is going on and the phone gives a chance to run
- **THEN** no second run starts and nothing is changed

#### Scenario: A chance with nothing linked sends nothing and leaves no attempt

- **WHEN** no рахунок is linked and the phone gives a chance to run
- **THEN** no request is sent and no attempt is left recorded

#### Scenario: A chance without a token sends nothing and leaves no attempt

- **WHEN** a рахунок is linked, monobank is not configured, and the phone gives a chance to run
- **THEN** no request is sent and no attempt is left recorded

#### Scenario: Unreadable token storage on a chance sends nothing and leaves no attempt

- **WHEN** a рахунок is linked, the token storage cannot be read, and the phone gives a chance to
  run
- **THEN** no request is sent, no attempt is left recorded, and the next chance tries again

#### Scenario: Chances are wanted exactly while a рахунок is linked

- **WHEN** the owner links the first рахунок, later unlinks the last one, and later links one
  again
- **THEN** the phone is asked for chances and поштовхи are wanted after the first link, neither
  after the last unlink, and both again after the relink

### Requirement: A run in front of the owner yields when the app leaves the foreground

A run started while the app is in front of the owner — on opening, on the pull, or on the monobank
screen — SHALL yield when the app leaves the foreground: it SHALL stop before its next request, and
the рахунки it had not finished SHALL end postponed in exactly the two shapes перенесено takes.
The wait before a request SHALL end at once when the app leaves the foreground, so the run does not
hold the one-run lock until the app is next opened. A request already sent SHALL be answered and
its answer stored whole.

The phone answers «in front» or «away» and nothing finer, and the app takes that answer at its
word: it cannot tell the owner leaving from a dialog drawn over the app, and it SHALL NOT guess.
What it may do is not waste a whole run on the answer. A run SHALL NOT yield before it has sent its
first request: a phone that reports «away» at the instant a run starts — a cold start whose window
is not resumed yet, a run begun as the owner glances elsewhere — then costs that run one request
rather than the whole of it, and what the run learns from that request is kept.

That rule reaches as far as the pace allows and no further. A run that is not in front of the owner
and that starts already owing the bank the minute between requests — because this device sent one
inside it — SHALL stop having sent nothing, and its рахунки SHALL end postponed. Such a run has
nothing it may send: the wait it owes is the pace's, not the foreground's; the app is not in front
for a timer to run it out; and a request sent regardless would be refused by the bank rather than
answered. Nothing is lost by it — the request it did not spend is the one whichever run went before
it just spent — and the next run continues from the same cursors. A run that owes the same minute
while the app *is* in front simply waits it out and carries on, as it always has.

This rule is the foreground run's alone. A фоновий прогін answers the same question from the pace
alone — it never waits, so it has no wait for a foreground to cut short — and is unaffected by any
of these sentences.

A run the owner stopped themselves SHALL still end cancelled, not postponed: postponed is a run
that stopped for want of time or of foreground, cancelled is the owner's decision, and the two
SHALL be told apart wherever an outcome is reported. Neither a run that yielded nor a run the owner
stopped SHALL raise a сповіщення про збій: a run that stopped is not a run that failed.

#### Scenario: Leaving the app stops the run at its next request

- **WHEN** a run over three linked рахунки has completed one and the app leaves the foreground
  during the wait before the second's request
- **THEN** the wait ends at once, no further request is sent, and the two remaining рахунки end
  postponed with no request sent about them

#### Scenario: An answer in flight is kept

- **WHEN** the app leaves the foreground while a statement answer is being awaited
- **THEN** that answer is stored when it arrives, and the run stops before the next request

#### Scenario: A run that has sent nothing does not yield

- **WHEN** a run in front of the owner starts while the phone already answers «away», and no
  request has been sent
- **THEN** the run sends its first request and keeps what it answers; only from the second request
  on does «away» stop it

#### Scenario: A run that owes the bank a minute sends nothing while the app is away

- **WHEN** a run starts while the phone answers «away» and this device sent a request less than
  the minute between requests ago
- **THEN** no request is sent, every рахунок ends postponed, and nothing is reported as a failure —
  the run had nothing it could spend without being refused

#### Scenario: The owner's stop still reads as cancelled

- **WHEN** the owner stops a run on the monobank screen while it waits before a request
- **THEN** the unfinished рахунки end cancelled, and none of them reads as postponed

#### Scenario: A run that yielded raises no сповіщення про збій

- **WHEN** a run the owner started on the monobank screen yields because the app left the
  foreground, with one рахунок complete and two postponed
- **THEN** no сповіщення про збій is raised

#### Scenario: A run the owner stopped raises no сповіщення про збій

- **WHEN** the owner stops a run on the monobank screen and the app is not in front of them when
  it ends
- **THEN** no сповіщення про збій is raised

### Requirement: A postponed run does not spend the quiet interval

WHEN the last attempt is remembered as postponed, a sync the owner did not ask for SHALL be allowed
to start at once — on opening, on returning to the foreground, on a chance the phone gives and on a
дочитування — because that run stopped for want of time or of foreground, not for want of need, and
the requests it did not spend are still owed. A chance the phone gives and a дочитування SHALL
also start at once WHEN a рахунок the token shows is позачерговий without a turn since, or overdue:
the bank holds something the phone has not read, whatever the last attempt came to. An opening and a
return to the foreground keep the тихий інтервал for that case, as today.

WHEN a run ends postponed while the app is in front of the owner, the system SHALL start a run in
front of the owner at once, so a run the background began finishes in front of the owner instead of
waiting for the next chance. That follow-up SHALL be decided from the outcome of the run that just
ended and from nothing else: a run that ended any other way — complete, failed, cancelled, or one
that never reached the bank and left no attempt — SHALL be followed by nothing in front of the
owner. A run that ends while the app is not in front of the owner SHALL start nothing in the app; it
SHALL be continued by a дочитування exactly when that requirement asks for one, and otherwise by the
next chance or opening. A run that ends any other way SHALL hold the quiet interval as it does today.

#### Scenario: Opening after a postponed run syncs at once

- **WHEN** the last attempt was two minutes ago and is remembered as postponed, and the app is
  opened
- **THEN** a run starts

#### Scenario: A completed run still holds the interval

- **WHEN** the last attempt was two minutes ago and is remembered as complete, no рахунок is
  позачерговий or overdue, and the app is opened
- **THEN** no run starts and no request is sent

#### Scenario: A failure in the middle of a chain does not end it

- **WHEN** a дочитування's прогін reads one позачерговий рахунок, whose statement is answered
  `unavailable`, and two позачергові рахунки without a turn are left
- **THEN** the attempt is remembered as unavailable, and the next дочитування still runs rather than
  ending not due

#### Scenario: A run the background began finishes in front of the owner

- **WHEN** a background run ends postponed while the app is in front of the owner
- **THEN** a run in front of the owner starts at once, which waits out the gap it owes rather than
  stopping at it

#### Scenario: The follow-up is not a loop

- **WHEN** that follow-up run ends complete
- **THEN** no further run starts in front of the owner until the quiet interval has passed

#### Scenario: A run that never reached the bank is not followed up

- **WHEN** a рахунок is linked, no токен is configured, the app is in front of the owner, and a
  run starts and ends without reaching the bank
- **THEN** no attempt is left recorded and no second run starts

#### Scenario: A run that yields in the background starts nothing in the app

- **WHEN** a run ends postponed while the app is not in front of the owner, with no рахунок left
  позачерговий without its turn or overdue
- **THEN** nothing runs until the app is next opened or the phone next gives a chance

### Requirement: A postponed рахунок ranks between cancelled and complete when a run is remembered

The outcome a run is remembered by SHALL rank postponed after cancelled and before complete: a run
in which every рахунок reached completed and the rest were postponed SHALL be remembered as
postponed, and a run with a failure anywhere in it SHALL be remembered by that failure, as the
order already ranks them. An attempt remembered as postponed SHALL never need the owner, however
old the data is, for the reason a cancelled one does not: the run stopped for want of time, not
because the bank or the token failed, and the next run continues it.

#### Scenario: A postponed рахунок outranks a completed one

- **WHEN** a run ends with one рахунок complete and two postponed
- **THEN** the attempt is remembered as postponed

#### Scenario: A failure outranks a postponed рахунок

- **WHEN** a run ends with one рахунок unavailable and two postponed
- **THEN** the attempt is remembered as unavailable

#### Scenario: A cancelled рахунок outranks a postponed one

- **WHEN** a run ends with one рахунок cancelled and one postponed
- **THEN** the attempt is remembered as cancelled

#### Scenario: A postponed attempt needs nobody

- **WHEN** the last attempt is remembered as postponed and no linked рахунок has completed a sync
  for 30 hours
- **THEN** monobank does not need the owner

### Requirement: A background run announces a failure only when monobank needs the owner

A background run SHALL raise a сповіщення про збій for the monobank sync only when, once it has
ended, monobank needs the owner as this capability decides — the token was rejected, or the runs
are failing and the picture is stale: the oldest completed sync among the linked рахунки is older
than a day, or some linked рахунок has never completed one. It SHALL raise nothing for a run that ended postponed,
nothing for one that failed over fresh data, and nothing while the app is in front of the owner —
«Потребує уваги» on Головний says it there. It SHALL clear a standing сповіщення про збій for the
monobank sync when it completes. A background run that finds that сповіщення already standing SHALL
neither raise nor record anything more: one failure is one сповіщення and one record, however
many runs end the same way. A background run SHALL show no dialog and SHALL write no text the
owner never saw: what it did is visible where every run's work is, in the транзакції it stored and
the moments it moved.

#### Scenario: A rejected token in the background is announced once

- **WHEN** a background run ends invalid-token while no сповіщення про збій for the monobank sync is
  standing, and the next background run ends the same way
- **THEN** exactly one сповіщення про збій for the monobank sync is raised, leading to «monobank»,
  and the second run leaves no record of a second one

#### Scenario: A phone offline for one run stays silent

- **WHEN** a background run ends unavailable while every linked рахунок completed a sync two hours
  ago
- **THEN** no сповіщення про збій is raised

#### Scenario: A day without a sync is announced

- **WHEN** a background run ends unavailable while the oldest completed sync among the linked
  рахунки is 30 hours old
- **THEN** one сповіщення про збій for the monobank sync is raised

#### Scenario: A bank never wholly heard from is stale

- **WHEN** a background run ends unavailable while two of five linked рахунки have never completed
  a sync
- **THEN** one сповіщення про збій for the monobank sync is raised

#### Scenario: A postponed run announces nothing

- **WHEN** a background run ends postponed, whatever the age of the data
- **THEN** no сповіщення про збій is raised

#### Scenario: A failure the owner is already looking at is announced nowhere but on the screen

- **WHEN** a background run ends invalid-token and the owner has the app in front of them when it
  ends
- **THEN** no сповіщення про збій is raised, and «Потребує уваги» on Головний carries the row

#### Scenario: A completed run clears what an earlier one raised

- **WHEN** a сповіщення про збій for the monobank sync is standing and a background run completes
- **THEN** that сповіщення is cleared

### Requirement: A request that does not answer within the timeout ends unavailable and the run goes on

Every request a run sends to the personal API SHALL be given up after a timeout of thirty seconds
without an answer, and a request given up SHALL end that рахунок unavailable exactly as a request
that failed at once does — nothing stored, the cursor and imported ids untouched, the turn taken,
and the run going on to its next рахунок. No run SHALL wait on the bank indefinitely: a request
the bank never answers must not hold the one-run lock until the app is closed, because every later
start — every background run included — waits on that lock.

#### Scenario: A request the bank never answers ends unavailable

- **WHEN** a statement request receives no answer for longer than the timeout
- **THEN** that рахунок ends unavailable with its cursor and imported ids unchanged, and the run
  goes on to the next рахунок

#### Scenario: A request that answers in time is unaffected

- **WHEN** a statement request answers within the timeout
- **THEN** its answer is stored exactly as before, and nothing about the timeout is visible

### Requirement: A sync starts without the owner asking, no oftener than the quiet interval

The system SHALL be able to start a sync that the owner did not ask for, on the app being opened
and on it returning to the foreground. Such a run SHALL start only while monobank is configured
and at least one рахунок is linked, and only when the moment of the last attempt is older than the
quiet interval of 15 minutes; otherwise nothing starts and no request goes out at all. A run the
owner asked for SHALL start whatever the last attempt was — the interval governs only the runs
they did not ask for.

Every run that reaches monobank SHALL record the moment it was attempted, whether it completed or
failed, so a device that cannot reach the bank spends one attempt per interval and not one per
opening. A run that could not reach it at all — no token kept, no link, or the token storage
itself unreadable — SHALL leave no attempt behind, whether or not one was provisionally recorded
before the run knew: nothing was tried, so the next opening tries at once.

#### Scenario: The first opening on a linked device syncs

- **WHEN** monobank is configured, one рахунок is linked, no attempt has ever been recorded, and
  the app is opened
- **THEN** a sync starts

#### Scenario: Reopening inside the interval sends nothing

- **WHEN** an attempt was recorded two minutes ago and the app is opened again
- **THEN** no run starts and no request is sent to monobank

#### Scenario: Returning after hours syncs

- **WHEN** an attempt was recorded three hours ago and the app returns to the foreground
- **THEN** a sync starts

#### Scenario: A run the owner asked for ignores the interval

- **WHEN** an attempt was recorded one minute ago and the owner asks for a sync
- **THEN** the run starts all the same

#### Scenario: Without a token nothing is attempted

- **WHEN** monobank is not configured and the app is opened
- **THEN** no request is sent and no attempt is left recorded

#### Scenario: With nothing linked nothing is attempted

- **WHEN** monobank is configured, no рахунок is linked and the app is opened
- **THEN** no request is sent and no attempt is left recorded

#### Scenario: Unreadable token storage is not an attempt either

- **WHEN** the token storage cannot be read and the app is opened
- **THEN** no request is sent, no attempt is left recorded, and the next opening tries again at
  once

#### Scenario: A failed run still spends its interval

- **WHEN** a run that started on opening reaches monobank and ends without an answer, and the app
  is opened again one minute later
- **THEN** the failed run's moment was recorded and no second run starts

### Requirement: At most one sync run exists at a time

While a sync is going on the system SHALL NOT start another, whoever asks: an opening, a return to
the foreground, the owner asking on Головний and the owner asking on the monobank screen SHALL
each be refused while a run is in flight. A refused start SHALL change nothing — no cursor, no
attempt, no imported item — and SHALL report that a run is already going on rather than failing.
When the run ends, however it ended, the next start SHALL be allowed again.

Whether a run is going on SHALL be observable while it is going on, not only once it has ended: a
screen opened during a run SHALL be able to say so, and SHALL be told both when a run begins and
when it ends.

#### Scenario: A second trigger during a run starts nothing

- **WHEN** a run started on opening is still going on and the app returns to the foreground
- **THEN** no second run starts and the first one continues untouched

#### Scenario: The owner asking during a run is told, not queued

- **WHEN** a run is going on and the owner asks for a sync
- **THEN** no second run starts, nothing is changed, and the answer is that a run is already going
  on

#### Scenario: A run beginning is announced, not only its end

- **WHEN** a run starts while a screen is already open
- **THEN** that screen is told a run began, and told again when it ends

#### Scenario: After a run ends the next one may start

- **WHEN** a run ends — completed, failed or cancelled — and a start is asked for afterwards
- **THEN** that start is allowed

### Requirement: A run is remembered by its moment and by the outcome that most needs the owner

The system SHALL remember one attempt — the latest — as the moment it was made together with the
single outcome among that run's accounts that most needs the owner, in the order invalid-token,
then rate-limited, then unavailable, then cancelled, then complete. A run in which every account
completed SHALL be remembered as complete. The ordering SHALL cover every outcome an account can
end with, so no run is left without a remembered outcome.

The moment SHALL be recorded when the run starts and the outcome when it ends, so a run the phone
did not survive — the app killed, the device restarted — still spends its interval rather than
letting the next opening send a request straight away. Until a run reports, its attempt SHALL
carry no outcome at all, which is a different answer from any of the five.

The remembered attempt SHALL NOT stand in for the moments a completed sync sets per linked account:
those are the monobank-sync-screen capability's and move only for an account that completed, while
the attempt moves for every run that reached the bank.

#### Scenario: The worst outcome is the one remembered

- **WHEN** a run ends with one account complete and one account invalid-token
- **THEN** the attempt is remembered as invalid-token

#### Scenario: A rate limit outranks an unavailable account

- **WHEN** a run ends with one account rate-limited and one account unavailable
- **THEN** the attempt is remembered as rate-limited

#### Scenario: A stopped account outranks a completed one

- **WHEN** a run ends with one account complete and one account cancelled because the owner
  stopped it
- **THEN** the attempt is remembered as cancelled

#### Scenario: A whole run that worked is remembered as complete

- **WHEN** a run ends with every account complete
- **THEN** the attempt is remembered as complete

#### Scenario: A run the app did not survive still holds its moment

- **WHEN** a run starts and the app is killed before it reports anything
- **THEN** the attempt holds the moment that run started and carries no outcome

### Requirement: monobank needs the owner only when there is something for them to do

From the remembered attempt and the moments the linked рахунки last completed a sync, the system
SHALL decide whether monobank needs the owner and, when it does, which of two situations it is:
the token was rejected, or the data has not been refreshed. Putting either into words is the
main-screen capability's; what is decided here is whether there is anything to say.

It SHALL need them at once when the last attempt was remembered as invalid-token — no run can
succeed until they supply another token. For an attempt remembered as rate-limited or unavailable
it SHALL need them only once no linked рахунок has completed a sync within the last 24 hours: a
request that failed while the phone was underground is not something to put in front of anyone.

An attempt remembered as complete SHALL never need the owner. An attempt remembered as cancelled
SHALL never need the owner either, however old the data is: the run stopped because they stopped
it, and calling their own decision a problem would blame the bank for it. WHEN no attempt is
remembered at all — nothing has been tried on this device yet — monobank SHALL NOT need the owner,
and neither SHALL an attempt that carries no outcome, a run going on now or one the phone did not
survive: nothing is known about it to put in front of them.

#### Scenario: A rejected token needs the owner at once

- **WHEN** the last attempt was remembered as invalid-token and a рахунок completed a sync ten
  minutes ago
- **THEN** monobank needs the owner, and the situation is that the token was rejected

#### Scenario: A single unreachable attempt over fresh data needs nobody

- **WHEN** the last attempt was remembered as unavailable and a linked рахунок completed a sync
  two hours ago
- **THEN** monobank does not need the owner

#### Scenario: Failing over stale data needs the owner

- **WHEN** the last attempt was remembered as unavailable and no linked рахунок has completed a
  sync for 30 hours
- **THEN** monobank needs the owner, and the situation is that the data has not been refreshed

#### Scenario: A run the owner stopped is not a failure

- **WHEN** the last attempt was remembered as cancelled and no linked рахунок has completed a sync
  for 30 hours
- **THEN** monobank does not need the owner

#### Scenario: A run that worked needs nobody

- **WHEN** the last attempt was remembered as complete
- **THEN** monobank does not need the owner

#### Scenario: A device that has tried nothing yet needs nobody

- **WHEN** monobank is configured, a рахунок is linked and no attempt is remembered
- **THEN** monobank does not need the owner

#### Scenario: An attempt with no outcome needs nobody

- **WHEN** the remembered attempt carries a moment and no outcome, and no linked рахунок has
  completed a sync for 30 hours
- **THEN** monobank does not need the owner

### Requirement: A run gives each linked account a turn, longest-waiting first

A sync run SHALL work through the linked рахунки in three groups: first every **позачерговий**
рахунок that has not had a turn since it became позачерговий; then every **overdue** рахунок — one
whose last turn was three hours ago or more, or that has never had one; then every other linked
рахунок. Within each group the order SHALL be how long each рахунок has waited for a turn: every
рахунок that has never had one before every рахунок that has, then by the moment of its last turn,
oldest first. Two рахунки that have waited exactly as long SHALL be ordered by their monobank
account identifier, so a run is reproducible.

A **turn** is a run sending the bank a request about that рахунок — taken whether the рахунок went
on to complete, to fail, or to be stopped, and not taken at all when the run spends no request on
it. The moment of a рахунок's last turn SHALL be remembered on the device and SHALL survive the run
that took it.

The order SHALL be decided once per run, after the run has the client-info answer it works from —
so a рахунок that answer shows to have moved is already позачерговий — and SHALL NOT change while
that run is going on: a рахунок this run gives a turn to does not move to the back of this run's own
queue.

Priority ends at the turn. A позачерговий рахунок that has had a turn since it became позачерговий
and is still позачерговий — its statement failed, or it needs more pages than that turn read — waits
in the later groups like any other, and an overdue рахунок is not overdue again until three hours
after its turn. That is what keeps a рахунок that cannot complete from spending every run's requests
while the rest starve, and the overdue group is what bounds how long a рахунок that is never
позачерговий can be passed over while busier рахунки take every chance: once three hours have passed
since its turn, it goes before every рахунок that is merely waiting.

#### Scenario: A позачерговий рахунок goes before one that has waited longer

- **WHEN** a run begins with one linked рахунок whose last turn was two hours ago and one that
  became позачерговий ten minutes ago and has had no turn since, its last turn an hour ago
- **THEN** the позачерговий рахунок is the first the run asks the bank about

#### Scenario: A рахунок the balances show moved goes first in the run that saw it

- **WHEN** a run fetches client-info and the answer shows one рахунок's баланс банку differs from the
  one stored, while that рахунок had its turn a minute ago and two others waited longer
- **THEN** that рахунок is the first the run sends a statement request about

#### Scenario: A рахунок the busy ones keep passing over is reached within three hours

- **WHEN** the black card moves before every chance, so it is позачерговий in each, and a white card
  that never moves had its last turn three hours ago
- **THEN** the white card is overdue and goes before every рахунок that is merely waiting, second
  only to the позачерговий black card

#### Scenario: An account that has never had a turn goes first among those not позачергові

- **WHEN** a run begins with one linked рахунок that had a turn an hour ago and one that has never
  had one, neither позачерговий
- **THEN** the рахунок that has never had a turn is the first the run asks the bank about

#### Scenario: The longest-waiting account goes first

- **WHEN** a run begins with three linked рахунки, none позачерговий or overdue, whose last turns
  were two hours ago, an hour ago and a minute ago
- **THEN** the run works through them oldest first: two hours, then an hour, then a minute

#### Scenario: Accounts that have waited equally are ordered reproducibly

- **WHEN** a run begins with two linked рахунки in the same group that have never had a turn
- **THEN** they are processed in the order of their monobank account identifiers, and a second run
  from the same state uses the same order

#### Scenario: A run cut short leaves different accounts first next time

- **WHEN** a run over nine linked рахунки, none of which has had a turn, is stopped after three of
  them complete
- **THEN** the next run begins with the six that have not had a turn, and spends no request on the
  three that already had one until all six have

#### Scenario: An account that never completes does not hold the queue

- **WHEN** a linked рахунок whose statement is answered `unavailable` every time is the first of
  nine in a run
- **THEN** its failed turn still counts as a turn, and the next run begins with a рахунок that has
  waited longer rather than with it again

#### Scenario: A позачерговий рахунок that keeps failing does not hold the queue

- **WHEN** a позачерговий рахунок whose statement is answered `unavailable` every time had its turn
  in the last run, and two other рахунки are linked that waited longer
- **THEN** the next run begins with a рахунок that has waited longer rather than with it again

#### Scenario: An account no request is spent on keeps its place

- **WHEN** a linked рахунок the token no longer shows is passed over without a request being sent
- **THEN** no turn is taken for it and its place in the next run's order is unchanged

#### Scenario: A run stopped while it waits spends no request and takes no turn

- **WHEN** the owner stops a run while it is waiting out the API's minimum gap before a рахунок's
  request
- **THEN** no request is sent for that рахунок, no turn is taken for it, and the run reports it as
  stopped rather than as a failure of the bank

#### Scenario: Giving an account its turn does not reorder the run it is in

- **WHEN** a run's first рахунок completes and the run moves on
- **THEN** the run continues through the rest of the order it began with, and does not revisit the
  рахунок it has just given a turn to

### Requirement: The minimum gap between requests holds across runs, not only within one

The system SHALL send no **statement** request to the personal API sooner than the API's minimum gap
after the last statement request it sent, counting requests made by earlier runs as well as by the
current one. The moment of the last statement request SHALL be remembered on the device, SHALL be
updated for every statement request actually sent — whatever that request answered — and SHALL
survive the run that sent it ending, however it ended and whether or not the app kept running. A
client-info request is limited by the bank apart from the statement and SHALL neither wait for this
gap nor move this moment.

A remembered moment that lies in the future of the device's clock SHALL NOT make a run wait longer
than the gap itself: the wait SHALL never exceed one gap.

Remembering the moment SHALL NOT be able to fail a run: storage that refuses the write SHALL leave
the run pacing itself as it would have, rather than ending it.

#### Scenario: A run started immediately after another waits

- **WHEN** a run ends and another is started before the API's minimum gap has passed since the
  last statement request the previous run sent
- **THEN** the new run waits out the remainder of the gap before its first statement request,
  rather than sending it at once

#### Scenario: A run started long after another does not wait

- **WHEN** a run is started well after the minimum gap has passed since the last statement request
  any run sent
- **THEN** its first request goes out without waiting

#### Scenario: The first run on a device does not wait

- **WHEN** a run starts on a device that has never sent a request to the personal API
- **THEN** its first request goes out without waiting

#### Scenario: A client-info request does not move the gap

- **WHEN** a run sends a client-info request and then a statement request, and the last statement
  request was two minutes before
- **THEN** the statement request goes out without waiting, and the remembered moment is that of the
  statement request

#### Scenario: A clock moved forward does not stall sync

- **WHEN** the remembered moment of the last statement request lies in the future of the device's
  clock
- **THEN** the run waits at most one gap before its first statement request, and does not wait out
  the difference

#### Scenario: A failed run still moves the remembered moment

- **WHEN** a run's statement request is answered with a rate limit and the run ends
- **THEN** the moment of that request is remembered, so the next run paces itself from it

#### Scenario: Storage that will not remember the moment does not stop the run

- **WHEN** remembering the moment of a request fails
- **THEN** the run carries on and imports what it can, and the failure ends nothing

### Requirement: A прогін nobody asked for spends its allowance on the statement, not on balances it already has

A прогін the owner did not ask for SHALL NOT send a client-info request when it already holds an
answer that serves it. The answer it holds is the **newest** client-info answer this phone has
stored, whoever stored it — a прогін, or the monobank screen — and it serves when it was obtained
less than the **межа свіжості** ago. The межа свіжості SHALL be one minute: a прогін that starts more
than a minute after the newest stored answer asks the bank for the balances first, because the
balances are what tell it which рахунки moved (see «A moved баланс банку, a new link and a sync the
owner asked for make a рахунок позачерговий»). Inside the межа свіжості such a прогін SHALL use the
stored answer, and its first request to the personal API SHALL be a statement request.

A прогін the owner asked for SHALL always send a client-info request, whatever the phone holds.
«Asked for» is the division the тихий інтервал already draws and SHALL be the same one here:
«Синхронізувати» on the monobank screen, and the pull and «Оновити» on Головний, are прогони the
owner asked for; a прогін an opening starts, one a return to the foreground starts, the follow-up
after a перенесено прогін, a дочитування and one a chance the phone gives are прогони nobody asked
for.

The client-info request SHALL NOT be paced against the statement minute and SHALL NOT count against
it: the bank limits the two separately, so a прогін that asks for the balances still sends its first
statement request as soon as the minute since the last statement request allows.

A linked рахунок the newest stored answer does not name SHALL be treated exactly as a рахунок a
freshly fetched answer does not name: the token no longer shows it and it is set aside (see «A
рахунок the token no longer shows is set aside, not failed»), and nothing of its cursor, its imported
item ids or its транзакції is touched. It SHALL NOT be a reason to fetch client-info again.

A stored answer dated in the future of the device's clock, or a phone that holds none at all, SHALL
make the прогін ask the bank. So SHALL an answer older than the cursor of a рахунок no синхронізація
has ever completed, unless that cursor is itself in the future of the device's clock. The answer it
gets SHALL be stored before the прогін works its first рахунок.

Committing a statement answer SHALL never move a рахунок's moment backwards; storing a client-info
answer the app fetched SHALL overwrite every рахунок it names, in either direction. Reading the
stored answer SHALL NOT be able to fail a прогін: storage that refuses to answer SHALL leave the
прогін fetching client-info as it would have, rather than ending it.

#### Scenario: A stored answer from seconds ago sends the allowance to the statement

- **WHEN** a прогін nobody asked for starts over two linked рахунки, the newest stored client-info
  answer names both and was obtained twenty seconds ago, and the minimum gap has passed
- **THEN** no client-info request is sent, and the first request is a statement request

#### Scenario: A stored answer older than a minute is refetched

- **WHEN** a прогін nobody asked for starts and the newest stored answer was obtained ten minutes
  ago
- **THEN** the прогін sends a client-info request before any statement request

#### Scenario: «Синхронізувати» asks the bank however fresh the stored answer is

- **WHEN** the owner starts a прогін on the monobank screen twenty seconds after the newest stored
  client-info answer was obtained
- **THEN** the прогін sends a client-info request, and what it imports is bounded by that answer's
  moment and not by the stored one's

#### Scenario: The balances do not cost the statement its minute

- **WHEN** a прогін nobody asked for starts two minutes after the last statement request and eleven
  minutes after the newest stored answer
- **THEN** it sends a client-info request and then a statement request without waiting between them

#### Scenario: A link the token no longer names does not send every прогін back to client-info

- **WHEN** a рахунок is linked whose monobank account the newest stored answer — obtained twenty
  seconds ago — does not name, while every other link is named
- **THEN** no client-info request is sent, that рахунок is set aside with nothing of its cursor or
  its транзакції touched, and the прогін spends its allowance on the other рахунки

#### Scenario: An answer dated in the future is refetched

- **WHEN** the newest stored client-info answer is dated after the device's clock
- **THEN** the прогін sends a client-info request rather than trusting it

#### Scenario: A phone that has never read client-info asks the bank

- **WHEN** a прогін starts on a phone that holds no stored client-info answer at all
- **THEN** the прогін sends a client-info request before any statement request

#### Scenario: A committed page does not move a рахунок's moment backwards

- **WHEN** a прогін reads a stored answer, the monobank screen stores a newer one while that прогін
  is working, and the прогін then commits a page for one рахунок
- **THEN** that рахунок keeps the newer moment

#### Scenario: Storage that will not answer does not stop the прогін

- **WHEN** reading the stored client-info answer fails
- **THEN** the прогін sends a client-info request and carries on, and the failure ends nothing

### Requirement: A прогін imports nothing later than the client-info answer it used

A прогін SHALL import no транзакція later than the moment of the client-info answer it is using, and
SHALL commit that answer's баланс банку with that answer's own moment. A прогін SHALL therefore
never itself leave a рахунок holding a баланс банку newer than the транзакції it imported beside it,
and for a рахунок it carries to completion the two describe the same instant.

What can still leave the two apart is a refresh from outside the прогін, and it is bounded: a
рахунок that ends перенесено, or one still working through the вікна of its first синхронізація,
holds a баланс банку from an instant its cursor has not reached — as it always has, and as «Ще не
синхронізовано» says on the screen — and a рахунок whose row the monobank screen refreshed *while*
a прогін was working keeps that newer баланс банку beside транзакції through the older moment, for
as long as it takes the next прогін to reach it. The gap in that last case is one прогін wide rather
than a межа свіжості wide, which is what makes it the pre-existing shape and not the hour-long one
this requirement exists to prevent.

This is what keeps «Звірити» meaningful. Рахунки offers a коригування for the difference between a
рахунок's розрахунковий баланс and its баланс банку; a прогін that imported an hour of транзакції
against a баланс банку from an hour earlier would make that difference an hour of the owner's real
spending, and confirming «Звірити» would write a коригування for money that was already explained.
Ending the прогін's span at the answer's moment costs nothing — the span between it and now is
imported by the прогін after it, from the cursor this one committed.

The moment a рахунок's completed синхронізація is remembered by SHALL be the moment of the answer
the прогін used, and never the moment the прогін happened to finish. A рахунок whose cursor already
stands at that moment has nothing to ask the bank about: the прогін SHALL send no request about it,
take no хід for it, and report it complete — and the moment it is remembered by SHALL stay exactly
where it is rather than moving to now, because a sync the bank was never asked about is not a sync
that happened. Complete is the right word for it and перенесено is not: перенесено says requests
are still owed, a прогін that ends on it is followed at once by another while the app is in front,
and a прогін that could only report the same thing again would follow itself without end.

The pace's own clock is untouched by any of this. The moment the device last sent a request, and
the moment a link last took its хід, are moments of *requests* and SHALL go on being read from the
clock at the instant the request is sent.

#### Scenario: A прогін using a stored answer imports only up to that answer's moment

- **WHEN** a прогін uses a stored client-info answer obtained forty minutes ago and the bank holds
  транзакції from ten minutes ago
- **THEN** no транзакція later than the answer's moment is imported, and the рахунок's cursor lands
  at that moment

#### Scenario: The next прогін imports the rest

- **WHEN** the прогін after it uses a client-info answer of its own
- **THEN** it imports the транзакції between the previous answer's moment and its own

#### Scenario: A committed баланс банку carries the age of the answer it came from

- **WHEN** a рахунок's pages are committed from a stored client-info answer obtained forty minutes
  ago
- **THEN** the баланс банку stored with them is dated forty minutes ago and not the moment of the
  commit

#### Scenario: A completed рахунок is remembered by the answer's moment

- **WHEN** a рахунок completes every вікно up to a stored answer obtained forty minutes ago
- **THEN** its синхронізація is remembered as of forty minutes ago and not as of now

#### Scenario: A рахунок the screen refreshed mid-прогін keeps the newer balance

- **WHEN** the monobank screen stores a newer client-info answer while a прогін using an older one
  is working, and that прогін then completes a рахунок
- **THEN** the рахунок keeps the newer баланс банку and the newer moment, and the прогін after it
  brings its транзакції up to that moment

#### Scenario: A stored answer older than a рахунок the owner has just linked is refetched

- **WHEN** a рахунок no синхронізація has ever completed is linked with a boundary after the moment
  of the newest stored answer
- **THEN** the прогін sends a client-info request rather than working from that answer, and the
  answer it gets reaches past the boundary

#### Scenario: A boundary in the future of the clock does not force a request every прогін

- **WHEN** such a рахунок's boundary lies after the device's own clock, so no answer could reach it
- **THEN** the прогін uses the stored answer as it otherwise would

#### Scenario: A прогін with nothing to ask moves no moment

- **WHEN** a прогін runs while every linked рахунок's cursor already stands at the moment of the
  answer it is using
- **THEN** no request is sent, no хід is taken, every рахунок reports complete, and no рахунок's
  remembered synchronisation moment moves

#### Scenario: The pace still measures from the request

- **WHEN** a прогін using an hour-old stored answer sends a statement request
- **THEN** the moment the device last sent a request, and that link's хід, are both recorded as now
  and not as the answer's moment

### Requirement: A фоновий прогін sends what the pace allows and postpones the rest

A прогін started on a chance the phone gives, or by a дочитування, SHALL send every request the
bank's minimum gap already allows at the moment it asks, and SHALL NOT wait for a gap it still
owes: WHEN the next statement request would have to sit out any part of the minimum gap, the прогін
SHALL stop there without sending, and every рахунок it did not finish SHALL end перенесено. A
request already sent SHALL be answered and its answer stored whole — the pace is asked before a
request, never in the middle of an answer.

A фоновий прогін SHALL have no time budget and SHALL start no timer of its own inside the app. What
continues it is the phone: the next periodic chance, or a дочитування it asked the phone for — a
one-off chance the phone schedules and delivers even when the app is not running (see «A прогін that
stops with an unread позачерговий рахунок asks for a дочитування»). A прогін that waited would be
waiting on a timer the phone stops along with the app, which is a прогін that holds the one-run lock
for as long as the app stays closed and starves every chance that follows it.

A рахунок the прогін stopped before ends перенесено in the two shapes перенесено already takes:

- a рахунок no request was sent about has nothing moved — no request spent, no хід taken, its
  cursor and its last-sync moment exactly as they were — and, because no хід was taken, it keeps
  its place in the next прогін's order;
- a рахунок the прогін stopped between its вікна keeps every page it committed, the cursor those
  pages moved and the хід its request took, and its last-sync moment does not move, because it did
  not complete.

In both shapes the next прогін finds a cursor that is valid to continue from, so successive chances
work through every linked рахунок however many there are. The app SHALL claim no cadence for that:
the phone defers chances as it sees fit.

A прогін given no pacing to answer to SHALL never postpone anything.

#### Scenario: A chance sends what the gap allows and stops

- **WHEN** a chance starts a прогін over three linked рахунки, none позачерговий, the phone's last
  statement request was a quarter of an hour ago, and a stored client-info answer inside the межа
  свіжості names all three
- **THEN** one statement request is sent for the рахунок that has waited longest since its хід,
  that рахунок takes its хід, and the other two end перенесено with no request sent about them

#### Scenario: A chance that owes the gap sends nothing

- **WHEN** a chance starts a прогін and this phone sent a statement request less than the minimum
  gap ago
- **THEN** no statement request is sent, every рахунок ends перенесено, and nothing is reported as a
  failure

#### Scenario: Successive chances work through every рахунок

- **WHEN** three chances a quarter of an hour apart each start a прогін over the same three linked
  рахунки, none позачерговий
- **THEN** each chance sends its statement request about a different рахунок, in the order of ходи,
  and after the third every рахунок has had a хід

#### Scenario: A chance starts no timer

- **WHEN** a chance starts a прогін that cannot send, because the gap it owes has not passed, and
  no рахунок is left позачерговий without its turn or overdue
- **THEN** the прогін ends without having started a timer or asked for anything to wake it, and the
  next chance is what continues it

#### Scenario: An answer in flight when the прогін stops is still stored whole

- **WHEN** a statement answer is being stored as the прогін reaches a request it may not send
- **THEN** that answer's транзакції are stored and its cursor advances, and only the next request
  is not sent

#### Scenario: A рахунок stopped between its вікна keeps its pages and its хід

- **WHEN** a рахунок whose first синхронізація spans three вікна has two committed when the прогін
  reaches a request it may not send
- **THEN** it ends перенесено with the транзакції of those two вікна stored, its cursor at the end
  of the second, its хід taken, and its last-sync moment not moved; a later прогін continues it
  from the third вікно

#### Scenario: A перенесено рахунок moves no moment

- **WHEN** a рахунок that completed a синхронізація yesterday ends перенесено today
- **THEN** its last-sync moment is still yesterday

#### Scenario: A прогін with no pacing to answer to postpones nothing

- **WHEN** a прогін over nine linked рахунки is given no pacing to answer to
- **THEN** every рахунок is sent its request and none ends перенесено

### Requirement: A moved баланс банку, a new link and a sync the owner asked for make a рахунок позачерговий

A linked рахунок SHALL be **позачерговий** from a moment on, when the app knows the bank holds
something about it that has not been read yet, and SHALL stop being позачерговий when a
синхронізація of it completes up to that moment or later. Three things make a рахунок позачерговий:

- storing a client-info answer whose баланс банку for a linked рахунок differs from the one stored
  before it — whoever stores it, a прогін or the monobank screen; the moment is that answer's;
- linking it; the moment is its sync boundary;
- a прогін the owner asked for; every linked рахунок becomes позачерговий at the moment the прогін
  starts.

A рахунок already позачерговий SHALL take the **later** of its moment and the new one, so a
синхронізація that completes up to an older answer cannot clear a movement it never saw. A synced
рахунок SHALL stay позачерговий when the синхронізація that completed reached a moment earlier than
the one it is позачерговий from. An unchanged баланс банку SHALL change nothing: the app does not
claim a рахунок current because its balance did not move, and a рахунок that is not позачерговий is
still read in its turn.

#### Scenario: A balance that moved makes its рахунок позачерговий

- **WHEN** a client-info answer is stored in which the black card's баланс банку is 120 000 lower than
  the stored one, and every other рахунок's is unchanged
- **THEN** the black card is позачерговий from that answer's moment, and no other рахунок is

#### Scenario: The screen's own refresh is not lost

- **WHEN** the monobank screen stores a client-info answer in which a linked рахунок's баланс банку
  moved, and a прогін nobody asked for starts twenty seconds later without fetching client-info
- **THEN** that рахунок is позачерговий and goes first in that прогін

#### Scenario: Asking for a sync makes every рахунок позачерговий

- **WHEN** the owner pulls down on Головний with nine linked рахунки, none позачерговий
- **THEN** all nine are позачергові from the moment the прогін started

#### Scenario: A new link is позачерговий from its boundary

- **WHEN** the owner links a рахунок with a sync boundary of 2026-09-01
- **THEN** it is позачерговий from the start of 2026-09-01 until a синхронізація of it completes

#### Scenario: A completed sync clears it

- **WHEN** a позачерговий рахунок completes a синхронізація up to a moment after the one it became
  позачерговий at
- **THEN** it is no longer позачерговий

#### Scenario: A later movement is not lost to a sync over an older answer

- **WHEN** a прогін works from an answer of 10:04, the monobank screen stores one of 10:05 in which
  the same рахунок moved again, and the прогін then completes that рахунок up to 10:04
- **THEN** it stays позачерговий from 10:05

#### Scenario: An unchanged balance changes nothing

- **WHEN** a client-info answer is stored in which no linked рахунок's баланс банку moved
- **THEN** no рахунок becomes позачерговий and no рахунок's last-sync moment moves

### Requirement: A прогін that stops with an unread позачерговий рахунок asks for a дочитування

WHEN a прогін ends with at least one рахунок перенесено that is позачерговий without a turn since it
became so, or overdue, and the app is not in front of the owner as it ends, the system SHALL ask the
phone for a **дочитування**: a one-off chance to run again, no sooner than the minimum gap after the
last statement request allows a statement request. A дочитування SHALL run the same прогін a chance
the phone gives runs, under the same rules — it never waits, it is a прогін nobody asked for, and it
is due while such a рахунок waits — and SHALL itself ask for the next дочитування by the same rule, so
a chain of them reads the remaining рахунки about one a minute.

Each рахунок keeps a chain going for at most one of its turns: after it, it is neither позачерговий
without a turn nor overdue, so a рахунок that fails, or needs page after page, falls back to the
ordinary chances instead of waking the phone every minute. A рахунок the token no longer shows never
keeps a chain going.

No дочитування SHALL be asked for when the прогін ended with no such рахунок перенесено, nor when the
app is in front of the owner, whose own follow-up continues a перенесено прогін there. At most one
дочитування SHALL be pending at a time; asking again while one is pending changes nothing. Every
request a прогін makes for one SHALL be recorded in the журнал, and a chance a поштовх made due SHALL
say so in its own entry, so a chain can be told from the periodic chances.

On a phone that cannot schedule one, asking SHALL change nothing and SHALL NOT fail the прогін: the
next chance the phone gives continues from the cursors, as it always has.

#### Scenario: «Оновити» finishes with the app closed

- **WHEN** the owner presses «Оновити» on Головний with nine linked рахунки, two complete, and the
  owner leaves the app while the прогін waits for the third
- **THEN** the прогін ends перенесено and a дочитування is asked for no sooner than a minute after
  the second statement request, and each дочитування reads one of the remaining позачергові рахунки
  and asks for the next until all nine have had their turn

#### Scenario: A phone that gave no chance for hours catches up in minutes

- **WHEN** a chance comes after four hours without one, with all nine рахунки overdue, and reads one
- **THEN** a дочитування is asked for, and the chain reads the other eight about one a minute

#### Scenario: A background chance that reads the one moved рахунок asks for nothing more

- **WHEN** a background chance reads the one позачерговий рахунок, which completes, and ends with the
  other eight перенесено, none of them позачерговий or overdue
- **THEN** no дочитування is asked for

#### Scenario: A failure does not start a chain

- **WHEN** a прогін's only позачерговий рахунок is answered `unavailable`
- **THEN** no дочитування is asked for

#### Scenario: A рахунок already given its turn does not keep the chain going

- **WHEN** a позачерговий рахунок that needs more pages than one turn reads had its turn in this
  прогін and ends перенесено, and no other рахунок is позачерговий without a turn or overdue
- **THEN** no дочитування is asked for, and the next chance the phone gives continues it

#### Scenario: Nothing is asked while the owner is watching

- **WHEN** a прогін ends перенесено with позачергові рахунки unread while the app is in front of the
  owner
- **THEN** no дочитування is asked for, and the follow-up in front of the owner continues the прогін

#### Scenario: A second request while one is pending changes nothing

- **WHEN** a дочитування is pending and another прогін ends asking for one
- **THEN** still exactly one дочитування is pending

### Requirement: A notification from the monobank app is a поштовх

WHEN the monobank app posts a notification while at least one рахунок is linked and the app holds
notification access, the system SHALL take it as a **поштовх**: it SHALL note the moment and ask for
a дочитування a little over a minute later, so the balances the bank reports by then include what
the notification was about. Only the posting app, the posting moment and the notification's own
flags SHALL be looked at: an ongoing notification, one that belongs to a foreground service and a
group summary are not a поштовх. Its title, text and every other part of its content SHALL NOT be
read, stored, logged or used in any other way.

A notification while a дочитування is already pending SHALL note its moment and change nothing
else, so however many notifications the monobank app posts, a поштовх costs at most about one
прогін a minute.

A background chance or a дочитування that starts after a поштовх noted later than the last attempt
SHALL be due whatever the тихий інтервал says. What it reads first is decided by the balances, as for
every прогін: a notification that moved no баланс банку makes no рахунок позачерговий.

With no рахунок linked, or without notification access, a monobank notification SHALL change
nothing.

#### Scenario: A purchase on the black card is read within about two minutes

- **WHEN** the monobank app posts a notification about a purchase on the black card five minutes after
  the last background chance, with the app closed
- **THEN** a дочитування runs a little over a minute later, fetches client-info, finds the black
  card's баланс банку moved, and reads the black card first

#### Scenario: A поштовх is due inside the тихий інтервал

- **WHEN** a background chance starts three minutes after the last attempt and a поштовх was noted
  after that attempt
- **THEN** the прогін runs rather than ending not due

#### Scenario: Nothing of the notification is kept

- **WHEN** the monobank app posts a notification titled with a сума and a merchant
- **THEN** nothing of its title or text is stored, logged or queued for collection; only its moment
  is noted

#### Scenario: An ongoing notification is no поштовх

- **WHEN** the monobank app posts an ongoing notification, or a group summary
- **THEN** no moment is noted and no дочитування is asked for

#### Scenario: No link, no поштовх

- **WHEN** the monobank app posts a notification on a phone with no linked рахунок
- **THEN** no moment is noted and no дочитування is asked for

#### Scenario: A burst of notifications costs one дочитування

- **WHEN** the monobank app posts three notifications within ten seconds
- **THEN** exactly one дочитування is pending

### Requirement: A рахунок the token no longer shows is set aside, not failed

A linked рахунок that the client-info answer a прогін works from does not name SHALL be **set
aside**, decided before anything else about it in that прогін: no request is sent about it, it takes
no turn, it is never перенесено, it ends `unavailable` with its reason recorded as «not shown by the
token», and nothing of its link, cursor, imported item ids or транзакції is touched.

A set-aside рахунок SHALL NOT decide how the прогін is remembered: the remembered outcome SHALL be the
one that most needs the owner among the other рахунки of the прогін. This takes precedence over «A
run is remembered by its moment and by the outcome that most needs the owner» and «A postponed
рахунок ranks between cancelled and complete when a run is remembered», whose «among that run's
accounts» and «a failure anywhere in it» are read over the рахунки that were not set aside.

Nor SHALL it count toward how fresh the bank data reads. Every requirement that reads the moments of
«the linked рахунки» to say how fresh the bank data is, or whether monobank needs the owner — the
whole-bank moment and the count Головний and the monobank screen state, the moment «Потребує уваги»
decides its monobank row from, «monobank needs the owner only when there is something for them to
do», and the moment a background run decides whether to announce from — SHALL read them over the
linked рахунки the newest stored client-info answer names. This requirement takes precedence over the
wording «every linked рахунок» in those requirements.

WHEN the phone holds no client-info answer, or the newest one names none of the linked рахунки,
nothing is set aside: the прогін is remembered as `unavailable` and every linked рахунок counts toward
freshness, exactly as before, because then there is something the owner has to do.

#### Scenario: A vanished card does not make a working прогін unavailable

- **WHEN** a прогін ends with one рахунок complete, seven перенесено, and one set aside because the
  token no longer shows it
- **THEN** the attempt is remembered as перенесено, and a follow-up in front of the owner continues it

#### Scenario: A vanished card does not keep Головний stale

- **WHEN** eight linked рахунки completed a синхронізація within the last hour and a ninth, last
  synced two days ago, is not named by the newest stored answer
- **THEN** Головний reads the bank data as updated within the hour, monobank does not need the
  owner, and a background run raises no сповіщення

#### Scenario: A token that shows nothing linked is still a failure

- **WHEN** the token shows none of the three linked рахунки
- **THEN** the прогін is remembered as unavailable, and after 24 hours without a completed
  синхронізація monobank needs the owner

#### Scenario: A set-aside рахунок takes no turn and is never перенесено

- **WHEN** a прогін that stops at the minute it owes passes over a рахунок the token no longer shows
- **THEN** no request is sent about it, its last-turn moment does not move, and it ends set aside
  rather than перенесено
