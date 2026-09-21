## 0. Preconditions

- [x] 0.1 Confirm `transfer-rules` is committed: its migration is in `drizzle/`, its
  `BACKUP_SCHEMA_VERSION` bump is in `src/backup/format.ts`, and none of the four screen files of
  design D10 is modified in the tree. Verify: `git status --short src drizzle` shows none of its
  files; `ls drizzle` lists its migration. (design «DB migration» — numbering and the tripwire)
- [x] 0.2 `docs/glossary.md`: new entry **Category icon** (іконка категорії) under «Categories and
  sources» — a picture from the app's own fixed catalogue a категорія is recognised by; never
  replaces its назва; counts toward nothing; fixed for the three reserved rows; a starting one
  from the starter set or the назва, kept until the owner picks another; джерела carry none. The
  same entry says that a transaction line also leads with an іконка the app fixes for what the
  транзакція is — «Переказ», «Дохід», «Плюс-мінус» — which is not a категорія's and not chosen.
  Verify: `openspec validate --all` for this change, and every spec term of this change matches
  the glossary verbatim.

## 1. Domain: the key vocabulary and how a категорія gets one

- [ ] 1.1 `src/domain/category-icon.ts`: the 48 pickable keys and 2 app-only keys (design D4),
  `RESERVED_CATEGORY_ICONS`, `STARTER_CATEGORY_ICONS` by starter id, `isPickableCategoryIcon`,
  `startingCategoryIcon`, `resolveCategoryIcon` (design D5), with `suggestCategoryIcon` returning
  `tag` for now. Tests in `src/domain/category-icon.test.ts`: "The catalogue offers the pickable
  іконки" (48 pickable, `question`/`plus-minus` not among them), "Reserved rows show their fixed
  іконки", "A renamed starter категорія starts with its own іконка" (by id), "An unknown stored
  іконка is drawn generic and kept" (resolution), "An app-only іконка on the owner's категорія is
  drawn generic", and that an absent key resolves to the starting icon (design D8).
- [ ] 1.2 `suggestCategoryIcon` and the ordered keyword table (design D6). Tests in
  `src/domain/category-icon.test.ts`: "A Ukrainian name suggests its іконка", "Letter case does
  not matter", "An English name suggests its іконка", "An unknown category name gets the generic
  іконка", "The suggestion is the same every time"; plus the design D6 traps — every starter name
  but KrayShop suggests its starter icon, «Business lunch» is not `bus`, «Family care» is `family`,
  «Домашні тварини» is `paw`, «сімейний бюджет» is `coins`, «Лікар» is `heart-pulse` and «Ліки»
  `pill`, «Catering» is not `paw`, «Workout» is `dumbbell`.
- [x] 1.3 `Category.iconKey?` in `src/domain/category.ts` (design D7); `Source` unchanged.
  Verify: `npm run typecheck`; the existing `src/domain/*.test.ts` pass unchanged.

## 2. Glyphs and the UI registry

Each glyph batch: draw by hand and append to `ICON_PATHS` in `src/ui/icons.ts` per design D2 (a
one-line comment per glyph saying what it depicts, like the existing ones); `src/ui/icons.test.ts`'s existing checks pass unchanged (absolute commands, in the box,
no repeated subpath — a stroke that repeats another glyph's is redrawn until it differs, and the
test is not loosened);
then render a contact sheet of the batch from `ICON_PATHS` (throw-away HTML in the scratchpad,
viewed in the browser pane) at 20pt and 40pt on the `backgroundInset` tile of both themes, and save
the screenshot as `openspec/changes/category-icons-and-transaction-visuals/glyphs/batch-N.png`.

- [ ] 2.1 Batch 1 — Їжа and Транспорт plus the app-only pair: `cart`, `utensils`, `coffee`,
  `burger`, `bread`, `delivery`, `car`, `fuel`, `bus`, `taxi`, `parking`, `question`,
  `plusMinus` (13). Verify: the batch rules above; `glyphs/batch-1.png` exists.
