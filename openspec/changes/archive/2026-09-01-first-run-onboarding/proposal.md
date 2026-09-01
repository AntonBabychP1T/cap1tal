# first-run-onboarding — proposal

## Why

A fresh install of cap1tal opens on Головний: an empty feed, an empty month, and a «+» that
refuses to record anything because no рахунок exists yet. Everything the app needs to be useful
— a рахунок, the monobank token, the one-time Saldo import, and later the permission to read
other banks' notifications — is somewhere under Налаштування, three taps away, and nothing on the
first screen says so. The owner's first minute is spent looking for the thing that makes the
second minute possible.

The app also asks for nothing on launch. Every permission it will ever need is a decision the
owner has to go and find. The one that matters — Android's notification access, which FR-S3's
reading of other banks' push notifications depends on — has no home in the app at all: the
`bank-notifications` engine can parse a notification, but nothing on any screen tells the owner
that permission exists, what it is for, or that nothing read ever leaves the phone.

## What Changes

- **A setup view.** One screen listing what the app needs to work, each item with its own state
  and one action that opens the single screen that changes it: a перший рахунок, monobank, the
  Saldo import, and the permission to read bank notifications.
- **It is where a fresh device opens.** While the device holds no рахунок and no транзакція, the
  app opens on the setup view instead of an empty Головний. The moment either exists it stops
  opening there — the checklist is a first minute, not a nag.
- **It stays reachable.** «Перші кроки» joins the Налаштування sections, so the checklist can be
  reopened at any time, and skipping it never hides it.
- **The notification permission gets an honest home.** The step says what the permission is for
  and that nothing read leaves the device. While the installed build has no way to grant it, the
  step says exactly that and offers no action that would lead nowhere; when the build can grant
  it, the same step opens the system screen where it is granted and reports whether it is.
- **Nothing on the checklist writes anything.** Every item is a state read plus a link.

## Non-goals

- **No notification listener.** This change adds no Android service, no config plugin, no
  manifest entry and no native code; the permission step reports "not available yet" on the
  builds that exist today. Making it grantable is `bank-notifications-screen`'s work, and this
  step is written so that landing it changes what the step *says*, not what the screen *is*.
- **No new permissions of any kind are requested by this change** — the app needs none at runtime
  today, and inventing a prompt for one it does not use would train the owner to tap through.
- **No new storage.** Whether setup is finished is read from what the device already holds — a
  рахунок, a транзакція, a token, an import marker — rather than from a new flag, so the answer
  cannot drift from the truth.
- **No wizard.** The steps are a list the owner may do in any order, or none; nothing is blocked
  behind them and there is no "next".
- **No change to Головний, Місяць, Рахунки** or to what any of the linked screens do.

## What this change stacks on

This change does not land alone, and its delta says so.

- **`monobank-connect-flow`** owns `/manage/monobank`, `src/monobank/connection.ts` and
  `src/platform/monobank-token-store.ts`. The monobank step links to that route and the setup
  view reads that token store, so this change compiles only on top of it.
- **`limits-goals-reports`** owns «Ліміти» and «Цілі» in the Налаштування sections, and modifies
  the same requirement this change modifies — *The Налаштування tab hosts the management
  sections*. A MODIFIED requirement replaces the whole requirement on archive, so the two deltas
  cannot both be written against the old six-section list without one of them silently deleting
  the other's sections from truth.

  This change's delta therefore carries the union: all eight sections and the Звіти-inclusive tab
  order — the state of the tab after both have landed. **It must be archived after
  `limits-goals-reports`.** Archived before it, the older seven-section delta would overwrite this
  one and drop «Перші кроки» from the source of truth while the code and its test still have it.
