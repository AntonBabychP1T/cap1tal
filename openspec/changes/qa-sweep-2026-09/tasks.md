# qa-sweep-2026-09 — tasks

Nine defects, seven of them provable under `verify` and three of them (§6) only on the emulator.
Every task that changes behaviour writes its failing test first — hard rule 2 — and no task box is
ticked before `npm run verify` is green on the tree that holds it.

## 1. The counts the owner reads

- [x] 1.1 Add `categoryCount(n)` and `sourceCount(n)` to `src/ui/labels.ts` beside
      `transactionCount` and `accountCount`, built on the existing `plural` (design D1):
      «категорія/категорії/категорій» and «джерело/джерела/джерел». Verify in
      `src/ui/labels.test.ts` against the app-shell requirement "A count the owner reads carries
      the Ukrainian form its number asks for" — 1, 2, 4, 5, 11, 14, 21 for each of the two nouns.
- [x] 1.2 Add `planLine(summary)` and `writtenLine(summary)` to `src/ui/saldo-import.ts` (design
      D1), taking `PlanSummary` and `CommitSummary` respectively and building the two sentences the
      import shows. Verify in `src/ui/saldo-import.test.ts` against the saldo-import-screen
      requirement "The import states its four counts in the form each number asks for" — both
      scenarios verbatim, plus a plan of 1/1/1/1 and one of 11/12/13/14.
- [x] 1.3 Have `src/app/manage/saldo-import.tsx` draw `planLine` and `writtenLine` instead of the
      two template literals it builds inline. Verify by `npm run lint` and `npm run typecheck`, and
      by a source assertion in `src/ui/saldo-import.test.ts` that the screen holds neither
      «Буде записано: ` nor «Записано: ` as a literal of its own — `verify` never runs JSX, so a
      sentence left in the screen is a sentence nothing proves.

## 2. The опис Saldo wrote

- [x] 2.1 Carry the опис in `src/saldo/interpret.ts` (design D2): one local helper returning the
      transaction's description trimmed or `undefined`, spread onto all eight constructions — the
      in-transit переказ and its комісія, the «Борг» переказ, the two-real-leg переказ, the
      коригування, the дохід, the повернення and the витрата. Verify in
      `src/saldo/interpret.test.ts` against the saldo-import requirement "The опис of a Saldo row
      travels onto the транзакції built from it" — all six scenarios, the повернення and the two
      plain перекази («Борг» and two-real-leg) among them, plus one asserting the field is absent
      (not `''`) when the column holds only spaces.
- [x] 2.2 Prove the опис survives the whole flow, not just the interpreter: extend the existing
      end-to-end Saldo fixture test (`src/saldo/*.test.ts`, whichever runs parse → survey →
      interpret) so at least one row's description is asserted on the транзакція the plan holds.
      Verify with `npx vitest run src/saldo`.

## 3. The чек offer follows the form

- [ ] 3.0 **Archive gate, not implementation work — the last box to tick, after 8.2.** This
      change's `fiscal-receipts-screen` delta is ADDED into a capability that does not exist in
      `openspec/specs/` yet: `fiscal-receipts` (25/30) still owns it and is unarchived. Archive
      this change only after `fiscal-receipts` is archived — the other order creates the capability
      with a TBD Purpose and makes `fiscal-receipts`'s own archive drop its written one. The delta
      carries that Purpose verbatim as a guard against exactly that. Tick this only once
      `openspec list` no longer shows `fiscal-receipts` under `changes/`.
- [x] 3.1 Change `receiptOffer` in `src/ui/receipt-screen.ts` to take
      `{ type, categoryId?, receipt? }` instead of a `Transaction` (design D3) and update its
      existing tests to the new shape. Verify in `src/ui/receipt-screen.test.ts` against the
      fiscal-receipts-screen requirement "The scan offer answers the type the form is showing, not
      the stored one" — the four scenarios, plus the base requirement's own cases re-expressed in
      the new signature so nothing it proved is lost.
- [x] 3.2 Hand `receiptOffer` the form's own values in `src/app/transaction/[id].tsx`:
      `form.shape` and `form.categoryId` on the editing branch, `original.type` on the read-only
      коригування branch. Tighten the source-reading guard in `src/ui/receipt-screen.test.ts` so it
      asserts the editing branch passes `form.shape` — the only way `verify` can hold a JSX file to
      this. Verify with `npx vitest run src/ui/receipt-screen.test.ts`, `npm run typecheck`.

## 4. monobank offers what would help

