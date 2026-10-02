## 1. Ground truth from the owner's phone

- [ ] 1.1 With the owner: on their phone, check the Android version and whether the system's
  on-device recogniser has Ukrainian (system speech / voice input settings); have them dictate
  ~15 phrases offline (amounts in words and digits, «гаманець»/«з гаманця», «доставку їжі»,
  «повернення за електроніку», копійки, a jar top-up) and give the raw text. Put them into
  `src/voice/fixtures.ts` **anonymised** — real рахунок, категорія and person names replaced by the
  spec's placeholders (Гаманець, Чорна, Кафе, Ярослав…) and суми changed, keeping only how the
  recogniser spells numbers and endings. Record the phone's answer (version, on-device Ukrainian
  yes/no) at the top of this file, and which settings screen of the phone holds the on-device
  recognition languages and whether an intent opens it (design D1 `openSpeechSettings`). If it has none, record it and continue: the typed фраза ships.
- [ ] 1.2 Add «фраза» and «надиктувати» to `docs/glossary.md` and one sentence to
  `docs/product-vision.md` §6 item 1 (manual entry may be dictated, recognised on the phone only);
  `npm run verify` stays green.

## 2. Words and numbers (`voice-entry`: «The сума is read from digits or from Ukrainian number words», «Exactly one number is taken as the сума, or none»)

- [ ] 2.1 Write `src/voice/vocabulary.ts` (every closed list of the spec: type words, markers,
  prepositions, currency, копійки, date and опис words, the ending list) and `src/voice/tokens.ts`
  (apostrophe forms, fold, punctuation as space except between digits, spans, three-digit
  grouping — design D3). Tests in `src/voice/tokens.test.ts` prove "Every apostrophe reads the
  same", "Grouped digits with a comma", "A comma with a space is no decimal point", and that spans
  point back into the original text.
- [ ] 2.2 Write `src/voice/number-words.ts` (integer hundredths, runs ended by «і»/«та»/comma,
  scales, «тис.», пів/півтори, копійки/центи). Tests in `src/voice/number-words.test.ts` prove
  "Words make the сума", "Thousands in words", "Halves", "Digits and words together", "Копійки make
  the fractional part", and every number in `fixtures.ts`.

## 3. Matching names (`voice-entry`: «Names are matched whatever their grammatical ending, and only so»)

- [ ] 3.1 Write `src/voice/spoken-names.ts` (`sameWord` by the ending list and fleeting vowel,
  consecutive runs, ranking, tie → nothing, currency tie-break, kinds filtered to what the pickers
  offer — design D3). Tests in `src/voice/spoken-names.test.ts` prove "Case endings still match",
  "A shared beginning is not a match", "The longer name wins", "Two equal matches choose neither",
  "A named currency decides between same-named рахунки", "An archived рахунок is not matched",
  "«Коригування» is never matched", "A person's name in another case still matches", "A name equal
  to a type word does not take it", "After «на» a рахунок wins over a same-named категорія", and
  every name form in `fixtures.ts`.

## 4. Understanding a фраза (`voice-entry`)

- [ ] 4.1 Write `understandPhrase` in `src/voice/understand.ts`, steps 1–5 of design D3: опис cut,
  names, date, numbers and currency, markers. Tests in `src/voice/understand.test.ts` prove "The
  опис runs to the end", "A marker with a name ends the опис", "A marker with no name stays in the
  опис", "No опис word, no опис", "A name keeps its own number", "The number with a currency word
  wins", "A currency word marks only the number before it", "Two bare numbers decide nothing", "A fee said beside the сума decides nothing", "A number
  in the опис stays in the опис", "A symbol or a singular form marks the currency too", "Yesterday
  and the day before", "Today changes nothing", "A said
  рахунок that does not exist is reported up to the next number".
- [ ] 4.2 Add the type precedence and рахунок roles (steps 6–7). Tests prove "Naming no type leaves
  the form's type", "Отримання is a дохід", "A повернення is never a дохід", "Two рахунки from and
  to are a переказ", "A jar top-up is a переказ", "Cash put into the гаманець is a переказ", "On a дохід form «на» names the рахунок",
  "Lending is a переказ", "A repayment is a переказ
  back", "A переказ to someone who is no рахунок says what is missing", "A джерело alone makes a
  дохід", "The marker «джерело» makes a дохід", "A marker after a preposition keeps the direction",
  "The said рахунок wins over a mentioned one", "Two mentioned рахунки for a витрата choose
  neither".
- [ ] 4.3 Add label resolution (step 8). Tests prove "«За» names the категорія of a повернення",
  "A word after «на» that is no name changes nothing", "A дохід takes a джерело, not a категорія",
  "A marker keeps its kind without a type", "A typeless label follows the form's type", "A
  переказ takes no label", "A фраза never creates a категорія", "A full фраза
  yields every field it names", "A фраза naming nothing known yields nothing", and that the same
  input on the same day onto the same form type gives the same `Heard`. Run every phrase of `fixtures.ts` with its expected
  values.

## 5. Applying it to the form (`main-screen`: «The entry form can be filled from a фраза», «The form says what it heard and did not use»)

