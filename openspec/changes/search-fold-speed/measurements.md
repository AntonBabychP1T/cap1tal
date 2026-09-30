# Measurements — search-fold-speed

Device check of design D5, 2026-09-30. Reference setup: `Pixel_10_Pro` emulator, debug build with
Metro (`--clear` after each probe edit), the synthetic бекап of `scripts/make-big-backup.ts`
(10 000 транзакцій, 8 888 of them with an опис), restored once through Налаштування → Бекап. The
owner's database was saved first and restored after; task 4.3 compared the three files byte for
byte (sha-256 identical).

Probe: a throwaway module (never committed) with `Date.now()` marks around the SQL read,
`withAwaiting` and the filter, a 10 ms heartbeat whose last late tick (> 120 ms) marks the JS
thread free again, and a deferred second pass over the same candidate rows with the old
`toLocaleLowerCase('uk')` fold. The `sealed` deep-freeze and render marks were not repeated: the
before-probe measured them at ≤ 0.02 s and 0.7 s and this change does not touch them. Each run is
a fresh app process (the search is memoized per change stamp), «bolt» typed with `adb shell input`
(~65 ms per call plus the sleep).

## Goals (design)

| Typed as | Goal | Run | Last key → JS free | Result |
|---|---|---|---|---|
| «bolt», 0.15 s between keys (one search) | ≤ 3 s | 0 (app after restore, not restarted) | 0.93 s | met |
| | | a1 | 0.75 s | met |
| | | a2 | 0.75 s | met |
| «bolt», 0.7 s between keys (four searches) | ≤ 5 s | b1 | 0.96 s | met |
| | | b2 | 0.81 s | met |

No miss. Before the change the same searches blocked the JS thread 17.9–19.8 s each.

## Steps of one search (8 888 candidate rows)

| Step | Before (proposal) | After, every search of every run |
|---|---|---|
| SQL read | 0.25–0.57 s | 0.24–0.32 s |
| rows → транзакції (`withAwaiting`) | 0.01–0.02 s | 0.010–0.012 s |
| **`filter(satisfies)`** | **16.1–18.5 s** | **4–7 ms** |

What is left of a search after a pause is the SQL read and the render (~1 s in a dev build); the
shadow column of design D1 is not needed for this history.

## Same matches under both folds (task 4.1)

Every search of runs 0, a1, a2, b1, b2 filtered the same candidate rows a second time with
`toLocaleLowerCase('uk')` on the опис and the typed text. Match counts and an ordered id hash
agreed each time:

| Typed | Matches | Id hash (new = old) |
|---|---|---|
| «b» | 1549 | 1071b1ad |
| «bo» | 1054 | e94709b3 |
| «bol» | 826 | bac3a832 |
| «bolt» | 826 | bac3a832 |

The old pass took 8.2–10.5 s per search here (the proposal's 16–18 s was the same code on a
busier run); the new one 4–7 ms.

## Hermes: `toLowerCase()` against `toLocaleLowerCase('uk')` (task 4.2)

- Every code point outside the surrogate range, compared in 2 176 chunks of 512 with a per-character
  drill-down on any mismatch: **0 differing** (all four runs).
- Context strings equal under both: «ΟΔΥΣΣΕΥΣ» (final sigma), «İ», «ß», «ẞ», «ǅ», «BOLT»,
  «ҐАНОК ЇЖАК Єнот І», «Аптека Доброго Дня» — 8/8.

This half is a one-time device check, not a regression guard: nothing under `verify` runs Hermes.
What `verify` keeps is the Node full-range test and `locale-case-usage.test.ts`, which refuses any
locale-argument case mapping in code.
