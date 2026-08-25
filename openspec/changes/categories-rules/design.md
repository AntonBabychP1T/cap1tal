# categories-rules — design

## Context

See proposal.md for why. Current state that shapes the how:

- `src/domain/transaction.ts` already exports the reserved ids (`FEES_CATEGORY_ID = 'fees'`,
  `CORRECTION_CATEGORY_ID = 'correction'`, `UNCATEGORISED_CATEGORY_ID = 'uncategorised'`) and
  every stored transaction so far carries only those — manual entry offered nothing else.
- `transactions.category_id` / `source_id` are plain TEXT columns; the schema comment promises
  they become references "with categories-rules". `database.md`: every reference is a real
  foreign key; committed migrations are immutable; migrations are produced only by
  `npm run db:generate`.
- `src/ui/labels.ts#categoryLabel` maps the three reserved ids to their Ukrainian labels and
  falls back to the raw id — the designed seam for the editable list to slot into.
- `monthly-picture` is in flight in a parallel session and owns `schema.ts` (migration 0002),
  `app-tabs.tsx`, `labels.ts` and the month screen. This change was written to start only after
  it was archived; the owner decided on 2026-08-24 to run the two in parallel instead. Our
  migration is 0003, generated on top of its uncommitted 0002 — if `monthly-picture`'s remaining
  review forces a schema change, 0002 is regenerated and 0003 must be regenerated with it (and
  its hand-added rows put back — decision 4). Commit and archive order is fixed in tasks 9.3/9.4.
- The starter set was extracted once from the owner's Saldo export (untracked, repo root) —
  25 live expense categories, 12 income sources; the technical Saldo rows (Balance correction,
  Uncategorised expense/income, Fees) map onto the reserved rows instead of being seeded, and
  «Борг» is deliberately not seeded (debt = transfers, step 6).

## Goals / Non-Goals

**Goals:**

- Three new tables and the FK graduation in one append-only migration, with the existing rows
  provably surviving.
- Seeding that can never fight the owner: create-if-missing only, safe to run on every open.
- Rule matching as a pure, importer-agnostic domain function steps 6–8 can call unchanged.

**Non-Goals:**

- No rule application anywhere in this change; no merchant/MCC columns on transactions (the
  importers own raw import data).
- No limit field on categories (step 9 adds it with its own migration).
- No changes to `app.json`, no new native module, no new permission, no new dependency.

## Decisions

1. **Seed the starter set on open, not in the migration.** The root layout already runs
   migrations at startup; a `seedStarterSet(db)` step runs right after, doing `INSERT OR IGNORE`
   by primary key for every starter row. "Right after" is an effect, so it is not before the first
   screen read: `useReloadOnFocus` reads during render and a child renders before the root
   layout's effect. On a fresh install the first paint can show only the reserved rows, and the
   next focus has the list. Nothing is recordable in that window — a fresh install has no рахунок
   — so it costs nothing, but the seed is not a precondition of the first render and the code says
   so. Alternative — the whole starter set appended to the
   generated migration — rejected: a data-bearing migration cannot be idempotent against the
   owner's later renames and archives, and `INSERT OR IGNORE` by id is what makes "never changes,
   restores or duplicates" trivially true. The persistence scenario "fresh database from
   migrations alone stores every list" needs only the tables, not the seed rows.

   **The three reserved rows are the exception and live in the migration** (see decision 4): they
   are the only rows a stored transaction can already reference, they can never be renamed or
   archived, so there is nothing for the seed to protect and nothing for the migration to fight.
   `seedStarterSet` still lists them; its `INSERT OR IGNORE` finds them already there.

2. **Starter set as one committed data module**, `src/db/starter-set.ts`: `{ id, name }` rows
   with stable human-readable slug ids (`groceries`, `coffee`, …, `salary-mono`,
   `batky-andriy`, …). The three reserved rows take their ids from the domain constants, names
   «Без категорії», «Комісія», «Коригування». Stable slugs matter because saldo-import (step 6)
   and backup (step 11) will address these rows by id. The seed and the tests read the same
   module — the spec's list is the truth, the module is its one representation in code.
   Ids are per table, not global: «Gifts» and «KrayShop» are on both lists, so `gifts` and
   `krayshop` name a category *and* a source. Anything addressing a row by id — import, backup —
   says which of the two tables it means.

