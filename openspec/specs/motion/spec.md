# motion Specification

## Purpose
How the app moves and what the owner feels: one short, shared vocabulary of transitions that
confirms what the owner did and where they are, charts that move from one shape to the next, and a
few system haptics that mark outcomes. None of it costs battery while the screen is still, motion
gives way entirely to the phone's reduced-motion setting, and haptics give way to the owner's
«Вібрація» switch and the phone's touch-feedback setting.

## Requirements

### Requirement: Every movement the app drives comes from one short vocabulary

Every animated change the app drives itself SHALL use one of three durations: fast (150 ms),
standard (220 ms) or emphasis (300 ms). It SHALL use the one easing for things entering, the one
for things leaving, or the one spring for press feedback. No such change SHALL last longer than
300 ms in total, including any delay before it starts.

The following are drawn by the platform, not by the app, and SHALL keep the platform's own timing:
- the launch view already specified by `app-shell`
- screen-to-screen transitions (on Android at most 400 ms)
- the touch ripple
- a switch's own toggle
- the busy spinner

#### Scenario: No animation the app drives outlasts the ceiling

- **WHEN** every duration and delay used by an animated change the app drives is listed
- **THEN** each duration is one of 150, 220 or 300 ms, and no duration plus delay exceeds 300 ms

### Requirement: Nothing moves on its own

The app SHALL NOT run an animation that repeats indefinitely, and SHALL NOT animate anything while
nothing is changing. Once a change has played out, the screen SHALL draw no further frames for
motion until the owner acts or the data changes. The one exception is the busy spinner, which turns
only while the work it stands for is running.

#### Scenario: A still screen draws nothing

- **WHEN** the owner leaves Головний open and untouched after it has settled
- **THEN** no animation is running and no frame is being produced for motion

#### Scenario: No animation loops

- **WHEN** every animation in the app is listed
- **THEN** none is set to repeat indefinitely, and the busy spinner is drawn only while its work
  runs

### Requirement: Reduced motion turns movement into instant change

WHEN the phone's system setting to reduce or remove animations is on, every movement SHALL become an
instant change or a plain cross-fade of at most 150 ms. That covers a screen entering from a side, a
section opening, a meter filling, a figure rising, a month sliding, a chart morphing and a button
pressing in. Nothing
SHALL slide, grow, shrink or rise. Every state the owner can reach SHALL stay reachable and SHALL
look the same once settled. A change of the setting SHALL take effect no later than the next launch.
Haptics are not movement: the reduced-motion setting SHALL NOT silence them.

#### Scenario: A pushed screen appears without sliding

- **WHEN** reduced motion is on and the owner opens a транзакція
- **THEN** the транзакція's screen appears without sliding in

#### Scenario: A meter shows its value at once

- **WHEN** reduced motion is on and a ліміт meter's value changes
- **THEN** the meter shows the new value at once, with no fill

### Requirement: Every tap is acknowledged at once

Every element the owner can tap SHALL show that it was touched before the finger lifts, and SHALL
show it the same way everywhere: a ripple from the touch point where the platform draws one,
otherwise one shared pressed tone. That covers rows, chips, buttons, icons, banners, widget areas,
the back arrow and the add button. The primary buttons and the add button SHALL also press in
slightly and spring back. A disabled element SHALL show no press.

Three kinds of element keep their own native feedback and are not redrawn:
- switches
- the tab bar
- the bottom-sheet scrim, whose feedback is the sheet closing

The bug-report sheet is left as it is until a change owns it.

#### Scenario: A row answers the touch

- **WHEN** the owner puts a finger on a транзакція row in the feed
- **THEN** the row shows it was touched before the finger lifts

#### Scenario: No tappable element is silent

- **WHEN** every tappable element in the app is listed, apart from the exceptions named above
- **THEN** each one shows the shared press feedback

#### Scenario: A disabled button does not answer

- **WHEN** the owner touches a button while it is disabled
- **THEN** it shows no press

### Requirement: Screens enter from where they come from

