# ux-pass-2026-09-23 — tasks

Every behaviour task writes its failing test first. No box is ticked before `npm run verify` is
green on the tree that holds it.

## 1. Pure pieces under verify

- [x] 1.1 `dayLabel(date, now)` and `shiftIsoDate(iso, days)` and `dateStepOffers(value, now)` in
      `src/ui/dates.ts` (design D2, D4). Tests in `src/ui/dates.test.ts`: app-shell "Today and
      yesterday are named", "This year's day carries no year", "Another year's day carries its
      year"; main-screen "Yesterday in one tap", "A day back from the дата shown" (2026-09-01 →
      2026-08-31, plus 2026-01-01 → 2025-12-31), "Stepping stops at today"; an unparseable value
      offers only «Сьогодні» and «Вчора».
- [x] 1.2 `feedSubtitle(line, now)` reads the day label; `accountSideLine` (design D3) in
      `src/ui/transaction-line.ts`. Tests in `src/ui/transaction-line.test.ts`: accounts-screen
      "A переказ arriving at гаманець", "A переказ leaving гаманець", "A cross-currency переказ
      shows this рахунок's leg", "The рахунок's name is not repeated"; the existing feedSubtitle
      tests updated to day labels. Update every caller (typecheck).
- [x] 1.3 Статок in `src/ui/net-worth.ts` (design D7): `accountBasisLines` by kind,
      `changeLabel` with a decimal comma, `historyPointRows` collapsing unknown runs. Tests in
      `src/ui/net-worth.test.ts`: main-screen "A card is not «вкладено»", "The percent reads as
      Ukrainian", "Fifteen unknown month-ends read as one line"; a run broken by a known point is
      two ranges; a single unknown point reads as one date, not a range.
- [x] 1.4 `splitMoney` in `src/ui/amount-input.ts` and `sectorOpacity` in
      `src/ui/home-categories.ts` (design D6). Tests: `splitMoney` of 6868249 UAH is
      `{ number: '68 682,49', currency: 'UAH' }` and joins back to `formatMoney`'s output for
      negative and zero amounts; `sectorOpacity` is monotone non-increasing and defined for index
      0..10.

## 2. Shared drawing pieces

- [x] 2.1 `src/components/transaction-row.tsx` (design D1) and move Головний's feed, «Транзакції»,
      a рахунок's рухи (with `accountSideLine`) and a категорія's month onto it. Verify:
      typecheck, lint, and a source assertion in `src/ui/screens.test.ts` that none of the four
      screens draws `feedSubtitle(` inside its own JSX any more except through the row.
- [x] 2.2 `DateField` in `src/components/form.tsx` (design D4) used by `transaction/new.tsx` and
      `transaction/[id].tsx`. Verify: source assertion in
      `src/ui/entry-form.test.ts` that both screens render `DateField` and no `РРРР-ММ-ДД` field of
      their own.
- [x] 2.3 `ThemedSwitch` (design D10) replacing every `Switch` in `src/app`. Verify: the existing
      switch assertion in `src/ui/screens.test.ts` updated to require `ThemedSwitch` and forbid a
      bare `<Switch` under `src/app`.
- [x] 2.4 `Choices` `scroll` mode (design D8). Verify: typecheck; used by 4.1 and 5.1.

## 3. Головний and recording

- [x] 3.1 Donut centre bounded and split; legend swatches (design D6). Verify on the emulator
      (task 8.1): main-screen "A six-digit month fits", "Legend rows match their sectors".
- [x] 3.2 Confirmation above «Записати» (design D5). Verify: source-order assertion in
      `src/ui/entry-form.test.ts` for main-screen "The confirmation is seen where the button is".
- [x] 3.3 Статок widget draws `historyPointRows`, the kind-aware basis, full-width chart with its
      first/last dates. Verify: typecheck; emulator (8.1).

## 4. Рахунки and Транзакції

- [x] 4.1 «Транзакції»: search bar + three scrolling filter rows (design D8). Verify: emulator
      transaction-search "Thirty рахунки and twenty-four months".
