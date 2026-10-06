## Context

See proposal.md — Why. The defects were mapped to code by three read-only passes on 2026-10-06;
every decision below names the place it lands. Four choices were the owner's (2026-10-06): UAH
everywhere instead of «₴», word-start matching, «Відкинути зміни?» on a dirty form, and the MCC /
monobank-link test for equal описи in a можливий дубль.

Three changes this one builds on are merged into `main` and not archived: `merchant-normalization`
(merchants, merchants-screen, its categorisation-rules amendment), `observations-and-month-summary`
(observations, month-summary, the month-screen and main-screen additions) and `commitments`
(commitments-screen, its month-screen renames). Deltas here on their requirements are copied from
their in-flight text and validate today; `openspec archive` accepts them only after those three are
archived (D1).

## Goals / Non-Goals

**Goals:** every defect of QA §2 either fixed with a test that would have caught it, or recorded
as not reproduced with the test that shows it; no new storage; nothing for vision §14.

**Non-Goals:** new thresholds or a new order of спостереження; правила for дохід; field-level
validation; any change to what monthly-picture counts; the cold-start blank «Місяць» (QA 2.25),
which the smoke pass watches instead.

## Decisions

**D1 — Archive order, not a merge into the three.** Folding these fixes into three in-flight
changes would reopen three reviewed changes for unrelated faults. This change carries its deltas
and archives last; task 0.1 checks the order before `/opsx:archive`.

**D2 — One money formatter, one date formatter.** `formatMoney` (`src/ui/amount-input.ts:212`) is
the only way a сума is drawn. `formatHryvnia` (`src/ui/receipt-screen.ts:39`) and `formatPlanMoney`
(`src/ui/commitments-screen.ts:46`) go; their callers — commitment-detail, commitments-screen,
installments-screen, installment-detail, month-screen, receipt-screen — call `formatMoney`.
`shortCalendarLabel` (`src/ui/dates.ts:112`) goes in favour of `calendarLabel` (`:86`), which already
writes «5 листопада» and adds the year when it is not the current one. The three ISO leaks —
`src/app/(tabs)/accounts.tsx:412`, `src/app/goal/[id].tsx:141`, `src/app/manage/monobank.tsx:811`
— take `calendarLabel`, as `src/ui/net-worth.ts:197` already does. A source-text test in
`src/ui/screens.test.ts` asserts no screen module writes «₴» or calls the removed helpers. The
«Статок» розбивка already writes each сума through `signedReadingAmount` → `formatMoney`
(`breakdownLines`, `src/ui/net-worth-screen.ts:188`) — «+60 000,00 UAH», pinned by
`src/ui/net-worth-screen.test.ts`; only its scenario, still in the old «+60 000» form, was wrong.
*Alternative:* «₴» everywhere — rejected by the owner; the ISO code is what money carries in the
domain (AGENTS.md) and what four of five screens already draw.

**D3 — One date control, one month stepper.** `DateField` (`src/components/form.tsx:127`) replaces
the free-text «РРРР-ММ-ДД» fields in `src/app/manage/goals.tsx:264`, `commitments.tsx:202`,
`installments.tsx:246` and `monobank.tsx:737,851`; the parse stays `parseTypedDate`
(`src/ui/dates.ts:303`). AI-аналіз's two month fields (`src/app/ai-analysis.tsx:190-205`) become a
`MonthStepper` (‹ місяць ›, capped at the current month) — a new component beside `DateField`,
whose label and bounds are pure functions in `src/ui/months.ts`. `MALFORMED_MONTH_MESSAGE` loses its
only producer and goes.

**D4 — Ukrainian order is applied in the UI.** The repos order by SQL `asc(name)` with BINARY
collation (`accounts-repo.ts:71`, `categories-repo.ts:60`, `named-list-repo.ts:122`); changing SQL
collation would need ICU in SQLite and a migration. Every alphabetical list already passes through
`byName` (`src/ui/labels.ts:46`, `localeCompare('uk')`) except two forms, which now do too: the
зобов'язання form (`src/ui/commitment-form.ts:93-100`) and the розстрочка form
(`debitAccountChoices` and `installmentCategoryChoices`, `src/ui/installment-form.ts:89-95`). A test over all `*Choices` builders asserts
«ПУМБ» follows «валюта моно».

**D5 — Status bar.** `<StatusBar style="auto" />` from `expo-status-bar` — already a dependency
(`package.json:51`), so no native change and no prebuild — in `RootLayout` (`src/app/_layout.tsx`),
beside `ThemeProvider`. The app follows the system appearance (`userInterfaceStyle: automatic`), so
«auto» is its theme. Proven on the emulator only.

