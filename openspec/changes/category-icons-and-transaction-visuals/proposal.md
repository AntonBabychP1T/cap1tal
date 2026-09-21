## Why

Every list of транзакції reads as a column of text today: a витрата in Groceries, a переказ between
two cards, a дохід «Без джерела» and a коригування all open with the same kind of words in the same
place, so the owner has to *read* each line to see what it is. A повернення is worse — its line
looks exactly like a витрата of the same сума. Finding "where money went" in the feed, in
«Транзакції» or in a рахунок's рухи is slower than it needs to be.

This is problem one of the vision — *where money went*. A stable picture per категорія, and a
distinct one per kind of транзакція, lets the eye find where a month's money went before a single
word is read; the words stay exactly where they are.

## What Changes

- **Every категорія carries an іконка** — a picture from the app's own fixed catalogue, stored with
  the row under a stable key the app owns (never a library's glyph name, never a remote image,
  never an emoji). A stored key the catalogue does not know draws the generic іконка; nothing is
  ever drawn broken or empty.
- **The catalogue**: 48 pickable іконки grouped by meaning (їжа, транспорт, дім, покупки, техніка
  і зв'язок, здоров'я і краса, навчання, подорожі, дозвілля, люди і тварини, гроші, інше), plus two
  that only the app uses — «Питання» for «Без категорії» and «Плюс-мінус» for коригування.
- **Reserved категорії have fixed іконки**: «Без категорії» → «Питання», «Комісія» → «Відсоток»,
  «Коригування» → «Плюс-мінус». They cannot be changed, like their names.
- **Starting іконки are deterministic, never AI**: the starter set has an explicit іконка per row;
  any other name — typed by the owner, imported from Saldo, or already on the device — gets one
  from a small keyword table («кафе»/«coffee» → «Кава», «транспорт»/«transport» → «Авто», …), and a
  name nothing matches gets the generic «Інше». This is only the *first* choice: once stored, an
  іконка changes only when the owner changes it — a rename never recomputes it.
- **The Категорії section edits назва and іконка together**: creating asks for a назва and shows a
  compact grid of every pickable іконка (preselected from the typed назва until the owner picks one
  themselves); editing changes either or both in one save. Archiving is unchanged. Every grid cell
  names itself to a screen reader, and the chosen one is marked by more than colour.
- **One transaction line for every list**: the feed on Головний, «Транзакції», a рахунок's рухи and
  a категорія's month list draw the same line, which now leads with a tile: the категорія's іконка
  for a витрата and a повернення, «Переказ» for a переказ, «Дохід» for a дохід, «Плюс-мінус» for a
  коригування. A повернення says «повернення» in words and shows its сума with «+». The line keeps
  every word it has today — назва/опис, рахунок or both рахунки, сума, the marks.
- **Місяць**: each row of «Витрачено за категоріями» carries its категорія's іконка. No chart
  depends on an іконка.
- **One calm tone**: every категорія's іконка is drawn in the same neutral tone on the same tile.
  Colour changes only together with a state the line already marks (the over-limit red its назва
  already turns, the дохід tone its сума already has). The tones stay legible in the dark theme.
- **Storage and бекап** — see design «DB migration» and «Backward compatibility»:
  one new append-only migration adding a nullable column to `categories` (no table rebuild); a
  категорія without an іконка is shown with its starting one from the first frame and is given it in
  storage on that opening; the бекап carries each категорія's іконка; a бекап written before this
  change restores exactly as written and its категорії get their starting іконки the same way.
- Glossary: new term **іконка категорії** (category icon).

### Non-goals

- **Іконки for джерела.** A дохід line shows the one «Дохід» іконка whatever its джерело; джерела
  gain no column and no picker. A later change may add them without touching this one's storage.
- Іконки in the entry form's pickers, on Звіти, in the Saldo import flow, in rules or ліміти lists,
  or on чернетки. Those surfaces keep their text as it is.
