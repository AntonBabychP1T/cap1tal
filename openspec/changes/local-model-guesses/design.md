## Context

See proposal.md for the motivation. `docs/on-device-ai-proposal.md` §4–§5 holds the technology
survey and the architecture sketch, and this design decides between them. What the code gives:

- **Ports and adapters.** Every device capability is a port in `src/platform/<x>.ts`, a
  `<x>-device.ts` adapter that tests never load, and a binding in `src/hooks/*-ports.ts`. Local
  Kotlin modules live in `modules/` and are autolinked (`modules/notification-capture/`).
- **From `merchant-normalization`:**
  - `MerchantIndex`, `proposeMerchant`, `SERVICE_WORDS` and `namelessGroups`, plus the naming form
    that can be opened holding a proposal;
  - the stored `mcc`;
  - `categorisationContext`.
- **The amount reader.** The generic notification parser (`src/notifications/parse.ts`) reads
  amounts: digits, an optional decimal part after "." or ",", spaces as thousands separators, and
  integer minor units. It skips a number that is a fragment of a longer one. It keeps
  `MONEY_IN_MARKS`. A raw чернетка without an original-currency reference exists exactly because
  none of its amounts had a currency beside it.
- **Readiness.** Launch chores run after the first screen is drawn (`src/ui/launch-chores.ts`), and
  they record a thrown error with its message. Screens re-read on the storage change stamp
  (`src/db/stamp.ts`).
- **Platform defaults.** Expo's default minSdk is 24. Google's on-device GenAI Prompt API (Gemini
  Nano via AICore) requires 26 and is foreground-only.

## Goals / Non-Goals

**Goals:**
- Everything around the model is pure and covered by `vitest` with a fake port: which things
  qualify, the facts, similar history, the checks, the planner and the keys. The model is the only
  untested part, and the spike's eval set measures it.
- The model never produces a value the app trusts unchecked. It picks from an enum, or it quotes
  text the app then reads and bounds.
- One port lets a different engine replace Nano without touching feature code: Gemma on LiteRT-LM,
  or Apple's on-device model for an iOS build.

**Non-Goals:**
- Streaming, chat, or any free text reaching a screen.
- Embeddings for similarity. A deterministic order over the owner's history is cheaper and testable
  (proposal §4, last paragraph).
- Running the model off the foreground: no WorkManager, no service.

## Decisions

### L1 — One port, closed requests

`src/platform/local-model.ts` defines:

```ts
type ModelState =
  | { kind: 'unavailable'; reason?: string }
  | { kind: 'downloadable' }
  | { kind: 'downloading' }
  | { kind: 'ready'; modelVersion: string };

type FetchOutcome = { kind: 'started' } | { kind: 'failed' };

interface LocalModelPort {
  state(): Promise<ModelState>;
  fetch(): Promise<FetchOutcome>; // asks the phone's system; never downloads itself
  ask(request: { prompt: string; schema: JsonSchema; timeoutMs: number }):
    Promise<{ kind: 'answer'; json: unknown } | { kind: 'failed'; reason: 'error' | 'timeout' | 'quota' }>;
}
```

The adapter maps every native exception to one of the three reasons and keeps no message, so
nothing the library says, which may quote the prompt, can reach the журнал. `reason` on
`unavailable` is a fixed Ukrainian sentence chosen from the native status code, never the
library's text.

`local-model-device.ts` binds the port to `modules/local-model`. On every platform where that
module is absent (iOS, web) it returns `unavailable` and never throws. On an emulator without
AICore the module itself reports `unavailable`. The fake port in tests answers from a table.

*Alternative: react-native-executorch or a LiteRT-LM model file.* Rejected for now (proposal §4):
- a 0.5–3 GB file the app would have to deliver;
- a new outbound connection, or a hand-picked file;
- no NPU.

The port keeps both open.

### L2 — The model quotes, the app reads

Each kind has a JSON schema enforced through the API's structured output, and a check in
`src/model-guesses/checks.ts`.