A screen pushed over another SHALL enter from the side and SHALL leave the same way when the owner
goes back, by the back arrow, the phone's back gesture or the hardware button. The entry form for a
new транзакція and the receipt scanner SHALL rise from the bottom, and SHALL sink back when the
owner leaves them. Switching between tabs SHALL cross-fade the tab's content within 150 ms, without
sliding. That includes the first visit to each tab, except the tab the app launches onto.

#### Scenario: Opening and leaving a рахунок

- **WHEN** the owner opens a рахунок from Рахунки and then goes back
- **THEN** the рахунок's screen enters from the side and leaves the same way

#### Scenario: The entry form rises

- **WHEN** the owner starts a new транзакція, and later leaves the entry form
- **THEN** the entry form rises from the bottom, and sinks back when left

#### Scenario: Tabs cross-fade

- **WHEN** the owner switches from Головний to Звіти
- **THEN** Звіти's content fades in within 150 ms and nothing slides

### Requirement: Progress fills from where it was

WHEN the value of one and the same ліміт meter, ціль progress ring or Звіти bar changes, it SHALL
move from its previous value to the new one over the emphasis duration. The first time a screen is
drawn, they SHALL fill once from empty. Returning to a screen whose values did not change SHALL NOT
replay the fill. WHEN the owner switches a meter or a ring to something else (another категорія or
місяць), the new content SHALL appear at its values under the switch's own cross-fade or slide,
with no fill. The Звіти bars are a chart: on a switch they morph, as the chart requirement states.
Once settled, the drawn value SHALL be exactly the value the screen states.

#### Scenario: A ліміт meter grows when a витрата is saved

- **WHEN** a витрата in a категорія with a ліміт is saved and the owner returns to Місяць
- **THEN** that категорія's meter moves from its previous fill to the new one

#### Scenario: Returning without a change does not replay

- **WHEN** the owner leaves Звіти and comes back with nothing written
- **THEN** the bars are drawn at their values with no fill

### Requirement: A changing сума never shows an amount that is not real

WHEN one of these sums changes in sight, the old figure SHALL give way to the new one with a short
fade-and-rise:
- the статок in one currency on Головний
- a рахунок's balance on Рахунки and in the рахунок's own header
- the month's витрачено and залишилось on Місяць and in the Головний month widget
- the витрачено in the center of the категорії donut

Every other сума SHALL change at once, and SHALL show only real values. The figure SHALL NOT count, roll or interpolate through intermediate amounts. At
every moment the figure shown SHALL be either the old real сума or the new real сума. A сума that
did not change SHALL NOT animate, even when a сума beside it on the same line did. A сума SHALL
stay on one line throughout.

#### Scenario: The статок changes without counting

- **WHEN** a транзакція is saved and Головний shows a new статок
- **THEN** the old статок fades out and the new one rises into place, and no amount between the two
  is ever shown

#### Scenario: Only the currency that changed moves

- **WHEN** a UAH транзакція is saved and the статок headline shows UAH, USD and EUR
- **THEN** only the UAH figure gives way to a new one, and the USD and EUR figures do not move

### Requirement: Switching what is shown says how it changed

Stepping to the previous місяць SHALL bring its content in from the left, and stepping to the next
from the right, over the standard duration.

#### Scenario: Stepping a month slides from the side of the step

- **WHEN** the owner steps Місяць from October to September, and then back to October
- **THEN** September's content enters from the left, and October's from the right

### Requirement: A chart moves from its old shape to its new one

WHEN the data or the selection (another history, currency or категорія) of the історія статку, the
категорії donut or the Звіти bars changes while the chart is in sight, the chart SHALL move from its
old shape to the new one over the emphasis duration, and SHALL NOT be redrawn in one frame:
- Each point of the історія статку SHALL travel from its old height to its new one, at the same
  place on the time axis.
- A donut sector SHALL grow or shrink to its new share, keyed by its категорія. A категорія that
  arrives SHALL grow from nothing at its place, and one that leaves SHALL shrink to nothing.
- A Звіти bar SHALL move from its old height to its new one, growing from the baseline: up for a
  positive сума, down for a negative one. A month column that arrives SHALL grow from zero, and one
  that leaves SHALL disappear at once.

