# Measurements — merchant-normalization

Task 4.4: recognition over 10 000 транзакції and 300 написання must stay inside the ceiling
search-fold-speed recorded for a search — **≤ 3 s from the last key to a free JS thread** (one
search), ≤ 5 s for four (`archive/2026-10-01-search-fold-speed/measurements.md`).

## Node benchmark (2026-10-03)

`npx tsx scripts/bench-merchants.ts` — 10 000 витрати whose описи are drawn from 900 distinct
texts (150 shops, three branches each, in Cyrillic and in Latin), and 300 продавці holding 450
написання (150 of them name the shops in both scripts; 150 recognise nothing in this history). An
in-memory database through the real repositories; MacBook, Node 24, load average ≈ 4.

| Read | Time | Result |
|---|---|---|
| Recognise every опис once, fresh index (lines, «Без продавця», the пакет) | 3.3 ms | 10 000 recognised |
| «Транзакції» narrowed to one продавець, first page (read + judge + remember) | 16.6 ms | 71 rows |
| …the next page (sliced from what was remembered) | 0.1 ms | — |
| A typed search naming the продавець | 16.0 ms | 71 rows |

Recognition is memoised per distinct опис (design M1): 900 distinct описи × 450 написання is the
whole of the substring work, and the rest is a map lookup per row. Search-fold-speed measured
Hermes at roughly 1 µs per fold against Node's sub-microsecond, so even a 20× slowdown keeps the
narrowing well under a tenth of the 3 s ceiling. Nothing here asks for the Aho–Corasick step
the design keeps in reserve.

## Emulator (not run yet)

The device half — «Транзакції» opened narrowed to a продавець over the 10 000-транзакції бекап of
`scripts/make-big-backup.ts` with 300 написання — was **not run** in this session: the lane was
built in a worktree while another session held the shared `Pixel_10_Pro` emulator and Metro, and
this change's migration (0010) would collide with that session's own 0010 on the emulator's
database. It runs with the smoke test (task 7.2) once the emulator is free; the result goes here.
