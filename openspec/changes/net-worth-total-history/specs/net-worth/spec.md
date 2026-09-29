## MODIFIED Requirements

### Requirement: History is reconstructed from recorded balances only

Historical Статок context SHALL show per-currency розрахункові баланси reconstructed from openings and dated transaction effects, with investments at вкладено and an explicit «Історія розрахункових балансів · інвестиції за вкладеним» basis, never treating the latest поточна вартість, bank balance, achievement evidence or current exchange rate as historical market value. The only place a current exchange rate touches history is the separately marked «≈» combined UAH history, which converts these unchanged per-currency balances and never alters them.

#### Scenario: Today's valuation never changes past points
- **GIVEN** investment opening zero, August contribution 100000 UAH and September current value 150000
- **WHEN** the historical August point is read and current value is replaced with 170000
- **THEN** August remains 100000 UAH in both readings, the current headline changes, and no line joins the ledger endpoint to the current valuation

#### Scenario: Transactions retain their account effects
- **GIVEN** a zero-opening account with income 10000, expense 3000, refund 1000, correction −200 and correction +500 before a point, all minor units UAH
- **WHEN** that point is read
- **THEN** its reconstructed balance is 8300 UAH

#### Scenario: Transfers retain both legs and fees are counted once
- **GIVEN** a 100000 UAH card, a zero UAH jar and a transfer arriving as 99500
- **WHEN** a 500 fee was accepted as its separate expense with the transfer normalized to 99500 on each leg
- **THEN** their combined reconstructed balance is 99500 UAH, exactly as the existing account balances
- **AND** declining the fee and storing legs 100000/99500 yields the same combined balance

#### Scenario: FX transfer keeps its two real amounts
- **GIVEN** a transfer of 410000 minor units UAH to 10000 minor units USD
- **WHEN** history is reconstructed
- **THEN** the UAH source loses 410000 and USD destination gains 10000, and changing today's FX rate changes neither per-currency history

### Requirement: History is readable without interpreting color or pixels

Historical context SHALL name its selected currency, date range and scale, provide exact dated point values and an accessible chronological reading, and preserve unknown gaps even when its compact visual representation is reduced, using a selector defaulting to UAH when present otherwise existing currency order and preserving an available selection independently of categories. When the owner holds more than one currency the selector SHALL also offer «Усе ≈ грн» beside the currencies; it SHALL never be the default, and a preserved «Усе ≈ грн» selection SHALL fall back to the default once the owner holds a single currency.

#### Scenario: History currency has a deterministic default
- **GIVEN** accounts in UAH and USD, independently of the category widget selection
- **WHEN** historical context first opens
- **THEN** UAH is selected; absent UAH the first existing currency order is selected, and a subsequent available choice survives refresh

#### Scenario: Point values remain exact
- **GIVEN** 120 months of UAH and USD history including missing points
- **WHEN** USD is selected and a date is inspected using touch or accessibility controls
- **THEN** its exact USD value or unknown reason and date are read, the scale names USD, and no line bridges an unknown gap

#### Scenario: Negative and flat history
- **GIVEN** negative balances or every known point at the same value
- **WHEN** history is rendered
- **THEN** its stated scale includes all values with a nonzero visual range, no division by zero occurs and sign is available in text

#### Scenario: The combined choice is offered only when it adds something
- **GIVEN** accounts in UAH and USD, then accounts in UAH only
- **WHEN** the history selector is read in each case
- **THEN** it offers UAH, USD and «Усе ≈ грн» in the first case and no combined choice in the second

#### Scenario: The combined choice is never the default and does not outlive its currencies
- **GIVEN** accounts in UAH and USD with «Усе ≈ грн» selected, and later the USD account is the last one removed
- **WHEN** history is read on first opening and again after that removal
- **THEN** first opening selects UAH, and after the removal UAH is selected rather than an unavailable combined choice

## ADDED Requirements

### Requirement: Приблизний статок в динаміці converts history at the current rate

The «Усе ≈ грн» history (приблизний статок в динаміці) SHALL convert each currency's reconstructed розрахунковий баланс at each dated point using the most recently cached monobank rate as net-worth's приблизний статок does (buying rate, cross rate only where buying rate is unavailable), sum the results in integer minor units UAH rounded with halves away from zero, mark every value «≈», and state that it uses the current rate and not the rate on the date. Like приблизний статок it SHALL keep cached stale rates visible by disclosing the oldest participating rate's own moment, and it SHALL fetch, store and change nothing. It SHALL span the same dated points as the per-currency history, starting at the first date on which a point exists.

