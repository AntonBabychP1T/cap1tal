## ADDED Requirements

### Requirement: Getting a token starts inside the app

The app SHALL offer, from the monobank connection screen, a way to open monobank's own personal
token page without the owner having to find it themselves. Returning from that page SHALL be
treated as the owner's own action, and the app MAY then read the device clipboard once. A
clipboard whose contents are shaped like a token SHALL be offered already filled in and validated
against monobank without a further step; contents of any other shape SHALL be discarded without
being sent anywhere, and the owner SHALL be told the clipboard held no token and offered the
field to type into.

#### Scenario: The token page is reachable in one step

- **WHEN** the owner is not connected to monobank and asks to get a token
- **THEN** monobank's own personal token page opens, and the owner is not asked to find or type
  its address

#### Scenario: A copied token is offered and validated on return

- **WHEN** the owner returns from the token page and the clipboard holds a token-shaped value
- **THEN** that value is offered as the candidate and validated against monobank, and it is kept
  only if monobank reads it

#### Scenario: An unrelated clipboard is not sent to the bank

- **WHEN** the owner returns from the token page and the clipboard holds a sentence, a link or
  nothing at all
- **THEN** no validation request is made with it, the value is not shown as a candidate, and the
  owner is told the clipboard held no token

### Requirement: The clipboard is read only when the owner asks

The app SHALL read the device clipboard only on returning from the token page or on an explicit
paste action, and SHALL NOT read it on opening a screen, on a timer, or in the background. A
clipboard read SHALL be used for nothing but a token candidate.

#### Scenario: Opening the screen reads nothing

- **WHEN** the owner opens the monobank screen, however many times
- **THEN** the clipboard is not read

#### Scenario: Pasting is available while typing

- **WHEN** the owner is entering a token by hand and asks to paste from the clipboard
- **THEN** the clipboard is read once and a token-shaped value fills the field, while any other
  value leaves the field as it was and is reported as no token

### Requirement: Unlinked monobank accounts are given link proposals

After a successful client-info answer, the system SHALL propose, for every unlinked monobank
account, either one named existing unlinked рахунок of the same currency whose name the bank's
name for the account matches, or a new рахунок prefilled from the bank's name, currency and
suggested вид. Where the evidence matches more than one рахунок equally well, the system SHALL
propose neither and SHALL say the choice is the owner's. No рахунок SHALL be proposed for more
than one monobank account, and no proposal SHALL be for a рахунок of another currency.

#### Scenario: A matching рахунок is proposed by name

- **WHEN** a token shows a UAH card the bank names `black ··4321` and the owner keeps an unlinked
  UAH рахунок named «Monobank Black»
- **THEN** that рахунок is proposed for that card

#### Scenario: Two equally matching рахунки propose nothing

- **WHEN** a token shows a UAH card and two unlinked UAH рахунки match its name equally well
- **THEN** no рахунок is proposed for that card, both are named as the candidates, and the choice
  is left to the owner

#### Scenario: An unrecognised account proposes a new рахунок

- **WHEN** a token shows a USD банка whose name matches no unlinked USD рахунок
- **THEN** a new рахунок is proposed with the банка's name, USD and the suggested вид `savings`

#### Scenario: One рахунок is never proposed twice

- **WHEN** two monobank cards both match one unlinked рахунок best
- **THEN** that рахунок is proposed for one of them only, and the other is given its own proposal

### Requirement: The proposed links are accepted as one reviewed set

The system SHALL present the proposals as one list the owner reviews before anything is written,
with one inclusive sync boundary confirmed for the whole set. Accepting the set SHALL create every
accepted link — and every рахунок a proposal creates — or none of them: a refusal of any one of
them SHALL leave the device exactly as it was. Each proposal SHALL remain individually
acceptable, changeable and refusable, and no proposal SHALL take effect without the owner
accepting it.

#### Scenario: Accepting the set links every proposal at once

- **WHEN** the owner reviews four proposals, confirms the boundary and accepts the set
- **THEN** four links exist, each рахунок a proposal named or created is linked to its monobank
  account, and every link's first sync may import items dated on or after that boundary

#### Scenario: A refused member leaves nothing behind

- **WHEN** accepting a set of proposals is refused for one of them
- **THEN** no link from that set exists, no рахунок from that set was created, and the reason is
  shown

#### Scenario: A proposal is not a link

- **WHEN** proposals have been shown and the owner leaves the screen without accepting anything
- **THEN** no link exists and no рахунок was created

## MODIFIED Requirements

### Requirement: Linking is an explicit same-currency decision with a sync boundary

The owner SHALL link an unlinked monobank account either to one existing unlinked рахунок of the
same currency or to one newly created рахунок whose bank name, currency and suggested вид are
prefilled but editable where the account rules allow. The app MAY propose which of those two a
given account is, and which рахунок; a proposal SHALL be a starting point the owner can change or
refuse, and never a link in itself. Before any link becomes active — singly or as part of an
accepted set — the owner SHALL confirm an inclusive calendar date from which statement items may
be imported.

#### Scenario: An existing same-currency рахунок is linked

- **WHEN** the owner links a UAH monobank card to an unlinked UAH рахунок and confirms 2026-08-28
- **THEN** the link becomes active and its first sync may import items dated 2026-08-28 or later

#### Scenario: Creating for a банка starts from a suggestion

- **WHEN** the owner chooses to create a рахунок for a USD банка
- **THEN** its bank name and USD currency are prefilled, `savings` is the suggested вид, and the
  owner can choose another permitted вид before confirming

#### Scenario: A different-currency рахунок is not a link choice

- **WHEN** the owner links a USD monobank account
- **THEN** UAH and EUR рахунки are not offered as destinations

#### Scenario: A proposal can be overridden before it is accepted

- **WHEN** the app proposes an existing рахунок for a card and the owner picks a different
  unlinked рахунок of the same currency instead
- **THEN** the link is made to the рахунок the owner picked and the proposal is not applied
