## Why

The bank names one shop in a dozen ways: «АТБ-Маркет 1234 Київ», «ATB MARKET», «Оплата послуг
АТБ». Today each spelling is a separate thing everywhere it matters. Search for «атб» misses «ATB
MARKET». A правило written for one spelling leaves the next one in «Без категорії». The пакет for
AI-аналіз lists three «продавці» that are one shop, each holding a third of its money. And the
proposed правило for «Оплата послуг АТБ» is «оплата послуг», which would capture every service
payment the owner ever makes (`proposeMerchantPattern` admits this in its own comment).

The owner decided (2026-10-02) that a **нормалізований продавець** is the foundation of the next
version, more important than a local model's «Коротко тут»: one entity «АТБ» behind every spelling,
so that search, правила, аналіз, the upcoming спостереження, recurring payments and the AI export
all improve at once. `docs/on-device-ai-proposal.md` (A2) reached the same point from the model
side. This change builds the entity **without any model**, so it works on every phone, is fully
testable in `verify`, and gives the follow-up `local-model-guesses` something to propose into.

It answers the vision's first question, *where did my money go* (§1): «в АТБ» instead of thirty
lines nobody reads.

## What Changes

- **Owner's decision 2026-10-02: продавець is an entity.** A продавець has a **назва** («АТБ») and
  one or more **написання**: the folded texts by which it is recognised in an опис («атб», «atb»).
  The owner owns the list: they name a продавець, rename it, add and remove написання, merge two
  продавці, and delete one.
- **[PROPOSED] Recognition is derived, never stored.** An опис is recognised as at most one
  продавець: the longest написання that occurs in it, case folded, with no transliteration between
  scripts. A tie goes to the newest написання. This is the same matcher the правила use. A
  транзакція's продавець is read from its опис at the moment it is shown. Adding one написання
  therefore re-reads the whole history at once, and nothing on a транзакція has to be kept in step.
- **[PROPOSED] A better first guess, still deterministic.** Naming a продавець from an опис
  proposes the назва and the написання. The proposal skips the bank's leading service words
  («Оплата послуг», «Оплата», «Покупка», «Списання», «Payment», «Purchase», «POS»), takes the
  leading name of at most two words, and writes an all-capitals word longer than three letters as a
  capital plus lower case: «СІЛЬПО» → «Сільпо», while «АТБ» stays «АТБ». The pattern proposed for a
  правило uses the same skip, so «Оплата послуг АТБ-Маркет 1234» proposes «атб», not «оплата
  послуг».
- **A правило may name a продавець** instead of a pattern: «АТБ → Продукти» covers every
  spelling. Such a правило ranks on the existing ladder as a merchant criterion as long as the
  написання that recognised the опис. When the опис is recognised, the offer to remember a
  категорія proposes the продавець and lets the owner switch to an editable pattern instead.
  Every change to the продавці sweeps «Без категорії», exactly as storing a правило does.
- **Search finds by продавець.** Typing «атб» finds every транзакція recognised as a продавець
  whose назва holds «атб», «ATB MARKET» included. «Транзакції» can also be opened narrowed to one
  продавець.
- **[PROPOSED] Lines show the назва.** A transaction line that today shows the опис shows the
  recognised продавець's назва instead. The editing screen shows both, plus a «Продавець» row that
  opens the продавець or offers «Назвати продавця».
- **The пакет groups by продавець.** The «Продавці» part of a пакет groups витрати by the recognised
  продавець, and by the folded опис only where none is recognised. A назва is the owner's word
  derived from описи, so it leaves the phone only under the same «Продавці» switch.
- **The MCC is kept.** The bank's merchant category code arrives on every monobank statement item
  and is dropped at import today. From now on it stays on the транзакція, informational like the
  опис. The розбір and the шаблон's MCC codes then work on stored history as they work at import.
  MCC-only правила stop being import-only, and the follow-up model gets the strongest signal a
  bank gives.
- **Налаштування → «Продавці»**, right after «Базові категорії», offers three things:
  - «Без продавця»: the most frequent unrecognised описи, each with «Назвати»;
  - the owner's продавці;
  - each продавець's screen: rename, написання, merge, delete, «Транзакції».

**Non-goals**:
- any language model. Proposing a продавець, a категорія or a чернетка's fields by a model is
  `local-model-guesses`, built on top of this change;
- a built-in довідник продавців shipped with the app, the way the шаблон ships категорії. That
  is a follow-up; until then a fresh device recognises nothing until the owner names it;
- storing the продавець on a транзакція, or choosing a продавець for one транзакція against what
  its опис says. The опис is corrected instead;
- a продавець as a tag or a hierarchy. Vision §14.8 is deliberately touched and kept: the owner
  never labels a транзакція with a продавець, and a продавець groups nothing but описи;
- marking an опис as «не продавець», or hiding it from «Без продавця»;
- recognition by MCC, MCC shown on a screen, or MCC on a транзакція recorded by hand, Saldo or a
  bank сповіщення (none of them carries one);
- top продавці on Звіти, Місяць or Головний. That is a follow-up;
- the спостереження detectors. Whichever of the two changes lands second moves them onto the
  продавець this change defines;
- the сума в оригінальній валюті (a separate BACKLOG item that touches the same statement mapping);
- changes to how a bank сповіщення is parsed;
- any network work, native module or dependency.

Vision §14.5 (no splitting) and §14.10 (no forecasts) are not touched.

## Capabilities

### New Capabilities

- `merchants`: what a продавець is, with its назва and написання. Covers:
  - validation and uniqueness;
  - how an опис is recognised (derived, deterministic, one answer per опис);
  - the deterministic proposal of a назва and написання from an опис;
  - rename, add and remove написання, merge and delete, with their effects on правила and on
    «Без категорії».