- [ ] 2.2 Batch 2 — Дім, Покупки, Техніка і зв'язок: `home`, `bulb`, `wrench`, `sofa`,
  `document`, `shirt`, `shoe`, `bag`, `laptop`, `phone`, `wifi`, `cloud` (12). Verify: as above,
  `glyphs/batch-2.png`.
- [ ] 2.3 Batch 3 — Здоров'я і краса, Навчання, Подорожі: `heartPulse`, `pill`, `dumbbell`,
  `sparkles`, `scissors`, `graduationCap`, `book`, `suitcase`, `plane`, `bed` (10). Verify: as
  above, `glyphs/batch-3.png`.
- [ ] 2.4 Batch 4 — Дозвілля, Люди і тварини, Гроші: `ticket`, `film`, `gamepad`, `music`, `gift`,
  `family`, `baby`, `paw`, `handHeart`, `bank`, `coins`, `percent`, `briefcase` (13). Verify: as
  above, `glyphs/batch-4.png`.
- [ ] 2.5 `src/ui/category-icons.ts`: key → `{ glyph, name, group }` in grid order (design D3/D4).
  Tests in `src/ui/category-icons.test.ts`: the registry covers exactly the domain's keys; every
  glyph exists in `ICON_PATHS`; Ukrainian names are unique and non-empty; the grid holds the 48
  pickable keys in 12 groups; and "The dark theme keeps every іконка legible" — every tone of
  design D12 is at least 3:1 against `backgroundInset` (and `accent` against `accentSurface`) in
  both `Colors.light` and `Colors.dark`, and `textMuted` is not an allowed tone.

## 3. Storage

- [ ] 3.1 `src/db/schema.ts`: `categories.iconKey` (`icon_key`, nullable text). `npm run
  db:generate`; inspect the SQL — it must be a single `ALTER TABLE … ADD icon_key` (if drizzle
  generates a table recreate, stop and ask the owner). `BACKUP_SCHEMA_VERSION` + 1 in
  `src/backup/format.ts`. Tests in `src/db/migrations.test.ts`: "Pre-migration rows survive the
  migration unchanged" (the rows of design «DB migration», all `icon_key` NULL afterwards) and "A
  fresh database from migrations alone stores an іконка"; `src/backup/format.test.ts`'s tripwire
  passes.
- [ ] 3.2 `src/db/named-list-repo.ts` per-table extension and `src/db/categories-repo.ts`
  `create`/`list`/`get` with `iconKey`, and `update(id, { name, iconKey })` in one immediate
  transaction (design D7). Tests in `src/db/categories-repo.test.ts`: "A new категорія is created
  with the іконка picked", "A new категорія created without a pick carries its suggestion", "The
  іконка is changed", "A refused save changes nothing", "An archived категорія's іконка can be
  changed", "An archived категорія sharing its назва with an unarchived one can have its іконка
  changed", "Changing a reserved row's іконка is rejected", "An app-only іконка cannot be given to
  the owner's категорія", "A rename keeps the owner's іконка", "Unarchiving keeps the іконка", "A
  picked іконка round-trips", "An іконка this installation does not know round-trips unchanged".
  `src/db/sources-repo.test.ts` passes unchanged.
- [ ] 3.3 `src/db/starter-set.ts` rows carry their icons and `seedStarterSet` inserts missing ones
  with them; a separate `fillMissingCategoryIcons` in `src/db/seed.ts`, called right after the seed
  in `src/app/_layout.tsx` (design D8). Tests in `src/db/seed.test.ts`: "A fresh install holds the
  starter іконки", "Existing категорії get their starting іконки on the first opening", "Filling in
  happens once", "A picked іконка survives reopening"; that `seedStarterSet` alone leaves an
  existing row's NULL icon as it is (seeding changes no existing row); and the tripwire that every
  starter id has an entry in `STARTER_CATEGORY_ICONS` and no entry names a non-starter id.
