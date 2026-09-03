## Why

A hand-driven pass over the whole app on the emulator — онбординг → рахунки → імпорт Saldo →
транзакції → звірка → місяць/звіти → категорії → monobank → репорт про помилку — found nine
defects. None of them is a wrong сума and none of them loses money: every one is the app saying
or showing something that is not true of the state it is in.

They are carried as one change because they are one kind of fault and because seven of the nine
are a two-line fix behind a spec sentence that was never written. Splitting them into nine changes
would cost more reading than the fixes themselves.

What the pass found, grouped by what is actually wrong:

**The app says something ungrammatical.** «Буде записано: 5 транзакцій, 2 рахунків, 3 категорій,
1 джерел» — the Saldo import's plan and result lines are hard-coded in the genitive plural
whatever the number is. `plural()` has lived in `src/ui/labels.ts` since `backup-file`, three
other screens use it, and the import was written past it. Its own comment names this exact bug:
«two hand-rolled two-form guesses in one app is how «2 рахунків» happens».

**The app throws data away without saying so.** Saldo's `Description` column — the merchant name
on every row of a real export — is parsed, carried through `SaldoTransaction`, and then never
read by `src/saldo/interpret.ts`. The `опис` is a field cap1tal already has on every транзакція,
the AI-аналіз groups by it as the продавець, and the one-time move that is supposed to bring the
owner's history over drops all of it silently.

**The app offers something that does not apply.** Editing a транзакція and switching its «Тип»
from «витрата» to «переказ» leaves «Сканувати QR чека» standing: the offer is computed from the
stored транзакція, not from the type the form is showing. And on monobank, «Синхронізувати»
without a token draws «Повторити незавершене» — a retry for a run that never started, which on tap
repeats the same «Спершу введіть токен».

**The app cuts off what it is showing.** The Налаштування tab reads «Налаштуван…» — the only one
of the five that does not fit. On «Звіти», the pill marking the picked month sits half past the
right edge of the history chart, because the chart opens scrolled to its left while the month it
marks is its last column.

**The app repeats itself.** On an empty «Рахунки» the header «+» and the empty state's «Створити
рахунок» are two controls, one of them wordless, carrying the same accessible name for the same
action.

**The app misreports its own provenance.** Every репорт про помилку built from an `auto-work` lane
says «дерево було брудне» on a spotless tree: `app.config.js` runs a bare `git status --porcelain`,
and the lane's `node_modules` symlink shows up as `?? node_modules` because `.gitignore` writes
`node_modules/` with a trailing slash, which does not match a symlink. Two independent faults, both
one line, and together they make the one field of a репорт that answers «which tree was that?»
lie on every lane build.

The pass also cleared four suspicions, recorded here so nobody spends the time again: a positive
коригування counted as «Дохід» is the spec's own rule; «1 місяць» in the AI-аналіз over a
three-month period counts months holding data, correctly; the tab bar does not vanish when the
first рахунок is created; and the Saldo double-entry maths, kind detection, merging and balance
звірка were recomputed by hand and agree.

## What Changes

- **Counts read as Ukrainian.** The Saldo import's «Буде записано» and «Записано» lines take the
  form the number asks for. The rule already exists in `src/ui/labels.ts`; this adds the two nouns
  it lacks (категорія, джерело) and puts both lines under it, in `src/ui/saldo-import.ts` where
  `verify` can prove them. Stated once, for every count the app draws.
- **The опис survives the import.** Every транзакція `src/saldo/interpret.ts` builds carries the
  опис of the Saldo row it was built from, trimmed, absent when the column is empty — витрата,
  повернення, дохід, коригування, both shapes of переказ, and the комісія split off a transfer.
  Nothing else about the import moves.
- **The чек offer follows the form, not the store.** `receiptOffer` is asked about the type and
  категорія the form is currently showing, so switching «Тип» to переказ withdraws the scan offer
  before the save rather than after it. A чек already attached still shows, whatever the type has
  become — that rule is unchanged.
- **A run that never started is not offered a retry.** With no token configured, monobank offers
  entering one; «Повторити незавершене» is kept for a run that got as far as leaving work
  unfinished.
- **A refusal goes when what it refused is answered.** The репорт form's «Напишіть, що ви
  робили…» disappears as soon as «Що я робив» holds something, instead of waiting for the next
  «Зберегти».
- **The tab bar shows every tab's name whole.** «Налаштування» is the tab's name in
  `settings-screen` and stays it; the labels are sized so the longest of the five fits.
- **The marked month is fully visible.** The history chart opens scrolled to the column it marks,
  and neither chart lets a pill sit under its own clipping edge.
- **One control creates the first рахунок.** While the empty state says it in words, the header
  «+» stands down; with рахунки on screen it is the only offer. Never two names for one action.
