# limits-goals-reports-polish — design

## Context

Three defects the emulator found after `limits-goals-reports` was archived. None of them needs a
new number, a new table or a new dependency; all three are about the boundary between what the
engine knows and what the owner is shown. The design is mostly about *where* each fix lives, so
that `npm run verify` — Node-only, no JSX — can prove it.

## Decisions

### D1 — Ukrainian refusals live in `src/ui/`, the domain keeps its English invariants

`src/domain/` is pure and owner-agnostic (`rules/domain.md`); its `throw`s guard invariants and
are read by whoever is debugging, not by the owner. `src/ui/` is where the owner's own words
already are: `entry-form.ts` says «оберіть рахунок», `list-management.ts` says «Правило потребує
категорії», the repos say «назва не може бути порожньою». The one hole in that convention is
`src/ui/amount-input.ts` — a UI-layer parser that answers in English — and `entry-form.ts` even
says so in a comment about "`parseAmount`'s English". So:

- `parseAmount` and `parseOpeningBalance` refuse in Ukrainian. The three cases keep their three
  distinct sentences: not a сума at all, too many digits after the comma, not greater than zero.
- A typed дата gets the same treatment in `src/ui/dates.ts`: `parseTypedDate` refuses in
  Ukrainian and returns the domain's `IsoDate`. `isoDate` in the domain is unchanged and stays
  English — it is the invariant, and after this change no form reaches it first.
- The one domain refusal a form can still produce — `transfer`'s "a transfer connects two distinct
  accounts" — is named in `entry-form.ts` before `transfer` is called, exactly as the
  cross-currency arrived leg already is. That keeps the rule in the domain and the sentence in the
  UI, rather than moving either.
- `limits-repo.ts` and `goals-repo.ts` each carry one half-English storage refusal («no category
  "x" to carry a ліміт»). Both are unreachable through the sections as they stand — the id comes
  from a listed row — but they are refusals in the layer whose convention is Ukrainian, and they
  are two lines.

Rejected: translating `src/domain/`. It would put owner-facing prose in the one place that must
stay independent of who is reading, and it would leave `money()`'s "must be an integer in minor
units" — a programmer error, not a refusal — pretending to be a message.

### D2 — The back gesture's rule is a pure function; only the subscription is wiring

`BackHandler` is React Native, so a test cannot press the phone's back button. What can be tested
is the rule, and the rule is the whole finding: an open editor is closed first, and only a screen
with nothing open is left. So `src/ui/back-gesture.ts` holds

```ts
backGesture(editorOpen: boolean): 'close-editor' | 'leave-screen'
```

and `src/hooks/use-close-on-back.ts` is the four lines that subscribe to `hardwareBackPress` under
`useFocusEffect` and return `true` when the rule says «close-editor» (returning `true` is how React
Native is told the press was handled). One rule, both sections, and the sections' own modules stay
about ліміти and цілі.

`useFocusEffect`, not `useEffect`: a screen pushed over «Ліміти» must own the back press while it
is up. Nothing is pushed over it today; the hook should not be the reason that stays true.

Rejected: `beforeRemove` on the navigator. It intercepts *every* way off the screen, «←» included,
and would need the header to opt out of its own guard.

### D3 — The axis is two labels and a hairline; the exact numbers are one month at a time

Design D6 of the archived change stands: two charts are not a reason for a charting library. What
«Звіти» lacks is not drawing, it is text — and the view model already computes every сума it needs
and throws them away.

- **The axis.** `reportsViewModel` gains an axis per chart: the top of the scale (the tallest
  absolute сума, formatted), the zero, and the bottom — `null` unless that chart holds a negative
  month, in which case it is the top with a minus sign, because the scale is symmetric by
  construction (`largest()` is an absolute value). The screen draws the three labels down the left
  edge of the plot and a hairline at the baseline.
- **The numbers.** Three series × a dozen months of text does not fit a phone, and a number per
  bar on an 8pt bar fits nothing at all. So one month is spelled out under each chart, and the
  owner picks which by tapping a column. The default is the newest month — the one a person opens
  «Звіти» to read.
- **The pick is one month, not one per chart.** Both series come from `historyMonths`, so both
  charts span exactly the same months; two independent selections would let the tab show June's
  history above August's Groceries. The view model takes `chosenMonth?: Month`, resolves it
  against the span (falling back to the newest), marks the column `selected`, and returns the
  read-outs. So the fallback after a currency switch is provable rather than being a `useEffect`
  that resets state.

## Risks

- **Wording.** Six new Ukrainian sentences the owner will read often. They are in one module each
  and their tests quote them, so changing one's wording is a one-line diff and a failing test that
  says where the sentence is shown.
- **Tap targets.** A column is `Spacing.two`-wide bars plus gaps — narrow for a finger. The
  `Pressable` is the whole column including its month label, which is the widest thing in it.
- **`historyMonths` growth.** A long history makes a wide chart; it already scrolls horizontally,
  and the axis labels sit outside the scroll so they do not scroll away from their own bars.

## Compliance

- Money stays integers in minor units; every new string comes from `formatMoney`, which is integer
  string arithmetic. No cross-currency sum is introduced — each axis is one currency's.
- No migration, no schema change, no `drizzle/` edit.
- No native module, no permission, no `app.json` change; `verify` stays Node-only.
