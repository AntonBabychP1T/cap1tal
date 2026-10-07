Every new test goes in the test file next to the module it proves, under a `describe` that names
the capability (`main-screen`, `app-shell`), and its name quotes the scenario. Structural tests
for JSX read `src/app/transaction/new.tsx` or `src/app/_layout.tsx` as text from `src/ui/`, as the
existing entry-form tests do. Nothing goes under `src/app/`.

## 1. Pure form decisions (`src/ui/entry-form.ts`, tests in `src/ui/entry-form.test.ts`)

- [x] 1.1 Add `draftAfterStore(stored: EntryDraft): EntryDraft` (design D3). It keeps the тип, the рахунки and the дата, clears the сума, «Скільки прийшло» and the опис, and drops the категорія and джерело. Prove "The form is ready for the next транзакція" (a витрата dated yesterday on «гаманець» comes back with an empty сума and опис, no категорія, витрата, «гаманець» and yesterday's дата), "A переказ keeps both рахунки for the next one" (переказ «гаманець» → «картка USD» keeps the тип, «Звідки» and «Куди» and clears «Скільки пішло» and «Скільки прийшло»), and that `entryHoldsEdits(draftAfterStore(d), draftAfterStore(d))` is false ("Leaving after a stay-open store asks nothing").
- [x] 1.2 Add `tapAfterStore(current, confirmation, button)` (design D4). Prove "A repeated tap stores nothing" (`recordAndNext` on the untouched draft gives `'nothing'`), the «Записати» half of "Three витрати in a row" (`record` on the untouched draft gives `'leave'`), and that any changed field, or no confirmation, gives `'record'` for both buttons.
- [x] 1.3 Extend the `recordedConfirmation` tests with "A дохід is confirmed by its джерело" («Записано: дохід 5 000,00 UAH — Salary.») and re-title the existing комісія test to the modified scenario. It uses a 100000 → 97000 UAH переказ and names the переказ of 97000 and the комісія of 3000 minor units UAH.

## 2. The entry screen (`src/app/transaction/new.tsx`, `src/components/form.tsx`)

- [x] 2.1 Reorder the fields (design D1): сума, тип, рахунок, «Куди», «Скільки прийшло», опис, категорія or джерело, дата. Add a structural test in `src/ui/entry-form.test.ts` that reads `new.tsx` and asserts the label order, proving "The сума is the first field and the дата the last", "A переказ keeps the сума first", "A повернення keeps the сума first" and "The proposed категорія stands right under the опис". Re-run the existing `the entry screen follows the опис` tests unchanged.
- [x] 2.2 Make `Field` forward a ref to its `TextInput`. Give the сума `autoFocus` and keep `keyboardType="decimal-pad"`. If `voice-entry` is archived by then, make autofocus `!listenFromRoute(asked.listen)` (design D7). Add a structural test proving "The «+» opens on the сума with digits ready" (the `autoFocus` and `decimal-pad` props on the «Сума» field). Add a pure test proving "Switching the тип keeps the typed сума" (`chooseEntry` never clears `amount`, asserted on the source) and "A рахунок in another currency still clears the сума" (the existing `chooseFrom` assertion, re-titled).
- [x] 2.3 Move «Записати» (primary) and «Записати і ще одну» (secondary) into `Screen`'s `footer`, side by side and stacked when they do not fit. Pass no footer without a рахунок (design D2). Add a structural test proving "Both actions stand above the keyboard on opening" (both titles appear only inside the `footer` prop) and "No рахунок, no actions" (the footer is absent in the no-рахунок branch).
- [x] 2.4 Give `store` and `record` the `then: 'leave' | 'stay'` parameter (design D3):
  - `'stay'` applies `draftAfterStore`, resets `pickedByOwner` and the «Відкинути зміни?» baseline, sets the confirmation from `recordedConfirmation`, and refocuses the сума;
  - pass the same `then` through `askAboutTransfer`'s one `store` callback, which serves both the комісія and the дохід «Відсотки» proposals, for «Так» and «Ні»;
  - add the synchronous in-flight guard `storing` (a ref, design D3): `record` returns at once while it is set and sets it itself, before `buildEntry` and before any dialog; it is cleared on a refusal and on «Скасувати» of the date question, and after `'stay'` by an effect keyed on the new confirmation, never in the handler that calls the setters;
  - on `'stay'` also call `reload()`, so the recently used rows include what was just recorded.

  Gate both buttons through `tapAfterStore`. Extend `the entry screen after a store` in `src/ui/entry-form.test.ts` with structural tests:
  - "«Записати» returns with what was recorded": `router.back()` only on `'leave'`;
  - "The owner sees what was recorded": `recordedConfirmation` is called on `'stay'`;
  - "A refusal is not a confirmation": the catch sets no confirmation;
  - "An accepted комісія is part of the confirmation": `askAboutTransfer` receives a store bound to the same `then`;
  - "A repeated tap stores nothing": `record` checks and sets `storing.current` before `buildEntry` is called and before any `Alert`, `store` never sets it, the guard is cleared on the refusal path and on the date question's «Скасувати», and the `'stay'` clearing lives in a `useEffect` keyed on the confirmation.
- [x] 2.5 Draw the confirmation as one line directly above the two actions, inside the footer, shown only while the form equals the confirmation's draft (design D4). Add a structural test proving "The confirmation is seen where the button is" (the confirmation renders inside the `footer` prop, before the actions).

## 3. App shortcut (`plugins/with-android-shortcuts.js`, tests in `src/ui/android-shortcuts.test.ts`)

- [x] 3.1 Write `plugins/with-android-shortcuts.js` with its pure exports (design D5):
  - `shortcutsXml({ pkg, scheme })`;
  - `withShortcutsMetaData(manifest)`, idempotent on the main activity;
  - `assignShortcutStrings(strings)`;
  - the vector icon text, with its colour copied from `Colors.light.accent`.

  In `src/ui/android-shortcuts.test.ts`, prove "The shortcut is offered on the icon" at config level: the XML declares `record_expense` with long label «Записати витрату», a `VIEW` intent to `cap1tal://transaction/new` and `com.antonbabychp1t.cap1tal.MainActivity`, and the meta-data is added exactly once even when applied twice. Also prove that the icon colour equals the theme accent, and that applying the plugin adds no `uses-permission` to the manifest.
- [x] 3.2 Add `"./plugins/with-android-shortcuts"` to `app.json` `expo.plugins`. Assert it in `src/ui/android-shortcuts.test.ts`. Run `npx expo-doctor`, then `npx expo prebuild --platform android --no-install` and check that the generated `android/app/src/main/res/xml/shortcuts.xml`, both strings and the `android.app.shortcuts` meta-data on `MainActivity` are present. `android/` is generated and is not committed. Record in the task that the native side is checked by CI's `android` job, not by `verify`.
  - Done 2026-10-06: prebuild generated `res/xml/shortcuts.xml` (`record_expense`, `VIEW` → `cap1tal://transaction/new`, `com.antonbabychp1t.cap1tal.MainActivity`), both strings, the drawable and the `android.app.shortcuts` meta-data on `MainActivity`. `expo-doctor` fails only its two dependency-version checks (28 SDK patch updates, duplicate deps), which predate this change. The native side is checked by CI's `android` job, not by `verify`. Prebuild also rewrote `package.json`'s `android` script; that was reverted.

## 4. The stack under a shortcut-opened form (`src/app/_layout.tsx`, `src/app/(tabs)/index.tsx`)

- [x] 4.1 Export `unstable_settings = { initialRouteName: '(tabs)' }` from `src/app/_layout.tsx`. Add `entrySingularId(params)` to `src/ui/entry-form.ts` and mark `transaction/new` `dangerouslySingular={(_, params) => entrySingularId(params)}`; the form clears its own `type`/`to`/`account` params after mount (design D6). Prove `entrySingularId` in `src/ui/entry-form.test.ts` (`'entry'` for no params, `undefined` when any of the three is named). Add structural tests in `src/ui/android-shortcuts.test.ts` proving "Recording from the shortcut lands on Головний" (the initial route is `(tabs)`) and "An open form is not opened twice" / "An open переказ is not turned into a витрата" (the entry route is singular through `entrySingularId`, the form clears its params, and the shortcut's link carries no `type` parameter).
- [x] 4.2 Gate the first-run `router.replace('/onboarding')` in `src/app/(tabs)/index.tsx` on Головний being focused (design D6). Add a structural test in `src/ui/android-shortcuts.test.ts` proving "The shortcut on a device with no рахунок" (the redirect effect depends on focus), and keep the first-run-setup scenario "A fresh install lands on setup" green.

## 5. Docs

- [x] 5.1 Update `docs/app-overview.md`: the entry form's field order, the two actions and the launcher shortcut. Check that the glossary needs no new term («ярлик» is UI wording, not a domain term). Run `npm run verify`.

## 6. Emulator smoke

- [ ] 6.1 On a rebuilt APK (`scripts/android.sh up`, which re-runs prebuild for the plugin), run the smoke-runner on every scenario of `main-screen` and `app-shell` in this change. It must cover:
  - the «+» opening on a focused сума with the digit keyboard;
  - the field order for витрата, переказ and повернення;
  - both actions above the keyboard, also at the largest text size;
  - three витрати in a row with «Записати і ще одну», then «Записати» on the untouched form;
  - a double tap storing one;
  - a long press on the launcher icon showing «Записати витрату», plus `adb shell am start -a android.intent.action.VIEW -d cap1tal://transaction/new` cold and warm;
  - «назад» from a cold-start form landing on Головний;
  - the shortcut while the form is open with «120» typed, and while it is open on a переказ with «500»;
  - the shortcut after `scripts/android.sh reset` (no рахунок), then «До Рахунків», a new рахунок and its «+»: the form opens on that рахунок;
  - both actions above the navigation bar with the keyboard hidden, and no gap the size of the navigation bar between them and the keyboard while it is up;
  - the bug-report handle (bottom-right, `src/components/bug-report-here.tsx`) not covering «Записати і ще одну» or the confirmation.

  Attach the screenshots and fix the defects found, each with a failing test first where the logic is pure.

  2026-10-07, first pass (owner-side smoke): two defects, fixed with failing structural tests first
  and re-checked on `Pixel_10_Pro` (API 37):
  - **Gap above the keyboard** — ~96 px between «Записати» and the keys (24 px padding + the
    72 px navigation-bar inset, applied while the keyboard was up). Fixed: the footer drops
    `insets.bottom` while `useKeyboardShown()` (design D2). Re-checked: ~30 px with the digit
    keyboard up; with it hidden, both actions stand clear above the navigation bar.
  - **After `reset` and a first рахунок, Головний went to «Перші кроки»**, with the dead form left in
    the stack under it. Fixed: the redirect re-reads storage before firing, and «До Рахунків»
    dismisses the form (design D6). Re-checked: `reset` → cold shortcut → «До Рахунків» → Рахунки
    tab → new рахунок «wallet» → its «+» → «Записати» → Головний shows the витрата, no redirect;
    «назад» on Головний leaves the app (no form underneath).
  Still open for the box: the rest of the list above (field order per тип, the largest text size,
  three in a row, double tap, launcher long press, warm/cold `VIEW`, the shortcut over an open form,
  the bug-report handle).

## 7. Close

- [x] 7.1 Run `npm run verify` and paste the final lines
- [ ] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
