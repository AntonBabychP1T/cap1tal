## ADDED Requirements

### Requirement: The import states its four counts in the form each number asks for

The line stating what the commit will write, and the line stating what it wrote, SHALL each name
four counts — транзакції, рахунки, категорії and джерела — each with the noun in the Ukrainian
form its own number asks for, under the app-wide rule for counts. Neither line SHALL state a count
in one fixed form.

The рахунки the plan line counts SHALL be the рахунки the commit would **create**, not every
рахунок the import touches: an entry merged onto a рахунок that already exists is not one of them.
The line SHALL name that count as «рахунки» plainly, without a word distinguishing it — what a
plan states is by definition what is not there yet.

#### Scenario: A plan of small counts reads as Ukrainian

- **WHEN** the plan would write 5 транзакцій, would create 2 рахунки, and would create 3 категорії
  and 1 джерело
- **THEN** the line reads «Буде записано: 5 транзакцій, 2 рахунки, 3 категорії, 1 джерело.»

#### Scenario: A merged entry is not one of the рахунки the plan counts

- **WHEN** the plan touches 5 рахунки of which 3 already exist and 2 would be created
- **THEN** the line states «2 рахунки»

#### Scenario: The result line agrees with itself

- **WHEN** the commit has written 21 транзакцію, 1 рахунок, 14 категорій and 4 джерела
- **THEN** the line reads «Записано: 21 транзакція, 1 рахунок, 14 категорій, 4 джерела.»
