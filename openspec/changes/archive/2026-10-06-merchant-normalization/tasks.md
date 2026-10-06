## 1. The продавець in the domain

- [x] 1.1 Write `src/domain/merchants.ts` with three parts (design M1, M2):
  - the `Merchant` and `MerchantSpelling` types;
  - name and написання validation (blank; the name key folded and trimmed);
  - `merchantIndex(merchants).recognise(description)`, memoised per опис.

  Tests in `src/domain/merchants.test.ts` prove:
  - "A продавець is stored with its назва and написання" (the написання folded);
  - "A spelling with a branch number and a city is recognised";
  - "Both scripts are recognised when both are written";
  - "No transliteration between scripts";
  - "The longest написання wins";
  - "A tie goes to the newest написання";
  - "A транзакція without an опис has no продавець";
  - "A повернення and a дохід are recognised too".
- [x] 1.2 Add `SERVICE_WORDS` and `proposeMerchant(description)` to `src/domain/merchants.ts`
  (design M4), and make `proposeMerchantPattern` in `src/domain/rules.ts` return
  `proposeMerchant(…)?.spelling`.
  - Tests in `src/domain/merchants.test.ts` prove the nine scenarios of "A назва and a написання
    are proposed from an опис", including "A longer service word alone is not cut down to a
    shorter one" and "The spacing the bank wrote is kept", plus a property test that the proposed
    написання always occurs in its folded опис.
  - `src/domain/rules.test.ts` proves "Service words are skipped in the proposed pattern".
  - Every existing pattern-proposal test stays green.

## 2. A правило that names a продавець

- [x] 2.1 Add `merchantId` to `Rule`, a required `merchants: MerchantIndex` to `RuleTiers`, and a
  required index argument to `matchRule` and `matchCategory`. Make the tier decision recognise the
  опис itself and hand the answer to `matches`, `specificity` and
  `patternLength` (design M3), and refuse a rule naming both a pattern and a продавець in the rule
  validation.

  Tests in `src/domain/rules.test.ts` prove:
  - "A продавець matches every spelling it is recognised by";
  - "A продавець ranks as long as its recognising написання";
  - "A продавець rule follows recognition, not a bare substring";
  - "A rule naming both a pattern and a продавець is rejected";
  - that every existing ladder scenario is unchanged.
- [x] 2.2 Teach the правило offer (the domain decision behind `use-rule-offer.ts`) to propose the
  recognised продавець, to switch to the pattern proposed from the опис, and to be suppressed by a
  правило naming the продавець.

  Tests prove:
  - "A recognised опис offers its продавець";
  - "The продавець can be replaced by a pattern";
  - "A recognised опис offers a правило-переказ naming its продавець";
  - "A правило naming the продавець already covers it";
  - "Categorising an imported витрата offers the правило" (reworded).

## 3. Storage

- [x] 3.1 Add the storage shape to `src/db/schema.ts` (design M5):
  - the tables `merchants` (with `name_key`) and `merchant_spellings`;
  - `rules.merchant_id` with the widened `rules_criterion_present` and the new
    `rules_one_merchant_criterion`;
  - `transactions.mcc`.

  Run `npm run db:generate`, then check by reading the SQL that `rules` is rebuilt and that
  `transactions` only gets `ADD mcc`. A test in `src/db/migrations.test.ts` proves "Existing data
  survives the migration": rules of every shape, правила-перекази and фіскальні чеки included,
  read back identical, `created_at` included.
