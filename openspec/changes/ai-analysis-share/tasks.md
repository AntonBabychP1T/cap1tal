# ai-analysis-share — tasks

Every amount in every test is integer minor units beside its currency code; every сума in a
пакет is exact decimal text beside its currency code. No task other than 4.1 adds a dependency;
no task adds a migration, a permission, an `app.json` change, an emulator run or a network call
to `npm run verify`. Batches of ≤ 3 adjacent tasks are safe to hand to `task-builder`, with one
gate: **no batch after group 1 starts until task 1.2 is resolved** — approved and applied, or
BLOCKED and the owner has said how the change proceeds.

## 1. Vocabulary and vision

- [x] 1.1 Add to `docs/glossary.md` a section «AI» with «AI-аналіз» (an explanation of already
      computed numbers by a language model — an assistant the owner has, or later a model on the
      phone; never a source of truth, never changes anything), «Пакет для аналізу» (the
      versioned, deterministic, per-currency bundle the app builds locally, without identifiers,
      назви of рахунки, secrets or bank text; описи and individual транзакції only by the owner's
      choice for one run), «Файл для аналізу» (the пакет rendered as one self-contained text with
      instructions and context) and «Передати» (handing a файл to an app the owner picks in the
      phone's own chooser — the owner's act, not a connection), «Продавець» (the опис of a
      витрата, folded and trimmed, as the пакет groups витрати by it; «Продавці» is the switch
      that lets описи into a пакет) and «Тренди» (the deterministic month-over-month figures of a
      пакет: changes, averages, largest категорії, notable and recurring витрати — computed by
      the app, never by the assistant). State in the «AI-аналіз» entry
      that its kinds are named by the glossary term they read — «Місячна картина» now,
      «Інвестиції» later — and never «бюджет», which vision §9 uses for ліміти. Add «Місячна
      картина» itself under «The month» (the six numbers of one calendar month, per currency —
      the term the code has used since `monthly-picture`, never entered). Say in «Продавець»
      that an опис a confirmed чернетка left on its транзакція is an опис like any other and
      leaves only under «Продавці». Verify by reading
      the delta specs against the glossary: no term used there is undefined and no synonym is
      introduced.
- [x] 1.2 **Only after the owner approves the wording in proposal §22**: add the §12 sentence
      and the new §17 to `docs/product-vision.md` exactly as approved. If the owner declines
      them, **stop and report BLOCKED** (hard rule 8): the lines are the reading of vision §1
      «Data is not shared with anyone» under which a файл may be handed to another app, and a
      change whose reading of the vision was refused does not proceed on its own.
      **Done:** the owner was asked before any code was written and answered «Схвалюю,
      застосовуй»; the §12 sentence and the new §17 are in `docs/product-vision.md` verbatim as
      §22 proposed them. A **third** edit was then put to the owner separately, because §22 had
      not written it: §1's «Data is not shared with anyone» stood unqualified and now contradicted
      §17. The owner chose «Додати застереження до §1», and §1 reads «… is not shared with anyone,
      except one file the owner themselves hands to an app they pick (§17). **[PROPOSED]**». All
      three lines carry the [PROPOSED] marker the vision uses for the owner's accepted defaults.

## 2. The пакет для аналізу (`src/analysis/`)

- [x] 2.1 Add `src/analysis/decimal.ts`: `decimalOf(money)` → `Amount` with exact decimal text,
      `bp(part, whole)`, `changeBp(before, after)`, `averageMinor(amounts)` (BigInt, half away
      from zero), all refusing mixed currencies (design D2). Tests in
      `src/analysis/decimal.test.ts`: "Scenario: Two currencies are two reports" (decimal text
      keeps its currency), "Scenario: A ratio with a zero base is absent", "Scenario:
      Month-over-month change" (+2000 bp), and a fast-check property that `decimalOf` never
      produces a float-looking rounding error for any safe integer.
