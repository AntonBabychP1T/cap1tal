# saldo-import-merge — tasks

## 1. One definition of a name match

- [x] 1.1 ~~Move `nameEvidence`, its normalisation and its strength order out of
      `src/monobank/link.ts` into `src/domain/name-match.ts`~~ — **this task describes a move that
      never happened, and the box is ticked for what actually did.** `src/domain/name-match.ts` was
      not moved out of `src/monobank/link.ts`: it was written new, in `4d5254c`, alongside
      `suggestLinks` — `git show 4d5254c^:src/monobank/link.ts` holds no `nameEvidence` and
      `git log -S nameEvidence -- src/monobank/link.ts` returns only the commit that *adds* the
      import. The second half — "update `src/ui/monobank-screen.ts` … to read it from there" — did
      not happen either; that file never imports `src/domain/name-match`, only `src/ui/labels.ts`
      does, for the type. What stands is one definition of a name match in `src/domain/name-match.ts`
      with `src/domain/name-match.test.ts` covering one case per signal, the below-the-floor word,
      the differing digit tails and the empty name, read by `src/monobank/link.ts`. Left ticked and
      corrected rather than re-opened: there is no work left to do, only a record to keep honest.

## 2. The screen

- [x] 2.1 In `src/app/manage/saldo-import.tsx` replace the tap-a-second-card merge mode with a
      list of targets on the entry's own row (D2), keeping «Скасувати об'єднання» and the
      existing-рахунок path exactly as they behave — requirement "The owner confirms the account
      map before the plan is built" scenario "The targets are offered on the row".

- [x] 2.2 That list was built inside the `.tsx`, where `verify` never runs it, so the one scenario
      this change adds had no test: which entries are offered, that an entry already merging away
      is not, that an archived рахунок is not, and that the currency rides every label were held by
      review alone. `mergeTargets` and its decoder `targetOf` now live in `src/ui/saldo-import.ts`
      and the screen only calls them, with
      `src/ui/saldo-import.test.ts` «Scenario: The targets are offered on the row» asserting all
      four over two entries, an already-merged third, and one archived plus one unarchived existing
      рахунок. The entry half of the label also stopped hand-rolling `` `${name} · ${currency}` ``
      and calls `accountChoiceLabel`, which the existing-рахунок half of the same list already
      used — one format, so one picker cannot drift down its middle.

## 3. Verification

- [x] 3.1 Run `npm run verify` and paste the final lines —
      `Test Files 89 passed (89) / Tests 1407 passed (1407)`,
      `✔ verify passed (66ad4fc4b0eef3dae9726ae5606b48ef1ab3e394)`
      (was `59 / 939` at `6deb9319…`, a tree older than task 2.2's own code — the evidence a
      verification task quotes has to cover the work it verifies.)
- [x] 3.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS — first pass FAIL on
      one CRITICAL (the added scenario had no test, the list living in the `.tsx`), closed by task
      2.2; re-review **PASS (0 critical, 1 warning)** on
      `✔ verify passed (66ad4fc4b0eef3dae9726ae5606b48ef1ab3e394)`.

## 5. Emulator smoke (2026-09-01)

- [x] 5.1 The real export driven through the map step on the Pixel_10_Pro, screenshots in
      `.cache/android/smoke/`:
      - «Об'єднати з» stands on the entry's own row, every candidate named with its currency, the
        other entries first and the owner's own рахунки last as «Kartka · UAH — наявний» /
        «Podushka · UAH — наявний»; the row itself is never among them (`67-accounts-map.png`);
      - merging «mono black» onto «mono white» leaves «→ mono white» plus «Скасувати об'єднання»,
        and «mono white»'s own list stops offering the entry that is merging away — the rule the
        new test asserts, seen on the device (`68-merged.png`);
      - there is no mode to be in and no second card to hunt for: one tap, on the row.
      No defects.

## 4. Withdrawn

- [x] 4.1 The merge *proposals* — `mergeSuggestions`, `applyMerges` and the «Схоже на дублі»
      block — were built, tried on the owner's real export, and withdrawn there: every proposal
      they made was wrong (D3). `saldo-import-simple-debts` removed the code and the two ADDED
      requirements that described it, so nothing about a proposal reaches the main specs.
