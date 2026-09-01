## Context

See proposal.md — Why. The state this design works against:

- `src/ui/month-screen.ts` builds `MonthCurrencyGroup` = six `MonthNumberRow`s in a fixed reading
  order (`spent, invested, saved, lent, income, left`) plus a breakdown; `src/app/(tabs)/month.tsx`
  renders the first row through `ThemedText` type `lead` and adds no decision of its own. The empty
  sentence is decided by `emptyMessageFor` from `groups.length` and whether the month holds any
  транзакція. `src/ui/months.ts` already has `prevMonth`.
- `src/ui/reports-screen.ts:206` already decides the spelled-out month in one place: "the one the
  owner picked, or the newest of the span until they pick".
- `src/ui/category-transactions.ts` has `categoryTransactions` and `categoryMonthHeading` — the
  heading knows the category's name and whether it is over its ліміт, and nothing else.
- `src/ui/onboarding.ts:141` `onboardingSummary` returns «Готово 2 з 4»; the setup view renders it
  as `SectionLabel note=`, i.e. `ThemedText type="overline"`, which is
  `textTransform: 'uppercase'` + `letterSpacing: 1` (`src/components/themed-text.tsx:98`).
- `Screen` (`src/components/surfaces.tsx:29`) is a plain `ScrollView` with no ref out.
- `KNOWN_BANK_APPS` (`src/ui/notification-settings.ts:36`) is a hard-coded list; `appChoices`
  filters it by what is already watched. The capture port
  (`src/platform/notification-capture.ts`) has `setWatched` / `collect` / `acknowledge` and no way
  to ask the device anything.
- `monobank_links` (`src/db/schema.ts:260`) holds `syncStartDate` and `cursorMs`; neither is "when
  the sync last ran". `monobank_accounts.obtainedAt` is when the bank last told us a баланс — moved
  by a client-info fetch as well as by a sync, so it cannot answer the question either.
  `src/monobank/coordinator.ts` (`syncLinkedAccounts`) is where each account's outcome settles as
  `complete` / `invalid-token` / `rate-limited` / `unavailable`.

Constraints that shape everything below: `npm run verify` is Node-only and must never load a
native module or JSX, so every decision this change makes lives in `src/ui/`, `src/domain/` or
`src/db/` where a Vitest test can reach it, and the screens stay wiring. Money stays integer minor
units with a currency code. Migrations are append-only.

## Goals / Non-Goals

**Goals:**

- The two month-boundary decisions land in the pure modules that already own them, so `verify`
  covers the words and the choice, not just the arithmetic.
- The six small items are separable: each is its own task group ending green, and a group that
  turns out to be bigger than it looks can be dropped without holding the rest.
- The one native and the one schema slice are isolated from each other and from the rest, per
  BACKLOG's rule that neither parallelises.

**Non-Goals:**

- Restyling `overline`. One line reads badly under it; every section label in the app uses it.
- A general "scroll position" policy for tabs. Only Головний is asked to reset.
- Any read of the whole stored history on Місяць. The previous month is one extra bounded read.
- Asking the phone for anything beyond the known bank packages.

## Decisions

### D1 — Which number leads is a property of the currency group, not the render order

`MonthCurrencyGroup` gains `lead: NumberKey` and `note: string | null`. `monthView` sets
`lead = 'left'` when that currency's `income.amount > 0`, otherwise `'spent'`, and sets `note` to
the sentence about no дохід exactly when the lead is `'spent'`. The screen renders the row whose
key is `lead` in the `lead` type and the other five under it, in the same order as today.

*Alternatives.* Reordering `NUMBER_KEYS` per group — rejected: the order of the other five is a
reading order the owner learns, and shuffling it makes two months look like two screens. Deciding
it in `month.tsx` — rejected: `verify` never runs JSX, so the choice and its sentence would be
untested.

*Per currency, not per screen*, because the numbers are per currency: a month with UAH дохід and
only USD витрати is honestly two different situations in one screen.

### D2 — The empty month reads exactly one more month, never the history

`month.tsx` loads `transactionsRepo.listMonth(prevMonth(month))` in addition to the shown month —
one more bounded read, only meaningful when the shown month is empty, and cheap enough to do
unconditionally rather than in a second effect. `monthView` takes `previousTransactions` and, when
the shown month holds nothing and the previous month holds something, produces
`previous: { month, label, spent: MonthNumberRow[] }`; the screen renders it and an action that
sets the shown month to `prevMonth(month)` — the same state the back step writes, so there is one
way to be on August.

