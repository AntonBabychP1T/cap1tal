## Context

See proposal.md — Why. The current shape this design has to fit:

- **Glyphs already exist as data.** `src/ui/icons.ts` holds `ICON_PATHS` — 15 hand-drawn stroke
  glyphs, 24×24, stroke-width 2, round caps and joins, absolute `M L C Z` commands only — and
  `src/components/icon.tsx` draws any of them in any `ThemeColor` over `react-native-svg`.
  `icons.test.ts` proves the table well-formed (in-box coordinates, no duplicated subpath). The
  file's own rule: new glyphs are *appended to this table*, never kept in a private copy.
  `IconTile` (a glyph on `backgroundInset`, `Radius.tile`) and `IconRow` exist in
  `src/components/surfaces.tsx` from `redesign-foundation` but have no consumer yet.
- **No other icon library is in use.** `expo-symbols` sits in `package.json` from the Expo template
  and is imported nowhere; there is no `@expo/vector-icons`.
- **Categories.** `categories(id, name, archived)`; reservedness is "the id is one of three domain
  constants" (`src/domain/category.ts`), deliberately not a column. `namedListRepo` implements the
  list rules once for категорії and джерела. Categories are written by four paths only: the seed
  (`src/db/seed.ts`, create-if-missing on every open, in a `useEffect` *after* the first render of
  `_layout.tsx`), the «Категорії» section (`categoriesRepo.create/rename/archive/unarchive`), the
  Saldo commit (`import-repo.ts`, straight `tx.insert` through `listName`), and restore
  (`backup-repo.ts`, straight `tx.insert`).
- **The transaction line is pure, its rendering is not shared.** `src/ui/transaction-line.ts`
  (`transactionLine`, `feedTitle`, `feedSubtitle`) decides the words; the JSX of the row is copied
  four times — `src/app/(tabs)/index.tsx`, `src/app/transactions.tsx`, `src/app/account/[id].tsx`,
  `src/app/category/[month]/[categoryId].tsx` — each with its own amount-tone ternary, and two of
  them with the «Без категорії» one-tap action under the row.
- **A повернення is invisible as such today**: it is titled by its категорія, subtitled by its
  рахунок, and its (always positive) сума prints exactly like a витрата's.
- **Storage/бекап versions**: one committed migration (`drizzle/0000_…`),
  `BACKUP_SCHEMA_VERSION = 1` tripwired to the migration journal, `BACKUP_FORMAT_VERSION = 2`.
  Категорії and джерела share one parser (`namedAt`) in `src/backup/format.ts`.
- **In flight**: `transfer-rules` (2/24) adds a migration, bumps `BACKUP_SCHEMA_VERSION`, and edits
  the «Без категорії» action area of the feed row; `home-dashboard-redesign` has just been opened.

## Goals / Non-Goals

**Goals:**

- One vocabulary of іконка keys, owned by the app, stored on the row, resolvable everywhere by one
  pure function — so the feed, the section, the breakdown, the seed, the import and the restore can
  never disagree about which picture a категорія wears.
- One transaction row component and one pure line model behind it, used by all four lists.
- A storage change that rebuilds no table and moves no existing value.

**Non-Goals (design-level):**

- No change to `namedListRepo`'s rules (trim, uniqueness among unarchived, reserved refusal) —
  only the category repository learns about іконки.
- No new `ThemeColor`, no per-категорія colour, no change to `Colors`.
- No change to the entry form's `Picker` chips.

## Decisions

### D1. Reuse the app's own stroke-glyph table; add no icon library

The catalogue is drawn by the table and renderer that already exist: every new picture is a new
entry of `ICON_PATHS`, under the same geometry and the same `icons.test.ts` checks. No dependency
is added to `package.json`, no native module, no permission, no Expo config change.

*Alternatives rejected:*
- `expo-symbols` (already installed, unused): SF Symbols on iOS and Material Symbols on Android are
  two different vocabularies with platform-specific names, filled rather than stroked, and a
  stored key would become a platform glyph name — exactly what must not be stored. It would also
  make the Android and iOS pictures of one категорія differ.
