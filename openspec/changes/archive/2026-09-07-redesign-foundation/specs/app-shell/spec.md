## ADDED Requirements

### Requirement: The shell offers one fixed set of tabs, wherever the app runs

The shell SHALL offer exactly five tabs and SHALL offer the same five in the same order wherever the
app runs: Головний, Місяць, Рахунки, Звіти, Налаштування. No place the app is built for SHALL offer
a subset of them, a different order, or a sixth.

The order is the one the other specs already depend on — `reports-screen` places «Звіти» between
«Рахунки» and «Налаштування», and `settings-screen` places «Налаштування» last after Головний,
Місяць, Рахунки and Звіти. This requirement is what makes that one set rather than two agreements
that can drift apart.

#### Scenario: Every tab is offered

- **WHEN** the app is opened
- **THEN** five tabs are offered: Головний, Місяць, Рахунки, Звіти and Налаштування, in that order

#### Scenario: A second way of drawing the bar offers the same set

- **WHEN** the app is built for a platform that draws the tabs differently from Android
- **THEN** it offers the same five tabs, in the same order, under the same names

### Requirement: The tab being read is marked, and not by colour alone

Exactly one tab SHALL be marked as the one being read, and it SHALL be the tab whose screen is
shown. The mark SHALL NOT be carried by colour alone: at least one signal that is not a colour
SHALL also separate the marked tab from the four others, so that an owner who cannot tell the two
colours apart can still see which tab they are on.

Any non-colour signal satisfies this — the weight of the tab's name, a shape drawn behind it, or
**the presence of the name itself where the other four show only icons**, which is what a native
Android five-tab bar does on its own. The third is named explicitly because it is the one that
carries this on the platform the app ships on, and a reader who looked only for a weight or a shape
on the device would find neither and conclude the requirement was unmet.

#### Scenario: Opening a tab marks it

- **WHEN** the owner opens «Місяць»
- **THEN** «Місяць» is marked as the one being read and no other tab is

#### Scenario: The mark survives without colour

- **WHEN** the five tabs are compared with every colour difference between them ignored
- **THEN** the marked tab is still distinguishable from the other four

