## Why

The app shows the owner's money well, but it does not point at anything inside it. Місяць, Звіти
and Статок give every number of every month, and the owner still has to stare at a chart to find
what is unusual: a категорія well above its usual сума, a subscription that got dearer, a
purchase entered twice. The owner asked (2026-10-02) for this as the next real feature, ahead of
any chat with a model. `docs/on-device-ai-proposal.md` §3C already concluded the same: such
detectors give facts with concrete numbers, and they need no model.

The owner asked for a second unit in the same request: a **підсумок місяця**. When September ends,
one screen should read September as a whole, not as one more chart. That screen also reports the
vision's own measure of v1 (§15) month by month: every транзакція present, «залишилось» trusted,
and коригування under 2 % of витрачено.

Both answer the vision's first question, "where did my money go this month" (§1). The підсумок
also restates «залишилось», the second question, for a finished month.

## What Changes

- **Owner's decision 2026-10-02: спостереження.** An спостереження is a fact the app finds in the
  owner's own транзакції. A fixed, deterministic detector finds it, and the app states it in one
  sentence with its numbers. It is computed when shown and stored nowhere. It changes no number,
  it is never advice, never a forecast and never a model's words, and it leads to the records it
  is about. The first catalogue has six detectors:
  - a категорія of a finished month above or below its **типова сума** («Продукти: 13 800 ₴ — на
    38 % більше за типові 10 000 ₴»);
  - a категорія that this month has already reached the whole of last month («За 10 днів жовтня
    на Кафе пішло 4 200 ₴ — уже більше, ніж за весь вересень»);
  - a категорія that has grown for the third month running, or longer;
  - a regular payment whose price changed («Netflix: 349 ₴ замість звичних 299 ₴»);
  - a purchase far above what that продавець usually costs («у 4,2 раза більше, ніж зазвичай»);
  - a **можливий дубль**: two витрати on one рахунок with the same сума, dated at most a day
    apart.
- **[PROPOSED] Where спостереження appear:**
  - a new Головний widget «Спостереження», visible by default third, after «Останні 5
    транзакцій». It shows up to three спостереження of the current month. In the first seven days
    of a month it also leads to the previous month's підсумок;
  - a «Спостереження» block on Місяць for the shown month;
  - the підсумок місяця.
- **[PROPOSED] A fact is not dismissed; a question is answered.** Only a можливий дубль takes an
  answer, «Не дубль». The answer is remembered for that pair, travels in the бекап, and goes away
  with either транзакція. A real дубль is removed the way any транзакція is, from its own editing
  screen.
- **[PROPOSED] Every threshold is a named constant the owner may overturn**, as the тренди of the
  пакет already are. The thresholds:
  - typical = median of up to six завершені активні місяці before, at least three;
  - ±25 % against typical;
  - the **поріг помітності**: 3 % of the currency's типова сума of витрачено;
  - three months running;
  - a 5 % price band, wide enough for a subscription charged in foreign currency;
  - ×3 for a продавець.

  With less than three months of history, the four detectors that need a typical stay silent.
  Only the price change and the можливий дубль can speak then.
- **Owner's decision 2026-10-02: підсумок місяця.** Every завершений активний місяць has a pushed
  screen «Підсумок <місяця>». Per currency, never converted, it reads:
  - витрачено against the previous month and against the typical (median of up to six) month;
  - the three категорії that changed most;
  - the month's місячна картина (дохід, відкладено, інвестовано, позичено, залишилось);
  - the зміна статку with its розбивка;
  - what moved toward each ціль-накопичення, and which ліміти held;
  - what is still «Без категорії», «Без джерела» or a waiting чернетка, or that it is a чистий
    місяць;
  - the коригування and their **частка коригувань** against the 2 % of vision §15;
  - the month's спостереження.

  At the bottom, «AI-аналіз <місяця>» opens the existing AI-аналіз screen on that one month.
  Nothing leaves the phone until «Поділитися з AI» is pressed there.
- **[PROPOSED] Ways in to the підсумок:**
  - Місяць, when the shown month is a завершений активний місяць;
  - the spelled-out month on Звіти;
  - the Головний widget in the first seven days of a month.

  The current month has no підсумок; it is not finished.

**Non-goals**:
- any language model, on the phone or off it; no wording is generated;
- any forecast or pace projection. Vision §14.10 is deliberately not touched: the "already more
  than last month" спостереження compares two recorded facts and projects nothing;
- спостереження in the пакет для аналізу. That is a follow-up change; описи-based ones would need
  the «Продавці» opt-in;
- notifications of any kind for an спостереження. Vision §13 stays as it is;
- stored підсумки, stored спостереження, a "seen" state, or a history of either;
- hiding a fact, and per-owner thresholds in the UI;
- спостереження about доходи, перекази, інвестиції, рахунки or баланс банку;
- MCC-based detection, because MCC is not stored;
- stepping between підсумки on the підсумок screen itself (Місяць steps months);
- any change to how витрачено, a місячна картина, a ліміт, a ціль, a статок or a досягнення is
  computed;
