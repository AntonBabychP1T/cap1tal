## Context

See `proposal.md — Why` for the motivation. What shapes the approach is where the журнал is
written from today and how the code around it is layered.

The журнал is one module-level singleton (`src/ui/journal.ts`) over a storage port
(`src/db/reporting-repo.ts`), with the entry's shape and its rules one level down as pure values
(`src/reporting/journal.ts`). Everything effectful in the app is already behind a port: the
personal API takes an injected `AuthFetchLike`, the sync coordinator takes a whole `SyncPorts`
record, Drive takes its own adapter, the native capture and notification-access modules each sit
behind a port file with a `-device.ts` adapter beside it. `npm run verify` runs the ports and never
the adapters, and must stay that way — it is Node-only, under a minute, no emulator.

Three constraints follow, and every decision below is downstream of them:

1. **The instrumentation must go where the adapters are, not where the logic is.** Putting a
   journal write into `src/monobank/coordinator.ts` or `src/monobank/api.ts` would give those
   modules an effect they do not have and would make their tests carry a журнал.
2. **Committed migrations are immutable** (`.claude/rules/database.md`). New columns mean a new
   migration, and an entry written by the current build must read back identically afterwards.
3. **The privacy rule is enforced by the type, not by discipline.** `JournalEntry` has no field a
   сума can go in, and `privacy.test.ts` proves things about it without a database. Anything added
   has to keep that property or the guarantee degrades into a habit.

## Goals / Non-Goals

**Goals:**

- One `run` mark that ties an operation's entries together, so a sync is readable as a sync
  even when the owner tapped between tabs in the middle of it.
- Instrumentation that a caller cannot forget: wrapping a port, not adding a line at each site.
- A rendered репорт whose top tells the reader what happened before they read 2000 lines.

**Non-Goals:**

- No log levels, no verbosity setting, no sampling. The bound is the only thing that limits the
  журнал, and one owner on one phone does not need a second dial.
- No timing of pure functions. `tookMs` measures I/O and operations, not `mapStatement`.
- No new native code. `modules/notification-capture/` is untouched; the `native` kind records what
  the *existing* device APIs already answer.
- No structured logging library, no `console` capture, no redaction pass. A redactor is a filter
  that can be wrong; a type with no string field cannot be.

## Decisions

### D1 — Three new kinds, not one generic `log` kind

`JournalKind` becomes `screen | failure | alert | crash | network | step | native`. The rendering
already switches on kind for its Ukrainian label, the репорт's failure section already selects by
kind, and the new sections select by kind too — a single `log` kind with a category *inside* the
name would push that selection into string parsing.

*Alternative considered:* one `trace` kind with a prefix convention (`net:…`, `step:…`). Rejected:
the prefix is a type nobody checks, and `checkKind` in the repository exists precisely so an
unknown kind is refused rather than stored.

Labels, in the repository's existing style: `network` → «мережа», `step` → «крок», `native` →
«пристрій». SQL still has no CHECK on `kind` (schema.ts states why), so the three cost no migration
of their own — the enumeration lives in TypeScript and `checkKind` refuses anything else.

