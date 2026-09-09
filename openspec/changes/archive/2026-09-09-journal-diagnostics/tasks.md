## 1. The entry: three kinds, three fields

- [x] 1.1 Add `network`, `step` and `native` to `JournalKind` and to `KIND_LABELS` in
      `src/reporting/journal.ts` («мережа», «крок», «пристрій»); raise `JOURNAL_LIMIT` to 2000.
      Verify in `src/reporting/journal.test.ts` that every kind has a label and that
      `appendBounded` drops the oldest at 2000 — spec «The журнал is bounded».
- [x] 1.2 Add `run?: string`, `tookMs?: number` and `counts?: Readonly<Record<string, number>>` to
      `JournalEntry`, and extend `entryLine` to render them after the name — duration as `123 мс`,
      counts as `ключ=число` pairs in key order, the `run` mark as a short prefix. Verify in
      `src/reporting/journal.test.ts` that an entry with none of the three renders exactly the
      line it renders today (no trailing separators) and one with all three renders each once.
- [x] 1.3 Add `describeRequest(method, url)` to `src/reporting/journal.ts`: query string dropped
      for every host; the path kept whole for `api.monobank.ua` and reduced to its endpoint shape,
      identifiers replaced, for every other host (design D3). Verify in
      `src/reporting/journal.test.ts` that a monobank statement path keeps its account id, that a
      Drive file path keeps neither the file id nor the query, and that a чек lookup keeps no part
      of the реквізити — spec scenarios «A statement request is an entry», «A path that is not the
      bank's keeps only its shape» and «A request whose path is the owner's business is not
      described by its path».
- [x] 1.4 Add `foldScreens(entries)` to `src/reporting/journal.ts`: consecutive entries of kind
      `screen` with the same name become one line saying how many and the first and last moments.
      Verify in `src/reporting/journal.test.ts` that five identical consecutive routes fold to one
      line, that two different routes do not fold, and that a non-`screen` entry between two
      identical routes breaks the run — spec «Repeated screens are one line».

## 2. Storage

- [x] 2.1 Add `network`, `step` and `native` to `KINDS` in `src/db/reporting-repo.ts` and update its
      «four doors» comment. **Do this before anything writes a new kind**: widening `JournalKind`
      does not break that array, and `checkKind` would otherwise throw on every read of a new entry
      while `journal.record` swallows the error (design D1). Verify in the repository's test that
      an entry of each of the three new kinds round-trips through storage.
- [x] 2.2 Add nullable `run`, `took_ms` and `counts_json` columns to the `journal` table in
      `src/db/schema.ts` with the comments the file's style asks for, then run `npm run db:generate`
      and commit the generated migration unedited. Verify by a test that runs every migration on an
      empty database and asserts the `journal` table's resulting shape
      (`.claude/rules/database.md`).
- [x] 2.3 Raise `BACKUP_SCHEMA_VERSION` in `src/backup/format.ts` from 21 to 22 and record in this
      change why a бекап still holds everything it should — the new columns are on `journal`, which
      is never in a бекап. Verify `src/backup/format.test.ts` passes.
- [x] 2.4 Read and write the three columns in `src/db/reporting-repo.ts` — `toEntry` maps `null` to
      absent exactly as it does for `detail`, and the append writes `counts` as JSON. Verify in the
      repository's test that an entry with all three round-trips, and that a row with the three
      columns `NULL` reads back with the same moment, kind, name and detail and none of the three —
      spec «An entry written before this build reads back unchanged».

## 3. The singleton: recording without a call site that can forget

- [x] 3.1 Extend `journal.record` in `src/ui/journal.ts` to take the optional tail (`run`, `tookMs`,
      `counts`) and keep its current two- and three-argument shapes working unchanged. Verify in
      `src/ui/journal.test.ts` that an existing call still writes exactly the entry it writes today.
- [x] 3.2 Add `journal.step(name, fn, { run? })` to `src/ui/journal.ts`: mints a `run` when none is
      given, writes the beginning entry, awaits `fn`, writes the ending entry with `tookMs` and the
      counts `fn` returned, and on a throw writes the failing ending and rethrows the original
      error. Verify in `src/ui/journal.test.ts` both endings, the shared `run`, and that the thrown
      error reaches the caller unchanged — spec «The журнал records what the app itself did».
- [x] 3.3 Add `journal.watchFetch(impl, { run?, method? })` to `src/ui/journal.ts`: one `network`
      entry per call, named by `describeRequest`, with the status in `counts`, the duration in
      `tookMs`, and an **app-composed** word in `detail` for a call that rejected — never the
      caught error's message, which may quote the whole URL (design D3). It is generic over the
      rest of the arguments and over the response type — `(url, ...rest) => Promise<R>` in,
      the same shape out, reading only `status` — because the five seams have five different
      signatures; `method` defaults to `GET` and Drive passes `(init) => init.method ?? 'GET'`.
      Verify in `src/ui/journal.test.ts` an answered call, a refused status, a rejected call whose
      message carries a URL (asserting that URL is nowhere in the entry), that the wrapper returns
      the very response object it was given without reading its body, and that a one-argument
      `(url) => Promise<{ok,status,text()}>` and a two-argument `AuthFetchLike` both typecheck
      through it — spec scenarios «A statement request is an entry», «A refused request is an
      entry» and «A request that never got an answer is an entry too».
