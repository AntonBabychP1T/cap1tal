# qa-sweep-2026-09 — design

Nine small fixes. What follows is only the decisions that were not obvious, and the one place each
fix is allowed to live so a later reader does not have to guess where it went.

## D1. Counts go through `plural`, and the sentences move to `src/ui/`

`src/ui/labels.ts` already owns the three-form rule and two nouns built on it (`transactionCount`,
`accountCount`). Two more join them — `categoryCount`, `sourceCount` — rather than the import
building its own, for the reason `plural`'s own comment gives.

The two sentences themselves (`planLine`, `writtenLine`) move out of the TSX into
`src/ui/saldo-import.ts`. That is not tidiness: `verify` never runs JSX, so a sentence built inside
`saldo-import.tsx` is a sentence no test can read. The screen keeps `planSummary` — it already
calls it — and draws what the new functions return.

`writtenLine` takes `CommitSummary` (`src/db/import-repo.ts`) and `planLine` takes `PlanSummary`;
they stay two functions because the two summaries count different things (`newAccounts` against
`accounts`) and collapsing them would need the caller to translate, which is where a wrong number
would enter.

## D2. The опис is carried in `interpret.ts` and nowhere else

`parse.ts` already reads Saldo's `Description` column onto every leg and onto the transaction;
`survey.ts` groups names. Neither changes. Only `interpret.ts` — the one file that builds cap1tal
транзакції — gains the field, at each of the eight places it constructs one: the in-transit
переказ and the комісія split off it, the «Борг» переказ, the two-real-leg переказ, the
коригування, the дохід, the повернення and the витрата.

One helper, local to that file, decides what to carry: the transaction's description trimmed, and
`undefined` when what is left is empty. It is spread the same way `originalAmount` already is
(`...(x ? { description: x } : {})`), so an absent опис stays absent rather than becoming `''` —
the domain builders drop a falsy description anyway, but the two `Income`/`Correction` object
literals are built by hand and would not.

For an in-transit pair the опис is the **departure's**. The pair already takes its date and its
row from the departure, and the departure is the row that names where the money went; the arrival
in a Saldo export is the anonymous other half. The комісія split off that departure carries the
same опис, because it is the same movement and a «Комісія» row with no опис is the one row of an
import the owner cannot place afterwards.

Not carried anywhere else: the опис decides no категорія, no джерело, no merge and no сума. The
звірка compares balances and is untouched.

## D3. `receiptOffer` stops taking a `Transaction`

The defect is not in the screen's wiring but in the function's signature: given a whole
`Transaction`, the only thing a caller can hand it is the stored one. It now takes what it
actually reads — `{ type, categoryId?, receipt? }` — and the caller is forced to say which type it
means. `src/app/transaction/[id].tsx` hands it `form.shape` and `form.categoryId` from the form
being edited, and the read-only коригування branch hands it `original.type`, which is the only
type that branch has.

`src/ui/receipt-screen.test.ts` already guards the wiring by reading the screen's source (it is
the only way to prove a JSX file under `verify`). That guard is kept and tightened: it now asserts
the call passes `form.shape`, so a future edit cannot quietly go back to the stored type.

## D4. `retryOffered` follows `syncFailed`'s reasoning

`syncFailed` already draws the line this fix needs: `not-configured` and `no-links` are setup
states, not failures — «nothing was attempted, nothing silently stopped arriving». A retry offer is
the same claim in a button. So `retryOffered` becomes true only for `storage-unavailable` among the
runs that never ran; a run that actually ran keeps its existing rule (any account not complete).

What is offered instead of the retry: `replaceTokenOffered` already draws «Замінити токен», and it
becomes true for `not-configured` as well — the screen's own label for it stays «Замінити токен»
only when a token existed, so the button's title is chosen by the screen from the same flag plus
whether a token is stored. `no-links` is answered by the sentence the card already shows.

## D5. The refusal is cleared in `formState`, not in the component

`BugReportForm` holds the fields; the host holds the refusal, so that it survives the component.
Neither can decide alone whether the refusal still applies — but `formState` is handed both, and it
is under `verify`. So it drops the refusal when it is `REQUIRED_REFUSAL` and «Що я робив» is no
longer blank, and passes every other refusal through untouched. A save-failure refusal is not about
the fields and stays until saving is tried again.

