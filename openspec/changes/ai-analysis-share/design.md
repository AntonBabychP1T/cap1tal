# ai-analysis-share — design

## Context

See proposal.md — Why, and its «Architecture and plan» for the whole picture. What shapes the
decisions below, for this one change:

- **Everything the пакет needs is already computed.** `monthlyPicture` and `categoryBreakdown`
  (`src/domain/monthly-picture.ts`), `overLimitCategories` / `overLimitBy` (`limits.ts`),
  `goalProgress` / `isReached` / `isOverdue` (`goals.ts`), `computeBalance` (`account.ts`),
  `historyMonths` (`reports.ts`), `approximatePicture` (`src/ui/approx-uah.ts`), `formatMoney`
  and `byCurrency` (`src/ui/amount-input.ts`), `currentMonth` / `prevMonth` (`src/ui/months.ts`),
  `todayIso` (`src/ui/dates.ts`). This change adds statistics over those answers; it computes no
  money truth a second way.
- **`npm run verify` is Node-only.** Every decision — what is in the пакет, what the файл says,
  what the preview counts, which state the screen is in, what each outcome is called — is a pure
  function; the device is behind a port with a double (`backup-file.ts` is the template).
- **The share sheet cannot report cancellation.** `backup-file` D8 rejected `expo-sharing` for
  exactly that reason, because a бекап's screen must not claim «saved» when nothing was. Here
  the claim is weaker by design — «передано системі» — so expo-sharing's semantics are the
  honest ones, not a compromise.
- **A native module is a decision** (`.claude/rules/android.md`): `expo-sharing` is named here,
  installed with `npx expo install`, rebuilds the dev client, and adds no `app.json` change.
- **The domain rules on money apply to the пакет** even though it is text: integer minor units
  in, exact decimal text out, no float anywhere, no cross-currency sum except the one marked
  approximation the app already shows.
- **Hard rule 8**: `docs/product-vision.md` is not changed without the owner; the two lines in
  proposal §22 are a task gated on approval.

## Goals / Non-Goals

**Goals:**

- One builder, `buildAnalysisPackage`, whose inputs are plain values plus `builtOn`, and whose
  output is equal for any read order of the same rows.
- Exclusion by construction: the builder never receives the token, notification text, чернетки,
  cursors or bank balances, and never copies an id or a рахунок назва — and a test over the
  serialised text proves it with sentinels.
- The файл is one deterministic rendering with the пакет embedded whole, so the preview, the
  copied text and the shared file are the same bytes.
- The screen model is a state machine over values; the JSX maps over it and decides nothing.

**Non-Goals:**

- No inference port, no model, no `PromptProfile` other than `'external-advanced'` in code (the
  type is a one-member union today; Phase 2 widens it).
- No abstraction over «assistants»: the chooser is the abstraction.
- No caching of a built пакет across screen openings; building is cheap (one pass over the
  history) and stale data is worse than recomputing.
- No settings section, no stored preference, no migration.

## Decisions