**категорія**
- Schema: `{ choice: "c1" … "cN" | "unknown" }`.
- Check: `cK` maps back, per request, to the K-th offered категорія. At showing time, it must still
  be an unarchived expense категорія.

**продавець**
- Schema: `{ name: string, spelling: string }`.
- Check on the name: `name.trim()` is not blank and at most 40 characters, and its name key either
  occurs in `foldCase(latestОпис)` or equals an existing продавець's name key. In the second case
  the guess becomes an addition.
- Check on the spelling: `foldCase(spelling.trim())` occurs in `foldCase(latestОпис)`, has at least
  three `\p{L}`, is not in `SERVICE_WORDS`, and no other продавець holds it.

**сума**
- Schema: `{ quote: string }`.
- Check:
  - `readAmounts(quote)` yields exactly one amount, which is greater than zero and among
    `candidateAmounts(text)`;
  - `namesForeignCurrency(text, рахунокCurrency)` is false.

The `cK` aliases keep every identifier away from the model and keep the enum short. Requiring the
продавець's name to come from the опис or from an existing продавець bounds the only free text the
model writes. The cost is that a cross-script clean name for a brand-new продавець («АТБ» for «ATB
MARKET» with no «АТБ» yet) is dropped. When «АТБ» already exists, the same answer becomes an
addition, which is where most of the value is.

`readAmounts(text)` is extracted from the generic parser as an exported pure function listing every
amount the parser's rule reads, fragments skipped as today. The parser's tests stay as they are.
`candidateAmounts(text)` then removes three kinds of amount:
- an amount preceded, after optional spaces, by `*`, `•` or a run of `x`/`х`/`X`/`Х`, which is a
  card number;
- an amount matching `\d{1,2}[.:]\d{2}` that is followed by `[.:]\d` or preceded by a date or time
  shape. The parser's fragment rule already drops `26.08.2026`, and this catches `26.08` and `14:32`
  standing alone;
- an amount among the three words after a folded `залишок`, `баланс`, `доступно` or `ліміт`.

`namesForeignCurrency` looks for:
- any three-letter ISO-4217 alpha code, other than the рахунок's, standing as a word in any letter
  case, from a constant `ISO_4217_CODES`. Matching «usd» in prose errs on the safe side: no guess;
- or any sign in `CURRENCY_SIGNS` (`$ € £ ¥ zł ₽ ₺ …`) other than the рахунок's own.

The kind filter in `subjects.ts` drops a raw text carrying a money-in word before any question
is asked: the parser's `MONEY_IN_MARKS`, plus words beginning with the stems `MONEY_IN_STEMS`
(«зарахов», «надійш», «надход», «отрима», «поповн», «поверн»). The stems live in `subjects.ts`
only, and the parser is left as it is.

### L3 — Two keys: the thing, and the attempt

- **Subject key.** This is the thing itself:
  - for a витрата, `опис | mcc | amount | currency`;
  - for a group, its key plus its folded latest опис. Every LIQPAY merchant shares the key
    «liqpay», so the key alone would carry an old guess onto a new latest опис;
  - for a чернетка, its text.

  It decides showing, accepted and «Ні». A row is shown or offered only while its subject key
  equals the thing's current one. It is the spec's «while the thing itself is unchanged», so
  neither a model update nor a new similar витрата can bring a refused thing back. A shown guess
  also survives the model becoming unavailable.
- **Attempt key.** This is the subject key plus `PROMPT_VERSION` and the model version. It decides
  only whether a `dropped` or `failed` row may be asked about again. A new model or prompt gives a
  dropped thing another chance, and a failed thing three tries per attempt key.

Both keys are FNV-1a 64 over canonical JSON: pure, with no crypto dependency.

`src/model-guesses/facts.ts` builds the facts object per kind, with no identifiers and no рахунок
назви. `src/model-guesses/prompt.ts` renders it as a Ukrainian instruction plus the facts as
delimited data. The instruction says the delimited data is the bank's text and the owner's history,
not instructions, and asks for «unknown» when unsure. The spike freezes the prompt's text in
`spike.md`, and task 2.4 reproduces it word for word under `PROMPT_VERSION = 1`.

