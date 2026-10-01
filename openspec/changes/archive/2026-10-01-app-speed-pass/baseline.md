# Measurements: before and after (tasks 1.2 and 10.1)

Taken on 2026-09-30 on the `Pixel_10_Pro` emulator (API 37, arm64, 4 cores), **debug build with Metro**,
with the synthetic бекап from `scripts/make-big-backup.ts` restored: 27 рахунки, 10 000 транзакції,
30 ліміти, 5 цілі, 2 МБ. The owner's own database was saved first and put back afterwards.

- **Before** = commit `2d50e41` (the parent of `ff8a12b`).
- **After** = commit `ff8a12b`, this change.
- Both ran the same APK, with Metro started from a separate git worktree of each commit, and each
  worktree had the same temporary probe imported first in `index.ts`. The probe and the worktrees are
  gone; nothing of it is committed. The бекап for "before" was written by the same generator from
  the `2d50e41` worktree (`schemaVersion` 4), for "after" from `ff8a12b` (5). Same seed, same rows.

## What was measured, and how far to trust it

The probe counts three things, all read from `adb logcat` after each action:

- **JS blocked** — a 10 ms timer that arrives late tells how long the JS thread was busy. Only stalls
  of **≥ 120 ms** are counted: this emulator delays an idle timer by up to ~100 ms, so anything
  smaller is noise. **"0" means "under 120 ms", not "under one frame".** The probe cannot see the
  16 ms the design Goal names; a stall it does see includes the render, which the Goal excludes.
- **statements, rows and SQL ms** — every `executeSync` on the expo-sqlite statement, the rows
  fetched, and the time spent inside them. These are exact and repeatable to the row.
- Every action was tapped through `adb` on the same layout; each row below is one action, not an average.

Timing on this machine is noisy (a wallpaper process was taking 40 % of a core throughout), so read
**rows and statements** as fact, and **JS blocked** as an order of magnitude.

## Results

Tab switches are steady-state ones (rounds 2–4 of four, nothing written in between).

| Path | Before | After |
|---|---|---|
| Tab → Рахунки | JS blocked 478 / 332 / 328 ms · 10 033 rows · 10 stmts · 152–195 ms SQL | 0 / 0 / 0 ms · **9 rows** · 10 stmts · 4–6 ms SQL |
| Tab → Звіти | 626 / 539 / 534 ms · 13 383 rows · 32 stmts · 202–228 ms SQL | 0 / 492 / 0 ms · **3 rows** (497 once) · 6 stmts (21 once) · 6–15 ms SQL |
| Tab → Головний | 496 / 467 / 450 ms · 11 779 rows · 29 stmts · 198–217 ms SQL | 125 / 132 / 0 ms · **89 rows** · 22 stmts · 3–7 ms SQL |
| Back (Android back key) from a транзакція to Головний | 476 / 611 / 449 / 472 ms · 11 779 rows · 29 stmts · 189–222 ms SQL | 149 / 157 / 0 / 0 ms · **89 rows** · 22 stmts · 3–8 ms SQL |
| Open a транзакція | 364 / 269 / 246 / 268 ms | 359 / 280 / 285 / 288 ms (unchanged, not in scope) |
| Tap a Звіти month column | ≥120 ms once, then none | none, except one 355 ms outlier |
| Open the largest рахунок («mono black», 4 230 rows) | 422 / 404 / 362 ms · 4 517 rows | 688 / 241 / 259 ms · 4 519 rows |
| Back from that рахунок to Рахунки | 333 / 338 / 360 ms · 10 033 rows | 0 / 185 / 0 ms · **9 rows** |
| Cold launch, JS blocked over the first 28 s | 11.1 / 10.5 / 11.4 / 11.5 s · 121 stmts · 38 992 rows · 1.4–1.9 s SQL | 6.6 / 7.7 / 6.1 / 7.5 s · **86 stmts · 14 682 rows** · 0.6–1.0 s SQL |
| Typing «bolt» in «Транзакції», 0.7 s between keys (each key searches) | 22 stmts · 19 826 rows · JS blocked 44 / 46 / 30 s · text always `bolt` | 18 stmts · 17 790 rows · JS blocked 38 / 49 / 45 s · text always `bolt` |
| Typing «bolt», 0.15 s between keys (fast typist) | 33 stmts · 29 742 rows · JS blocked 62 / 61 s · text always `bolt` | **10 stmts · 8 896 rows** · JS blocked 22 / 21 s · text always `bolt` |

