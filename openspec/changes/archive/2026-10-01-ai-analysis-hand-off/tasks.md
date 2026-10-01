## 1. The vocabulary first

- [x] 1.1 Update the AI section of `docs/glossary.md`: restate «Файл для аналізу» as the five
      sections it becomes — the запит, the instructions, the context, the readable summary and the
      пакет — since its current four-part enumeration is what this change makes wrong; add
      «**Запит**» (the opening section of a файл для аналізу: what the файл is, and the ask to
      analyse it, in the owner's own language) and «**Короткий запит**» (the one or two sentences
      offered to the system beside the файл and copyable on their own; it holds no number and no
      definition the файл does not). Verify by reading every «запит» in the two delta specs back
      against the glossary — hard rule 7 means the specs may use no noun this file has not defined.

## 2. The запит at the top of the файл

- [x] 2.1 Add `REQUEST(kind, period)` to `src/analysis/prompt.ts` with the wording of design.md D1
      — a пакет of financial data from cap1tal, the ask for an analysis and a practical financial
      overview, the kind and the period, and that the instructions, the definitions and the data
      are further down in the same файл. Verify in `src/analysis/prompt.test.ts`: it names the
      kind and the period it was given, and it contains no digit outside the period
      (spec `ai-analysis-share` → «The файл opens by saying what it is and asking for the
      analysis» → Scenario «The request adds no number»), and that it asks for nothing the
      instruction section forbids — no forecast, no figure the assistant works out itself, no
      recommendation presented as a finding (Scenario «The request asks for nothing the
      instructions forbid»).
- [x] 2.2 Render `## Запит` in `renderDocument` after the title and before the machine header, and
      regenerate `src/analysis/document.golden.md`. Verify in `src/analysis/document.test.ts`: the
      section order is Запит → Інструкції → Контекст → Підсумок → Дані, the `## Запит` heading
      precedes the `cap1tal.analysis-package · версія` line, and the golden matches byte for byte
      (Scenarios «The request is the first thing in the файл», «The request names the task, the
      kind and the period»). Read the golden diff before ticking this box — it is the whole of
      what now leaves the phone.

## 3. The instruction section covers what the пакет carries

- [x] 3.1 Extend `INSTRUCTIONS['external-advanced']` with the month-to-month changes, the largest
      категорії, the changes that stand out against earlier months, and the ліміти and цілі as
      things the answer should attend to. Verify in `src/analysis/prompt.test.ts` that each of the
      five is named (Scenario «The instructions name what is worth looking at»), and regenerate
      the golden.
- [x] 3.1a Extend `CONTEXT` in `src/analysis/prompt.ts` with the two terms 3.1 now points the
      answer at, in the glossary's own words: a ліміт is a monthly ceiling on one категорія in the
      ліміт's own currency, equality is not over, and spending in another currency neither counts
      toward it nor is converted toward it; a ціль's progress is the розрахунковий баланс of its
      linked рахунок, in that рахунок's own currency and never converted, досягнута at or above the
      target and прострочена when the date has passed and it is not. Without them the файл instructs
      attention to two terms it never defines, which is not «self-contained». Verify in
      `src/analysis/prompt.test.ts` (Scenario «The context defines a ліміт and a ціль») and
      regenerate the goldens.
- [x] 3.2 Add `DETAIL_INSTRUCTIONS` (design.md D5) and append the matching bullet in
      `renderDocument` from `packaged.included`, never from the choices, and each switch strictly
      from its own flag. Verify in `src/analysis/document.test.ts` over all four combinations of
      the two switches — both on, продавці only, окремі транзакції only, both off — that each файл
      carries exactly the bullets its own flags call for (Scenarios «Опис detail is instructed as
      context only», «One switch on does not speak for the other», «A switch that is off leaves no
      instruction behind»). The one-switch cases are what stop a renderer that appends both
      whenever either is on.
