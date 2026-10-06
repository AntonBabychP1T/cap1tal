## Why

Nothing keeps the capture layer's watched set and the stored відстежувані застосунки in step. The
device's set is written from exactly one place — the «Сповіщення банків» section, when the owner
adds or removes a watch — and every other path that changes the stored watches leaves the device
holding whatever it was last told.

A відновлення is such a path, and the worst one. It replaces the whole database, watch rows
included, and never tells the capture layer a thing. The restored phone then shows the section
listing «Приват24» as read while the capture layer, still holding the set from before the бекап —
or an empty set, on a phone that never watched anything — drops every notification that app posts
before it is ever stored. Nothing anywhere says so: no чернетка appears, no сповіщення про збій is
raised (a failure alert answers withheld access and a storage failure, and this is neither), and
the section reads exactly as it does when everything works. The owner sees «Залишилось» drifting
too high — the витрати stopped arriving — with nothing to point at.

That is the vision's second question, "how much is left", answered wrongly and confidently, which
is the one failure mode this app is not allowed to have.

## What Changes

- **The device follows storage, on every collection.** Before the waiting captured notifications
  are collected, the capture layer is told the whole set of packages the stored watches name. The
  set the device applies is therefore the set the owner sees listed, on the first collection after
  a відновлення and on every collection after that — whatever else wrote the watch rows.
- **The monobank family is left out of what is told.** A stored watch naming monobank is one that
  should never exist and can only reach the phone through a бекап written under a narrower reading
  of the family. Telling the capture layer such a set gets the *whole* set refused, which would
  leave every other відстежуваний застосунок unapplied for good — so the packages that may never be
  watched are dropped from what is told, by the same rule the capture layer itself applies.
- **The reconciliation is not a new way for a collection to fail.** A build where capture cannot
  work changes nothing and stops nothing: the collection carries on and reports exactly what it
  reported before.
- **No new alert, no new surface, nothing the owner has to do.** The fix is invisible when it
  works, which is the whole of it — a restored phone simply keeps reading the apps it says it
  reads.

Non-goals. This does not make the capture layer the source of truth for what is watched — storage
remains that, and the screen keeps writing the device first when the owner changes a watch. It adds
no repair for a watch whose рахунок the бекап did not carry (a restore lands whole or not at all,
so that state does not arise), and no reconciliation in the other direction (a package the device
holds and storage does not is removed by being absent from the set it is told). It removes no watch
row: a stored monobank watch stays listed in the section, where the owner can remove it, and is
simply never told to the device. And it raises no сповіщення про збій for any of this — the alert
means «the транзакції you expect stopped arriving», and none of these states is one the owner could
act on. It touches nothing in vision §14.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bank-notifications-screen`: the requirement covering collection gains the rule that a collection
  first tells the capture layer the stored watches' packages — the monobank family excepted — so
  the set the device applies is the set storage holds, and that a build where capture cannot work
  leaves the collection otherwise unchanged.

## Impact

- `src/ui/notification-drain.ts` — the drain tells the capture port the stored watches' packages,
  monobank excepted, before collecting, and ignores the outcomes it can do nothing about.
- `src/ui/notification-drain.test.ts` — the scenarios that prove it, against
  `inMemoryNotificationCapture`.
- No schema change, no migration, no new port method, no native code, no screen change.