- [x] 3.2 Write `src/db/merchants-repo.ts`: `list`, `index`, `name` (a new продавець, or a
  написання added to an existing one), `rename`, `addSpelling`, `removeSpelling`, `merge` and
  `remove`.

  Tests in `src/db/merchants-repo.test.ts` prove:
  - "A продавець comes back whole";
  - "A new продавець from an опис";
  - "A spelling added to an existing продавець";
  - "A rename keeps every написання";
  - "A removed написання stops recognising";
  - "One написання, one продавець";
  - "A продавець a правило names stays";
  - "A removed продавець takes its написання";
  - "A blank назва is refused";
  - "A назва differing only in case is the same назва";
  - "A написання belongs to one продавець only";
  - "A продавець with no написання is refused";
  - "A написання that is not in the опис is refused";
  - "The last написання cannot be removed";
  - "A merge keeps every spelling and every правило";
  - "A продавець cannot merge into itself";
  - "A продавець named by a правило is kept";
  - "A deleted продавець leaves its history as it was".
- [x] 3.3 Make `categorisationContext` read the `MerchantIndex`, and make every mutating method of
  `merchantsRepo` except `rename` sweep «Без категорії» in its own `immediate` transaction and
  return the counts (design M6). `rulesRepo` stores and validates `merchantId`.

  Tests prove:
  - "A rule naming a продавець is stored";
  - "A rule naming an unknown продавець is rejected";
  - "A spelling added to a продавець that a правило names fills the gap";
  - "A change that moves nothing says nothing";
  - "A правило naming a продавець sweeps every spelling";
  - "A new написання reaches the history at once";
  - "Recognition alone categorises nothing";
  - "A продавець changes no number";
  - "A rule switched from a pattern to a продавець".

  One test per deciding caller proves "A правило naming a продавець decides wherever a категорія is
  decided": "The monobank sync honours a продавець" in `src/monobank/sync.test.ts`, "A чернетка
  auto-confirms by a продавець" in `src/notifications/draft.test.ts`, "The entry form proposes by
  a продавець" in `src/ui/entry-form.test.ts`, and the розбір in the categorisation tests.
- [x] 3.4 Add `mcc?` to every транзакція type in `src/domain/transaction.ts` and carry it through
  `src/db/mappers.ts`, `transactionsRepo.save`, `src/ui/retype.ts` and every editing path, the
  way `description` is carried (design M11).

  Tests in `src/db/transactions-repo.test.ts` and `src/ui/retype.test.ts` prove:
  - "An imported витрата keeps its MCC";
  - "A retype keeps the MCC";
  - "Correcting the опис leaves the MCC alone";
  - "A транзакція recorded by hand carries no MCC";
  - "The опис gives the продавець and nothing more".
- [x] 3.5 Make `sweepUncategorised` match on the stored MCC.

  Tests in `src/domain/rules.test.ts` and `src/db/categorisation` tests prove:
  - "An MCC-only правило moves nothing";
  - "An MCC-only правило moves the витрати carrying that MCC";
  - "A витрата with no опис is not swept";
  - "An MCC the new шаблон adds reaches the витрати carrying it";
  - "The pass is in the журнал as counts alone", with no MCC in the entry.
- [x] 3.6 Put the statement item's MCC on every транзакція `src/monobank/sync.ts` saves, the
  переказ of a правило-переказ included.

  Tests in `src/monobank/sync.test.ts` prove:
  - "A purchase keeps the code the bank gave it";
  - "A переказ made by a правило keeps it too";
  - "An item already imported is not revisited".

## 4. Every reader sees one продавець

- [x] 4.1 Add `descriptionShown` to `transactionLine` and draw it in `transaction-row.tsx` (design
  M9).

  Tests in `src/ui/transaction-line.test.ts` prove:
  - "A recognised опис reads as its продавець";
  - "Description and type stay distinguishable";
  - "An uncategorised merchant can be identified in the feed";
  - "A recognised опис shows its продавець in the feed and itself in editing".
- [x] 4.2 Extend the search for продавці (design M7):
  - add `merchantIds` to `SearchMatch` and to `satisfies`;
  - add the exact `merchantId` narrowing through the judged, memoised path, with the продавці
    change stamp in the memo key;
  - add the `?merchant=` route resolver;
  - make `searchLineTitle` use `descriptionShown`.

  Tests in `src/ui/transaction-search.test.ts` and `src/db/transactions-repo.test.ts` prove:
  - "A продавець's назва finds every spelling";
  - "Every spelling of one продавець, and nothing else";
  - "The narrowing follows recognition";
  - "It combines with a місяць and comes off by hand";
  - "An unknown продавець narrows nothing";
  - "A recognised опис leads with its продавець";
  - "More of a продавець reads nothing already read";
  - "A продавець given with the search matches every spelling";
  - "The продавець filter keeps only what it recognises".
