## Context

See proposal.md for the motivation. What shapes the approach:

- **Categorisation** has two tiers read from one place: `categorisationContext` in
  `src/db/categorisation.ts` (rule-template T4). It feeds the monobank sync, the notification
  drain, the entry form and every розбір. `src/domain/rules.ts` holds the ladder: `matches`,
  `specificity`, `patternLength`, `beats`. Matching folds case with `foldCase`, the app's one fold
  (search-fold-speed D1), and nothing else.
- **`proposeMerchantPattern`** (`src/domain/rules.ts:258`) takes the leading run of letters, up to
  two words. «Оплата послуг АТБ» gives «оплата послуг».
- **Search** (`transactionsRepo.search`, transaction-search D12) narrows in SQL. It judges the опис
  in JS, because SQLite's `LIKE` folds only ASCII. A typed search is memoised under the change
  stamp, then paged.
- **The пакет** groups merchants by `foldMerchant(опис)` (`src/analysis/details.ts`). The in-flight
  спостереження proposal reuses the same key.
- **The MCC** is read by `mapStatement` (`src/monobank/api.ts:312`) and handed to matching at
  import (`src/monobank/sync.ts:399`). After that it is dropped: `transactions` has no column for
  it, and the розбір says so in its own comment.
- **`transactions` cannot be rebuilt** under the migrator's transaction. `fiscal_receipts`
  cascades off it, and `PRAGMA foreign_keys=OFF` is a no-op there (schema comment on
  `counterpart_income_awaits`). **`rules` is referenced by no table.**

## Goals / Non-Goals

**Goals:**
- One pure recogniser, one answer per опис, used by every reader: lines, search, правила, the
  пакет, «Без продавця», and later the спостереження and the local model.
- No derived data stored. A написання change is visible everywhere on the next read, with no pass
  over транзакції.
- The rule ladder keeps its exact semantics. A продавець-правило is defined in terms of a
  pattern-правило, so no new ranking concept appears.
- The MCC lands with a plain added column: no rebuild of `transactions`, no backfill.

**Non-Goals:**
- A built-in довідник продавців. The storage shape leaves room for one later: a stored продавець
  could carry the key of a довідник entry it adopted. No column is added for it now.
- Faster substring matching (Aho–Corasick, an FTS index, a folded shadow column) before a
  measurement asks for it.

## Decisions

### M1 — The продавець is read, never stored

`src/domain/merchants.ts` exports `merchantIndex(merchants)`, which returns a `MerchantIndex` with
one method, `recognise(description) → { merchantId, spelling } | undefined`.

- The index holds every написання, sorted by folded length descending, then by `addedAt`
  descending, then by id. `recognise` returns the first one the folded опис contains.
- Results are memoised per опис string inside the index. A history of 10 000 транзакції carries a
  few hundred distinct описи, so a read costs about (distinct описи × написання) substring checks
  once, plus a map lookup per row.
- An index is built per read from the продавці the read loaded. Repositories expose
  `merchantsRepo.index()`, and every reader takes the index as a value, the way it takes the
  правила.

*Alternative: a `transactions.merchant_id` column kept in step by a re-recognition pass.* Rejected
for three reasons:
- it is derived data that every написання edit, merge, deletion, restore and import would have to
  rewrite;
- the rewrite would sit on the one table that cannot be rebuilt;
- a бекап would carry a second, possibly contradictory, copy of what the описи already say.

Search already judges in JS (D12), so the column would buy SQL speed that no reader needs.

### M2 — One fold, one matcher

Recognition is `foldCase(опис).includes(написання)`. The написання is stored already folded and
trimmed. Whitespace is not collapsed and scripts are not transliterated, exactly as for a
правило's pattern. Two matchers that disagreed about «ATB  MARKET» would let a продавець-правило
and a pattern-правило with the same text rank differently.

*Alternative: collapse whitespace as `foldMerchant` does.* Rejected for recognition. `foldMerchant`
stays as the пакет's fallback grouping key, where it already lives.

### M3 — A продавець-правило is the pattern-правило of its recognising написання