#### Scenario: Each date converts at the one current rate
- **GIVEN** UAH 100000 and USD 10000 minor units at the August 31 point, UAH 100000 and USD 20000 today, and a cached rate 41.25345 UAH/USD
- **WHEN** «Усе ≈ грн» is read
- **THEN** August 31 reads ≈512535 and today ≈925069 minor units UAH, both marked «≈» and captioned as the current rate, with the exact per-currency histories unchanged

#### Scenario: Changing today's rate revalues every point together
- **GIVEN** the history above
- **WHEN** the cached USD rate changes to 40.00000
- **THEN** every point of «Усе ≈ грн» is recomputed at 40.00000 and no point keeps the earlier rate; the per-currency histories are unchanged

#### Scenario: Stale cached rates stay marked and nothing is requested
- **GIVEN** all needed cached rates exist but are old and the phone is offline
- **WHEN** «Усе ≈ грн» is read
- **THEN** it uses those rates, discloses the oldest participating rate's own moment, and makes no request, stores no rate and changes no record

#### Scenario: Leading gaps do not become empty chart
- **GIVEN** a USD account recorded from October 2024 and UAH accounts only known from February 2026
- **WHEN** «Усе ≈ грн» is drawn
- **THEN** the line and the span under it start on the first point where a value exists, while the point list still names the earlier unknown dates and why

### Requirement: Приблизний статок в динаміці is complete or absent

A point of the «Усе ≈ грн» history SHALL exist only when the reconstructed баланс of every currency held is known on that date and the sum is exactly representable, where a currency is held when any recorded рахунок of it exists, archived and zero-balance рахунки included, as Статок's own scope. Every non-UAH currency held SHALL have a cached rate, including one whose баланс is zero; when any is missing the whole history SHALL be withheld — no point and no line — and the only reading SHALL be the message naming each currency without a rate, while the per-currency histories remain readable. Every other point SHALL be an unknown gap naming why — the currency whose баланс is unknown, or that the сума перевищує безпечне представлення — and never a partial sum.

#### Scenario: A missing rate withholds the whole history
- **GIVEN** UAH, USD and EUR balances and no cached EUR rate, including when the EUR balance is zero
- **WHEN** «Усе ≈ грн» is read
- **THEN** no point, line or point list appears, EUR is named as missing its rate, and the per-currency histories remain readable

#### Scenario: A currency held only in an archived рахунок still needs its rate
- **GIVEN** UAH accounts and an archived EUR рахунок with a zero баланс, and no cached EUR rate
- **WHEN** «Усе ≈ грн» is read
- **THEN** the history is withheld naming EUR, exactly as with an active EUR рахунок

#### Scenario: An unknown currency makes the point a gap, not a partial sum
- **GIVEN** complete UAH history and a USD рахунок with a nonzero opening first dated March 10, and a cached USD rate
- **WHEN** January, February and March-end points are read
- **THEN** January and February are unknown gaps naming USD and March-end is a value; no UAH-only sum is presented as the total

#### Scenario: Overflow is a gap that says so
- **GIVEN** converted balances whose sum exceeds exact representability on one date
- **WHEN** that point is read
- **THEN** it is an unknown gap saying the amount exceeds safe representation, not missing data

### Requirement: The change of приблизний статок compares like with like

The change of the «Усе ≈ грн» history SHALL compare the current приблизний статок to the preceding calendar month-end's point at the same current rates, only when both exist, no participating інвестиційний рахунок's поточна вартість replaces вкладено in the current reading and no future-dated транзакція touches any рахунок held, showing the signed absolute change marked «≈» and a percentage only for a strictly positive baseline, and otherwise the reason instead of a number.

#### Scenario: Positive comparable baseline
- **GIVEN** the August 31 point ≈100000 and the current приблизний статок ≈120000 minor units UAH, with no investment valuation substitution or future records
- **WHEN** the change is shown on September 19
- **THEN** it reads +≈20000 UAH, +20,0 %, «від 31.08.2026», without claiming investment return or a rate movement

#### Scenario: Zero or negative baseline has no percentage
- **GIVEN** a comparable baseline ≈0 or ≈−10000 and a current ≈20000 minor units UAH
- **WHEN** the change is read
- **THEN** it is respectively +≈20000 or +≈30000 UAH with no percentage

#### Scenario: A substituted valuation withholds the change
- **GIVEN** an інвестиційний рахунок whose поточна вартість replaces вкладено
- **WHEN** the change is requested
- **THEN** no amount or percentage is shown and the different valuation basis is stated

#### Scenario: A future-dated record withholds the change
- **GIVEN** a stored транзакція dated after today on a рахунок held
- **WHEN** the change is requested
- **THEN** no amount or percentage is shown and the future record is stated

#### Scenario: A missing baseline withholds the change
- **GIVEN** the previous month-end point is an unknown gap
- **WHEN** the change is requested
- **THEN** no amount or percentage is shown, and no older period is substituted
