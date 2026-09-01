## MODIFIED Requirements

### Requirement: A watch is added by picking an app and its рахунок, accepted by the capture layer first

The section SHALL let the owner add a watch by choosing a known bank app by name or by naming
an app package by hand, mapped to exactly one existing unarchived рахунок; archived рахунки
SHALL NOT be offered. The watch SHALL be stored only after the capture layer accepts the
resulting watched set; a refused or unavailable answer SHALL leave the stored watches and the
list unchanged, with the answer shown. The monobank app SHALL never be offered among the known
apps, and a hand-named monobank package SHALL be refused — mono is synced by its API, and a
second capture path would only manufacture duplicates. An app already watched SHALL NOT gain a
second watch: adding it again SHALL be rejected while the existing watch stands. The list SHALL
show every watch with its app and its рахунок; a watch whose рахунок was later archived SHALL
stay listed and removable.

The known bank apps offered SHALL be those installed on this device: an app the phone does not
have is not one whose notifications can ever arrive, and offering it is an invitation to a watch
that will stay silent forever. WHEN the device cannot answer which apps are installed — a platform
or a build without that ability — every known bank app SHALL be offered, as before, rather than an
empty picker: an unanswered question is not a "no". WHEN no known bank app is installed, no picker
SHALL be offered and naming a package by hand SHALL stay available, with all its rules unchanged.

The one affordance that opens the add form SHALL carry the same label every time it is shown —
before the form has ever been opened, and after the form has been opened and abandoned alike.

#### Scenario: A watched app appears with its рахунок

- **WHEN** access is granted and the owner watches a known bank app mapped to the unarchived
  UAH рахунок «Приват»
- **THEN** the capture layer was told the new watched set, and the list shows that app with
  «Приват»

#### Scenario: Only installed bank apps are offered

- **WHEN** the device has one of the known bank apps installed and not the others, and the owner
  opens the known-apps picker
- **THEN** the installed app is offered and the ones the device does not have are not

#### Scenario: A device that cannot answer offers the whole list

- **WHEN** the device cannot say which apps are installed and the owner opens the known-apps picker
- **THEN** every known bank app is offered

#### Scenario: No installed bank app leaves the hand-named package

- **WHEN** none of the known bank apps is installed on the device
- **THEN** no known-apps picker is offered, and a package named by hand is still accepted under the
  same rules

#### Scenario: The label of the add affordance does not change

- **WHEN** the owner opens the add form and abandons it
- **THEN** the affordance that opens it reads exactly as it read before the form was opened

#### Scenario: The monobank app is not offered and its package is refused

- **WHEN** the owner opens the known-apps picker, and then hand-names a package of the monobank
  family
- **THEN** monobank is not among the offered apps, the hand-named package is refused with the
  refusal shown, and the stored watches are unchanged

#### Scenario: A refused set changes nothing

- **WHEN** the capture layer refuses the watched set an addition would produce
- **THEN** no watch is stored, the list is unchanged, and the refusal is shown

#### Scenario: An already-watched app is rejected

- **WHEN** an app is already watched and the owner hand-names its package again
- **THEN** the addition is rejected and the existing watch stands unchanged

#### Scenario: An archived рахунок is not offered

- **WHEN** the owner adds a watch while a рахунок is archived
- **THEN** that рахунок is not among the offered рахунки, while an existing watch mapped to it
  stays listed