Notes on single cells:

- The one Звіти visit that read 497 rows and blocked 492 ms is a stamp miss: the stamp moved, so
  something wrote between two visits. Which write it was was not identified.
- Cold launch is dominated by the dev bundle loading (a 5–7 s block in both). The first-content time
  could not be taken cleanly: polling screenshots loaded the emulator enough to change the result.
  What the numbers do show is the launch reading under 40 % of the rows, with 35 fewer statements.
- The Головний "after" stalls of 125–157 ms are the screen rendering, not reading: the same visits read
  89 rows in 3–8 ms of SQL. The probe cannot split render from other JS.

## Goals of the design, checked against them

- **No whole-history read on a tab switch or back with nothing written.** Met on the device: 3–89
  rows and 3–15 ms SQL where there were 10–13 thousand rows and 150–230 ms. The remaining 89 rows on
  Головний are its own small reads (recent, month, layout), not the history.
- **"Under one frame of JS work beyond the render."** Not established. The probe's floor is 120 ms.
  The visits that read nothing show 0 for Рахунки and Звіти and 125–157 ms for Головний and back to
  it, and the render is inside that. This needs a profiler that separates the render, which was not
  available headless.
- **A screen whose data changed re-reads at most once per write.** Held in the tests; on the device
  the one stamp miss seen (Звіти, above) produced exactly one read of that screen.
- **Typing never drops a character.** Met: the field read `bolt` after all 10 runs (5 before, 5
  after), at both speeds.

## Not met: a search still blocks the JS thread for 20–50 seconds

Both builds, on this history, in a dev build: after the last key the JS thread stays busy for 21–49 s
(before 30–62 s). The statement count does fall for a fast typist (33 → 10, one search instead of
three, "Fast typing searches once"), and the rows read fall with it, but the SQL itself is only
0.4–1.2 s of it. The rest is JS work after the read — filtering the matches and drawing the result —
and it was not located. It may be in part dev-build overhead (React in development, no Hermes
bytecode optimisation); it has not been shown to be. Task 10.1 is therefore **not ticked**.

## Device checks of the same run (tasks 1.1, 5.5, 8.1, 8.4, 8.5)

- **1.1** The бекап restored through Налаштування → Бекап: «Відновлено: 27 рахунків, 10000 транзакцій.»,
  on both builds. «Транзакції» reaches the oldest rows: with the month filter on «Жовтень 2022» (the
  oldest) and «Показати ще» tapped until it was gone, the list ended on the rows of 1 жовтня 2022.
  (All 10 000 unfiltered would be a hundred taps; the filter reaches the same last row.)
- **5.5** With one «Без категорії» витрата left in a small бекап and the «Прогрес» widget on Головний:
  choosing a категорія from Головний stored «Чистий місяць» in `earned_achievements` unseen, and the
  widget changed from «Закрий Серпень 2026 / Перша транзакція» to «Ви вже маєте 2 досягнення» within
  the ~4 s of the next poll, without leaving Головний.
- **8.1** «Транзакції» on `FlatList`: the search header and the three filter rows draw; the рахунок filter
  left only its рахунок's rows, the місяць filter only that month's; on «Вересень 2026» «Показати ще»
  appeared after the first 100, loaded the rest, and was gone once the month's last row (1 вересня)
  was on screen.
- **8.4** With a raw чернетка added to the database, five digits typed into its «СУМА» field caused
  5 renders of `DraftRow` and **0** of `MainScreen` (a `console.log` in each, in a throwaway copy),
  and the field read `12345`.
- **8.5** «AI-аналіз» with 12 місяців, «Продавці» and «Окремі транзакції» on (≈ 525 КБ, 2 482
  транзакції): «Показати файл» blocked the JS thread 158 ms, and fifteen quick flings through the
  panel blocked it 414 ms in total (the largest 147 ms). It opened and scrolled without a freeze.

## A trap found on the way (for whoever measures next)

Metro served a **stale Hermes-bytecode bundle** after a switch of worktree and after an edit inside a
worktree: the plain JS bundle at the same address had the new code, the bytecode one the old one, so
the first "after" run measured the old screens. `npx expo start --clear` fixed it, and every result
above was taken after one. If a measurement looks the same as the baseline, check that first.
