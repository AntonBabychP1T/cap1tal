## 1. The rule, in pure TypeScript

- [x] 1.1 Move the Ukrainian case fold out of `src/ui/transaction-search.ts` into `src/ui/labels.ts`
      as an exported `folded(value)` (design D6) and have `transaction-search.ts` import it; verify
      `npx vitest run src/ui/transaction-search.test.ts src/ui/labels.test.ts` still passes
      unchanged — this is a move, so no test changes.
- [x] 1.2 Add `accounts` to `recentlyUsed` in `src/ui/category-choices.ts`: a витрата, дохід,
      повернення and коригування contribute their `accountId`, a переказ contributes
      `fromAccountId` then `toAccountId`, each id at most once, and the early exit waits for all
      three lists (design D8). Verify in `src/ui/category-choices.test.ts` with a test proving
      "The рахунки with recent movement are the ones shown" — a стрічка of a витрата on «гаманець»
      then a переказ «mono біла» → «Банка на відпустку» yields those three ids in that order.
- [x] 1.3 Create `src/ui/shortlist.ts` with `shortlist(offered, { recentIds, chosenId, size })`,
      generic over `{ id, name }` (design D1, D3): recents resolved against `offered`, topped up
      from the head of `offered`, capped at `size`, then `chosenId` appended if absent. Verify in a
      new `src/ui/shortlist.test.ts` covering the spec's "The short list is what was reached for
      last, and always holds what is chosen" — the last used категорія first, the top-up on a
      fresh device, the chosen row appended and never re-ordered, and an id in `recentIds` that is
      not in `offered` (an archived категорія) contributing nothing.
- [x] 1.4 Add `allOffer(offered, size, noun)` to `src/ui/shortlist.ts`: `undefined` when
      `offered.length <= size`, otherwise the label «Всі <рахунки|категорії|джерела> (N)» with N
      the full count (design D7). Verify in `src/ui/shortlist.test.ts` against the spec's "A picker
      shows at most a few choices and names what is behind the rest" — three рахунки give no
      offer, twenty-seven give one naming twenty-seven.
- [x] 1.5 Add `narrow(offered, query)` to `src/ui/shortlist.ts` — substring match anywhere in the
      name using `folded` from 1.1, an empty query narrowing nothing — plus the «Нічого не
      знайдено» message for an empty result (design D6, D7). Verify in `src/ui/shortlist.test.ts`
      against "The full list is searched by name" and "A search that matches nothing says so",
      including a Ukrainian query in the wrong letter case.

## 2. The picker on screen

- [x] 2.1 Add the collapsed/expanded picker to `src/components/form.tsx`, built on the existing
      `Choices`, whose own shape and every one of its other callers stay untouched: the short list, the «Всі
      …» offer, and — expanded — a search `Field`, the narrowed full list, the empty-search line
      and «Згорнути» (design D5, D7). Verify by typecheck and lint (`npm run typecheck`,
      `npm run lint`); its decisions are the ones already proven in §1.
- [x] 2.2 Wire `src/app/transaction/new.tsx`: one picker per question for Рахунок, Звідки, Куди,
      Категорія and Джерело, the «Нещодавні» rows deleted, `RECENT_SIZE` reused as the shortlist
      size (design D2, D9). Verify by reading the screen against the spec's "Both legs of a
      переказ are shortened" — each leg gets its own picker with its own offer and its own expanded
      state.
- [x] 2.3 Wire `src/app/transaction/[id].tsx`: the same five pickers over the per-leg
      `accountChoicesFor` / `categoryChoicesFor` / `sourceChoicesFor` lists, plus the one
      `listLatest` read this screen does not make today so it has recents at all (design D9).
      Verify against the spec's "Editing a stored транзакція offers the same short pickers" and
      "An archived рахунок a stored транзакція sits on stays visible".
- [x] 2.4 Wire the inline categorising picker in `src/app/(tabs)/index.tsx` over the offered list
      it already builds (`expenseCategoryChoices` minus «Без категорії»), so the feed's picker is
      the short list plus «Всі категорії» (design D9), with its own bounded recents read — the
      стрічка above it is five lines, too few to learn from. Verify against the spec's "The feed's
      picker is short too" and "A категорія behind the offer still categorises in the feed".
- [x] 2.5 Subscribe all three screens to `useCloseOnBack` with "a full list is open" as the
      editor-open flag, closing that list and keeping the screen (design D5). Verify that
      `backGesture` is what decides — `src/ui/back-gesture.test.ts` already proves the rule; this
      task only adds the callers, and 2.6 plus the emulator pass in §5 prove the wiring.
