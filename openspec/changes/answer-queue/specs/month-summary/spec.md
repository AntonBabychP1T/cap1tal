## MODIFIED Requirements

### Requirement: The підсумок states what is still unanswered, or that the month is clean

The підсумок SHALL state, for the month:
- how many витрати and повернення are «Без категорії», with their сума per currency, net of
  повернення as the breakdown by category counts it;
- how many доходи are «Без джерела», with their сума per currency;
- how many чернетки dated in the month still wait.

WHEN there is no витрата or повернення «Без категорії» and no дохід «Без джерела», it SHALL say the
month is a чистий місяць. Waiting чернетки SHALL be stated apart, as they are not part of that
definition.

Each count SHALL lead to where it is answered: the queue «Що потребує відповіді» narrowed to that
month, where the «Без категорії» records, the «Без джерела» доходи and the waiting чернетки of the
month are each answered in place.

#### Scenario: Three uncategorised and one unsourced

- **WHEN** September holds three витрати «Без категорії» of 45000 minor units UAH in total and one
  дохід «Без джерела» of 200000
- **THEN** the підсумок states 3 «Без категорії» of 45000 and 1 «Без джерела» of 200000, and does
  not call September a чистий місяць

#### Scenario: «Без джерела» opens the unsourced доходи

- **WHEN** September holds nine доходи «Без джерела» and no витрата «Без категорії», and the owner
  taps the «Без джерела» count
- **THEN** the queue opens narrowed to вересень 2026, holding «Без джерела» with those nine

#### Scenario: Waiting чернетки open the queue, not Головний

- **WHEN** two чернетки dated in September still wait and the owner taps that count
- **THEN** the queue opens narrowed to вересень 2026, holding «Чернетки» with those two

#### Scenario: A clean month is called clean

- **WHEN** September holds no витрата or повернення «Без категорії» and no дохід «Без джерела», and
  one чернетка still waits
- **THEN** the підсумок says September is a чистий місяць, and separately that one чернетка waits