WHEN the old and the new shape cannot be matched, the chart SHALL cross-fade over the fast duration
instead. That is the case when:
- the історія статку's points are not the same days, or a gap in it appears or closes
- the donut's sectors would change their order, or the donut goes empty or leaves being empty
- a Звіти bar changes sign, or the room below the baseline appears or goes
- the chart gives way to a message, or a message gives way to the chart

Only the drawn shape SHALL pass through in-between states. Every сума, caption, date span, scale,
point list and legend beside or inside a chart SHALL show only real values at every moment. Where
another capability states that a chart equals its numbers (a spelled-out сума identical to its bar,
donut sectors in proportion to the витрачено in its center), that SHALL hold once the chart has
settled; during a morph only the numbers are bound by it. On the first drawing of a screen, the
історія статку and the donut SHALL appear at their shapes, and the Звіти bars SHALL fill once from
empty. Returning to a screen whose data did not change SHALL NOT replay anything.

#### Scenario: Switching the історія статку morphs the line

- **WHEN** the owner switches the історія статку from UAH to USD, and both have points on the same
  days
- **THEN** the line flows from the UAH shape to the USD shape over 300 ms, and the caption and
  date span show only the USD values from the moment of the switch

#### Scenario: A shape that cannot be matched cross-fades

- **WHEN** the owner switches to a history that has a gap where the shown one has none
- **THEN** the chart cross-fades to the new history, and no line is drawn part-way between the two

#### Scenario: A new категорія grows into the donut

- **WHEN** a витрата in a категорія the donut did not show yet is saved and the owner returns to
  Головний
- **THEN** that категорія's sector grows from nothing while the others shrink to their new shares,
  and the витрачено in the donut's center shows only the old or the new real сума

#### Scenario: Switching the Звіти currency moves the bars

- **WHEN** the owner switches Звіти from UAH to USD
- **THEN** each bar moves from its UAH height to its USD height, and the scale beside the bars shows
  only USD values from the moment of the switch

#### Scenario: A bar that changes sign cross-fades

- **WHEN** a month is positive in UAH and negative in USD, and the owner switches Звіти to USD
- **THEN** the chart cross-fades to the USD bars, and no bar is drawn crossing the baseline

### Requirement: A bottom sheet rises over a fading scrim

A bottom sheet SHALL rise from the bottom edge while the scrim behind it fades in. Closing it, by
the scrim, the back gesture or a choice made in it, SHALL sink the panel and fade the scrim out in
reverse, showing its last content until it has left. A choice made in the sheet SHALL take effect
at once. Only the sheet's dismissal, and any screen change that follows the choice, SHALL wait for
the panel to leave. A sheet closed by the screen beneath it SHALL leave the same way, and SHALL NOT
report a second choice.

#### Scenario: Closing a sheet by the scrim

- **WHEN** a bottom sheet is open and the owner taps the scrim
- **THEN** the panel sinks and the scrim fades out, and the sheet is closed after that

#### Scenario: A choice is stored at once and the screen changes after the sheet leaves

- **WHEN** the owner accepts the правило a sheet offers after editing a транзакція
- **THEN** the правило is stored at once, the sheet sinks showing its offer until it has left, and
  only then does the editor close

### Requirement: Busy work shows a spinner only while it runs

WHILE a monobank прогін, a Drive бекап or the monobank token check the owner started is running, a
small spinner SHALL sit beside its busy line. It SHALL disappear when the work ends. No spinner
SHALL be shown when nothing is running.

#### Scenario: A прогін shows a spinner until it ends

- **WHEN** the owner taps «Оновити» on Головний
- **THEN** a spinner shows beside the header line while the прогін runs, and disappears when it ends

### Requirement: An outcome the owner caused is felt once

The app SHALL play one short system haptic when an action the owner started comes to its outcome:
- **confirm** when a транзакція is stored or removed (from the entry form, the editor, a confirmed
  чернетка, or a категорія picked on a feed line), рахунки are merged, a правило offered in a
  sheet is accepted, or the scanner finds a чек
