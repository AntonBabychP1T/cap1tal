## Why

On 2026-09-01 a manual pass over the app on the emulator showed that the first day of a calendar
month leaves the owner with almost nothing to read, and that the one number the Місяць screen leads
with reads as a disaster every month before the first дохід lands:

- Місяць opens on the current month and says «У цьому місяці ще нічого не записано», and «Звіти»
  spells out the newest month — the current one — as 0,00 in all three numbers. Two of the three
  answer screens are blank on every 1st of the month, while August's numbers sit one tap away
  unmentioned.
- «Залишилось −2650,00 UAH» is the largest number on Місяць, negative only because no дохід has been
  recorded yet this month. The formula is right (`monthly-picture`) and stays; the vision says the
  owner's income arrives 4–9 times a month on scattered days (§8), so a month that starts with no
  дохід is the normal state of this app, not an edge case. Leading with a number that is
  structurally negative for the first days of every month teaches the owner to distrust it — and
  §15 makes «залишилось» a number the owner must trust.

Both are deliberate decisions of the specs, so they are changed here rather than quietly patched.

The same pass showed six smaller things no requirement describes at all. The owner asked for one
change covering all of it, so they are folded in here rather than split by capability.

Both problems map to the vision's second question — how much can still be spent — and the
drill-down and search items to the first, where the money went.

## What Changes

**The month boundary**

- Місяць keeps opening on the current month, but a month with nothing recorded no longer stops at
  «ще нічого не записано»: it also states the previous month's витрачено and offers stepping to it
  in one tap.
- «Звіти» stops spelling out an all-zero newest month by default. It opens on the newest month of
  the span that holds a сума in the shown currency, falling back to the newest month when every
  month is empty. Picking a month by hand is unchanged, and the charts still draw every month.
- Місяць leads with «Залишилось» only while the shown month holds дохід. A month with no дохід
  recorded leads with «Витрачено» and shows «Залишилось» among the other numbers, under a plain
  sentence saying that no дохід is recorded for this month yet. The number itself, its label and
  the `monthly-picture` formula are untouched — only which number the screen leads with.

**The six small things**

- The setup view's progress line stops being ambiguous under the uppercase style: «Готово 2/4»
  instead of «ГОТОВО 2 З 4», which on this font with `letterSpacing: 1` reads as «2 3 4».
- The category drill-down (`/category/…`) states the category's own сума for the shown month per
  currency, and, when the category is over its ліміт, by how much it is over — today it carries a
  red title and nothing else.
- Головний shows itself from the top when the tab is opened again, instead of restoring the scroll
  position and dropping the owner into the middle of the entry form.
- «Сповіщення банків» calls the affordance that opens the add form by one label throughout,
  unchanged by opening and cancelling the form.
- The bank apps offered there are the known bank apps actually installed on this phone, not the
  whole hard-coded list. The typed-package field stays for anything not on the list.
- The monobank screen states when the last successful sync happened, and says plainly when none has
  happened on this device. The moment survives a restart.

**Non-goals**

- Automatic or background monobank sync. It stays manual: the bank allows one request a minute and
  scheduling work in the background is what steps 12–13 (`google-drive-backup`, `reminders-and-alerts`)
  bring; this change makes the manual state legible, no more. Flagged for the owner.
- Any change to the `monthly-picture` numbers, the identity `income = spent + invested + saved +
  lent + left`, or the label «Залишилось».
- Enumerating every app on the phone. Package visibility is declared for the known bank packages
  only (`<queries>` by name), never `QUERY_ALL_PACKAGES`.
- Forecasts of any kind (vision §13 / §7: "at this pace you will have X left" stays out).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `month-screen`: an empty month names the previous month and leads to it; «Залишилось» leads only
  when the shown month holds дохід; the category drill-down states the category's сума and its
  overrun.
- `reports-screen`: the month spelled out by default is the newest month of the span holding a сума
  in the shown currency, not simply the newest.
- `main-screen`: opening the Головний tab again shows it from the top.
- `first-run-setup`: the progress line the setup view shows stays legible under the uppercase style.
- `bank-notifications-screen`: the affordance that opens the add form carries one label; the offered
  bank apps are those installed on this phone.
- `monobank-sync-screen`: the moment of the last successful sync is shown, and its absence is said
  plainly.
- `persistence`: the moment of the last successful monobank sync survives a restart.

## Impact

- `src/ui/month-screen.ts` — the empty message gains the previous month's summary; the numbers gain
  a lead flag. `src/app/(tabs)/month.tsx` renders both.
- `src/ui/category-transactions.ts` and `src/app/category/[month]/[categoryId].tsx` — the category's
  own сума and its overrun.
- `src/ui/reports-screen.ts` — the default picked month.
- `src/ui/onboarding.ts` — `onboardingSummary`.
- `src/app/(tabs)/index.tsx` and `src/components/surfaces.tsx` — `Screen` grows an optional way to
  be scrolled back to its top on focus; only Головний uses it.
- `src/app/manage/notifications.tsx`, `src/ui/notification-settings.ts`,
  `src/platform/notification-capture.ts` and `-device.ts` — one label, and `appChoices` filtered by
  what is installed.
- `modules/notification-capture/` — a new native method listing which of the known bank packages
  are installed, plus a `<queries>` block naming them. **A native change: the emulator smoke needs a
  fresh build.**
- `src/db/schema.ts` + a new migration, `src/db/repos.ts`, `src/ui/monobank-screen.ts`,
  `src/app/manage/monobank.tsx` — storing and showing the last successful sync.
- No change to `src/domain/monthly-picture.ts`, `src/domain/limits.ts` or the reports domain.
