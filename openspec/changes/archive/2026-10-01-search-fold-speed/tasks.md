## 1. One fold

- [x] 1.1 Add `src/domain/fold.ts` (`foldCase`, design D1) and `src/domain/fold.test.ts` with the
      scenarios "The fold agrees with Ukrainian casing on every character" (every code point),
      "Ukrainian letters fold as before" (Ґ/Ї/Є/І, final sigma) and "A phone set to Turkish still
      finds a Latin опис" (with the `tr` counter-check, design D4); verify with `npx vitest run src/domain/fold.test.ts`
- [x] 1.2 Add `src/ui/locale-case-usage.test.ts` (design D4: comments stripped, tests exempt) and
      see it fail naming today's seven calls in five files; it traces to "A phone set to Turkish
      still finds a Latin опис"; verify with `npx vitest run src/ui/locale-case-usage.test.ts`

## 2. The search

- [x] 2.1 `src/db/transactions-repo.ts`: `satisfies` folds only the опис with `foldCase`; the typed
      text is folded once in `searchMatches` (design D2). Add to `src/db/transactions-repo.test.ts`
      the scenario "Ukrainian letters fold as before" (опис «ҐАНОК ЇЖАК Єнот І», query
      «ґанок їжак єнот і») and keep every existing search test unedited and green; verify with
      `npx vitest run src/db/transactions-repo.test.ts src/ui/transaction-search.test.ts`
- [x] 2.2 Update `transactionsRepo.search`'s doc comment: the fold is `foldCase`, and the ceiling
      note points at this change's `measurements.md`; its rewritten comments do not contain the
      literal `toLocaleLowerCase(`; verify by reading the diff

## 3. The other folds

- [x] 3.1 `src/ui/labels.ts` `folded` over `foldCase` (design D3); verify with
      `npx vitest run src/ui/transaction-search.test.ts src/ui/labels.test.ts` (the case test for
      `folded` is "Letter case does not matter, the way Ukrainian folds it" in
      `src/ui/transaction-search.test.ts`)
- [x] 3.2 `src/domain/rules.ts` and `src/notifications/parse.ts` drop their local `fold` for
      `foldCase`, comments rewritten (design D3); verify with
      `npx vitest run src/domain/rules.test.ts src/notifications/parse.test.ts`
- [x] 3.3 `src/domain/fiscal-receipt.ts` `opysSaysSeller` uses `foldCase`; the comment in
      `src/analysis/details.ts` that names the search's fold is corrected; verify with
      `npx vitest run src/domain/fiscal-receipt.test.ts src/analysis/details.test.ts src/ui/locale-case-usage.test.ts`
      — the usage test now passes

## 4. On the device (design D5)

- [x] 4.1 Save the owner's database (`am force-stop`, `run-as … tar cf - files/SQLite`, three files
      listed), restore the synthetic бекап (`npx tsx scripts/make-big-backup.ts`) through
      Налаштування → Бекап once, and run the throwaway probe on the change, Metro restarted with
      `--clear` after each probe edit: «bolt» at 0.15 s and at 0.7 s between keys, two runs each,
      logging the JS-blocked time from the last keystroke, the step marks, and, per search, the
      match count and id hash under `foldCase` and under the old `toLocaleLowerCase('uk')` over the
      same candidate rows (design D5). Done when the two folds log the same count and hash, and the times are recorded against the design Goals
      (≤ 3 s at 0.15 s, ≤ 5 s at 0.7 s) in `openspec/changes/search-fold-speed/measurements.md`,
      a miss said plainly there
- [x] 4.2 In the run on the change, count on Hermes the code points where `toLowerCase()` differs
      from `toLocaleLowerCase('uk')`, and compare the context strings of design D1 (final sigma,
      İ, ß, «ҐАНОК ЇЖАК Єнот І»); record both in `measurements.md`. Expected 0 and all equal; any
      difference **stops the change**: nothing further is ticked and design D1 is revisited
- [x] 4.3 Remove the probe (`git status` shows none of it),
      restore the owner's database by pushing the tar to `/data/local/tmp` and extracting it with
      the device's tar, compare the three files byte for byte with the saved copy, delete the
      device-side tar and the synthetic бекап from `/sdcard/Download`, restart Metro with `--clear`,
      and see the owner's Головний
- [x] 4.4 Under app-speed-pass task 10.1 add a note pointing at this change's `measurements.md` for
      the search; do not tick 10.1, which stays open for the one-frame goal on tab switches

## 5. Close

- [x] 5.1 Run `npm run verify` and paste the final lines
      Test Files  205 passed (205) · Tests  4067 passed (4067) · ✔ verify passed (6f4077b3588f0c3c0411960628defcfea437fcde)
- [x] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