- `merchants-screen`: the «Продавці» section in Налаштування («Без продавця», the list, the
  продавець screen) and the naming form, opened from there or from a транзакція.

### Modified Capabilities

- `categorisation-rules`:
  - a правило may name a продавець, how such a правило matches and ranks, and that every place
    deciding a категорія recognises the опис;
  - a правило's merchant criterion can be switched between a pattern and a продавець;
  - the proposed pattern skips the bank's service words, and the offer proposes the продавець when
    the опис is recognised;
  - the розбір also runs on a change to the продавці and reads a stored MCC, for the owner's
    правила and the шаблон alike.
- `transactions`:
  - an imported транзакція keeps the MCC its import named, informational like the опис;
  - the опис now decides the продавець as well as the offered категорія, and nothing else.
- `monobank-sync`: a statement item's MCC is kept on the транзакція it becomes.
- `main-screen`:
  - lines show the recognised продавець's назва where they showed the опис;
  - editing shows the опис and a «Продавець» row;
  - the правило offer names a продавець.
- `transaction-search`:
  - found by продавець назва;
  - narrowed to one продавець, and opened already narrowed;
  - the «Без категорії» line leads with the назва;
  - a продавець's narrowing is read like a search, an exception to «the unsearched listing reads
    one page».
- `settings-screen`:
  - «Продавці» right after «Базові категорії»;
  - the «Правила» section lists and edits a правило that names a продавець.
- `ai-analysis-package`:
  - the пакет is built from the продавці too;
  - the merchants list and the recurring candidates group by the recognised продавець;
  - a назва appears only under «Продавці», a написання never, and a продавець id never.
- `ai-analysis-screen`: the «Продавці» choice says it carries the owner's назви as well as the
  bank's описи.
- `persistence`:
  - продавці, написання, a правило's продавець and a транзакція's MCC survive a restart and arrive
    by one new migration that keeps every stored row;
  - a search matches by продавець and narrows to one.
- `backup-file`: a бекап carries продавці, написання, a правило's продавець and a транзакція's MCC,
  as optional parts with no change to the format version, and refuses whole a file whose продавці
  contradict themselves.

## Impact

- **Docs.**
  - `docs/product-vision.md`:
    - §7 gains a paragraph «Продавці» with the owner's decision and the [PROPOSED] defaults;
    - §14.8 gains a dated note that a продавець is neither a tag nor a hierarchy;
    - §17 says that «Продавці» carries the owner's назви as well as the bank's описи.
  - `docs/glossary.md`:
    - **Продавець** changes meaning from «the folded опис» to the entity;
    - new: **Написання**, **MCC** and **Без продавця**;
    - widened: **Rule**, «Sweep (розбір)», and «Пакет для аналізу»;
    - distinctions: продавець ≠ категорія (who was paid vs what for), продавець ≠ опис (one name
      behind many texts), написання ≠ правило (recognises who vs decides where), написання ≠
      ознака (the `commitments` change).
  - `docs/app-overview.md`: the Налаштування and transaction-editing sections.
- **Pure code:**
  - new `src/domain/merchants.ts`: entity validation, recognition, proposal and the service-word
    list;
  - `src/domain/rules.ts`: a продавець criterion on the ladder, and `proposeMerchantPattern` gains
    the service-word skip;
  - `src/analysis/details.ts`: merchants grouped through recognition, with `foldMerchant` kept as
    the fallback key;
  - `src/analysis/prompt.ts`: the «Продавці» line of the запит;
  - new `src/ui/merchants-screen.ts`; changes to `src/ui/transaction-line.ts`,
    `src/ui/transaction-search.ts`, `src/ui/entry-form.ts`, `src/ui/ai-analysis-screen.ts` and the
    rule offer.
- **UI:**
  - new `src/app/manage/merchants.tsx`, `src/app/merchant/[id].tsx` and the shared naming form
    `src/components/merchant-naming-sheet.tsx`;
  - changed: `src/components/rule-offer-sheet.tsx`, `src/app/transaction/[id].tsx`,
    `src/app/transactions.tsx`, `src/app/manage/rules.tsx`, and the screens that draw transaction
    lines (Головний, a рахунок's рухи, a категорія's month), which pass the назва into
    `transaction-row.tsx`'s existing `description` prop; «Продавці» joins Налаштування through
    `src/ui/settings-sections.ts`.
- **Storage:**
  - new tables `merchants` and `merchant_spellings`;
  - `rules.merchant_id`. Widening `rules`' CHECKs rebuilds that table, which nothing references;
  - `transactions.mcc`, a plain added column outside `transactions_shape`;
  - one migration under the next free number, and its test;
  - `src/db/` repositories, `categorisationContext`, snapshot and restore, and `BACKUP_TABLES`.
- **Dependencies, native code, permissions and network:** none.
- **Overlaps:**
  - `observations-and-month-summary` (proposal only) groups «a purchase far above what that
    продавець usually costs» and price changes by the folded опис. Whichever change lands second
    reads the one продавець key this change introduces;
  - `category-icons-and-transaction-visuals` (in progress) edits `transaction-row.tsx`;
  - the BACKLOG item on the сума в оригінальній валюті edits the same `mapStatement`;
  - `commitments` (in progress) adds a migration and бекап tables too, and its ознака is also a
    substring of the опис. Its migration number is regenerated by whichever change lands second;
  - `voice-entry` does not overlap.
- **Follow-up:** `local-model-guesses`, where the local model proposes a продавець for «Без
  продавця», a категорія for «Без категорії» and the fields of a raw чернетка; every accepted guess
  becomes a написання or a правило.