Comparing against `REQUIRED_REFUSAL` by identity rather than adding a "kind" to the refusal keeps
the host's state one string, which is what `crash-fallback.tsx` also holds.

## D6. The tab labels are sized, not renamed

`settings-screen` names the tab «Налаштування» and that name stays. The native Android tab bar
gives no auto-shrink and no two-line label, so the only lever is `labelStyle.fontSize`, which
`expo-router`'s Android appearance maps to the small and large label sizes. 11 instead of the
platform's 12 fits «Налаштування» on a 5-tab bar; the emulator pass is what proves it, not this
file.

What is **not** touched: `labelVisibilityMode`. Android's five-tab bar names the open tab and
leaves the other four to their icons, and that is the platform's decision, not a defect — the one
the owner reported was the open tab's own name being cut off. Making all five permanent
(`labelVisibilityMode="labeled"`) would give each name a fifth of the width instead of the whole
of it, and «Налаштування» — which at 11 already ends a few pixels from the item's edge — would be
truncated again at a smaller size still. That is a design decision for the owner, not a fix.

While there: `labelStyle` is currently written `{ color, selected: { color } }`, and
`convertLabelStylePropToObject` treats any object holding `selected` as the `{ default, selected }`
form — so today's top-level `color` reaches nothing and the unselected labels fall back to the
platform's `onSurfaceVariant`. Writing both halves explicitly is what makes the file's own comment
(«`text` against `textMuted`, which is also what tints the template icons») true.

## D7. The charts scroll their marked month into view

Both charts on «Звіти» are a horizontal `ScrollView` of columns, and both mark the picked month on
its label. A chart that opens at scroll 0 while its mark is on the last column shows the mark
half-clipped, which is what the emulator found.

One small component holds the fix for both: it records the viewport width and each column's `x` and
width from `onLayout`, and on every change of the marked key scrolls so that column sits centred,
clamped to the content. Centring rather than "scroll to the end" because the marked month is the
newest month *with a сума*, which is not always the last column, and because a pick made on the
other chart must move this one too.

The chart's content also gains a horizontal padding of one step, so a mark on the first or last
column is never flush against the edge it is clipped at even when the content is narrower than the
viewport and nothing scrolls.

The strip is **keyed on its span** by both callers. A column reports its place through `onLayout`,
which does not fire for a column that keeps its size and only slides sideways — so a span growing
under a mounted «Звіти» leaves every remembered position one span stale, and the strip sits on its
old offset believing the mark is still whole. The first smoke pass found exactly that: «ВЕР 2026»
in the readout over a chart showing Лют–Тра 2026, with no pill on screen at all. Remounting on a
new span throws the stale measurements away and makes every column report itself again; it also
resets the offset, which after a span change is what is wanted anyway.

This is layout: no test under `verify` can see it. The evidence is the smoke pass.

## D8. A build asks git about the sources it is built from

Two independent faults make every `auto-work` lane build report a dirty tree:

1. `.gitignore` writes `node_modules/`. A trailing slash matches a directory and not a symlink, and
   every lane's `node_modules` **is** a symlink into the main tree — so `git status` in a lane
   always shows `?? node_modules`. Dropping the slash ignores both.
2. `app.config.js` runs a bare `git status --porcelain`, so any untracked file anywhere — a
   screenshot dropped in `docs/screens/`, a scratch file — makes the build call itself dirty.

The second is fixed the way `scripts/fingerprint.sh` already does it: ask git about a list of paths
rather than about the whole tree. The list is the sources a build actually reads — `src`, `assets`,
`modules`, `types`, `drizzle`, `app.json`, `app.config.js`, `package.json`, `package-lock.json` —
which is `fingerprint.sh`'s `WATCH` minus the tooling config it has and a build does not, plus
`assets` and `modules`, which a build reads and `verify` does not. The two lists are deliberately
not shared: they answer different questions («is this tree verified?» against «is this bundle the
commit?»), and a build config that shelled out to a bash script to answer would be worse than a
duplicated array.

`null` from git still means dirty, for the reason already written there.