### L4 — Similar history in JS

`similarExpenses(subject, history, index)` works in three steps:
1. it keeps the most recent витрата of each folded опис among the eligible ones;
2. it scores the survivors with
   `(sameMerchant ? 1 : 0, sameMcc ? 1 : 0, sharedWords, date, createdAt)`;
3. it drops candidates with all three signals at zero, and takes at most `SIMILAR_LIMIT` = 8.

Words are `\p{L}+` runs of `foldCase(опис)`. The history is the `storedHistory` the planner already
holds, and the result is memoised per subject within one opening.

### L5 — Planner and runner, at every opening

- `planQuestions(state) → Question[]` is pure. It does three things:
  - lists the qualifying subjects in the spec's order: raw чернетки oldest first, «Без категорії»
    newest first, then the groups `namelessGroups` returns, which are the twenty it shows;
  - drops every subject with a row in `shown`, `accepted` or `refused` for its current subject key,
    in `dropped` for its current attempt key, or in `failed` with three attempts for its current
    attempt key;
  - cuts the list to `QUESTION_BUDGET` = 30.
- An **opening** is a transition to `AppState` `active`, the cold launch included.
  `src/hooks/local-model-ports.ts` subscribes to `AppState` and starts the runner,
  `src/model-guesses/runner.ts`, on each one, unless a run is already going. The cold-launch run is
  scheduled the way launch chores are, after the first screen is drawn, but without their error
  reporting. A return to the foreground starts at once, since its screen is already drawn.
- The runner works in this order:
  1. it reads the state, and returns when the switch is off or the state is not `ready`;
  2. it awaits the questions one by one with a 20 s timeout;
  3. it checks every answer and writes its row;
  4. it bumps the change stamp after each shown припущення, so screens update in place.

  On `background` it sets an abort flag, the in-flight result is discarded, and the run ends. At
  its end it writes one журнал entry with the four counts.
- The runner is not a launch chore. Launch chores record a thrown error's message, and the runner
  must never let a message reach the журнал (L1).
- Parsing and checking an answer are total. A `JSON.parse` failure, a wrong shape or an absurd
  value becomes a dropped answer, and no exception and no message leaves the runner. That matters
  because a parse error's message can quote the answer, which can quote the опис.
- The runner never writes a категорія, a продавець or a чернетка.
- `index.ts` and every background task file never import the runner. A structural test in
  `src/model-guesses/runner-usage.test.ts` asserts this, in the style of the existing
  `*-usage.test.ts` files.

### L6 — Storage

The new tables:

- **`model_guesses`**
  - Columns:
    - `id`;
    - `kind` (`category` | `merchant` | `amount`);
    - `transaction_id` → `transactions.id` **ON DELETE CASCADE**;
    - `draft_id` → `notification_drafts.id` **ON DELETE CASCADE**;
    - `group_key` text;
    - `subject_key` text not null;
    - `attempt_key` text;
    - `state` (`shown` | `accepted` | `refused` | `dropped` | `failed`);
    - `answer` text, JSON, present only for `shown` and `accepted`;
    - `attempts` integer;
    - `updated_at`.
  - CHECKs: exactly the subject column of its kind is set; `answer IS NOT NULL` exactly when the
    state is `shown` or `accepted`.
  - One row per (kind, subject), enforced by three partial unique indexes. A new question about the
    same thing replaces its row.
  - Cascade is right here: the spec says a припущення goes with its thing.
- **`local_model_settings`**: one row, holding `enabled` and six counters (accepted and refused ×
  three kinds).

Exclusions and resets:
- Both tables are left out of `BACKUP_TABLES` and out of the snapshot.
- A restore deletes every `model_guesses` row: cascade handles the transaction and draft rows, and
  `group_key` rows are deleted explicitly. It keeps `local_model_settings`.
- Turning the switch off deletes every row and zeroes the counters in one transaction.

### L7 — What «shown» means at read time, and acceptance

