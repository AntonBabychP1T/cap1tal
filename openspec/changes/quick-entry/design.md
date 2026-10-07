## Context

See proposal.md (Why) for the motivation. Relevant state of the code:

- **The form.** `src/app/transaction/new.tsx` is the one entry form. It draws, inside one `Card`
  in `Screen`'s scroll view: `Choices` «Тип» → `Picker` рахунок (and «Куди») → `Field` «Сума»
  (`keyboardType="decimal-pad"`, not focused) → «Скільки прийшло» → `DateField` → категорія /
  джерело `Picker` → `Field` «Опис» → `Action` «Записати». So «Записати» scrolls with the column
  and ends up under the keyboard.
- **Pure decisions** live in `src/ui/entry-form.ts`: `buildEntry`, `defaultAccountId`,
  `proposedCategoryId`, `entryHoldsEdits` and `recordedConfirmation`. The tests in
  `src/ui/entry-form.test.ts` also read `new.tsx` as text for structural assertions.
- **After a store.** `store()` saves, remembers the рахунок, plays the `stored` haptic and calls
  `router.back()`. `recordedConfirmation` exists and is tested, but is never shown. This is the drift
  from "Recording is visibly confirmed" that the proposal names.
- **Screen footer.** `Screen` (`src/components/surfaces.tsx`) already has a `footer` slot. It is a
  block pinned under the scroll view, inside the `KeyboardAvoidingView`, so it rides above the
  keyboard and takes its height out of the scroll area. `transactions.tsx` and `account/[id].tsx`
  use it.
- **Native config.** The app is managed: `android/` is generated and never edited (`.claude/rules/
  android.md`). Native tweaks are config plugins in `plugins/`; today there is one,
  `with-android-accent.js`, proven by `src/ui/android-accent.test.ts`, which `require`s the plugin's
  exported pure helpers. `app.json` has `"scheme": "cap1tal"`, so Expo's prebuild already adds a
  `VIEW`/`BROWSABLE` intent filter for `cap1tal://` to `MainActivity`. expo-router turns
  `cap1tal://transaction/new` into the path `/transaction/new`: for a custom scheme, everything
  after `://` is the path (`expo-router/build/fork/extractPathFromURL.js`).
- **Root stack.** `src/app/_layout.tsx` has no `unstable_settings`. A cold start on a deep link
  would therefore build a stack holding only `transaction/new`, and «назад» would leave the app.
- **First run.** `src/app/(tabs)/index.tsx` calls `router.replace('/onboarding')` from an effect
  when `firstRun(...)` holds. That runs while Головний is mounted, even when it is mounted beneath
  another screen.

## Goals / Non-Goals

**Goals:**

- Every decision this change adds is a pure function under `verify`:
  - what the form becomes after a stay-open store;
  - what a repeated tap does;
  - the field order (as a structural test);
  - the shortcut XML.
- The shortcut is pure config, with no native module, dependency or permission.
- iOS stays possible: the shortcut targets a platform-neutral route.

**Non-Goals:**

- Restyling `Picker`, `DateField` or `Choices` (`uniform-fields`).
- Any change to the editing screen `transaction/[id].tsx`.
- Storage, migrations and the бекап are untouched.

## Decisions

### D1. Field order and autofocus live in the screen; the order is pinned by a structural test

The fields are reordered in JSX:

1. `Field` «Сума» / «Скільки пішло»;
2. `Choices` «Тип»;
3. `Picker` «Рахунок» / «Звідки»;
4. «Куди»;
5. «Скільки прийшло»;
6. `Field` «Опис»;
7. категорія / джерело `Picker`;
8. `DateField`.

The сума gets `autoFocus`. `Field` forwards a ref (`forwardRef` to its `TextInput`) so the screen
can call `focus()` again after a stay-open store (D3). `keyboardType="decimal-pad"` stays. It
shows digits with a decimal separator on Android, and `parseAmount` already accepts both «,» and
«.».

The order is a property of JSX that `verify` cannot render. As the existing tests already do for
this screen, `entry-form.test.ts` reads `new.tsx` and asserts that the labels appear in the
specified order. That test names the scenario "The сума is the first field and the дата the last".