- [x] 2.2 Add `src/analysis/period.ts`: `resolvePeriod(choice, builtOn)` → `AnalysisPeriod`
      (whole calendar months, the partial month with days elapsed and days in month),
      `monthsOfPeriod`, `refusesRange(from, to)`; and `historyOf(period, transactions)` →
      `'short' | 'sufficient'` plus `monthsWithData`, refusing an empty period as
      `{ kind: 'empty-period' }` (design D3). Tests in `src/analysis/period.test.ts`: "Scenario:
      The period is whole calendar months", "Scenario: A custom range is whole months",
      "Scenario: A custom range that ends before it starts is refused", "Scenario: An empty
      period is refused", "Scenario: A short history is flagged".
- [x] 2.3 Add `src/analysis/monthly.ts`: per currency, `MonthReport`s for every month of the
      period (zeros kept), `changeVsPreviousMonth` reading the month before `from` when needed,
      per-month and period `savingsRate` / `investmentRate`, the period totals,
      `averagePerMonth` over months with data, and the baseline over the up-to-12 months before
      the period that hold транзакції (design D3). Tests in `src/analysis/monthly.test.ts`:
      "Scenario: A month equals its monthly picture", "Scenario: An empty month is present at
      zero", "Scenario: The glossary distinctions hold in the пакет", "Scenario: A комісія is
      витрачено under «Комісія» and the переказ is not", "Scenario: A repayment reduces позичено
      and only the відсотки are дохід", "Scenario: A cross-currency переказ counts in one
      currency and shows both legs" (the legs part lands with 2.7), "Scenario: A foreign
      purchase from a UAH card is spent in UAH and opens no foreign report", "Scenario: A positive
      коригування is дохід", "Scenario: Money back from an інвестиційний рахунок makes
      інвестовано negative", "Scenario: Month-over-month change", "Scenario: A ratio with a zero
      base is absent", and a fast-check property that
      every month's `left` equals дохід − витрачено − інвестовано − відкладено − позичено in
      decimal text.
- [x] 2.4 Add `src/analysis/categories.ts`: `CategoryReport`s per currency with назва (archived
      marked, reserved ids under their seeded names), total, share, `byMonth`,
      `changeVsPreviousMonth` — the anchor month (the latest non-partial month of the period; the
      partial one only when the period holds no other, then `partial: true`) against the calendar
      month before it, read from the history even outside the period, both named, null when the
      earlier month holds none of the категорія — `baselineAverage`,
      `changeVsBaseline`, and the ліміт with its exceeded months via `overLimitBy` in the
      ліміт's own currency only (design D3). Tests in `src/analysis/categories.test.ts`:
      "Scenario: A category's share and change", "Scenario: A period ending in the partial
      month is anchored to the month before it", "Scenario: A period of the partial month alone
      is anchored to it and says so", "Scenario: An uncategorised витрата is reported under
      «Без категорії»", "Scenario: A ліміт and its overrun", "Scenario: A ліміт
      in another currency does not judge the category", and a property that the
      categories' totals sum to the period's витрачено per currency.
- [x] 2.5 Add `src/analysis/trends.ts`: `largestCategories`, `largestIncreases`,
      `largestDecreases` (caps of 5; the same anchor rule as 2.4; only категорії present in both
      months compared), `notable` (5 largest витрати of type expense only — «Комісія» and «Без
      категорії» included, never a повернення or коригування: сума, категорія, month; дата only
      when transactions are included; опис only when descriptions are included), and `recurring`
      by the D4 rule over витрати of type expense, with its constants commented. Tests in
      `src/analysis/trends.test.ts`: "Scenario: A notable витрата carries no опис by default",
      "Scenario: A recurring витрата candidate" (6 of 6 months), plus one test each that the caps
      hold, that a категорія recurring in 3 of 6 months is not a candidate, that a коригування is
      never notable, and that a категорія absent from the earlier month is not ranked.