- [x] 4.3 Group the пакет's merchants and recurring merchant candidates by the recognised продавець,
  with `foldMerchant` as the fallback key, and pass the index into `buildPackage` (design M8).

  Tests in `src/analysis/details.test.ts` and `src/analysis/privacy.test.ts` prove:
  - "Merchants when chosen";
  - "Every spelling of one продавець is one merchant";
  - "A продавець in two currencies is two rows, never one sum";
  - "A recurring продавець is one candidate whatever the spelling";
  - "A назва stays home when описи are off";
  - "The same state builds the same пакет", with продавці among the inputs;
  - that no продавець id appears in a serialised пакет.

  Rewrite the «Продавці» line of the запит in `src/analysis/prompt.ts`, so it says the merchants are
  the bank's описи grouped under the owner's назви, and update the golden documents where the
  merchants list or that line changes.
- [ ] 4.4 Measure recognition over 10 000 транзакції and 300 написання: a Node benchmark plus
  «Транзакції» narrowed to a продавець on the emulator. Record both in
  `openspec/changes/merchant-normalization/measurements.md`. If either takes longer than the
  existing search ceiling recorded by search-fold-speed, stop and raise it before going on.
  **Not run** — archived at the owner's request on 2026-10-06 without this step; the qa-sweep-2026-10 emulator sweep (task 12.1) is the latest on-device evidence.

- [x] 4.5 Make the «Продавці» choice on the AI-аналіз screen (`src/ui/ai-analysis-screen.ts`) say
  that the owner's назви go with the описи. Its test proves "«Продавці» says the owner's назви go
  too".

## 5. The бекап

- [x] 5.1 In `src/backup/format.ts` and the restore validator (design M12):
  - carry `merchants` and `merchantSpellings` as optional sections, `merchantId` on rule rows and
    `mcc` on transaction rows;
  - refuse, before anything local is touched, every contradiction of the backup-file delta: a
    правило naming an absent продавець, a написання whose продавець is absent, a duplicate
    написання, a blank or unfolded написання, two продавці with one name key, a blank назва, a
    продавець with no написання, a правило naming both a pattern and a продавець, and a non-integer
    MCC;
  - add both tables to `BACKUP_TABLES`.

  Tests in `src/backup/format.test.ts` and `src/db/backup-repo.test.ts` prove:
  - "Продавці survive the round trip";
  - "A бекап written before продавці existed restores without them";
  - "A правило naming an absent продавець is refused whole";
  - "Two продавці with one назва are refused before anything changes";
  - "A продавець with nothing to recognise it by is refused";
  - "An MCC that is not a whole number is refused";
  - "Replacing the state replaces the продавці";
  - one named refusal test each for a написання whose продавець is absent, a duplicate написання, a
    blank написання, an unfolded написання, a blank назва, and a правило naming both a pattern and
    a продавець.

  `BACKUP_TABLES` lists `merchants`, `merchant_spellings` and `rules` in that order (design M12).

## 6. Screens

- [x] 6.1 Write `src/ui/merchants-screen.ts` (design M10):
  - `namelessGroups` with `NAMELESS_LIMIT`;
  - the продавці list rows with their counts;
  - the naming form's state and its Ukrainian refusals.

  Tests in `src/ui/merchants-screen.test.ts` prove:
  - "Branch spellings of one shop are one row";
  - "Only twenty rows, and the rest is counted";
  - "Everything recognised";
  - "A дохід is not a nameless продавець";
  - "The list counts what each продавець recognises";
  - "No продавець yet";
  - "A назва that is taken offers the продавець that holds it";
  - "A написання outside the опис is refused in words".
