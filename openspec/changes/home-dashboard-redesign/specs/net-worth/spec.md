## Purpose

Defines «Статок» as a derived reading of recorded accounts, distinguishes current investment observations from reconstructible ledger history, and prevents missing dates or exchange rates from becoming invented money.

## ADDED Requirements

### Requirement: Статок is a reading of existing account contributions

Статок SHALL be the sum, separately per currency, of every recorded рахунок's розрахунковий баланс except that an інвестиційний рахунок contributes its latest stored поточна вартість when present and its вкладено otherwise, without storing a second balance or changing any transaction, monthly number, goal or achievement.

#### Scenario: Contributions replace rather than duplicate investments
- **GIVEN** a card balance 200000, investment вкладено 100000 and current value 150000 minor units UAH
- **WHEN** Статок is read
- **THEN** it is 350000 UAH, not 450000, and the investment's computed balance remains 100000

#### Scenario: Zero observation is not absence
- **GIVEN** an investment with вкладено 100000 UAH and current value zero
- **WHEN** Статок is read and then the observation is cleared
- **THEN** that investment contributes zero first and 100000 after clearing, with the fallback identified as вкладено

#### Scenario: All currencies stay exact and distinct
- **GIVEN** account contributions 100000 UAH, 20000 USD and 30000 EUR
- **WHEN** Статок is read
- **THEN** it holds three exact per-currency amounts and no exact combined number

### Requirement: Archived and debt accounts retain their signed contributions

Статок SHALL include archived accounts and debt accounts with their signed contributions, treating a positive debt balance as money owed to the owner and retaining every negative balance as a subtraction.

#### Scenario: Debt is a receivable
- **GIVEN** a card holds 100000 and a person owes 50000 minor units UAH on a debt account
- **WHEN** Статок is read
- **THEN** it is 150000 UAH

#### Scenario: Archiving moves no wealth
- **GIVEN** an account contributes 50000 UAH to Статок
- **WHEN** it is archived and later unarchived
- **THEN** both current Статок and its reconstructed membership stay unchanged; existing active-account totals retain their separate rules

#### Scenario: Negative debt and card balance keep their signs
- **GIVEN** contributions 100000, −5000 and −2000 minor units UAH, the last from a debt account
- **WHEN** Статок is read
- **THEN** it is 93000 UAH, without clamping or subtracting the negative debt twice

#### Scenario: Lending principal is a move and interest is income
- **GIVEN** 150000 UAH on a card and a zero debt account
- **WHEN** 50000 is lent, then the 50000 principal is returned with separately recorded 5000 interest
- **THEN** Статок stays 150000 through the principal movements and becomes 155000 after interest; monthly позичено and дохід retain their definitions

### Requirement: Current valuation states its scope and dates

A current Статок reading SHALL disclose that it includes archived accounts, identify investment current-value dates and вкладено fallbacks, and expose account contributions so the result can be reconciled with the existing account model.

#### Scenario: An old observation stays visibly old
- **GIVEN** today is September 19 and the latest investment observation is dated June 1
- **WHEN** Статок is read
- **THEN** the value remains the last entered observation with June 1 accessible beside its basis, not a freshly fetched market price

#### Scenario: Existing Accounts totals have a different scope
- **GIVEN** archived money and an investment observation differing from вкладено
- **WHEN** the explanation is opened
- **THEN** it identifies both differences from the active-account computed total, with each account's basis and amount

#### Scenario: Empty and incomplete data are not zero money
- **GIVEN** no accounts, or a required account contribution cannot be read completely
- **WHEN** Статок is read
- **THEN** it shows respectively «Ще немає рахунків» or an unavailable reading, never a fabricated zero or partial total
- **AND** known zero balances on existing accounts remain genuine zero readings

### Requirement: Approximate UAH requires every rate

The secondary approximate UAH Статок SHALL convert each per-currency total using the most recently cached monobank buying rate (cross rate only where buying rate is unavailable), round to integer minor units with halves away from zero, and appear marked «≈» with rate freshness only when all participating non-UAH currencies have rates and the total is representable.

#### Scenario: A full approximation stays secondary
- **GIVEN** 100000 minor units UAH and 10000 USD with rate 41.25345 UAH/USD
- **WHEN** the current approximation is read
- **THEN** it is ≈512535 minor units UAH alongside unchanged exact UAH and USD readings and the cached rate date

#### Scenario: Missing EUR withholds the entire approximation
- **GIVEN** UAH, USD and EUR contributions, with no EUR rate including when EUR totals zero
- **WHEN** Статок is read
- **THEN** no combined UAH approximation appears, EUR is named as missing, and all exact readings remain

#### Scenario: Cached stale rates remain marked
- **GIVEN** all needed cached rates exist but are old and the phone is offline
- **WHEN** Статок is read
- **THEN** the marked approximation uses those rates with the oldest participating timestamp, without a widget-specific fetch

