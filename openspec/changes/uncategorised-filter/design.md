## Context

See proposal.md — Why. Today:

- `transactionsRepo.countUncategorised()` counts `type = 'expense' AND categoryId = UNCATEGORISED`;
  Головний's «Потребує уваги» is built from it.
- `transactionsRepo.search({ match?, accountId?, month?, limit, offset })` narrows in SQL and then
  filters the опис in TypeScript; `src/ui/transaction-search.ts` holds the pure decisions
  (`searchCriteria`, `monthFromRoute`, `showMore`, `emptyMessage`), `src/app/transactions.tsx` only
  wires them.
- `transactionLine(...).uncategorised` is `categoryId === UNCATEGORISED` for витрата and повернення
  alike — broader than the count, which is витрати only.
- The one-tap categorisation lives inline in `src/app/(tabs)/index.tsx`: a `RowAction` under the
  mark opens `Picker` over `expenseCategoryChoices(...)` minus «Без категорії», with recents from
  `recentlyUsed(latest, PICKER_SIZE + 1)`, and stores `recategorise(t, picked)`.

## Goals / Non-Goals

**Goals:** one predicate for «without a категорія» shared by the count and the narrowing; every new
decision (route value, title, «narrowed») testable under `verify`; the feed's one-tap flow reused,
not re-invented.

**Non-Goals:** extracting a shared React component for the categorising row (two call sites, and
`rules-everywhere` is about to add the offer dialog to one of them — extract when that lands);
changing `transactionLine.uncategorised`.

## Decisions

### D1. One SQL predicate, named once in the repository

A module-level `uncategorised` fragment
(`and(inArray(type, ['expense','refund']), eq(categoryId, UNCATEGORISED))`) is used by
`countUncategorised` and by `search({ uncategorised: true })`. The count's raw `sql` becomes the
builder form over the same fragment. The repo test proves the agreement directly: it stores a mix
and asserts `search({ uncategorised: true, limit: ∞ })` has exactly the ids `countUncategorised()`
counts, and that every one of them has `transactionLine(...).uncategorised === true`.

The повернення joins the count deliberately: `transactionLine` already marks it, and the glossary's
«Чистий місяць» already treats it as an open question. Keeping the count витрати-only would leave a
marked line that neither «Потребує уваги» nor the narrowing ever leads to. `categoryId` is NULL for
дохід, переказ and коригування, so the type guard is belt-and-braces, not a behaviour.

*Alternative:* filter `transactionLine(...).uncategorised` in TypeScript on the screen. Rejected —
paging is by offset in the repository, so a screen-side filter would page wrongly.

### D2. Route value `?only=uncategorised`, read by a pure `uncategorisedFromRoute`

Beside `monthFromRoute` in `src/ui/transaction-search.ts`: `uncategorisedFromRoute(asked)` is
`asked === 'uncategorised'`. Any other text, empty or absent is `false`. The screen seeds
`useState(uncategorisedFromRoute(params.only))`, exactly as it seeds the місяць — an initial value,
not a lock. Головний pushes `{ pathname: '/transactions', params: { only: 'uncategorised' } }`.

*Alternative:* `?category=<id>` generalised to any категорія. Rejected by the proposal's non-goal,
and it would invite a narrowing the spec does not define.

### D3. The chip is a `Choices` of two values

«Категорія: Всі / Без категорії» — the same control and shape as рахунок and місяць, so «visible
while in force» and «Показати все» work the same way. `clearNarrowing` resets it; `narrowed` includes
it, so `emptyMessage` says «Нічого не знайдено…» for an empty narrowed list with no change to
`emptyMessage` itself.

### D4. The title under the narrowing is a pure function

`searchLineTitle(line, uncategorisedOnly)` in `src/ui/transaction-search.ts`: the опис when the
narrowing is on and the line has one, otherwise `feedTitle(line)`. When it returns the опис, the
screen does not repeat the опис on the line below. Weight stays the title's (`ThemedText` default),
which is what "leads with" means on this screen; the separate small grey опис line is dropped for
that row only.

### D5. The one-tap flow is copied into `transactions.tsx`, the decisions stay shared

`categoryRows` = `expenseCategoryChoices(categories)` without «Без категорії», recents from
`recentlyUsed(transactionsRepo.listLatest(...), PICKER_SIZE + 1)` — the same inputs Головний uses,
so the short picker offers the same five. Storing is `transactionsRepo.save(recategorise(t, picked))`
then `evaluateProgress()`, the failure alert with `where: 'transaction-recategorise'`, then the
screen's reload. The reload re-runs `showMore` over the pages asked for, so a categorised line
leaves the narrowed list and the rest keep their order (they are re-read in the same `ORDER BY`).
`useCloseOnBack` closes the full list before «назад» leaves the screen, as on Головний.

*Alternative:* extract a `<CategoriseRow>` component now. Deferred (see Non-Goals): `rules-everywhere`
task 4.4 rewrites the Головний side to raise its offer after the pick; extracting first would make
that change's diff conflict with this one.

## Risks / Trade-offs

- [Two copies of the one-tap wiring drift apart] → the decisions (choices, recents, `recategorise`)
  are shared functions already tested; the copy is wiring only. `rules-everywhere`'s offer must be
  raised from both sites — recorded as its task 4.6.
- [Reloading all asked-for pages after each pick is O(pages × page size)] → the narrowed list is
  the uncategorised pile, hundreds at most; the full-history case is unchanged from today's focus
  reload.
- [Merge overlap with `rules-everywhere` in `(tabs)/index.tsx`] → this change touches only the
  attention row's `router.push` there.