`Rule` gains `merchantId?: string`. `RuleTiers` gains `merchants: MerchantIndex`, a required
field, and `matchRule` and `matchCategory`, which take `rules: Rule[]` rather than tiers, gain a
required `merchants: MerchantIndex` argument. Each of them (`resolveTarget`, `resolveCategory`,
`matchRule`, `matchCategory` and `sweepUncategorised`) calls `merchants.recognise(description)`
itself, once per decided input, and hands the answer (`recognised`) to `matches` and
`patternLength`. No caller computes
recognition. A caller that cannot build a `RuleTiers` without an index cannot skip it, because the
type does not compile.

- `matches`: a rule with `merchantId` requires `recognised?.merchantId === rule.merchantId`, plus
  the MCC when the rule has one.
- `specificity`: a merchant criterion counts whether it is a pattern or a продавець.
- `patternLength`: for a продавець-правило, the folded length of `recognised.spelling`.

`beats` is unchanged. This is the spec's sentence «ranks exactly as a rule carrying, as its
pattern, the написання that recognised the description», in code.

`categorisationContext` reads the index with the правила. The four deciding callers get
recognition from the same place they get the правила (rule-template T4), and none of them can
forget it. One test per caller covers the monobank sync, the чернетка at drafting and confirmation,
the entry form and the розбір («A правило naming a продавець decides wherever a категорія is
decided»). The правило offer's «already covered» check (`src/ui/list-management.ts`, through
`matchRule`) is a fifth caller and is tested by «A правило naming the продавець already covers
it». The шаблон tier ignores `recognised`, because a шаблон rule
never has a `merchantId`.

*Alternative: продавець-правила above all pattern-правила.* Rejected:
- a branch-specific pattern such as «атб 421 → Eating out» would become unreachable unless the
  branch were made a продавець of its own;
- an existing pattern-правило would silently lose to a new продавець-правило of the same length,
  and the owner would see no reason why.

### M4 — One proposal heuristic, two callers

`proposeMerchant(description) → { name, spelling } | undefined` implements the merchants spec's
four steps. `SERVICE_WORDS` is a named, exported constant. Only the longest service word the
folded опис begins with is considered. It is skipped when it is followed by `/[\s\p{P}]+/u` and
then by anything else. When nothing follows it, nothing is skipped and no shorter service word is
tried, so «Оплата послуг» alone proposes «Оплата послуг», not «послуг». The name is the опис's own
text up to the end of its second word, inner spacing kept, so the написання always occurs in the
опис.

`proposeMerchantPattern(description)` becomes `proposeMerchant(description)?.spelling`, so the
pattern offered for a правило and the написання offered for a продавець can never drift apart.

The title-casing rule (all capitals, longer than three letters) works per word over `\p{L}+`
runs. It uses `toLowerCase` and `toUpperCase` directly, like `foldCase`, with no locale argument
(search-fold-speed D1).

### M5 — Storage shape

The new tables:
- `merchants`: `id` text pk, `name` text not null, `name_key` text not null unique, `created_at`
  integer timestamp_ms not null. `name_key` holds `foldCase(name.trim())`. It is written by the
  repository, because SQLite's `lower()` folds ASCII only, so a unique index on `lower(name)`
  would let «АТБ» and «атб» coexist. A CHECK keeps `length(trim(name)) > 0`.
