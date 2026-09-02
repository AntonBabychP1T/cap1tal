## Purpose

What the owner sees and does: from a транзакція to «Сканувати QR чека», through the scanner, the
lookup and the comparison to an attached фіскальний чек whose позиції are readable under the
транзакція — with every failure named in the owner's words and retryable, and with everything
already attached readable offline.

## ADDED Requirements

### Requirement: A транзакція offers scanning a чек and shows the one it has

Editing a витрата or повернення SHALL offer «Сканувати QR чека» while the транзакція carries no
фіскальний чек. The offer SHALL be more prominent for a витрата in the seeded groceries category
— the starter set's groceries row, recognised by its identity whatever the owner has renamed it
to — than for other categories. Any транзакція that carries a чек, whatever its type has become,
SHALL show that it has one — the number of позиції and the чек's total — and SHALL lead to its
позиції, where it can be detached. A переказ, дохід or коригування SHALL offer no scan.

#### Scenario: A grocery витрата offers the scan prominently

- **WHEN** the owner opens a витрата in the seeded groceries category, renamed «Продукти», that
  carries no чек
- **THEN** «Сканувати QR чека» is offered and stands out from the rest of the form

#### Scenario: Another category offers it too

- **WHEN** the owner opens a витрата in «Побут» that carries no чек
- **THEN** «Сканувати QR чека» is offered, less prominently

#### Scenario: A транзакція with a чек shows it

- **WHEN** the owner opens a витрата carrying a чек with nine позиції totalling 74230 minor units
  UAH
- **THEN** the form shows «Фіскальний чек · 9 позицій · 742,30 ₴» in place of the scan offer, and
  tapping it opens the позиції

#### Scenario: A переказ offers no scan

- **WHEN** the owner opens a переказ that carries no чек
- **THEN** no scan is offered and no чек line is shown

#### Scenario: A retyped переказ still shows its чек

- **WHEN** a витрата carrying a чек was retyped into a переказ and the owner opens it
- **THEN** no scan is offered, the чек line is shown, and the чек can be opened and detached

### Requirement: The позиції of a чек are shown raw and offline

Opening a чек SHALL list its позиції in document order, each with its raw product name exactly as
the чек printed it, its line total, and — when the позиція holds them — its quantity with unit and
unit price; a line discount SHALL be shown beside its позиція. The list SHALL show the чек's
total, the seller when named, the date and time issued, and, when the total differs from the
транзакція's current сума, both amounts marked as different. Nothing SHALL rename, clean, group or
classify a позиція. The list SHALL be readable with no network at all.

#### Scenario: Позиції are listed as printed

- **WHEN** a чек holds «Молоко 2.5%» 4720, «Хліб житній» 3890 and «Coca-Cola 2L» 6490 minor units
  UAH
- **THEN** the list shows exactly those names with 47,20 ₴, 38,90 ₴ and 64,90 ₴ in that order

#### Scenario: A weighed позиція shows its quantity

- **WHEN** a позиція holds quantity 5701 thousandths of «кг» at 5230 minor units with line total
  29816
- **THEN** it shows «5,701 кг × 52,30 ₴» beside 298,16 ₴

#### Scenario: A позиція without a unit price shows no invented one

- **WHEN** a позиція holds a line total and no unit price
- **THEN** it shows the line total and no «×» line

#### Scenario: An edited транзакція marks the difference

- **WHEN** a транзакція's сума was changed to 70000 minor units UAH after a чек of 74230 was
  attached
- **THEN** the чек view shows 742,30 ₴ and 700,00 ₴ marked as different

#### Scenario: Offline reading

- **WHEN** the phone has no network and the owner opens an attached чек
- **THEN** every позиція is shown exactly as when it was attached

### Requirement: The scan flow says what happened at every step and lets the owner retry

Starting «Сканувати QR чека» SHALL ask for the camera permission if needed and open the scanner;
after a QR is decoded the screen SHALL show that the чек is being looked up, then either the
comparison and the позиції about to be attached, or one named reason. Each reason SHALL be shown
in Ukrainian in the owner's terms, and SHALL offer what can be done next:

- camera permission refused: the reason, and the system settings when the permission is blocked;
- no camera on this device: the reason, nothing else;
- the QR is not a чек: the reason, and scanning again;
- the чек QR lacks реквізити: the reason naming what is missing, and scanning again;
- the чек was not found: the reason, a note that a чек may appear at the tax service with a
  delay, and «Повторити» without scanning again;
- no network, or the tax service unavailable: the reason and «Повторити» without scanning again;
- the tax service refused the request or answered in a shape the app cannot read: the reason
  that the service has changed and the app needs an update, and «Повторити»;
- the document served is not a fiscal document, is not a sale or a return (a shift or service
  document), or is not the чек looked up (it names another реєстратор, date or total): the
  reason, and scanning again;
- the чек is already attached to another транзакція: the reason naming that транзакція;
- this транзакція already carries a чек: the reason.

Leaving the scanner SHALL end the flow with nothing stored. Retrying SHALL reuse the decoded
реквізити while the screen is open; nothing SHALL be retried on its own, in the background, or
after the screen is left.

#### Scenario: A successful scan ends in a preview to confirm

- **WHEN** the QR is a чек, the lookup finds it and its total equals the транзакція's сума
- **THEN** the screen shows the позиції about to be attached with the total, and offers
  «Прикріпити»

#### Scenario: A mismatch is a warning with a choice

- **WHEN** the lookup finds the чек and its total 74230 differs from the транзакція's 70000 minor
  units UAH
- **THEN** the screen states both amounts as not matching and offers «Прикріпити все одно» and
  «Скасувати», attaching nothing until one is chosen

#### Scenario: A чек not found can be retried without scanning again

- **WHEN** the lookup answers not-found
- **THEN** the screen says the чек was not found, that it may appear later, and offers
  «Повторити», which looks the same реквізити up again

#### Scenario: Offline is a reason, not a crash

- **WHEN** the phone is offline when the lookup starts
- **THEN** the screen says there is no connection and offers «Повторити», and the транзакція is
  otherwise usable as before

#### Scenario: A changed service is named as such

- **WHEN** the lookup answers request-rejected or unreadable
- **THEN** the screen says the tax service answered in a way this version cannot read, and offers
  «Повторити»

#### Scenario: A non-чек QR asks for another

- **WHEN** the scanner decodes a Wi-Fi QR
- **THEN** the screen says this is not a чек QR and offers scanning again

#### Scenario: A document that is not the чек asks for another scan

- **WHEN** the lookup finds a document that is a shift-open document, or one naming a different
  реєстратор than the QR
- **THEN** the screen says the document served is not the чек of this QR, offers scanning again,
  and nothing is stored

#### Scenario: Cancelling leaves nothing behind

- **WHEN** the owner leaves the scanner or chooses «Скасувати» at the preview
- **THEN** no чек is stored and the транзакція is unchanged

#### Scenario: A транзакція gone during the flow ends it

- **WHEN** the транзакція was deleted while the scan flow was open and the owner chooses
  «Прикріпити»
- **THEN** nothing is stored, the screen says the транзакція no longer exists, and the flow ends

### Requirement: A чек can be detached from its транзакція after confirmation

The чек view SHALL offer «Відкріпити чек»; choosing it SHALL ask for confirmation, and confirming
SHALL delete the чек and its позиції and return to the транзакція, which again offers
«Сканувати QR чека» when it is a витрата or повернення. The транзакція's own values SHALL be
untouched.

#### Scenario: Detaching after confirmation

- **WHEN** the owner chooses «Відкріпити чек» and confirms
- **THEN** the транзакція carries no чек, its сума, категорія, рахунок and дата are unchanged, and
  «Сканувати QR чека» is offered again

#### Scenario: Backing out of the confirmation keeps the чек

- **WHEN** the owner chooses «Відкріпити чек» and cancels the confirmation
- **THEN** the чек is still attached with all its позиції