**D6 — Dirty forms ask through the shared close-on-back hook.** `use-close-on-back` gains an
`isDirty` argument; every form that already uses it passes `!sameFields(current, opened)`, compared
on the form's own field object in `src/ui/*` (pure, testable). Forms that leave by screen back
rather than through the hook — the entry form and the editing of a транзакція (the hook there guards
only the picker, `src/app/transaction/new.tsx:184`, `[id].tsx:158`), «Звірити» and «Обʼєднати» on
`account/[id]`, `merchant/[id]`, and the репорт form (`src/components/bug-report-form.tsx`, which
does not use the hook) and sheet — register the same `isDirty` with the hook so one gesture handler
decides everywhere. A `Sheet` (Modal) hears «назад» through its own `onRequestClose`, not the hook,
so the продавець naming sheet, the репорт sheet and the crash fallback decide through the pure
`answerBackPress(isDirty, close, ask)` in `src/ui/back-gesture.ts`, which asks the same
`backGesture`; «Обʼєднати» keeps nothing typed and never asks. The list is app-shell's requirement, closed: a step of a flow (Saldo import,
«Перші кроки») is not a form. When dirty, back opens the app's
existing confirm dialog with «Відкинути зміни?» / «Відкинути» / «Лишитися». The `screens.test.ts`
proofs of "The back gesture discards the form" gain the answer; a new one proves "An untouched form
closes at once". *Alternative:* auto-save drafts — more storage and a new concept; rejected.

**D7 — Word-start matching is one helper.** `occursAtWordStart(folded, needle)` in
`src/domain/fold.ts`: true when `needle` occurs at index 0 or right after a character that is
neither `\p{L}` nor `\p{N}`, at any such index — or, when `needle`'s own first character is neither
`\p{L}` nor `\p{N}` («*megogo», «-маркет»), wherever it occurs, that character being the boundary. `src/domain/rules.ts:79-80` and
`src/domain/merchants.ts:150-151` call it instead of `includes`. The шаблон
(`src/domain/rule-template.ts`) keeps substring matching. Its patterns become ordinary `Rule`s in
`templateRules` (`src/domain/rules.ts:237`) and go through the same `bestTarget` → `matches`
(`:68-85`), so `Rule` gains `match: 'word-start' | 'substring'` — `'word-start'` for every правило
the owner stores, `'substring'` set only by `templateRules` — and `matches` dispatches on it. The
шаблон keeps substrings because its patterns are fragments («ярня»,
«kava», «apteka») written to occur inside words, and word-start would silently drop them; the
categorisation-rules delta says so. Stored категорії never move: rules
decide at import and in the «Без категорії» sweep, both of which only fill emptiness. What moves at
once is recognition, read every time — a продавець recognised inside a word stops being shown. Task
2.3 runs a Node script over the owner's бекап and writes, to `.cache/` (it holds real описи and is
not committed), every опис whose rule target or продавець differs; the result is summarised in the
change's tasks without the описи.

**D8 — Proposals.** `SERVICE_WORDS` (`src/domain/merchants.ts:165`) gains «oplata poslug», «oplata
tovariv», «oplata», «pokupka», «spysannia», «spysannya»; a new `PROCESSOR_PREFIXES` («liqpay»,
«wfp», «google», «paypal», «fondy», «portmone», «ipay», «sumup» — the last found by task 2.3) is skipped by `proposeMerchant` when followed
by optional spaces and «*» and then anything. «Uklon *trip» keeps «uklon» because «uklon» is not a
processor. `namelessGroups` (`src/ui/merchants-screen.ts:45`) drops описи whose fold starts with
`PERSON_PREFIXES` («від:», «переказ на картку», «переказ з картки», «поповнення «»). The proposed
pattern of a правило is `proposeMerchant(...).spelling` (`src/domain/rules.ts:325`) and inherits all
of it. The phone number in «Київстар +380…» already falls away at the letter run; nothing to do.

**D9 — Equal описи without a bank behind them.** `possibleDuplicates`
(`src/observations/duplicates.ts`) takes `linkedAccountIds: ReadonlySet<string>`; `sameBankText`
excludes an equal pair only when either carries an `mcc` or the рахунок is linked. The owner chose
"neither has an MCC"; the link test is this change's own refinement, confirmed by the owner on
2026-10-06, because MCC is stored only since migration 0012, so older monobank imports carry
none and two real coffees from 2026-08 would otherwise be asked about. Its cost is stated in the
spec: two hand records with one опис on a linked рахунок are not asked about, nor a hand record
beside the bank's record of it with the same опис (one carries an MCC; this was already so before
the change, which excluded every equal pair). Unlinking a рахунок turns its past equal pairs into
questions only where neither of the pair carries an MCC; a pair with an MCC stays excluded by the
MCC test. Storing each record's origin would be exact but needs a migration and a guess for old
rows; rejected for a defect sweep.
The hook that builds the ledger (`src/hooks/observations-reads.ts`) passes the linked ids it already
reads for Головний. Glossary «Можливий дубль» changes with it.

