## 0. Precondition

- [ ] 0.1 Confirm `merchant-normalization` is archived: `openspec list` no longer shows it, and
  `openspec/specs/merchants/spec.md` exists. Stop here if it is not.

## 1. Phase 0 — the spike on the owner's phone (throwaway branch, nothing merged)

- [ ] 1.1 On a throwaway branch, build a minimal Kotlin module (`state`, `fetch`, `ask`) and a
  hidden debug screen. Install it on the owner's S24 and record in
  `openspec/changes/local-model-guesses/spike.md`:
  - the state on that phone and firmware;
  - the model version;
  - the ML Kit artifact version;
  - the median and 95th-percentile latency of one categorisation prompt.
- [ ] 1.2 Pull the eval set from the owner's own data via `run-as` into the gitignored
  `.cache/model-eval/`. Nothing of it is ever committed. The set holds:
  - about 200 categorised витрати and about 50 that the шаблон missed, with the категорія hidden;
  - about 50 описи for продавець extraction;
  - every raw чернетка text available.

  Split the set before any tuning: a tuning part, and a held-out part with at least 100 шаблон-missed
  витрати, collected across months if needed. On the throwaway branch, tune a throwaway copy of the
  facts, the checks and the prompt on the tuning part only (design L2–L4, L10). Freeze the prompt
  text in `spike.md`, then measure once on the held-out part. Record in `spike.md`, as aggregates
  only:
  - per kind, the precision of shown guesses and their coverage of the held-out part. A продавець
    counts as acceptable when its написання recognises the eval опис and none of the held-out other
    merchants' описи, and its назва equals the owner's label with letter case folded;
  - the stated-but-wrong сума rate: a candidate amount the text states that is not the movement's
    сума;
  - the time per question.
- [ ] 1.3 Establish what leaves the phone and what the app is given. Record in `spike.md`:
  - ML Kit's data disclosure;
  - traffic from the app's own process, watched for at least 24 hours with the switch on, in the
    foreground, in the background and after a reboot;
  - every permission, job, service and receiver the library merges into the manifest, whether each
    permission can be blocked, and whether each reporting component can be removed with
    `tools:node="remove"` without breaking the model;
  - the section's wording about what the system component reports.
- [ ] 1.4 Record the go/no-go in `spike.md` against the proposal's [PROPOSED] thresholds:
  - категорія precision ≥ 80 % with coverage ≥ 40 % of the шаблон-missed set;
  - продавець ≥ 90 % acceptable;
  - stated-but-wrong сума ≤ 5 %;
  - median ≤ 2 s;
  - no app-process traffic in 24 hours, no unblockable merged permission, and no reporting
    component that cannot be removed.

  On no-go, stop the change and ask the owner. Group 2 does not start before a recorded «go».
- [ ] 1.5 Write into design L8 and into `modules/local-model/library-manifest.json`:
  - the pinned `genai-prompt` version;
  - the merged-manifest permissions with their blocking;
  - the reporting components with their removal.

  Then run `openspec validate local-model-guesses --strict`.

## 2. The pure module

- [ ] 2.1 Write `src/model-guesses/subjects.ts`, which says which things qualify for which kind,
  money-in raw texts and groups beyond the twenty excluded.

  Tests in `src/model-guesses/subjects.test.ts` prove:
  - "A «Без категорії» витрата with an опис can be guessed";
  - "A повернення is never guessed";
  - "A витрата with nothing to go on is never guessed";
  - "A foreign-currency raw чернетка is never guessed";
  - "Money that arrived is never given a guessed сума", the three texts included.
- [ ] 2.2 Write `src/model-guesses/facts.ts` and `similarExpenses` (design L3, L4). Tests prove:
  - "A рахунок's назва is not among the facts";
  - "The reserved категорії are not offered";
  - "The same state gives the same facts";
  - "The same продавець comes first";
  - "One per опис, eight at most";
  - "Nothing in common gives nothing".
