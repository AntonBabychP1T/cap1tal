## Why

On a 10 000-транзакція history a search on «Транзакції» blocks the JS thread for 18–20 s per
search on the Android emulator, and slow typing searches twice, so 38–49 s go by after the last key
(app-speed-pass `baseline.md`, "Not met"). That is the one screen that answers «куди пішли гроші»
once the history is longer than a screen, and at that size it answers nothing.

The cost is now located (probe on 2026-09-30, synthetic бекап, debug build, two runs):

| Step of one «bolt» search | Run 1 | Run 2 |
|---|---|---|
| JS thread blocked | 17.9 s | 19.7 s / 19.8 s (two searches) |
| SQL read (8 888 candidate rows) | 0.26 s | 0.25 s / 0.57 s |
| rows → транзакції (`withAwaiting`) | 0.01 s | 0.01 s / 0.02 s |
| **`filter(satisfies)` — the text match** | **16.1 s** | **16.3 s / 18.5 s** |
| `sealed` deep-freeze | 0.004 s | 0.02 s / 0.02 s |
| `transactionLine`, limit marks | < 0.02 s | < 0.02 s |
| screen render → effect | 0.66 s | 0.74 s / 0.74 s |

and the reason inside the match, from a microbenchmark in the same process:

| 2 000 calls on Hermes (Android) | ms |
|---|---|
| `'Аптека Доброго Дня'.toLocaleLowerCase('uk')` | 868 / 934 |
| `'Bolt'.toLocaleLowerCase('uk')` | 768 |
| `.toLocaleLowerCase()` (no locale) | 4.7 / 5.2 |
| `.toLowerCase()` | 2.1 / 3.0 |
| `.localeCompare('Аптека', 'uk')` | 792 |

`toLocaleLowerCase('uk')` costs ~0.4 ms a call on Hermes whatever the string — about 300× the
plain fold — and `satisfies` calls it twice per candidate row. The same process in Node takes
~15 ms for the whole search. The fold buys nothing for this data: Unicode tailors case only for
Lithuanian, Turkish and Azeri, so the `uk` mapping and the default one agree on every character.

## What Changes

- One case fold for the whole app: Unicode's default lower-case mapping, with no locale
  (`toLowerCase()`), in one domain helper. It replaces the seven calls that pass `'uk'`, in five files:
  the search match in `transactions-repo.ts`, `folded` in `src/ui/labels.ts` (picker search and the
  категорія/джерело names a search matches), `fold` in `src/domain/rules.ts` (правила — the same
  cost runs per transaction × per rule on every import and sync), `fold` in
  `src/notifications/parse.ts`, and the seller check in `src/domain/fiscal-receipt.ts`.
- The search folds the typed text once per search, not once per candidate row.
- A usage test under `verify` refuses a `toLocaleLowerCase(` / `toLocaleUpperCase(` call anywhere
  in `src/` code outside tests (comments are not code), so the cost cannot come back one call site at a time.
- A test proves the new fold equals the `uk` one for every code point outside the surrogate range, in Node, so the swap is
  shown to change no match.
- `analysis/details.ts`'s comment that names `toLocaleLowerCase('uk')` as the search's fold is
  brought up to date; `foldMerchant` itself is unchanged.

Scope: the fold, and a device measurement of the search that is linked from app-speed-pass task
10.1 as a note (10.1 stays open for its other reason, the one-frame goal on tab switches). Non-goals:
- `localeCompare(…, 'uk')` costs the same 0.4 ms a call (measured above). It sorts short name lists
  (рахунки, категорії, monobank accounts), not the history; it is a separate change if it shows up.
- The SQL half stays as it is: every row with an опис is still a candidate (8 888 of 10 000). A
  lowercase shadow column or an SQL pre-filter is the next step only if the remaining ~1 s is not
  acceptable.
- The render (0.5–0.7 s in a dev build) and dev-build overhead in general.
- No vision §14 item is touched.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `transaction-search`: adds "Letter case is folded one way, whatever the phone's language" — one
  mapping, no language setting, agreeing with Ukrainian casing on every character. What a search
  matches is unchanged. The speed itself is a device measurement, not a spec: its target lives in
  design.md Goals and its numbers in `measurements.md`, as app-speed-pass keeps its own targets.

No other capability gets a delta. The правила (`categorisation-rules`), bank-notification parsing,
the фіскальний чек seller check and the pickers use the same fold after this change, but each
already promises only "case-insensitively", and what each matches is unchanged.

How "unchanged" is proven: in Node both `toLowerCase()` and `toLocaleLowerCase('uk')` run through
the same in-process ICU, so the existing tests pass before and after by construction and prove
nothing about the phone. The proof is two-part: the full-range test under `verify` (the default
mapping equals the `uk` one on every code point outside the surrogate range, in ICU), and the device check in tasks 4.1–4.2
(Hermes's own `toLowerCase()` against its `uk` mapping, over every code point and the context
strings, and «bolt» finding the same транзакції before and after).

## Impact

- Code: new `src/domain/fold.ts` (+ test); `src/db/transactions-repo.ts` (`satisfies`, `searchMatches`),
  `src/ui/labels.ts`, `src/domain/rules.ts`, `src/notifications/parse.ts`,
  `src/domain/fiscal-receipt.ts`, the comment in `src/analysis/details.ts`; a usage test beside
  `src/ui/stored-history-usage.test.ts`.
- No schema change, no migration, no new dependency, no native change.
- Device: one emulator measurement with the synthetic бекап (`scripts/make-big-backup.ts`), the
  owner's database saved first and put back after.
