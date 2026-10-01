## MODIFIED Requirements

### Requirement: Статок exposes its basis beside its chart

The Статок widget SHALL display net-worth's exact per-currency current values prominently, its eligible secondary approximate UAH value, its labelled reconstructible history and eligible comparison, with accessible account/basis/date details and an action to Рахунки. Its history selector SHALL offer net-worth's «Усе ≈ грн» beside the currencies when more than one is held; that choice SHALL draw the combined history with the caption «Історія розрахункових балансів · інвестиції за вкладеним · ≈ за поточним курсом, не за курсом на дату», and SHALL read its dated points, span, change and any unknown-gap reason in the same combined terms.

#### Scenario: Headline and history use different investment bases
- **GIVEN** an investment with вкладено 100000 and dated current value 150000 minor units UAH
- **WHEN** Статок is read
- **THEN** its current contribution uses 150000, history uses вкладено, the difference is explained and no market-performance change is invented
- **AND** the explanation lists the account and observation date, and «Рахунки» opens existing accounts

#### Scenario: The owner reads the whole статок in time
- **GIVEN** accounts in UAH and USD with a cached USD rate
- **WHEN** the owner selects «Усе ≈ грн» in Статок
- **THEN** one line of «≈» UAH values is drawn under the caption naming the current rate, the point list gives each date's ≈ value or its unknown reason, and the exact per-currency headline and the currency choices are unchanged

#### Scenario: The point list folds runs of the same reason only
- **GIVEN** «Усе ≈ грн» whose earliest dates are unknown because of USD for several dates, then because of EUR for several dates, then known
- **WHEN** the point list is opened
- **THEN** it reads one line for the USD run and one for the EUR run, each naming its first and last date and its reason, and never one line merging the two reasons; the chart span and every percentage read as elsewhere in Статок, with a decimal comma

#### Scenario: The combined choice is announced to TalkBack
- **GIVEN** accounts in UAH and USD
- **WHEN** the selector is read by TalkBack with «Усе ≈ грн» selected
- **THEN** its label says that it is the whole статок approximated in гривнях and that it is selected, and each dated point is read chronologically with its «≈» amount or its reason

#### Scenario: A withheld combined history says why
- **GIVEN** accounts in UAH and EUR with no cached EUR rate
- **WHEN** the owner selects «Усе ≈ грн»
- **THEN** no line, point list or span is drawn and the widget names EUR as missing its rate, while the currency choices still show their own histories
