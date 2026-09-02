# ai-analysis-share — proposal

This proposal is two things at once. Its first four sections are the ordinary OpenSpec proposal
of **one small change** — the AI-аналіз foundation and the external hand-off through the
Android share sheet (Phase 1). The «Architecture and plan» part after them is the whole picture
the owner asked for: the model of AI in cap1tal, the contract of the пакет для аналізу, the
route abstraction, the local-LLM research plan, the privacy model, the phases, and what each
phase would do to `docs/product-vision.md`. Later phases are **not** implemented by this change;
they are named so this change does not stand in their way.

## Why

Both product questions — «куди пішли гроші» and «на що звернути увагу» — are answered today by
numbers: the monthly picture, the breakdown, the ліміти, the two charts on «Звіти». The numbers
are right, and reading them is still work: seeing that «Кафе» doubled while дохід fell, that one
ремонт авто explains a whole month, that відкладено has been steady for half a year, is a
reading of the numbers the app does not do. The owner already pays for an assistant (ChatGPT,
Claude) that reads such things well — but feeding it the month by hand means retyping the
numbers, and feeding it a бекап means handing over every identifier, назва and опис the app
holds.

This change lets the app do the reading-out itself, deterministically and locally — every figure
computed by the existing domain code, per currency, with no identifier, secret or bank text —
and hand that one file to whatever assistant the owner picks in the phone's own chooser. The
assistant explains; it never computes, never touches a number in the app, and never gets more
than the owner chose to include. A local, offline model can take the same file later; nothing
here waits for it.

## What Changes

- **New capability `ai-analysis-package`** — the пакет для аналізу: a versioned, deterministic,
  provider-independent bundle built from stored транзакції, категорії, ліміти and цілі for a
  kind of AI-аналіз (the monthly picture, in this change), a period of whole calendar months and the owner's
  detail choices. Per currency, never mixed, every сума an exact decimal text with its currency
  code, every ratio an integer in basis points. It carries the monthly picture of every month of
  the period, category analytics (share, change, average, ліміт and overrun), deterministic
  trends (month-over-month change, averages before the period, largest категорії and changes,
  notable витрати, recurring candidates, savings and investment rates), every ціль with what
  remains and its pace, and — only when the owner turns them on for that run — описи (merchants)
  and individual транзакції. It never carries an identifier, a рахунок назва, the monobank token,
  a баланс банку, notification text, чернетки, відстежувані застосунки or the бекап.
- **New capability `ai-analysis-share`** — the файл для аналізу: the пакет rendered into one
  self-contained Markdown text (instructions to the assistant in Ukrainian, the glossary's
  definitions as context, a human-readable summary, the пакет as data) that leaves the phone
  only through the system's chooser of apps, only by the owner's explicit action; what the app
  may claim afterwards (handed to the system — never received or answered); the файл's life in
  private storage (one at a time, never in a бекап); no network connection, no key, no server;
  and copying the same text to the clipboard instead.
- **New capability `ai-analysis-screen`** — the «AI-аналіз» screen reached from «Звіти»: kind,
  period («Цей місяць», 3, 6, 12 months, custom range), the two detail switches (off by default,
  never remembered), the preview of exactly what would leave (months, транзакції, категорії,
  currencies, описи так/ні, окремі транзакції так/ні, size), the full text on request, the one
  primary action «Поділитися з AI», the outcomes in the owner's words, the empty and short-history
  states, and the rule that no answer ever comes back into the app.
- **Modified capability `reports-screen`** — «Звіти» offers «AI-аналіз» (an added requirement;
  nothing it shows today changes).
- **Documentation** — `docs/glossary.md` gains «AI-аналіз», «Пакет для аналізу», «Файл для
  аналізу» and «Передати (в інший застосунок)»; `docs/product-vision.md` gains the sentences
  listed in §22 below **only after the owner approves them** (hard rule 8 — the vision is never
  changed silently); `docs/app-overview.md` and the tech-task §5 «поза нумерацією» table gain
  the change.

**Non-goals of this change** (each is a later phase or a deliberate never):

- No local model, no download, no inference on the phone — Phase 2 researches it, Phase 3 ships
  it if the research passes. Nothing in this change waits for it.
- No cloud API, no API key, no BYOK — Phase 4, a separate proposal, and a vision change.
- No investment AI-аналіз — it needs `investments-value` (вкладено, поточна вартість, прибуток)
  to be archived first; it is the next change, `ai-investment-analysis`, and the пакет's kind
  field is already open for it.
- No AI categorisation, no «Ask my finances», no portfolio advisor — Phase 5, separate changes;
  §21 names what each needs.
- No answer read back, no stored run, no history of analyses, no setting that remembers the
  detail switches: the app writes nothing because of an AI-аналіз.
- No deep link to any assistant, no preference among assistants, no app-specific behaviour: the
  system chooser is the whole mechanism (vision §12 stays true: no new outbound connection).
- No migration and no schema change.
- No forecast in the пакет (vision §14.10): every number in it is about months that happened,
  with one deliberate exception that is not a forecast — a ціль's `perMonth`, the remaining сума
  divided by the months to its own дата. It is arithmetic on the target and the дата the owner
  set, not an extrapolation of any pace («at this pace you will have X» is what §14.10 excludes,
  and nothing in the пакет says it). Listed in §20 as the owner's to overturn.

Vision §14 items this change touches deliberately: none is crossed. §14.9 (no cloud services)
is respected — a share sheet is the owner's hand, not a service. §14.10 (no forecasts) is
respected in the data and asked of the assistant in the instructions. §14.15 (iOS possible) is
kept: the hand-off sits behind a port, and the share sheet exists on iOS too.

## Capabilities

### New Capabilities

