## 0. Before anything

- [x] 0.1 Confirm `shortlist-pickers` has merged into `main` — this change imports `narrow`,
      `PICKER_SIZE`, `NOTHING_FOUND` and `COLLAPSE_LABEL` from `src/ui/shortlist.ts`, which that
      change creates (design "Risks", proposal Impact). Verify with
      `git log --oneline -5 -- src/ui/shortlist.ts` and `npx vitest run src/ui/shortlist.test.ts`;
      if it has not, rebase this lane on it rather than re-creating any of those exports.
      *Confirmed differently than the task expected:* `shortlist-pickers` is **not** a commit on
      `main` — it is uncommitted in this same working tree (18/19). `src/ui/shortlist.ts` exists,
      its exports resolve, and `npx vitest run src/ui/shortlist.test.ts` is 41/41 green, so nothing
      was re-created; there is no separate lane to rebase.

## 1. How alike two назви are

- [x] 1.1 Create `src/ui/name-similarity.ts` with `tokens`, `wordMatch` and
      `similarity(a, b): 0 | 1 | 2 | 3` exactly as design D4 states them — folded with `folded`
      from `src/ui/labels.ts`, split on everything that is not a letter or a digit, distinct-token
      matching in two passes (exact first, then prefixes of at least four characters, never on a
      token that is a number). Verify in a
      new `src/ui/name-similarity.test.ts`: "mono black"/"Monobank UAH, Black" scores 2,
      «гаманець»/«Гаманець» scores 3, "mono black"/"mono white" scores 1, "mono black"/"OTP"
      scores 0, and the two-pass matching gives the same answer whichever order the tokens are in.