- **reject** when a store is refused (the entry form or the editor refuses what was entered, or
  storing it fails), or a monobank прогін, a Drive бекап or a monobank token check the owner
  started ends in failure. A прогін fails when a рахунок in it ends in an error; a рахунок that is
  перенесено or скасовано is not a failure and plays nothing.
- **tick** when the owner changes a choice to another value: steps a місяць, picks a chip or a
  `Choices` option, or flips a switch. Turning «Вібрація» on ticks; turning it off plays nothing.

A question the app asks (whether a дата after today is meant, whether to remove a транзакція) is
not an outcome and SHALL play nothing; the owner's answer then plays what its outcome plays.

A touch alone SHALL NOT vibrate: the press feedback acknowledges it. One owner action SHALL play at
most one haptic; when one action reaches both a changed choice and an outcome (a категорія picked
on a feed line is stored at once), only the outcome plays. Nothing the owner did not start in the open app SHALL vibrate: not a background
прогін, not a captured bank notification, not a нагадування, not a screen's first drawing, not a
scroll. The app SHALL use only the system's own haptic effects, never a vibration pattern of its
own. A phone that cannot play an effect SHALL play a nearby one or nothing, and SHALL never show an
error for it.

#### Scenario: Storing a транзакція is felt

- **WHEN** the owner stores a витрата from the entry form
- **THEN** exactly one confirm haptic plays

#### Scenario: A refusal is felt differently

- **WHEN** the owner tries to store a транзакція with no сума
- **THEN** one reject haptic plays together with the refusal

#### Scenario: A found чек is felt

- **WHEN** the receipt scanner recognises a чек's QR code
- **THEN** one confirm haptic plays

#### Scenario: Stepping a month ticks

- **WHEN** the owner steps Місяць to the previous місяць
- **THEN** one tick plays

#### Scenario: A cancelled прогін does not vibrate

- **WHEN** the owner starts «Синхронізувати» on the monobank screen and stops it with «Зупинити»
  before it ends
- **THEN** no haptic plays

#### Scenario: Background work never vibrates

- **WHEN** a background monobank прогін stores new транзакції, or a bank notification is captured
- **THEN** no haptic plays

### Requirement: The owner can turn vibration off

WHILE the owner's «Вібрація» switch on Налаштування is off, no haptic SHALL play. It SHALL be on
until the owner turns it off. The switch SHALL take effect from the next action, with no restart,
and so SHALL a preference restored from a бекап.
WHILE the phone's own touch-feedback setting is off, no haptic SHALL play whatever the switch says.

#### Scenario: Vibration off plays nothing

- **WHEN** the owner turns «Вібрація» off and then stores a транзакція
- **THEN** the транзакція is stored and no haptic plays

#### Scenario: Vibration is on from the start

- **WHEN** the app runs for the first time and the owner stores a транзакція
- **THEN** one confirm haptic plays

### Requirement: What appears, closes or leaves moves its neighbours smoothly

A section or a service row that appears SHALL fade in, and one that disappears SHALL fade out. The
content around it SHALL move to its new place over the standard duration instead of jumping. That
covers a picker's list opening, the статок points and explanation opening, and a service row
appearing or leaving the service rail — the row «Що потребує відповіді» among them. A row leaving a
list SHALL fade out while the rows after it close the gap — an entry answered in the queue «Що
потребує відповіді» among them. A row arriving in a list, and every row present when a screen is
first drawn, SHALL appear at once, without animating in.

#### Scenario: The rail row comes and goes smoothly

- **WHEN** the last entry waiting for an answer is answered and the owner returns to Головний
- **THEN** the row «Що потребує відповіді» fades out and the content below moves up over 220 ms
  rather than jumping

#### Scenario: An answered entry leaves the queue smoothly

- **WHEN** the owner confirms a чернетка in the queue «Що потребує відповіді»
- **THEN** its row fades out and the entries below move up to close the gap

#### Scenario: A removed транзакція's row closes the gap

- **WHEN** the owner removes a транзакція in its editor and goes back to the рахунок it was listed on
- **THEN** its row fades out and the rows below move up to close the gap

#### Scenario: A long list appears at once

- **WHEN** the owner opens «Транзакції» or asks for more
- **THEN** the rows are shown at once, without appearing one by one