#### Scenario: UAH only or overflow
- **GIVEN** UAH-only accounts, or totals exceeding exact representability
- **WHEN** Статок is read
- **THEN** the UAH-only case has no redundant approximation; the overflow case has no misleading total and an unavailable explanation

### Requirement: History is reconstructed from recorded balances only

Historical Статок context SHALL show per-currency розрахункові баланси reconstructed from openings and dated transaction effects, with investments at вкладено and an explicit «Історія розрахункових балансів · інвестиції за вкладеним» basis, never treating the latest поточна вартість, bank balance, achievement evidence or current exchange rate as historical market value.

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
- **THEN** the UAH source loses 410000 and USD destination gains 10000, and changing today's FX rate changes neither history

### Requirement: Undated opening money produces honest coverage gaps

A historical currency point SHALL exist only when every account contribution in that currency can be reconstructed: nonzero opening balances are anchored from their account's earliest recorded transaction on or before today and are unknown before it (or throughout history without one), while zero openings contribute zero before their first recorded movement within the stated recorded-history basis.

#### Scenario: A later nonzero opening blocks earlier totals
- **GIVEN** a UAH account first recorded in January and another with opening 50000 UAH whose first transaction is dated March 10
- **WHEN** January, February and March-end points are requested
- **THEN** January and February totals are unknown gaps and March-end can be reconstructed; no partial sum is presented as full Статок

#### Scenario: No anchor remains unknown
- **GIVEN** a nonzero-opening EUR account with no dated transaction and otherwise complete EUR history
- **WHEN** EUR history is requested
- **THEN** no full EUR historical point is invented and the undated opening balance is named as the reason, while current EUR remains readable

#### Scenario: An unknown currency does not hide another
- **GIVEN** complete UAH history and an undated nonzero EUR opening
- **WHEN** the owner selects UAH then EUR
- **THEN** UAH points are visible and EUR history explains its unavailable coverage without combining currencies

### Requirement: History spans the available record without forecasting

The history SHALL span the earliest transaction dated on or before today through today with dated end-of-day points at that first date, intervening month-ends and today, retaining empty months, marking unavailable points as gaps, and showing no fabricated series without recorded history.

#### Scenario: The first date does not absorb its whole month
- **GIVEN** zero opening and income of 10000 UAH on June 5 followed by an expense of 2000 UAH on June 20
- **WHEN** the first June 5 and June 30 points are read
- **THEN** they are 10000 and 8000 UAH respectively, rather than both using the month-end balance

#### Scenario: Empty months carry balances
- **GIVEN** zero openings with transactions in June and August and none in July, and today September 19
- **WHEN** history is read
- **THEN** it begins at the first June date, contains June/July/August month-ends and September 19, with July carrying June's ending balance

#### Scenario: Future dates do not extend the curve
- **GIVEN** today September 19 and a stored expense dated October 2
- **WHEN** history and current Статок are read
- **THEN** the curve ends today without that expense, the all-recorded current reading discloses its future records, and no incomparable headline change is shown

#### Scenario: No history or one date
- **GIVEN** accounts but no transaction on or before today, or only a first transaction dated today
- **WHEN** the chart is read
- **THEN** the first case says history is unavailable and the second shows one dated point without a line or period change

#### Scenario: Reconstructing is not an immutable audit log
- **GIVEN** an already displayed history
- **WHEN** an opening is corrected or a transaction is edited, deleted, backdated, imported or restored
- **THEN** points recompute from the current record and do not claim to preserve prior market valuations or prior versions of the record

### Requirement: Change requires a comparable previous month-end

A Статок change SHALL compare the current exact reading to the preceding calendar month-end in the same currency only when both are complete on the same recorded-balance basis, no participating investment current value replaces that basis and no future-dated record affects it, showing signed absolute change and a percentage only for a strictly positive baseline.

#### Scenario: Positive comparable baseline
- **GIVEN** August 31 reconstructed UAH 100000 and current UAH 120000 with no investment valuation substitution or future records
- **WHEN** change is shown on September 19
- **THEN** it reads +20000 UAH, +20.0%, «від 31.08.2026», without claiming investment return

#### Scenario: Zero or negative denominator
- **GIVEN** comparable baseline 0 or −10000 UAH and current 20000 UAH
- **WHEN** change is read
- **THEN** it is respectively +20000 or +30000 UAH with no percentage, infinity or misleading negative-base growth

#### Scenario: No matching baseline means no change
- **GIVEN** first available point is this month, last month-end is unknown, or a current investment observation substitutes for вкладено
- **WHEN** change is requested
- **THEN** no change amount/percentage is shown and the missing date or different valuation basis is explained; no older period is silently substituted

### Requirement: History is readable without interpreting color or pixels

Historical context SHALL name its selected currency, date range and scale, provide exact dated point values and an accessible chronological reading, and preserve unknown gaps even when its compact visual representation is reduced, using a currency selector defaulting to UAH when present otherwise existing currency order and preserving an available selection independently of categories.

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