- [x] 6.2 Build `src/app/manage/merchants.tsx` and the naming form sheet over the view models of
  6.1. The form has «Зберегти», «Додати до наявного» with the shortlist picker, and the розбір
  report after it closes. The form's submit and report logic lives in `src/ui/merchants-screen.ts`,
  and `src/ui/merchants-screen.test.ts` proves "Naming from «Без продавця»", "Adding a spelling to
  a продавець that exists" and "The розбір is reported". Add «Продавці» right after «Базові
  категорії» in `src/ui/settings-sections.ts`; `src/ui/settings-sections.test.ts` proves "The tab
  offers «Продавці» after «Базові категорії»" and "The section opens on what is still nameless".
- [x] 6.3 Build `src/app/merchant/[id].tsx`: rename, add and remove написання, «Обʼєднати з…» with
  its confirmation, «Видалити» that refuses and leads to «Правила», and «Транзакції» →
  `/transactions?merchant=<id>`.

  The screen logic in `src/ui/merchants-screen.ts` is tested for:
  - "Renaming";
  - "The last написання offers no removal";
  - "Merging names both before it happens";
  - "Deleting a продавець that правила name leads to them";
  - "The продавець's транзакції".
- [x] 6.4 Add the «Продавець» row to transaction editing (`src/app/transaction/[id].tsx` over a
  pure helper). Tests prove "A recognised транзакція names its продавець", "An unrecognised
  транзакція offers naming" and "No опис, no row".
- [x] 6.5 In «Правила»:
  - list a продавець-правило as «продавець <назва>»;
  - give the rule form the pattern-or-продавець switch with the shortlist picker, and the
    no-продавець hint.

  Tests in the rules form logic prove "A rule naming a продавець appears in the list" and
  "Switching the criterion drops the other choice".
- [x] 6.6 Make `rule-offer-sheet.tsx` name «продавець <назва>» and offer the switch to the pattern.
  A test over its view model proves "A recognised опис offers its продавець" (main-screen).

## 7. Docs and verification

- [x] 7.1 Update the docs:
  - `docs/product-vision.md` §7: the «Продавці» paragraph, with the owner's decision of
    2026-10-02 and the [PROPOSED] defaults;
  - `docs/product-vision.md` §14.8: a dated note that a продавець is recognised from the опис and
    is neither a tag nor a hierarchy;
  - `docs/product-vision.md` §17 and the glossary's «Пакет для аналізу»: under «Продавці» the
    пакет carries the описи and the owner's назви of продавці;
  - `docs/glossary.md`:
    - redefine **Продавець**, and add **Написання**, **MCC** and **Без продавця**;
    - widen **Rule** to a продавець criterion and «Sweep (розбір)» to the продавці trigger and the
      stored MCC;
    - say which "recognised" is meant where the glossary and vision §7 say a rule recognised a
      транзакція, versus a продавець recognising an опис;
    - say that «Продавці» names both the AI-аналіз choice and the Налаштування section;
    - add the distinctions продавець ≠ категорія, продавець ≠ опис, написання ≠ правило, and
      написання ≠ ознака (the `commitments` change);
  - `docs/app-overview.md`: Налаштування and transaction editing;
  - record this change in `docs/tech-task.md`.
- [ ] 7.2 Run the `smoke-runner` subagent over this change's scenarios on the emulator:
  1. open «Продавці» and name the top «Без продавця» row;
  2. add a second spelling from a транзакція;
  3. write «продавець → категорія» from the offer and watch «Без категорії» shrink;
  4. search by the назва;
  5. open the продавець's «Транзакції»;
  6. merge two продавці.
  **Not run** — archived at the owner's request on 2026-10-06 without this step; the qa-sweep-2026-10 emulator sweep (task 12.1) is the latest on-device evidence.
- [x] 7.3 Run `npm run verify` and paste the final lines
- [x] 7.4 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
