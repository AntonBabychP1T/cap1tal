## Why

`qa-sweep-2026-10` taught «Закрий <місяць>» to name its місяць as Ukrainian grammar asks —
«Закрий вересень 2026», «У вересні 2026 ще 9 записів…» — but wrote the rule into that one виклик
only. «Втримай ліміт “<категорія>”» still builds its reason from the heading's label after a
preposition, and on the phone it reads «Ліміт «Продукти» востаннє перевищено у Липень 2026» — the
nominative of a heading where the locative belongs. The виклик is the app speaking to the owner
about where their money went (vision problem 1); a sentence that reads as broken Ukrainian is a
defect in exactly that voice.

The tests did not catch it: until `qa-sweep-2026-10` they passed an identity stub as the month
label, and since then they read the real labels but check only «Закрий <місяць>»'s sentences — the
ліміт виклик's tests look at its name and progress, never at its reason.

## What Changes

- A new requirement on the `challenges` capability: **every** sentence a виклик shows — its name,
  its reason, its criterion — that names a місяць names it in its grammatical case, and the
  nominative label of a heading never stands after a preposition. The rule now binds the whole
  catalogue, including виклики added later, not one template.
- The reason of «Втримай ліміт “<категорія>”» opens with the місяць in the locative:
  «У липні 2026 ліміт «Продукти» перевищено востаннє; відтоді під ним 2 з 3 завершених місяців.»
  Putting the місяць first reuses the form «Закрий <місяць>» already uses («У вересні 2026 ще…»)
  and keeps «у» at the head of the sentence, where no vowel before it asks for «в».
- `src/progress/challenges.test.ts` checks the ліміт виклик's reason with the real labels, and a
  sweep test offers every виклик of the catalogue with the real labels and fails on any heading
  label inside a sentence.
- The scenarios elsewhere in the `challenges` spec that still name «Закрий 2026-08» call it «Закрий
  серпень 2026», as the rule asks.

## Scope

- In: the виклик sentences built in `src/progress/challenges.ts`. A sweep of `monthLabel(` inside
  sentences under `src/progress` and `src/ui` found one more виклик sentence carrying a місяць —
  «<Місяць> закрито…» of «Закрий <місяць>». It opens its sentence, and a month name is inanimate, so
  its accusative there is the heading's form with its capital; it stays.
- In: three scenarios of the `challenges` spec still name the виклик «Закрий 2026-08» / «Закрий
  2026-07»; under the new requirement they read «Закрий серпень 2026» / «Закрий липень 2026».

## Non-goals

- Sentences outside the виклики. The sweep found none with the same defect among the screens it
  covered (`month-summary-screen`'s «Вересень 2026 ще не настав.» has the місяць as its subject;
  `saldo-import`'s «до місяця «Липень 2026»» quotes the label as a name; ranges «Липень 2026 —
  Вересень 2026» and the list of місяці under the норма step are labels, not sentences). The
  свідчення of a досягнення render a raw `YYYY-MM` (`evidenceLabel` in `src/ui/progress-screen.ts`),
  which is a different defect of a different capability and is left to its own change.
- No change to «у»/«в» alternation in the shared month helpers; this change only arranges its own
  sentence so the question does not arise.
- Nothing from vision §14.

## Impact

- Spec: `challenges` — one ADDED requirement; two MODIFIED (scenario wording only).
- Code: `src/progress/challenges.ts` (`limitHold`), `src/progress/challenges.test.ts`.
- Depends on `qa-sweep-2026-10`, which adds `monthInYearLabel` to the виклик's ports; this change
  is branched from it and archives after it.