- [ ] 5.1 Write `applyHeard` in `src/ui/voice-entry.ts` (design D4), including the currency check.
  Tests in `src/ui/voice-entry.test.ts` prove "A dictated витрата fills the form and waits", "What
  the фраза does not name keeps the form's default", "A named категорія beats the правило", "A
  фраза without a type keeps a переказ a переказ", "A повернення is filled as a повернення", "A
  second фраза corrects the first", "A named type drops the previous label", "Dollars onto a
  hryvnia рахунок fill no сума", "A currency the app does not hold is never read as гривні", "No
  currency word takes the рахунок's currency", "A cross-currency переказ fills only what left",
  "An unknown категорія is said beside the picker", "Dollars onto a hryvnia рахунок are said, not
  converted", and — through `entry-form.ts` — "A дохід without a джерело is still refused".
- [ ] 5.2 Notes as pure state in `src/ui/voice-entry.ts` (per field, cleared by that field's
  change, replaced by a new фраза). Tests prove "Picking the field clears the note", "A new фраза
  replaces the old notes", and "A typed фраза fills the form the same way" (the typed and the
  dictated path call the same function).

## 6. Device side (`speech-recognition`)

- [ ] 6.1 Write the port `src/platform/speech.ts` with `dictationEndFrom`, the permission mapping
  and the locale constant, and a test double (design D2). Tests in `src/platform/speech.test.ts`
  prove every code mapping, "Nothing said is nothing heard", "A phone that cannot tell in advance",
  the four permission states, and "The phone in English still asks for Ukrainian" (the locale
  passed to `listen` is `uk-UA` whatever the device locale the double reports).
- [ ] 6.2 Write `src/ui/dictation.ts` (design D5). Tests in `src/ui/dictation.test.ts` prove "No
  on-device recogniser, no recognition", "Ukrainian not installed", "The language is being added",
  "The first dictation asks", "Opening the form asks nothing", "A blocked permission offers the
  settings", "Silence ends it with the фраза", "Leaving the screen releases the microphone" (blur
  and background both cancel), "A second dictation does not start over the first", "Listening is
  visible and can be stopped", "A phone without on-device Ukrainian offers typing", "Nothing heard
  invites another try", "Holding with the permission not yet given asks first", and that no text it
  returns names another way to turn speech into text.
- [ ] 6.3 Create `modules/speech-recognition/` (Kotlin, `createOnDeviceSpeechRecognizer` only,
  availability, `openSpeechSettings`, start / stop / cancel / events, no-op second start, cancel on
  background, `<queries>` in its manifest — design D1); add `RECORD_AUDIO` to `app.json` and its
  one-line reason to `.claude/rules/android.md`. Verified by `scripts/android.sh up` building and
  launching, and by a grep proving the module contains neither `createSpeechRecognizer(`,
  `RecognizerIntent.ACTION_RECOGNIZE_SPEECH`, `triggerModelDownload` nor any `Log.` call carrying
  results or partial results.
- [ ] 6.4 Write `src/platform/speech-device.ts` and bind it in `src/hooks/speech-ports.ts`
  (`unsupported` on iOS and where the module is absent). `npm run verify` green.

## 7. Screens

- [ ] 7.1 Entry form in `src/app/transaction/new.tsx`: the фраза line with «Надиктувати», partial
  text, stop, notes beside fields, every field usable by hand while listening, cancel on blur and
  on background, `listenFromRoute` (design D4–D6). `listenFromRoute` tested in
  `src/ui/entry-form.test.ts`; "Fields stay usable while listening" proven in
  `src/ui/voice-entry.test.ts` (a hand change before the фраза ends survives what the фраза does not
  name) and on the emulator (8.2).
- [ ] 7.2 Головний: `onLongPress` on the «+» and the `longpress` accessibility action «Надиктувати
  транзакцію» (design D6) in `src/app/(tabs)/index.tsx`. "Tapping is unchanged", "Holding opens the
  form listening" and "The hold is a named action" proven on the emulator (8.2).

## 8. Privacy and verification

- [ ] 8.1 Journal event `dictation` with the outcome only; extend `src/ui/journal-privacy.test.ts`
  to prove "A dictation's журнал entry carries no words" (фраза, partials and a note), and with the
  backup tests "A recorded витрата keeps only its опис" (no фраза in any table, бекап or журнал).
- [ ] 8.2 Smoke on the emulator (`smoke-runner`): the form shows the фраза and «Надиктувати»;
  availability and permission states (first ask, refusal, blocked → app settings, unavailable →
  typing); tapping «+» opens the form not listening; holding «+» opens it listening; the hold is
  offered as a named accessibility action; leaving the form while listening releases the
  microphone; typing «300 грн» into the фраза fills the сума while the сума field stays editable.
  Real Ukrainian dictation — including "Recognition works with the network off" — is checked by the
  owner on their phone and recorded here as such (emulator: no Cyrillic input through adb, usually
  no on-device recogniser).
- [ ] 8.3 Run `npm run verify` and paste the final lines
- [ ] 8.4 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
