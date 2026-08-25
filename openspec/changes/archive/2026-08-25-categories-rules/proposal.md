# categories-rules

## Why

*"Where did my money go"* is answered in category words, and the app still has only three of
them — the reserved «Без категорії», «Комісія», «Коригування». Every manual витрата lands in
«Без категорії» because there is nothing else to pick; дохід and повернення cannot be recorded
at all, so the monthly picture truthfully shows дохід = 0 and залишилось sinking below zero.
This change (step 5 of tech-task §5) seeds the owner's real category list, lets them record the
remaining manual transaction types, and stores the автокатегоризація rules the import steps
(6–8) will run imports through.

## What Changes

- **Categories and sources become data**: a flat, editable list of expense categories and a flat
  list of income sources (FR-C1), stored on the device. The starter set is the owner's own Saldo
  list, extracted from the Saldo export in the repo root: 25 expense categories (Home, Groceries,
  Transport, … verbatim) and 12 income sources (Salary, Freelance, батьки, … with the one nested
  source «батьки → Андрій, Лена» flattened into qualified top-level sources). Editing is
  create / rename / archive — the same verbs accounts already have; nothing referenced by history
  is ever deleted.
- **The three reserved category ids get their rows** (recorded obligation from domain-core): the
  seeded list includes «Без категорії» (`uncategorised`), «Комісія» (`fees`) and «Коригування»
  (`correction`) under exactly the reserved ids the domain already uses, so every stored
  transaction that carries a reserved id resolves to a real row — including a коригування, whose
  attribution to the seeded row is tested. Reserved rows can be neither renamed nor archived:
  the domain and the fee/retype flows depend on them.
- **Recording дохід and повернення** from the Головний screen (the rest of FR-S1): дохід with
  сума, рахунок and джерело; повернення with сума, рахунок and the category it returns to.
  Editing gains retyping among витрата ↔ повернення ↔ дохід alongside the existing ↔ переказ.
- **The category picker goes live**: a manual витрата still defaults to «Без категорії», but the
  owner can now pick from the real list. «Без категорії» transactions are highlighted in the feed
  and categorised in one tap without opening full editing (FR-C3).
- **Правила автокатегоризації are stored and editable** (FR-C2): "merchant / MCC → category"
  rules with deterministic matching (specified and tested as pure behaviour). No importer exists
  yet, so nothing applies them to live data — steps 6–8 wire them to Saldo CSV, monobank and
  notifications respectively.
- **A new «Налаштування» tab** (`docs/tech-task.md` §1, screen 5), last in the tab order, hosting the three
  management lists this change needs a home for: Категорії, Джерела, Правила. Later steps extend
  the same screen (token, backup, ліміти, цілі).
- **Schema**: three new tables (categories, sources, rules) in one new migration; committed
  migrations stay untouched. `transactions.category_id` / `source_id` graduate from plain TEXT
  to real foreign keys via the table-recreate pattern with a data copy — existing rows carry only
  reserved ids, which the seeded rows satisfy.

### Non-goals (deliberately out of scope)

1. **Applying rules to anything** — there is nothing to apply them to until saldo-import (6),
   monobank-sync (7) and bank-notifications (8). Likewise FR-C3's "запропонувати створити
   правило" after a one-tap categorisation: a manual transaction has no merchant or MCC to build
   a rule from, so the proposal flow arrives with the importers.
2. **Recording коригування** stays impossible until step 7 (звірити). The seeded «Коригування»
   row exists now and the domain's attribution to it is tested.
3. **Ліміти and red categories** (FR-L, step 9); no limit field on a category yet.
4. **The Saldo category «Борг» is not seeded**: lending is transfer semantics onto debt accounts
   (vision §4), and saldo-import (step 6, FR-X3) maps that history onto рахунки-борги.
5. **No hierarchy, no tags** (vision §13); deleting categories/sources is out — archive only.
6. **Звіти tab** (step 9) — the tab order gains only Налаштування.

## Capabilities

### New Capabilities

- `categories`: the flat editable lists — expense categories and income sources; the seeded
  starter set; the reserved rows under the reserved ids; rename/archive semantics and what
  archiving means for pickers and history.
- `categorisation-rules`: the stored "merchant / MCC → category" rules — their shape, editing,
  and the deterministic matching behaviour importers will call.
- `settings-screen`: the «Налаштування» tab — where it sits and the three management lists it
  hosts.

### Modified Capabilities

- `main-screen`: the витрата category picker replaces the hardcoded «Без категорії»-only clause;
  recording дохід and повернення; one-tap categorisation of highlighted «Без категорії»
  transactions from the feed; retyping extended to дохід and повернення.
- `month-screen`: the breakdown and the category drill-down show names from the editable list
  (the "until the editable category list arrives" clause resolves); archived categories still
  show wherever their history is.
- `persistence`: categories, sources and rules survive a restart; a fresh database seeds the
  starter set on first open, idempotently — the owner's renames and archives are never undone;
  a transaction referencing an unknown category or source id is rejected; pre-migration
  transaction rows survive the foreign-key migration unchanged.

## Impact

- `src/db/schema.ts` + one generated migration (three tables, FK recreate of `transactions`) +
  seed-on-open; `src/db/` repos for categories, sources, rules — the two list repos over one
  shared `src/db/named-list-repo.ts`, since the capability states their rules once.
- `src/domain/` — `category.ts` (the `Category` and `Source` types, the reserved id set and the
  list filters the glossary already names) and `rules.ts` (rule matching as a pure function);
  `src/db/starter-set.ts` — the seeded lists.
- `src/ui/` — `categoryLabel` resolves from loaded rows (falling back to the raw id), pickers,
  entry-form logic for дохід/повернення, one-tap categorisation and management-list logic; all
  pure and tested.
- `src/app/(tabs)/settings.tsx` + `src/app/manage/` sub-screens (the tab owns `/settings`, exactly
  as the Місяць tab owns `/month`); `src/app/(tabs)/index.tsx`
  entry form and feed; `src/app/transaction/[id].tsx` retype; `app-tabs.tsx` / `app-tabs.web.tsx`
  one new trigger each; `assets/images/tabIcons/settings.png` (+`@2x`/`@3x`).
- **Coordination**: `monthly-picture` is in flight in a parallel session and owns
  `app-tabs.tsx`, `src/db/schema.ts`, the labels helper and the month screen this change touches.
  The plan was to implement `categories-rules` only after it was committed and archived. The
  owner decided otherwise on 2026-08-24 — the two are implemented in parallel — so both changes'
  work now shares one uncommitted working tree, and the ordering they still require is recorded
  as tasks 9.3 and 9.4: `monthly-picture` commits first, as its own commit, and archives first,
  because this change's `month-screen` delta modifies a requirement that reaches
  `openspec/specs/` only then.
- The Saldo export CSV in the repo root is read once, by hand, to fix the starter list in the
  spec; it stays untracked and nothing at runtime reads it.