- `@expo/vector-icons` or any icon font: a second icon system beside the table, a font asset, and
  glyph names that are a library's.
- Emoji: rendering varies per OEM font, cannot be tinted, and reads as noise at 20pt.
- Images (PNG/SVG files): the reason `redesign-foundation` moved to path data — no tint, one file
  per size and colour.

### D2. The glyph paths are drawn by hand (owner's decision, 2026-09-19)

All 48 new glyphs are drawn by hand into `ICON_PATHS`, to the geometry the table already fixes —
24×24, stroke-width 2, round caps and joins, absolute `M L C Z` only, arcs spelled as cubics — the
same way the existing 15 were. No third-party path data and no licence notice enter the
repository; no package is installed.

*Alternative rejected by the owner:* converting the shapes from Lucide (ISC). Better-looking at
first draw, but it brings third-party data and a notice to keep.

What keeps hand-drawn glyphs from looking amateur is process, not tooling:
- **Few strokes, one idea each.** A glyph is recognisable at 20pt or it is redrawn simpler — a paw
  is four pads and a palm, not a traced photograph; a gamepad is an outline and two marks.
- **Batches of 10–13, each seen before the next.** A contact sheet of the batch (throw-away HTML
  in the scratchpad, rendered from `ICON_PATHS` in the browser pane) at 20pt and 40pt on the
  `backgroundInset` tile of both themes, saved into the change folder; anything unreadable,
  lopsided or off-weight against the existing 15 is redrawn in the same task.
- **No shared stroke.** `icons.test.ts` refuses an identical subpath under two names, and a named
  constant would produce the identical string, so it cannot be the way out: a stroke that repeats
  another glyph's is redrawn until it differs. The test is not changed.
- The emulator smoke (task 9.2) is the final judge at real size on a real screen.

### D3. The stored key is the app's own; a registry maps key → glyph

A категорія stores a **key** — short, kebab-case, named after the picture (`coffee`, `taxi`,
`heart-pulse`), never after a library glyph and never a component name. `src/ui/category-icons.ts`
maps each key to a glyph name of `ICON_PATHS` (camelCase, e.g. `heartPulse`), its Ukrainian name
(what a screen reader says and the editor writes) and its group. Keys and glyphs are separate on
purpose: a glyph can be redrawn or renamed without touching a stored value.

Rules for keys, stated in `src/domain/category-icon.ts` and enforced by its test:
- **Append-only.** A key once shipped is never renamed, never removed and never taken out of the
  pickable set; only its glyph may be redrawn. There is no "retired" key, so "known" and "pickable"
  are the same thing for every key but the two app-only ones.
- **The domain owns the key set, the UI owns the pictures.** The domain knows which keys exist,
  which are pickable, which are reserved-only, the starter and reserved assignments and the keyword
  table; it never imports a glyph. The UI knows glyph, name and group per key. A test proves the
  two cover exactly the same keys.

### D4. The catalogue

48 pickable keys + 2 app-only. «(glyph exists)» marks an existing glyph reused; every other key needs a new glyph.

