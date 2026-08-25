# categories-rules — tasks

Every task traces to a requirement of this change's specs; test files are named per task.

The list was written assuming `monthly-picture` would be committed and archived first. The owner
decided otherwise on 2026-08-24: the two changes are implemented in parallel sessions, so this one
starts on a tree that still carries `monthly-picture`'s uncommitted diff (its migration 0002
included, which is why ours is 0003). Task 1.1 records what that costs.

## 1. Preconditions and reconciliation

- [x] 1.1 The precondition was waived by the owner (see above) and then met anyway: while this
      change was being implemented, the parallel session committed `monthly-picture` (22cd09c) and
      archived it (2d61446) — by pathspec, so none of this change's work went into either commit.
      The guard was run twice. First against the in-flight delta, then again against the archived
      truth now in `openspec/specs/month-screen/spec.md`: no drift either time. The MODIFIED block
      matches the archived requirement word for word except for the clause this change is here to
      replace ("Until the editable category list arrives, the reserved categories SHALL be shown
      as …"), plus the two scenarios it adds; the requirements `monthly-picture` put beside it
      (the approximate UAH figure, the rate refresh) are untouched. No `/opsx:update` needed.

## 2. Schema and migration

- [x] 2.1 Add `categories`, `sources` and `rules` tables to `src/db/schema.ts` per design
      decision 5, and turn `transactions.categoryId` / `sourceId` into real references with
      `onDelete: 'restrict'`; run `npm run db:generate` → migration 0003. (Persistence: "The
      category and source references arrive by a new migration that keeps stored rows".)

      The generated SQL is not enough on its own: three `INSERT`s for the reserved category rows
      are added to `drizzle/0003_sharp_arachne.sql` by hand, between the `CREATE TABLE`s and the
      `transactions` recreate, for the reason design decision 4 gives. Regenerating 0003 drops
      them and the recreate then fails on the owner's device — 2.2's "Pre-migration transactions
      survive the migration unchanged" is the test that catches it. `.claude/rules/database.md`
      was amended by the owner (2026-08-24) to allow exactly this.
- [x] 2.2 Extend `src/db/migrations.test.ts`: fresh database from all migrations stores a
      category, a source, a rule and one transaction of each type (scenario "A fresh database
      from migrations alone stores every list"); and representative rows stored under 0000–0002
      survive 0003 unchanged (scenario "Pre-migration transactions survive the migration
      unchanged").

- [x] 2.3 The foreign keys invalidate every existing DB test that stores a transaction under a
      category or source id with no row behind it. Add `seedReferences` to `src/db/test-db.ts`
      and call it from the setups of `migrations.test.ts`, `accounts-repo.test.ts` and
      `transactions-repo.test.ts`; a fixture that predates 0003 (the staged rate-cache test)
      carries a reserved id instead, since that is all such a database can hold. No test is
      weakened: each one keeps its subject and gains only the vocabulary it always presumed.

## 3. Starter set and seeding

- [x] 3.1 Create `src/db/starter-set.ts` — the spec's category and source lists verbatim with
      stable slug ids; reserved rows take the domain's reserved id constants. (Categories: "The
      starter set seeds the lists on first use".)
- [x] 3.2 Implement `seedStarterSet` in `src/db/seed.ts` (`INSERT OR IGNORE` by id) and run it
      from the root layout right after migrations; tests in `src/db/seed.test.ts` prove the
      scenarios "A fresh install holds the starter set" (including no «Борг»), "Reopening does
      not duplicate the starter set", "The owner's rename survives reopening" and "The owner's
      archive survives reopening".
- [x] 3.3 In `src/db/seed.test.ts`, prove the reserved-id mapping (categories: "The reserved
      category ids resolve to seeded rows"): a stored коригування's, комісія's and default
      витрата's category ids resolve to the seeded «Коригування», «Комісія» and «Без категорії»
      rows — the recorded domain-core obligation.

## 4. Repositories

- [x] 4.1 `src/db/categories-repo.ts` + `categories-repo.test.ts`: list, create, rename, archive,
      unarchive; empty-after-trim and duplicate-unarchived-name rejection; reserved rows refuse
      rename and archive. (Categories: "can be created and renamed", "can be archived and
      unarchived", "Reserved rows can be neither renamed nor archived".)

      A `src/domain/category.ts` came first, and neither the proposal nor this list had named it:
      `Category`, `Source`, the reserved id set and the list filters are glossary terms, so they
      belong in the domain rather than being re-derived in each repo. The proposal's Impact now
      says so.

      No `listActive()`: the screens build their pickers with `expenseCategoryChoices`, which has
      to drop «Коригування» as well, so a repo method that only drops archived rows had no caller
      and a name that invited a wrong one. `activeCategories(repo.list())` is what the tests use.
- [x] 4.2 `src/db/sources-repo.ts` + `sources-repo.test.ts`: the same operations and validations
      for sources. (Same requirements — the sources half.)

      Literally the same code: the two repos are `src/db/named-list-repo.ts` with different words
      and, for the категорії, the reserved predicate. The capability states one set of naming
      rules for both lists, so one implementation holds them; two would agree today and drift at
      the next change.
- [x] 4.3 `src/db/rules-repo.ts` + `rules-repo.test.ts`: create, edit, delete; reject a rule
      with neither criterion and a rule targeting an unknown category; loaded rules round-trip
      merchant, MCC, target and creation order. (Categorisation-rules: "A rule maps merchant
      and/or MCC to one category", "Rules can be created, edited and deleted"; persistence:
      "Categories, sources and rules survive a restart".)
- [x] 4.4 In `src/db/transactions-repo.test.ts`, prove storing an expense with an unknown
      category id and an income with an unknown source id are rejected. (Persistence: "A
      transaction references stored categories and sources".)

## 5. Domain: rule matching

- [x] 5.1 `src/domain/rules.ts` + `rules.test.ts`: `matchRule` per the matching requirement —
      case-insensitive substring, exact MCC, both-criteria conjunction, tier precedence,
      longest-pattern and newest-created tie-breaks, no-match returns nothing. One test per
      scenario of "Matching is deterministic and most-specific-first".

## 6. UI logic (pure, `src/ui/`)

- [x] 6.1 Make `categoryLabel` (and a new `sourceLabel`) in `src/ui/labels.ts` resolve from a
      loaded id→name map with the raw-id fallback; update `labels.test.ts` (renamed category
      shows its new name — month-screen scenario "A renamed category shows its new name" at the
      logic level).
- [x] 6.2 `src/ui/category-choices.ts` + test: picker choices from loaded rows — unarchived
      only, «Коригування» never offered, «Без категорії» and «Комісія» offered, explicit-pick
      lists (no default) for повернення and дохід. (Main-screen: picker clauses of "A manual
      expense needs only amount and account", "A дохід is recorded with its джерело", "A
      повернення is recorded in the category it returns to"; categories: "An archived category
      leaves the picker", "«Коригування» exists but is never pickable".)
- [x] 6.3 `src/ui/entry-form.ts` + test — the four-way type switch with per-type required fields
      (дохід → джерело, повернення → category) as a pure function from form state to the
      transaction to store or the reason it cannot be, reusing `amount-input.ts` unchanged; test
      that a дохід without джерело and a повернення without category produce no stored payload.
      The module exists so 6.3 and 7.4 are provable at all — `verify` never runs JSX.
      (Main-screen ADDED requirements, rejection scenarios.)
- [x] 6.4 Extend `src/ui/transaction-line.ts` + test: a line knows it carries «Без категорії»
      so the feed can mark it. (Main-screen: "«Без категорії» is highlighted and categorised in
      one tap" — the marking half; line content stays as specced today.)
- [x] 6.5 `src/ui/list-management.ts` + test: the management-list view models for Категорії /
      Джерела (unarchived first, archived set apart, reserved rows flagged non-editable) and
      the rule-form validation (at least one criterion). (Settings-screen requirements at the
      logic level.)
- [x] 6.6 `src/ui/retype.ts` + test: what each retype produces from a stored transaction —
      витрата ↔ повернення keeping amount, рахунок and category; витрата → дохід dropping the
      category for a picked джерело; дохід → витрата dropping the джерело into «Без категорії»;
      identity, amount and date preserved throughout. Same reason as 6.3: 7.6 is JSX and the
      MODIFIED retype requirement has no other verification path. (Main-screen MODIFIED "A
      transaction's type can be changed from editing".)

## 7. Screens

- [x] 7.1 `src/app/(tabs)/settings.tsx` (section menu), tab trigger in
      `src/components/app-tabs.tsx` and `app-tabs.web.tsx`, icon
      `assets/images/tabIcons/settings.png` + `@2x`/`@3x`. (Settings-screen: "The Налаштування
      tab hosts the management sections".)
- [x] 7.2 `src/app/manage/categories.tsx` and `sources.tsx` wired to the repos: create, rename,
      archive, unarchive; reserved rows offer no editing. (Settings-screen: "The Категорії and
      Джерела sections manage the lists".)

      `manage/`, not the `settings/` design decision 8 named: the tab file is
      `(tabs)/settings.tsx`, so it owns `/settings`, and the codebase already refuses that overlap
      once — the category drill-down lives at `/category/…` "because the Місяць tab already owns
      `/month`". Both screens are the same list twice, so the list itself is one component,
      `src/components/manage-list.tsx`, driven by `manageCategories` / `manageSources`.
- [x] 7.3 `src/app/manage/rules.tsx`: list, create, edit, delete rules showing target category
      names. (Settings-screen: "The Правила section manages the rules".)
- [x] 7.4 Головний entry form (`src/app/(tabs)/index.tsx`): category picker on витрата
      (default «Без категорії»), дохід and повернення recording with their required pickers.
      (Main-screen MODIFIED expense requirement + both ADDED recording requirements.)
- [x] 7.5 Feed: mark «Без категорії» lines and anchor the one-tap category picker that stores
      the pick without opening editing. (Main-screen: "«Без категорії» is highlighted and
      categorised in one tap".)
- [x] 7.6 Editing (`src/app/transaction/[id].tsx`): retype extended to повернення and дохід per
      the MODIFIED retype requirement; category and джерело changeable from editing via the
      same choices logic. (Main-screen MODIFIED "A transaction can be edited and deleted from
      the feed" — scenarios "A wrongly picked category is fixed from editing" and "A wrongly
      picked source is fixed from editing".)
- [x] 7.7 Month screen and category drill-down show names via the data-driven labels (no logic
      change beyond 6.1 — wiring only). (Month-screen MODIFIED requirement, archived-category
      scenario included.)

## 8. Evidence the specs cannot get from `verify`

- [x] 8.1 Manual smoke on Android (емулятор, `scripts/android.sh`) of the JSX-only scenarios:
      the Налаштування tab sits last and opens on its three sections; a category created there
      reaches the витрата picker; an archived row is set apart, not gone; a reserved row offers
      neither rename nor archive; a rule appears in «Правила» with its target category's name and
      leaves the list when deleted; a «Без категорії» line is marked in the feed and one tap
      categorises it without opening editing; recording a дохід and a повернення; and each retype
      of the MODIFIED retype requirement — including that a стored повернення does not offer
      дохід and a stored дохід does not offer повернення; and fixing a wrongly picked category
      and a wrongly picked джерело from editing (the decision is `buildEntry` and is tested; what
      the smoke adds is that the screen seeds its pickers from the stored transaction and stores
      under the same id). Re-check, inside the MODIFIED blocks this change restates: a deletion is
      confirmed first, and a transaction opened from a category's month list edits like one opened
      from the feed. Write the results here before archive.

      `scripts/android.sh up` on `Pixel_10_Pro` (API 37), debug APK over Metro, on the emulator's
      **existing** database — three рахунки and four transactions written under migration 0002 —
      so migration 0003 ran on data rather than on an empty file. Screenshots in
      `.cache/android/cr-*.png` (gitignored); the device database was pulled and read after each
      step, so nothing below is claimed from pixels alone.

      **The migration failed on the first launch, and that failure is the evidence design
      decision 4 rests on.** Metro had been running since before `db:generate`, and the bundle it
      served still carried an inlined 0003 from before the reserved-row `INSERT`s were added by
      hand. The app showed «Не вдалося підготувати сховище: Failed to run the query 'INSERT INTO
      `__new_transactions` … SELECT … FROM `transactions`'» and never opened its storage
      (`cr-01`) — exactly the `SQLITE_CONSTRAINT_FOREIGNKEY` the decision predicts for a device
      that has ever recorded a витрата. The same database migrated cleanly through
      `better-sqlite3` against the committed file, which is how the bundle was identified as the
      difference; `npx expo start --clear` and a relaunch fixed it (`cr-02`).

      | # | scenario | what was seen |
      | --- | --- | --- |
      | 1 | Pre-migration transactions survive the migration unchanged | after the clean relaunch: 4 migrations applied, 28 categories, 12 sources, no «Борг»; all four pre-existing transactions unchanged (two витрати in `uncategorised`, two перекази); `PRAGMA foreign_key_check` empty; `transactions` now carries FKs to `categories` and `sources` |
      | 2 | The tab opens on its sections | `cr-03` — «Налаштування» is the fourth and last tab, gear icon tinted like its neighbours, and it opens on «Категорії» / «Джерела» / «Правила» |
      | 3 | A reserved row offers no editing | `cr-04` — «Без категорії», «Комісія» and «Коригування» each read «службова — застосунок сам її використовує» with no verbs; every other row offers «Перейменувати» and «В архів» |
      | 4 | An empty name is rejected | `cr-05` — submitting the empty field answered «Не збережено / назва не може бути порожньою» and stored nothing. Unplanned: `adb input text` cannot type Cyrillic, so the intended «Ремонт» never reached the field. The refusal is the scenario, so the row stands |
      | 5 | A category created in Налаштування reaches the picker | created «Repair» (Latin, for the reason in row 4); stored as a real row, and `c21` shows it among the витрата picker's choices |
      | 6 | An archived row is set apart, not gone | archived «булка»; `crop08` — it sits last, labelled «в архіві», and offers «З архіву» instead of «В архів» |
      | 7 | An archived category leaves the picker | `crop11` — «булка» was the second choice before archiving and is absent after, while «Комісія» and «Без категорії» stay |
      | 8 | «Коригування» exists but is never pickable | absent from the витрата picker (`crop11`), the повернення picker (`c19`), the one-tap feed picker (`crop13`) and the rule form (`c26`) — while present in the «Категорії» list (`cr-04`) |
      | 9 | An uncategorised expense is marked in the feed | `crop12` — the витрата in «Без категорії» carries «● Обрати категорію»; the переказ beside it carries nothing |
      | 10 | One tap categorises from the feed | `crop13` → `crop14` — the picker opens under the row without «Без категорії» in it; picking Charity left the same id carrying `charity`, the same amount, account and date, the editing screen never opened, and the mark is gone |
      | 11 | An income is stored with its source | `crop16` — «Джерело» offers the twelve seeded джерела with **nothing** selected; picking Salary and recording stored a дохід of 5000000 minor units UAH with `source_id = salary` |
      | 12 | A refund is stored in its category | `c19` — the повернення picker is labelled «До якої категорії» and, unlike the витрата's, has nothing preselected; picking Clothing stored a повернення of 80000 minor units UAH in `clothing` |
      | 13 | An expense becomes a refund in the same category (in reverse) | `c24` — retyping that повернення to витрата kept Clothing selected in the picker |
      | 14 | A wrongly picked category is fixed from editing | in the same screen, picking «Eating out» and saving left the **same** id, amount, рахунок and date, now `category_id = eating-out` |
      | 15 | A повернення is not retyped into a дохід | `c23` — a stored повернення offers exactly «витрата» and «повернення»; `c32` — a stored витрата offers all four. The rule itself is not a smoke claim: `shapesFor` moved into `src/ui/retype.ts` and `retype.test.ts` asserts the menu for all five stored types, including the дохід the smoke did not open |
      | 16 | Retyping into a дохід drops the category and asks for the джерело | `c33` — the category picker is gone and «Джерело» appears with nothing selected |
      | 17 | A created rule appears in the list | `c28` — «silpo · MCC 5411 → Clothing» with «Змінити» / «Видалити»; the stored row carries merchant, MCC, target and its creation instant |
      | 18 | A deleted rule leaves the list | `c29` — «Видалити правило? Уже категоризовані транзакції лишаться як є.»; confirming emptied the rules table and left «Поки жодного правила.», with all six transactions untouched |
      | 20 | An expense becomes a transfer under the same identity | `d43` — the retype kept «Звідки» and «Скільки пішло» (800,00), added «Куди» with nothing selected and dropped the category picker; saving left the **same id** carrying 80000 minor units UAH on both legs and no category |
      | 21 | An edited переказ that arrives short proposes the комісію | `d48` — «Схоже на комісію / Дійшло на 5,00 UAH менше. Записати різницю як витрату «Комісія»?»; accepting left the переказ at 79500 on both legs and stored a витрата of 500 minor units UAH in `fees` on the account the money left — which the feed reads as «5,00 UAH · витрата · bank jar · Комісія» (`d49`), the seeded fees row resolving by name |
      | 22 | A transfer becomes an expense on the account the money left | `d50` — a stored переказ offers only «витрата» and «переказ»; retyping put 79500 minor units UAH on bank jar in «Без категорії», dropped the arrived leg and the destination, and left the accepted комісія stored as its own transaction, untouched |
      | 19 | A deletion is confirmed first | `c35` — «Видалити транзакцію? Її не буде ні у стрічці, ні в історії рахунку.»; cancelling left all six transactions in place |

      Rows 20–22 were run after the diff review asked for them: this change rewrote the editing
      screen's переказ path (inline `transfer()` + `parseAmount` → `buildEntry` + `askAboutFee`),
      so the wiring that carries the arrived leg and the fee proposal was new and unexercised on a
      device. Row 22 also cost a small fix the smoke is what found: the витрата picker opened with
      **nothing** selected after a переказ was retyped, while saving would store «Без категорії» —
      the screen now shows the default it would store, exactly as the Головний form does — re-checked
      on an untouched переказ afterwards (`d53`), where «Без категорії» comes up selected and the
      screen was left without saving.

      Two deviations, stated rather than glossed:

      1. **`adb input text` cannot type Cyrillic.** «Ремонт» became «Repair» and the rule pattern
         «сільпо» became «silpo». What those rows test — a created category reaching the picker, a
         rule listing with its pattern and its target's name — does not depend on the alphabet;
         the Cyrillic side of matching, including that a Cyrillic pattern does not reach a Latin
         description, is pinned in `src/domain/rules.test.ts`.
      2. **"A transaction in the category list opens for editing" was not re-run.** It is a
         scenario of the month-screen requirement this change restates, but nothing in this diff
         touches that path beyond the title now reading the category's name from the editable
         list; `monthly-picture` smoked it (its rows 5 and 6) two commits ago.

## 9. Gate

- [x] 9.1 Run `npm run verify` and paste the final lines

      ```
       Test Files  31 passed (31)
            Tests  406 passed (406)
         Duration  696ms
      ✔ verify passed (d66e2bfa2ac0ca83f92f23969d29e79a7b183b1d)
      ```

      That fingerprint is the tree one edit before this paste — writing the paste changes the tree
      it describes, which no ordering fixes. `verify` was re-run afterwards and `guard-bash.sh`
      compares the working tree against the last green run at `git commit`, so what was committed
      is a tree that passed, not this quotation of one.
- [x] 9.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      Three passes. The first two returned FAIL and both were right:

      1. **FAIL (2 critical).** The tree shipped a повернення ↔ дохід retype that no requirement
         asks for and `rules/domain.md` forbids ("Refund … Never model it as income") — offering
         it would raise дохід and stop the month's spent shrinking in one tap. Removed from the
         menu and refused in the domain, with the refusal written into the retype requirement and
         a scenario for it. And the two scenarios this change adds to the edit requirement —
         fixing a wrongly picked category and a wrongly picked джерело — had no verification path
         at all; they are now `entry-form.test.ts` cases over the exact call the screen makes, and
         smoke row 14.
      2. **FAIL (2 critical).** `shapesFor` — the only thing enforcing the move list — was JSX and
         therefore unprovable; it moved into `src/ui/retype.ts` and is asserted for all five
         stored types, including that the offered set is exactly the six moves the requirement
         names. And task 8.1 promised "each retype" while no smoke row opened a переказ, on a path
         this change had rewritten; rows 20–22 were run to close it, and found the picker bug
         noted there.
      3. **PASS (0 critical, 4 warning).** Two warnings are recorded in `design.md` Risks to
         carry into saldo-import; one is the commit scope, handled in 9.3; one is these two boxes.

      The same three passes also took out `retypeSingleAccount` (a second copy of `buildEntry`'s
      construction rules), a second `withCurrent`, a third list of the type vocabulary, and a
      `sourceLabel` nothing called.
- [x] 9.3 Commit. The owner's ordering (2026-08-24: two separate commits, `monthly-picture`
      first) was satisfied — it landed as 22cd09c and 2d61446 while this change was being
      implemented. Committed as 9a70db7, 67 files, scoped by pathspec: `BACKLOG.md`,
      `.claude/skills/auto-work/` and `.claude/agents/diff-reviewer.md` were in the tree
      throughout but belong to no task here, so they stayed uncommitted for the owner.
- [x] 9.4 ~~Do not archive before `monthly-picture` is archived~~ — it is (2d61446), so
      `openspec/specs/month-screen/spec.md` exists and this change's MODIFIED block has a target
      to attach to. Re-diffed after that landed: no drift (see task 1.1). `settings-screen`'s
      "last after Головний, Місяць and Рахунки" is satisfied too — the Місяць tab is in truth now.