- [x] 3.4 Add `journalProgress(run)` to `src/ui/monobank-sync.ts` (or beside it): a `SyncProgress`
      listener that writes a `step` entry per event — the run starting with how many рахунки, each
      рахунок's turn by its `monobankAccountId`, each wait, and each `finished-account` with its
      outcome and its imported count. Verify in the matching `.test.ts` that a scripted sequence of
      progress events produces one entry per event, all under one `run`, with the failing рахунок's
      id in its own entry — spec «A sync run reads as a run» and «A рахунок that fails is named
      among those that did not».

- [x] 3.5 Wrap the whole run in `journal.step` inside `startSync` in `src/ui/monobank-sync.ts`,
      taking the `run` id from its ports: the beginning entry before `syncLinkedAccounts`, the
      ending entry with `tookMs` and `SyncRun.imported` once the outcome is known. This is what
      records a run at all — the coordinator has no run-finished event, and its `started` fires
      after the token read, so `not-configured`, `storage-unavailable` and `no-links` emit nothing
      (design D4). Verify in `src/ui/monobank-sync.test.ts` that a run ending `not-configured`
      still writes both entries, that a completed run's ending carries the imported total, and that
      its entries share the `run` of the progress entries — spec «A sync run reads as a run».

## 4. Wiring the request ports

- [x] 4.1 Let `syncPorts(over, run?)` in `src/hooks/monobank-ports.ts` take the `run` id its caller
      minted with `newId()` and pass to `startSync` as well, so one run's `step`, per-рахунок and
      `network` entries share one mark (design D4); update the three call sites — the app shell,
      Головний's pull, and «Синхронізувати» — plus the background task. Then wrap the fetch
      **outside** `withRequestTimeout` — `journal.watchFetch(withRequestTimeout(...))`, never the
      other way round (design D3) — and compose the journaling `onProgress` with any
      `over.onProgress` the caller supplies. Verify by a test that a supplied `onProgress` still
      hears every event, and that a timed-out request produces one entry saying so — in the app's
      own word «не відповів», **never the timeout's message**, which is still a caught error's text
      and which the ADDED requirement forbids — with the duration waited. `withRequestTimeout`
      names its rejection (`REQUEST_TIMEOUT_NAME`) so `watchFetch` can tell it apart from a
      platform failure without reading a message; the two are composed in one test, since both
      halves load under `verify`.
- [x] 4.2 Wrap the screen's own `fetch` in `src/app/manage/monobank.tsx`. Verify `npm run typecheck`
      and that `src/monobank/api.ts` is unedited.
- [x] 4.3 Wrap the four Drive endpoints' `fetch` in `src/platform/drive-device.ts`, passing
      `(init) => init.method ?? 'GET'` as the method and keeping every member of the response the
      adapter reads (`.headers`, `.json()`, `.text()`, `.arrayBuffer()`). Verify by a
      `describeRequest` test over each of the four URLs that no entry keeps a file id or a query
      string — spec «A path that is not the bank's keeps only its shape».
- [x] 4.4 Wrap the чек provider's fetch at its call site in `src/app/transaction/scan.tsx` — a
      one-argument `FetchLike` answering `text()`. Verify
      `src/fiscal/chk-all-web.ts` is unedited and that its stated invariant holds by the
      `describeRequest` case from task 1.3.
- [x] 4.5 Wrap the rate endpoint's `FetchLike` at its call site in `src/hooks/use-current-rates.ts`
      — a one-argument shape answering `json()`. Verify `src/monobank/currency.ts` is unedited and
      `npm run typecheck` passes.

## 5. Operations

- [x] 5.1 Wrap the local бекап and the відновлення in `src/ui/backup-screen.ts` in `journal.step`,
      each returning its measured counts. Verify in `src/ui/backup-screen.test.ts` that both ends
      are recorded under one `run` with the counts — spec «An operation that succeeds is recorded».
- [x] 5.1a Wrap the Drive бекап run in `src/backup/drive/run-backup.ts` in `journal.step`. This is
      the path the four `збій · backup · not-configured` entries in the репорт that prompted this
      change came from, so it is the one whose beginning and outcome the reader most needs. Verify
      in its existing test that a run refused for want of configuration records both ends with that
      enumerated reason.
- [x] 5.2 Wrap the Saldo import in `src/ui/saldo-import.ts` in `journal.step`, returning the
      рахунки and транзакції it wrote as counts. Verify in `src/ui/saldo-import.test.ts` that the numbers recorded are the numbers
      committed.