- [ ] 3.4 `src/db/import-repo.ts` commit stores each created категорія with its starting icon
  (design D9). Tests in `src/db/import-repo.test.ts`: "Saldo import gives a created категорія its
  suggested іконка", "A Saldo name nothing matches starts generic", "A redirected proposal leaves
  the existing іконка alone", "A name matched to an existing категорія keeps the owner's іконка",
  "Fees keep «Відсоток»".

## 4. Бекап

- [ ] 4.1 `src/backup/format.ts`: `categoryAt` (a missing or `null` `iconKey` is absent; any other
  value must be a non-empty string) replaces `namedAt` for категорії; джерела keep `namedAt`. Tests
  in `src/backup/format.test.ts`: "A malformed іконка refuses the бекап" (a number, empty text), "A
  бекап with іконки is refused by an app that predates them" (schema version above the current
  one), and that a категорія with no `iconKey`, or with `iconKey: null`, parses without one.
- [ ] 4.2 `src/db/backup-repo.ts`: the snapshot carries `iconKey` and omits it for a NULL; restore
  inserts exactly the `iconKey` carried, NULL when none — no filling in (design D8). Tests in
  `src/db/backup-repo.test.ts`: "A custom іконка survives the round trip", "Restore of an old
  бекап without іконки" (restored rows hold NULL, resolve to the starting icons, and hold them after
  `fillMissingCategoryIcons`), "A бекап taken before the fill-in ran restores with starting
  іконки" (a snapshot taken before the fill-in has no `iconKey` on those rows and round-trips),
  "An іконка this installation does not know is carried through".
- [ ] 4.3 "An іконка moves no number": tests in `src/ui/month-screen.test.ts` (the August
  breakdown row, its сума and over-limit verdict are identical with two different icons on
  Groceries) and in `src/analysis/package.test.ts` (the пакет built from категорії carrying icons
  contains no icon key anywhere in its JSON).

## 5. The transaction line

- [ ] 5.1 `src/ui/transaction-line.ts`: the category lookup `{ name, iconKey }`, and `icon`,
  `iconTone`, `amountTone` on `TransactionLine` (design D10); the four calling screens build the
  lookup from the `categoriesRepo.list()` they already load, in this same task, so typecheck stays
  green. Tests in
  `src/ui/transaction-line.test.ts`: "A витрата leads with its категорія's іконка", "An
  uncategorised витрата leads with «Питання» and keeps its highlight", "A комісія leads with
  «Відсоток»", "A переказ leads with «Переказ» and names both рахунки", "An інвестиція and a
  переказ onto a рахунок-борг are still перекази on the line", "A дохід leads with «Дохід» whatever its джерело", "A
  коригування leads with «Плюс-мінус» of either sign", "The same категорія leads with the same
  іконка in every currency", "A renamed категорія's lines keep its іконка", "Archiving keeps the
  іконка on its history", "Two категорії are not told apart by colour", "Over its ліміт, the іконка
  turns red with its name".
- [ ] 5.2 The повернення line: signed сума, default tone, «повернення» in `feedSubtitle`. Tests in
  `src/ui/transaction-line.test.ts`: "A повернення is told apart from a витрата of the same сума",
  "A повернення is not dressed as a дохід".
- [ ] 5.3 `src/components/transaction-row.tsx` (design D10: hidden tile, title with `Mark` and
  over-limit colour, subtitle, the опис — hidden only where the caller asks, i.e. «Транзакції»
  under «Без категорії» as today — сума in `amountTone`, `actions` slot, `title` override) and
  Головний's feed plus «Транзакції» switched to it, keeping the one-tap categorisation in the
  slot. Verify: `npm run lint`, `npm run typecheck`,
  `src/ui/screens.test.ts` and `src/ui/transaction-search.test.ts` pass.
- [ ] 5.4 A рахунок's рухи and a категорія's month list switched to `TransactionRow`. Tests in
  `src/ui/transaction-row-usage.test.ts`: "The same line appears on every list of транзакції" —
  each of the four screen files renders `TransactionRow` and none calls `feedTitle`/`feedSubtitle`
  itself; "The drill-down shows the feed's line" — `category/[month]/[categoryId].tsx` renders
  `TransactionRow` for every транзакція it lists, and a повернення's line from that list's
  `transactionLine` says «повернення»; "A screen reader reads the line's words, not its іконка" —
  `transaction-row.tsx` hides its tile from accessibility.

