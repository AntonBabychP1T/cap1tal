## Why

The owner's phone holds nine приєднані рахунки monobank, and the monobank screen has said
«Синхронізовано 3 з 9 рахунків» since 3 September: the picture the app shows is days old most of
the time, and the репорт про помилку of 7 September says so in one line — «Дуже довго не проходить
синхронізація. Очікував: синхронізація буде проходити у фоні». It does not. A run exists only while
the app is in front of the owner; on Android the minute the run waits between requests stops
counting the moment they leave, and resumes only when they come back. monobank allows one request a
minute, a run costs `1 + рахунки` requests, and a first sync over months of history costs one
request per 31-day window per рахунок — hours of the app being open that nobody spends. Money that
never arrives in the app answers neither of the vision's two questions: it is neither «куди пішли
гроші» nor part of «скільки залишилось».

## What Changes

- **The phone is asked for chances to run in the background while a рахунок is linked**, and on
  every chance it gives the app starts a **background run** — the same sync an opening starts,
  under the same quiet interval, the same one-a-minute pace, the same longest-waiting-first order
  of turns and the same one-run lock. A chance is asked for no oftener than about every fifteen
  minutes, which is the soonest Android allows; when the phone actually gives one is the phone's
  decision, and the app promises no cadence. A phone that gives none syncs exactly as it does
  today.
- **A background run is given a time budget** shorter than what Android allows it. It sends no
  request the budget cannot hold; the рахунки it did not finish end **postponed** (перенесено):
  a рахунок it never sent a request about has nothing moved and no turn taken, so it heads the next
  run's order; a рахунок it stopped between windows keeps every committed page, its cursor and its
  turn. Either way the next run continues from where this one stopped, so successive background
  runs work through every рахунок however many there are and however long their first sync is.
- **A run in front of the owner yields when the app leaves the foreground.** The wait before the
  next request ends at once, the run stops before sending it, and the unfinished рахунки end
  postponed for the background to continue. Until now such a run froze mid-wait holding the one-run
  lock, which would have blocked every background run until the owner came back. The phone answers
  «in front» or «away» and nothing finer — a dialog drawn over the app reads the same as the owner
  leaving, and the app does not pretend otherwise — so the one thing it does is refuse to spend a
  whole run on that answer: a run that has sent no request yet does not yield.
- **A рахунок remembers where paging got to, so a run that stops in the middle of a window is not
  wasted.** A window whose answer comes back full is asked again, narrowed backwards, until an
  answer comes back short — and the cursor cannot move while that is going on. Until now that
  position lived only in the run's memory, so a рахунок needing more pages than one run could spend
  requests on could never finish at all: every run re-read the same pages and stopped in the same
  place. That is the defect the owner's phone found on 2026-09-09, and yielding is what turned it
  from slow into never.
- **A postponed run does not spend the quiet interval.** Opening the app after one starts a full
  run at once; a background run that ends postponed while the owner is already in the app is
  followed at once by one without a budget.
- **A background run announces a failure only when monobank needs the owner** — the token was
  rejected, or the runs keep failing and no linked рахунок has synced for a day — as one сповіщення
  про збій; a completed run clears it; a run offline in the metro, or one merely postponed, says
  nothing, and a run that finds the сповіщення already standing records nothing more. This is the
  rule «Потребує уваги» on Головний already applies, now reaching the owner while the app is
  closed.
- **Every request has a timeout.** A request the bank never answers ends unavailable and the run
  goes on, instead of holding the one-run lock until the process dies — which, once background
  runs exist, would silently stop every one of them.
- The monobank screen says that sync also runs in the background, and the outcomes it names gain
  «перенесено» beside «скасовано» and the four failures.
- One migration, and it is the paging one: two nullable columns on `monobank_links` holding the
  window a рахунок is half-way through and the page its next request should ask for. Every existing
  row reads them back as absent, which is true of all of them, and neither goes into a бекап — they
  are this phone's own progress, like `last_attempted_at`. Nothing else is stored: the remembered
  attempt already holds an outcome, and «postponed» is one more word it can hold.

### Scope

The background run, its budget, the yielding of a foreground run, the outcome that names both,
what a background run announces, the request timeout, and one sentence on the screen — plus the
one engine rule a stoppable run cannot do without: where a half-paged window got to, which until
now lived in the run's own memory and died with it. What is fetched, how an item maps, the dedup,
the order of turns and the pace are called, not changed.

### Non-goals

- **No foreground service and no persistent notification.** A service that keeps the app alive to
  make one request a minute forever is what Android 14+ restricts and what a battery-minded owner
  uninstalls. Chances the phone gives are enough for a picture that is fresh most of the time.
- **No promise of a cadence.** Doze, App Standby buckets and Samsung's own battery rules decide
  when a chance comes; the app never states a time and never claims «every 15 minutes».
- **No prompt to exempt the app from battery optimisation.** Possibly a later change; it is a
  system setting, and the app works without it.
- **No change to what a run imports** — no транзакція, сума or cursor behaves differently because
  the run started in the background.
- **No iOS work beyond staying possible.** The same mechanism exists there (the system gives
  processing time when it chooses, mostly at night); nothing here assumes Android except one
  budget constant, kept behind a platform switch.
- Vision §14 stays untouched: no remote push (§14.14), no cloud service (§14.9), no second device.
  The only network is the same monobank personal API, paced as before.

## Capabilities

### New Capabilities

(none — every behaviour here belongs to a capability that already exists)