- [x] 2.6 Close the gate's blind spot over §2, which is otherwise proven only on the emulator: add
      structural assertions to `src/ui/shortlist.test.ts` in the style
      `src/ui/entry-form.test.ts` already uses (`readFileSync` over the screen source), proving
      that `src/app/transaction/new.tsx`, `src/app/transaction/[id].tsx` and
      `src/app/(tabs)/index.tsx` each build their pickers through `shortlist`/`allOffer` rather
      than handing a full list to `Choices`, that no «Нещодавні» row survives, and that all three
      subscribe to `useCloseOnBack`. Verify with
      `npx vitest run src/ui/shortlist.test.ts`.

## 3. Truth kept in step

- [x] 3.1 Re-point any structural assertion that names the deleted «Нещодавні» rows — check
      `src/ui/entry-form.test.ts`, `src/ui/home-screen.test.ts` and
      `src/ui/category-choices.test.ts` with `grep -rn "Нещодавні" src/`. Re-point, never relax;
      verify with `npx vitest run src/ui`. **Found:** no test asserted on the row at all — only two
      prose comments named it. So nothing was re-pointed and nothing relaxed; instead 2.6 gained a
      standing assertion that the row does not come back, which is the coverage this task was
      asking for.
- [x] 3.2 Update `docs/app-overview.md` §3 where it describes the entry form's picker rows, and
      note that its screenshots of `03-main-entry.png`, `14-transactions.png` and
      `15-transaction-edit.png` are restated after the §5 smoke pass. Verify by reading §3 against
      the shipped screens.

## 4. The gate

- [x] 4.1 Run `npm run verify` and paste the final lines
- [x] 4.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

## 5. The emulator

- [x] 5.1 Run the smoke-runner subagent over this change's scenarios on a device carrying enough
      рахунки and категорії to trigger the offer: the recording form for a витрата, a переказ (both
      legs), a дохід and a повернення; the offer opened, searched, picked from and «Згорнути»-d;
      the hardware «назад» over an open list; editing a stored транзакція including one on an
      archived рахунок; and categorising a «Без категорії» line from Головний both from the short
      list and through the offer. Fix what it finds and re-run `npm run verify` after every fix.
      **Result:** 21 scenarios pass. One defect, fixed under a failing test first: the рахунок
      picker was showing SQLite's BINARY sort, so every Cyrillic назва fell after every Latin one
      while the категорії beside it were in real uk collation — one form, two alphabets, against
      this change's own promise of "рахунки and джерела by name in Ukrainian order"
      (`src/ui/account-choices.ts` now sorts with `byName`, before `withCurrent` so the carried row
      is still appended). Eight scenarios were **not reachable** on the device and remain proven by
      unit tests alone: the five needing a fixture the device does not have (a 3-рахунок device, a
      fresh device ×2, an archived категорія, an archived рахунок) — `reset` would have destroyed
      the 26-рахунок data on it — a Ukrainian-letter-case search (`adb shell input text` is
      ASCII-only and this image has no `cmd clipboard`), and two paths through the offer that were
      opened but not picked from. Three observations outside every requirement are recorded in
      design.md's Risks rather than fixed.
- [ ] 5.2 Retake `docs/screens/03-main-entry.png` and `15-transaction-edit.png` from the smoke
      pass and update the numbers in `docs/app-overview.md` §3 to what the screens now show.
      **Left for the owner, deliberately.** The smoke's screenshots show the change working
      (`.cache/android/smoke/shortlist-pickers/05-new-tx.png`, `11-edit-short-pickers.png`) but
      they may not be committed as they are: `docs/app-overview.md` states its screenshots are
      Pixel 10 Pro on the synthetic 82-транзакція Saldo demo, while these are an
      `sdk_gphone16k_arm64` AVD carrying a 26-рахунок fixture of unknown provenance. Committing
      them would put account names of unverified origin into a tracked document and make the
      document's own provenance note false. The prose of §3.2 is already updated and correct; the
      images need one run on the documented demo data, which is the owner's call.
- [x] 5.3 Run `npm run verify` and paste the final lines
- [x] 5.4 Run the diff-reviewer subagent over the whole diff; fix CRITICAL findings until PASS.
      **Three passes.** The first found the `Picker` component itself unproven under `verify` and
      nine lesser gaps; the second, after the emulator, found the Ukrainian-order fix had landed on
      the editing screen and missed the recording form — the screen this change is about — so the
      two forms would have topped up their рахунок pickers from two different heads. Both are
      fixed and guarded by tests that were checked to fail on the old code.