- [x] 5.3 Wrap the drain of captured bank notifications in `src/ui/notification-drain.ts` in
      `journal.step`. Verify in `src/ui/notification-drain.test.ts` that a drain of five captured notifications making two чернетки records those two
      numbers and no part of any notification's text — spec «The counts an operation measures are
      numbers».
- [x] 5.4 Wrap the Google sign-in token exchange in `src/platform/google-auth-device.ts` in
      `journal.step` (design D5a — there is no fetch to wrap there), with the outcome mapping as a
      pure function on the port `src/platform/google-auth.ts`. Verify in
      `src/platform/google-auth.test.ts` that a refused exchange records its own enumerated reason
      and no part of any URL or code.

## 6. The device's own half

- [x] 6.1 Add to `src/ui/monobank-background.ts` the pure decision of what a background chance and a
      task registration journal — the name, the enumerated `detail`, the counts. Verify in
      `src/ui/monobank-background.test.ts` that a chance that ran while the app was in front, one
      that ran headless, and a refused registration each produce the entry the spec names, and that
      the chance's entry carries the same `run` as the sync it starts (task 4.1) — spec «A
      background chance is an entry» and «A refused registration is an entry».
- [x] 6.2 Call that decision from `src/platform/monobank-sync-task.ts` and
      `src/platform/background-turn.ts`'s `reconcileTask`. Verify `npm run typecheck` and that
      neither file gained a decision of its own.
- [x] 6.3 Add a pure decision beside `src/ui/alerting.ts` for the permission reads — notification
      access granted or withdrawn, the listener connected or not — writing only when the state read
      differs from the state last recorded, and call it from
      `src/platform/notification-access-device.ts` and `notification-capture-device.ts`. Verify in
      the pure function's test that a withdrawn permission and a disconnected listener each write
      one entry naming it with the device's enumerated word, and that four reads finding the same
      state write one entry and not four — spec «A withdrawn permission is an entry», «The
      listener's connection is an entry» and «A permission that has not changed adds nothing».
- [x] 6.4 Add a pure `AppState` transition function in `src/ui/` — one entry per move between
      `active` and anything else, none for a change that is not a move — and call it from
      `src/app/_layout.tsx` beside the crash handlers. Verify in its test that `active → background
      → background → active` produces two entries — spec «Leaving and returning are entries».

## 7. The rendered репорт

- [x] 7.1 Add `networkSummary(journal)` and `runTimelines(journal)` to `src/reporting/report.ts` as
      exported pure folds. Verify in `src/reporting/report.test.ts` that the summary counts
      requests, failures, the slowest — the earliest where two tie — and the sync runs with the
      last one's outcome, and that a timeline groups one run's entries in order with the requests
      that share its `run` among them — spec «The summary counts what the журнал holds» and «One
      operation reads as one timeline».
- [x] 7.2 Render the summary before «Що не так», and «Network · Мережа» and «What the app did · Що
      робив застосунок» between the failures section and the screenshots — English anchor first, as
      `heading()` renders every other section — each present and saying it has nothing when it has
      nothing; render the журнал section through `foldScreens`. Verify in
      `src/reporting/report.test.ts` that a репорт holding only screen entries still has all three
      sections, that rendering twice gives identical text, and that the handed-over file is still
      the same text plus image data — spec «A репорт with nothing to summarise still has the
      section» and «Rendering is deterministic».
- [x] 7.3 Add the writer-side privacy test beside `src/ui/journal.ts` (not in
      `src/reporting/privacy.test.ts`, which sits under `src/ui/` in the import order and must stay
      over values): drive `watchFetch`, `journalProgress` and `journal.step` directly over recorded
      events — never through `src/hooks/monobank-ports.ts`, which imports `AppState` and cannot
      load under `verify` — scripting a full sync with a token set, a drain of captured
      notifications and a бекап; assert the resulting журнал and the репорт rendered from it carry
      no part of the token, no сума, no назва, no опис, no notification text, no Drive file id and
      no реквізити. Extend `src/reporting/privacy.test.ts` with the value-level half: a `counts`
      value can only be a number, and the new kinds carry no field a сума fits in — spec «No
      request entry carries the token» and «The journal carries no money».

## 8. Product truth

- [x] 8.1 Update the **Журнал** entry in `docs/glossary.md`: the kinds it now records, the three
      optional fields, «the most recent 2000», and the monobank account id as the one named
      exception beside the app's own refusal text. Verify the wording matches the spec delta's
      modified requirement word for word where they overlap.
- [x] 8.2 Update `docs/app-overview.md` where it describes the репорт's sections, if it names them.
      Verify by grep that no doc still says the журнал keeps 500 or names only four kinds.

## 9. Gate

- [x] 9.1 Run `npm run verify` and paste the final lines
- [x] 9.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
