## Why

Smoke-testing the (now-archived) правило-переказ change found a stale-UI bug on Головний: expand a
«Без категорії» row's one-tap category picker with «Обрати категорію», then retype that same
transaction into a переказ with «Це переказ» before closing it. Back on Головний, the row is now a
переказ — which the domain model gives neither категорія nor джерело — yet the feed still renders
the expanded category picker under it, with no control left on screen to close it: the «Згорнути»
toggle lived inside the row-actions block that only renders while the row is still «Без категорії».
The mark itself correctly disappears; only the picker beneath it is left behind. The existing
requirement says the mark "SHALL disappear with the pick" but never says what happens to it when
the transaction stops being «Без категорії» some other way, which is the gap this closes.

## What Changes

- Головний stops rendering a row's inline category picker once that row is no longer «Без
  категорії» because the transaction was retyped into something else (переказ, дохід, повернення)
  from editing and the owner returned to Головний. Whether a row's picker should still be open is
  pulled out of the screen into a pure `src/ui` decision, next to `transactionLine`'s own
  `uncategorised` field, so `verify` proves it — the same reasoning that field's own comment
  already gives for staying out of JSX.
- The picker's own expanded/full-list state is cleared at the same moment as `categorising`,
  including in the already-correct stored-pick path, so no leftover flag can survive to the next
  row a picker opens on.

## Capabilities

### Modified Capabilities

- `main-screen`: "«Без категорії» is highlighted and categorised in one tap" gains the
  requirement that the mark's picker never renders under a transaction that has stopped carrying
  «Без категорії», including a transaction retyped away from editing rather than picked from the
  feed.

## Impact

- `src/ui/transaction-line.ts` — a new pure function deciding whether a row's picker should still
  be considered open, given the current feed; covered by a vitest test naming the new scenario.
- `src/app/(tabs)/index.tsx` — calls that function after every reload to clear `categorising`/
  `categoryListOpen` when the row they point at is no longer «Без категорії», and clears both the
  same way in the already-existing stored-pick path. This wiring itself is screen state that
  `verify`'s vitest gate cannot exercise directly (no React under `src/app/`, per this repo's
  testing rules); the pure decision behind it is what `verify` proves, and a smoke-runner pass
  confirms the wiring: Обрати категорію → Це переказ → confirm the retype → back to Головний → the
  row shows no picker and no leftover chip list.
