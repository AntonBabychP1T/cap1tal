## Context

See proposal.md — Why. The entry form (`src/app/transaction/new.tsx`, decisions in
`src/ui/entry-form.ts`) already holds every field a фраза can name, as screen state: the type, the
two рахунки, the сума **as a string** checked by `parseAmount`, the категорія with the
`pickedByOwner` flag that stops it following the опис, the джерело, the опис and the date. Device
capabilities sit behind one port per capability in `src/platform/` with a `*-device.ts` adapter
`verify` never loads; local Kotlin modules live in `modules/` with their own manifest
(`screen-capture`, `notification-capture`). `src/domain/fold.ts` is the app's one case fold and
`src/domain/name-match.ts` already holds «a tie wins nothing» for names.

Two hard constraints shape everything: vision §12 (no outbound connection — owner's decision keeps it)
and `verify` running on Node only, so everything that decides must be pure.

The in-flight `rule-template` change modifies the requirement «The entry form shows the категорія a
правило gives the typed опис» (it adds the шаблон tier). This change does not modify that
requirement — it only feeds the опис into it — so the two compose in either archive order.

## Goals / Non-Goals

**Goals:**
- The understanding of a фраза is a pure, total function with exhaustive tests; the device only
  hands over text.
- On-device recognition guaranteed by construction, not by a flag that could be dropped.
- Zero change to how a транзакція is recorded: the фраза ends in the same form state a hand-filled
  form has.

**Non-Goals:**
- Statistical or learned understanding; fuzzy spelling correction beyond case endings.
- iOS recognition now (the port admits it later: `SFSpeechRecognizer` with
  `requiresOnDeviceRecognition`; until then the adapter answers `unsupported` and typing works).

## Decisions

### D1. A local Expo module, `modules/speech-recognition/`, not an npm package

Kotlin, Android only, the same shape as `modules/screen-capture/`. It creates its recogniser with
`SpeechRecognizer.createOnDeviceSpeechRecognizer` (API 31+) and never with
`createSpeechRecognizer` or `RecognizerIntent` — so a recogniser that may go to a server cannot be
reached from the code at all (spec: «Speech is recognised on the phone only»).

Surface (all failures are values):
- `availability(locale)` → `unsupported` (API < 31 or `isOnDeviceRecognitionAvailable` false) |
  `ready` | `language-missing` (supported, not installed) | `language-pending` |
  `language-unavailable`. On API 33+ from `checkRecognitionSupport` (`installedOnDeviceLanguages`,
  `pendingOnDeviceLanguages`, `supportedOnDeviceLanguages`); on API 31–32 the language cannot be
  asked in advance, so the answer is `ready` and a missing language arrives as the end error
  `ERROR_LANGUAGE_UNAVAILABLE` / `ERROR_LANGUAGE_NOT_SUPPORTED`, mapped to the same outcomes (spec:
  «A phone that cannot tell in advance»).
- `openSpeechSettings()` → the phone's settings: the screen of the on-device recognition service
  where its languages are managed when task 1.1 finds one on the owner's phone that can be opened
  by an intent, otherwise `Settings.ACTION_SETTINGS`. Never `ACTION_VOICE_INPUT_SETTINGS` — that
  screen chooses a voice-input service, possibly a cloud one, which the spec forbids pointing to.
  `triggerModelDownload` is deliberately **not** used: a fetch the app asks for is beyond the
  owner's decision (only «say so, offer typing»); adding the language stays the owner's own act in
  the system.
- `start(locale)` with `EXTRA_LANGUAGE = "uk-UA"`, `EXTRA_PARTIAL_RESULTS = true`,
  `EXTRA_MAX_RESULTS = 1`, on the main thread; `stop()`; `cancel()`.
- Events `onPartial({ text })` and `onEnd({ code, text? })`, where `code` is the raw
  `SpeechRecognizer` error code or 0 for results. `onBufferReceived` is not forwarded and no audio
  extra is set, so audio never reaches JS or storage.
- The module cancels on `OnActivityEntersBackground` and on destroy, in addition to the screen
  cancelling on blur — the microphone must not outlive the screen even if JS is stalled.
- `start` while a recogniser is listening is a no-op (spec: only one dictation at a time).
- The module never logs recognised or partial text (no `Log.*` with results); task 6.3 greps it.

Alternative: `expo-speech-recognition` (community). It is capable (on-device flag, locale and
download APIs) but on-device is one option among many in it, it brings a config plugin and a new
npm dependency, and our surface is five calls. Rejected for the guarantee, not for quality.

Native changes, named per `.claude/rules/android.md`: `app.json` gains
`android.permission.RECORD_AUDIO` (one-line reason recorded in `android.md`: the entry form's
«Надиктувати», asked on the owner's tap); the module's `AndroidManifest.xml` carries
`<queries><intent><action android:name="android.speech.RecognitionService"/></intent></queries>`
for package visibility on API 30+. No `plugins/`, no hand edit under `android/`. A rebuilt APK is
needed.

### D2. The port `src/platform/speech.ts`, values only

`SpeechPort { availability(); permission(); askPermission(); openAppSettings();
openSpeechSettings(); listen(onHeard): Dictation }`, `Dictation { stop(); cancel(); ended: Promise<DictationEnd> }`, with
`DictationEnd = { kind: 'phrase', text } | { kind: 'nothing-heard' | 'cancelled' | 'busy' |
'permission' | 'language-missing' | 'language-unavailable' | 'failed' }`. The mapping from raw codes
(`ERROR_NO_MATCH`, `ERROR_SPEECH_TIMEOUT` → nothing-heard; `ERROR_RECOGNIZER_BUSY` → busy;
`ERROR_INSUFFICIENT_PERMISSIONS` → permission; `ERROR_CLIENT` after our own cancel → cancelled; the
two language codes; anything else → failed; a result with empty text → nothing-heard) is a pure
`dictationEndFrom(code, text)` in the port file, tested like `cameraPermissionFrom`. The permission
reuses the four-state shape of the camera (`granted | deniable | blocked | unsupported`) through
the module's Expo permission helper. Adapter `speech-device.ts`; binding in `src/hooks/speech-ports.ts`;
a double for tests.

### D3. Understanding lives in `src/voice/`, a pure feature module

```
src/voice/
  vocabulary.ts     the fixed words: type words, markers, prepositions, currency and копійки words,
                    date words, filler («додай», «запиши», …) — data, one place to extend
  tokens.ts         apostrophe forms → one, `foldCase`, split into words keeping their spans in the
                    original text; digit groups joined by the three-digit rule; «,»/«.» decimals
  number-words.ts   Ukrainian numerals → integer hundredths
  spoken-names.ts   case-ending-tolerant matching of names against words
  understand.ts     understandPhrase(text, { accounts, categories, sources }, formType, today) → Heard
```

`Heard = { type?, amount?: string, currency?, accountId?, toAccountId?, categoryId?, sourceId?,
description?, date?, notes: HeardNote[] }`, `HeardNote = { field: 'amount' | 'account' |
'toAccount' | 'category' | 'source', heard: string, why: 'no-match' | 'several' | 'undecided' |
'other-currency' | 'not-for-transfer' }`. `today` is an argument (AGENTS: no clocks in pure
code); `formType` is the type the form is on, which is the type in force when the фраза names none —
the label's kind depends on it (spec: «A категорія or джерело is taken for the type in force»).

**Amount as a string.** The сума leaves `src/voice/` as a canonical decimal string («500»,
«125.50») — exactly what the owner would have typed — and enters the form's existing amount field,
so `parseAmount` and every refusal stay the single gate. Internally numerals are summed as integer
**hundredths** («півтори» = 150, «пів» = 50, копійки added as they are), so nothing is ever a float
(spec: «never pass through a fractional number»). All three currencies the app holds have two
minor digits; a currency with another exponent would have its amount refused by `parseAmount`
like a typed one.

**Numerals.** A small grammar over the folded words: units in every form (один/одна/одну/одне/
одного…, два/дві/двох, три/трьох, чотири, п'ять…дев'ятнадцять), tens, hundreds (сто, двісті,
триста, чотириста, п'ятсот…дев'ятсот), scales тисяча/тисячі/тисяч, мільйон/мільйони/мільйонів,
«пів», «півтори»; a run is a maximal sequence of numeral words and digit tokens; a scale multiplies
the run before it. «і» / «та» inside a run end it (so «триста і сорок» is two runs — the
undecided case of the spec). A run followed by a currency word is *marked*; a following run with
«копійок/копійки/коп/центів» is its fractional part.

**Names.** `sameWord(a, b)` (spec: «Names are matched whatever their grammatical ending, and only
so»): equal after fold and apostrophe normalisation; or `stems(a) ∩ stems(b)` non-empty, where
`stems(w)` is the set of rests of at least two letters left by removing nothing or **any** one
ending of a closed list in `vocabulary.ts` that `w` ends with — the noun/adjective case and number
endings (а я у ю і и ї е є о ом ем єм ою ею єю ів їв ей ам ям ах ях ами ями ові еві єві ого ього
ому ьому ій ий ої ую юю ім им их іх ь й) — each rest then folded for a fleeting vowel, applied to
every rest alike: a rest ending in «ец», «ок» or «ен» loses that «е»/«о» (гаманець → гаманец →
гаманц, гаманця → гаманц; Андрій → {андрій, андрі, андр}, Андрія → {андрія, андрі} — they share
«андрі»). Taking every ending rather than the longest is what the spec says and what keeps names in
-ій matching. No prefix similarity: «кави» (стем «кав») ≠ «Кафе» («каф»),
«автобус» ≠ «Авто». The spec's negative scenarios are the guard. A name matches a run of
consecutive words; a run made of a single fixed-list word (type word, marker, preposition, currency,
date, опис word) never matches; candidates are ranked by words taken, then by letter-equal words; a
remaining tie chooses nothing (the `name-match.ts` principle), unless a named currency splits it.
When a run matches records of several kinds, the word before it decides: a marker its kind, a
з/із/зі/від/на/в/у/до a рахунок, anything else a label.

**Resolution order** (each step reads only what the earlier ones fixed): 1) cut the опис (its end
needs name matching on the words after it, so markers inside it are tested against names first);
2) find names of every kind over the remaining words, longest first, each word taken once; 3) date
words; 4) numeral runs over the words no name took, currency and копійки; 5) markers and
prepositions bound to the names they stand before; 6) the type by the spec's seven-step precedence
(no default — `Heard.type` stays absent when nothing applies); 7) рахунок roles for that type; 8)
the label for the type in force (the фраза's, else `formType`). Every step's rule is a spec requirement;
tests name them.

Alternative considered: an on-device language model (Gemini Nano via AICore) for free-form
understanding. Not every phone has it, it is non-deterministic (the same фраза could fill different
fields on different days), cannot run under `verify`, and the grammar the owner actually speaks is
narrow. Rejected for v1; the `Heard` value is the seam a model could fill later.

### D4. Applying `Heard` to the form is pure, in `src/ui/voice-entry.ts`

`applyHeard(current, heard, offered) → { patch, notes }`, where `current` is the form's state and
`offered` the lists the form offers. The patch is applied by the screen through its existing
handlers in a fixed order: `chooseEntry` only if `heard.type` is present and differs (which drops
the label, as tapping does), then `chooseFrom`/`chooseTo` (which clear the сума on a currency
change, as by hand — the spec's second exception), then amount, label with `pickedByOwner = true`,
опис, date. For a переказ, a source the фраза did not name stays `current.fromId`; `arrived` is
never patched. The currency check of the spec («never reinterpreted») happens here, because only
here is the final рахунок — for a переказ the source — known: if `heard.currency` is set and
differs from it, no amount is patched and an `other-currency` note is added. The screen holds the
notes per field; a field's own handler clears its note, and a new фраза replaces them all.

### D5. Dictation states and words in `src/ui/dictation.ts`

A pure reducer over `availability`, `permission` and `DictationEnd` that returns what the form says
and offers (Ukrainian text, which action: speech settings / app settings / again / type), so every
sentence of «Dictation says where it stands» is under `verify`. No text mentions the keyboard's
microphone or any other way to turn speech into text (spec). The screen subscribes partials and calls
`cancel()` on blur and on `AppState` leaving `active`.

### D6. Holding the «+»

`onLongPress` on the «+» pushes `/transaction/new` with `listen: '1'`; the form reads it once at
mount through a pure `listenFromRoute` beside `entryFromRoute` and runs the same start path a tap on
«Надиктувати» runs (permission first). `accessibilityActions` gains `longpress` labelled
«Надиктувати транзакцію».

### D7. Nothing kept

The фраза lives in screen state only and dies with the screen. The journal gets one event kind,
`dictation`, with the `DictationEnd.kind` and nothing else; notes are screen text, never a
журнал failure entry. `src/ui/journal-privacy.test.ts` extends to drive a dictation through the
double with a фраза holding a сума and a name, and a note quoting a heard word, and to prove none of
them appears in the journal. No table, no backup field, no draft.

## Risks / Trade-offs

- [The phone has no on-device Ukrainian, or the system recogniser's Ukrainian is weak] → the
  availability states say so and the фраза can be typed. Check the owner's phone first (task 1.1);
  if it has none, the change still delivers typed фрази.
- [A closed ending list misses a real form, or a stem collides] → the fixtures from the owner's
  phone run through the matcher, negatives are spec scenarios, and the result is always visible in
  the form before «Записати».
- [The recogniser writes numbers its own way («10 000», «10000», «десять тисяч», «10 тис.»)] → the
  numeral grammar takes all of them; real transcripts from the owner's phone become test fixtures.
- [Рахунки with Latin names («Mono Black») cannot be said] → named non-goal; the form's picker is
  one tap. A spoken alias per record is the follow-up if the owner misses it.
- [Emulator cannot type Cyrillic through adb and usually has no on-device recogniser] → the parser
  is proven by unit tests; the smoke covers the availability, permission and «+» hold paths; real
  dictation is checked by the owner on the phone and recorded as such.

## Migration Plan

No data migration, no backup format change. Ships in a rebuilt APK (new native module and
permission). Rollback: a build without the module answers `unsupported` and the form keeps
working; nothing stored depends on it.

## Open Questions

- Which exact strings the owner's phone produces for numbers and names — collected in task 1.1 as
  fixtures; they tune tests, not the rules.
