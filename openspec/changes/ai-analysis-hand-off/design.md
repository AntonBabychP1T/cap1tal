## Context

See proposal.md — Why. The state this design starts from:

- `src/analysis/prompt.ts` holds `INSTRUCTIONS` and `CONTEXT` as two constant arrays of Ukrainian
  sentences; nothing in them depends on the пакет. `src/analysis/document.ts` joins them with a
  title, a machine header, a summary folded out of the пакет and `canonicalJson(packaged)` — four
  sections, Markdown, byte-identical for one пакет. `document.golden.md` is the whole rendering of
  `fixturePackage()`, and the diff on that file is how a change to what leaves the phone gets
  reviewed.
- `src/platform/analysis-share.ts` is the port: `share(file: {name, text})` →
  `'handed-over' | 'unavailable' | 'failed'`. `analysis-share-device.ts` writes the файл into
  `Paths.cache/ai-analysis` and calls `Sharing.shareAsync(uri, { mimeType, dialogTitle })`.
- `src/ui/ai-analysis-screen.ts` decides everything the screen shows; `src/app/ai-analysis.tsx`
  maps over it and holds the two side effects (`analysisShare.share`, `Clipboard.setStringAsync`).
- `npm run verify` never loads a native module: the port's double is what the screen's tests see,
  and `analysis-share-device.ts` is typechecked but never imported under the gate.

The constraint that shapes everything below: **the файл is the only thing the app controls all the
way to the assistant.** Anything else — a message, a subject, a file name — is a hint the receiving
app may or may not honour.

## Goals / Non-Goals

**Goals:**

- The first thing anyone reads in the файл — assistant or owner — is a request to analyse it.
- The instruction section covers what the пакет actually carries, including the two opt-in details
  and the ліміти and цілі that were never named in it.
- The port can express «a message went with the файл» and «it did not», honestly, today.
- One tap gets the owner the короткий запит when the chosen app took only the attachment.

**Non-Goals:**

- No new native module, no new Expo config plugin, no change to `app.json` or `modules/`
  (D2 explains why, and what a later change would build).
- No new dependency: `expo-sharing` and `expo-clipboard` are already here.
- No change to `src/analysis/package.ts`, to the privacy contract, or to what a пакет carries. The
  файл gains prose; the data section is untouched.
- No persistence: the короткий запит is a constant, not a setting; nothing about a run is stored.

## Decisions

### D1. The запит is a fifth section, rendered first, and it is data like the rest of the prompt

`prompt.ts` gains `REQUEST` — the lines of the запит — and `renderDocument` emits
`## Запит` immediately after the title and before the machine header. The wording:

```markdown
# cap1tal · AI-аналіз місячної картини

## Запит

Це пакет фінансових даних із застосунку cap1tal — місячна картина за період 2026-06 — 2026-08.
Проаналізуй наведені дані і дай власнику практичний фінансовий огляд за цей період.

Усе потрібне є в цьому ж файлі, нижче: інструкції, як саме це зробити, контекст із визначенням
кожного терміна, читабельний підсумок і самі дані. Шукати щось поза файлом не треба.

cap1tal.analysis-package · версія 1 · вид: місячна картина · період: 2026-06 — 2026-08 · …
```

Two of the words are the пакет's own — the kind (`KIND_LABEL`, already there) and the period — so
`REQUEST` is a small function of `(kind, period)` and not a bare array. That is the one place the
prompt stops being constant, and it is deliberate: a запит that could not name the period would be
asking about an unspecified thing. Everything else in it is fixed text.

The title stays above it. It is a name, not a machine header, and an assistant reading a Markdown
attachment reads the H1 as the document's subject either way.

*Alternatives considered.* (a) Fold the request into the existing `## Інструкції` as a first
bullet — rejected: a bullet in a list of eleven prohibitions does not read as a request, which is
precisely today's failure. (b) Put the request in the file name — rejected: a Cyrillic file name
through a FileProvider is a portability gamble, and the name is the one thing the receiving app is
guaranteed to mangle if it mangles anything. The name stays ASCII and stable.

### D2. The share message is best-effort — and this change ships no native module for it

Investigated, against the versions actually installed:

| Path | Can it carry файл + text in one hand-off? |
| --- | --- |
| `expo-sharing@~57.0.17` `shareAsync(url, opts)` | **No.** `SharingOptions` is `mimeType`, `UTI`, `dialogTitle`, `anchor` — there is no text, message or subject field (`node_modules/expo-sharing/build/Sharing.types.d.ts`). |
| React Native `Share.share({message, url, title})` | **No.** On Android `url` is not sent at all; only `message` (→ `EXTRA_TEXT`) and `title` (→ `EXTRA_SUBJECT`) travel. It would trade the файл for the message — backwards. |
| `expo-intent-launcher` | **No.** Its `extra` map carries JS primitives; `EXTRA_STREAM` needs a parcelable `Uri`, which it cannot express, and it starts an activity rather than `Intent.createChooser`. |
| A local Expo module, like `modules/notification-capture` | **Yes, mechanically.** Kotlin: `Intent(ACTION_SEND)` with `EXTRA_STREAM` = the FileProvider content URI, `EXTRA_TEXT` = the короткий запит, `type = "text/plain"`, `FLAG_GRANT_READ_URI_PERMISSION`, wrapped in `createChooser`. iOS would need its own `UIActivityViewController` with two activity items. |