- [x] 1.2 Add `looksLikeSameAccount(a, b)` to `src/ui/name-similarity.ts` — score 3, or score 2
      with at least two tokens in the shorter name (design D4). Verify in
      `src/ui/name-similarity.test.ts` against the spec's "A підказка про дубль points out a pair
      that can only be one рахунок": "mono black"/"Monobank UAH, Black" and «гаманець»/«Гаманець» qualify,
      while "Monobank UAH, Black"/"Monobank UAH, White" (the spec's "A mere family likeness is not a
      підказка"), «Готівка»/«Готівка вдома» and "конверт приват"/"приват степендія" do not — and
      neither do the two cases the four-character non-numeric prefix rule exists for (design D4):
      "Binance USD"/"binance usdt" and «Приват 516»/«Приват 5168».
- [x] 1.3 Add a standing regression to `src/ui/name-similarity.test.ts` over the same-currency
      pairs of the owner's real export that the rule must stay silent on — "mono black"/"mono
      white", "binance crypto"/"binance usdt", "конверт приват"/"приват степендія", "IBKR"/"інжур"
      — rather than the whole 23-name list, which is the owner's own data and does not belong in a
      tracked test (design D4). This is the test that fails the day the rule is loosened into
      guessing.

## 2. What the map offers

- [x] 2.1 Filter `mergeTargets` in `src/ui/saldo-import.ts` to the entry's own currency — entries
      and existing рахунки alike (design D5). Verify in `src/ui/saldo-import.test.ts` against the
      spec's "Only рахунки of the row's currency are offered": a UAH entry offers neither a USD
      entry nor a USD рахунок, while the existing exclusions (the entry itself, an entry already
      merged away, an archived рахунок) still hold.
- [x] 2.2 Order `mergeTargets` by `similarity` against the entry's Saldo name, descending, with a
      stable sort so ties keep the order they had — entries in the export's order, then existing
      рахунки (design D5). Verify in `src/ui/saldo-import.test.ts` against "The most alike name
      comes first": for "mono black" the target "Monobank UAH, Black" precedes «гаманець» and
      "OTP", and two equally unalike targets stay in their original order.
- [x] 2.3 Export `SEPARATE_TARGET` («Створити окремий рахунок») from `src/ui/saldo-import.ts`
      **outside** `mergeTargets`, and teach `targetOf` to decode its value into "no redirect"
      (design D6). It is deliberately not an element of the target list: inside it, `narrow` would
      delete the only way out of a merge as soon as the owner typed, and it would count toward
      `PICKER_SIZE`. Verify in `src/ui/saldo-import.test.ts` against the spec's "Creating a separate
      рахунок is always the way back", "A search that matches nothing still leaves the way out" and
      "The way out is never a search result": applying it to a merged entry leaves the plan with a
      рахунок of that entry's own again, `narrow` over `mergeTargets` never touches it, and exactly
      five real targets raise no search field.
- [x] 2.4 Change `MergeTarget` from `{ value, label }` to `{ id, name }` — `id` the same encoded
      `entry:` / `account:` value, `name` the same label — so `narrow` from `src/ui/shortlist.ts`,
      which is generic over `{ id, name }`, applies to the targets with no adapter and no second
      matching rule (design D5). Verify with `npm run typecheck` and by
      `npx vitest run src/ui/saldo-import.test.ts`, whose existing assertions on `mergeTargets` are
      re-pointed, never relaxed.
- [x] 2.5 Add `noTargetsMessage(currency)` (or the equivalent single exported string builder) to
      `src/ui/saldo-import.ts` for a currency with no candidate at all — «Немає рахунків у валюті
      EUR, з якими можна об'єднати» (design D9). Verify in `src/ui/saldo-import.test.ts` against
      the spec's "A currency with nothing to merge says so": for a map with exactly one EUR entry
      and no EUR рахунок, `mergeTargets` for that entry is empty and `noTargetsMessage('EUR')` is
      what the selector says beside `SEPARATE_TARGET`.

## 3. What a row says

- [x] 3.1 Extend `AccountRow` in `src/ui/saldo-import.ts` with `state`
      (`'new' | 'merged-entry' | 'merged-existing'`), `receives` and `kindOverridden`
      (design D2). Verify in `src/ui/saldo-import.test.ts` against the spec's "A row states what
      will happen without being opened", "A merged row states what it merges into" and "A row added
      to a рахунок the owner already has says so": an untouched entry is `new` with empty
      `receives`, a merged one is `merged-entry`, one redirected onto an existing рахунок is
      `merged-existing`, and the receiving row names the entry merged onto it.
- [x] 3.2 Add `duplicateHintFor` / `duplicateHints(state)` to `src/ui/saldo-import.ts`: for each
      entry, the one candidate that `looksLikeSameAccount` accepts **among the рахунки that entry's
      own merge targets could offer** — its currency, another entry or an unarchived existing
      рахунок — nothing when two or more qualify, and for a mutually qualifying pair of entries only
      the later one in the map's order carrying it (design D4, D11). Verify in
      `src/ui/saldo-import.test.ts` against "An obvious duplicate is pointed out, not merged", "A
      рахунок the owner already has is pointed out", "An archived рахунок is never named by a
      підказка", "Two candidates cancel each other out", "A pair is pointed out on one side only"
      and "Different currencies are never called the same рахунок".
      *Shipped as `duplicateHints(state)` alone.* `duplicateHintFor` was written, found to have no
      caller — the screen reads `AccountRow.duplicateHint` — and deleted rather than left as a dead
      export; the task's slash reads as one or the other.
- [x] 3.3 Add `dismissedHints` to `FlowState` with `dismissHint(state, key)`, and hang
      `AccountRow.duplicateHint` off it: no підказка on a dismissed row, none on a row that has
      itself been merged, none naming a рахунок that has since been merged away, and nothing about a
      dismissal reaching `Decisions` (design D10, D11). Verify in `src/ui/saldo-import.test.ts`
      against "A dismissed підказка does not come back", "A merged row states its merge and no
      підказка" and "A підказка naming a рахунок that has since been merged away is withdrawn" —
      including that the plan built from the state before and after a dismissal is identical, which
      is the whole reason it is not a decision.
- [x] 3.4 Add `mapSections(state)` splitting the rows into those that carried a підказка when the
      export was read and the rest, with membership computed from `state.survey` and
      `state.existing` only — never from the decisions or the dismissals (design D7). Verify in
      `src/ui/saldo-import.test.ts` against the spec's "Neither the grouping nor the counts move
      while the owner decides": merging one of the grouped rows, undoing it and dismissing its
      підказка each leave both sections holding exactly the same rows in the same order.
- [x] 3.5 Add `mapSummary(state)` returning the opening line's counts and the sentence itself, in
      the words of design D9, declined with `plural` from `src/ui/labels.ts`. Verify in
      `src/ui/saldo-import.test.ts` against "The step opens with what it found and the way on":
      23 entries with two підказки give the two-clause sentence, none give the «Дублів не видно»
      one, the counts equal what `mapSections` returns, and — per "Neither the grouping nor the
      counts move" — they are unchanged after a merge and after a dismissal.

## 4. The screen

- [x] 4.1 Redraw the accounts step of `src/app/manage/saldo-import.tsx` as compact rows: назва,
      валюта, вид, the one line of state from `AccountRow.state`, the «Приймає:» line from
      `receives`, and the row's actions «Об'єднати з…», «Вид» and — when merged — «Скасувати
      об'єднання». No `Choices` drawn at rest (spec "The account map is a compact list with one
      line of state per рахунок"; design D2). Verify by `npm run typecheck` and `npm run lint`, and
      by 4.6's structural assertions.
- [x] 4.2 Hold the one open editor in the screen as `{ key, editor: 'merge' | 'kind' | 'name' }` —
      the third being the existing rows offered to a proposed категорія or джерело, whose own `open`
      flag inside `NameRow` is removed — opening any one closing the others, and subscribe the
      screen to `useCloseOnBack` with "an editor is open" as its flag (design D3; spec "Opening one
      row's targets closes another's", "Opening a вид closes the open targets", "«Назад» closes an
      open вид before the step", "«Назад» closes the open targets before the step" and "«Назад»
      closes an open list of existing rows before the step"). Verify that `backGesture` is what
      decides —
      `src/ui/back-gesture.test.ts` already proves the rule; this task adds the caller, and 4.6 plus
      the emulator pass in §6 prove the wiring.
- [x] 4.3 Draw the merge selector on the open row: the label naming the entry, `SEPARATE_TARGET`
      drawn above the list unconditionally and marked as chosen while the entry is unmerged, the
      targets from `mergeTargets` below it, a `Field` narrowing **only those targets** through
      `narrow` when more than `PICKER_SIZE` of them are offered, `NOTHING_FOUND` for an empty
      search, `noTargetsMessage` when there is no candidate, and `COLLAPSE_LABEL` to close without
      choosing (design D6, D8; spec "Merge targets are offered only when the owner asks for them…").
      Verify by typecheck and lint; its decisions are the ones already proven in §2.
- [x] 4.4 Draw the підказка про дубль and its two actions on the rows that carry one, and the two
      sections with their headings and the opening line from `mapSummary` (design D9; spec "A
      підказка про дубль points out a pair that can only be one рахунок"). Taking «Об'єднати» SHALL
      call the same `redirectAccount` a selector pick calls; «Ні, окремо» SHALL call `dismissHint`.
      Verify by typecheck, lint and 4.6.
- [x] 4.5 Offer «Далі — звірка» under the opening line as well as after the last row, and give the
      «нові категорії та джерела» block the same search over its existing rows, opened under 4.2's
      one-editor rule rather than `NameRow`'s own flag (design D3, D8, D12; spec "The account map is
      a compact list…" and the modified "A proposed категорія or джерело can be redirected onto an
      existing row"). Verify by typecheck, lint and 4.6.
- [x] 4.6 Close the gate's blind spot over §4 with structural assertions in
      `src/ui/saldo-import.test.ts`, in the style `src/ui/entry-form.test.ts` already uses
      (`readFileSync` over the screen source): `src/app/manage/saldo-import.tsx` builds its rows
      through `accountRows`/`mapSections`/`mapSummary`, draws `KIND_CHOICES` and `mergeTargets`
      only inside an opened editor rather than unconditionally, holds one `open` editor for all
      three lists (no `open` flag left inside `NameRow`), and subscribes to `useCloseOnBack`
      (design D13). Verify with `npx vitest run src/ui/saldo-import.test.ts`.
      *Grown after review:* the delta spec's 44 scenarios each now have a test whose name quotes
      them (`.claude/rules/testing.md`), which took eight more structural assertions here and six
      more module tests. The screen builds its rows through `mapSections`/`mapSummary` — which
      return `accountRows` already grouped — rather than calling `accountRows` itself.
- [x] 4.7 Check the touch targets and the narrow screen against the spec's "Every decision of the
      account map is reachable with a thumb" — including taking and dismissing a підказка про дубль:
      every row action goes through `Action`/`RowAction`,
      which carry the app's `TouchTarget`; a long Saldo назва wraps rather than pushing the currency
      or the state off the row; nothing needs a horizontal gesture. Verify by reading the styles
      against `src/constants/theme.ts` and, at 375 dp, on the emulator in §6.
      *Correction to the first reading of this box:* `RowAction` does **not** carry `TouchTarget`;
      only `Action` does (48). `RowAction` is lineHeight 18 + 2×`Spacing.two` + 2×border ≈ 36 dp
      visible, reaching ~52 dp through `hitSlop={Spacing.two}`, and a `Chip` is 38 + the same
      hitSlop = 54. The requirement is met, by hitSlop rather than by minHeight. Review also found
      that two `RowAction`s `Spacing.two` apart have hit areas that meet in the gap — a mis-tap
      between «Об’єднати» and «Ні, окремо» would merge two рахунки — so `styles.actions` now uses
      `Spacing.three`.

## 5. Truth kept in step

- [x] 5.1 Add «підказка про дубль» to `docs/glossary.md` as a **[PROPOSED]** entry, in the words of
      design D9 — one sentence the Saldo імпорт states, an offer and never an act, naming only a
      рахунок the row could have been merged onto anyway, dismissal remembered for the import and
      stored nowhere. Verify that this change's own files use that one word and no synonym:
      `grep -rn "рекомендац\|resemblance\|suggestion" src/ui/saldo-import.ts
      src/ui/name-similarity.ts src/app/manage/saldo-import.tsx
      openspec/changes/saldo-import-compact-map/specs/` comes back empty (hard rule 7). Scoped
      deliberately: "suggestion" is ordinary English elsewhere in `src/`, «рекомендацію» is the AI
      prompt's own word in `src/analysis/prompt.ts` and its golden document, and design.md quotes
      the four rejected synonyms on purpose — none of those may be edited to make this check pass.
- [x] 5.2 Update `docs/app-overview.md` §4.8 to describe the compact map, the selector and the
      підказки про дублі, and note that `docs/screens/26-saldo-import-map.png` is retaken after the
      §6 smoke pass. Verify by reading §4.8 against the shipped screen.
- [x] 5.3 Re-point any existing assertion or comment that names the old always-drawn lists — check
      with `grep -rn "mergeTargets\|Об'єднати з" src/ docs/ openspec/specs/`. Re-point, never
      relax; verify with `npx vitest run src/ui`.

## 6. The emulator

- [x] 6.1 Run the smoke-runner subagent over this change's scenarios, on a device fed the owner's
      own export (23 entries) and, where a smaller map is needed, `.cache/android/saldo-slice.csv`
      (12 entries). At minimum: **(1)** an import with many рахунки — the accounts step opens with
      the summary line, the two sections and no chips anywhere, and «Далі — звірка» is reachable
      without scrolling the list; **(2)** merging two named рахунки — open one row's «Об'єднати
      з…», pick a target, and see both ends of the merge stated on their rows and one рахунок in
      the звірка; **(3)** cancelling a merge — through «Скасувати об'єднання» on the row and
      through «Створити окремий рахунок» inside the selector, each leaving two рахунки again;
      **(4)** searching for a target — type into the selector's field, see it narrow, see «Нічого
      не знайдено» for a miss, and confirm no рахунок of another currency is ever offered;
      **(5)** going on with no merge at all — straight from the opening line to the звірка, and the
      plan holding every entry as its own рахунок. Also press the hardware «назад» over an open
      selector (left-edge swipe — `.claude/rules/android.md` records that `keyevent 4` does not
      reach this app on the AVD), and look at the step at 375 dp. Fix what it finds and re-run
      `npm run verify` after every fix.
      **Ran, on a reused debug APK with current JS over Metro** (`scripts/android.sh up` reinstalled
      rather than rebuilt). 33 of the 44 scenarios seen and passing, including all five of the
      required ones, the left-edge «назад» over an open selector, and the step at 375 dp. Eight were
      not reachable on the device's data (no archived рахунок, no currency without a candidate, a
      plan proposing no категорії) and three of the editor-displacement scenarios were not run —
      all eleven are covered by the structural assertions of 4.6.

      Three defects found, all fixed here with a failing test first:
      1. «13 схожих на дублів» — «дубль» is the object of «на» and must stay «дублі» at every count
         above one; only the adjective declines. Hidden from the unit tests because 23 falls in the
         *few* bucket, and from the owner's export because its rest is never empty.
      2. The opening line promised «решту буде створено окремо» over a «Решта рахунків (0)». It now
         reads «Усі схожі на дублі — перевірте їх» when every row is in the first group.
      3. A heading over an empty group — «Решта рахунків (0)», and «Нові категорії та джерела» over
         a plan that proposes neither. Both are drawn only when they have rows.
      Re-confirmed on the device afterwards: «13 рахунків з Saldo. Усі схожі на дублі — перевірте
      їх.», no empty headings (`.cache/android/smoke/saldo-import-compact-map/96-map.png`,
      `97-map-bottom.png`).

      **A fourth report was investigated and rejected:** "every decision takes 30–60 s, cause is the
      `planSummary` memo". Measured against the owner's real export (27 entries, 2416 транзакцій) on
      an `existing` holding a full previous import: one tap is ~8 ms of engine and ~12 ms of the map
      functions. `planSummary` reads `state.plan`; it builds nothing. The machine was running two
      Claude sessions and repeated full test suites at the time. Not reproducible and not fixed —
      re-measure on an idle machine before treating it as real.
- [ ] 6.2 Retake `docs/screens/26-saldo-import-map.png` from the smoke pass and update the numbers
      in `docs/app-overview.md` §4.8 to what the screen now shows. Verify that the retaken shot is
      on the documented demo data, not on a fixture of unknown provenance.
- [x] 6.3 Run `npm run verify` and paste the final lines
      `✔ verify passed (a3da5824050cdc1bd8c4c1bef3176f86e490356d)` — 130 test files, 2331 tests.
- [x] 6.4 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
      Two rounds. Round one: FAIL, 2 CRITICAL — «Вид» was drawn on merged-away rows where
      `interpret` reads the *owner* entry's kind, so the control silently decided nothing (a
      regression against HEAD, which gated it); and 16 of the delta spec's 44 scenarios had no test
      whose name quoted them, against `.claude/rules/testing.md`. Both fixed, plus five of the six
      warnings. Round two: **PASS**, 0 critical, 3 warning — the screenshot of 6.2, the brittleness
      of exact-string structural assertions (the chosen method, left alone deliberately), and one
      over-broad assertion, since tightened.