- [x] 4.1 Change `syncSummary` in `src/ui/monobank-screen.ts` so a run that never began offers no
      retry (design D4): `retryOffered` true among the never-ran kinds only for
      `storage-unavailable`, and `replaceTokenOffered` true for `not-configured` as well. Verify in
      `src/ui/monobank-screen.test.ts` against the monobank-sync-screen requirement "Sync progress
      and every terminal outcome are understandable and retryable" — the two new scenarios, and the
      existing partial-run scenario unchanged.
- [x] 4.2 Wire `src/app/manage/monobank.tsx` so the token offer reads «Ввести токен» when no token
      is stored and «Замінити токен» when one is, both opening the same entry. Verify by
      `npm run typecheck` and `npm run lint`; the decision itself is 4.1's.

## 5. The refusal that has been answered

- [x] 5.1 Have `formState` in `src/ui/bug-report-screen.ts` drop the refusal when it is
      `REQUIRED_REFUSAL` and «Що я робив» is no longer blank, and pass every other refusal through
      (design D5). Verify in `src/ui/bug-report-screen.test.ts` against the bug-report-screen
      requirement "The form asks for three lines and saves on one" — the two new scenarios
      («Filling the required line clears its refusal», «Whitespace alone does not clear it») and
      «A refusal the fields cannot answer stays».

## 6. What the screens draw — proven on the emulator, not by `verify`

- [ ] 6.1 Size the tab labels in `src/components/app-tabs.tsx` so «Налаштування» fits, and write
      `labelStyle` in its `{ default, selected }` form so the unselected colour actually reaches
      the bar — today it does not, because expo-router reads any object holding `selected` as the
      `{ default, selected }` shape and a colour set beside it is dropped (design D6). Verify by
      `npm run lint`, `npm run typecheck` and by 6.4's two screenshots against the app-shell
      requirement "The tab bar never cuts off a name, and marks the open tab by tone" — the open
      tab's name drawn whole, and the two tones with no accent in the bar. How many of the five
      names Android draws at once is the platform's and is not this change's to move.
- [ ] 6.2 Add the small scroller component to `src/app/(tabs)/reports.tsx` that centres the marked
      month in both charts and pad the chart content horizontally (design D7). Key it on the span,
      because `onLayout` does not fire for a column that keeps its size and only slides sideways —
      without that, a span growing under a mounted «Звіти» leaves every remembered position one
      span stale and the mark off screen. Verify by `npm run lint`, `npm run typecheck` and by
      6.4's screenshots of «Звіти» against the reports-screen requirement's four new scenarios,
      the grown span among them.
- [ ] 6.3 Draw the header «+» of `src/app/(tabs)/accounts.tsx` only when the empty state is not
      showing, so exactly one control offers creating (design nothing — it is the condition the
      empty state already has). Verify by `npm run lint`, `npm run typecheck` and by 6.4's
      screenshots of Рахунки empty and non-empty, against the accounts-screen requirement's two new
      scenarios.
- [ ] 6.4 Run the `smoke-runner` subagent over 6.1–6.3 on the emulator: the tab bar with
      «Налаштування» whole and the two tones; «Звіти» opening with its marked month whole on
      screen; a month picked on the history chart bringing the category chart to it while the
      history chart stays put; a span grown under the open tab still showing its mark; Рахунки
      empty with one create offer and non-empty with the «+». Attach the screenshots. Fix what it
      finds and re-run until every scenario passes. First pass (2026-09-03) found two defects —
      the tab-bar requirement over-reached into a platform decision, and `MonthStrip` did not
      survive a growing span; both are addressed above and need the re-run.

## 7. A build tells the truth about its own tree

- [x] 7.1 Change `.gitignore`'s `node_modules/` to `node_modules` and scope `app.config.js`'s
      `git status --porcelain` to the paths a build reads (design D8). Verify against the
      bug-report requirement's two new scenarios by running, in a worktree lane whose
      `node_modules` is a symlink, `git status --porcelain` (shows the symlink) and
      `git status --porcelain -- <the list>` (shows nothing), and by `npx expo config --type public`
      reporting `dirty: false` on a clean tree.
- [x] 7.2 Guard both halves under `verify`: `src/reporting/build-provenance.test.ts` reads
      `.gitignore` and `app.config.js` from disk and asserts the ignore holds `node_modules` with
      no trailing slash and that the build's `git status` is given a path list naming the sources —
      the same source-reading idiom `src/ui/receipt-screen.test.ts` uses for the screens, and the
      only hold the gate has on two files it never executes. Verify with
      `npx vitest run src/reporting`.

## 8. Closing

- [ ] 8.1 Run `npm run verify` and paste the final lines
- [ ] 8.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
