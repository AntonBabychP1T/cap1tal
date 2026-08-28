# first-run-onboarding — design

## D1. "First run" is read from the device, not remembered

A stored "onboarding seen" flag has one failure mode that matters: it can disagree with the
device. Restore a backup, clear the data, hand the phone over — and the flag says finished while
the device holds nothing.

So the question is asked of the data instead: the app opens on the setup view while there is no
рахунок and no транзакція, and stops the moment either exists. That is also exactly the state in
which Головний can do nothing — no рахунок means the «+» refuses every entry — so the redirect
replaces a dead end rather than an interesting screen.

Consequence, stated plainly: an owner who deliberately keeps an empty device sees the checklist
on every launch. Since nothing can be recorded in that state, that is the correct landing, and
the checklist is one tap from the app.

No migration, no new table, no new key.

## D2. The steps are data, and their state is derived

`src/ui/onboarding.ts` takes what the screen has already read — how many рахунки and транзакції
exist, whether monobank is configured, whether the Saldo import has been committed, what the
notification permission answers — and returns the steps with their state. Pure, no React, no
storage, so `verify` holds the checklist to what the spec says it offers, exactly as
`settings-sections.ts` holds the Налаштування tab.

Each step is `done`, `todo` or `unavailable`, and only a step that can be acted on carries a
route. A step with no route renders no button — an action that leads nowhere is worse than no
action.

## D3. The notification permission, before the listener exists

`src/platform/notification-access.ts` is the port, in the shape `monobank-token.ts` established:
a pure file with the types and the double, and a platform adapter beside it that `verify` never
loads. It answers `granted`, `denied` or `unsupported`, and can open the system screen where the
permission is granted (`android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`, through
`Linking.sendIntent`).

Today the adapter answers `unsupported` on every device, and it says why in one place: no
notification listener is installed in this build, so the app does not appear on that system
screen and sending the owner there would be sending them to look for something that is not
listed. The step therefore says the reading of bank notifications is not available yet, and
offers nothing.

When `bank-notifications-screen` installs the listener, that adapter starts answering `granted`
or `denied` from the platform. Nothing else in this change moves: the step already knows what to
say and where to send the owner for both answers, and its tests already cover them through the
double.

## D4. Where it lives in the router

A route at `/onboarding`, pushed like the other non-tab screens (`manage/…`, `transaction/…`),
plus a `<Redirect>` from Головний while D1's condition holds — Головний is the initial tab, so a
fresh install lands on the checklist without the root layout learning anything about setup.

«Перші кроки» goes first in `SETTINGS_SECTIONS`, because a section that explains the others
belongs above them.