- [x] 3.3 Add `fixturePackage(included?)` to `src/analysis/document.fixture.ts` and the second
      golden `src/analysis/document-detailed.golden.md` from `{descriptions: true, transactions:
      true}`. Add the regeneration script `document.fixture.ts` has always referred to and which
      has never existed — `scripts/regen-analysis-goldens.ts`, run by hand as
      `npx tsx scripts/regen-analysis-goldens.ts` and never by `verify` — so both goldens are
      produced one way and a reviewer can reproduce them. Verify in `src/analysis/document.test.ts` that both goldens match and that rendering
      either пакет twice gives identical text (`ai-analysis-share` → «The файл is rendered
      deterministically and agrees with itself» → Scenario «Rendering is repeatable»).
- [x] 3.4 Extend `src/analysis/privacy.test.ts` to run its sentinel assertions over the rendered
      файл of both goldens' пакети, not the пакет alone — so no new prose section can leak a
      назва рахунку or an id (`ai-analysis-package` → «What a пакет для аналізу never carries»).

## 4. The короткий запит and the port that may carry it

- [x] 4.1 Add the короткий запит constant to `src/analysis/prompt.ts` (design.md D4) and expose it
      on `AnalysisDocument` from `renderDocument`. Verify in `src/analysis/prompt.test.ts` that it
      asks for the attached cap1tal файл and says the файл holds the context and the instructions,
      and that it carries no сума, no категорія name and no period (Scenario «The message says
      nothing the файл does not»).
- [x] 4.2 Add the optional `message` to `AnalysisFile` and `messageIncluded` to the `handed-over`
      outcome in `src/platform/analysis-share.ts`; make `inMemoryAnalysisShare` record the message
      in `handed()` and take `messageIncluded` from its options. Verify in
      `src/platform/analysis-share.test.ts`: a hand-off with a message and one with none are both
      reported handed over and both leave the файл's `name` and `text` untouched in `handed()`,
      and a refused hand-off leaves `handed()` empty (spec «A короткий запит accompanies the
      файл…» → Scenario «The файл is sufficient with no message at all», whose other half — that
      the файл is whole with no message — is the golden of 3.3).
- [x] 4.3 Update `src/platform/analysis-share-device.ts` to return `messageIncluded: false`, with
      the comment naming the expo-sharing finding of design.md D2. Verify by `npm run typecheck` —
      this file is never loaded under the gate, so the type is the whole proof.

## 5. The screen says a запит is included and can copy it alone

- [x] 5.1 Add `requestIncluded` and `requestHint` to `AiAnalysisPreview` in
      `src/ui/ai-analysis-screen.ts` with the sentences of design.md D6. Verify in
      `src/ui/ai-analysis-screen.test.ts` that a fresh model carries both, and that `requestHint`
      names no assistant or brand (`ai-analysis-screen` → «The preview names what would leave the
      phone before anything does» → Scenario «The preview says the request is already inside»;
      «The screen offers the короткий запит on its own» → Scenarios «The action explains itself
      before it is used», «No assistant is named»).
- [x] 5.2 Add `shortRequestToCopy(model)`, the `copy-request` event and the `copied-request` state
      with its words; make `fileToShare` attach the message. Verify in
      `src/ui/ai-analysis-screen.test.ts`: the короткий запит alone is what `copy-request` yields,
      it is not the файл, the words after it claim nothing about sending, `copy-request` is
      refused while `sharing` and reset by `choices-changed`, and `fileToShare` carries name, text
      and message (Scenarios «The запит is copied in one action», «Both copies stay available
      after a hand-off»).
- [x] 5.3 Carry `messageIncluded` from the outcome into `RunState['handed-over']` and replace the
      flattening `'outcome'` case of `nextState` with the exhaustive one of design.md D3; make
      `runOutcomeWords` keep today's sentence when the flag is `false` and say the one permitted
      further thing when it is `true` — the same sentence with «Файл» widened to «Файл і запит»
      (design.md D6). Verify in `src/ui/ai-analysis-screen.test.ts` over both
      outcomes from the double: the `false` branch says nothing whatever about a запит, and the
      `true` branch says the файл and the запит were handed to the system and contains none of
      «надіслано», «доставлено», «отримано», «прочитано» (`ai-analysis-screen` → Scenario «A запит
      that did not travel is not claimed»; `ai-analysis-share` → «What the app may claim after the
      chooser closes» → Scenario «A запит that travelled is claimed no further than the файл»).
