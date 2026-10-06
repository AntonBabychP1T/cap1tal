## ADDED Requirements

### Requirement: The history chart says that earlier months lie beyond its edge

WHEN «Історія за місяцями» holds more months than fit the width of the screen, the chart SHALL show
at its leading edge that earlier months lie to the left, and its scale SHALL be written short enough
— the сума rounded to a whole number with its currency code — that the bars, not the scale, take
most of the width.

#### Scenario: Seven months on a narrow phone

- **WHEN** the UAH history holds seven months and only three columns fit a phone 360 dp wide
- **THEN** the chart opens on the latest month, shows that earlier months lie to the left, and its
  scale reads «160 263 UAH» rather than «160 263,13 UAH»
