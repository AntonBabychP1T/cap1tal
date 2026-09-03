## MODIFIED Requirements

### Requirement: A репорт про помилку is what the owner wrote plus what the app attaches

A репорт про помилку SHALL hold what the owner wrote — what they did, what happened, and what
they expected, the first of which is required and the rest optional — and what the app attaches
by itself at the moment the репорт is created: the app's version and build (commit and whether
the working tree was clean), the platform and its version, the device model, the number of
migrations applied, the route of the screen the репорт was opened from, the moment, the entire
журнал at that moment, the failure or crash that prompted it where one did, and counts of what
the phone holds — рахунки, транзакції, категорії, правила, чернетки — as numbers only. The app
SHALL create the репорт with all of that even when the owner wrote a single line.

«Whether the working tree was clean» SHALL be answered about the sources the build is made from
and about nothing else: a file that is neither tracked by git nor part of what the build reads
SHALL NOT make a build report itself dirty. A build made in a working copy whose only difference
from the commit is such a file SHALL report that commit as clean.

#### Scenario: A репорт from a failure dialog carries that failure

- **WHEN** a save is refused, the owner chooses to report it and writes «натиснув Записати»
- **THEN** a репорт exists whose prompting failure is that refusal, whose screen is the route the
  dialog was shown on, and whose журнал holds that refusal's entry as its last failure entry

#### Scenario: A репорт from a crash carries the crash

- **WHEN** a screen crashes with an uncaught error and the owner reports it from the fallback
- **THEN** the репорт's prompting failure is that crash, with its message and stack, and the
  журнал attached holds the crash's entry as its last crash entry

#### Scenario: A репорт filed on its own carries the context anyway

- **WHEN** the owner opens «Репорти про помилки» and files a репорт with nothing prompting it
- **THEN** the репорт has no prompting failure and still carries the build, the device, the
  route, the moment, the whole журнал and the counts

#### Scenario: A build from a clean working copy is not called dirty

- **WHEN** the app is built in a working copy that matches its commit exactly except for files
  git does not track and the build never reads
- **THEN** the репорт names that commit and does not say the tree was dirty

#### Scenario: A build from an edited source is called dirty

- **WHEN** the app is built in a working copy holding an uncommitted edit to a file the build reads
- **THEN** the репорт names the commit and says the tree was dirty

#### Scenario: A репорт without the required line is refused

- **WHEN** the owner saves a репорт leaving «Що я робив» empty
- **THEN** nothing is stored and the owner is told in Ukrainian that this line is needed