- [ ] 2.3 Extract `readAmounts` from `src/notifications/parse.ts`, keeping every parser test green.
  Write `candidateAmounts`, `namesForeignCurrency` (with `ISO_4217_CODES` and `CURRENCY_SIGNS`) and
  `src/model-guesses/checks.ts` (design L2).

  Tests prove:
  - "An offered категорія passes";
  - "«Не знаю» shows nothing";
  - "A категорія not offered is dropped";
  - "A категорія archived before it is shown is not shown";
  - "A написання outside the опис is dropped";
  - "A назва of the model's own invention is dropped";
  - "A назва taken from the опис passes";
  - "A продавець that exists becomes an addition";
  - "A сума stated in the text passes";
  - "A card number is not a сума";
  - "What is left is not a сума";
  - "A date is not a сума";
  - "A сума the text does not state is dropped";
  - "A text naming another currency gives no сума".
- [ ] 2.4 Write `src/model-guesses/prompt.ts`, holding `PROMPT_VERSION = 1`, the prompt frozen in
  `spike.md` word for word, and the subject and attempt keys (design L3, L9).

  Tests prove:
  - that the rendered prompt equals the frozen text for a fixed fact set;
  - that the data block always sits between the markers;
  - "Refused stays refused": the subject key ignores the model version and the similar set;
  - that a group's subject key changes with its latest опис;
  - "A corrected опис is a new question".
- [ ] 2.5 Write `planQuestions` (design L5). Tests in `src/model-guesses/planner.test.ts` prove:
  - "Raw чернетки first";
  - "Thirty per opening";
  - "A failed question is retried, three times at most";
  - "A dropped answer is not asked for again";
  - that an accepted thing is not asked about again.

## 3. Storage

- [ ] 3.1 Add `model_guesses` and `local_model_settings` to `src/db/schema.ts` (design L6) and
  generate the migration. A test in `src/db/migrations.test.ts` proves "Existing data survives the
  migration".
- [ ] 3.2 Write `src/db/model-guesses-repo.ts`: rows by subject with the five states, the switch,
  counters incremented only on the transition from `shown`, and forgetting everything when the
  switch goes off.

  Tests prove:
  - "A shown припущення comes back";
  - "The switch defaults to off";
  - "A deleted витрата takes its припущення";
  - "Turning off forgets";
  - "A dismissed чернетка takes its сума припущення along";
  - "An abandoned acceptance is offered again and counted once".
- [ ] 3.3 Keep both tables out of `BACKUP_TABLES` and the snapshot, make a restore delete every
  guess row, and add a пакет privacy case.

  Tests in `src/backup/format.test.ts`, `src/db/backup-repo.test.ts` and
  `src/analysis/privacy.test.ts` prove:
  - "Nothing of the model reaches the file";
  - "A відновлення leaves no припущення";
  - "A replace forgets the припущення and keeps the switch";
  - "A guessed витрата is still «Без категорії» in the пакет".

## 4. The port, the native module and the runner

- [ ] 4.1 Write the port `src/platform/local-model.ts`, its fake and `src/hooks/local-model-ports.ts`.
  The device adapter returns `unavailable` wherever the module is absent, and maps every native
  failure to `error`, `timeout` or `quota` with no message (design L1).

  Tests prove:
  - "A platform without a model says so";
  - "A model that disappears stops the asking";
  - "A failed fetch is said in words".
- [ ] 4.2 Write `modules/local-model/` (Kotlin, Android only) over the pinned ML Kit GenAI Prompt API
  artifact: `state`, `fetch` and `ask` with a JSON schema and a timeout. Also add
  `plugins/with-min-sdk.js`, its `app.json` entry, and the `android.blockedPermissions` entries from
  design L8, each with its one-line reason in `.claude/rules/android.md`.

  Verify:
  1. `npx expo-doctor` passes;
  2. `npx expo prebuild --platform android --clean` succeeds;
  3. `android/gradle.properties` reads `android.minSdkVersion=26`;
  4. `./gradlew assembleDebug` succeeds;
  5. the merged debug manifest holds no permission the app did not hold before and no reporting
     component, matching `library-manifest.json`. Node tests in
     `src/model-guesses/library-manifest.test.ts` prove "No permission arrives with the model" and
     "No reporting component arrives with the model" against `app.json` and the module manifest;
  6. `scripts/android.sh up` installs, and the app opens on the emulator with the section reading
     недоступна.
