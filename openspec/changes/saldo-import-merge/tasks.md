# saldo-import-merge — tasks

## 1. One definition of a name match

- [x] 1.1 Move `nameEvidence`, its normalisation and its strength order out of
      `src/monobank/link.ts` into `src/domain/name-match.ts` as `NameEvidence` (D1), with
      `src/domain/name-match.test.ts` carrying over every existing case — one per signal, the
      below-the-floor word, the differing digit tails and the empty name — and update
      `src/monobank/link.ts`, `src/ui/monobank-screen.ts` and their tests to read it from there;
      `npm run verify` proves the monobank proposals are unchanged by the move.

## 2. Proposing the merges

- [x] 2.1 In `src/ui/saldo-import.ts`, add `mergeSuggestions(state)` returning one proposal per
      map entry — onto another entry of the same currency or onto an existing unarchived рахунок
      of the same currency, existing рахунок preferred, ties proposing nothing, no chains and no
      cross-currency target (D2, D3); verify with `src/ui/saldo-import.test.ts` covering
      requirement "The flow proposes which map entries are the same рахунок" scenarios "Two
      spellings of one card are proposed as one рахунок", "A рахунок the owner already keeps wins
      over another entry", "An equal match proposes nothing", "Nothing is proposed across
      currencies" and "Proposals never chain".
- [x] 2.2 Add `applyMerges(state, merges)` writing every accepted redirect in one transition so
      the engine runs once over the finished map (D4); verify with `saldo-import.test.ts`
      covering requirement "The proposed merges are accepted or refused by the owner" scenarios
      "Accepting the set merges every proposal at once", "A refused proposal is not applied" and
      "An accepted merge can be undone" (undone through the existing `redirectAccount`), plus
      that accepting a set leaves the same state as applying the same merges one at a time.
- [x] 2.3 Prove nothing is written by proposing or accepting: the scenario "Nothing is written by
      proposing or accepting" expressed as `mergeSuggestions` and `applyMerges` touching no
      repository — assert in `saldo-import.test.ts` that the flow's `existing` state is unchanged
      and list the module's imports in the completion note.

## 3. The screen

- [x] 3.1 In `src/app/manage/saldo-import.tsx`, add the proposals block at the top of the
      «Рахунки» step: one line per proposal naming the entry, its target and the reason, a way to
      refuse a single proposal, and one action accepting the rest — requirement "The proposed
      merges are accepted or refused by the owner".
- [x] 3.2 Replace the tap-a-second-card merge mode with a list of targets on the entry's own row
      (D5), keeping «Скасувати об'єднання» and the existing-рахунок path exactly as they behave —
      requirement "The owner confirms the account map before the plan is built" scenario "The
      targets are offered on the row".

## 4. Verification

- [x] 4.1 Run `npm run verify` and paste the final lines —
      `Test Files 59 passed (59) / Tests 939 passed (939)`,
      `✔ verify passed (6deb931950301d68c57582a858cdf68c8e770e71)`
- [ ] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
