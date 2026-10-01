## ADDED Requirements

### Requirement: Letter case is folded one way, whatever the phone's language

Wherever a search compares what the owner typed with an опис or a name without regard to letter
case, the case SHALL be folded by one mapping that depends on no language setting of the phone,
and that mapping SHALL agree with Ukrainian casing on every character, so that the same опис and
the same typed text are found alike on every phone and in the test suite.

#### Scenario: Ukrainian letters fold as before

- **WHEN** a витрата carries the опис «ҐАНОК ЇЖАК Єнот І» and the owner searches for «ґанок їжак єнот і»
- **THEN** that витрата is shown

#### Scenario: The fold agrees with Ukrainian casing on every character

- **GIVEN** any single character
- **WHEN** it is folded by the search's case mapping and by Ukrainian casing
- **THEN** both give the same text

#### Scenario: A phone set to Turkish still finds a Latin опис

- **GIVEN** the phone's language is Turkish, where a capital «I» lower-cases to a dotless «ı»
- **WHEN** a витрата carries the опис «BILLA» and the owner searches for «billa»
- **THEN** that витрата is shown