- `merchant_spellings`: `id` text pk, `merchant_id` → `merchants.id` **ON DELETE CASCADE** (the
  spec: «SHALL remove a продавець's написання together with it»), `spelling` text not null unique,
  `created_at` integer timestamp_ms not null. CHECKs keep `length(trim(spelling)) > 0` and
  `spelling = trim(spelling)`. The folding itself is the repository's job.

The changed tables:
- `rules.merchant_id`: → `merchants.id` **ON DELETE RESTRICT**, so storage refuses to delete a
  продавець a правило names, which is the spec's refusal.
  - `rules_criterion_present` widens to `merchant IS NOT NULL OR mcc IS NOT NULL OR merchant_id IS
    NOT NULL`.
  - A new `rules_one_merchant_criterion` holds `merchant IS NULL OR merchant_id IS NULL`.
  - Changing CHECKs makes drizzle-kit emit a `__new_rules` rebuild. That is safe only because no
    table references `rules`. Task 3.1 asserts this with a migration test that stores rules of
    every shape, правила-перекази included, and reads back identical rows, `created_at` included.
- `transactions.mcc`: a nullable integer, emitted as `ALTER TABLE … ADD mcc integer`. It gets no
  CHECK and stays outside `transactions_shape`, exactly like `description`: a CHECK on it would
  rebuild `transactions`. `mapStatement` already refuses a non-integer MCC. The only other writer
  is a restore, and the restore validator refuses a non-integer MCC (M12).

There is one migration, numbered with the next free number when it is generated.
`observations-and-month-summary` also wants one, so whichever change lands second regenerates its
own number. No data statements are needed: old транзакції carry no MCC, and no продавець is
created on the owner's behalf.

### M6 — A change to the продавці sweeps inside its own transaction

The repository methods `name`, `addSpelling`, `removeSpelling`, `merge` and `remove` each open one
`immediate` transaction. Inside it they write, then call `sweepStored(tx, now)` with a context read
inside the same transaction. A продавець stored while its розбір failed therefore cannot exist
(same rule as rule-template T5). `rename` does not sweep. Each method returns the `SweepCounts` the
screen reports.

`merge(fromId, intoId)` runs these steps:
1. `UPDATE merchant_spellings SET merchant_id = intoId WHERE merchant_id = fromId`;
2. `UPDATE rules SET merchant_id = intoId WHERE merchant_id = fromId`;
3. delete `fromId`;
4. sweep.

### M7 — Search and the продавець narrowing are judged in JS

`SearchMatch` gains `merchantIds`: the продавці whose назва contains the typed text, resolved in
`searchCriteria` like `categoryIds`. `satisfies` takes the index and also matches when
`recognise(t.description)?.merchantId` is in `merchantIds`.

The narrowing by продавець (`merchantId` in the search input, and the `?merchant=` route
parameter) is exact. It goes through the judged and memoised path even when nothing is typed, and
keeps a row only when `recognise(t.description)?.merchantId === merchantId`. That is the one
exception to «the unsearched listing reads one page from storage», and the transaction-search delta
modifies that requirement to say so. A продавець's matches are memoised like a search's, so «Показати
ще» slices them without a second read. `persistence`'s search requirement is modified to the same
effect. SQL pre-narrows to
`description IS NOT NULL`. An unknown id narrows nothing, as the spec says, and the route resolver
checks the id against the stored продавці. The memo key gains the продавці change stamp, so a
написання edit invalidates it.

### M8 — The пакет groups by the recognised продавець

`merchantsOf` in `details.ts` takes the index and keys each витрата by `merchant:<id>`. When the
опис is not recognised, the key is `opis:<foldMerchant(опис)>`. The row's `merchant` label is the
продавець's назва or the folded опис. Grouping stays per currency, as today. The recurring
candidates use the same key.

The privacy rule needs no new code path: `merchantsOf` runs only when «Продавці» is on, and a
написання is never put in a row. `privacy.test.ts` gains a case that serialises a пакет built with
описи off and searches it for every назва and написання.

`buildPackage` takes the index as a new input. The AI-аналіз screen reads it with the rest.

### M9 — Lines show the назва

`transactionLine` (`src/ui/transaction-line.ts`) takes the index and puts `descriptionShown` on the
line: the назва when the опис is recognised, the опис otherwise. `transaction-row.tsx` itself is
unchanged: it draws the text its `description` prop is given, and the four screens that draw lines
(Головний, «Транзакції», a рахунок's рухи, a категорія's month) pass `line.descriptionShown` into
it. The index is the last, defaulted argument of `transactionLine` so the existing callers and
tests keep their shape; a source-text test (`transaction-search.test.ts`, "every screen that draws
transaction lines recognises their описи") holds every screen to passing it. `searchLineTitle`
under «Без категорії» uses the same field. Editing keeps reading `description` for the опис field
and gets a «Продавець» row from the stored продавці plus the index.

### M10 — «Без продавця»

`src/ui/merchants-screen.ts` provides `namelessGroups(transactions, index)`. It keeps the витрати
and повернення whose опис is unrecognised and groups them by `proposeMerchant(опис).spelling`. It
orders the groups by count descending, then by the latest транзакція's `(date, createdAt, id)`
descending, and returns `{ groups: first NAMELESS_LIMIT, more }`, where `NAMELESS_LIMIT` = 20 is a
named constant.

The screen reads the транзакції once with `storedHistory`, the existing whole-history reader,
and filters to витрати and повернення carrying an опис in JS. It does not page, because the
grouping needs the whole set.

### M11 — The MCC on the domain транзакція

`Expense`, `Income`, `Transfer`, `Refund` and `Correction` gain an optional `mcc?: number`, beside
`description` and with the same carry-through rules:
- `retype` (`src/ui/retype.ts`) and every editing path copy it the way they copy `description`;
- the mappers read and write the column;
- `mapStatement` already has the value. `sync.ts` puts it on the транзакція it saves, and on a
  переказ made by a правило-переказ.

The sweep's input already accepts `mcc` (`matches` reads `transaction.mcc`). `sweepUncategorised`
now passes the stored one instead of nothing.

### M12 — The бекап

The бекап carries:
- `merchants` and `merchantSpellings` as optional sections;
- `merchantId?` on rule rows;
- `mcc?` on transaction rows.

The envelope's format version is unchanged. The storage-shape version rises with the migration,
as every migration raises it. The restore validator refuses, before anything local is touched, every contradiction the
backup-file delta lists:
- a правило naming an absent продавець;
- a написання whose продавець is absent, a duplicate написання, and a blank or unfolded написання;
- two продавці with one name key, a blank назва, and a продавець with no написання. Storage cannot
  enforce «at least one написання», so the validator is the only guard for a restore;
- a правило naming both a pattern and a продавець;
- a non-integer MCC.

`BACKUP_TABLES` gains the two tables in insert order: `merchants`, then `merchant_spellings`, then
`rules`. A UNIQUE violation therefore never happens halfway through a restore, because the validator
has already refused the file.

## Risks / Trade-offs

- **A broad написання recognises too much.** «кава» would claim «кавамашина Rozetka».
  → The продавець's screen shows its count and «Транзакції», so a wrong recognition is visible
  where it is managed. A правило naming it reports what its розбір moved. Removing the написання
  undoes the recognition at once (M1).
- **The owner's own note is shown as the назва in the feed.** «подарунок з ашану» reads «Ашан».
  → Editing always shows the опис as stored. This behaviour is [PROPOSED] in the proposal so the
  owner can overturn it after living with it.
- **Recognition cost on a long history.** → Distinct описи are memoised. The search memo already
  holds the matches under the change stamp. Task 4.4 measures a 10 000-row history with 300
  написання on the emulator and records the number. The next step, if it is ever needed, is an
  Aho–Corasick automaton inside `MerchantIndex`, with no interface change.
- **The `rules` rebuild.** → Nothing references `rules`. The migration test reads back rows of
  every shape. The guard hook keeps committed migrations immutable.
- **The migration number collides with `observations-and-month-summary`.** → The second change to
  land regenerates its migration (M5).
- **`category-icons-and-transaction-visuals` edits `transaction-row.tsx`.** → This change leaves
  that file alone: the screens pass `line.descriptionShown` into its `description` prop (M9), so
  any conflict is a line at a call site.
- **Spec drift with the спостереження change.** Its proposal keys продавці by `foldMerchant`, and
  already records this overlap. → Whichever change lands second owns the delta that moves the
  продавець-based detectors onto the `MerchantIndex` key. This change does not touch them.
- **`commitments` (in progress)** also adds a migration and бекап tables, and its ознака is a
  substring of the опис like a написання. → The migration number is regenerated by whichever lands
  second (M5). The glossary task records the distinction: a написання recognises who was paid
  everywhere, while an ознака only links a витрата to one зобовʼязання.
- **Other lists that show an опис.** A рахунок's рухи read «as the latest-transactions feed reads»
  (accounts-screen), so they show the назва through the same `transactionLine`. A розстрочка's
  «Обрати списання» candidates keep the опис as stored: they exist to match the bank's text against
  a платіж, and the назва would hide which spelling is which.

## Migration Plan

1. Generate the migration from the `schema.ts` changes, then check that the SQL holds the
   `__new_rules` rebuild and a plain `ALTER TABLE transactions ADD mcc`. Nothing else may touch
   `transactions`.
2. No backfill. An app opened after the update shows every транзакція as before, with no продавець
   until the owner names one.
3. Rollback: an older app refuses a бекап of the newer storage shape (existing behaviour), and the
   phone's database is not downgraded. A rollback is a reinstall plus a restore of a бекап written
   before the update.