**And `checkKind` is exactly the trap here.** `src/db/reporting-repo.ts` keeps its own
`const KINDS: readonly JournalKind[] = ['screen', 'failure', 'alert', 'crash']`, and widening the
union does *not* break that array — a subset of a union still typechecks. Left alone, every new
entry would throw ««network» is not a journal kind` on the way back out, and `src/ui/journal.ts`
swallows writer errors on purpose («a журнал that cannot write is a missing entry, never a crash»),
so the whole change would land silently dead. `KINDS` is therefore updated in the same task as the
union, with a repository test that an entry of each new kind round-trips. The design's own claim
that «an unlabelled kind fails the build» is true of `KIND_LABELS`, whose `Record<JournalKind,
string>` is exhaustive, and false of `KINDS`; the test is what covers the second.

### D2 — `counts: Record<string, number>` is what makes the new data safe

The entry gains exactly three optional fields:

```ts
readonly run?: string;      // ties one operation's entries together
readonly tookMs?: number;   // how long the thing this entry names took
readonly counts?: Readonly<Record<string, number>>;
```

`counts` is the only place the new entries put their measured facts — items in an answer, статус,
транзакції imported, чернетки made — and its value type is `number`. There is no field a сума's
*text*, a назва or a bank's notification could be put in, which is the same argument the original
design makes for `JournalEntry` as a whole, extended rather than weakened. `privacy.test.ts` gains
cases over the new kinds on that basis.

`run` is an opaque id from `newId()`, never a route and never anything the owner typed.

*Alternative considered:* a free-form `dataJson`. Rejected outright: it is a field a сума fits in,
and the whole guarantee rests on there not being one.

### D3 — The journal writes at the `fetch` seam, so no call site can forget

`src/reporting/journal.ts` gains a pure `describeRequest(method, url)` that produces the entry's
name from a URL, dropping the query string entirely for every host and shaping the path by host:

- `api.monobank.ua` — the path whole, identifiers and all:
  `GET api.monobank.ua/personal/statement/kKGVoZuHWzq/1756... /1757...`. This is the one host whose
  identifiers the журнал is allowed to keep, and the reason the whole change exists: «which card is
  not syncing» is a question only that identifier answers.
- every other host — the endpoint shape, each identifier replaced:
  `GET www.googleapis.com/drive/v3/files/{id}`.

The second rule is not tidiness, it is a stated invariant of one of the seams. `src/fiscal/
chk-all-web.ts`'s own header says «The URL is never logged and never appears in an outcome, because
it carries the реквізити of a purchase» — the реквізити are *in the path*, so a wrapper that kept
paths whole would break a module's documented promise from the outside. Under shaping, that
seam journals `GET cabinet.tax.gov.ua/ws/api_public/rro/chkAllWeb` as its endpoint — the реквізити
are in the query string, which is dropped for every host — and the module's promise holds. The Drive file id goes the same way for the same reason: the privacy
whitelist in the requirement admits the monobank account identifier and nothing else, and shaping
is what makes that true rather than aspirational.

`src/ui/journal.ts` gains `journal.watchFetch`, which wraps a fetch-like and writes one `network`
entry per call with the status and the duration. **It preserves the signature and the return type
of whatever it wraps**, because the five seams do not share one:

```ts
function watchFetch<A extends readonly unknown[], R extends { readonly status: number }>(
  impl: (url: string, ...rest: A) => Promise<R>,
  options?: { run?: string; method?: string | ((...rest: A) => string) },
): (url: string, ...rest: A) => Promise<R>;
```

`AuthFetchLike` is `(url, headers)`; `currency.ts`'s `FetchLike` is `(url)` answering `json()`;
`chk-all-web.ts`'s is `(url)` answering `text()`; Drive calls the global `fetch(url, init)` and
then reads `.headers`, `.arrayBuffer()` and `.json()`. A wrapper fixed at two arguments would not
be assignable to the one-argument targets at all, and a wrapper with a narrowed return type would
drop the members Drive needs. Generic over the rest of the arguments and over `R`, it reads
`status` and returns `R` untouched — it never touches the body, which is also what keeps D3's
«no item count at this seam» honest.

The method is not in any seam's arguments except Drive's: `method` defaults to the constant `GET`
(monobank, the rates, the чек) and Drive passes `(init) => init.method ?? 'GET'`.

**A rejected call's `detail` is composed by the app, never taken from the caught error.** A
platform rejection may quote the whole URL it was given, which would put back exactly the file id
and реквізити the path shaping removes. `watchFetch` distinguishes what it can — «не відповів»,
«зірвався» — and the caught error itself is not written.

**No item count at this seam, and the requirement no longer asks for one.** `AuthFetchLike` and
`FetchLike` answer `{ ok, status, json() }` with no `clone()`, and `api.ts`'s `ask<T>()` needs that
one read of the body — a wrapper that counted items would consume the answer the caller is about to
parse. The count the reader actually wants is «how many транзакції did this run import», which the
coordinator already reports on `AccountResult` and which D4 puts on the `step` entry instead.

Wired in the adapters only:

| Where | What is wrapped |
| --- | --- |
| `src/hooks/monobank-ports.ts` | the `fetch` handed to `SyncPorts` — covers the foreground run, the automatic run and the background chance, because all three build their ports here. Wrapped **outside** `withRequestTimeout`, never inside: that function takes the three-argument `AbortableFetch` and returns the two-argument `AuthFetchLike`, and it is `withRequestTimeout` itself that rejects with «monobank did not answer within N ms». Wrapped outside, `watchFetch` sees a uniform two-argument shape and the timeout rejection lands in an entry with the duration the run actually waited; wrapped inside, a platform without `AbortController` would never settle the inner call and the entry would never be written at all. |
| `src/app/manage/monobank.tsx` | the screen's own `fetch` for «Звірити» / client-info |
| `src/platform/drive-device.ts` | the four Drive endpoints |
| `src/fiscal/chk-all-web.ts` call site (`src/app/transaction/scan.tsx`) | the чек lookup |
| the rate endpoint's call site | `currency.ts`'s injected `FetchLike` |

`src/monobank/api.ts`, `src/monobank/currency.ts`, `src/fiscal/chk-all-web.ts` and
`src/platform/drive.ts` are **not** edited: they take a fetch-like, and a wrapped fetch-like is
still one. That is the whole reason this is cheap.

The query string is dropped rather than redacted. Nothing the app sends carries the token in a
query (api.ts states it goes in the header and only there), Drive's `alt=media` and `fields=` are
not diagnostic, and a redactor over query values is a filter that has to be right every time.

*Alternative considered:* instrumenting inside `api.ts`'s `ask<T>()`. Rejected under constraint 1
— it would give a pure-by-design module an effect and put a журнал into `api.test.ts`.

### D4 — The sync's timeline: one `step` around the run, plus the progress events inside it

`SyncPorts.onProgress` already emits `started`, `account`, `waiting` and `finished-account`, with
the `monobankAccountId` and the `AccountResult` on them. Today only the monobank screen listens;
the automatic and background runs pass no listener at all.

`syncPorts()` in `src/hooks/monobank-ports.ts` gains a journaling `onProgress` that **composes**
with any `over.onProgress` a caller supplies rather than replacing it, so the screen keeps its
progress and every run — including the headless one — writes its timeline. The `run` id is minted
per `syncPorts()` call and shared by that run's `network` and `step` entries.

The other operations are recorded through `journal.step(name, fn)` in `src/ui/journal.ts`: it mints
a `run`, writes the beginning, awaits, and writes the ending with `tookMs` and the counts the
callback returns — one wrapper at the бекап, the відновлення, the Saldo import and the notification
drain, so «recorded when it begins and when it ends» cannot be half-done.

**The per-event entries are not enough on their own, and the events cannot be made enough.** The
coordinator emits `started`, `account`, `waiting` and `finished-account` — there is no
run-finished event, so no listener can carry the run's duration or `SyncRun.imported`; and
`report({ kind: 'started' })` fires *after* the token is read (`coordinator.ts:314`), so a run
ending `not-configured`, `storage-unavailable` or `no-links` emits nothing at all. Those three are
precisely the silence the proposal complains about.

So the run is *also* wrapped in `journal.step` at `startSync` in `src/ui/monobank-sync.ts` — pure,
loadable under `verify`, and the one place the whole run's outcome is known. The two are
complementary, not alternatives: the `step` gives the run its beginning, its end, its duration and
its imported total even when the coordinator emitted nothing; the progress listener gives the
рахунки inside it.

One `run` id serves both. Each of the three triggers mints it once with `newId()` and hands it to
`syncPorts(over, run)` and to `startSync`, so the run's `step`, its per-рахунок entries and its
`network` entries all carry the same mark and D7's timeline groups them. A background chance's
`native` entry takes the same id, so the chance and the run it started read as one thing.

*Alternative considered:* having the coordinator return a richer `SyncRun` and journaling **only**
at the end. Rejected: a run that is *interrupted* — postponed, killed by the system — never
returns, and that is exactly the run this change exists to make visible. The beginning entry and
the per-рахунок entries are what survive an interruption.

### D5 — `native` entries: the decision is pure, the adapter only calls it

`src/platform/*-device.ts` is never loaded under `npm run verify` — that is the whole point of the
`-device` suffix — so a journal write placed *inside* an adapter has no runnable test, and three
spec scenarios would be assertions nobody checks. Every `native` entry is therefore decided by a
pure function in `src/ui/` that answers «what, if anything, does this device fact journal, and
under which enumerated word», tested there against synthetic facts; the adapter's only new line is
the call. It is the same split `src/ui/monobank-background.ts` already makes against
`monobank-sync-task.ts`, and the reason it makes it.

| Device fact | Where the decision is proven | Where the call is |
| --- | --- | --- |
| a background chance fired, the app `active` or not, what the turn came to | `src/ui/monobank-background.ts` (+ its test) | `src/platform/monobank-sync-task.ts` |
| the task registered, or refused registration | `src/ui/monobank-background.ts` | `src/platform/background-turn.ts`'s `reconcileTask` |
| notification access granted / withdrawn; the listener connected or not | a new pure function beside `src/ui/alerting.ts` (+ its test) | `notification-access-device.ts`, `notification-capture-device.ts` |

That permission function answers on a **change** of state, not on a read. The app reads both on
every foreground and on every visit to «Сповіщення банків»; an entry per read would rebuild, as
`native` noise, exactly the 200-of-208 problem D6 removes for screens. It keeps the last state it
recorded and writes only when the answer differs — which also makes «the permission was withdrawn
at 14:02» a fact the репорт states once, where it is readable.

| the app moved between the foreground and anything else | a pure transition function in `src/ui/` (+ its test) | `src/app/_layout.tsx` |

Each writes the device's own enumerated answer as `detail` — `available`, `restricted`, `denied`,
`active`, `background` — never a sentence the app composed, so the entries are greppable. The
transition function is what makes «one entry per *move*» testable: `AppState` fires for changes
that are not moves, and a rule about that cannot be proven inside a `.tsx`.

A `native` entry is journaled from a headless process. `src/ui/journal.ts`'s buffer-before-`bind`
already covers that: `prepareBackgroundStorage()` binds before the turn runs, and anything written
earlier flushes in order.

### D5a — The Google sign-in exchange is a `step`, because it has no fetch to wrap

`src/platform/google-auth-device.ts` reaches Google through `expo-auth-session`'s
`exchangeCodeAsync`, not through a fetch this app owns — there is no seam to wrap, and «every
outbound request» could not have been literally true. The requirement is scoped to requests the app
makes through its own request ports, and the exchange is wrapped in `journal.step` instead: it is
recorded, with its duration and its outcome, as an operation.

This is not a technicality. The репорт that prompted this change carried four `збій · backup ·
not-configured` entries and nothing about why — the token exchange is the likeliest place that
answer lives, and it was in the one part of the app no seam reached.

### D6 — The bound rises to 2000; the rendering folds repeated screens

Once requests and steps are journaled, a two-account sync writes roughly a dozen entries and 500
would be a few hours. 2000 rows of at most a few hundred bytes is well under a megabyte and the
table is read whole exactly once, when a репорт is filed — the schema comment's reason for having
no index on `at` holds at 2000 as it did at 500.

The rendering folds consecutive identical `screen` entries into one line with a count and the two
moments, which is where the 200-of-208 noise in the репорт that prompted this actually goes. It is
a fold over what the репорт holds, loses no value, and the whole журнал is still one entry per row
in the database.

### D7 — Three new report sections, still one renderer

`renderReport` gains a summary before «Що не так», and «Network · Мережа» and «What the app did ·
Що робив застосунок» between the failures section and the screenshots — English anchor first, as
`heading()` and every other section in the file already render it. All three are folds over
`report.journal`, computed in `src/reporting/report.ts` as exported pure functions
(`networkSummary`, `runTimelines`) so `report.test.ts` can pin them without a репорт.

There is still exactly one renderer and one order (the existing design's D8): the file adds image
data and nothing else. Determinism is unaffected — every new line is derived from stored values and
`moment`, and nothing reads a clock or a locale.

### D8 — The migration adds three nullable columns and touches nothing committed

`journal` gains `run TEXT`, `took_ms INTEGER`, `counts_json TEXT`, all nullable, in one new
migration generated by `npm run db:generate`. `toEntry` maps `null` → absent, exactly as it already
does for `detail`, so an entry from the current build reads back identical — the spec scenario «An
entry written before this build reads back unchanged» is the test.

`counts` is stored as JSON in one column rather than as a side table: it is written once, read
once, and never queried or aggregated — the same argument `bug_reports`' JSON columns already make.

## Risks / Trade-offs

- **A wrapped `fetch` could journal a URL that carries a secret** → The token is a header, by
  `api.ts`'s own design, and the wrapper drops the query string entirely rather than filtering it.
  `privacy.test.ts` gains a case that runs a full scripted sync with a token set and asserts no
  entry contains it.
- **`journal.step` wraps I/O; a throw inside it must not become a second failure** → the wrapper
  writes the failing end entry and rethrows the original, and the журнал writer is already
  `try/catch`-guarded («a журнал that cannot write is a missing entry, never a crash»).
- **Journaling every request costs one storage write per request** → a sync makes one request a
  minute by the bank's own limit; the drain and Drive are similarly sparse. No path in the app
  makes requests fast enough for this to be measurable.
- **The репорт gets longer** → this is the point, and the summary at the top plus the folding of
  repeated screens is what keeps it readable. A file of 2000 folded lines is still one paste.
- **A wrapped seam could break a module's own stated promise** → `chk-all-web.ts` promises its URL
  is never logged. D3's per-host path shaping is what keeps that true from the outside, and the
  spec pins it as a scenario («A request whose path is the owner's business is not described by its
  path») rather than leaving it to the wrapper's author to remember.
- **More kinds means more to keep total** → `ACCOUNT_OUTCOMES`' trick applies: labels come from a
  `Record<JournalKind, string>`, so adding a kind without labelling it fails the build.
- **The glossary's Журнал entry is product truth and says «four kinds, 500»** → updating
  `docs/glossary.md` is a task in this change, not a follow-up.

## Migration Plan

One forward migration, and with it `BACKUP_SCHEMA_VERSION` in `src/backup/format.ts` from 21 to
22 — `format.test.ts` fails until it equals the number of committed migrations, which is the
tripwire's purpose: it forces the question «does a бекап still hold everything it should». Here the
answer is yes and unchanged, because the three new columns are on `journal`, which a бекап has
never contained and which a відновлення leaves alone.

No data transformation, no rollback path needed: the three columns are
nullable and the previous build ignores columns it does not select. Installing an older build over
a newer database leaves the extra columns unread, which is exactly what nullable columns are for.