- **A build says «брудне» only about itself.** `app.config.js` asks git about the paths the bundle
  is actually built from, and `.gitignore` ignores `node_modules` whether it is a directory or a
  symlink.

Non-goals, deliberately:

- **No renaming and no re-wording of anything the specs fix.** «Налаштування» stays «Налаштування»;
  the fix is the label's size, not its text.
- **Not the «репорт звідси» sheet's own refusal.** `src/components/bug-report-here.tsx` holds its
  own refusal state and has the same stale-red-line fault; it belongs to `bug-report-here` (26/40,
  in flight in the same tree) and the amended sentence here sits inside the репорт *form's*
  requirement, which is the surface this change touches. Filed separately.
- **No new опис anywhere else.** monobank and the bank сповіщення already set their own; this
  change touches only the Saldo path, which set none.
- **Nothing about what the Saldo import means** — which рахунок moves, by how much, what merges,
  what the звірка compares. The опис is carried; no другий number and no new транзакція.
- **No re-layout of «Звіти» or «Рахунки».** The charts keep their shape; only what is scrolled
  into view and which control is drawn change.
- **No retaking of `docs/screens/`.** The tab bar shows in all thirty-one of them and the label
  size changes it; retaking the set is its own job, not this one's. The smoke pass of task 6.4
  carries the screenshots that prove these three fixes.
- **Not the English text of the звірка report** — BACKLOG carries that as its own item.

## Capabilities

### New Capabilities

None. Every rule here belongs to a capability that already exists, or — for the чек offer — to
`fiscal-receipts-screen`, whose change is in flight in the same tree.

### Modified Capabilities

- `app-shell`: two requirements added — that a count the owner reads carries the Ukrainian form
  its number asks for, and that the tab bar shows each of its five names in full.
- `saldo-import`: one requirement added — the опис of a Saldo row travels onto every транзакція
  built from it, and onto nothing else.
- `saldo-import-screen`: one requirement added — the plan and result lines state their four counts
  in the right form.
- `fiscal-receipts-screen`: one requirement added — the scan offer answers the type and категорія
  the form is showing, not the stored ones. Its base requirement (`fiscal-receipts`, in flight)
  says which types are offered a scan; this says *which* type is asked.
- `monobank-sync-screen`: "Sync progress and every terminal outcome are understandable and
  retryable" amended — a run that never started because no token is configured is a setup state,
  not unfinished work, and is offered token entry rather than a retry.
- `bug-report-screen`: "The form asks for three lines and saves on one" amended — the refusal is shown
  while it is still true and no longer.
- `bug-report`: "A репорт про помилку is what the owner wrote plus what the app attaches" amended —
  «whether the working tree was clean» is defined against the sources the bundle is built from.
- `accounts-screen`: "An account can be created from the screen" amended — exactly one control
  offers creating, and it carries one name.
- `reports-screen`: "One month of each chart is spelled out in full" amended — the mark on the
  picked month is fully visible, which on a chart wider than the screen means scrolled into view.

## Impact

- `src/ui/labels.ts` — `categoryCount` and `sourceCount` beside the two count helpers already there.
- `src/ui/saldo-import.ts` — `planLine` and `writtenLine`, the two sentences the screen draws.
- `src/app/manage/saldo-import.tsx` — draws those two instead of building them inline.
- `src/saldo/interpret.ts` — the опис carried onto every транзакція it builds.
- `src/ui/receipt-screen.ts` — `receiptOffer` takes the type and категорія rather than a
  `Transaction`; `src/app/transaction/[id].tsx` hands it the form's own.
- `src/ui/monobank-screen.ts` — `syncSummary`'s `retryOffered` for a run that never ran.
- `src/ui/bug-report-screen.ts` — `formState` drops a refusal its fields have answered.
- `src/components/app-tabs.tsx` — the label size; `src/app/(tabs)/accounts.tsx` — the header «+»;
  `src/app/(tabs)/reports.tsx` — the history chart's opening scroll and the charts' end padding.
- `app.config.js` and `.gitignore` — the build's own honesty about its tree.
- **Emulator, not `verify`:** the tab label, the chart scroll and the «+» are layout. They are
  proven by the smoke pass of task 7, with screenshots, and by nothing else.
- **In flight, same tree:** `fiscal-receipts` (25/30) owns `src/ui/receipt-screen.ts` and the
  requirement this one adds beside; `goals-scope-and-caps` owns `src/ui/goal*`, `src/db/goals-repo`
  and `src/app/(tabs)/reports.tsx`'s цілі block — a different block of the same file.
  `saldo-import-compact-map` owns the map step of `src/app/manage/saldo-import.tsx`; the two
  sentences this change moves are on the report and done steps.
- Unchanged on purpose: `src/domain/**`, `src/db/**`, `drizzle/`, `src/saldo/{parse,survey,verify}.ts`,
  `app.json`, `modules/`.