## 6. Місяць

- [ ] 6.1 `src/ui/month-screen.ts`: `MonthBreakdownRow` carries `icon` and `iconTone` (design D13);
  `src/app/(tabs)/month.tsx` draws the tile. Tests in `src/ui/month-screen.test.ts`: "Breakdown
  rows show their іконки", "An over-limit row turns its іконка red with its name", "Only the
  over-limit currency's row turns its іконка red", "The order does not follow the іконка".

## 7. The Категорії section

- [ ] 7.1 `src/ui/category-editor.ts` (design D11). Tests in `src/ui/category-editor.test.ts`:
  "The chosen іконка follows the назва until the owner picks one", "A picked іконка is kept while
  typing", "Only the іконка is changed", "A new категорія is created with a picked іконка" (the
  save input), "The choice is written, not only coloured" (the chosen name), "Leaving the editor
  stores nothing" and "A rejected save keeps the editor and changes nothing" (cancel yields no
  write; a refused save keeps the typed назва and picked іконка).
- [ ] 7.2 `src/ui/list-management.ts`: `ManagedRow.icon` from `manageCategories`. Tests in
  `src/ui/list-management.test.ts`: "Each row shows its іконка", "A reserved row offers no
  editor", "Джерела carry no іконка".
- [ ] 7.3 `src/components/category-editor.tsx` on `Sheet` (grid by group, 48pt cells, radio
  semantics with the Ukrainian name and checked state, outline + «Обрано: …», `useCloseOnBack`),
  `ManageListScreen` `leading`/`editor` slots, `src/app/manage/categories.tsx` wired with the
  journal verbs `create`/`edit`. Tests in `src/ui/category-icons.test.ts`: "A screen reader names
  the cell and its state" (every grid cell's label is its Ukrainian name; the chosen one is the
  only checked one) and "Every cell is large enough to tap" (`category-editor.tsx`, read by path,
  sizes its cell by `TouchTarget`). Verify: `npm run lint`, `npm run typecheck`,
  `src/ui/screens.test.ts`.

## 8. Docs

- [ ] 8.1 `docs/app-overview.md`: the transaction line's icons, the Категорії editor, the
  breakdown icons; screenshots under `docs/screens/` refreshed from the smoke of 9.2. Verify: the
  file names every screen this change touched.

## 9. Emulator smoke

- [ ] 9.1 Before installing this change's build, with the previous build on the emulator
  (`scripts/android.sh up` from the commit before this change), make a бекап and keep the file.
  Verify: the file exists outside the app and its `schemaVersion` is the previous one.
- [ ] 9.2 Run the `smoke-runner` subagent on this change: the Категорії editor (create «Ремонт»
  with a pick, «Кафе» preselecting «Кава», a pick surviving typing, changing Pets' icon, «назад»
  closing the editor, «Комісія» offering no editor, archive/unarchive keeping the icon); the feed,
  «Транзакції», a рахунок's рухи and a категорія's month showing a витрата, «Без категорії», a
  комісія, a переказ, a дохід, a повернення («повернення», «+») and a коригування of each sign; the
  Місяць breakdown with an over-limit row; restoring the бекап of 9.1 (every категорія gets its
  starting icon); the same screens in night mode (`adb shell cmd uimode night yes`); and a
  `uiautomator dump` showing grid cells named in Ukrainian with exactly one checked and bounds of at
  least 48dp, and no separate accessibility node for a line's tile. Verify: a verdict per scenario,
  screenshots in the change folder.
- [ ] 9.3 Fix every defect 9.2 reports — a logic defect starts with a failing test in the pure
  module that owns it — and re-run the affected smoke scenarios. Verify: the re-run is green or a
  scenario is explicitly recorded as not run with the reason.

## 10. Close

- [ ] 10.1 Run `npm run verify` and paste the final lines
- [ ] 10.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