*Alternatives.* "The newest month that holds something", which needs the whole history on a screen
that today reads one month — rejected as a cost the answer does not repay: a month-shaped gap in
the history is not the case this change is for. Rendering the previous month's six numbers —
rejected: витрачено is the number the owner opens Місяць for, and six of them re-raise the very
«Залишилось» problem this change is fixing.

### D3 — Звіти's default month is decided where the picked month already is

`src/ui/reports-screen.ts` keeps deciding the spelled-out month in one function; the fallback
changes from "the newest of the span" to "the newest month of the span in which витрачено, дохід or
інвестовано is non-zero in the shown currency, else the newest of the span". Because the fallback is
also what a stale picked month falls back to after a currency switch, both spec sentences are one
line of code and one place to test.

### D4 — «Готово 2/4», not a restyled `overline`

`onboardingSummary` returns `` `Готово ${done}/${total}` ``. `/` cannot be read as a digit under
any casing, which is what the requirement asks for; «із» would still be two letters the same style
spaces apart, and dropping `textTransform` from `overline` would restyle every section label in
the app to fix one line.

### D5 — The category's own сума comes from the same breakdown the row came from

`categoryMonthHeading` gains the category's per-currency сума and, when over, the overrun. The сума
is `categoryBreakdown` from `src/domain/monthly-picture.ts` filtered to this category — the same
computation the breakdown row used, so the drill-down cannot disagree with the row that opened it.
The overrun gets a new pure `overLimitBy(spent, limit): Money | null` in `src/domain/limits.ts`
beside the existing `overLimit`, returning `spent − limit` in the ліміт's currency when over and
`null` otherwise, so the "over" test and the "by how much" number can never drift apart.

### D6 — Головний owns its own scroll reset; `Screen` only lends a ref

`Screen` accepts an optional `scrollRef?: React.RefObject<ScrollView | null>` and passes it
through. `src/app/(tabs)/index.tsx` holds the ref and calls `scrollTo({ y: 0, animated: false })`
from `useFocusEffect`.

*Alternative.* A `resetScrollOnFocus` prop handled inside `Screen` — rejected: `Screen` is a
surface in `src/components/`, and teaching it about navigation focus makes every screen in the app
depend on the router through it. This way exactly one screen has the behaviour and the rest are
untouched.

### D7 — One label, kept where `verify` can see it

The label of the affordance that opens the add form moves out of the JSX into
`src/ui/notification-settings.ts` as one exported constant used wherever that affordance is drawn,
with a test asserting the section offers exactly one such label. The current tree holds only
«Додати застосунок» (`src/app/manage/notifications.tsx:248`) — the second label the manual pass saw
is not in the source, so the first task of this slice is to reproduce it on the emulator and find
where it comes from. If it cannot be reproduced, the constant plus its test still satisfies the
requirement by making a second label impossible, and the task says so rather than claiming a fix.

### D8 — Installed apps: a named `<queries>` list, never `QUERY_ALL_PACKAGES`

The port gains `installedAmong(packages: readonly string[]): Promise<readonly string[] | 'unknown'>`;
`'unknown'` is the answer of a platform or build that cannot look — iOS, Expo Go, the in-memory
double unless told otherwise — and the spec's "offer the whole list" hangs off it.
`NotificationCaptureModule.kt` implements it with `PackageManager`, and
`modules/notification-capture/android/src/main/AndroidManifest.xml` gains a `<queries>` block
listing each known bank package by name. `QUERY_ALL_PACKAGES` is a Play-restricted permission this
app has no case for; a named list gives visibility of exactly the packages already hard-coded in
the app and nothing else.

That leaves the same list of packages in two files. A Node-only test reads the manifest as text and
asserts every `KNOWN_BANK_APPS` package appears in its `<queries>` block, so `verify` fails the day
the two drift. `appChoices` becomes `appChoices({ watches, installed })` and keeps every rule it has
(monobank never offered, already-watched apps never offered).

**Native change:** one new module method and one manifest block, both inside
`modules/notification-capture/`. Nothing under `android/` is hand-edited, no new Expo config
plugin, no new permission.