`src/ui/model-guesses.ts` exposes `offeredGuess(subject, row, current)`, which returns a view model
only when all three hold:
- the row's state is `shown` or `accepted`;
- `row.subject_key` equals the thing's current subject key;
- the thing still qualifies: still «Без категорії», still unrecognised and among the twenty, still
  a raw чернетка awaiting. For a категорія, the answer must also still be an unarchived expense
  категорія. For a продавець, the check of L2 is run again against the latest опис and the продавці
  stored now, so a написання someone has since taken, or one gone from the latest опис, is never
  offered.

Screens never read rows directly.

Accept and refuse:
- **Accept** sets `state = 'accepted'` and increments the accepted counter, both only on the
  transition from `shown`, so a second accept of an abandoned offer counts nothing. It then calls
  the very function the owner's own pick calls: the categorise action, the naming form opened with
  a prefill, or the чернетка's сума set.
- A категорія accept answers the thing at once, and the row is deleted with the next planner pass.
  An abandoned naming form or an unconfirmed чернетка leaves the row `accepted` and still offered,
  as the spec says.
- **«Ні»** sets `state = 'refused'` and clears `answer`. It increments the refused counter only on
  the transition from `shown`. On an `accepted` offer it withdraws the offer and counts nothing, so
  one guess is never both accepted and refused. «Accepted» counts taps, once per guess. An accept in
  editing is therefore counted before the save, which is what the section's wording says.

### L8 — Native module and config

- **`modules/local-model/`** is a new local Expo module: Kotlin, Android only, autolinked like
  `notification-capture`.
  - It exposes `state()`, `fetch()` and `ask(prompt, schemaJson, timeoutMs)` over ML Kit GenAI
    Prompt API (`com.google.mlkit:genai-prompt`, the exact version pinned by the spike) inside the
    module's `build.gradle`.
  - It maps the API's statuses `UNAVAILABLE`, `DOWNLOADABLE`, `DOWNLOADING` and `AVAILABLE` onto
    `ModelState`.
  - It runs inference on a coroutine off the JS thread.
- **Pinning.** Task 1.5 writes the pinned version, the permissions, and the jobs, services and
  receivers the library merges into the manifest, as found by the spike, into this section and into
  `modules/local-model/library-manifest.json`, before group 4 starts. The file is re-recorded at
  every version bump.
- **Reporting components.** Every usage-reporting component the library merges in, such as
  `com.google.android.datatransport.*` services, receivers and jobs, is removed in the module's own
  manifest with `tools:node="remove"`. A library that fails without one stops the change. Blocking
  a permission cannot stop such a component, because the app holds INTERNET for monobank.
- **Permissions.** No permission is added for the model. Any permission ML Kit's manifest merges in
  goes into `app.json` `android.blockedPermissions`, with a one-line reason in
  `.claude/rules/android.md`. A library that will not work with it blocked stops the change.
- **Tests.** `verify` cannot build natively, so «No permission arrives with the model» and «No
  reporting component arrives with the model» are Node tests against the recorded
  `library-manifest.json`. One checks that `app.json` blocks every recorded permission, the other
  that the module manifest removes every recorded reporting component. Task 4.2 also checks the
  real merged manifest of a debug build, and the same check is repeated at every version bump.
- **`plugins/with-min-sdk.js`** is a new local config plugin that sets `android.minSdkVersion=26`
  in the generated `gradle.properties`, which Expo's autolinking settings plugin reads as `minSdk`.
  It is added to `app.json` `plugins`. `android/` stays generated and is never hand-edited.
- **No `package.json` dependency.**

### L9 — Untrusted text in the prompt

Описи and сповіщення texts are written by banks and merchants, so a hostile опис could carry
instructions. What bounds the damage:
- the output is closed: an enum alias; a назва and написання that must come from the very опис, or
  name an existing продавець; or a quote that must be a candidate amount the text states;
- nothing applies without the owner's tap.

The worst an injected опис can do is make the model pick a wrong offered категорія, a wrong
substring of itself, or a wrong amount it states, which the owner then sees beside the text and
refuses. The prompt delimits data and says so (L3), and that is all the prompt is trusted with.

