# Завершений hand-off AI-аналізу

## Why

On the owner's own phone the AI-аналіз stops one step short of being useful. «Поділитися з AI»
hands a `.md` файл для аналізу to the chooser, the owner picks an assistant — and what arrives
there is an attachment. What the receiving app shows first is a file name
(`cap1tal-ai-monthly-picture-2026-06_2026-08.md`), and what the файл itself opens with is a title
and a machine header (`cap1tal.analysis-package · версія 1 · вид: місячна картина · …`). Nowhere
does anything plainly say *«проаналізуй це»*. The owner has to type the request themselves, which
is exactly the manual step the feature exists to remove, and the assistant's answer then depends
on wording the app never controlled.

This is not a code-vs-spec regression: `renderDocument` renders the four sections the
`ai-analysis-share` spec demands, and the golden файл proves it. **The gap is in the contract
itself.** Today's spec requires an instruction section written *to* the assistant («користуйся
лише даними», «не вигадуй») but never requires the файл to open by stating what it is and asking
for the analysis, never mentions a share message, and never asks the screen to tell the owner that
a request is already inside the файл. The result satisfies every requirement and still fails the
job — vision §17's «explain its numbers with the help of a language model» is only served if the
assistant is actually asked to.

Both vision problems (where the money went, how much is left) run through this screen: an
AI-аналіз nobody asked a question of answers neither.

## What Changes

- **The файл для аналізу opens with a request, not a header.** A new first section — «Запит» —
  states in plain Ukrainian that this is a package of financial data from cap1tal and asks the
  assistant to analyse it and give the owner a practical financial overview of the period, naming
  the period and the kind. It is the first thing in the файл, before the title's machine header,
  so an assistant that reads only the first lines already has the task.
- **The instruction section gains what it was missing:** limits and other available aggregates as
  things to look at, month-over-month change and anomalies called out explicitly, and — only when
  the owner switched them on for that run — one bullet saying that продавці and окремі транзакції
  are extra context, never the basis of a recount. The file stays deterministic: the same пакет
  still renders to the same bytes.
- **An optional short запит accompanies the файл where the platform can carry it.** The
  `AnalysisSharePort` contract gains an optional message, and the screen always knows whether it
  was carried. Investigation (design.md D2) found that `expo-sharing` cannot attach text to a
  file, and that Android receivers commonly drop `EXTRA_TEXT` when `EXTRA_STREAM` is present — so
  the message is specified as **best-effort and never load-bearing**, and the device adapter of
  this change reports it as not carried. The self-contained файл is the single source of truth.
- **The screen says a request is included, and can copy it alone.** The «Що буде передано» card
  states that instructions for the assistant are prepared alongside the numbers; a new
  «Скопіювати запит» puts just the short запит on the clipboard in one tap, for the owner whose
  chosen app took the attachment and nothing else. «Скопіювати» (the whole файл) stays as it is,
  and «Показати файл» keeps showing the exact bytes that leave — now including the «Запит».
- **The vocabulary follows.** `docs/glossary.md` today defines «Файл для аналізу» as four parts;
  it becomes five, opening with the запит, and «Запит» and «Короткий запит» are defined there
  before either spec uses them as a noun (hard rule 7).
- **Non-goals.** No API, key, account or SDK of any AI vendor; no network connection; no named or
  preferred assistant; nothing read back from any answer (vision §14, glossary «Передати»). No new
  native module in this change (design.md D2). The privacy contract of `ai-analysis-package` is
  untouched: no identifier, no назва рахунку, no token, no bank balance, no notification text, and
  продавці / окремі транзакції stay opt-in for one run.

## Capabilities

### New Capabilities

None. This is an amendment to the hand-off that already exists.

### Modified Capabilities

- `ai-analysis-share`: the self-contained файл gains a required opening «Запит» section and the
  broadened instruction section; a new requirement fixes the optional share message as best-effort
  and forbids correctness from depending on it; the clipboard requirement gains the short запит
  beside the whole файл.
- `ai-analysis-screen`: the preview must say that a request for the assistant is prepared with the
  data, and the screen must offer copying that short запит in one action.

## Impact

- `src/analysis/prompt.ts` — the new `REQUEST` lines, the broadened `INSTRUCTIONS`, the two
  detail-dependent bullets, the short запит that the message and the clipboard both use.
- `src/analysis/document.ts` — «Запит» rendered first; `AnalysisDocument` carries the short запит.
- `src/analysis/document.golden.md` — regenerated; the golden diff is the review surface for every
  word that now leaves the phone.
- `src/platform/analysis-share.ts` — `AnalysisFile` gains an optional `message`; `handed-over`
  gains `messageIncluded`; the in-memory double records both.
- `src/platform/analysis-share-device.ts` — passes `messageIncluded: false` (expo-sharing carries
  no text), unchanged otherwise.
- `src/platform/bug-report-files.ts`, `bug-report-files-device.ts` — one word each. The репорт про
  помилку hand-off reuses `AnalysisShareOutcome` deliberately (its own docblock says so), so the new
  field reaches it; it is always `false` there, because a репорт offers the phone no короткий запит
  at all, and nothing on that side reads it. No behaviour of the bug report changes.
- `src/ui/ai-analysis-screen.ts` — the preview sentence about the request, `shortRequestToCopy`,
  the `copy-request` event.
- `src/app/ai-analysis.tsx` — the «Скопіювати запит» action and the preview line.
- `docs/glossary.md` — «Файл для аналізу» restated as five sections; «Запит» and «Короткий запит»
  added to the AI section.
- `docs/app-overview.md` §3.6 — the description of what the файл holds and what the screen offers,
  and its two screenshots.
- No migration, no schema change, no new dependency, no change to `app.json` or `modules/`.