### D9 — The last sync moment is a nullable column on the link, written on `complete` only

`monobank_links` gains `last_synced_at INTEGER` (`timestamp_ms`, nullable) by a new append-only
migration (`ALTER TABLE ... ADD COLUMN`), so existing rows keep everything and read back with no
moment. The repo gains `markSynced(monobankAccountId, at)`, called from
`src/monobank/coordinator.ts` for each account whose outcome settles as `complete`.

*Not inside `commitStatementAnswer`.* That call is one statement answer, and monobank paginates: an
account that is rate-limited halfway would have committed pages and would then claim a completed
sync. The moment is not money — it does not belong in the atomic money transaction, and keeping it
out is what makes the "a failed run leaves the moment alone" scenario true.

*Not `monobank_accounts.obtainedAt`.* It moves on a client-info fetch too, so it answers "when the
bank last told us a balance", not "when a sync last completed".

*On the link, so unlinking removes it,* which is what the persistence delta says: a link is the
thing that syncs, and a relinked account has not synced under its new boundary.

### D10 — Showing the moment needs a formatter the app does not have

`src/ui/dates.ts` gains a pure `momentLabel(ms: number, now: Date): string` — a Ukrainian date and
time of day for the last sync, computed from the passed `now` like every other date rule in this
app, never from an ambient clock. `src/ui/monobank-screen.ts` produces the per-account line and the
screen's own last-sync line (the maximum of the accounts' moments), including the two "has not
synced yet" sentences; `src/app/manage/monobank.tsx` renders them.

### D11 — Task grouping

Seven groups, each ending on a green `npm run verify`, in this order:

1. Місяць: the leading number (D1).
2. Місяць: the empty month's pointer at the previous one (D2).
3. Звіти: the default spelled-out month (D3).
4. The three one-file items: «Готово 2/4» (D4), the category drill-down (D5), the Головний scroll
   reset (D6).
5. Notifications: one label (D7).
6. Notifications: installed apps — native (D8).
7. monobank: the last sync moment — schema + migration (D9, D10).

Groups 1–2 both edit `src/ui/month-screen.ts` and `src/app/(tabs)/month.tsx`, so they are
sequential. Groups 5 and 6 both edit `src/ui/notification-settings.ts`. Group 6 (native) and group
7 (migration + `package`-free schema change) are the two that never parallelise with anything, per
BACKLOG.

## Risks / Trade-offs

- **The «Додати» label cannot be reproduced** → D7 pins the label so a second one cannot appear,
  and the task reports "not reproduced" rather than "fixed". A requirement satisfied by
  construction is still satisfied.
- **`<queries>` needs a fresh native build, so the emulator smoke cannot use an existing APK** →
  group 6 is the one slice whose smoke starts from `scripts/android.sh` rebuilding; called out in
  its tasks so it is not discovered at smoke time.
- **A known bank app installed under a package not in `<queries>` reads as "not installed"** →
  the hand-named package field stays, unchanged, and is the documented way through. The manifest
  test keeps the two lists together, which is the failure mode that would actually bite.
- **`markSynced` outside the money transaction can be lost if the app dies between the commit and
  the mark** → the moment then stays older than the truth. Under-reporting a sync is the safe
  direction: the owner syncs again, and nothing about money is affected.
- **Leading with витрачено hides «Залишилось» from a quick glance in the days before the first
  дохід** → it is shown, named, under the lead, with a sentence saying why it is not leading. The
  alternative — leading with a structurally negative number — is what §15 says must not happen.
- **Two of the six small items (installed apps, last sync) are much larger than the other four** →
  D11 puts each in its own group so the four cheap ones land whatever happens to the two expensive
  ones.

## Migration Plan

One new Drizzle migration, generated by `npm run db:generate` from the `last_synced_at` column
(D9) — additive, nullable, no backfill: every existing link reads back as "has not synced yet",
which is true of what the device can prove. Committed migrations are untouched. Rollback is
`git revert` before release; the column is nullable and unread by older code, so a database that
has seen it still opens on a build that has not.

## Open Questions

- Whether the app should sync monobank on its own, and on what trigger. Deliberately out of this
  change (proposal — Non-goals): it needs the background scheduling that steps 12–13 introduce,
  and monobank's one-request-a-minute limit makes the trigger a decision in itself. Making the
  manual state legible does not foreclose any answer.