- `ai-analysis-package`: what a пакет для аналізу holds, how it is built (deterministically, per
  currency, from stored truth alone, for a kind, a period and the owner's detail choices), what
  it may never hold, and when it refuses to be built (an empty period) or flags itself (a short
  history).
- `ai-analysis-share`: the self-contained файл для аналізу, its deterministic rendering, the
  system chooser as the only way out and the owner's action as the only trigger, the honest
  outcomes, the файл's private and single life, no connection and no key, and the clipboard
  alternative.
- `ai-analysis-screen`: the «AI-аналіз» screen — choices, preview, the primary action, the
  outcome states, the empty and short states, and that nothing comes back as truth.

### Modified Capabilities

- `reports-screen`: the «Звіти» tab offers «AI-аналіз», which opens the AI-аналіз screen and
  does nothing else.

## Impact

- New pure module `src/analysis/` (package types and builder, period, monthly, categories,
  trends, goals, details, decimal text and basis points, prompt template, document rendering)
  with colocated tests — imports `src/domain/**` and `src/ui/amount-input.ts`/`months.ts`, never
  `src/db`, React or a native module.
- New port `src/platform/analysis-share.ts` with its in-memory double, and the adapter
  `src/platform/analysis-share-device.ts` over `expo-sharing` and `expo-file-system` — the
  adapter is loaded by no test.
- New screen logic `src/ui/ai-analysis-screen.ts` (choices, preview, run state machine, words)
  with tests; new screen `src/app/ai-analysis.tsx` registered in `src/app/_layout.tsx`; one
  entry on `src/app/(tabs)/reports.tsx`.
- **New dependency `expo-sharing` (57.x)** — a native module: the dev client is rebuilt,
  `npx expo-doctor` is run, no `app.json` change (its FileProvider and `<queries>` entry come
  from its own manifest). Named here and in design D7 as `.claude/rules/android.md` requires.
- No migration, no table, no permission, no new network endpoint. `npm run verify` stays
  Node-only and under a minute; the chooser is proven on the emulator.
- **One dependency on another change in flight:** the empty-history state «Записати першу» pushes
  `/transaction/new`, the entry form owned by `home-daily-overview`. Expo-router would otherwise
  match that path against the dynamic `transaction/[id]` route and open the *editor* of a
  транзакція whose id reads "new", so this change must not be merged before that route exists. A
  test in `src/ui/ai-analysis-screen.test.ts` asserts the file and its `_layout.tsx` registration,
  so `verify` fails loudly rather than the phone failing quietly.
- Docs: `docs/glossary.md`, `docs/product-vision.md` (owner-approved lines only),
  `docs/app-overview.md`, `docs/tech-task.md` §5.

---

# Architecture and plan

## 1. Problem statement

cap1tal computes the truth about one person's money and shows it as numbers. It does not read
the numbers out: it will not say which change matters, why this month differs from the last,
or what one large витрата explains. Large language models do that well and compute badly;
cap1tal computes well and does not interpret. The two must be joined without the model ever
becoming a source of financial truth, without the app acquiring a server, a key or a new
outbound connection, and without the owner's identifiers, назви and bank texts leaving the
phone by default.

## 2. Goals

1. Every number an assistant sees is computed by cap1tal's deterministic code, per currency,
   before the assistant sees it. The assistant interprets; it never calculates.
2. One canonical `AnalysisPackage` feeds every route — an external assistant now, a local model
   later, a BYOK cloud provider if the owner ever wants one — so routes are interchangeable and
   none of them knows SQLite, repositories or React.
3. Data leaves the phone only by the owner's explicit hand, through the system's own chooser,
   after a preview of exactly what leaves; the default is aggregates only.
4. The first implementation is small: `AnalysisPackage → self-contained file → share sheet`.
5. Everything that decides is pure TypeScript under `npm run verify`; the device is behind a
   port with a double, as everywhere in `src/platform/`.
6. Local-first stays a property of the code: no cap1tal server, no telemetry, no key, no
   network call for an AI-аналіз.

## 3. Non-goals

The list in «What Changes» above, plus, across all phases:

- The model never: computes balances, sums across currencies, decides a financial result,
  computes ROI/XIRR/ліміти/залишилось, generates SQL, reads SQLite, changes a транзакція,
  makes a payment, or decides anything on the owner's behalf.
- No AI answer is ever stored as truth, and no AI proposal reaches the data except through the
  ordinary deterministic screens, by the owner's hand.
- No analytics, no crash reporting, no remote config, no model telemetry — ever.

## 4. User scenarios

1. **Month review.** On the 1st the owner opens «Звіти» → «AI-аналіз», keeps «Місячна картина»
   and «Останні 3 місяці», sees «3 місяці · 214 транзакцій · 14 категорій · UAH, USD · продавці:
   ні · окремі транзакції: ні · ≈ 21 КБ», taps «Поділитися з AI», picks Claude in the chooser,
   reads the answer there. Nothing in cap1tal changed.
2. **Deeper look.** Same, but the owner turns «Продавці» on to learn which merchants drive
   «Кафе». The preview says «продавці: так» and the size grows before anything leaves.
3. **Half a year with everything.** The owner turns both switches on for «Останні 6 місяців»
   to ask about specific purchases; the preview says «окремі транзакції: так · 642»; the owner
   reads the full text first, then shares.
4. **Nothing to analyse.** A custom range over months with no транзакції: the screen says so
   and offers no share.
5. **First month.** One month of history: the screen warns that one month shows no trend and
   still lets the owner share.
6. **No chooser.** On a platform without a share sheet, or when the файл cannot be written, the
   screen says so and offers «Скопіювати» instead; the clipboard gets the same text.
7. **Later, offline (Phase 3).** The same screen offers «Локально» beside «Поділитися з AI»; the
   answer appears in the app, marked as the local model's and as basic; still nothing is stored.

## 5. Architecture

```
SQLite ──► repositories ──► plain values ──► src/domain (monthly picture, breakdown,
                                            balances, limits, goals — existing, unchanged)
                                                     │
                                                     ▼
                                      src/analysis  (new, pure)
                                      period → monthly → categories → trends → goals → details
                                                     │
                                                     ▼
                                              AnalysisPackage  (canonical, versioned)
                                                     │
                                     ┌───────────────┼──────────────────────┐
                                     ▼               ▼                      ▼
                             AnalysisDocument   (Phase 2/3)            (Phase 4)
                           = prompt + context   local inference        BYOK cloud
                           + summary + data     port (Kotlin module)   provider port
                                     │
                                     ▼
                         src/platform/analysis-share  (port + double; adapter = expo-sharing)
                                     │
                                     ▼
                              Android / iOS system chooser  →  the app the owner picks
```

Responsibilities, by layer:

| Layer | Owns | Never |
| --- | --- | --- |
| `src/domain` | money truth: the six numbers, breakdown, balances, ліміти, цілі | anything AI |
| `src/analysis` | the пакет: statistics over domain outputs, exclusions by construction, the prompt template, the файл rendering | reading the database, a clock, a network, a native module |
| `src/ui/ai-analysis-screen.ts` | choices, preview, the run state machine, every word the screen says | JSX, side effects |
| `src/platform/analysis-share` | handing one файл to the system chooser | choosing an app, knowing what the owner did after |
| `src/app/ai-analysis.tsx` | wiring: repos → builder → model → port | decisions |

The line the user asked for — «AI provider не повинен знати про SQLite та repositories» — is a
property of the imports: `src/analysis` and `src/platform` import nothing from `src/db`, and the
screen is the only place both are named.

## 6. `AnalysisPackage` — the contract

Version 1, kind `monthly-picture` (label «Місячна картина», the glossary term; «budget» would collide with vision §9, which means ліміти). TypeScript is the contract; the JSON is its `JSON.stringify` with keys
in the order declared (the renderer sorts keys canonically, as `src/backup/canonical.ts` does, so
the same пакет is the same text).

```ts
// src/analysis/package.ts
export const ANALYSIS_PACKAGE_SCHEMA = 'cap1tal.analysis-package';
export const ANALYSIS_PACKAGE_VERSION = 1;

export type AnalysisKind = 'monthly-picture'; // 'investments' is added by ai-investment-analysis

/** Exact decimal text of major units with its currency: { amount: "4125.34", currency: "UAH" }.
 *  Never a JSON number: nothing downstream parses a float, and a model reads it as a person does. */
export interface Amount { readonly amount: string; readonly currency: CurrencyCode }
/** An integer number of basis points (1/100 of a percent): 2500 = 25.00 %. */
export type BasisPoints = number;

export interface AnalysisPackage {
  readonly schema: typeof ANALYSIS_PACKAGE_SCHEMA;
  readonly version: typeof ANALYSIS_PACKAGE_VERSION;
  readonly kind: AnalysisKind;
  /** The device's calendar day the пакет was built for — an input, never a clock read. */
  readonly builtOn: IsoDate;
  readonly period: AnalysisPeriod;
  readonly included: { readonly descriptions: boolean; readonly transactions: boolean };
  readonly counts: {
    readonly transactions: number;
    readonly categories: number;
    readonly currencies: readonly CurrencyCode[];        // UAH first, then alphabetical
    readonly accountsByKind: Readonly<Record<AccountKind, number>>;
    readonly monthsWithData: number;
  };
  /** 'short' when fewer than two months of the period hold транзакції. */
  readonly history: 'short' | 'sufficient';
  readonly byCurrency: readonly CurrencyReport[];       // one per currency, never merged
  readonly approximateUah: ApproximateUah | null;       // only when every foreign rate is known
  readonly goals: readonly GoalReport[];
  readonly transactions?: readonly TransactionLine[];   // present only when included.transactions
}

export interface AnalysisPeriod {
  readonly calendar: 'calendar-month';
  readonly from: Month;                                  // 'YYYY-MM', inclusive
  readonly to: Month;
  readonly months: number;
  /** The month builtOn falls in, when it is inside the period. */
  readonly partialMonth: { readonly month: Month; readonly daysElapsed: number; readonly daysInMonth: number } | null;
}

export interface SixNumbers {
  readonly spent: Amount; readonly income: Amount; readonly invested: Amount;
  readonly saved: Amount; readonly lent: Amount; readonly left: Amount;
}
export type SixChanges = { readonly [K in keyof SixNumbers]: BasisPoints | null };

export interface MonthReport extends SixNumbers {
  readonly month: Month;
  readonly partial: boolean;
  /** Against the calendar month before this one (which may lie before the period); null per
   *  field when that month holds nothing or the base is zero. */
  readonly changeVsPreviousMonth: SixChanges | null;
  readonly savingsRate: BasisPoints | null;             // saved / income
  readonly investmentRate: BasisPoints | null;          // invested / income
}

export interface CurrencyReport {
  readonly currency: CurrencyCode;
  readonly months: readonly MonthReport[];              // every month of the period, zeros kept
  readonly period: SixNumbers & {
    readonly averagePerMonth: SixNumbers;               // over months of the period with data
    readonly savingsRate: BasisPoints | null;
    readonly investmentRate: BasisPoints | null;
  };
  /** The up-to-12 months before the period that hold транзакції, averaged. */
  readonly baseline: { readonly monthsBefore: number; readonly averagePerMonth: SixNumbers } | null;
  readonly categories: readonly CategoryReport[];       // by total, largest first
  readonly trends: Trends;
  readonly merchants?: readonly MerchantReport[];       // present only when included.descriptions
}

export interface CategoryReport {
  readonly name: string;                                // the owner's назва; never an id
  readonly archived: boolean;
  readonly total: Amount;
  readonly share: BasisPoints | null;                   // of the period's витрачено
  readonly byMonth: readonly { readonly month: Month; readonly amount: Amount }[];
  /** The anchor month — the latest non-partial month of the period, or the partial one when the
   *  period holds no other — against the calendar month before it (which may lie before the
   *  period), both named; `partial` when the anchor is the partial month; `change` null when the
   *  earlier month holds none of the категорія. The same anchor rule governs Trends. */
  readonly changeVsPreviousMonth: { readonly from: Month; readonly to: Month; readonly partial: boolean; readonly change: BasisPoints | null };
  readonly baselineAverage: Amount | null;              // the same baseline months as above
  readonly changeVsBaseline: BasisPoints | null;        // period average vs baseline average
  readonly limit: { readonly amount: Amount; readonly exceeded: readonly { readonly month: Month; readonly by: Amount }[] } | null;
}

export interface Trends {
  readonly largestCategories: readonly { readonly name: string; readonly total: Amount; readonly share: BasisPoints | null }[]; // ≤ 5
  readonly largestIncreases: readonly CategoryChange[]; // ≤ 5, by changeVsPreviousMonth
  readonly largestDecreases: readonly CategoryChange[]; // ≤ 5
  /** The largest single витрати of the period, ≤ 5 — витрати only («Комісія» and «Без
   *  категорії» included; never a повернення or коригування): no опис unless descriptions are
   *  included, the month only unless transactions are included (then the дата). */
  readonly notable: readonly { readonly amount: Amount; readonly category: string; readonly month: Month; readonly date?: IsoDate; readonly description?: string }[];
  /** Категорії where one витрата of about the same сума recurs in most months of the period. */
  readonly recurring: readonly { readonly category: string; readonly typicalAmount: Amount; readonly monthsHit: number; readonly monthsInPeriod: number }[];
}
/** Only категорії present in both months are ranked; `partial` as in CategoryReport. */
export interface CategoryChange { readonly name: string; readonly from: Month; readonly to: Month; readonly partial: boolean; readonly before: Amount; readonly after: Amount; readonly change: BasisPoints }

export interface MerchantReport {
  readonly merchant: string;                            // the опис, folded and trimmed
  readonly total: Amount; readonly count: number;
  readonly categories: readonly string[];
  readonly recurring: boolean;                          // same rule as Trends.recurring, by merchant
}

export interface GoalReport {
  readonly name: string;
  readonly target: Amount; readonly progress: Amount; readonly remaining: Amount;
  readonly deadline: IsoDate; readonly reached: boolean; readonly overdue: boolean;
  readonly monthsLeft: number;                          // whole months from builtOn to deadline, ≥ 0
  readonly perMonth: Amount | null;                     // remaining / monthsLeft; null when 0 months or reached
  // deliberately: no рахунок — not its назва, not its вид
}

export interface ApproximateUah {
  readonly note: 'approximate';
  readonly period: SixNumbers;                          // all in UAH, at the current monobank rate
  readonly rates: readonly { readonly currency: CurrencyCode; readonly rateAsOf: IsoDate }[];
}

/** Only when included.transactions. No id, no рахунок назва, no сума в оригінальній валюті (the
 *  витрата is the UAH the bank charged); description only when included.descriptions. */
export type TransactionLine =
  | { readonly date: IsoDate; readonly type: 'expense' | 'refund'; readonly amount: Amount; readonly category: string; readonly description?: string }
  | { readonly date: IsoDate; readonly type: 'income'; readonly amount: Amount; readonly source: string; readonly description?: string }
  | { readonly date: IsoDate; readonly type: 'correction'; readonly amount: Amount; readonly description?: string }
  | { readonly date: IsoDate; readonly type: 'transfer'; readonly from: AccountKind; readonly to: AccountKind; readonly left: Amount; readonly arrived: Amount; readonly description?: string };
```

**Aggregates vs raw transactions.** Default is aggregates only: the monthly series, category
table, trends, ліміти and цілі answer «куди пішли гроші» and «на що звернути увагу» without a
single опис. Merchants are the first opt-in because an опис is the bank's text and the closest
thing to a name the app holds. Individual транзакції are the second opt-in, for questions that
need them («що це за 25 000 у серпні?»); they are the only part that scales with history, and
the preview names their count and the size so the owner sees what they add. The notable-витрати
list in the default level carries сума, категорія and month — no опис, no exact дата — because
«one large ремонт explains the month» is the single most useful observation and it needs no
identity to make.

**Determinism.** Inputs are plain values plus `builtOn`; rows are sorted by (дата, type, сума,
категорія/джерело, опис) before any list is emitted, so read order never leaks into the output.
Ratios are integers; averages are integer minor units rounded half away from zero; nothing uses
a float. The renderer sorts keys canonically. A property test holds `builtOn`, the state and a
shuffled copy of the транзакції to the same пакет.

**Versioning.** `schema` and `version` are in the пакет and in the файл's header. A later
change that adds fields bumps the version; a route that reads the пакет (a local model's prompt
template, a future eval fixture) names the version it was written for. Nothing ever reads a
пакет back into the app, so no migration of пакети exists.

**Time.** Dates are calendar dates, months are calendar months (vision §8); there is no
timezone in the data. `builtOn` is the device's local calendar day (`todayIso(new Date())`, the
same read every screen does), which decides the partial month and the months left to a ціль.

