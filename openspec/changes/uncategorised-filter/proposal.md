## Why

Owner's bug report, 2026-09-14: Головний's «Потребує уваги» says «N без категорії · Переглянути»,
and «Переглянути» opens «Транзакції» on the whole history. The owner goes there to categorise the
витрати that answer «куди пішли гроші» with «Без категорії» — and has to find them among hundreds of
already categorised ones. «Транзакції» cannot even be narrowed to them: it narrows by рахунок and
місяць only, and a search for «без» finds the категорія by name only by accident.

This serves the vision's first question directly: every витрата left in «Без категорії» is money
whose destination the Місяць cannot name.

## What Changes

- «Транзакції» gains a third narrowing, **«Без категорії»**, beside рахунок and місяць: on, it shows
  only the транзакції Головний counts as without a категорія — the same predicate, so the number on
  Головний and the length of the list can never disagree. It combines with the search, the рахунок
  and the місяць like the other narrowings, and «Показати все» clears it with them.
- «Транзакції» can be opened with that narrowing already on, as an initial value and not a lock —
  the same shape the `?month=` narrowing has today.
- «Потребує уваги»'s «Переглянути» on the uncategorised row opens «Транзакції» that way.
- While the narrowing is on, each line leads with its опис — the bank's own text, in the line's
  title weight — instead of the категорія name every line in that list shares, so the owner reads
  «СІЛЬПО Київ», «Uklon», «Rozetka» and knows what to pick. A line with no опис keeps its usual title.
- A line in «Без категорії» on «Транзакції» carries the same one-tap categorisation the feed on
  Головний already offers: the mark opens the short picker, a pick stores the категорія without
  opening editing. With the narrowing on, the categorised line leaves the list at once.

Non-goals, deliberately:

- No suggestion of which категорія to pick, no classifier, no rule offer. Правила reaching the entry
  form and the offer to remember a pick are `rules-everywhere`; the built-in шаблон is
  `rule-template`; a local classifier proposing a категорія is a later change of its own.
- No bulk «categorise all these as …». One tap per line, as on Головний.
- No new narrowing by an arbitrary категорія. «Без категорії» is a narrowing because it is the
  question the app asks the owner; any other категорія is already found by searching its name.
- No «Без джерела» narrowing: a дохід without a джерело is not what «Потребує уваги» leads to.
- One correction to what Головний counts, so count, list and mark agree: a повернення carrying «Без
  категорії» (older data only — the form and retype refuse it) is counted and listed like a
  витрата. The feed already marks it, and the glossary's «Чистий місяць» already treats it as an
  open question; today «Потребує уваги» silently leaves it out.
- The offer to remember a pick as a правило is not raised from «Транзакції» here; `rules-everywhere`
  gains that call site (its task 4.6).
- Nothing from vision §14 is touched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transaction-search`: adds the «Без категорії» narrowing and opening already narrowed to it; the
  line leads with the опис under that narrowing; the one-tap categorisation of a «Без категорії»
  line is offered on «Транзакції», which until now changed nothing of its own.
- `main-screen`: the uncategorised row of «Потребує уваги» opens «Транзакції» narrowed to «Без
  категорії» instead of on the whole history.

## Impact

- `src/db/transactions-repo.ts` — `search` takes an `uncategorised` narrowing built on the very
  predicate `countUncategorised` uses; tests in `transactions-repo.test.ts`.
- `src/ui/transaction-search.ts` — reading the narrowing from the route, the empty-state's
  «narrowed», and the line title under the narrowing; tests beside it.
- `src/app/transactions.tsx` — the chip, the route parameter, the title, the one-tap picker.
- `src/app/(tabs)/index.tsx` — the attention row's destination only. `rules-everywhere` edits the
  same file around the feed's mark (tasks 4.4); the two touch different lines.
- `src/ui/home-screen.test.ts` — the test that pins the attention row's destination changes with it.
- Archive order: `home-daily-overview` defines «Потребує уваги» and must be archived before this
  change, whose `main-screen` delta refers to that section.
- No migration, no backup format change, no new dependency.