- [x] 2.6 Add `src/analysis/goals.ts`: `GoalReport`s from `goalProgress` (which takes the ціль's
      рахунок and the транзакції, so the step reads the `accounts` of the input), `isReached`,
      `isOverdue`, remaining, `monthsLeft` as the calendar months from `builtOn`'s month through
      the дата's month inclusive (0 when the дата is before `builtOn`), `perMonth` (null when
      reached or 0 months), and no рахунок field of any kind. Tests in
      `src/analysis/goals.test.ts`: "Scenario: A ціль's pace" (4 months, 37500.00 UAH per
      month), "Scenario: A month started still counts" (built 2026-09-15, still 4), "Scenario:
      An overdue ціль has no pace", and a reached ціль with `perMonth` null.
- [x] 2.7 Add `src/analysis/details.ts`: `merchants` (folded опис, total, count, категорії,
      recurring by the D4 rule, cap 20) when descriptions are included, and `transactionLines`
      (every транзакція of the period; a переказ with both legs and the вид of each end; опис
      only when descriptions are included; never an id or a рахунок назва) when transactions are
      included — a дохід's джерело resolved to its назва through `namesById` over the input's
      `sources`, never as a `sourceId`. Tests in `src/analysis/details.test.ts`: "Scenario:
      Merchants when chosen",
      "Scenario: Transactions without описи", "Scenario: A переказ names its ends by вид, not by
      назва", "Scenario: Описи are absent unless chosen".
- [x] 2.8 Add `src/analysis/package.ts`: the types of proposal §6 verbatim, the constants,
      `buildAnalysisPackage(input)` — whose input carries `sources` beside `categories`, so a
      дохід's джерело reaches the пакет as a назва — sorting the транзакції first, assembling 2.2–2.7, `counts`
      (currencies UAH first via `byCurrency`, `accountsByKind`, `monthsWithData`), `history`, and
      `approximateUah` through `approximatePicture`, each rate dated by its own `obtainedAt` as
      `rateAsOf` (design D3, D10). Tests in `src/analysis/package.test.ts`: "Scenario: The same state builds the same
      пакет" (shuffled input, fast-check), "Scenario: Building leaves the stored state untouched"
      (inputs are frozen and unchanged), "Scenario: The approximation is marked and dated",
      "Scenario: No rate, no approximation", "Scenario: Two currencies are two reports" (two
      `CurrencyReport`s, nothing combined), "Scenario: Account names stay on the phone" (counts
      three рахунки by вид).
- [x] 2.9 Add `src/analysis/privacy.test.ts` (design D5): a fixture whose every id and рахунок
      назва carries `ZZ-SENTINEL-`, plus a token-like string, a notification text, a баланс банку
      and a cursor that the builder's input type cannot even accept (assert that by type: a
      `// @ts-expect-error` line); assert the serialised пакет with both switches on contains no
      sentinel, and with both off contains no опис. Names: "Scenario: Nothing secret and nothing
      overheard reaches the пакет", "Scenario: A confirmed чернетка's опис is an опис",
      "Scenario: Account names stay on the phone", "Scenario: Описи are absent unless chosen";
      plus a fast-check property over random histories; and
      "Scenario: The бекап knows nothing of it" — assert that the backup format
      (`src/backup/format.ts`'s enumerated tables and body fields) and `src/db/schema.ts` name
      no table or field for an analysis, a пакет, a файл or a run.

## 3. The файл для аналізу

- [x] 3.1 Add `src/analysis/prompt.ts`: `INSTRUCTIONS` for profile `'external-advanced'` and
      `CONTEXT`, as arrays of Ukrainian sentences (design D11), covering: use only the data;
      facts apart from assumptions; recommendations marked; never invent a number, категорія,
      транзакція or currency; never recompute; never combine currencies; the partial month;
      no forecast; answer in Ukrainian; the seven-part answer shape; the six numbers and their
      identity; the five distinctions; basis points; `null`. Tests in
      `src/analysis/prompt.test.ts`: "Scenario: The instructions forbid what the assistant must
      not do", "Scenario: The context defines the month" — each required sentence asserted
      present by a stable key phrase.
- [x] 3.2 Add `src/analysis/document.ts`: `renderDocument(package, profile)` →
      `AnalysisDocument` with the four sections, the header line, the `## Підсумок` figures via
      `formatMoney` from the пакет only, the `## Дані` block via `canonicalJson`, and
      `documentName(package)` (design D6). Tests in `src/analysis/document.test.ts`: "Scenario:
      The data section is the пакет" (parse the block, `toEqual` the пакет), "Scenario: Rendering
      is repeatable", "Scenario: The summary repeats the data, formatted" (every summary amount
      string, reparsed, is in the пакет), the name for a period, and the golden file
      `src/analysis/document.golden.md` for one fixture.