3. **Flattening «батьки → Андрій, Лена»**: three top-level sources — «батьки» (it has direct
   history in Saldo), «батьки — Андрій», «батьки — Лена». Alternative — merging the children
   into one «батьки» — rejected: the owner tracked the two apart on purpose, and merging is
   irreversible at import time while renaming is one tap.

4. **FK graduation by table recreate, with the reserved rows inserted first.** `db:generate`
   against the edited schema emits SQLite's recreate pattern for `transactions` (new table with
   the FK columns → `INSERT … SELECT` → drop → rename) plus plain `CREATE TABLE` for
   `categories`, `sources`, `rules`. This is the "new table plus a data copy" shape
   `database.md` allows. `onDelete: 'restrict'` on both new references, same as the account
   references. Alternative — repo-level checks over plain TEXT — rejected: `database.md` is
   explicit, and the persistence spec now demands the rejection at storage level.

   The generated `PRAGMA foreign_keys=OFF` around that recreate **does nothing**, and this was
   found by running it, not by reading it: Drizzle's migrator wraps every migration in one
   `BEGIN`, and SQLite documents `PRAGMA foreign_keys` as a no-op inside a transaction. So the
   copy is checked against the new foreign key, and on any device that has ever recorded a
   витрата (`category_id = 'uncategorised'`, or `'fees'` from an accepted комісія) it fails with
   `SQLITE_CONSTRAINT_FOREIGNKEY` and the app never opens its storage again. Seeding on open
   cannot help: it runs after the migrator, and the migrator has already rolled back.

   Therefore migration 0003 carries three hand-added `INSERT`s — «Без категорії», «Комісія»,
   «Коригування» under the reserved ids — placed after the three `CREATE TABLE`s and before the
   recreate. This is the one hand-authored part of a generated migration; `database.md` already
   contemplates data-bearing migrations ("a migration that moves data needs a test with
   representative rows before and after"), and `drizzle/migrations.js` imports the `.sql` file
   rather than inlining it, so nothing has to be kept in sync by hand. The persistence
   requirement's own wording — the reserved ids "SHALL satisfy the new references once the
   reserved rows exist" — is what this makes true at the only moment it can be.

5. **Table shapes.**
   - `categories(id TEXT pk, name TEXT NOT NULL, archived BOOLEAN NOT NULL DEFAULT 0)`;
     `sources` identical. No `reserved` column — reservedness is `id ∈` the three domain
     constants, decided in code; a column could drift from the constants.
   - `rules(id TEXT pk, merchant TEXT NULL, mcc INTEGER NULL, category_id TEXT NOT NULL
     REFERENCES categories RESTRICT, created_at INTEGER NOT NULL)` with
     `CHECK (merchant IS NOT NULL OR mcc IS NOT NULL)` and `CHECK (merchant IS NULL OR
     length(trim(merchant)) > 0)`. `created_at` is the matching tie-breaker, so it is domain
     data here, not storage metadata.
   - Duplicate-name rejection lives in the repos (trimmed, exact match against unarchived rows
     of the same list) — a partial unique index cannot express "unarchived only" portably enough
     to be worth the migration surface, and the repo is the only writer.

6. **Reserved-row protection lives in the repos**: rename/archive of a reserved id throws.
   The DB cannot know the constants; the repo is the single writer; the settings screen simply
   never offers the actions (spec: "offers neither rename nor archive").

7. **Matching is a pure function** in `src/domain/rules.ts`:
   `matchRule(rules, { description, mcc? }) → categoryId | undefined`. Tiering (both >
   merchant-only > MCC-only), longest-pattern, newest-created — exactly the spec, no I/O, no
   locale surprises (case-insensitivity via `toLocaleLowerCase('uk')` on both sides). Two rules
   created in the same millisecond still resolve deterministically: the final tie-break is the
   rule id, so ordering never depends on load order. Importers in steps 6–8 load rules once and
   call this per transaction.

8. **Screens.** `src/app/(tabs)/settings.tsx` is a section menu; the lists live at
   `src/app/manage/categories.tsx`, `sources.tsx`, `rules.tsx` (stack routes, like
   `transaction/[id]`). `manage/`, not `settings/`: the tab file owns `/settings`, and the
   codebase already refuses that overlap once — the category drill-down is at `/category/…`
   "because the Місяць tab already owns `/month`". The two list screens are the same list twice,
   so the list is one component, `src/components/manage-list.tsx`, and the two routes are the
   repo wiring around it. One new tab trigger in `app-tabs.tsx` / `app-tabs.web.tsx`; icon
   `assets/images/tabIcons/settings.png` + `@2x`/`@3x`, monochrome like its neighbours. All
   list/validation logic is pure in `src/ui/` — `category-choices.ts` (what a picker offers),
   `list-management.ts` (the management lists and the rule form), `entry-form.ts` (recording) and
   `retype.ts` (what each retype produces) — so screens stay thin and every decision is under
   `verify`, which never runs JSX. Those are the names tasks 6.2–6.6 use; there is one set.

9. **Entry form gains a four-way type switch** — витрата (default) / переказ / дохід /
   повернення — reusing the existing amount parsing unchanged. дохід and повернення get
   required pickers (джерело / category) with no default, per the main-screen delta;
   the витрата picker defaults to «Без категорії». One-tap categorisation from the feed is a
   picker anchored to the highlighted row that calls the same update path as editing.

10. **`categoryLabel` becomes data-driven**: screens load the category/source lists and pass a
    `Map<id, name>` into the pure helpers; the raw-id fallback stays for an id that misses the
    map (can only be transient state, but the fallback keeps it honest).

## Risks / Trade-offs

- [monthly-picture may still reword the month-screen requirement before archiving] → before
  `/opsx:apply`, diff our `specs/month-screen/spec.md` delta against the archived main spec and
  reconcile with `/opsx:update` if it drifted.
- [Recreate migration runs on the owner's real data] → the migration test stores representative
  pre-migration rows (reserved-id expense, fee expense, transfer) through the previous
  migrations, applies 0003, asserts them unchanged; `PRAGMA foreign_key_check` clean after
  seed. This risk turned into a real failure during implementation — see decision 4 — and the
  test is what pins the fix.
- [App killed between migration and seed] → seed is per-row `INSERT OR IGNORE`; the next open
  completes it. Until then only writes referencing missing rows fail — and the UI cannot issue
  them before the lists load.
- [Case-insensitive duplicate names are allowed] → accepted; the spec rejects exact duplicates
  only, and the owner curates their own list.
- [Two write paths disagree about `originalAmount`, and the next change inherits it] → saving
  through `buildEntry` (the editing screen) drops an expense's merchant-currency figure, while
  `recategorise` (the feed's one tap) keeps it. Both are in this change, and neither is reachable
  today: nothing can store an `originalAmount` until an importer lands. **saldo-import (step 6) and
  monobank-sync (step 7) must settle it before they store one** — otherwise opening an imported
  витрата and re-saving it silently loses a figure `rules/domain.md` calls informational. The fix
  belongs there, with a scenario, not here as a guess about what an importer will want.
- [The MCC rule is stated twice] → `ruleFromDraft` refuses a non-digit string (what the owner
  typed) and `rulesRepo.save` refuses a non-integer number (what the domain value holds). Two
  layers, two shapes of the same input, two messages — deliberate, and both tested under the
  scenario's own name. Accepted: collapsing them would mean either the repository trusting the
  form, or the form parsing on the repository's behalf.
- [Longest-pattern tie-breaking may still surprise] → the rules list in Налаштування shows
  every rule; matching is deterministic and unit-tested per tier, which is as explainable as v1
  needs.

## Migration Plan

One migration, `drizzle/0003_*`: three `CREATE TABLE`, the three reserved category rows, then
the `transactions` recreate. Generated by `npm run db:generate`; the three `INSERT`s are added to
it by hand, for the reason decision 4 gives, and nothing else in it is hand-written. Committed
0000–0002 untouched. No rollback path — append-only history; a mistake is fixed by a further
migration.