- Per-destination переказ іконки (інвестиція vs банка vs борг): every переказ shows «Переказ».
- Colour per категорія, user-picked colours, custom or imported images, emoji as іконки.
- Any number: an іконка enters no total, no ліміт, no ціль, no звіт and no пакет для аналізу.
- A chart that depends on an іконка (the future donut on Головний, if any, stays text-legended).
- Changing archive, rename-uniqueness or reserved-row rules of the categories capability.
- Vision §14.8 (category hierarchy and tags) is **not** touched: an іконка is a picture on one
  flat row, not a tag and not a group. The generic іконка is drawn as a label shape; its name is
  «Інше».

## Capabilities

### New Capabilities

None — an іконка is an attribute of a категорія, so it lives in `categories`.

### Modified Capabilities

- `categories`: every категорія carries an іконка from the catalogue; reserved rows have fixed ones;
  starting іконки for the starter set and for any other name are deterministic; the owner chooses
  it on creation and can change it; rename and archive keep it; an unknown key draws the generic one.
- `settings-screen`: the Категорії section shows each row's іконка and creates/edits a категорія
  with a назва and a grid of іконки, accessibly, the chosen one obvious.
- `main-screen`: the transaction line (feed, «Транзакції», рухи, a категорія's month) leads with the
  іконка of what the транзакція is; a повернення says so in words; one neutral tone, legible in
  both themes.
- `month-screen`: breakdown rows carry their категорія's іконка.
- `saldo-import`: a категорія the import creates starts with the іконка its Saldo name suggests.
- `persistence`: a категорія's іконка survives a restart; it arrives by a new migration that keeps
  every stored row; categories stored before it get their starting іконка on the next opening.
- `backup-file`: the бекап carries each категорія's іконка; an older бекап restores with starting
  іконки; a malformed іконка value refuses the file.

## Impact

- **Storage**: `src/db/schema.ts` (`categories.icon_key`, nullable text) + one generated migration
  in `drizzle/`; `src/db/categories-repo.ts` (create with іконка, change іконка, update назва and
  іконка as one write), `src/db/seed.ts` + `src/db/starter-set.ts` (explicit starter іконки, the
  fill-in of missing ones), `src/db/import-repo.ts` (Saldo commit), `src/db/backup-repo.ts`.
- **Domain / pure**: new `src/domain/category-icon.ts` (the key vocabulary, reserved icons,
  keyword suggestion, resolution); `src/domain/category.ts` (`Category.iconKey`).
- **UI (pure)**: `src/ui/icons.ts` gains the new glyphs; new `src/ui/category-icons.ts` (key →
  glyph, Ukrainian name, group); new `src/ui/category-editor.ts`; `src/ui/transaction-line.ts`
  (the line's іконка, tone and повернення wording); `src/ui/list-management.ts`,
  `src/ui/month-screen.ts`.
- **Components / screens**: new shared `src/components/transaction-row.tsx` used by
  `src/app/(tabs)/index.tsx`, `src/app/transactions.tsx`, `src/app/account/[id].tsx`,
  `src/app/category/[month]/[categoryId].tsx`; the Категорії section gets its own editor
  (`src/app/manage/categories.tsx`, a sheet on the existing `Sheet`); `src/app/(tabs)/month.tsx`.
- **Бекап**: `src/backup/format.ts` (`BACKUP_SCHEMA_VERSION` +1 — the migration tripwire;
  `BACKUP_FORMAT_VERSION` unchanged; optional `iconKey` on a категорія).
- `docs/glossary.md` (іконка категорії), `docs/app-overview.md` (screenshots of the new rows).
- **No new dependency, no native change, no Expo config change**: glyphs are drawn by the existing
  stroke-glyph table over `react-native-svg`, already in the app, with the new glyphs drawn by hand
  (owner's decision). `expo-symbols` (in `package.json` from the template, unused) is deliberately
  not adopted — see design.
- **Coordination**: `transfer-rules` (in flight) adds its own migration and bumps
  `BACKUP_SCHEMA_VERSION`, and edits the «Без категорії» action area of the feed. Apply this change
  after it lands; the migration number and schema version are whatever is next at that moment.
  `home-dashboard-redesign` (in planning) ADDs its own feed requirement asking for "a
  category/type icon plus text" and signed суми (витрата «−», повернення «+»): the two agree on the
  icon and on the повернення, and this change pins no sign for a витрата or a коригування so the two
  ADDED requirements do not contradict. Whichever is applied second draws its feed through this
  change's shared line, not a new one (design, Risks).