## 7. Route abstraction

A share sheet is not an inference engine, so there is no single `AiAnalysisProvider` with a
`ShareProvider` pretending to answer. Two seams, one artifact:

```ts
// src/analysis/document.ts — the one artifact every route consumes
export type PromptProfile = 'external-advanced' | 'local-basic';   // 'local-basic' arrives with Phase 2
export interface AnalysisDocument {
  readonly name: string;      // 'cap1tal-ai-monthly-picture-2026-06_2026-08.md'
  readonly text: string;      // instructions + context + summary + data
  readonly package: AnalysisPackage;
  readonly profile: PromptProfile;
}

// src/platform/analysis-share.ts — Phase 1: a hand-off, returns no answer
export type AnalysisShareOutcome =
  | { readonly kind: 'handed-over' }                // the chooser closed; what the owner did is unknown
  | { readonly kind: 'unavailable' }                // no chooser on this platform/build
  | { readonly kind: 'failed'; readonly reason: string };  // could not write or open; storage full is one
export interface AnalysisSharePort { share(file: { name: string; text: string }): Promise<AnalysisShareOutcome> }

// src/platform/local-llm.ts — Phase 2/3: inference, returns text; not part of this change
export interface AnalysisInferencePort {
  status(): Promise<LocalModelStatus>;
  generate(document: AnalysisDocument, hooks: { onToken(t: string): void; cancelled(): boolean }): Promise<GenerationOutcome>;
}
```