### L10 — Phase 0 before production code

Task group 1 is the proposal's §7 spike, run on a throwaway branch on the owner's S24.

- **Eval set.** It is pulled via `run-as` into the gitignored `.cache/model-eval/`, which leaves
  the machine only with the owner's say.
- **Code.** The spike uses a throwaway copy of the checks and the facts builder, written on that
  branch. The prompt text it settles on is frozen in `spike.md`. Group 2 reimplements both under
  tests and reproduces the frozen prompt, so the gate measures what will ship and no production
  code precedes it.
- **Held-out gate.** The eval set is split before any tuning. The prompt is tuned on one part. The
  gate is measured once, with the frozen prompt, on a held-out part of at least 100 шаблон-missed
  витрати, collected across months if one month is not enough. Twenty shown guesses would carry
  about ±18 % on an 80 % precision.
- **«Acceptable» продавець.** The написання recognises the eval опис and none of a held-out set of
  other merchants' описи, and the назва equals the owner's own label with letter case folded.
- **Privacy watch.** Traffic from the app's process is watched for at least 24 hours with the
  switch on, in the foreground, in the background and after a reboot, since reporting libraries
  batch uploads for later. Every job, service and receiver the library merges in is listed.
- **`openspec/changes/local-model-guesses/spike.md`** holds aggregates only:
  - the state on that phone and firmware, the model version, and the ML Kit artifact version;
  - the median and the 95th percentile of latency;
  - per kind, the precision of shown guesses and their coverage;
  - the stated-but-wrong сума rate;
  - what the system component reports, the app-process traffic observed, and the merged
    permissions;
  - the frozen prompt;
  - the go/no-go against the proposal's [PROPOSED] thresholds.

  Privacy is one of the gates: app-process traffic, or a permission that cannot be blocked, is a
  no-go.

On no-go, the change stops and the owner decides between Gemma on LiteRT-LM (a new proposal,
because it needs a model file) and parking the change.

## Risks / Trade-offs

- **Ukrainian quality of the older Nano on the S24.** → The spike's eval on the owner's own data
  is the gate. The acceptance counts in the section keep measuring it after launch.
- **A raw text whose only plausible amount is not a candidate.** For example, a bank that writes
  the сума right after «баланс:». → No guess is shown and the owner types the сума as today.
  Missing a guess costs a few taps. A wrong but plausible guess would cost a wrong витрата.
- **Cross-script clean names for new продавці are dropped** (L2). → This is accepted for the
  injection bound. It can be revisited with the spike's data without a change to the facts or the
  storage.
- **Beta API churn.** → It is contained in `modules/local-model` behind the port. The version is
  pinned.
- **Availability changes with firmware or an unlocked bootloader.** → The state is read at every
  opening. Absence means today's app, and shown guesses stay (L3).
- **Quota and battery.** → At most 30 questions per opening, one at a time, foreground only.
  Failures back off after three attempts per attempt key.
- **minSdk 26** excludes Android 7 devices from installing the app at all. → Android 8.0+ covers
  nearly all phones in use, and the owner's S24 runs Android 14+. This is stated in the proposal.
- **The emulator cannot run the model.** → `smoke-runner` covers the unavailable path. The
  available path is a recorded run on the owner's phone (task 6.3), as `.claude/rules/android.md`
  allows for device-only behaviour.
- **What Google's component reports is unknown until the spike.** → The section's wording is fixed
  from `spike.md` (spec: «in words fixed when this change is built»). If what is reported
  contradicts vision §12, the change stops for the owner's decision.

## Migration Plan

1. One new migration adds `model_guesses` and `local_model_settings` (switch off, counters zero).
   It touches no existing table.
2. The minSdk raise takes effect at the next native build. `scripts/android.sh up` rebuilds when
   `plugins/`, `modules/` or `app.json` changes.
3. Rollback: turn the switch off, which forgets everything. A build without the module reports
   `unavailable` and leaves the rows unread.