| Group (as the grid heads it) | Key → Ukrainian name |
| --- | --- |
| Їжа | `basket` «Продукти» (glyph exists) · `cart` «Супермаркет» · `utensils` «Ресторан» · `coffee` «Кава» · `burger` «Фастфуд» · `bread` «Випічка» · `delivery` «Доставка» |
| Транспорт | `car` «Авто» · `fuel` «Пальне» · `bus` «Громадський транспорт» · `taxi` «Таксі» · `parking` «Паркування» |
| Дім | `home` «Дім» · `bulb` «Комунальні» · `wrench` «Ремонт» · `sofa` «Меблі» · `document` «Платежі» |
| Покупки | `shirt` «Одяг» · `shoe` «Взуття» · `bag` «Покупки» |
| Техніка і зв'язок | `laptop` «Електроніка» · `phone` «Телефон» · `wifi` «Інтернет» · `cloud` «Підписки» |
| Здоров'я і краса | `heart-pulse` «Здоров'я» · `pill` «Аптека» · `dumbbell` «Спорт» · `sparkles` «Краса» · `scissors` «Послуги» |
| Навчання | `graduation-cap` «Освіта» · `book` «Книги» |
| Подорожі | `suitcase` «Подорожі» · `plane` «Авіа» · `bed` «Готель» |
| Дозвілля | `ticket` «Розваги» · `film` «Кіно» · `gamepad` «Ігри» · `music` «Музика» |
| Люди і тварини | `gift` «Подарунки» · `family` «Сім'я» · `baby` «Діти» · `paw` «Тварини» · `hand-heart` «Благодійність» |
| Гроші | `bank` «Фінанси» · `coins` «Гроші» · `percent` «Відсоток» · `briefcase` «Робота» |
| Інше | `tag` «Інше» (glyph exists; the generic one and the fallback) |
| *app-only, never offered* | `question` «Питання» (Без категорії) · `plus-minus` «Плюс-мінус» (Коригування, and every коригування line) |

The transaction line additionally uses the existing `transfer` («Переказ») and `income` («Дохід»)
glyphs; they are line markers, not category keys.

### D5. Assignment: reserved, starter, suggestion, fallback — one pure function

