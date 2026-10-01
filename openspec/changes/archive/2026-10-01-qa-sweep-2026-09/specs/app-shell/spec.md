## ADDED Requirements

### Requirement: A count the owner reads carries the Ukrainian form its number asks for

Wherever the app states a number of things in front of the owner, the noun beside it SHALL carry
the form Ukrainian gives that number: the singular for 1 and for anything else ending in 1, the
few-form for 2–4, the many-form for everything else, with 11–14 taking the many-form whatever they
end in. No screen SHALL state a count in one fixed form for every number.

#### Scenario: One of a thing is one

- **WHEN** a screen states a count of 1 рахунок, 1 категорія, 1 джерело and 1 транзакція
- **THEN** it reads «1 рахунок», «1 категорія», «1 джерело» and «1 транзакція»

#### Scenario: Two to four take the few-form

- **WHEN** a screen states a count of 2 рахунки, 3 категорії and 4 джерела
- **THEN** it reads «2 рахунки», «3 категорії» and «4 джерела»

#### Scenario: The teens take the many-form

- **WHEN** a screen states a count of 11 транзакцій and 21 транзакція
- **THEN** it reads «11 транзакцій» and «21 транзакція»

### Requirement: The tab bar never cuts off a name, and marks the open tab by tone

Every tab name the bar draws SHALL be drawn whole — never truncated, never ended in an ellipsis —
on the emulator profile `.claude/rules/android.md` names as the one every smoke pass runs on. This
SHALL hold for «Налаштування», the longest of the five. A name SHALL NOT be shortened, abbreviated
or renamed to make it fit: the bar draws its labels at whatever size shows the longest of the five
whole.

*How many* of the five names the bar draws at once is the platform's own decision and is not
specified here — on Android a five-tab bar names the open tab and leaves the rest to their icons.
The requirement is about what is drawn, not about how much of it is.

The tab the owner is on SHALL be marked by tone and not by the accent colour: its icon and its name
SHALL carry the app's own foreground colour and the other four icons the app's own muted one, the
two tones the rest of the app already uses for a thing in hand against a thing beside it. The
accent SHALL NOT appear in the tab bar — it is the app's «this is the action» colour, and spending
it on navigation would leave it meaning nothing.

#### Scenario: The longest tab name is drawn whole

- **WHEN** the owner is on «Налаштування» on that profile
- **THEN** «Налаштування» is drawn whole under its icon, with no ellipsis

#### Scenario: The open tab is the brighter of the two tones

- **WHEN** the owner is on «Головний»
- **THEN** «Головний»'s icon and its name are drawn in the app's foreground tone and the other four
  icons in its muted tone, and no tab carries the accent colour