The screen's run is `choices → package → document → route`, where a route is either a hand-off
(outcome, no text) or an inference (text, streamed). Phase 4's cloud provider is a second
`AnalysisInferencePort` implementation. The `PromptProfile` is what differs between routes: the
same пакет, a shorter and stricter instruction set for a small local model.

## 8. External share flow

1. The owner picks kind, period, details. The screen builds the пакет synchronously from the
   repos' plain values (`accounts.list()`, `transactions.listAll()`, `categories.list()`,
   `sources.list()`, `limits.list()`, `goals.list()`, `rates.all()`) and `todayIso(new Date())`, renders the
   document, and shows the preview — all in memory, nothing written.
2. «Поділитися з AI» → the port's `share({ name, text })`.
3. The adapter empties `Paths.cache/ai-analysis/`, writes the файл there (`File.write`, UTF-8,
   synchronous in SDK 57), and calls `Sharing.shareAsync(file.uri, { mimeType: 'text/plain',
   dialogTitle: 'Поділитися з AI' })`. expo-sharing wraps the file in its own FileProvider
   (`<applicationId>.SharingFileProvider`, cache path included), sends `ACTION_SEND` with a
   `content://` stream and `FLAG_GRANT_READ_URI_PERMISSION` inside the system chooser. No
   `app.json` change, no `<queries>` work: both are in the module's manifest.