**D10 — «Не дубль» undo and «Видалити одну».** `duplicate-answers-repo` gains `forget(first,
second)`. After «Не дубль» the pair's row is replaced in place by «Позначено: не дубль ·
Скасувати», which stays until the screen loses focus: the screen re-reads right away, so the next
спостереження joins the list while the mark holds the pair's slot, and a pull-to-refresh while the
screen stays open does not clear it. «Скасувати» calls `forget`.
«Видалити одну» opens a two-choice sheet naming both транзакції, then the confirmation and delete
the editing screen already uses (`transactions-repo` delete, which unlinks plans and cascades the
answer). It is the owner's delete, the one the editing screen offers; the app still deletes
nothing on its own, and the спостереження is not dismissed — it ends because the pair no longer
exists. `src/components/observations-list.tsx:49` draws both verbs; the view model in
`src/ui/observations.ts` says which apply.

**D11 — Zero is absence; five then «Ще N».** `vs-typical` keeps emitting the observation (the fact
is true); `src/ui/observations.ts:126-131` phrases `amount === 0` as «цього місяця не було, зазвичай
T». `src/ui/month-screen.ts:387-416` and `src/ui/month-summary-screen.ts:250-255` cut at
`LIST_LIMIT = 5` from `src/observations/thresholds.ts` beside `HOME_LIMIT`, with an `expanded` flag
the screen toggles. Order is `src/observations/order.ts`, untouched.

**D12 — The no-token row is a reading of what Головний already has.** `homeViewModel`
(`src/ui/home-screen.ts:213-231`) computes `connected = configured && linked > 0`; a new branch
`linked > 0 && !configured` yields an attention item `bank-unheard` with the linked count and a
дата, both already read by the monobank port; no network. `syncCoverage`
(`src/ui/monobank-screen.ts:196`) gives `oldestCompletedMs` only when every link has synced, so it
gains `oldestSyncedMs`: the oldest `lastSyncedAtMs` among the links that have one, present whenever
`synced > 0`. The row names that дата, so a link that never synced does not hide the others'; with
`synced === 0` it names no дата and says they never synced. `oldestCompletedMs` and the freshness
line that reads it are untouched. The
freshness line stays absent in that branch. `src/monobank/auto.ts` `needsOwner` is untouched — this
is not a failed run, it is no run, and the background task should not notify about it.

**D13 — «Без джерела» mirrors «Без категорії».** `transactions-repo` gains an `unsourced` filter
beside `uncategorised` (`:74-77, 408`), `src/ui/transaction-search.ts` an `ONLY_UNSOURCED =
'unsourced'` param, mutually exclusive with `uncategorised`. `src/ui/transaction-line.ts:203` sets
`unsourced` for a дохід with `SOURCE_NONE`. The feed (`(tabs)/index.tsx:851`) and the list
(`transactions.tsx:357`) draw a source `Picker` under it, shortlisted by `src/ui/shortlist.ts` from
the latest доходи's джерела; storing is the same update the editing screen does for a джерело.
Routes: the підсумок's two counts (`src/ui/month-summary-screen.ts:359-381`) and the challenge action
(`src/ui/progress-screen.ts:443`) build `/transactions?month=M&only=…` from what is left.