- [x] 5.4 Verify in `src/ui/ai-analysis-screen.test.ts` that an empty history and an empty period
      offer no copying of the короткий запит, alongside the existing assertions
      (`ai-analysis-screen` → «The screen refuses an empty period and flags a short one» →
      Scenario «An empty history leads to the first транзакція»).
- [x] 5.5 Wire `src/app/ai-analysis.tsx`: the `requestIncluded` line in the «Що буде передано»
      card, and «Скопіювати запит» with `requestHint` beside «Скопіювати», both gated on
      `model.canCopy`. Verify by `npm run typecheck` and by the emulator screenshots of task 7.1.

## 6. The docs follow the behaviour

- [x] 6.1 Update `docs/app-overview.md` §3.6 — what the файл holds now opens with the запит, the
      preview says a запит is inside, «Скопіювати запит» exists with its hint, and the share
      message is best-effort and carried by nothing today. Verify by reading it against the two
      goldens.

## 7. On the device

Runs after the gate of section 8 is green and the change is integrated — the CLAUDE.md workflow
order (verify → diff-reviewer → commit → smoke). 7.1 and 7.3 come back here for the fixes they
find; the owner's own hand-off check below is not a task box at all.

- [ ] 7.1 Run the `smoke-runner` subagent over this change: open «Звіти» → «AI-аналіз», read the
      preview line about the запит and the hint under «Скопіювати запит», «Показати файл» and
      confirm the text opens with «## Запит», «Скопіювати запит», then «Поділитися з AI» and
      confirm the Android chooser opens. Verify by the screenshots the subagent reads back; fix
      what it finds and re-run section 8.

**Owner-run, outside the completion gate — deliberately not a task box, because a box no agent may
tick can never let `openspec status` reach complete.** On the physical phone, hand one файл to one
real share target and write here what the receiving app showed: the attachment, whether any text
came with it, and whether the assistant answered without the owner typing a request. Evidence about
the hand-off, deliberately not a test: no vendor name, id or behaviour enters the repo, and no
requirement depends on the result.

> _(the owner's note goes here)_

- [ ] 7.3 Replace the §3.6 screenshots in `docs/app-overview.md` with the ones 7.1 produced, so the
      screen in the docs is the screen that ships. Verify that both images referenced by §3.6
      exist under `docs/screens/` and show the new preview line and the new action.

## 8. The gate

- [x] 8.1 Run `npm run verify` and paste the final lines — see the run recorded below 8.2, after
      the diff-reviewer's findings were fixed. Run in the main tree while `bug-report-here` was in
      flight in it, so the totals count that change's tests too and moved between runs; every file
      of this change is in the run, and this change's own files are 21 test files / 281 tests.
- [x] 8.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS — **PASS, 0 critical,
      3 warnings, all three fixed**: (a) «Both copies stay available after a hand-off» asserted
      nothing about a hand-off — it now shares through the double and asserts `copy` and
      `copy-request` still lead somewhere from `handed-over`, plus a new test that both actions sit
      in a `model.canCopy` branch of `ai-analysis.tsx`; (b) no fixture транзакція carried an опис,
      so `document-detailed.golden.md` rendered `"merchants":[]` and was no review surface for what
      «Продавці» lets out — four витрати now carry описи, one under two spellings across two
      months, and `document.golden.md` is byte-identical, which is asserted from both sides;
      (c) this box's own stale verify record, re-quoted here.

      The gate after those fixes: `Test Files  130 passed (130)` · `Tests  2312 passed (2312)` ·
      `✔ verify passed (8a155fcc8fc471a6d76c4ba720f4bf94c6943ca6)`.
