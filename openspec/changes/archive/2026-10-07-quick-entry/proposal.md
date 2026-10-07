## Why

Recording a витрата by hand is the first source of транзакції in the vision (§6.1) and the only
one for cash. It is also the step that decides whether "every транзакція from every рахунок is in
the app" (§15) — and with it whether «скільки лишилось» can be trusted (the vision's second
problem) and whether "where the money went" is complete (the first). Today the form «Нова
транзакція» asks in the wrong order: тип → рахунок → сума → дата → категорія → опис. The сума,
the one thing always typed, is the third field and is not focused, so every recording starts with
a tap to find it. «Записати» sits at the end of the column, under the keyboard and below the fold
of a переказ (roadmap «Горизонт 1», 1.2). Recording three cash витрати after a market trip means
opening the form three times, because a store now leaves the screen.

Two things the roadmap asks for already exist and are not re-specified here:

- The form opens on the рахунок last recorded on by hand ("The entry form opens on the рахунок
  last recorded on by hand").
- The категорія a правило or the шаблон gives the typed опис is shown at once and is one tap from
  being changed ("The entry form shows the категорія a правило gives the typed опис").

One requirement no longer matches the code. "Recording is visibly confirmed" still says the screen
stays open after every store, but since the owner's report of 2026-09-23 a store leaves the screen
and the confirmation text is never shown. This change settles that drift: «Записати» leaves, and the
new «Записати і ще одну» stays, confirms and clears.

## What Changes

- **Сума first, typed at once.** The сума is the first field of the form. Opening the form focuses
  it and brings up the phone's digit keyboard, with no tap. The rest follow in the order the owner
  decides them:
  1. тип;
  2. рахунок («Звідки», «Куди», «Скільки прийшло» for a переказ);
  3. опис;
  4. категорія, джерело or «До якої категорії»;
  5. дата.

  The опис stands directly above the категорія the правило proposes for it.
- **«Записати» always in reach.** «Записати» and «Записати і ще одну» are pinned under the form.
  They stay visible without scrolling, at any scroll position, while the keyboard is up and at the
  largest system text size. The recording confirmation stands directly above them.
- **«Записати і ще одну».** It stores exactly what «Записати» would store and keeps the form open
  for the next one. The confirmation names what was stored. The сума, «Скільки прийшло», the опис
  and the picked категорія or джерело are cleared, and the сума is focused again. The тип, the
  рахунки and the дата stay (the дата: decision pending owner confirmation). A second tap on an untouched form stores nothing.
  «Записати» keeps today's behaviour: it stores and returns to where the owner came from.
- **App shortcut on Android.** A long press on the app icon offers «Записати витрату». It opens
  the entry form on a витрата, the same form the «+» opens, whether the app was closed or running.
  Leaving the form lands on Головний when the app was not running. An entry form already open wins:
  it keeps its тип and contents. The shortcut stores nothing by
  itself.

## Non-goals

- A home-screen widget («Витрачено у жовтні»). It is a native module with its own design and its
  own change (roadmap 1.2, «пізніше»).
- An iOS quick action. It stays possible: the shortcut opens a platform-neutral route of the app.
  Delivering it needs native handling of the shortcut item on iOS, which is a follow-up.
- Dynamic or pinned shortcuts: shortcuts per рахунок, per категорія or «last used», and more than
  one shortcut.
- Shortcuts that store a транзакція without the form, or a "quick add" that skips the рахунок or
  the сума.
- Any change to the pickers themselves, or to how the дата is picked. `uniform-fields` owns
  pickers and the date control.
- Any change to the editing screen of a stored транзакція. It keeps its own order and its
  «Зберегти».
- Any change to who moves the remembered рахунок, to правила, to the шаблон, or to the refusals
  the form already has.
- Dictation into the form. That is `voice-entry`, which is in flight.

No vision §14 item is touched. The shortcut opens a form, so it is not a recurring or scheduled
транзакція (§14.6). It is not a payment either (§14.12), and nothing about it depends on Android
beyond the launcher entry itself (§14.15).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `main-screen`:
  - ADDED: the сума comes first and is focused with the digit keyboard on opening, and the fields
    follow a fixed order;
  - ADDED: «Записати» and «Записати і ще одну» stay in reach without scrolling;
  - MODIFIED "Recording is visibly confirmed": «Записати» returns, «Записати і ще одну» stays,
    confirms and clears, and a repeated tap stores nothing;
  - MODIFIED "The recording confirmation stands above «Записати»": the confirmation sits above
    the pinned pair.
- `app-shell`: ADDED a long press on the Android app icon offers «Записати витрату», which opens
  the entry form.

## Impact

- **UI code:**
  - `src/app/transaction/new.tsx`: field order, autofocus, a pinned footer with two actions and the
    confirmation, and the reset after «Записати і ще одну»;
  - `src/ui/entry-form.ts` (+ `entry-form.test.ts`): what the form becomes after a stay-open store,
    and what a repeated tap does (pure);
  - `src/components/form.tsx`: `Field` forwards a ref so the сума can be focused again;
  - `src/app/_layout.tsx`: `unstable_settings.initialRouteName = '(tabs)'`, so a cold start from
    the shortcut has Головний beneath the form, and the form is singular in the stack;
  - `src/app/(tabs)/index.tsx`: the first-run redirect to «Перші кроки» fires only while Головний
    is focused, so it never replaces a form opened from the shortcut.
- **Native config, no hand edit under `android/`:** a new config plugin,
  `plugins/with-android-shortcuts.js` (+ `src/ui/android-shortcuts.test.ts`). It writes one static
  launcher shortcut (`res/xml/shortcuts.xml`, its strings and a vector icon) and the
  `android.app.shortcuts` meta-data on the main activity. It is listed in `app.json` `plugins`. The
  new APK reaches the phone only through a rebuild.
- **Dependencies, native modules, permissions, network, storage, migrations, бекап:** none.
- **Docs:** `docs/app-overview.md` (the entry form and the launcher shortcut).
- **Sequencing:**
  - `uniform-fields` (sibling, 1.3) rewrites the pickers and the date control inside the same
    `src/app/transaction/new.tsx`, and may modify "The дата of a транзакція is set without typing a
    date code". Do not put the two in the same wave. Whichever lands second rebases the field order
    onto the other's controls.
  - `voice-entry` (in flight) ADDs main-screen requirements on the same form:
    - a фраза line above the fields;
    - holding the «+» opens the form listening.

    No requirement is shared. Whichever archives second must reconcile the autofocus: a form opened
    listening should not raise the keyboard over the dictation (design D7).
  - `local-model-guesses` (in flight) adds main-screen requirements about the «Без категорії» mark
    and editing, not the entry form, so it does not conflict.
  - `answer-queue`, `observations-by-weight`, `commitments-from-recurring` and `backup-reminder`
    also touch `main-screen`, but only Головний's widgets and queue. No requirement is shared, so
    they can share a wave with this change, though not edit `new.tsx` in the same lane.