- network work of any kind;
- merging or deleting a дубль from the спостереження itself.

## Capabilities

### New Capabilities

- `observations`: what an спостереження is, covering:
  - the six detectors and their exact conditions;
  - типова сума, the поріг помітності and the window they are read over;
  - order and per-currency rules;
  - the presentation contract (one sentence, its numbers, where a tap leads);
  - the «Не дубль» answer;
  - what never happens (model, forecast, network, notification, leaving the phone).
- `month-summary`: what a підсумок місяця holds, for which months, and how each part is computed
  from stored truth alone. It holds no new money rule, only readings of existing ones.
- `month-summary-screen`: the pushed «Підсумок <місяця>» screen. It covers its sections, what
  each leads to, its handling of a month that has no підсумок, and the AI-аналіз entry.

### Modified Capabilities

- `main-screen`: the default dashboard gains «Спостереження» third. A new requirement specifies
  that widget: up to three спостереження of the current month, «Усі (N)», «Не дубль», an empty
  state, and the previous month's підсумок in the first seven days.
- `dashboard-layout`: the registry knows six widgets, and the fresh default shows five, with
  «Спостереження» third and «Прогрес» still hidden.
- `month-screen`: a «Спостереження» block for the shown month, and «Підсумок <місяця>» for a
  завершений активний місяць.
- `reports-screen`: the spelled-out month leads to its підсумок when it is a завершений активний
  місяць.
- `ai-analysis-screen`: the screen can open on one given month, preset as a custom range, with
  every other default unchanged.
- `persistence`: «Не дубль» answers survive a restart, go away with either транзакція, and arrive
  by a new migration that keeps stored rows.
- `backup-file`: a бекап carries the «Не дубль» answers as an optional section, with no change
  to the format version.

## Impact

- **Docs.** `docs/product-vision.md` gets a new §19 «Спостереження і підсумок місяця» with the
  owner's two decisions and the [PROPOSED] defaults, plus one line in §15 that the підсумок
  reports the measure, and a pointer from §3. `docs/glossary.md` gets спостереження, типова сума,
  поріг помітності, можливий дубль («Не дубль»), підсумок місяця and частка коригувань, plus
  distinctions against AI-аналіз, досягнення, місячна норма витрат, типова категорія, підказка про
  дубль and зустрічний дохід.
  `docs/app-overview.md` updates §3.2, §3.3, §3.5 and §4.10, and gets a new §3.13.
- **Pure code:**
  - new `src/observations/`: detectors, typical/floor window, order;
  - new `src/month-summary/`: the assembly over `monthlyPicture`, `categoryBreakdown`,
    `monthFigures`, `overLimitBy`/`spendingGoalState` and the progress summary's unanswered
    counts;
  - `foldMerchant` (`src/analysis/details.ts`) and `largestPerMonthByKey`/`medianOf`
    (`src/analysis/trends.ts`) are reused, not copied.
- **UI:**
  - new `src/ui/observations.ts` and `src/ui/month-summary-screen.ts`;
  - new `src/components/observations-list.tsx` and `src/app/month-summary/[month].tsx`;
  - changed: `src/dashboard/layout.ts`, `src/ui/home-dashboard.ts`,
    `src/app/(tabs)/index.tsx`, `src/ui/month-screen.ts` + `src/app/(tabs)/month.tsx`,
    `src/ui/reports-screen.ts` + `src/app/(tabs)/reports.tsx`, `src/ui/ai-analysis-screen.ts` +
    `src/app/ai-analysis.tsx`.
- **Storage:**
  - new table `duplicate_answers`, with a new migration under the next free number (`0010`, taken
    at apply) and its test;
  - `src/db/` repository and snapshot/restore;
  - `src/backup/format.ts` gets an optional section, and `BACKUP_TABLES` changes.
- **Dependencies, native code and network:** none.
- **Overlaps:**
  - `category-icons-and-transaction-visuals` (3/31) touches transaction rows that the можливий
    дубль entry reuses;
  - `merchant-normalization` (proposed 2026-10-02) makes the продавець an entity. The detectors read
    the glossary's продавець and define none of their own, so whichever change lands second binds
    the recognised продавець (design D11);
  - `commitments` (proposed 2026-10-02) renames Місяць's «Розстрочки» block to «Платежі місяця».
    The «Спостереження» block is anchored to the breakdown, not to that block. Its «Оновити суму»
    and the price-change спостереження coexist;
  - `rule-template`, `merchant-normalization` and `commitments` each add a migration and bump
    `BACKUP_SCHEMA_VERSION`, so numbers are taken at apply time;
  - `voice-entry` (0/20) does not overlap, and nothing else touches the dashboard registry.
