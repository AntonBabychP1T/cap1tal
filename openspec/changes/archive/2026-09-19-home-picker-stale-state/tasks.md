## 1. Pull the decision into `src/ui`

- [x] 1.1 In `src/ui/transaction-line.ts`, add a pure function deciding whether a transaction id
  the feed's picker is open on should still be considered "Без категорії", given the current feed
  — reusing the same type/categoryId check `transactionLine`'s own `uncategorised` field already
  makes, not duplicating it. Add a vitest test in `src/ui/transaction-line.test.ts` named after
  the new scenario "A picker left open closes when its transaction is retyped away from editing",
  covering: the transaction retyped into a переказ (no longer uncategorised), an untouched
  "Без категорії" transaction (still open) and a categorised one (still closed).

## 2. Wire it into Головний

- [x] 2.1 In `src/app/(tabs)/index.tsx`, derive `activeCategorising` from the raw `categorising`
  state and the loaded feed via that function on every render (not a `useEffect` clearing state
  imperatively — that path tripped the `react-hooks/set-state-in-effect` lint rule, since setState
  synchronously inside an effect causes cascading renders; deriving the value at render time avoids
  it entirely). Every read that used to compare against raw `categorising` — the toggle's label and
  `onPress`, the `Picker`'s render guard, `useCloseOnBack`'s condition — now reads
  `activeCategorising` instead, so a row retyped away from "Без категорії" never keeps the picker
  rendered under it. Also clear `categoryListOpen` alongside `categorising` in the existing
  `categorise()` callback (previously it only cleared `categorising`) so the two flags always move
  together, whichever path closes the picker. This is screen state the vitest gate cannot exercise
  directly (no React under `src/app/`); it is proven by the manual check below and by task 1.1's
  test proving the decision behind it.

## 3. Manual verification (this screen isn't covered by the vitest gate)

- [x] 3.1 On the emulator: open Головний, use «Обрати категорію» on a «Без категорії» витрата to
  expand its picker, then tap «Це переказ» on the same row and confirm the retype in editing.
  Return to Головний and confirm the row shows as a переказ with no mark and no category picker
  under it, expanded or collapsed. Record the result (pass/fail, screenshot) since no automated
  test exercises this screen. Run this via the `smoke-runner` subagent per this repo's workflow
  for a change that touches a screen.

  **Result: PASS.** `smoke-runner` drove the exact scenario on `Pixel_10_Pro` (API 37): expanded
  the picker on a «Без категорії» витрата, retyped it into a переказ from editing without closing
  the picker, returned to Головний — the row read as a переказ with no mark and no picker,
  immediately (no delayed self-correction). Spot-check of the ordinary direct-pick path also
  passed: picking a category on a different row stored it and cleared the mark/picker with nothing
  stray on any other row. Evidence under
  `.cache/android/smoke/home-picker-stale-state/{26,27,28,30,31}-*.png`. The run's first attempt
  had appeared to fail because `scripts/android.sh up` reused a Metro instance already bound to
  the main tree's checkout rather than starting one for this worktree — killing it and rebinding
  fixed the false negative; documented as a gotcha in `.claude/rules/android.md`.

## 4. Gate

- [x] 4.1 Run `npm run verify` and paste the final lines.
- [x] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS.