So the platform *can* be made to send both — and it still would not make the message reliable.
`EXTRA_TEXT` beside an `EXTRA_STREAM` is optional for the receiver, and the receivers that matter
here — assistant apps and chat apps — build their compose view from the stream and commonly drop
the text. Buying a second native module, owned across every Expo upgrade, for a hint the recipient
may discard, is the wrong trade while the файл itself can carry the request for free.

**Decision:** this change ships no native module. The port gains the shape (D3) so that adding one
later is an adapter change and not a spec change, and the spec (`ai-analysis-share`, «A короткий
запит accompanies the файл where the platform carries it») already forbids correctness from
depending on it, whichever adapter is in place.

### D3. The port says what it carried, and the screen may only claim that

```ts
export interface AnalysisFile {
  readonly name: string;
  readonly text: string;
  /** The короткий запит, offered to the platform beside the файл. Best-effort — see spec. */
  readonly message?: string;
}

export type AnalysisShareOutcome =
  | { readonly kind: 'handed-over'; readonly messageIncluded: boolean }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly reason: string };
```

`analysis-share-device.ts` returns `{ kind: 'handed-over', messageIncluded: false }` — expo-sharing
carries no text, and saying so is cheaper than pretending. `inMemoryAnalysisShare` records the
message alongside the файл in `handed()` and takes the outcome from its options, so the screen's
tests can exercise both branches without a device.

`messageIncluded` is not a variant of the outcome (`'handed-over-with-message'`) but a field on it,
because the claim the screen makes about the файл — «Файл передано системі» — is the same either
way; only the extra sentence about the запит is gated. A separate variant would push that shape
into every `switch` in the screen for no gain.

**The field has to survive into `RunState`, and today it cannot.** `runOutcomeWords` reads a
`RunState`, whose `handed-over` variant carries nothing, and `nextState` flattens the outcome with
`return { kind: event.outcome.kind }`. So `RunState`'s variant gains the same field and the
`'outcome'` case stops flattening:

```ts
export type RunState =
  | { readonly kind: 'preview' }
  | { readonly kind: 'sharing' }
  | { readonly kind: 'handed-over'; readonly messageIncluded: boolean }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'copied' }
  | { readonly kind: 'copied-request' };

case 'outcome':
  switch (event.outcome.kind) {
    case 'failed': return { kind: 'failed', reason: event.outcome.reason };
    case 'handed-over': return { kind: 'handed-over', messageIncluded: event.outcome.messageIncluded };
    case 'unavailable': return { kind: 'unavailable' };
  }
```

The exhaustive inner `switch` replaces the flattening on purpose: it is what makes the compiler,
rather than a reviewer, catch the next outcome that carries a field.

*Alternative considered:* leave the port alone and never mention a message until a module exists.
Rejected — the spec requires the app to know whether the запит travelled, and a field that is
honestly `false` today is what makes the later adapter a one-line change instead of a redesign.

**The репорт про помилку shares this outcome type, and so inherits the field.**
`bug-report-files.ts` reuses `AnalysisShareOutcome` on purpose — its docblock says so, and the
point is that the two screens say the same words about the same event. Widening `handed-over`
therefore reaches it, and it passes `messageIncluded: false`: a репорт offers the phone no
короткий запит, so none was ever carried. Nothing on that side reads the field and no behaviour of
the bug report changes.

*Alternatives considered.* (a) Make the field optional so the bug-report side needs no edit —
rejected: an adapter that forgets it would then silently mean «not carried», and the whole reason
the field exists is that the compiler, not a reviewer, catches the next outcome that carries one.
(b) Give the репорт its own twin type — rejected here as a bigger change to a capability this one
has no business reshaping, and it would cost `bug-report-screen.ts` an edit for no gain in truth.

### D4. The короткий запит is one constant, used by both the message and the clipboard

```
Проаналізуй, будь ласка, прикріплений файл cap1tal — у самому файлі є повний контекст,
визначення термінів та інструкції, що саме з цими даними зробити.
```

Constant, with no period, no kind and no figure in it. Three reasons: the spec forbids it from
stating anything not already in the файл; a message pasted into a chat that already holds the
attachment gains nothing from repeating the period; and a constant is the same string whether it
went out with the файл or is copied afterwards, which is exactly the property «Скопіювати запит»
needs. It lives in `prompt.ts` beside `REQUEST`, and `AnalysisDocument` exposes it so the screen
never assembles text of its own.

### D5. Detail-dependent instructions, without giving up determinism

Two bullets, appended to the instruction section only when the matching switch is on, read from
`packaged.included` — not from the choices, so the файл can only describe the пакет it actually
holds:

```ts
export const DETAIL_INSTRUCTIONS = {
  descriptions: 'Продавці — це описи витрат…: читай їх як контекст поруч з агрегатами…',
  transactions: 'Окремі транзакції наведені як контекст…: не підсумовуй їх і не рахуй…',
} as const;
```

Determinism is unharmed: `included` is part of the пакет, so one пакет still renders to one файл,
byte for byte. Two goldens then cover the two shapes — `document.golden.md` (both off, as today,
now with `## Запит`) and a new `document-detailed.golden.md` from
`fixturePackage({ descriptions: true, transactions: true })`, which also becomes the test that a
switch that is off leaves no instruction behind.

*Alternative considered:* one unconditional bullet phrased «якщо в даних є продавці…». Rejected —
it puts a conditional in the assistant's head instead of in the renderer, and it makes the
«switch off leaves nothing behind» scenario untestable.

### D6. The screen gains one sentence and one action, and no new state machine

- `AiAnalysisPreview` gains `requestIncluded: string` — the sentence «Разом із числами у файлі вже
  є запит до асистента: що зробити з даними і що означає кожен термін. Писати нічого не треба.» —
  rendered in the «Що буде передано» card under `handOver`.
- `AiAnalysisPreview` also gains `requestHint: string` — the standing sentence the screen shows
  beside «Скопіювати запит» from the moment it is offered, before anything is copied: «Застосунок,
  який ви оберете, може взяти лише файл — тоді надішліть йому цей запит окремим повідомленням.»
  It names no assistant, and it is the sentence the screen spec's «The action explains itself
  before it is used» and «No assistant is named» are both about.
- `RunEvent` gains `{ kind: 'copy-request' }` and `RunState` gains `{ kind: 'copied-request' }`,
  with `runOutcomeWords` answering «Запит у буфері обміну.» — that and nothing more, because the
  app knows nothing about what happens to it next. The existing `'copied'` keeps its own words; a
  shared state would make the two actions indistinguishable to the owner who taps the wrong one.
- `runOutcomeWords({kind: 'handed-over', messageIncluded})` keeps today's sentence unchanged when
  the flag is `false`, and says the one further thing the spec permits when it is `true` — «Файл і
  запит передано системі. Що з ними сталося далі, знає лише обраний застосунок.» That is the same
  sentence with «Файл» widened to «Файл і запит», not a clause tacked onto the end of it: the app
  claims the запит exactly as far as it claims the файл, and the two are claimed in one breath so
  no wording can drift between them. Never «надіслано», «доставлено»,
  «отримано» or «прочитано»: the app learns none of that about the запит, for the same reason it
  learns none of it about the файл (`ai-analysis-share` → «What the app may claim after the
  chooser closes»).
- `shortRequestToCopy(model)` mirrors `textToCopy(model)`; `fileToShare(model)` starts attaching
  `message`. `nextState` treats `copy-request` exactly as `copy` — refused while `sharing`, reset
  by `choices-changed`.
- `ai-analysis.tsx` places «Скопіювати запит» beside «Скопіювати», both secondary, both gated on
  `model.canCopy`, so a hand-off leaves both available (spec scenario «Both copies stay available
  after a hand-off»).
- The `handed-over` banner appends nothing about the запит while `messageIncluded` is `false`, and
  the branch that would append it is written and tested now, against the double.

## Risks / Trade-offs

- **A longer файл for the same numbers.** → The запит is ~5 lines and the detail bullets 1–2 more;
  against a файл measured in tens of kilobytes this is noise, and `sizeKb` in the preview keeps
  the owner's number honest either way.
- **Prose at the top of a file whose value is its determinism.** → The запит is data in
  `prompt.ts`, its only variables are the пакет's own kind and period, and both goldens fail on any
  wording change — so a change to what leaves the phone stays a reviewed diff, never a side effect.
- **`messageIncluded: false` is a branch nothing exercises on a real device today.** → It is
  exercised by the double in `src/ui/ai-analysis-screen.test.ts` on both values, and the
  device-side truth is one constant in the adapter, next to the comment that explains why.
- **The owner may read «запит уже у файлі» as «the assistant was asked», and it was not — the app
  cannot know what the chosen app did.** → The wording says the запит is *inside the файл*, never
  that anything was sent or received; `runOutcomeWords('handed-over')` keeps its existing sentence
  unchanged, and the spec forbids claiming a message that did not travel.
- **A receiving app that renders Markdown may swallow the `##` headings.** → The запит is prose
  under a heading, not a heading; it reads the same as plain text, which is what `text/plain`
  promises the receiver anyway.
- **The real behaviour of any one assistant app is not something `verify` can prove.** → Task 7.2
  checks one real share target by hand on the device and records what happened in the change; it
  is evidence, deliberately not a test and never vendor code in the repo.

## Migration Plan

None. No schema change, no migration, no stored state, no persisted setting. The файл is rebuilt
from the database on every run and never lives in a бекап, so an owner who updates mid-run simply
gets the new файл the next time they open the screen.
