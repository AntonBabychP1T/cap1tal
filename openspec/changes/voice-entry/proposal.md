## Why

monobank arrives by itself and the other banks arrive through their notifications, so what is still
typed by hand is mostly готівка: the гаманець at the counter, the cash someone handed over. That
is exactly the moment the form is least welcome — phone in one hand, change in the other — and a
витрата not written down then is a hole in «where my money went» and a коригування at the next
recount (vision §1, §15: corrections under 2 % of spending).

The owner wants to say it instead: «додай витрату п'ятсот гривень з рахунку гаманець, категорія
доставка їжі, опис покусать суші». Everything that sentence names is already a field of the one
entry form; what is missing is a way to turn the sentence into those fields. This serves the first
problem of the vision — *where the money went* — by making the cheapest source of a hole cheap to
close.

Owner's decisions (2026-10-01):

- Speech is recognised **on the phone only**. The app uses the phone's offline recogniser and never
  a cloud one; where the phone has no offline Ukrainian, the app says so and the phrase can be typed
  instead. Vision §12 stays as it is: no new outbound connection.
- A recognised phrase **fills the ordinary entry form**; nothing is stored until the owner sees it
  and presses «Записати».

## What Changes

- The entry form gains a **фраза**: one line the owner dictates or types, and that the form turns
  into its fields. A dictated фраза is shown
  as heard, editable, and can be dictated again.
- The app **understands a фраза** by fixed, local, predictable rules — no language model, no
  network: the сума in digits or in Ukrainian words («п'ятсот», «десять тисяч», «тисяча двісті
  п'ятдесят», «125 гривень 50 копійок»); the type, only when the фраза names one, by a fixed
  precedence; the рахунок or рахунки; the категорія or джерело; the опис; «вчора» / «позавчора».
  Names are matched whatever their grammatical ending («гаманець» / «з гаманця») and by nothing
  looser, against the owner's own unarchived рахунки, категорії and джерела.
- What the фраза does not name, the form keeps as it does today (its type, the remembered рахунок,
  today's date, the категорія the form gives the опис). What it names but the app
  cannot match — or matches to two things equally — is **said, not guessed**: the field stays
  unchosen and the form names what was heard.
- The domain distinctions hold: «повернення за електроніку» is a **повернення** in Електроніка,
  never a дохід; «тисяча на скарбничку» is a переказ into the jar, lending and repaying through a
  рахунок-борг are переказ; naming two рахунки «з … на …» is a переказ; a сума in another currency
  than the рахунок's is never reinterpreted.
- **Device side**: recognition through the phone's on-device recogniser only, the microphone
  permission asked on the owner's tap and answered truthfully, and every state where it cannot work
  (older Android, no recogniser, Ukrainian not installed — with the phone's own speech settings
  offered, the app never fetching a language itself — permission refused) said in words with
  typing as the way on. Audio is never kept; the
  фраза is never stored, logged, backed up or put in a репорт.
- Головний: holding the «+» opens the entry form already listening.

Non-goals:

- Storing without the form (no «записано одразу»), several транзакції in one фраза, splitting.
- Creating a рахунок, категорія or джерело from a фраза; spoken aliases for рахунки with Latin
  names («mono black» said as «моно блек») — later, if the owner misses them.
- Any cloud recogniser or language model; an assistant integration («Ok Google»), a home-screen
  shortcut or widget, a lock-screen entry; wake words; voice anywhere but the entry form.
- Dates beyond сьогодні / вчора / позавчора; currencies other than by the рахунок chosen; a
  комісія or a переказ's arrived amount said in the фраза; several sums in one фраза.

Vision §14 is not touched: nothing here is recurring, cloud, multi-user or initiates a payment.
§6 item 1 («Manual entry») gains one sentence: manual entry may be dictated.

## Capabilities

### New Capabilities

- `voice-entry`: what a фраза means — how the сума, type, рахунок(и), категорія or джерело, опис
  and date are read from it, what is left to the form, and what is said rather than guessed. Pure
  rules, no device.
- `speech-recognition`: the device side — on-device recognition only, the microphone permission,
  the states in which recognition cannot work and what the owner is told in each, the listening
  lifecycle, and the guarantee that audio and фраза are kept nowhere.

### Modified Capabilities

- `main-screen`: the entry form offers dictating or typing a фраза and fills itself from it (added
  requirements only; the existing recording requirements, including the категорія that follows the
  опис, are unchanged); holding the «+» opens the form listening.

## Impact

- New pure module `src/voice/` (Ukrainian number words, name matching across case endings, the
  фраза grammar) with colocated tests; new `src/ui/voice-entry.ts` applies a parsed фраза to the
  form state and `src/ui/dictation.ts` decides what the form says about dictation.
- New port `src/platform/speech.ts` + `speech-device.ts`; new local Expo module
  `modules/speech-recognition/` (Kotlin, `SpeechRecognizer.createOnDeviceSpeechRecognizer`,
  API 31+, language check on API 33+).
- `app.json`: permission `android.permission.RECORD_AUDIO`; a `<queries>` entry for
  `android.speech.RecognitionService` carried by the module's own manifest.
- `src/app/transaction/new.tsx` and the «+» on `src/app/(tabs)/index.tsx`.
- `docs/glossary.md` (фраза, надиктувати), `docs/product-vision.md` §6.
- No migration, no backup format change, no new npm dependency. Needs a rebuilt APK.