Why the тип comes second rather than first: the vision makes витрата the default ("every
транзакція is a витрата unless typed otherwise"), so the тип is the field least often touched.
Putting it under the сума costs nothing, because switching the тип keeps the typed сума
(`chooseEntry` never clears `amount`). Considered and rejected: the тип as a header row above the
сума. It is the same thing visually, but it would make the сума the second focusable control for
assistive technology.

Why the опис comes before the категорія: the категорія follows the опис
(`proposedCategoryId`). With the опис directly above it, the proposal appears right under the
owner's typing, above the keyboard. Below the дата it was off screen.

### D2. «Записати» and «Записати і ще одну» go into `Screen`'s `footer`

The two `Action`s, and the confirmation line above them (D4), move into `<Screen footer={...}>`.
The footer already rides the `KeyboardAvoidingView` and takes its height out of the scroll area,
which is exactly the requirement "«Записати» stays in reach without scrolling". It is the same
mechanism two screens already use, so no new layout code is needed.

- «Записати» is the primary `Action`.
- «Записати і ще одну» is `variant="secondary"`, so the common path stays visually dominant.
- They sit side by side when both labels fit, and are stacked otherwise. The largest text size is
  the case that decides; the smoke checks it.
- With no рахунок, no footer is passed.
- `Screen` takes only the top safe area, so the footer adds the bottom inset itself
  (`useSafeAreaInsets().bottom` as bottom padding). Edge to edge, the actions would otherwise sit
  under the navigation bar while the keyboard is down. The smoke checks them with the keyboard
  hidden. The inset is dropped while the keyboard is up (`useKeyboardShown`,
  `src/hooks/use-keyboard-shown.ts`): the keys cover the navigation bar, and the same padding was a
  bar-high gap above them (smoke 2026-10-07: ~96 px between «Записати» and the keyboard).

Considered and rejected:

- a floating action over the column. `Screen` documents that `overlay` and `footer` are mutually
  exclusive, and an overlay hides the last field;
- keeping «Записати» in the column and scrolling to it. That breaks while the keyboard is up.

### D3. What the form becomes after a stay-open store is a pure function

A new pure helper in `src/ui/entry-form.ts`:

```ts
export function draftAfterStore(stored: EntryDraft): EntryDraft
// keeps type, accountId, toAccountId, date; clears amount, arrived, description;
// drops categoryId and sourceId
```

The screen applies it field by field, sets `pickedByOwner` to `false`, and resets the «Відкинути
зміни?» baseline to the result, so `entryHoldsEdits` is false right after the store. Today
`opened` is a `useState` constant; it becomes a settable state. Then the screen calls
`amountRef.current?.focus()`.

`store()` gains a parameter `then: 'leave' | 'stay'`:

- `'leave'` does what it does today (`router.back()`);
- `'stay'` applies `draftAfterStore`, sets the confirmation text from `recordedConfirmation(written,
  names)`, and keeps the screen.

**In-flight guard.** `transactionsRepo.save` is synchronous and `record` closes over render
state, so a second tap that lands before the re-render would build and store the same draft again.
The screen keeps `storing = useRef(false)`. `record` returns at once while `storing.current` is
true, checked before `buildEntry`, and sets it to true on that same line of `record` — not inside
`store()` — so a second tap cannot open a second future-date question or a second комісія /
«Відсотки» question, each of whose «Так» would store. It is cleared:

- on a refusal (the catch) and on «Скасувати» of the future-date question, so the form is never
  stuck (the переказ question has no cancel: both its buttons store);
- after `'stay'`, by an effect keyed on the new confirmation — that is, after the cleared draft
  has been committed and `record` closes over it. Clearing it in the same handler that calls the
  setters would protect nothing against a tap that still sees the old closure;
- never on `'leave'`: the screen unmounts.

The ref is synchronous, so it closes the window that `tapAfterStore` (which reads render state)
cannot. On `'stay'` the screen also calls `reload()` from `useReloadOnFocus`, so the pickers'
recently used rows include what was just recorded for the next one.

Both paths keep the remembered рахунок, the haptic, the deferred `judgeProgressLater()` and the
alert clearing exactly as they are. Everything `buildEntry`, `entryDateCheck` and
`askAboutTransfer` decide is shared: the two buttons differ only in the `then` they pass through
`record(then)`. Both proposals of `askAboutTransfer` — the комісія of a short arrival and the дохід «Відсотки»
of a repayment above the principal — call its one `store` callback, for «Так» and «Ні» alike, so
binding that callback to the same `then` covers both (spec scenario).

### D4. The confirmation and the repeated tap

The screen holds `confirmation: { text: string; draft: EntryDraft } | undefined`. `draft` is the
form exactly as `draftAfterStore` left it. A pure helper decides what a tap does:

```ts
export function tapAfterStore(
  current: EntryDraft,
  confirmation: { draft: EntryDraft } | undefined,
  button: 'record' | 'recordAndNext',
): 'record' | 'nothing' | 'leave'
```

- While a confirmation stands and `current` still equals its draft (the same field comparison
  `entryHoldsEdits` uses), `recordAndNext` gives `'nothing'` and `record` gives `'leave'`.
- In every other case the answer is `'record'`.

Any field change ends the confirmation. It is shown only while `current` equals `confirmation.draft`,
so it is derived, not cleared by hand in every setter.

This replaces "a second tap shows «Напишіть суму»", which would be a refusal Alert over a form the
owner just used correctly. Considered: disabling the buttons while the form is empty. Rejected,
because "A refusal is not a confirmation" and "An empty сума asks for one" need the tap to explain
itself on a fresh form.

The confirmation reuses `recordedConfirmation` verbatim. Its text is already specified and tested
(«Записано: витрата 1 200,00 UAH — Groceries.»).

### D5. The launcher shortcut is a static shortcut written by a new config plugin

**Native change, named exactly.** A new file `plugins/with-android-shortcuts.js`, added to
`app.json` → `expo.plugins` as `"./plugins/with-android-shortcuts"` after `with-android-accent`.
It uses only `expo/config-plugins` (already a transitive dependency through `expo`) and does three
things.

1. **`withAndroidManifest`.** On the main launcher activity
   (`AndroidConfig.Manifest.getMainActivityOrThrow`), it adds:
   ```xml
   <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />
   ```
   It is added idempotently: an existing entry with the same name is replaced, not duplicated.

2. **`withStringsXml`.** It adds two string resources, because shortcut labels must be string
   resources, not literals:
   - `shortcut_record_expense_long` = «Записати витрату»;
   - `shortcut_record_expense_short` = «Витрата» (Android recommends ≤ 10 characters for the short
     label, which launchers show when space is tight).

3. **`withDangerousMod('android', …)`.** It writes two resource files under
   `android/app/src/main/res/`. There is no typed mod for an arbitrary `res/xml` file, and writing
   generated output during prebuild is exactly what the dangerous mod is for. The files are:

   - `xml/shortcuts.xml`:
     ```xml
     <shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
       <shortcut
           android:shortcutId="record_expense"
           android:enabled="true"
           android:icon="@drawable/ic_shortcut_record_expense"
           android:shortcutShortLabel="@string/shortcut_record_expense_short"
           android:shortcutLongLabel="@string/shortcut_record_expense_long">
         <intent
             android:action="android.intent.action.VIEW"
             android:data="cap1tal://transaction/new"
             android:targetPackage="com.antonbabychp1t.cap1tal"
             android:targetClass="com.antonbabychp1t.cap1tal.MainActivity" />
       </shortcut>
     </shortcuts>
     ```
     The package and scheme are read from the config (`android.package`, `scheme`), never
     hard-coded in the plugin. `targetClass` is `<package>.MainActivity`, the activity Expo
     generates.
   - `drawable/ic_shortcut_record_expense.xml`: a vector drawable, a «+» on a circle in the
     accent tone. The colour is copied from `Colors.light.accent`, with the same drift test as the
     accent plugin.

The plugin exports pure helpers, the same pattern as `with-android-accent.js`:
`shortcutsXml({ pkg, scheme })`, `withShortcutsMetaData(manifest)` and
`assignShortcutStrings(strings)`. `src/ui/android-shortcuts.test.ts` `require`s them and asserts:

- the XML names `record_expense`, the `VIEW` action, `cap1tal://transaction/new` and the package's
  `MainActivity`;
- the meta-data is added once to the main activity, even when applied twice;
- the long label is «Записати витрату»;
- `app.json` lists the plugin.

No permission is needed: static shortcuts are declared, not requested. No new dependency, no
native module, no Gradle change.

**Why a plugin and not a library.** `expo-quick-actions` (third party) would add a native module
and a dependency, and handle iOS too. For one static Android shortcut that never changes at
runtime, 60 lines of config plugin is the smaller surface and follows the repo's existing pattern.
A native module of our own (`modules/`) is not needed: static shortcuts need no code at runtime.

**Why a deep link and not an intent extra.** The `VIEW` intent with `cap1tal://transaction/new`
reuses the intent filter Expo already generates for the scheme, and expo-router's own linking.
There is no JS listener to write, and it works on cold and warm start alike. The route is the
platform-neutral thing an iOS quick action would open later.

**Deep-link safety.** Any app can fire `cap1tal://transaction/new`. That is acceptable, because the
route only opens a form that stores nothing until the owner taps. The route's existing parameters
(`type`, `to`, `account`) only pre-choose offers, which `entryFromRoute` and `defaultAccountId`
already validate against what exists.

### D6. The stack under a shortcut-opened form

- **`src/app/_layout.tsx` exports `unstable_settings = { initialRouteName: '(tabs)' }`.** On a cold
  start from the deep link, expo-router then builds `[(tabs), transaction/new]`, so «назад» and
  «Записати» (`router.back()`) land on Головний (spec "Recording from the shortcut lands on
  Головний"). A normal launch is unchanged, since `(tabs)` is already the first route.
- **`transaction/new` is singular only for a push that names nothing.** A boolean
  `dangerouslySingular` would apply to every push: the «+» on a рахунок (`params: { account }`)
  would bring back an older form below it with its stale state and drop the рахунок it names —
  reachable on a fresh device as shortcut → «До Рахунків» → create a рахунок → its «+». So the
  screen gets `dangerouslySingular={(_, params) => entrySingularId(params)}`. `entrySingularId` is
  a pure helper in `src/ui/entry-form.ts`: `'entry'` when the params carry none of `type`, `to`,
  `account`, else `undefined`. expo-router (`StackClient.js`) calls the same function on the
  action's params and on each existing route's params:
  - a param-less push (the shortcut, the «+» on Головний) finds an open form and brings it forward
    with its state (spec "An open form is not opened twice");
  - a push naming a рахунок or a тип always opens a fresh form that honours what it names.

  For every open form to be found, the form clears its own route params once it has read them at
  mount (`router.setParams({ type: undefined, to: undefined, account: undefined })`). It reads
  them only in its `useState` initialisers, so nothing else changes.
- **A running app.** The shortcut's `VIEW` intent reaches a running app as a deep-link `NAVIGATE`
  that expo-router pushes over the current stack, so «назад» returns to the screen that was open
  (spec "From a running app the form opens over the screen in use"). Only the smoke proves this,
  like the cold start.
- **The first-run redirect is gated on focus.** In `(tabs)/index.tsx`, the
  `router.replace('/onboarding')` effect runs only while Головний is focused (`useIsFocused()` from
  expo-router's navigation). Otherwise, on a fresh device, a cold start from the shortcut would
  mount Головний beneath the form, and its redirect would replace the form. With the gate, the entry
  screen shows «Спершу створіть рахунок» (spec "The shortcut on a device with no рахунок"). Going
  back to Головний then still lands on «Перші кроки» as before, because the redirect fires when
  Головний comes into focus — judged on a fresh `storedHistory.read()`, not on the `stored` Головний
  read under the form: that read is from before the owner made a рахунок, and the focus read only
  lands on the next render (smoke 2026-10-07: a first рахунок still sent Головний to «Перші
  кроки»).
- **«До Рахунків» dismisses the form.** The refusal's way out is `router.dismissTo('/accounts')`,
  not a push: the form that could record nothing is popped back to `(tabs)` and the Рахунки tab is
  shown, rather than left in the stack under Рахунки and under everything after it.

### D7. Autofocus and `voice-entry`

`voice-entry` (in flight) opens the form with `listen: '1'` when the «+» is held, and puts a фраза
line above the fields. A focused сума would raise the keyboard over the dictation feedback. The
decision for whichever change archives second:

- `autoFocus` is `!listenFromRoute(asked.listen)`, so a form opened listening does not focus the
  сума;
- the фраза line stays above the сума, because it is not a field.

If `voice-entry` lands first, this change's task 2.2 adds that condition. If this change lands
first, `voice-entry`'s apply must add it. The note goes into `voice-entry`'s tasks at that time,
not here. No requirement of this change is weakened: "The entry form opens with the сума ready to
type" covers the form opened by the «+» tap and by the shortcut, and neither opens it listening.

### D8. The дата stays after «Записати і ще одну» (decision pending owner confirmation)

The existing requirement returned the дата to today after every store. «Записати і ще одну» exists
for batches: the owner sits down in the evening with three cash receipts from yesterday. Returning
to today would silently re-date the second and third. The дата is named as a day beside its label
(«вчора»), so a kept дата is visible. Considered: returning to today, as before. It is safer
against forgetting, but it makes the batch case wrong by default. This decision is listed as an open
question. If the owner answers "today", `draftAfterStore` (task 1.1) and the scenario "The form is
ready for the next транзакція" change together, and nothing else does.

### D9. The shortcut never rewrites an open form

With `dangerouslySingular`, the shortcut's route carries no parameters, and the form reads
`entryFromRoute` only at mount, so an already open form keeps its тип and every typed field (spec
"An open переказ is not turned into a витрата"). The shortcut deliberately passes no `type=expense`
parameter: the form's default is already витрата, and a parameter would invite re-reading it on an
existing form.

## Risks / Trade-offs

- **[Risk]** The two actions plus the confirmation in the footer take height from the column on a
  compact phone with the keyboard up. → The confirmation is one line, and it is shown only after a
  stay-open store. The actions stack only when they cannot sit side by side. The smoke checks the
  largest text size on the Pixel AVD. If the column becomes unusable, the fallback is to hide the
  confirmation once the next field changes, which the spec already requires.
- **[Risk]** `autoFocus` on Android sometimes fails to raise the keyboard during a screen
  transition. The form rises from the bottom (motion "Screens enter from where they come from"). →
  If the smoke shows no keyboard, focus is called in the screen's `transitionEnd` listener instead
  of through the prop. It is the same `focus()` that D3 uses.
- **[Risk]** A deep link that arrives before storage is ready (`success === false`) is processed
  when the Stack mounts. → expo-router holds the initial URL until the navigator mounts. The smoke
  runs a cold start from the shortcut with `adb shell am start -a android.intent.action.VIEW -d
  cap1tal://transaction/new`, and from the launcher with a long press.
- **[Risk]** Launchers truncate a long short-label. → The short label is «Витрата» and the long
  label is «Записати витрату», as Android's guidance prescribes.
- **[Trade-off]** The shortcut always opens a витрата. A per-тип or per-рахунок shortcut was
  rejected as clutter. The form is one tap from any тип.
- **[Trade-off]** `dangerouslySingular` is named "dangerously" upstream because it changes stack
  semantics. Here it is applied to one leaf screen that is only ever pushed on top.

## Migration Plan

There is no data migration. The shortcut appears after the owner installs an APK built with the
new plugin; it needs `expo prebuild`, which `scripts/android.sh up` re-runs when `app.json` or
`plugins/` is newer than the manifest. Rollback means removing the plugin from `app.json` and
rebuilding; the launcher drops a static shortcut that is no longer declared. CI's `android` job
(Gradle `assembleDebug` after prebuild) is the check for the native side, since `verify` does not
build Android.

## Open Questions

- **Does the дата stay after «Записати і ще одну»** (D8: the spec says it stays, pending the
  owner's confirmation), or return to today as before? Answering "today" changes task 1.1 and the
  scenario "The form is ready for the next транзакція" together.
- **The short label.** Is «Витрата» right, or should both labels be «Записати витрату», accepting
  truncation on some launchers?
- **iOS quick action.** Is it a follow-up change (static `UIApplicationShortcutItems` plus native
  handling, e.g. `expo-quick-actions`), or not wanted until an iOS build exists (§14.15)?