**D14 — The quick picker's suggestion.** The feed and list pass `suggestedId =
resolveCategory(tiers, {description, mcc})` to `Picker`, which puts it first and marks it. A row the
sweep could have moved rarely reaches here; the ones that do are витрати the owner left «Без
категорії» by hand while a правило or the шаблон knew better — the QA case. `autoFocus` comes off the
expanded search `Field` (`src/components/form.tsx:707`).

**D15 — A коригування is read, its опис edited.** `shapesFor` (`src/ui/retype.ts:42-57`) still
offers no type for a коригування; `initialForm` returns a description-only form for it, and
`src/app/transaction/[id].tsx:375-410` draws сума, рахунок, дата, the опис field, «Зберегти» and
«Видалити транзакцію» with a confirmation that names сума and рахунок. The stale sentence goes;
`retype.test.ts:120`'s name ("because nothing can record one yet") changes with its reason. This
also closes main-screen's «The опис is visible everywhere and correctable», which the old screen
broke.

**D16 — Charts.** `src/ui/net-worth-screen.ts:310` passes `plotted.length + forecast.length` and a
cap derived from `width / MIN_LABEL_DP` to `monthTickLabels` (`src/ui/dashboard-charts.ts:327`),
and forecast slots get labels like any other. Reports: `axisOf` (`src/ui/reports-screen.ts:281`)
uses a whole-unit formatter; `MonthStrip` (`(tabs)/reports.tsx:206`) draws a leading «‹» fade while
`contentOffset.x > 0`.

**D17 — Words.** `magnitudeOf` (`src/ui/amount-input.ts:64`) answers '' with «Напишіть суму» and a
leading «-» with «Сума має бути більшою за нуль» before the number test; the fixed sentence of
`src/components/rule-offer-sheet.tsx:62` moves into `ruleOfferView` (`src/ui/list-management.ts:241`)
by target kind; the search hint becomes «опис, продавець або сума»; `NO_INCOME_NOTE`
(`src/ui/month-screen.ts:185`) takes `isCurrent`; «Закрий <місяць>» gets two ports,
`monthAccusativeYearLabel` («вересень 2026») and `monthInYearLabel` («у вересні 2026»), in
`src/ui/months.ts` beside `monthInLabel` (`:167`), wired in `src/hooks/progress-ports.ts:221`.

**D18 — Smaller fixes.** «Як у банку: …» is a chip under the Звірити field, from the bank balance
`src/app/account/[id].tsx:95` already loads, with the value from `account-movements.ts`.
«Оновити список рахунків» is `disabled` while `!configured` (`monobank.tsx:709`). The empty
«Спостереження» sentence moves into the widget's `ListCard` (`observations-widget.tsx:45`). The
зобов'язання category list (`commitmentCategoryChoices`, `src/ui/commitment-form.ts:98`) drops
`UNCATEGORISED_CATEGORY_ID` (the form's own «Без категорії» is its one offer of none),
`CORRECTION_CATEGORY_ID` and `FEES_CATEGORY_ID` («Комісія», `src/domain/transaction.ts:8`, reserved
in `RESERVED_CATEGORY_IDS`, `src/domain/category.ts:37`).
`transaction-row.tsx:52` gets `accessibilityLabel` from a new `feedA11yLabel` in
`src/ui/transaction-line.ts` that appends «понад ліміт». The «Статок» card's зміна
(`src/app/net-worth.tsx:132`, drawn in `textDanger` when it fell) gets `accessibilityLabel` from a
new `changeA11yLabel` on `MonthCard` in `src/ui/net-worth-screen.ts`, built with `spokenAmount` and
`DIRECTION_WORD` as the widget (`src/ui/net-worth.ts:826`) and the month table (`spokenMonth`)
already build theirs. Every `ThemedSwitch` without a label —
`home-dashboard.tsx:130`, `ai-analysis.tsx:223,235`, `reminders.tsx:145`, `installments.tsx:317`,
`bug-reports/index.tsx:49,60` — gets one. A переказ title draws each рахунок as its own
`numberOfLines={1}` text, ellipsized, «→» leading the second, so no word is ever split.

**D19 — Same-day bank order.** `mapStatement` (`src/monobank/sync.ts:373`) keeps the API's
newest-first order and `monobank-repo.ts:546-555` stamps `storedAt + index`, so the newest item of a
day is the *least* recently stored and sorts last. Sorting the mapped items ascending by bank time
before stamping makes storage recency equal bank time, which is what persistence's «The latest
stored transactions can be listed» already promises. A failing test in `monobank-repo.test.ts`
first. The QA report's «an edited transaction moves up» did not reproduce in code (`save` keeps
`createdAt`); task 10.2 proves it through the editing path and records the result either way.

## Risks / Trade-offs

- [Word-start matching changes recognition of the whole history at once] → task 2.3's report over
  the owner's бекап lists every продавець that would stop being recognised before the task is
  merged; a написання that only matched inside a word is rare and the owner can add the other
  spelling.
- [Equal описи on an unlinked рахунок are asked about though they may be two real purchases — two
  сповіщення of another bank for two coffees] → «Не дубль» answers it once and for good.
- [Two hand records with one опис on a linked рахунок are not asked about, nor a hand record beside
  the bank's record with the same опис; unlinking a рахунок makes its past equal pairs without an MCC
  questions] → stated in the spec; the owner confirmed the link test on 2026-10-06.
- [«Відкинути зміни?» touches every form at once] → it rides the one hook they already share; the
  dirty test is per form and pure; the smoke pass drives three forms.
- [«₴» → «UAH» rewrites ten requirements' scenarios across five specs] → generated mechanically
  from the in-flight text; `openspec validate --strict` holds; nothing but the sign and the
  shortened months changed in them.
- [Deltas on unarchived capabilities] → D1; task 0.1 fails the archive early if the order is wrong.

## Migration Plan

No schema change and no migration. Rollback is a revert of the merge: nothing stored by this change
outlives it except «Не дубль» answers, which the old code reads unchanged.

## Open Questions

- Whether `PROCESSOR_PREFIXES` and `PERSON_PREFIXES` need more entries — answered by task 2.3's
  report on the owner's 837 nameless описи, without changing the specs' shape.
