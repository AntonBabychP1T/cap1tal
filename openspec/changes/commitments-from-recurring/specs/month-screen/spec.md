## ADDED Requirements

### Requirement: The current month says how many пропозиції зобов'язання wait

WHEN the shown month is the current month and the commitments capability offers at least one
пропозиція зобов'язання, Місяць SHALL show one line «Регулярні платежі без зобов'язання: <N>»,
where N is how many are offered, in the place of the «Платежі місяця» block's end — or, when the
month has no such block, where that block would stand — and tapping it SHALL open the «Зобов'язання»
screen. It SHALL NOT appear for any other month or when none is offered, SHALL state no сума, and
SHALL change no number of the month.

#### Scenario: Two waiting

- **WHEN** October 2026 is the current month and the пропозиції for «Netflix» and «Megogo» are
  offered
- **THEN** Місяць of October shows «Регулярні платежі без зобов'язання: 2», and tapping it opens
  «Зобов'язання»

#### Scenario: Not for a past month

- **WHEN** the owner steps back to September 2026 while two пропозиції are offered
- **THEN** September shows no such line

#### Scenario: None after the last «Ні»

- **WHEN** the owner answered «Ні» to the only пропозиція and returns to Місяць of the current month
- **THEN** no such line is shown, and залишилось and «Вільно після зобов'язань» are unchanged