**D1. `src/analysis/` is its own pure module, beside `src/domain/`, not inside it.**
The domain holds money truth under `.claude/rules/domain.md`; the пакет is statistics over that
truth (shares, changes, medians, recurrences) plus a prompt — none of which is a rule of the
product, and all of which may change with the model's needs. `src/analysis` imports from
`src/domain`, from `src/ui/amount-input.ts`, `months.ts`, `dates.ts` and `approx-uah.ts`, and
from `src/monobank/currency.ts` for the `MonobankRate` type (the builder takes rates as
`MonobankRate & KnownRate`, `KnownRate` being `approx-uah.ts`'s own `{ currency; obtainedAt }`,
so `src/db/rates-repo.ts`'s `StoredRate` fits without being imported); it imports nothing from
`src/db`, React, Expo or `src/platform`. Rejected: **inside `src/domain`** — the prompt template is not domain, and
the domain must not learn a model's vocabulary. Rejected: **inside `src/ui`** — the пакет is
consumed by a file and later a model, not by a screen.

**D2. Amounts are exact decimal text; ratios are integer basis points; rounding is half away
from zero.** `src/analysis/decimal.ts`: `decimalOf(money: Money): Amount` is `formatMinorUnits`
with `.` instead of `,` and no thousands separator, so `412534 UAH` → `"4125.34"`; `bp(part,
whole): BasisPoints | null` is `round(part × 10000 / |whole|)` and `null` when `whole` is 0;
`changeBp(before, after)` is `bp(after − before, before)`; `average(amounts[])` is an integer
minor-unit mean, rounded half away from zero, in `BigInt` like `approximateUah` so no product
exceeds 2^53. Rejected: **JSON numbers** — a float somewhere would follow; **minor units as
integers in the JSON** — a 1B model reading `412534` as hryvnias is the first hallucination.

**D3. The builder's shape.** `buildAnalysisPackage(input: { kind: 'monthly-picture'; period: PeriodChoice;
included: { descriptions; transactions }; builtOn: IsoDate; accounts; transactions; categories;
sources; limits; goals; rates }): AnalysisPackage | AnalysisRefusal` where `AnalysisRefusal = { kind:
'empty-period' }`. Steps, each its own file with its own tests: `period.ts` resolves the choice
to `[from, to]` months and the partial month (a `PeriodChoice` is `'this-month' | { lastMonths:
3 | 6 | 12 } | { from: Month; to: Month }`); `monthly.ts` computes every month's `monthlyPicture`
over the history grouped by month (the domain's own `byMonth` idea, re-implemented locally in
three lines — `reports.ts` does not export it), the currencies of the period (every currency a
сума of a транзакція of the period carries, both legs of a переказ included and `originalAmount`
never read — `monthlyPicture`'s own keys would drop the arrival leg of a cross-currency переказ,
which the spec requires to hold a report of its own at zero), the previous-month changes (which may read one
month before `from`), the period totals, per-month-with-data averages, the baseline (the
up-to-12 months before `from` that hold транзакції) and the two rates; `categories.ts` folds
`categoryBreakdown` per month into `CategoryReport`s, resolving names through `namesById`, the
reserved ids under their seeded names and an archived категорія marked by the `CategoryReport`'s
own `archived` flag — never a « (архів)» suffix inside the назва, since the flag is the marking
and a suffix would sit inside the name a reader compares —
judging ліміти with `overLimitBy` in the ліміт's own currency only; `trends.ts` derives the caps
and the recurring rule; `goals.ts` maps `goalProgress`/`isReached`/`isOverdue` and the pace;
`details.ts` builds merchants and transaction lines, resolving a дохід's джерело through
`namesById` over the `sources` exactly as категорії are resolved — a `sourceId` in the пакет would
be one of the identifiers the spec forbids. `package.ts` sorts the транзакції by
(date, type, amount, category/source, description) first — the determinism guarantee — assembles
the pieces, and counts.

**D4. The recurring rule and the caps, stated once.** A категорія (or merchant) is a recurring
candidate when, taking the largest single витрата of it in each month of the period, at least
`ceil(2/3 × months)` months (and at least 3) hold one within ±15 % of the median of those; the
typical сума is that median. Caps: 5 largest категорії, 5 increases, 5 decreases, 5 notable
витрати, 20 merchants. Both rules are constants in `trends.ts` with a comment; proposal §20 names
them as the owner's to overturn.

**D5. Exclusion is by construction, and proven over the serialised text.** The builder's input
type has no field for a token, a баланс банку, a notification, a чернетка, a cursor or a watched
app — the screen cannot pass what the type does not name. Ids and рахунок назви *are* in the
input (the domain types carry them) and are dropped by the mappers: categories by name, transfers
by `AccountKind`, goals without their `accountId`. `privacy.test.ts` builds a fixture whose every
id and рахунок назва carries the sentinel `ZZ-SENTINEL-`, renders the document with both
switches on, and asserts the text does not contain the sentinel; a second assertion with both
switches off asserts no опис of the fixture appears. A `fast-check` property generates random
histories and asserts the same over `JSON.stringify(package)`.

**D6. The файл: Markdown with the пакет in a fenced JSON block, shared as `text/plain`.**
`document.ts` renders four sections under `# cap1tal · AI-аналіз місячної картини`: `## Інструкції`
(the profile's instruction text from `prompt.ts`), `## Контекст` (the glossary's definitions of
the six numbers, the identity, the five distinctions, the per-currency rule, the partial month,
the basis-point convention, the meaning of `null`), `## Підсумок` (per currency: a table of the
months with the six numbers via `formatMoney`; the five largest категорії; the ліміти exceeded;
the цілі — every figure taken from the пакет), and `## Дані` with ```json and the пакет through
`canonicalJson` from `src/backup/canonical.ts` (already pure, already tested — the sorted keys
are what make the rendering repeatable; `src/analysis` importing from `src/backup` is a pure
import and is allowed). A header line names schema, version, kind, period and `builtOn`. The
name is `cap1tal-ai-<kind>-<from>_<to>.md`. The MIME passed to the chooser is `text/plain`
(widest intent filters; a `.md` is plain text). Rejected: **JSON only** (no brief, and an
assistant «analyses the file» instead of following instructions); **`.txt`** (the same bytes
with a worse extension for assistants that render attachments); **`text/markdown`** (narrower
chooser; one constant to change if the owner's phone shows otherwise).

**D7. The dependency is `expo-sharing` 57.x, and nothing else changes natively.** Installed
with `npx expo install expo-sharing`. Its Android manifest declares the `FileProvider`
(`${applicationId}.SharingFileProvider`, paths include `cache-path "."`) and the `<queries>` for
`ACTION_SEND */*`; prebuild merges both. No `app.json` entry, no permission, no plugin. The dev
client must be rebuilt — `scripts/android.sh up` does so because `package.json` is newer than
the APK — and `npx expo-doctor` is run. Rejected: **RN's `Share.share`** — text only, `EXTRA_TEXT`
through Binder with a hard 1 MB ceiling and a practical one well below, and no better cancel
semantics; **SAF like `backup-file`** — a folder picker is the wrong gesture for «send this to an
app»; **a local module** — writing FileProvider and chooser code that expo-sharing already is.

**D8. The port: `src/platform/analysis-share.ts`.** `AnalysisSharePort { share({ name, text }):
Promise<AnalysisShareOutcome> }`, outcomes `handed-over | unavailable | failed(reason)`.
`inMemoryAnalysisShare({ outcome? })` records `handed()` — every файл that was actually handed
over — so «backing out claims nothing» is provable for `unavailable` and `failed`, and so the
screen's tests can assert the exact text that left. The adapter `analysis-share-device.ts`:
`Platform.OS === 'web'` → `unavailable`; `await Sharing.isAvailableAsync()` false →
`unavailable`; `new Directory(Paths.cache, 'ai-analysis')` — delete its contents if it exists,
create it, `new File(dir, name).write(text, { encoding: 'utf8' })` → any throw is `failed` with
the message; `await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle:
'Поділитися з AI' })` → resolve `handed-over`; a throw (including `SharingInProgressException`)
→ `failed`. The файл is *not* deleted after the promise: the chosen app may still be reading the
content URI; the next run's emptying is the cleanup. The existing `backup-file.test.ts` guard
(«is the only file under src/platform that a test imports») already refuses a test that imports
`-device`; the new port test follows the same pattern of asserting its own file names no native
import.

**D9. The screen model: `src/ui/ai-analysis-screen.ts`.** `aiAnalysisModel(input: { choices;
stored; today; })` returns `{ period; preview | refusal; warning; canShare }` — the preview built
from the very пакет that would be shared (counts, the size as the UTF-8 byte length of
`document.text` via `TextEncoder`, in KB — the файл is mostly Cyrillic, so `text.length` would
understate what leaves by about 40 % — and the two flags), plus `runOutcomeWords(outcome)` mapping each port outcome and the copy action to the
sentences of the spec. The preview is live: the model is recomputed from the choices on opening
and on every change, in memory, so there is no `choosing` state distinct from `preview` and no
«Переглянути» action — the state machine is `preview → sharing → handed-over | unavailable |
failed | copied`, with `empty-period`, `empty-history` and `invalid-range` as previews that carry
no primary action — `invalid-range` is `isMonth(from) && isMonth(to)` and then
`refusesRange(from, to)`, both asked before anything is built, so neither a month still being typed
(«2026-0» on the way to «2026-08», which the emulator found as a red Render Error) nor a range that
ends before it starts is ever an exception; each is a sentence the owner reads, as `nextState(state, event)` over values. Options live in React state only — never in
storage (spec: not remembered). The screen `src/app/ai-analysis.tsx` reads
the repos on focus like `reports.tsx`, calls the model, and calls the port or
`Clipboard.setStringAsync` on the two actions. Registered in `_layout.tsx` beside
`transactions`. The entry on `reports.tsx` is one `Card` with «AI-аналіз» and a hint, at the
bottom of the tab, linking to `/ai-analysis`.

**D10. The approximate UAH figure rides `approximatePicture`.** The period totals per currency
are given to the existing `approximatePicture` with `rates.all()`; `null` when a rate is missing
(its rule), so the пакет's `approximateUah` is exactly the app's own approximation; each rate's
`rateAsOf` is `todayIso(obtainedAt)`. Nothing else in the пакет crosses currencies.

**D11. The prompt is data.** `prompt.ts` exports `INSTRUCTIONS['external-advanced']` and
`CONTEXT` as arrays of sentences, joined by the renderer; tests assert the presence of each
required sentence (use only the data; facts vs assumptions; recommendations marked; no invented
numbers, категорії, транзакції or currencies; no recomputation; no cross-currency sums; partial
month is partial; no forecast; answer in Ukrainian; the seven-part answer shape). Ukrainian, as
the app is. A golden file `document.golden.md` for one fixture holds the whole rendering: a
change to wording fails the test loudly and is updated deliberately (an exception to «no
snapshot-only» — this is not domain code, and the semantic assertions stand beside it).

**D12. Vision and glossary edits are tasks with a gate.** Task 1.1 adds the four glossary
terms (they are needed by hard rule 7 for the code's names: `AnalysisPackage` = пакет для
аналізу, `AnalysisDocument` = файл для аналізу, `share` = передати). Task 1.2 adds the two
vision lines of proposal §22 **only if the owner has approved them in review**; if the owner
declines them, task 1.2 reports BLOCKED and **no batch after group 1 starts**: the lines are
the reading of vision §1 under which a файл may leave the phone at all, and code written
against a refused reading would be code against the vision.

**D13. Investment AI-аналіз is the next change, and the kind field is ready for it.**
`AnalysisKind` is `'monthly-picture'` today; `ai-investment-analysis` widens it after `investments-value`
archives, adds `src/analysis/investments.ts` (вкладено, вартість, прибуток, ROI and XIRR in basis
points over dated integer cashflows), a kind chip on the screen, and its own delta specs. Nothing
here anticipates it in code.

## Risks / Trade-offs

- [An assistant app is not offered for `text/plain`] → «Скопіювати» is always there and the
  файл fits the clipboard; the MIME is one constant; the owner's phone, not the emulator, is
  where the assistants are checked (task 6.3).
- [A file in the cache after the run] → app-private, one at a time, emptied on the next run;
  Android may purge it; never in a бекап; stated in the spec.
- [expo-sharing promise never resolves after a dismissed chooser (historic issue)] → the
  smoke's «dismiss, then share again» step; the screen's `sharing` state has no timeout by design
  — a stuck promise is a defect to fix in the adapter, not to hide with a timer.
- [The пакет grows with 12 months × merchants × transactions] → the caps in D4; transactions are
  the only unbounded part and are opt-in with their count in the preview; 5 000 транзакції render
  in well under a second on the JS thread.
- [Reserved категорії names] → «Коригування», «Комісія» and «Без категорії» come from the seeded
  rows through `namesById` like every other name; the tests use the seeded names.
- [The builder reads one month before `from` for the first change] → deliberate and documented in
  the `MonthReport` type; the month itself is not in the series.

## Migration Plan

1. `npx expo install expo-sharing`; `npx expo-doctor`; rebuild the dev client
   (`scripts/android.sh up`).
2. `src/analysis/` bottom-up with tests, then `document.ts` and the golden file.
3. The port and its double; the adapter.
4. The screen model, the screen, the entry, the route.
5. Smoke on the emulator; the assistants on the owner's phone.
6. Rollback is a git revert: no migration, no stored state, one dependency.

## Open Questions

- Whether «Показати файл» should offer a monospace raw view or a rendered one — raw in this
  change; either is a screen-only choice.
- Whether the preview should also name the largest категорія — it is in the файл already; a
  screen-only choice.
