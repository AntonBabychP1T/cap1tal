## Why

Two old branches landed most of their code on main, but each left one piece behind:

- `claude/practical-lehmann-272f3d` (b770743): on the emulator, with no token entered this
  session, a `monobank_accounts` row cached by an earlier connection was enough to fill
  «Пропозиції приєднання» and let «Приєднати все» create a рахунок and a link, right under
  «Токен ще не введено». The requirement already says "After a successful client-info answer";
  the negative case was never tested, and `src/app/manage/monobank.tsx` still builds proposals
  from `shown` (cached rows included) rather than `fetched`.
- `claude/elegant-mcclintock-00bd04` (2a61cd3): main's Saldo import carries the опис everywhere
  except one fallback — a collapsed in-transit pair whose departure has a blank description
  ends up with no опис on the переказ or its «Комісія», even when the arrival is described.

## What Changes

- `proposalsForReview` in `src/ui/monobank-screen.ts`: no proposals at all until this opening's own
  client-info answer has succeeded (`fetched`); the screen calls it instead of `suggestLinks` +
  `proposalRows` over `shown`.
- `src/saldo/interpret.ts`: the in-transit pair takes the departure's опис, or the arrival's
  when the departure's is blank, and gives that one опис to both the переказ and its «Комісія».

## Capabilities

### Modified Capabilities

- `monobank-sync-screen`: "Unlinked monobank accounts are given link proposals" — cached rows are
  listed but not proposed; new scenario "No successful answer this opening proposes nothing".
- `saldo-import`: "The опис of a Saldo row travels onto the транзакції built from it" — the
  arrival fallback; new scenario "A blank departure takes its arrival's опис".

## Non-goals

- **No client-info precondition on the existing per-row «Приєднати» flow.** The manual link path
  keeps working from whatever the screen has on hand, cached or fresh. Its requirement ("Linking
  is an explicit same-currency decision with a sync boundary") has no client-info chapeau, and
  the defect was never reached through it. Whether it should get one is a separate, open question.
- Nothing from e2af677 (superseded on main).

## Impact

`src/ui/monobank-screen.ts`, `src/app/manage/monobank.tsx`, `src/saldo/interpret.ts` and their
tests. No schema, no migration, no new dependency.