`src/domain/category-icon.ts` (pure, no imports beyond `domain/transaction`'s reserved ids):

- `RESERVED_CATEGORY_ICONS`: uncategorised → `question`, fees → `percent`, correction →
  `plus-minus`.
- `STARTER_CATEGORY_ICONS`: keyed by the starter rows' stable ids (`groceries` → `basket`,
  `coffee` → `coffee`, `bulka` → `bread`, `habits` → `tag`, … exactly the categories spec's list).
  It lives here rather than in `src/db/starter-set.ts` because the *display* needs it too (D8), and
  `src/ui` must not import storage. `seed.test.ts` fails if a starter id lacks an entry or an entry
  names a non-starter id.
- `suggestCategoryIcon(name)`: the keyword table (D6); nothing matched → `tag`.
- `startingCategoryIcon({ id, name })` = reserved icon, else starter icon (by id, whatever the row
  is named now), else `suggestCategoryIcon(name)`.
- `resolveCategoryIcon({ id, name, iconKey })` = reserved icon for a reserved id (the stored value
  is ignored); else, when `iconKey` is absent, `startingCategoryIcon` (the value the fill-in is
  about to store — D8); else `iconKey` when it is pickable; else `tag` (unknown key from a newer
  build, or an app-only key a бекап put on an owner's row).
- `isPickableCategoryIcon(key)` — what every owner write is validated against.

Starter icons are **by id**, not by name: an id is what survives a rename (the same reason
`starter-set.ts` gives for its slugs), so Groceries renamed «Їжа» still starts as «Продукти».

### D6. The keyword table

An ordered list of `{ key, stems, words }`. The name is folded — `toLowerCase()` (locale-free, so
no engine's locale data decides a suggestion; Ukrainian has no case pair it gets wrong), the
apostrophes `'` `’` `ʼ` unified, split into words on anything that is not a letter, digit or
apostrophe. An entry matches when some word **starts with** one of its `stems`, or **equals** one
of its `words` (short Latin keywords that would otherwise hit inside longer words: `bus` must not
match «Business lunch»). The first matching entry wins; the order below is the order of the table,
more specific before more general (`кав`/`кафе` before `їжа`; `авіа` before `подорож`).

| Key | Ukrainian stems | Latin stems / `=`whole words |
| --- | --- | --- |
| `delivery` | доставк | deliver, glovo |
| `coffee` | кав, кафе, кофе | coffee, cafe, café |
| `burger` | фастфуд, бургер | fastfood, burger, mcdonald, kfc |
| `bread` | булк, випічк, хліб, пекарн | bakery, bread |
| `utensils` | ресторан, їжа, обід | restaurant, eating, food, lunch, dinner |
| `cart` | супермаркет, маркет | supermarket, market |
| `basket` | продукт, бакал, сільпо, атб, новус | grocer |
| `fuel` | пальн, бензин, заправк, азс | fuel, petrol, =gas |
| `taxi` | такс | taxi, uber, uklon, =bolt |
| `parking` | паркув, парковк | parking |
| `bus` | метро, автобус, маршрутк, проїзд, громадськ | metro, transit, public, =bus |
| `car` | авто, машин, транспорт | auto, transport, =car, =cars |
| `plane` | авіа, літак, переліт | flight, plane, airline |
| `bed` | готел, хостел, житло | hotel, hostel, airbnb |
| `suitcase` | подорож, відпуст, туризм | travel, trip, vacation |
| `paw` | тварин, кіт, собак, ветерин | pet, vet, dog, =cat, =cats |
| `baby` | діт, дит, малюк | kid, child, baby |
| `coins` | грош, бюджет | money, budget, cash |
| `family` | сім', сімей, родин, батьк | family, parent |
| `gift` | подарун | gift, =present, =presents |
| `hand-heart` | благодійн, донат, зсу | charity, donat |
| `bulb` | комунал, світло, електроенерг, газ, вода | utilit, electric |
| `wrench` | ремонт, майстер | repair, =fix |
| `sofa` | мебл | furniture |
| `home` | дім, дом, квартир, оренд | home, house, rent |
| `document` | рахунк, платеж, квитанц | bill |
| `shoe` | взутт | shoe |
| `shirt` | одяг | cloth |
| `bag` | покупк, шопінг, магазин | shopping, =shop |
| `laptop` | електрон, технік, гаджет | electronic, gadget, tech |
| `phone` | телефон, мобільн, зв'язок | phone, mobile |
| `wifi` | інтернет | internet, wifi |
| `cloud` | підписк, цифров, сервіс | digital, subscription, cloud, netflix, spotify |
| `heart-pulse` | здоров, лікар, лікарн, медиц, стоматолог | health, doctor, medical, dental |
| `pill` | аптек, лік | pharmacy, drug, medicine |
| `dumbbell` | спорт, фітнес, трен | sport, gym, fitness, workout |
| `sparkles` | крас, косметик, манікюр | beauty, cosmetic |
| `scissors` | перукар, послуг, барбер | barber, hair, service |
| `graduation-cap` | освіт, навчан, курс, школ, універс | education, course, school |
| `book` | книг, книж | book |
| `film` | кіно, фільм | cinema, movie, film |
| `gamepad` | ігр, гра | game, steam, playstation |
| `music` | музик, концерт | music, concert |
| `ticket` | розваг, театр, квитк | entertainment, =fun, =ticket |
| `percent` | коміс | =fee, =fees, commission |
| `bank` | фінанс, банк, кредит, страхув | finance, bank, loan, insurance |
| `briefcase` | робот, офіс | work, office, business |

Order carries meaning where two entries can match one name: `paw` before `home` («Домашні
тварини» is a pet, not a дім), `coins` before `family` («сімейний бюджет» is money), `heart-pulse`
before `pill` («Лікар» is not «Аптека», while «Ліки» still is), `dumbbell` before `briefcase`
(«Workout» is not «Робота»), `=car` a whole word so «Family care» is not «Авто», `delivery` first
so «Food Delivery» is not «Ресторан». Short Latin words that live inside longer ones are whole
words: `=cat` (not «Catering»), `=fun` (not «Fund»), `=fee` (not «Feed»).

The exact stems are implementation, tuned by `category-icon.test.ts`, which pins at least the spec
scenarios plus: every starter *name* suggests its starter icon — KrayShop alone excepted, its name
says nothing — so a starter row and a same-named hand-made row agree; «Business lunch» is not
`bus`; «Family care» is `family`; «Домашні тварини» is `paw`; «Лікар» is `heart-pulse` and «Ліки»
`pill`; «Catering» is not `paw`; «Workout» is `dumbbell`; «Кафе біля дому» is `coffee`; «Юрко» is
`tag`.
Changing the table later moves no stored icon (D8), so tuning it is safe.

### D7. `Category.iconKey` in the domain and in storage

`Category` gains `readonly iconKey?: string` — optional, because a row can exist without one for
the short window D8 describes, and because джерела (same list code) never have one. `Source` is
unchanged. Storage: `categories.icon_key TEXT` **nullable**, no default (see «DB migration»).

`namedListRepo` stays the single owner of the name and archive rules. It gains a small per-table
extension — extra columns to write on `create` and a row mapper — so `categoriesRepo.list/get`
return `iconKey`, while `sourcesRepo` passes nothing and is unchanged. `categoriesRepo` adds:

- `create({ id, name, iconKey? })` — `iconKey` absent → `startingCategoryIcon`; present → must be
  pickable.
- `update(id, { name, iconKey })` — one `{ behavior: 'immediate' }` transaction: load, refuse a
  reserved row (either field), clean the name; **only when the cleaned name differs from the stored
  one** de-duplicate it as `rename` does (so an archived Pets beside a new unarchived Pets can still
  change its icon — `rename`'s own check would refuse it even for an unchanged name); validate the
  key as pickable; then write both columns in **one** `UPDATE`. A refusal throws before any write,
  so a rejected save stores neither field. `create` refuses the two app-only keys the same way. `rename` stays for its existing callers and tests
  and never touches `icon_key`; `archive`/`unarchive` never touch it.

### D8. Filling in the missing іконки: on opening, in restore, and at display

- **On opening**: `seedStarterSet` inserts *missing* starter rows with their icons (still
  create-if-missing — seeding changes no existing row, as the categories spec requires). Right after
  it, in the same effect of `_layout.tsx`, a separate `fillMissingCategoryIcons(db)` (in
  `src/db/seed.ts`, not inside `seedStarterSet`): `SELECT id, name FROM categories WHERE icon_key IS
  NULL`, and for each an `UPDATE … SET icon_key = startingCategoryIcon(row) WHERE id = ? AND
  icon_key IS NULL` — in one immediate transaction. The `IS NULL` guard makes it idempotent and
  makes an owner's choice untouchable: a row with a key is never selected. It is a repair that runs
  every open and matches nothing from the second one on. It is not seeding, and the persistence
  delta says so, so the seeding rule "changes no row that exists" stays true.
- **At display**: the seed and the fill-in run in an effect *after* the first render, so the first
  paint after the migration can read `icon_key IS NULL`. `resolveCategoryIcon` answers
  `startingCategoryIcon` for a missing key — the very value the fill-in stores a moment later — so
  nothing flickers and nothing is ever drawn empty.
- **In restore: nothing is filled in.** `backup-repo.ts` inserts each категорія with exactly the
  `iconKey` the бекап carries, NULL when it carries none — the backup-file rule "filling in nothing
  it does not name" and the persistence rule "the категорії are exactly the snapshot's" both stay
  true. The display rule above shows the starting icon at once; the next opening's fill-in stores
  it.
- **NULL in a бекап**: a background Drive бекап (`drive-backup-task.ts`) runs with migrations
  applied and no seed, so right after an update it can snapshot категорії holding no icon. The
  snapshot therefore **omits** `iconKey` for a NULL (never writes `null` or `""`), and the parser
  reads a missing key *or* `null` as absent — the idiom `optionalString` in `format.ts` already
  uses. Only a present value that is not a non-empty string refuses the file.

### D9. Saldo commit

`import-repo.ts` inserts each proposed категорія with `startingCategoryIcon({ id: newId, name })`
(the new id is never a starter or reserved id, so this is the keyword suggestion). Matched and
redirected proposals are not in `plan.categories` at all, so they touch no existing row — the
existing structure already guarantees the spec's "leaves that іконка exactly as it was". The
import screen is unchanged; джерела get nothing.

### D10. One line model, one row component

`src/ui/transaction-line.ts` (pure) — `TransactionLine` gains:

- `icon: IconName` — the glyph (D4/D5): expense/refund → the category's resolved key's glyph;
  correction → `plus-minus`'s glyph; transfer → `transfer`; income → `income`.
- `iconTone: 'textSecondary' | 'textDanger' | 'textPositive'` — `textDanger` when `overLimit`,
  `textPositive` for a дохід, `textSecondary` otherwise. Uncategorised stays `textSecondary`: its
  highlight is the existing `Mark`, and a second signal in accent would make the list louder, not
  clearer.
- `amountTone` — the ternary the four screens copy today (дохід `textPositive`, переказ
  `textSecondary`, else default), decided once.
- A повернення: `amount` is `formatSignedMoney` («+50,00 UAH»), `amountTone` default (not the дохід
  tone), and `feedSubtitle` becomes `повернення · <рахунок> · <дата>`.

The category argument changes from a names map to a lookup of `{ name, iconKey }` by id (built
once per screen from `categoriesRepo.list()`, archived rows included), so the line resolves the
name *and* the icon from the same row.

`src/components/transaction-row.tsx` renders one `TransactionLine`: `IconTile` (hidden from
accessibility — `importantForAccessibility="no-hide-descendants"` /
`accessibilityElementsHidden`), the title with the `Mark` and the over-limit colour, the subtitle,
the опис (hidden only when the caller asks for it — «Транзакції» under «Без категорії», where the
опис already is the title, exactly as today; every other list shows it as the main-screen spec
requires), the сума in `amountTone`, `onPress`, and an optional `actions` slot under the row for
the one-tap categorisation (and `transfer-rules`' «Це переказ» once it lands). An optional `title`
override carries `searchLineTitle`. The four screens replace their copied JSX with it.
`src/ui/transaction-row-usage.test.ts` reads the four screen files by path and fails if one of them
no longer renders `TransactionRow` or calls `feedTitle`/`feedSubtitle` itself — the structural
guard that keeps "one line everywhere" true after this change — and reads
`transaction-row.tsx` to assert the tile is hidden from accessibility.

To keep every task green on its own, `transactionLine` changes its category argument and its four
callers in the same task (tasks 5.1): each screen builds the `{ name, iconKey }` lookup from the
`categoriesRepo.list()` it already loads. Switching the JSX to `TransactionRow` is separate.

### D11. The Категорії editor

- `src/ui/category-editor.ts` (pure): `{ name, iconKey, picked }` with `startAdding()`,
  `startEditing(category)`, `typeName`, `pickIcon`, `chosenIconName`. `typeName` re-suggests only
  while `!picked`; `startEditing` sets `picked: true` (a stored icon is a choice already made).
  The spec's editor scenarios are proven here.
- `src/ui/category-icons.ts` (pure): groups in grid order, key → `{ glyph, name, group }`.
- `src/ui/list-management.ts`: `ManagedRow` gains an optional `icon` (glyph, resolved) and
  `manageCategories` fills it; `canRename` is what offers the editor.
- `src/components/category-editor.tsx`: the existing `Sheet` — `Field` for the назва, the grid in
  its scroll body (group title, then cells), «Зберегти»/«Скасувати» in its pinned footer, «Обрано:
  <name>» written above the footer. Cells are 48×48 (`TouchTarget`) with a 40pt tile;
  `accessibilityRole="radio"`, `accessibilityLabel` the Ukrainian name,
  `accessibilityState={{ checked }}`, the grid a `radiogroup`. The cell's size is `TouchTarget`,
  which a structural test reads from `category-editor.tsx`; the smoke's `uiautomator dump` checks
  the real bounds. Chosen cell: 2pt `accent` outline,
  `accentSurface` fill, glyph in `accent` — the outline is the non-colour signal, the written name
  the second one. The phone's «назад» closes the sheet first (`useCloseOnBack`).
- `ManageListScreen` gains optional `leading` (draws the tile) and `editor` (when given, «Додати»
  and the row's «Змінити» open it instead of the inline field). `src/app/manage/sources.tsx` passes
  neither and is unchanged. Refusals keep going through `attempt` with the verbs `create`/`edit`,
  so the журнал names them (`categories-edit`) and carries no назва.

### D12. Tone and the dark theme

Tile: `backgroundInset`. Glyph tones allowed on a line or a breakdown row: `textSecondary`,
`textDanger`, `textPositive`; in the grid additionally `accent` on `accentSurface`. Measured
contrast against the tile (WCAG 1.4.11 asks 3:1 for graphics):

| Theme | textSecondary | textDanger | textPositive | accent (on accentSurface) | textMuted |
| --- | --- | --- | --- | --- | --- |
| light | 4.97 | 5.04 | 4.27 | 3.85 | 2.97 ✗ |
| dark | 6.24 | 5.76 | 7.88 | 7.04 | 3.20 |

So `textMuted` is never an icon tone (an archived row mutes its *name*, not its tile).
`src/ui/category-icons.test.ts` computes these ratios from `Colors` for both themes and fails below
3:1 — the dark-theme acceptance case under `verify`; the emulator smoke in night mode is the visual
half.

### D13. Місяць breakdown

`MonthBreakdownRow` gains `icon` and `iconTone` from the same resolution (the correction row gets
`plus-minus`); `month.tsx` draws an `IconTile` before the label. Sorting stays `byAmountThenLabel`
— the icon is not an input. There is no donut chart in the app today; nothing here adds one.

## DB migration

**What changes**: `src/db/schema.ts` — `categories` gains `iconKey: text('icon_key')`, nullable,
no default, no CHECK.

**Generated, never hand-written**: `npm run db:generate`. The expected SQL is a single
`ALTER TABLE \`categories\` ADD \`icon_key\` text;`. SQLite adds a nullable column in place: no
`__new_categories` recreate, so the three foreign keys pointing at `categories.id`
(`transactions.category_id`, `rules.category_id`, `category_limits.category_id`, all `restrict`)
are never exercised, and no row is copied. **If drizzle-kit generates a table recreate instead,
stop and ask the owner** — a recreate of a table three others reference under the migrator's own
`BEGIN` (where `PRAGMA foreign_keys=OFF` is a no-op) is exactly the kind of migration that loses
rows.

**No data statement in the migration.** Filling in the icons needs the keyword table, which is
TypeScript; and `.claude/rules/database.md` allows a hand-written data statement only when the
schema change cannot land without it — this one lands fine with NULLs. The fill-in is D8.

**Why nullable, not `NOT NULL DEFAULT 'tag'`**: a default would make "never assigned" and "the
owner chose «Інше»" the same value, and the fill-in could then never tell which rows to suggest
for without a second flag column. NULL *is* that flag, and it only lives until the first opening.

**Numbering and the tripwire**: this change is applied after `transfer-rules` is committed, so its
migration is generated on top of that one and takes the next number; `BACKUP_SCHEMA_VERSION` goes
up by one from whatever it is then (`format.test.ts` fails until it equals the journal length).
Never generate both migrations in parallel worktrees: two `0001_*` files and two journals cannot
be merged by hand without editing a generated file.

**Tests** (`src/db/migrations.test.ts`): apply every migration *before* this one to an empty
database, store a renamed starter категорія, an archived one, a правило onto it, a ліміт on it, a
витрата, a повернення and a коригування; apply the new migration; assert every row loads unchanged
and every `icon_key` is NULL; run the seed and the fill-in; assert the starting icons per the
persistence scenarios and that seeding alone changed no existing row; run both again; assert
nothing changed. Plus "a fresh database from migrations alone
stores an іконка".

**Rollback**: none — migrations are append-only. The column is inert to an older build's queries
(Drizzle selects columns by name), but an older build cannot open a database migrated past its own
journal anyway; going back means restoring a бекап made before the upgrade.

## Backward compatibility

| Situation | What happens |
| --- | --- |
| Existing install upgrades | Migration adds the NULL column; first frame resolves NULL to the starting icon (D8); the seed's fill-in stores exactly that; nothing else moves. |
| Starter row the owner renamed | Starting icon by **id** — Groceries renamed «Їжа» wears «Продукти». |
| Категорія the owner made by hand before this change | Keyword suggestion from its current назва, else «Інше». |
| Archived категорія | Filled in like any other; archive flag untouched. |
| Reserved rows | Always their fixed icons; the stored value is filled for uniformity but never read for them. |
| Бекап written **before** this change, restored after | Accepted (older storage shape). Each категорія is inserted exactly as carried — no icon; it is *shown* with its starting icon at once and *stored* with it at the next opening. The checksum is over the file's own contents, which never had the field — unaffected. |
| Бекап written after the update but before the first opening (background Drive бекап) | Категорії holding no icon are written without `iconKey`; the file parses and restores like an old one for those rows. |
| Бекап written **after**, restored on an older build | Refused as from a newer storage shape — the existing rule, nothing new to build. |
| Бекап with an `iconKey` this build does not know (a newer build that added a picture without a migration) | Stored verbatim, drawn as «Інше», written back verbatim into the next бекап — never lost by passing through. |
| Бекап with `iconKey` present but not a non-empty string | Refused as damaged, whole, before anything local is touched (`categoryAt` replaces `namedAt` for категорії; джерела keep `namedAt`). |
| `BACKUP_FORMAT_VERSION` | Unchanged (2): the envelope is the same; a категорія simply names one more optional field. |
| `BACKUP_SCHEMA_VERSION` | +1 — the tripwire's rule, and what makes an older build refuse the new бекап. |
| Saldo import on an upgraded phone | Matched rows keep their icons; created ones get suggestions. |
| Google Drive версії бекапу | Same file format — sealed as before; nothing about the seal changes. |
| AI-аналіз пакет | Built from `CategoryReport`s (names and numbers), never a whole `Category` object — the icon cannot leak. A test pins it. |
| Screens not in scope (pickers, Звіти, чернетки, import flow) | Unchanged; they read `name` and ignore `iconKey`. |

## Risks / Trade-offs

- [Glyph quality — hand-drawn (D2), and the spec cannot see pictures; `verify` only proves them
  well-formed] → simple shapes, batch contact sheets at 20pt and 40pt in both themes saved in the
  change folder, redraw before moving on; the emulator smoke judges them at real size.
- [Keyword false positives — «Business lunch» → bus, «Газета» → комунальні via `газ`] → whole-word
  entries for short Latin keywords, stems chosen to start words, a test list of known traps; and it
  is only ever a *first* choice the owner changes in one tap.
- [Two categories end up with the same icon] → acceptable and expected (Family care and a
  hand-made «Сім'я»); the icon helps scanning, the назва decides.
- [Conflict with `transfer-rules` in the four screen files and in the migration journal] → apply
  after it lands (proposal Coordination); the row's `actions` slot is where its «Це переказ» goes.
- [`home-dashboard-redesign` redraws Головний in parallel and ADDs its own feed requirement:
  "a category/type icon plus text" and signed суми — витрата «−», дохід/повернення «+», коригування
  its sign, переказ an arrow] → the two agree on the icon and on the повернення's «+»; this delta
  deliberately pins no sign for a витрата or a коригування so the two ADDED requirements do not
  contradict each other. Whichever change is applied second draws its feed through
  `TransactionRow` and puts the other's sign rule into `amount` there, not into a second row; the
  structural test fails if Головний stops rendering it.
- [Fill-in runs after the first render] → the display resolves NULL to the same starting icon, so
  the window shows the right picture rather than a fallback.
- [An owner's pick of «Відсоток» for an ordinary категорія looks like «Комісія»] → accepted: only
  «Питання» and «Плюс-мінус» are state markers and those are app-only.

## Migration Plan

1. Land `transfer-rules` first (its migration and schema version bump).
2. Apply this change: schema edit → `npm run db:generate` → inspect the SQL is one `ADD` (else
   stop) → migration test → `BACKUP_SCHEMA_VERSION` + 1.
3. Before installing the new build on the emulator, make a бекап with the old build; after
   installing, restore it — the real "old бекап restores with starting icons" check.
4. No manual step for the owner: icons appear on the first opening after the update.