### Modified Capabilities

- `monobank-sync`: gains that a sync also runs on the chances the phone gives while the app is not
  in front of the owner; that a background run has a time budget and postpones what it cannot
  finish; that a run in front of the owner yields when the app leaves the foreground; that a
  postponed attempt does not spend the quiet interval and is followed at once when the owner is in
  the app; where a postponed рахунок ranks when a run is remembered and that it never needs the
  owner; what a background run announces; and that a request that does not answer ends
  unavailable. Everything about fetching, mapping, dedup, cursors, the order of turns and the pace
  is untouched.
- `monobank-sync-screen`: the outcomes a run reports gain postponed and the screen names every one
  of them, and the sync section says that sync also runs in the background.
- `persistence`: what a link stores gains where a half-paged window has got to — the window and the
  page its next request should ask for — written in the same transaction as the answer that
  produced it, read back after a restart, and left out of a бекап.

`main-screen` changes nothing at the requirement level: the freshness line already reads whatever
moments a run moved, whoever started it, and the attempt's outcome already survives a restart as
one of the words this capability names.

## Impact

- `src/monobank/coordinator.ts` — one new optional port asking whether the run should yield, asked
  exactly where the owner's «Зупинити» is asked, and the `postponed` outcome. Plus the paging
  resume: a рахунок that starts with a half-paged window works that window first and from where it
  stopped, each full answer writes where narrowing got to, and a window that answers short moves
  the cursor to the end it was paging toward rather than to the run's own end. Mapping, dedup and
  pacing are untouched.
- `src/db/schema.ts` and a new migration under `drizzle/` — the two nullable columns; the
  migrations test runs them all on an empty database.
- `src/db/monobank-repo.ts` — the pair on `StoredMonobankLink` and written by
  `commitStatementAnswer`, in the same one transaction as the транзакції and ids, so a half-paged
  position can never survive an answer that did not store.
- `src/db/backup-repo.ts` and `src/backup/format.ts` — the two columns are named among what a
  бекап leaves behind, beside `last_attempted_at` and for its reason.
- `src/monobank/yielding.ts` (new, pure) — how a run gives up its wait, at the end of a budget or
  when the app leaves the foreground, and how a request gives up on the bank: three small port
  builders over an injected timer and clock.
- `src/monobank/auto.ts` — the remembered-outcome order gains `postponed`; `syncDue` reads a
  postponed attempt as due; `needsOwner` treats postponed like cancelled.
- `src/ui/monobank-sync.ts` — a cancelled or postponed run raises no сповіщення про збій.
- `src/ui/monobank-background.ts` (new, pure) — one background run: is a run due, run it under a
  budget, decide what to announce from `needsOwner`, and whether chances are wanted at all.
- `src/ui/monobank-screen.ts` — «перенесено», `syncFailed` excludes it, the background sentence.
- `src/platform/background-turn.ts` (new), `src/platform/monobank-sync-task.ts` (new),
  `src/platform/drive-backup-task.ts` — the WorkManager task definitions over `expo-background-task`
  (already a dependency, already in `app.json`'s plugins), the one shared interval, and storage
  prepared for a headless start. **No new native module, no new permission, no Expo config
  change.**
- `index.ts` (new, the app's entry) + `package.json` `main` — the task definitions must run before
  expo-router loads anything, because a headless start renders no route and therefore evaluates
  none of `src/app/`. `app.config.js`'s build sources and `scripts/fingerprint.sh`'s watch list
  gain the file.
- `src/hooks/monobank-ports.ts` — every foreground run's wait ends when the app leaves the
  foreground, and every request carries the timeout.
- `src/app/_layout.tsx`, `src/app/manage/monobank.tsx` — registration follows the links; the
  follow-up run after a postponed one; the sentence and the full legend on the screen.
- `openspec/specs/persistence/spec.md` — what a link stores gains the paging position, with the
  scenario every earlier monobank migration has: rows written before it load unchanged.
- `docs/product-vision.md` §12, `docs/glossary.md`, `docs/app-overview.md` §4.4,
  `docs/tech-task.md`, `.claude/rules/android.md`, `.claude/rules/database.md` — the product now
  syncs in the background and the documents say so; the rule that named notification access as the
  only background capability is already behind `google-drive-backup` and is corrected here, and the
  rule that names the root layout as the only place migrations are applied gains the one other
  caller of the same migrator.
- Sequencing: the `monobank-sync` deltas here are ADDED but for one — «Each linked account resumes
  from a committed sync cursor», MODIFIED for the paging position — and `persistence` gains one
  MODIFIED requirement, «Monobank links and progress survive a restart», for the two columns that
  hold it. Both bases are archived requirements of the same names, and no other unarchived change
  touches either. So this change archives in any order
  relative to the chain `home-daily-overview` → `monobank-auto-sync` → `monobank-sync-fairness`,
  and reads best after them, since the requirements it adds extend theirs. Once both are archived
  the truth spec holds `monobank-auto-sync`'s five-word ranking beside this change's sixth word;
  the ranking requirement here says «as the order already ranks them» so the two read as one
  order, and a later tidy-up may fold them into one requirement. The monobank-sync-screen MODIFIED
  — the
  screen's outcomes requirement — is also MODIFIED by the unarchived `qa-sweep-2026-09`; this
  change's block is the union of both (the setup-state retry rule and its two scenarios are
  carried verbatim), and this change archives **after** `qa-sweep-2026-09`, so that whichever
  block lands last is the one that holds everything.