- [x] 4.2 Рахунок рухи: «Звірити» collapsed behind one action, closing after a коригування or
      cancel, open with the text after a refusal or «already agree»; none for an archived рахунок.
      Verify: source assertion in `src/ui/screens.test.ts` that the фактичний залишок field is
      drawn only under the open state; emulator accounts-screen "The history follows the balance",
      "Звірити opens and closes", "A refused entry keeps the field open".
- [x] 4.3 «Усього грошей» one currency per line. Verify: emulator accounts-screen "Three
      currencies".

## 5. Звіти and Прогрес

- [x] 5.1 Category chooser as one scrolling row; empty цілі → «Створити ціль»; month strip snaps to
      a whole column (design D8, D10). Verify: emulator reports-screen scenarios.
- [x] 5.2 «Прогрес» earned rows in one list. Verify: emulator progress-screen "Seventeen earned
      досягнення".

## 6. Налаштування lists

- [x] 6.1 `manage-list.tsx`: list first, «Нова категорія»/«Нове джерело» opens the form, a row
      opens its editor with «В архів»/«З архіву», back closes the open form/editor (design D9).
      Verify: source assertion in `src/ui/screens.test.ts` that `manage-list.tsx` draws no
      «Перейменувати»/«В архів» `RowAction` outside the editor and wires `useCloseOnBack`;
      emulator settings-screen "Категорії opens on the list", "A row opens its editor", "A
      категорія is archived and brought back from its editor", "The back gesture closes an open
      create form".
- [x] 6.2 `limits.tsx` and `rules.tsx`: the row opens its editor; the verbs live in the editor.
      Verify: emulator settings-screen "A ліміт is set from its row", "A правило is deleted from its
      editor".

## 6b. Found during the smoke pass

- [x] 6.3 A field being typed into is never under the keyboard: `Screen` takes the keyboard's
      height out of its column (Android 15+ edge-to-edge no longer resizes the window). Verify:
      emulator — the ліміт field and the фактичний залишок field stay above the keyboard.
- [x] 6.4 The рахунок filter row on «Транзакції» leads with the рахунки in use
      (`accountFilterOrder`). Verify: `src/ui/transaction-search.test.ts` "The рахунки in use lead
      the row".
- [x] 6.5 An existing ліміт opens its editor filled in (`limitDraftFor`), the amount field
      focused. Verify: `src/ui/limits-section.test.ts` "An existing ліміт opens filled in".
- [x] 6.7 Review fixes: the дата keyboard is Android's phone pad (`numbers-and-punctuation` is
      iOS-only; device `inputType=0x3` confirmed); every multi-currency total keeps each сума
      whole (`wholeMoney` in `totalsLine`); `accountSideLine` reads its leg through
      `transactionEffect`; `legendSwatch` and `historySpanOf` are pure and tested. Verify:
      `account-totals.test.ts` "Three currencies of a total…", `home-categories.test.ts` "A negative
      category draws no swatch", `net-worth.test.ts` "The chart names its span",
      `entry-form.test.ts` "The дата is typed on a digit keyboard Android honours".
- [x] 6.6 A правило's editor opens inside its row and closes only once «Видалити» is confirmed.
      Verify: emulator settings-screen "A правило is deleted from its editor".

## 7. Documentation

- [x] 7.1 Check `docs/glossary.md` needs no new term (none is introduced); note the day-label rule
      in `.agents/skills/repo-code-navigation/references/modules.md` only if it lists
      `transaction-line.ts`' functions. Verify: `openspec validate --all`.

## 8. Device and gate

- [x] 8.1 Smoke on the emulator with the owner's restored бекап, light and dark, 100% and 130% font:
      every scenario of this change's delta specs, screenshots under `.cache/android/qa/` (`a*`, `b*`,
      `c*`, `d*` are after the fix; `vp360-*` on a 360 × 640 dp viewport).
- [x] 8.2 Run `npm run verify` and paste the final lines
      `Test Files 186 passed (186)` · `Tests 3765 passed (3765)` · `✔ verify passed`
- [x] 8.3 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
      First pass FAIL (4 critical), fixed (task 6.7); second pass PASS, 0 critical.
