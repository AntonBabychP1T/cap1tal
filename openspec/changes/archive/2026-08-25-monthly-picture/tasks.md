## 1. Preconditions

- [x] 1.1 Confirm `app-shell-branding` and `accounts-manual-transactions` are committed (and
      archived or being archived) and the working tree is clean of their edits — this change
      touches `src/components/app-tabs.tsx` and `assets/images/tabIcons/`, which both are in
      flight there (proposal.md — Coordination). Do not start implementation before this holds.

      It did not hold when this change was picked up: `app-shell-branding` was 11/13 with its
      edits loose in the working tree. It was finished first — manual smoke in both appearances,
      diff-reviewer to PASS, then four commits (`60ebdda` tooling, `7ae63d3` permissions,
      `a1ebe0a` the change, `959e6d3` the archive). `accounts-manual-transactions` was already
      archived at `948cb88`. The tree now holds only this change's own artifacts.

- [x] 1.2 Artifacts revised after the `spec-reviewer` pass (READY, 0 critical, 6 warning) and one
      finding of my own. What changed, so the diff is not a surprise:
      1. `proposal.md` Impact named `src/app/month/` for the drill-down, which design decision 5
         explicitly rejects. Now `src/app/category/[month]/[categoryId].tsx`.
      2. `specs/monthly-picture` — the ≈ identity was unpinned. Each of the six numbers is
         approximated on its own and the identity may drift a kopiyka or two; deriving one from
         the other five would only hide the rounding in whichever was derived. Stated, with a
         scenario.
      3. `specs/monthly-picture` — `rateBuy` over `rateSell` was pinned only in `design.md`, and
         it is an owner-visible ~2 % choice. It is now in the requirement.
      4. `specs/monthly-picture` — added scenarios for a переказ getting no row (the distinction
         the whole screen exists to make) and for a category netting to zero keeping its place.
      5. `specs/month-screen` — the drill-down carries month + category and no currency, so a
         category's list holds every currency. That was unstated; now stated with a scenario. The
         correction clause (positive коригування listed but not counted) got the scenario it
         lacked.
      6. `specs/month-screen` + `design.md` — staleness is decided **per currency**. Reading "the
         newest `obtained_at`", as task 5.3 said, would let a fresh USD rate keep a week-old EUR
         rate serving the approximation forever. Two scenarios added; 5.3 corrected.
      7. `specs/persistence` — **mine, and the one that would have shipped a contradiction.** The
         archived persistence spec says of a cross-currency transfer that "no exchange rate exists
         anywhere in storage". `monobank_rates` makes that false the moment this change archives.
         Added a MODIFIED requirement narrowing it to what was always meant: no transaction
         carries a rate and none is derived for one — the cached rate belongs to no transaction.
      8. `design.md` — new decision 10 recording what this hands to `categories-rules`: seed rows
         under the three reserved ids, let stored names take over from the label map, and test
         correction attribution.
      9. `proposal.md` — noted that `docs/tech-task.md` §5 files «курс» under step 7 while FR-M3
         belongs to step 4, and that the tokenless rate endpoint therefore lands here on purpose.

## 2. Domain: the category breakdown

- [x] 2.1 Add `categoryBreakdown({ month, transactions })` to `src/domain/monthly-picture.ts`
      (design decision 1): per currency, category id → signed integer minor units; expenses add,
      refunds subtract, corrections < 0 add under `CORRECTION_CATEGORY_ID`; transfers, incomes
      and corrections ≥ 0 contribute nothing. Tests in `src/domain/monthly-picture.test.ts`
      proving the monthly-picture delta scenarios "The breakdown sums to spent" (as a
      property over generated transactions, per currency, against `monthlyPicture().spent`),
      "A refund can push its category negative", "A negative correction lands in the correction
      category", "A positive correction stays out of the breakdown", "One category keeps its
      currencies apart", "A transfer gets no row, whatever it reached" and "A category that nets
      to zero keeps its place".

## 3. The monobank rate: fetch, store, convert

- [x] 3.1 `src/monobank/currency.ts` (new directory): a total parser from the public
      `/bank/currency` response to `{ currency, rateMillionths }` rows — keep pairs with
      `currencyCodeB === 980` and `currencyCodeA` ∈ {840 → USD, 978 → EUR}, take `rateBuy` when
      present else `rateCross`, convert floats once via `Math.round(rate * 1e6)` (design
      decisions 2, 3); anything malformed parses to no rows, never throws. Tests in
      `src/monobank/currency.test.ts` on a real-shaped fixture, a `rateCross`-only pair, and
      garbage input.
