## Why

The app is fast on a fresh install and slows down as the history grows, because every read is
synchronous SQLite on the JS thread and almost every screen re-derives everything from the whole
history on every focus. A code audit (2026-09-29) found the whole stored history read, mapped and
folded into balances on each focus of Головний, Рахунки and Звіти. On Android all five tabs mount
at launch, so that happens three times before the first tap. The «Транзакції» search re-reads the
narrowed history on every keystroke, and each tap on a month column in Звіти recomputes the whole
report. A thousand-транзакція рахунок already produced one freeze bug report (2026-09-29). At the
tens of thousands of транзакції a few years of monobank sync bring, the owner feels this as a
hitch after every tab switch, every back swipe and every save.

This does not add a feature for either vision problem (where money went / how much is left). It
keeps both answers one glance away as the history grows, which is the condition for using the app
daily at all. Nothing the owner reads changes, only how soon it is there. The one visible
difference is a single empty frame the first time each tab is opened after launch (design D4);
`app-motion-pass`'s tab fade hides it when that change lands first or together with this one.

## What Changes

- **One in-memory memo of the stored history** replaces the per-screen whole-history reads. It holds the
  stored транзакції, each рахунок's balance and the months that hold транзакції. It is rebuilt only
  when storage itself says something changed: this connection's change counter moved, or another
  connection (the background прогін or the Drive бекап) committed. So it can never be stale.
  Головний, Рахунки, Звіти, a ціль, the «Транзакції» month list, AI-аналіз and the Saldo import
  read from it instead of listing the history. Nothing new is stored. This is a memo of reads,
  keyed on storage's own change stamp, not a cached total. The "no cache" rule was set to prevent
  stale numbers, and this design keeps that guarantee (design D1).
- **Статок and цілі reuse the balances already computed** instead of folding the whole history
  again for every рахунок (today about O(рахунки × транзакції) per Головний focus and per tap on a
  history chip).
- **Only a tab the owner opens reads storage.** A tab mounted in the background reads on its first
  focus, not at launch as well.
- **A screen out of sight does not re-read** on sync starts, sync ends or captured notifications.
  It remembers that something changed and reads once when it comes back into sight. The reload at
  sync *start* goes away: nothing is written at that moment.
- **Work that follows a save or the launch waits for the screen.** Re-evaluating прогрес after a
  write, the starter-set seed and icon fill, the notification drain, the monobank sync kick-off and
  a due бекап run after the tap's transition or the first frame, not inside it.
- **«Транзакції» search:**
  - What is typed shows at once, and the search runs once typing pauses.
  - «Показати ще» reads only the next page instead of every page again.
  - The unsearched listing is paged by storage itself.
  - Whether a категорія is over its ліміт is judged from the stored-history memo instead of one
    month read per month shown.
- **Long lists draw only what is near the screen:** «Транзакції», a рахунок's транзакції and a
  категорія's month. Rows that did not change are not redrawn, and neither are widgets on Головний
  whose data did not change.
- **Звіти:** tapping a month, a category or a currency re-derives only the selection. The history
  series stay derived once per read.
- **Two indexes** by a new append-only migration: транзакції by категорія (the «Без категорії»
  count on every Головний focus, category search, limits), and the newest-first order
  (date, recording moment, id) that every listing sorts by.
- **Smaller fixes:**
  - The awaiting-зустрічний-дохід lookup reads its tiny table whole instead of binding every
    переказ id. This removes a latent failure past SQLite's bound-parameter ceiling.
  - Рахунки and a рахунок read their monobank links in one query rather than one per link.
  - A правило save matches транзакції by id through a map, not a scan per move.
  - AI-аналіз «показати файл» no longer lays out the whole export as one text block.
  - The day-rollover check runs only while Головний is in sight.

**Non-goals**: no new stored totals or cache tables (the memo lives in memory only). No change to
any number, order, wording or rule the owner sees. No new dependency, native module or
permission, and no change to background scheduling. No virtualization of short lists (manage
lists, rules, progress). No switch from synchronous to asynchronous SQLite: its cost is known and
contained by reading less. No `react-native-screens` freeze (see design D8). Animations are the
separate change `app-motion-pass`. Vision §14 is not touched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `persistence`: reads repeated between writes are answered from memory. A write through any
  path, including another connection, is seen on the next read. Served balances equal balances
  from the whole history. Category lookups and the newest-first order are served by an index that
  arrives by an append-only migration.
- `app-shell`: an unopened tab reads nothing. A screen out of sight defers its re-read to its next
  focus. Follow-up work after a save or at launch does not hold up the tap or the first frame. Long
  lists draw only what is near the screen.
- `transaction-search`: typing is never held up by the search, and showing more reads only what it
  adds.
- `reports-screen`: choosing a month, category or currency re-derives only what the choice
  changes.

## Impact

- **New:**
  - `src/db/stored-history.ts` (+ test): the memo, its change stamp and its derived balances and
    months.
  - `src/ui/read-policy.ts` (+ test): the pure "read now / defer / skip" decision the reload hook
    applies.
- **Changed, read path:**
  - `src/hooks/use-reload-on-focus.ts`: lazy first read, dirty-on-blur.
  - `src/db/transactions-repo.ts`: `withAwaiting`, SQL paging for the unsearched listing.
  - `src/db/rules-repo.ts`.
  - `src/domain/net-worth.ts` and `src/domain/goals.ts`: take balances instead of recomputing
    them.
  - `src/ui/reports-screen.ts`: the history part is split from the selection part.
- **Changed, screens:**
  - `src/app/(tabs)/index.tsx`, `accounts.tsx`, `reports.tsx`
  - `src/app/transactions.tsx`, `account/[id].tsx`, `category/[month]/[categoryId].tsx`,
    `goal/[id].tsx`, `ai-analysis.tsx`, `manage/saldo-import.tsx`
  - `src/app/_layout.tsx`: staggered launch chores
  - `src/components/transaction-row.tsx`, `icon.tsx`, `net-worth-widget.tsx`,
    `category-widget.tsx`: memoized
- **Schema:** `src/db/schema.ts` gains two indexes, plus one generated migration under `drizzle/`
  and its test. No column, table or backup-format change. `BACKUP_SCHEMA_VERSION` still goes from
  4 to 5, because the standing rule (`src/backup/format.ts`, enforced by `format.test.ts`) is that
  it equals the number of committed migrations. A бекап holds exactly what it held before; the one
  effect is that a build before this change refuses a бекап written by this one, as it would after
  any migration.
- **Docs:** the doc comments in `use-reload-on-focus.ts` and `src/db/repos.ts` ("no store and no
  cache") are rewritten to describe the stamp-keyed memo.