## 4. The hand-off port and the device

- [x] 4.1 `npx expo install expo-sharing`; run `npx expo-doctor`; note in the change that the dev
      client must be rebuilt (`scripts/android.sh up` does it). No `app.json` change (design D7).
      Verify `npm run verify` stays green and Node-only.
      **Done:** `expo-sharing ~57.0.17` in `package.json`; `npx expo install` also added
      `"expo-sharing"` to `app.json`'s `plugins`, and that entry was **removed** — with no props
      its plugin configures only *receiving* shares (an iOS share extension and Android intent
      filters, both `enabled: false` by default), which this app does not do; the `FileProvider`
      and the `<queries>` entry come from the module's own `AndroidManifest.xml`, as D7 says.
      `npx expo-doctor`: 20/21 checks pass; the one failure is the repo's pre-existing patch drift
      across 14 packages and does not name `expo-sharing`. The dev client must be rebuilt before
      the smoke of 6.3.
- [x] 4.2 Add `src/platform/analysis-share.ts`: the port, the three outcomes and
      `inMemoryAnalysisShare({ outcome? })` with `handed()` (design D8). Tests in
      `src/platform/analysis-share.test.ts`: the double hands a файл over and remembers it; each
      of `unavailable` and `failed` leaves `handed()` empty ("Scenario: A dismissed chooser is not
      a failure and not a success" is the double's default `handed-over`; "Scenario: A platform
      without a chooser answers honestly" and "Scenario: A файл that cannot be written is a
      reason, not a crash" are the other two, each an outcome value and never a throw); the file-level
      guard that `analysis-share.ts` imports no native module, in the same shape as
      `backup-file.test.ts`; and "Scenario: No connection is made" — read every `.ts` under
      `src/analysis/` and `src/platform/analysis-share.ts` and assert none imports or names
      `fetch`, `XMLHttpRequest`, `WebSocket` or a module under `src/monobank/` other than the
      `MonobankRate` type.
- [x] 4.3 Add `src/platform/analysis-share-device.ts` over `expo-file-system` (`Paths.cache` /
      `ai-analysis`, empty then write) and `expo-sharing` (`text/plain`, dialog title
      «Поділитися з AI»), mapping web and `isAvailableAsync() === false` to `unavailable`, every
      throw to `failed` with its message, and a resolved share to `handed-over` (design D8).
      Typecheck only under `verify`; behaviour proven in 6.3.

## 5. Screen logic

- [x] 5.1 Add `src/ui/ai-analysis-screen.ts`: `PERIOD_CHOICES` (labels «Цей місяць», «Останні 3
      місяці», «Останні 6 місяців», «Останні 12 місяців», «Свій діапазон»), the defaults (monthly picture,
      3 months, both switches off), `aiAnalysisModel(input)` building the пакет and the document
      and returning the preview (months with data, транзакції, категорії, currencies, продавці
      так/ні, окремі транзакції так/ні, size as UTF-8 bytes in KB, the hand-over sentence), the
      `empty-period`, `empty-history`, `invalid-range` (`isMonth` and then `refusesRange`, both
      asked before anything is built) and `short-history` states and `canShare` (design D9).
      Tests in `src/ui/ai-analysis-screen.test.ts`: "Scenario: The defaults are the least that
      leaves the phone", "Scenario: The preview counts the пакет", "Scenario: The preview follows
      the choices" (the size grows in bytes), "Scenario: An empty period offers nothing to
      share", "Scenario: An empty history leads to the first транзакція", "Scenario: A one-month
      history is warned, not refused" (and that «Цей місяць» carries the warning), "Scenario: A
      custom range that ends before it starts is refused" (no `canShare`, nothing built), a
      half-typed month («2026-0») refused the same way rather than thrown at,
      "Scenario: The full text can be read first" (the shown text is `document.text`).
- [x] 5.2 Add the run state machine and the words to the same module: `nextState(state,
      event)` over `preview | sharing | handed-over | unavailable | failed | copied` (the preview
      is live from opening; design D9),
      `runOutcomeWords(outcome)` (design D9's name) for each port outcome and the copy, and the rule that the text
      copied or handed over is `document.text` unchanged. Tests in the same file: "Scenario:
      Handed over is all that is claimed", "Scenario: No way to share on this platform",
      "Scenario: The файл could not be prepared", "Scenario: Copying puts the same text on the
      clipboard", "Scenario: Copy equals the файл" (the copied text is the файл character for
      character), "Scenario: Leaving the screen hands nothing over" (the double's `handed()` is
      empty without the action), "Scenario: Details are not remembered" (a fresh model has both
      switches off).

## 6. The screens

- [x] 6.1 Add `src/app/ai-analysis.tsx` — the choices, the preview card, «Показати файл» (raw
      text), the primary «Поділитися з AI» calling the port, «Скопіювати» calling
      `expo-clipboard`, the outcome sentences from 5.2 — reading the repos on focus like
      `reports.tsx`, holding the switches in React state only; register the route in
      `src/app/_layout.tsx` (design D9). «Записати першу» pushes `/transaction/new`, which
      `home-daily-overview` owns: this change must not merge before that route exists, and a test
      asserts the file and its registration so `verify` catches it rather than the phone. Verify on the emulator (`scripts/android.sh up`, `shot`)
      that the screen opens with the defaults and the preview.
- [x] 6.2 Add the «AI-аналіз» entry to `src/app/(tabs)/reports.tsx` — one card at the bottom of
      the tab linking to `/ai-analysis`, shown with an empty history too. Add to
      `src/ui/reports-screen.test.ts` "Scenario: The offer says nothing about the data" — the
      reports model builds no пакет and imports nothing from `src/analysis/`. Verify on the
      emulator: "Scenario: The offer opens the AI-аналіз screen".
- [x] 6.3 Smoke on the emulator, screenshots into `.cache/android/`: (a) «Поділитися з AI» opens
      the system chooser with the файл, and nothing before that tap opened one ("Scenario: The
      chooser opens on the action alone", "Scenario: The chooser is the only way out"); (b) picking a text-capable app (Files or Gmail) receives
      a file whose content equals «Показати файл»; (c) dismissing the chooser leaves «Файл
      передано системі» and nothing more, then sharing again works; (d) «Скопіювати» then paste
      into any field shows the header line; (e) an empty custom range shows the refusal with no
      primary action; (f) both switches are off after leaving and reopening; (g) after a second
      run `adb shell run-as <package> ls cache/ai-analysis` lists exactly one файл, the newer
      one ("Scenario: One файл at a time"); (h) after returning from the chooser, Місяць and
      Рахунки show the same numbers as before and «Транзакції» holds the same count ("Scenario:
      A run changes nothing"). Record separately,
      as the owner's step on their phone: which of ChatGPT, Claude, Gemini appear for the файл
      and whether one answers in Ukrainian from it alone — not a `verify` condition.
      **Done — "Scenario: The offer opens the AI-аналіз screen" (task 6.2's own emulator step):**
      «Звіти» scrolled to the bottom shows the card «AI-АНАЛІЗ / Передати ці числа застосунку, який
      ви оберете, щоб він їх пояснив» with no number and no preview on it
      (`smoke/…/07-zvity-bottom.png`, `fix/02-zvity-bottom.png`); tapping it opened AI-аналіз over
      the tabs at its defaults (`smoke/…/08-ai-screen-top.png`, `fix/03-ai.png`).
      **Done** (Pixel_10_Pro, API 37; 378 транзакції / 20 категорії / UAH·EUR·USD already on the
      device; screenshots in `.cache/android/smoke/ai-analysis-share/` and `.cache/android/fix/`):
      (a) ✅ nothing opened a chooser before the tap — `run-as … ls cache/ai-analysis` was «No such
      file or directory» through opening, previewing and «Показати файл»; only the tap moved focus
      to `ChooserActivityLauncher`. (b) ✅ «Sharing 1 file · cap1tal-ai-monthly-picture-2026-07_2026-09.md»,
      30 625 B against the preview's «≈ 30 КБ», and the shown text is the file's own header.
      (c) ✅ dismissing leaves «Файл передано системі. Що з ним сталося далі, знає лише обраний
      застосунок.» and nothing more; the second share reopened the chooser. (d) ✅ «Скопіювати» →
      Android's own clipboard chip reads back «# cap1tal · AI-аналіз місячної картини …»
      (`fix/09-copied.png`). (e) ✅ after the fix below: «Кінець діапазону раніше за його початок.»
      with no primary action (`fix/07-reversed.png`). (f) ✅ «Окремі транзакції» on → «≈ 74 КБ»;
      left and reopened → both off, «≈ 30 КБ». (g) ✅ one файл after each of two runs, the newer
      one. (h) ✅ Місяць, Рахунки and the транзакція count identical before and after two shares.
      **Defect found and fixed:** one keystroke in «Від»/«До» crashed the screen with a red
      «Render Error: month must be YYYY-MM, got "2026-0"» (`period.ts` threw three calls below the
      screen). `isMonth` now guards the model, a half-typed month answers «Місяць пишеться як
      РРРР-ММ, напр. 2026-08.», and both are regression-tested. Re-smoked green
      (`fix/06-deleted.png`). **Left for the owner's own phone:** the emulator has neither ChatGPT
      nor Claude installed, so «does an assistant answer in Ukrainian from the файл alone» is
      unproven — the chooser there offered Gemini, Quick Share, monobank, Save and Chrome.

## 7. The map

- [x] 7.1 Add `src/analysis/` to the Layout table of `CLAUDE.md`, and the «AI-аналіз» screen to
      `docs/app-overview.md` §3 (one screenshot from 6.3, the
      privacy sentence, what the файл holds) and §5.1 (`src/analysis/`), and a row to the
      tech-task §5 «Зміни поза нумерацією» table. Verify the section list and the layer list
      match the tree.

## 8. Gate

- [x] 8.1 Run `npm run verify` and paste the final lines
      ```
       Test Files  115 passed (115)
            Tests  1916 passed (1916)
         Duration  2.96s
      ✔ verify passed (2fc38994b3fc5c7740276ddc07b0f5d9d51ac28b)
      ```
- [x] 8.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
      Round 1 → **FAIL** (1 critical, 5 important, 7 minor). Critical: the §1 vision edit was
      applied with no record of the owner's approval in the change — now written into 1.2 above.
      Important: the `/transaction/new` dependency on `home-daily-overview` was undeclared and
      would have opened `transaction/[id]` with id «new» if merged alone (declared, and a test now
      asserts the route); the malformed-month message was behaviour no spec described (hard rule 2
      — a scenario was added to the screen spec and the test renamed to quote it); determinism was
      proven over транзакції order only (the property now shuffles all seven inputs); the privacy
      scenario's own test asserted only the sentinel (the token, баланс банку, чернетка text and
      відстежуваний застосунок assertions moved into it); "Scenario: The offer opens the AI-аналіз
      screen" had no recorded evidence (6.3 now names the screenshots). Minors 1, 3, 4, 6 and 7
      fixed; minor 5 withdrawn by the reviewer.
      Round 2 → **PASS** (0 critical, 0 important), with one new minor of its own making: the
      merchant fold had been changed to `toLocaleLowerCase('uk')`, putting an `Intl`-sensitive call
      on the key merchants are both grouped and sorted by — the one thing the пакет's determinism
      cannot depend on. Reverted to a locale-free fold, with the reason written where the two
      foldings differ and a test pinning it.
