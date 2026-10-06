## Why

On 2026-09-07 the owner's phone missed an OTP Bank сповіщення while «Сповіщення банків» said
«Доступ до сповіщень надано». Android keeps a notification listener *enabled* in its settings
after an app update, a reinstall or a «Force stop», but does not always *bind* it again — the
service hears nothing, and the app's only source of truth, the operating system's list of enabled
listeners, still answers yes. The archived design named this quirk and deferred it: "if it bites
in practice, `requestRebind` is a later, spec-invisible addition". It has bitten, and it is not
spec-invisible: the app reports a state it is not in, which is exactly what the requirement
"Notification access is grantable and answered truthfully" forbids.

Silence is the worst failure mode this feature has. A чернетка that never appears looks the same
as a day with no spending, so nothing on the phone contradicts the wrong status line — the owner
finds out weeks later, from a bank statement, that транзакції stopped arriving.

## What Changes

- The capture layer records whether it is **currently bound** to the system, not merely enabled:
  the listener service marks itself connected and disconnected, and the app can ask.
- Notification access gains a fourth answer, **granted but not listening**, distinct from granted,
  from denied and from "granting is not possible on this build". The «Сповіщення банків» section
  and the «Перші кроки» step report it, and it raises the existing collection сповіщення про збій
  the same way withdrawn access already does — from where the owner stands, транзакції have
  stopped arriving either way.
- Whenever access is granted, the app **asks the system to reconnect** the capture layer, so the
  common case repairs itself without the owner touching Android's settings. The not-listening
  answer is reported only for a state that outlives that request.
- The collection still drains while not listening: what the listener heard before it fell silent
  is still waiting on the device, and stranding it would lose транзакції the owner can no longer
  get any other way.
- No database change, no migration, no new permission, no new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bank-notifications-capture`: "Notification access is grantable and answered truthfully" gains
  the fourth answer and the reconnection request; a new requirement covers the drain of what is
  already waiting while the listener is not bound.
- `bank-notifications-screen`: the «Сповіщення банків» section reports the not-listening state,
  says what fixes it, keeps offering the system screen, and keeps the watched apps management.

## Impact

- `modules/notification-capture/` (Kotlin): `CaptureListenerService` gains the two connection
  callbacks, `CaptureStore` gains a process-scoped listening flag, `NotificationCaptureModule`
  gains two functions. No manifest change, no new permission, no new import beyond `android.*`.
- `src/platform/notification-access.ts` — the fourth answer and its pure mapping;
  `notification-access-device.ts` and `notification-capture-device.ts` — the device half, never
  loaded by `npm run verify`.
- `src/ui/notification-settings.ts` (`accessSection`), `src/app/_layout.tsx` (the collect gate).
  `src/ui/onboarding.ts` and `src/ui/alerting.ts` need no edit: both already branch on "granted or
  not", and the fourth answer falls on the right side of each.
- Native change, so the emulator smoke of the CLAUDE.md workflow applies. `npm run verify` stays
  Node-only: the ports and their in-memory doubles are what the tests see.