- [ ] 4.3 Write `src/model-guesses/runner.ts`, started by `local-model-ports` at every opening
  (`AppState` → `active`) and not as a launch chore. It needs the abort on `background`, the 20 s
  timeout, one question at a time, the change stamp bumped per shown припущення, and one журнал
  entry with the four counts (design L5).

  Tests with the fake port prove:
  - "A fresh install asks nothing";
  - "Nothing is fetched without a tap";
  - "The owner's tap fetches";
  - "The background stops it";
  - "Coming back to the app is an opening";
  - "Головний is drawn before any question";
  - "The журнал holds counts alone";
  - "A failure's message never reaches the журнал";
  - that a malformed answer quoting an опис is counted as dropped, throws nothing, and leaves no
    part of it in the журнал.

  A structural test in `src/model-guesses/runner-usage.test.ts` proves "No background work ever
  asks": `index.ts` and every background task file never reach the runner.

## 5. Screens

- [ ] 5.1 Write `src/ui/model-guesses.ts` with `offeredGuess` and the accept and refuse actions over
  the existing categorise, naming-form and чернетка paths (design L7).

  Tests prove:
  - "The mark stays until it is accepted";
  - "«Потребує уваги» still counts it";
  - "A розбір ignores припущення";
  - "A guessed сума moves no money";
  - "A правило answers first";
  - "Naming a group by hand removes its припущення";
  - "A partly named group drops the old guess";
  - "A confirmed чернетка takes its сума припущення along";
  - "An accepted категорія becomes a правило offer".
- [ ] 5.2 Add «Схоже на» to the «Без категорії» picker in the feed (beside the five, like «Це
  переказ»), to transaction editing, and to the «Транзакції» lines under «Без категорії». Tests of
  the view models prove:
  - "One tap in the feed";
  - "«Ні» in the feed";
  - "Editing offers it too";
  - "Answering a list of them in «Транзакції»".
- [ ] 5.3 Add the chip to the «Без продавця» row and open the naming form holding the guess. Tests
  prove:
  - "The form arrives with the guess";
  - "A guess to add to an existing продавець";
  - "Refused, the row stays deterministic";
  - "An accepted продавець stores nothing until the form does".
- [ ] 5.4 Add the сума chip to raw чернетки on Головний. Tests prove "Accept, then confirm",
  "Accepted, then corrected" and "An accepted сума still needs the confirmation".
- [ ] 5.5 Build `src/app/manage/local-model.tsx` over a pure section model in
  `src/ui/model-guesses.ts`, and add the `settings-sections.ts` entry right after «Продавці». The
  section holds:
  - the switch with its explanation, raw чернетка texts named, and the wording from `spike.md`;
  - the state in words;
  - «Завантажити модель»;
  - the counts;
  - the confirmation when the switch is turned off.

  Tests prove:
  - "The switch says what it does before it is on";
  - "An honest count";
  - "Turning off asks first";
  - "The tab offers «Локальна модель» after «Продавці»";
  - "The outbound statement is unchanged".

## 6. Docs and verification

- [ ] 6.1 Update the docs:
  - `docs/product-vision.md`:
    - a new section «Локальна модель» with the owner's decision of 2026-10-02 and the [PROPOSED]
      defaults;
    - §12: the system model, the system download, and the vendor reporting found by the spike;
    - §1 and §14.9: one dated sentence each;
    - §17: a local model also guesses input, and that is not an AI-аналіз;
  - `docs/glossary.md`: **Локальна модель**, **Припущення**, «Ні», the three distinctions, and the
    widened **AI-аналіз**;
  - `docs/on-device-ai-proposal.md`: mark the decided parts;
  - `docs/app-overview.md` and `docs/tech-task.md`.
- [ ] 6.2 Run the `smoke-runner` subagent on the emulator over the unavailable path:
  1. the section reads недоступна;
  2. the switch can be turned on and asks nothing;
  3. no chip appears in the feed, «Транзакції», editing, «Без продавця» or the чернетки;
  4. every screen reads as before.
- [ ] 6.3 Prepare the available-path checklist and a build for the owner's phone. The owner runs
  it, and it is recorded in `openspec/changes/local-model-guesses/device-run.md` as a device run,
  with aggregates and outcomes only and no опис or сума of the owner's. The checklist:
  1. turn on;
  2. fetch if offered;
  3. see guesses arrive in place;
  4. accept a категорія and take the правило offer;
  5. name a продавець from a guess;
  6. accept a сума and confirm;
  7. refuse one and reopen the app;
  8. leave and return to the app;
  9. turn off and see everything forgotten.
- [ ] 6.4 Run `npm run verify` and paste the final lines
- [ ] 6.5 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