4. The promise resolves when the chooser returns to the app — the same way whether the owner
   picked an app or dismissed it (Android ignores the result code; iOS resolves regardless of
   `completed`). The outcome is therefore `handed-over`, and the screen says exactly that.
5. The файл stays in the cache until the next run empties the directory: a chosen app may read
   the content URI after the promise resolves, so deleting immediately would race it. The cache
   is app-private; Android may purge it under storage pressure; it is never in a бекап.

**Format.** Markdown, `.md`, shared as `text/plain`. Markdown because the файл is read by a
person first (the preview) and by a model second, and headings carry the four sections; `.md`
rather than `.txt` so an assistant that renders attachments shows structure; `text/plain` in the
chooser because it is the widest intent filter (many apps register `text/*` or `text/plain` and
not `text/markdown`). JSON alone was rejected: it cannot carry instructions, and a bare JSON
attachment invites the assistant to «analyse the file» rather than to follow the brief. A
combination — Markdown with the пакет in a fenced ```json block — is what is chosen.

**Name.** `cap1tal-ai-<kind>-<from>_<to>.md`, e.g. `cap1tal-ai-monthly-picture-2026-06_2026-08.md`.

**Size.** Aggregates only: 10–40 KB for a year. With 642 транзакції: about 120 KB. Both far
below the 1 MB Binder limit that makes sharing the same text as an `EXTRA_TEXT` string unsafe —
which is why RN's `Share.share` is not used for the файл, and why the clipboard fallback is a
fallback.

**Errors and cancellation.** The port's three outcomes; `SharingInProgressException` (a second
share while one is open) is `failed` with its reason; a platform without the module (web, a
build without it) is `unavailable`; a full storage surfaces as `failed` from `File.write`.
Cancellation is not observable and is not claimed either way.

**Unsupported platform.** iOS: expo-sharing presents `UIActivityViewController`; the same port
and adapter serve it; not smoke-tested by this change (vision §14.15: possible, not built).
Web: `unavailable`, and the clipboard alternative is offered.

**Which assistants accept what** is not documented by their vendors: the research found no
primary source for the ChatGPT or Claude Android intent filters. The emulator has neither app,
so the smoke on the emulator proves the chooser opens with the файл and that a text-capable app
(Files, Gmail, Keep) receives it; **the owner's own phone** is where «ChatGPT / Claude / Gemini
appear for `text/plain`» is checked, and the task says so.

## 9. Local LLM research and prototype plan (Phase 2, not this change)

Scope: prove or refuse a fully offline route — no key, no network at inference, financial
content never leaving the phone — on the two target devices, before any production code.

**Runtime.** Primary candidate: **LiteRT-LM** (Kotlin API, Apache-2.0, `.litertlm` models, CPU
and GPU on Android, NPU on Qualcomm/MediaTek with vendor libraries) behind a local Expo module
`modules/local-llm/`, the same shape as `modules/notification-capture/`. MediaPipe LLM Inference
is officially maintenance-only and points at LiteRT-LM; it is not a candidate. Fallback:
**llama.rn** (llama.cpp, MIT, Expo config plugin, GGUF) if LiteRT-LM proves unstable — at the
cost of a larger model file (Gemma 3 1B Q4_K_M is 806 MB vs 529 MB for Google's int4) and no
vendor-published phone numbers. **Gemini Nano / ML Kit GenAI Prompt API** is a different backend
(AICore, Pixel 9/10-class only, beta, Ukrainian undocumented) and is at most an optional platform
capability with a runtime availability check — never the baseline, and not in the prototype.

**Models to evaluate** (text only; priorities: privacy, Android compatibility, stability,
Ukrainian, RAM, size, speed, battery):

| Model | Size on disk | Licence | Why it is in |
| --- | --- | --- | --- |
| Gemma 3 1B IT, int4 `.litertlm` | ≈ 529 MB | Gemma Terms (redistribution allowed with pass-through terms; HF repo gated) | the baseline the owner named; vendor numbers exist (S24 Ultra: ~55 tok/s CPU) |
| Gemma 4 E2B IT, text-only `.litertlm` | ≈ 0.84–2.0 GB | Apache-2.0, not gated | about 2× Gemma 3 1B on multilingual benchmarks; the quality option if Pixel 8 / S24 speed holds |
| Qwen3-0.6B, int4 `.litertlm` | ≈ 330 MB | Apache-2.0 | smallest with Ukrainian in its language list; the «weaker phone» fallback |
| Gemma 3 270M | ≈ 300 MB | Gemma Terms | evaluated only to document that it is not enough for free-form Ukrainian; expected to fail |
| Gemma 3n E2B | ≈ 2.6 GB | Gemma Terms | superseded by Gemma 4 E2B (slower, larger); measured only if Gemma 4 E2B cannot run |

Not evaluated: Phi-4-mini (3.8B, too large beside the app on 8 GB), SmolLM3 and Llama 3.2 1B
(Ukrainian not claimed; Llama's licence).

**Lifecycle.** The model is never in the APK: it is an optional download over Wi-Fi by default
(the owner can allow mobile data), from a host cap1tal names in a manifest carrying file name,
size, SHA-256, model version and licence notice; verified before first load; stored under
`filesDir/models/` (excluded from Android Auto Backup and from the бекап); one model at a time;
«Видалити» removes it whole; «Оновити» downloads the newer version beside the old one and swaps
after verification. Gemma-licensed files require the Gemma Terms notice in the app; Apache-2.0
files require the licence file shipped. Failure handling per §12.

**Checks before loading:** the runtime is supported on this ABI/API level (`arm64-v8a`, API ≥ 31
as the safe floor — LiteRT-LM does not document one; Google's own gallery uses 31); available RAM
≥ model size + 500 MB and not `lowMemory` (`ActivityManager.getMemoryInfo`); free storage ≥ 2×
model size before download; initialisation errors are values.

**Prototype deliverables:** a branch with `modules/local-llm/`, the `AnalysisInferencePort`
adapter, a benchmark screen behind a developer flag, the eval fixtures (§14), and a results
document per device. Production integration is **not merged** unless §14's acceptance passes.

**Capability levels.** Local basic (Phase 3 target): summarise the period, the top insights,
explain the changes, one readable report — from the `local-basic` profile: shorter instructions,
fewer sections, the пакет trimmed to the aggregates (no transactions even if included). External
advanced: cross-period reasoning, long reports, portfolio reasoning, interactive Q&A. The UI
names the level beside the answer («Локальна модель · базовий аналіз»).

## 10. Privacy model

| Route | What leaves the phone | When | By whose act | What never leaves |
| --- | --- | --- | --- | --- |
| External share (this change) | the файл для аналізу exactly as previewed | only after «Поділитися з AI» and the owner's pick in the chooser | the owner's | ids, рахунок назви, token, баланс банку, notification text, чернетки, watched apps, бекап; описи and транзакції unless switched on for that run |
| Local model (Phase 3) | nothing at inference; the model file comes in over the network | download: explicit, Wi-Fi by default | the owner's | everything: inference is offline, no telemetry of any content |
| BYOK cloud (Phase 4) | the файл, to the provider the owner configured | separate opt-in, provider named on the screen every time | the owner's | the key from SQLite, бекап and logs (secure store only) |

Cross-cutting rules: an AI-аналіз opens no network connection in Phase 1 and 3; no route stores
the answer; the detail switches are never remembered; the temporary файл lives in app-private
cache, one at a time; nothing about a run is written to the database, so the бекап cannot carry
it. Data safety: no route creates a транзакція, changes a категорія, ліміт, ціль, правило or
поточна вартість; if a later phase lets the model *propose* an action, the proposal is shown and
the owner confirms it through the ordinary deterministic screen.

## 11. UX states

Screen «AI-аналіз» (pushed over the tabs from «Звіти»):

| State | What the screen shows |
| --- | --- |
| `preview` (the screen opens here; recomputed live on every change of a choice, in memory) | kind (one choice now), period chips, custom from/to, the two switches off, «Завжди: місячна картина, категорії, тренди, ліміти, цілі»; the sentence «Ці дані буде передано застосунку, який ви оберете.», the counts (months with data, транзакції, категорії, currencies, продавці так/ні, окремі транзакції так/ні, ≈ size), «Показати файл», the primary «Поділитися з AI», the secondary «Скопіювати» |
| `short-history` | preview plus the warning «Один місяць не показує тренду» |
| `empty-period` | «За цей період транзакцій немає — нема чого аналізувати.» No primary action |
| `invalid-range` | «Кінець діапазону раніше за його початок.» — or «Місяць пишеться як РРРР-ММ, напр. 2026-08.» while a month is still being typed. No primary action, nothing built |
| `empty-history` | «Ще немає жодної транзакції.» → «Записати першу» |
| `sharing` | the chooser is open; the primary action disabled |
| `handed-over` | «Файл передано системі. Що з ним сталося далі, знає лише обраний застосунок.» |
| `unavailable` | «На цій платформі поділитися файлом не вийде.» + «Скопіювати» |
| `failed(reason)` | «Не вдалося підготувати файл: <reason>» + «Скопіювати» |
| `copied` | «Скопійовано» |

Later phases add, on the same screen: «Локально» as a second route with `installed / not
installed / downloading / generating / answer / cancelled / failed` states, and a «Налаштування →
Локальний AI» section (status, model name and size, «Завантажити», «Видалити», «Готово»).

## 12. Error states

All are values from a port or from the builder, shown in the owner's words; none is an uncaught
exception.

External (this change): `empty-period` (builder refuses); `failed` — файл could not be written
(storage full, directory not creatable, `SharingInProgress`); `unavailable` — no chooser on this
platform or build; «no compatible app» — Android always offers *some* target for `text/plain`,
so this is not a distinct outcome; the clipboard covers the case where the owner's assistant is
not among them; cancellation — not observable, not claimed.

Local (Phase 2/3, specified then): `device-unsupported` (ABI/API/runtime), `not-installed`,
`insufficient-storage` (before download), `insufficient-ram` (before load), `download-failed`
(with resume), `model-corrupted` (hash mismatch → deleted, offered again), `initialisation-failed`,
`generation-cancelled` (owner), `generation-failed`, `app-backgrounded` (generation cancelled,
partial text discarded — nothing is stored), `memory-or-thermal-pressure` (generation stopped
with a reason; `onTrimMemory` and thermal status listeners).

## 13. Testing strategy

Under `npm run verify` (Node, < 1 min): `src/analysis/**` unit and property tests (determinism
under shuffled input; the monthly identity; per-currency separation; every scenario of the
package spec by name; exclusion tests over the *serialised* text — a fixture whose ids, рахунок
назви, token, notification text and cursors all carry a sentinel that must not appear);
`src/analysis/prompt.test.ts` and `document.test.ts` (required sentences present, data block
round-trips to the пакет, one golden file for determinism); `src/platform/analysis-share.test.ts`
(the double's outcomes; the existing «never loads native» test in that directory keeps covering
the new file); `src/ui/ai-analysis-screen.test.ts` (choices → period, preview counts equal the
пакет, state machine, every word). Emulator (smoke-runner): the entry on «Звіти», the preview,
the chooser opening with the файл for a text-capable app, «Скопіювати», the empty and short
states, a second share after dismissing the first. Owner's phone: the assistants appear for
`text/plain` and answer from the файл alone. Phase 2: physical-device benchmarks only; the eval
fixtures and the fact-checker are pure and under `verify`, the model runs are not; CI never
downloads a model.

## 14. Device benchmark criteria (Phase 2 acceptance)

Devices: Pixel 8 (8 GB, Tensor G3) and Galaxy S24 (8 GB; note the European Exynos 2400 vs the
Snapdragon 8 Gen 3 variant — measure the one the owner has and name it). Per model, per backend
(CPU, GPU), with the `local-basic` document of the 6-month fixture (~600 prompt tokens):

| Measure | Pass |
| --- | --- |
| download size / size on disk | ≤ 1.2 GB / ≤ 1.5 GB |
| peak RSS during generation | ≤ 1.8 GB, no LMK kill in 20 consecutive runs |
| cold start (load to ready) | ≤ 10 s |
| first-token latency | ≤ 3 s |
| decode speed | ≥ 12 tok/s |
| a typical monthly-picture report (~350 tokens) | ≤ 40 s end to end |
| battery | ≤ 1.5 % per report, 10 reports in a row |
| thermal | no throttling state above `MODERATE` in 10 consecutive reports |
| maximum practical prompt | the 12-month aggregates document fits with ≥ 512 tokens of answer room |
| output quality | §14 eval: ≥ 90 % of cases with zero FAIL facts; Ukrainian rated readable by the owner on a 3-point scale for ≥ 80 % of cases |

**Eval dataset.** 20–50 synthetic `AnalysisPackage` fixtures under `src/analysis/eval/` — pure
data, generated by the builder from synthetic транзакції so they are valid by construction —
covering: stable spending; a sharp rise in «Кафе»; one large ремонт авто; a fall in дохід; дохід
and витрати rising together; a high savings rate; a ліміт exceeded; several currencies; a very
short history; insufficient data. Each fixture carries expected facts (e.g. «Кафе grew from July
to August», «USD and UAH are separate», «August is partial»). A pure `factCheck(answer, fixture)`
marks an answer FAIL when it states a number not in the пакет, mixes currencies, states a
direction opposite to the data, names a транзакція that does not exist, or arrives at a figure by
its own arithmetic that differs from the given one. Prose quality is the owner's judgement;
factual grounding is the test.

## 15. Migration and schema impact

None in this change: no table, no migration, no stored preference. Phase 3 adds nothing to
SQLite either — the model file and its manifest live in the file system, and «which model is
installed» is read from disk. Phase 4 stores the key in `expo-secure-store` under a versioned
key like the monobank token, never in SQLite.

## 16. Changes by layer and file

| Path | What | Proven by |
| --- | --- | --- |
| `src/analysis/decimal.ts` | integer minor units → exact decimal text; basis points; rounding | unit tests |
| `src/analysis/period.ts` | period choices → months; partial month; empty refusal; short flag | unit tests |
| `src/analysis/monthly.ts` | month reports, period totals, averages, baseline, rates, changes | unit + property |
| `src/analysis/categories.ts` | category reports, shares, changes, ліміти | unit tests |
| `src/analysis/trends.ts` | largest, changes, notable, recurring | unit tests |
| `src/analysis/goals.ts` | goal reports and pace | unit tests |
| `src/analysis/details.ts` | merchants, transaction lines | unit tests |
| `src/analysis/package.ts` | types, `buildAnalysisPackage`, counts, approximate UAH | unit + property (determinism) |
| `src/analysis/privacy.test.ts` | exclusions over the serialised text | fixture with sentinels |
| `src/analysis/prompt.ts` | instruction and context sections per profile | unit tests |
| `src/analysis/document.ts` | `renderDocument`, name, summary, canonical JSON block | unit + golden |
| `src/platform/analysis-share.ts` | port + `inMemoryAnalysisShare()` | unit tests |
| `src/platform/analysis-share-device.ts` | expo-file-system + expo-sharing adapter | emulator |
| `src/ui/ai-analysis-screen.ts` | choices, preview, state machine, words | unit tests |
| `src/app/ai-analysis.tsx`, `src/app/_layout.tsx` | the screen and its route | emulator |
| `src/app/(tabs)/reports.tsx` | the entry | emulator |
| `package.json` | `expo-sharing` | expo-doctor, dev client rebuild |
| `docs/glossary.md`, `docs/product-vision.md` (approved lines), `docs/app-overview.md`, `docs/tech-task.md` | vocabulary and the map | reading |

## 17. Acceptance criteria

1. Every scenario in the four delta specs has a test whose name quotes it, or an emulator smoke
   step that does.
2. `npm run verify` green with no emulator, no native module loaded, no network.
3. On the emulator: «Звіти → AI-аналіз → Поділитися з AI» opens the system chooser with the
   файл; a text-capable app receives a file whose content equals the preview; dismissing the
   chooser leaves the screen saying «передано системі» and nothing else; a second share works.
4. The serialised файл of the sentinel fixture contains no sentinel.
5. Both switches are off on every opening; the default preview names no опис.
6. No new table, no migration, no permission, no `app.json` change; `package.json` gains exactly
   `expo-sharing`.
7. On the owner's phone: at least one of ChatGPT, Claude, Gemini appears in the chooser for the
   файл and answers in Ukrainian from it alone. Recorded in the change's smoke notes; not a
   `verify` condition.

## 18. Rollout and phases

| Phase | Change(s) | Depends on | Ships |
| --- | --- | --- | --- |
| 1 | `ai-analysis-share` (this) | nothing | пакет, monthly-picture metrics, prompt, privacy, файл, preview, share sheet, tests |
| 1b | `ai-investment-analysis` | `investments-value` archived | kind `investments`: вкладено, поточна вартість, прибуток/збиток, ROI and XIRR (deterministic, basis points, Newton iteration over dated integer cashflows with the вартість as terminal flow), внесено/виведено by period, investment rate; the same screen gains the kind choice |
| 2 | `local-llm-prototype` (branch, not merged to production) | Phase 1 | `modules/local-llm/`, LiteRT-LM adapter, benchmark screen, eval fixtures + fact-checker, results per device |
| 3 | `local-llm` | Phase 2 passes §14 | model management section, «Локально» route, `local-basic` profile, error states, vision §12 line for the model download |
| 4 | `cloud-provider-byok` | a vision change to §14.9 | separate opt-in, key in secure store, provider named on screen |
| 5 | `ai-categorisation`, `ask-my-finances`, `portfolio-advisor` | §21 | separate proposals |

## 19. Risks

- **The assistant apps do not accept `text/plain` files** → the clipboard alternative always
  works (the файл is ≤ ~150 KB, well under the Binder limit); a `text/markdown` type is a
  one-line adapter change; RN `Share.share` with the text as the message is a last resort for
  aggregates-only files.
- **The owner reads «передано» as «проаналізовано»** → the words say what the app knows and no
  more; no toast, no checkmark.
- **A model invents numbers anyway** → the instructions forbid it; the summary repeats the key
  numbers formatted; Phase 2's fact-checker is the measurement; the app never reads an answer.
- **The temporary файл outlives its use** → one at a time, emptied on the next run, app-private
  cache; documented that Android may purge it.
- **expo-sharing regressions** (historic: promise never resolving after cancel) → smoke step
  «dismiss, then share again»; the adapter maps `SharingInProgress` to `failed`.
- **Scope creep toward Phase 2** → nothing in this change references a model; the inference
  port is a paragraph in this proposal, not a file.
- **Vision drift** → §22; no vision line changes without the owner's approval.

## 20. Open questions

Answerable later without changing the specs or the tasks:

1. Should the preview show the approximate file size in KB or in «tokens»? (KB in this change;
   tokens are model-specific.)
2. Should «Показати файл» render the Markdown or show the raw text? (Raw text: what leaves is
   what is shown.)
3. For Phase 2: which S24 variant the owner has (Exynos vs Snapdragon) — named in the results.

Decisions this proposal makes that the owner may overturn in review: the default period
(«Останні 3 місяці»), the caps (5 largest, 5 notable), the recurring rule (≥ 2/3 of the months,
±15 % of the median), the notable-витрати list in the default level (сума, категорія, month),
and a ціль's `perMonth` (remaining ÷ months to its дата) as a figure about months to come that
is not a §14.10 forecast.

## 21. Explicit dependencies on future capabilities

- **Investment AI-аналіз** → `investments-value` (вкладено, поточна вартість with its дата,
  прибуток/збиток). Without a вартість, ROI and XIRR have no terminal flow; the kind is offered
  only once that change is archived.
- **Portfolio advisor** («у мене є $100, куди додати?») → a `portfolio-instruments` capability
  that does not exist and contradicts vision §14.2: instruments with ticker or identifier, asset
  class, quantity, cost basis, current value or price, currency, target allocation, risk profile,
  investment horizon, investment goal. Not proposed here; named so nobody builds the advisor on
  the wrong data.
- **AI categorisation** → the deterministic правила stay first; a `categorisation-suggestion`
  port takes an опис and MCC and the owner's category list (names only) and returns
  `{ categoryName, confidence, reason? }`; below a threshold → «Без категорії»; never creates a
  категорія; after the owner confirms, the existing «create a правило» offer applies. Needs a
  local or cloud inference route (Phase 3 or 4) and a spec for confidence and the threshold.
- **Ask my finances** → natural language → a *structured finance query* (a closed grammar:
  period, категорія, number, comparison) validated by the domain → deterministic result →
  explanation. Needs its own capability (`finance-query`) for the grammar and the validation; the
  model never sees SQL or the database. Forecast-shaped questions («чи реально відкладати 15 000»)
  touch vision §14.10 and wait for its answer.
- **Local model** → Phase 2's acceptance; a vision line for the model download (§22).

## 22. What changes `product-vision.md`, and what does not

**Fits the current vision, no change of substance needed** — an AI-аналіз reads out the numbers
the vision already asks for (§1's two questions, §11's reports), computes nothing new, moves no
money (§14.12), makes no forecast (§14.10), uses no cloud service of cap1tal's (§14.9), stores
nothing (§12).

**Proposed additions for this change — to be approved by the owner before task 1.2 runs.** They
also qualify §1's «Data is not shared with anyone»: the файл is shared with an app the owner
picks, by the owner, and the owner's approval of these lines is the approval of that reading.

- §12, after the sentence on outbound connections: «An AI-аналіз hands a file of already
  computed numbers to an app the owner picks in the phone's own chooser. That is the owner's
  hand-off, not a connection the app makes; the app never reads an answer back, and nothing about
  the file, the run or the answer is stored. **[PROPOSED]**»
- A new §17 «AI-аналіз **[PROPOSED]**»: «The app may explain its numbers with the help of a
  language model — an assistant the owner already has, or later a model on the phone. The model
  is never a source of truth: every number it sees is computed by the app, per currency; it
  interprets, and it changes nothing. By default it sees aggregates only; описи and individual
  транзакції leave the phone only when the owner switches them on for that run.»

**Needs a vision change before its phase, not now:**

- Phase 3 (local model): §12's list of outbound connections gains «the download of an optional
  local model, at the owner's request»; §14.9 is unaffected (a file download is not a cloud
  service), but the sentence should say so.
- Phase 4 (BYOK): §14.9 «no cloud services other than Google Drive» must be amended to name an
  owner-configured AI provider as an explicit opt-in.
- Phase 5 portfolio advisor: §14.2 (no instruments, no prices) must be reversed first.
- «Ask my finances» with forecast-shaped questions: §14.10.

**Deferred, no vision text proposed:** automatic market prices, forecasts, investment
recommendations as facts.
