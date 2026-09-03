## Why

Recording a витрата means walking past every рахунок and every категорія the owner has ever had.
On the owner's own data — the Saldo імпорт brought in 27 рахунки (BACKLOG), plus the «Борги»
рахунок it creates per currency, and the starter set seeds 27 pickable категорії — the «Нова
транзакція» form draws **over sixty chips** before the «Записати» button: 4 for the type, one per
рахунок, 5 «Нещодавні» and 27 for the категорія. A переказ draws the рахунок list twice. The
categorising picker on Головний draws 26 in the middle of a feed row.

The owner records on three or four рахунки and reaches for a handful of категорії. Everything else
is a wall to scroll past on the app's most frequent write action, and it pushes «Записати» below
the fold. The list is not information — it is furniture.

This serves the first product question, "where did the money go": a витрата that is annoying to
record is a витрата that does not get recorded, and an uncategorised one is a hole in the answer.

## What Changes

- Every picker on the recording path — **рахунок** (both legs of a переказ), **категорія**,
  **джерело** — shows at most **five** choices instead of the whole list. Fewer than five exist:
  it shows them all, exactly as today.
- When there are more, one offer stands beside the short list: **«Всі рахунки (28)»**, **«Всі
  категорії (27)»**, **«Всі джерела (14)»** — naming how many there are, so the owner knows what
  is behind it. Taking it swaps the short list for the full one **with a search field**; picking
  anything collapses back with that choice made and now standing in the short list. The phone's
  «назад» closes the expansion before it leaves the screen.
- The short list is what the owner reached for last — the рахунки and категорії of the most recent
  транзакції, most recently used first — topped up from the head of the full list so it is never
  short of five while five exist, and it always holds whatever is currently chosen, including an
  archived рахунок a stored транзакція already sits on. It does **not** reorder while the owner
  picks, so nothing moves under the finger.
- The «Нещодавні» row and the full-list row below it — today two pickers for one question — become
  **one** row. The label stays the question's: «Рахунок», «Категорія», «Джерело».
- The same short list serves editing a stored транзакція (`transaction/[id]`), which today offers
  no recents at all and draws every рахунок and all 27 категорії, and Головний's one-tap
  categorising of a «Без категорії» витрата.
- Consequence, not a separate feature: a витрата's form drops from over sixty chips to **at most
  eighteen**, so «Записати» is on the first screenful without a sticky button.

Non-goals, deliberately:

- **No new stored state, no schema change, no migration.** Recency is read off the стрічка the
  screen already loads. Nothing is counted, ranked or persisted — the app learns nothing about the
  owner it cannot show them (the rule `main-screen` already set for категорії).
- **The pickers outside the recording path are not converted here**: «Категорія» on Звіти,
  «Рахунок» on Транзакції, and the ones on Правила, Ліміти, Цілі, monobank and Saldo імпорт. The
  short list is built as a shared piece so each is a small follow-up, but each belongs to another
  capability and would drag its own spec in. design.md §D10 lists all of them with their sizes.
- **No sticky «Записати»**, no swipe actions, no accessibility rework of the chips, no date
  pickers. Those are separate BACKLOG items and each is a change of its own.
- **No change to what may be picked.** Archived рахунки, archived категорії, «Коригування» and
  «Без джерела» are offered exactly as much as today — which is not at all. This change decides
  how many of the offered rows are drawn, never which rows are offered.

## Capabilities

### New Capabilities

None. Every rule this change touches already lives in `main-screen`: what the recording form
offers, what editing offers, and how a «Без категорії» витрата is categorised from the feed. What
may be picked at all stays where it is — `accounts` for archived рахунки, `categories` for
archived rows and the app-only ones — and none of it changes.

### Modified Capabilities

- `main-screen`: the picker rule itself. The requirement "Recently used категорії and джерела are
  offered ahead of the full list" is replaced — the full list is no longer drawn beside the recent
  ones — by three: how many choices a picker shows and how the rest are reached, what the short
  list holds and in what order, and what the expanded list does. "A manual expense needs only
  amount and account" is amended so that "any unarchived category" names both what the picker
  shows and what stands behind «Всі категорії». "«Без категорії» is highlighted and categorised in
  one tap" is amended so the feed's picker is the same short list, and the one tap is still one
  tap for a категорія the owner has been using.

## Impact

- `src/ui/shortlist.ts` — new pure module, generic over `{ id, name }` rows: what the short list
  holds, in what order, whether an «Всі …» offer is shown and what it says, and what a typed search
  narrows the full list to. Every decision on this change is provable here, because `verify` never
  runs JSX.
- `src/ui/category-choices.ts` — `recentlyUsed` gains the рахунки of the стрічка beside the
  категорії and джерела it already collects; `recentRows` moves out to `shortlist.ts`, whose
  `shortlist` becomes its only caller.
- `src/ui/labels.ts` — the Ukrainian case fold (`toLocaleLowerCase('uk')`) moves here from
  `src/ui/transaction-search.ts`, so the search in a picker and the search on «Транзакції» fold
  the same way. No behaviour change to either.
- `src/components/form.tsx` — the picker gains its collapsed/expanded shape: the short list, the
  «Всі …» offer, the search field, «Згорнути». `Choices` itself keeps its current shape and its
  current callers; the new one is built on it.
- `src/app/transaction/new.tsx` — the «Нещодавні» and full-list pairs collapse into one picker per
  question; the рахунок pickers get the same treatment.
- `src/app/transaction/[id].tsx` — the same, on a screen that has no recents today.
- `src/app/(tabs)/index.tsx` — the inline categorising picker becomes the short list plus «Всі
  категорії».
- `src/hooks/use-close-on-back.ts` — used, unchanged, so the hardware «назад» closes an expanded
  picker before leaving the screen.
- `src/ui/account-choices.ts` — `accountChoicesFor` sorts its offers in Ukrainian order, which
  storage's own `ORDER BY name` does not (SQLite's BINARY collation files every Cyrillic назва
  after every Latin one). The emulator found it; this change is what promises that order. It has a
  second caller outside the recording path — the рахунок picker on «Сповіщення банків»
  (`src/app/manage/notifications.tsx`) — whose order therefore changes too. It draws no shortlist
  and its capability keeps every requirement it has; the рахунки in it are simply now in the same
  order as everywhere else, which is why this is named here rather than specified there.
- `docs/app-overview.md` §3 and its screenshots of the entry form — restated after the smoke pass.
- **In flight, same files:** `home-daily-overview` (17/20) owns `src/app/(tabs)/index.tsx` and
  `src/app/transaction/new.tsx` and has only its smoke tasks left; `fiscal-receipts` (25/30)
  touches `src/app/transaction/[id].tsx`. This change must be implemented after those merge, or in
  a lane rebased on them — it edits the screens they are still moving.
- Unchanged on purpose: `src/domain/**`, `src/db/**`, `drizzle/`, `src/ui/entry-form.ts` (what a
  filled form stores is not touched), `app.json`, `modules/`.
