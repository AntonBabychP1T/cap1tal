## ADDED Requirements

### Requirement: An інвестиційний рахунок shows вкладено, поточна вартість and прибуток

For each рахунок of вид `investment` the Рахунки screen SHALL show its вкладено — the рахунок's
розрахунковий баланс, named as вкладено rather than repeated as a second amount — and, when the
рахунок has a поточна вартість, that вартість together with the дата it carries and the
прибуток / збиток between the two, all in the рахунок's own currency and each named so none is
mistaken for another. A рахунок with no поточна вартість yet SHALL show its вкладено alone and
SHALL say that a вартість can be recorded. A рахунок of any other вид SHALL show none of this.

#### Scenario: All three numbers stand beside each other

- **WHEN** an `investment` рахунок in UAH has вкладено of 500000 minor units and a поточна
  вартість of 560000 minor units dated 2026-08-28
- **THEN** Рахунки shows it with вкладено 500000, поточна вартість 560000 as of 2026-08-28 and a
  прибуток of 60000, all as UAH

#### Scenario: A збиток is shown as the negative it is

- **WHEN** that рахунок's поточна вартість is 450000 minor units UAH against вкладено of 500000
- **THEN** Рахунки shows a збиток of −50000 minor units UAH

#### Scenario: Without a вартість only вкладено is shown

- **WHEN** an `investment` рахунок has no поточна вартість
- **THEN** Рахунки shows its вкладено, shows no прибуток, and offers recording a вартість

#### Scenario: Other вид рахунки are untouched

- **WHEN** a `spending` рахунок and a `savings` рахунок are shown
- **THEN** each shows its розрахунковий баланс as before, with no вкладено, no поточна вартість
  and no прибуток

### Requirement: The поточна вартість is recorded, replaced and cleared from the рахунок's row

From an інвестиційний рахунок on the Рахунки screen the owner SHALL record a поточна вартість in
that рахунок's own currency, replace it with a newer one, and clear it — with the semantics the
investments capability defines, including its rejections. The дата the recorded вартість carries
SHALL be the day it was entered. Nothing on the screen SHALL write a транзакція for it: the
рахунок's розрахунковий баланс SHALL be unchanged by recording, replacing or clearing, and
«Звірити» SHALL be offered for no part of this.

#### Scenario: A recorded вартість appears at once

- **WHEN** the owner records a поточна вартість of 560000 minor units for a UAH `investment`
  рахунок on 2026-08-28
- **THEN** the рахунок shows that вартість as of 2026-08-28 with its прибуток, and its
  розрахунковий баланс is what it was

#### Scenario: Replacing shows the newer figure and дата

- **WHEN** the owner records 575000 minor units UAH for that рахунок on 2026-09-30
- **THEN** the рахунок shows 575000 as of 2026-09-30 and the earlier figure is gone

#### Scenario: Clearing returns the рахунок to вкладено alone

- **WHEN** the owner clears that рахунок's поточна вартість
- **THEN** the рахунок shows вкладено alone and offers recording a вартість again, its
  транзакції and баланс untouched

#### Scenario: A rejected вартість changes nothing

- **WHEN** the owner tries to record a вартість the investments capability rejects, such as a
  negative сума
- **THEN** the screen says it was not saved and the рахунок's numbers are unchanged

#### Scenario: No коригування is ever offered for a вартість

- **WHEN** an `investment` рахунок's поточна вартість differs from its вкладено
- **THEN** «Звірити» is not offered on that рахунок and no коригування is created