- [x] 3.2 In the same module, `fetchMonobankRates(fetchImpl)`: GET the endpoint, parse, return
      rows; any network error, non-200 or 429 returns no rows. Test with a stubbed `fetchImpl`
      for the ok, 429 and rejection cases — the network is never touched (design decision 3).
- [x] 3.3 Schema: `monobank_rates` table in `src/db/schema.ts` per design decision 4 (`currency`
      TEXT PK, `rate_millionths` INTEGER NOT NULL CHECK > 0, `obtained_at` timestamp_ms
      NOT NULL); `npm run db:generate` for the new migration — committed migrations untouched.
      Extend `src/db/migrations.test.ts` so the fresh-install shape includes the new table.
- [x] 3.4 `ratesRepo` beside the other repos (get / upsert / all), wired into `src/db/repos.ts`.
      Tests in `src/db/rates-repo.test.ts` proving the persistence delta scenarios "A stored
      rate is still there after a restart" (write, reopen the same database file/connection
      pattern the other repo tests use, read back rate and moment) and "A newer rate replaces
      the older one".
- [x] 3.5 `src/ui/approx-uah.ts`: the display-only converter — BigInt
      `round(amount × rateMillionths / 1e6)`, halves away from zero (design decision 2) — and
      `approximatePicture(picture, rates)`: the six approximate UAH numbers when a non-UAH
      currency participates and every participating currency has a rate, else `null`. Tests in
      `src/ui/approx-uah.test.ts` proving "Conversion rounds to whole kopiykas" (10000 minor USD
      at 41.25345 → 412535), "A negative amount rounds away from zero" (−10000 at 41.25345 →
      −412535 — naive BigInt division truncates toward zero and `Math.round(-0.5)` rounds toward
      +∞; neither is this rule), "UAH joins the approximation unchanged" (100000 UAH + 10000 USD
      at 41.25 → 512500), "One unknown rate withholds the whole approximation" and "Each number is
      approximated on its own" (3 minor USD дохід against three parts of 1 → 124 vs 41+41+41, one
      kopiyka apart — each of the six is rounded separately and none is derived from the others).

## 4. UI logic: months, view-model, drill-down filter

- [x] 4.1 `src/ui/months.ts`: `prevMonth` / `nextMonth` over `'YYYY-MM'`, `currentMonth(now:
      Date)` deriving from the Date's LOCAL parts exactly like `todayIso` in `src/ui/dates.ts`
      (never `toISOString()` — a UTC month would disagree with a recorded "today" expense around
      midnight), a clamp that never steps past the current month, and `monthLabel` from the
      twelve hardcoded Ukrainian nominative names («Серпень 2026») — no `Intl` (design decision
      6). Tests in `src/ui/months.test.ts` proving "Opening lands on the current month" (helper
      level: `currentMonth` of a fixed August 2026 instant), "Stepping back shows the earlier
      month" (`prevMonth('2026-08')`), "Stepping forward returns toward the current month" (back
      twice, forward once → the previous month) and "The current month is the far edge" (the
      clamp refuses the step; December→January year roll both ways). The staleness helper task 5.3
      needs — `staleCurrencies` / `shouldRefreshRates`, decided **per currency**: any currency
      monobank could quote for us with no rate or a rate over an hour old means ask again (design
      decision 4) — went into `approx-uah.ts` beside the rates rather than here beside the months,
      with tests naming the month-screen scenarios "One stale currency is enough to ask again" and
      "Every rate fresh asks nothing".
- [x] 4.2 Add `Коригування` for `CORRECTION_CATEGORY_ID` to `CATEGORY_LABELS` in
      `src/ui/labels.ts` (month-screen delta: reserved categories shown as «Без категорії»,
      «Комісія», «Коригування»); test beside the existing ones in `src/ui/labels.test.ts`.
- [x] 4.3 `src/ui/month-screen.ts`: `monthViewModel({ month, accounts, transactions, rates })`
      composing `monthlyPicture` + `categoryBreakdown` + labels + `approximatePicture` into
      formatted per-currency groups, breakdown rows and optional approximate strings; an empty
      month yields an explicit empty state. Tests in `src/ui/month-screen.test.ts` proving
      "Two currencies form two separate groups", "An empty month says it is empty", "The
      breakdown lists the categories of the month", "A known rate yields a marked
      approximation", "An unknown rate hides the approximation, not the numbers", "A UAH-only
      month has nothing to approximate", and a transfer touching an archived рахунок classifying
      by its kind (design decision 8).
