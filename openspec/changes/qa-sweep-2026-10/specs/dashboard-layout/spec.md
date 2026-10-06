## ADDED Requirements

### Requirement: Each widget's switch names its widget

On «Налаштувати Головний», the switch that shows or hides a widget SHALL carry that widget's name as
its accessible name, and its state SHALL be read as shown or hidden.

#### Scenario: Six switches, six names

- **WHEN** a screen reader moves through the six switches of «Налаштувати Головний»
- **THEN** it hears «Витрачено цього місяця», «Останні 5 транзакцій», «Спостереження», «Топ
  категорій», «Статок» and «Прогрес», each with whether it is shown