- [x] 4.4 `src/ui/category-transactions.ts`: the drill-down filter — the month's витрати and
      повернення of one category id, plus коригування when the id is `CORRECTION_CATEGORY_ID`
      (design decision 5). Tests in `src/ui/category-transactions.test.ts` proving "A category
      opens its month's transactions" (other categories, other months and transfers excluded;
      corrections included only for the correction id), "The correction list holds corrections of
      either sign" (a +3000 and a −3000 both listed, while the row's amount stays 3000) and "A
      category's list is not split by currency" (the filter takes a category and a month, never a
      currency).

## 5. Screens

- [x] 5.1 Tab icon: `assets/images/tabIcons/month.png` + `@2x` + `@3x` — monochrome calendar
      glyph with alpha, pixel sizes matching `home.png`'s three files, generated by a scratch
      script that is not committed (design decision 7). Confirm dimensions with a file probe and
      note them here.

      ```
      home.png     24×24   253 B      month.png     24×24   274 B
      home@2x.png  48×48   343 B      month@2x.png  48×48   455 B
      home@3x.png  72×72   479 B      month@3x.png  72×72   663 B
      ```

      `sips -g pixelWidth -g pixelHeight` on each of the six: the three scales match `home.png`
      exactly. (`accounts.png` is 25/49/73 — the scaffold's, not a target.) Black with alpha
      carrying the shape, like both neighbours, so `renderingMode="template"` tints it per theme.
      The glyph: two binding stubs, a header band, and a 3×2 grid of days punched out of a solid
      rounded rectangle — solid-filled to match `home.png`'s pentagon and `accounts.png`'s bars
      rather than an outline. Rendered by a throwaway Node script (16× supersampled coverage,
      written out through `zlib` — no new dependency, and nothing regenerates these three files).
- [x] 5.2 `src/app/(tabs)/month.tsx` + one trigger in `src/components/app-tabs.tsx` and
      `app-tabs.web.tsx`: name `month`, label «Місяць», icon from 5.1 with
      `renderingMode="template"`, placed between Головний and Рахунки. The screen: state = shown
      month (default `currentMonth(new Date())`); on focus re-query all accounts (archived
      included) and `transactions.listMonth`; render `monthViewModel`; stepping controls wired
      to the clamp; breakdown rows push the drill-down route. Covers month-screen "The Місяць
      screen shows the month's numbers per currency" and "opens on the current month" — the
      logic is already proven in 4.1/4.3; the JSX stays thin.
- [x] 5.3 Rate refresh on the month screen: when **any currency monobank can quote against the
      hryvnia** has no stored rate or one over an hour old, fire `fetchMonobankRates(fetch)` once,
      upsert what returns, re-render;
      every failure path leaves the screen exactly as it was (month-screen "The rate refreshes
      quietly and fails silently"). Staleness is decided per currency, not off the newest row —
      otherwise a fresh USD rate keeps a week-old EUR rate serving the approximation forever
      (design decision 4). The decision is the pure helper written in 4.1; the JSX only calls it.
- [x] 5.4 `src/app/category/[month]/[categoryId].tsx`: the category's month list — title from
      `categoryLabel` + `monthLabel`, rows via the existing `transactionLine`, tap pushes
      `transaction/[id]` (month-screen "A transaction in the category list opens for editing").
      Route segments per design decision 5 — not under `/month`, which the tab owns.

## 6. Evidence the specs cannot get from `verify`

- [x] 6.1 Manual smoke on Android (емулятор, `scripts/android.sh`) of the JSX-only scenarios:
      the Місяць tab sits between Головний and Рахунки; the current month opens named in
      Ukrainian; stepping back and the clamp at the current month; recording an expense on
      Головний updates the month on return; breakdown tap-through to the category list and
      editing from it; airplane mode with a cached rate still shows «≈», airplane mode on a
      fresh install shows everything but «≈»; and "A fresh rate replaces a stale one" — open the
      screen online with a stored rate older than an hour and confirm the newly obtained rate is
      what the «≈» figure uses. Write the results here before archive.

      `scripts/android.sh up` on `Pixel_10_Pro` (API 37), debug APK over Metro. Screenshots in
      `.cache/android/mp-*.png` (gitignored); the rate cache was read back out of the device
      database after each step, so the claims below are not read off pixels alone. Rows 14 and 15
      were added after the retry-loop fix in 7.2 and are the evidence for "One opening asks once";
      row 10 was re-run on the fixed code.

      | # | scenario | what was seen |
      | --- | --- | --- |
      | 1 | The Місяць tab sits between Головний and Рахунки | `mp-01` — three tabs in the vision's order, the calendar glyph tinted like its neighbours |
      | 2 | The screen opens on the current month, named in Ukrainian | `mp-02` — «Серпень 2026», six numbers under their glossary names, «Без категорії 125,50 UAH» |
      | 3 | The current month is the far edge | `mp-02` — only «←» is drawn; «→» appears in `mp-06` on Липень |
      | 4 | Stepping back shows the earlier month | `mp-06` — «Липень 2026», «У цьому місяці ще нічого не записано.» |
      | 5 | Breakdown tap-through | `mp-03` — «Без категорії» / «Серпень 2026» listing that category's one витрата |
      | 6 | A transaction there opens for editing | `mp-04` — the same Транзакція screen the Головний feed opens |
      | 7 | Recording an expense updates the month | `mp-14` — a 100,00 USD витрата recorded on Головний; the month gains a separate USD group |
      | 8 | Two currencies form two separate groups | `mp-14` — UAH and USD side by side, no number combining them |
      | 9 | A known rate yields a marked approximation | `mp-14` — «Витрачено ≈ 4568,50 грн» = 125,50 + 100,00 × 44,43, monobank's live `rateBuy` |
      | 10 | A fresh rate replaces a stale one | `mp-24` — the cache was set to **77,00** stamped `2026-08-23 23:52 UTC`, 17¼ h before the run at `17:07 UTC`; afterwards it read 44,43 / 51,88 at the run's own moment, and the screen shows «≈ 4568,50 грн», which is the 44,43 figure. 77,00 would have shown ≈ 7825,50, so the stale rate is demonstrably not what is being served. `mp-24` is byte-identical to `mp-14` **because the end state is `mp-14`'s end state** — what makes the pixels informative here is the 77,00 the run started from, and the proof of the replacement is the database read-back (`restale.db` → `after7.db`). Run after the retry-loop fix in 7.2, so it also covers the reworked effect. (A first attempt, `mp-18`, backdated to a rate equal to the live one and so proved nothing; it is superseded by this row.) |
      | 14 | One opening asks once — nothing stored | cache emptied, screen opened, left open and sampled at +6 s, +26 s and +51 s: it went from `[]` to `USD=44430000@1787591723068 EUR=51880000@1787591723068` and then did not change once. Both currencies carry the **same** `obtained_at`, so it was a single write pass, and 51 s of an open screen produced no second one |
      | 15 | One opening asks once — one currency stale | USD left fresh, **EUR alone** set to 88,00 and backdated a day. Opening the screen wrote `USD=44430000@1787591803766 EUR=51880000@1787591803766` — one instant, both rows, the stale 88,00 gone — and sampling at +6 s, +31 s and +56 s found it unchanged. This is the asymmetric case per-currency staleness exists for, and it settles after one attempt |
      | 11 | Every rate fresh asks nothing | `mp-19` — a rate of 20,00 stamped now: «≈ 2125,50 грн», computed from it, and the cache was byte-for-byte unchanged afterwards. That is consistent with no request having been made, though a failed one would look the same; the scenario's real proof is the unit test |
      | 12 | Offline with no stored rate shows everything else | `mp-21` — Wi-Fi and mobile data off, cache emptied: both groups and both breakdowns in full, the «Приблизно в гривні» block simply absent, no error, cache still empty |
      | 13 | Offline with a stored rate still approximates | `mp-23` — a 14-hour-old rate of 30,00 with the network down: «≈ 3125,50 грн» from the stored rate, the failed refresh changed nothing, and the cache was untouched |

      One deviation from the task's wording, stated rather than glossed: **airplane mode could not
      be used.** This AVD routes Metro's `10.0.2.2:8081` through the network stack, so with the
      radio off a debug build cannot load its JS bundle at all and shows RN's red "Unable to load
      script" screen — a debug-build artefact, nothing to do with this change. Rows 12 and 13 were
      produced instead by disabling Wi-Fi **and** mobile data *after* the bundle had loaded, which
      is the same thing from the app's point of view: `fetch` fails, and `fetchMonobankRates`
      returns no rows. The only warning logged in that state was Expo's own "Cannot connect to
      Expo CLI".

## 7. Gate

- [x] 7.1 Run `npm run verify` and paste the final lines

      ```
      Test Files  21 passed (21)
           Tests  254 passed (254)
      ✔ verify passed (9d83fe28a8ec9b2674a674a9a955290a1f45e03b)
      ```

      From 15 files / 157 tests before this change. An earlier paste here quoted 253 tests, from
      before the retry-loop fix in 7.2 added one — stale evidence for the tree being committed.
      The fingerprint above is from the run immediately before this paste; writing into a watched
      file moves it on, so `verify` is run once more before the commit and the commit hook checks
      that run, not this quote.
- [x] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      First pass: **FAIL**, 1 critical, 6 warning.

      The critical was real and mine. `src/app/(tabs)/month.tsx` decided whether to ask monobank
      from `stored.rates` — the very cache the effect then writes to — with `stored.rates` in the
      `useFocusEffect` dependencies. `useReloadOnFocus` hands back a fresh object on every read, so
      the effect's own `reload()` re-armed it. Harmless when the answer covers every currency (the
      second pass finds nothing stale), but a **partial** answer — monobank drops EUR, or the
      parser skips a malformed row — leaves EUR stale forever: fetch, store, re-arm, fetch, with
      nothing but the endpoint's 429 to stop it. Exactly the retry loop `design.md` Risks promises
      does not exist. It also fired twice on every stale open, against 5.3's "once".

      Fixed by reading the cache straight from storage inside the effect and keeping only `reload`
      in the deps, so the effect's own write cannot re-arm it. `approx-uah.test.ts` gained the test
      that pins why it matters: after a partial answer, `staleCurrencies` still returns the
      currency that was left out. The month-screen requirement now states the once-per-opening rule
      and carries a scenario for a partial answer.

      The six warnings, all addressed:
      1. `.claude/agents/diff-reviewer.md` is modified in the working tree and belongs to no task
         here — kept out of this change's commit; see the note in task 1.3.
      2. The refresh requirement said "any **offered** currency", and `OFFERED_CURRENCIES` includes
         UAH, which can never have a rate — so read literally it demanded a refresh on every open.
         Reworded to the currencies monobank can quote against the hryvnia.
      3. The `rateCross` fallback was pinned only in `design.md` and task 3.1 while the requirement
         named `rateBuy` alone. The requirement now sanctions it.
      4. `migrations.test.ts` had borrowed the persistence scenario title "A stored rate is still
         there after a restart" for a test that proves something else (an older database gaining an
         empty table). Renamed, so the scenario→test map stays unambiguous.
      5. Smoke row 11 inferred "so no request was made" from an unchanged cache, which a failed
         request produces too. Softened to what was actually observed.
      6. Smoke row 10 cited a screenshot byte-identical to row 9's, because the refreshed rate
         equalled the pre-backdated one. The row now says the database read-back is the evidence
         and the pixels are not.

      Third pass: **PASS**, 0 critical, 7 warning. Three of its warnings were fixed here — the
      mid-flight blur dropped rates that had been obtained (against "SHALL store what it
      obtained"; only the re-render is skipped now), a «До Головного» control belonged to no
      requirement and is gone, and CLAUDE.md's Layout did not list `src/monobank/`.

      Two it raised that I did not act on, stated rather than quietly dropped:
      - It argues the once-per-opening guarantee should not rest on a dependency array at all, but
        on a ref keyed to the shown month behind a pure `shouldAsk(...)` helper, which Vitest could
        then prove. That is right, and it is a better design than mine. I left it because it is a
        redesign of a screen that is already reviewed and smoked, and because the fragility is
        recorded in design.md decision 9 — but it is the first thing to do if this effect is
        touched again.
      - It notes `useCallback` identity is a React performance hint, not a semantic guarantee, so
        a discarded cache could in principle re-arm the effect. Same answer, same follow-up.

      Also left, deliberately: `src/db/transactions-repo.test.ts:120` still comments "No exchange
      rate exists anywhere in storage", the phrase this change's MODIFIED requirement retires. The
      assertion under it is correct and scoped to the `transactions` table; the file is untouched
      by this change and is being edited by another change in flight, so correcting one comment
      here would only collide with it.
