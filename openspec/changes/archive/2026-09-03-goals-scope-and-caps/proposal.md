# goals-scope-and-caps — proposal

## Why

A ціль today is «відкласти N до дати» on **exactly one рахунок**, and its progress is that
рахунок's розрахунковий баланс. The owner's money does not sit that way. «Машина — 700 000 UAH» is
backed at once by a банка, by готівка, by 3 000 USD, by 2 000 EUR and by part of an інвестиційний
рахунок — five places, three currencies, one intention. The app can only be told about one of them,
so the number it shows for that ціль is wrong by construction, and the owner has to keep the real
total in their head. That is the app failing at «скільки в мене вже є», the savings half of the
vision's second question, "how much can I still spend".

The other half is missing entirely. «Продукти — максимум 10 000 цього місяця» is a ціль the owner
holds, and the app has no word for it — except that it already has one: the ліміт. A monthly ceiling
on a категорія, judged against that month's spent net of повернення, is exactly «витратити не більше
X». What is missing is not the arithmetic; it is that a ліміт is buried under Налаштування and never
reads as something the owner is *aiming at*.

So: цілі stop meaning one рахунок, and the ліміт the app already computes starts being readable as
the ціль it is — without a second, competing number anywhere.

## What Changes

### A ціль has two kinds

- **Ціль-накопичення** (form: «Накопичити») — «накопичити N», a назва, a target сума with its own
  currency, an **optional** дата, and a **склад**: one or more рахунки whose money counts toward it.
  Reached when progress ≥ target; overdue when it has a дата, that дата has passed and it is not reached.
  **BREAKING** relative to today's model: the дата stops being required and the single linked
  рахунок becomes a set.
- **Ціль витрат** (form: «Не перевищити витрати») — «витратити не більше N цього місяця» on one
  категорія. It **is** that категорія's ліміт, shown as a ціль: the same row, the same сума, the
  same currency, the same month, the same arithmetic. Setting one from «Цілі» sets that категорія's
  ліміт; changing it in «Ліміти» changes the ціль; deleting either clears the one row. There is no
  second stored ceiling and therefore no way for two target amounts to disagree.

### Progress of a ціль-накопичення comes from the app's own numbers

- The **склад** is a fixed, stored set of рахунок ids — never a live query by вид рахунку. The form
  offers shortcuts («Усі інвестиційні», «Усі накопичувальні», «Усі готівкові») that **tick the
  boxes** at the moment they are tapped and store the ids that were ticked; a рахунок created
  afterwards does not silently join a ціль, and archiving one does not silently leave it.
- The **внесок** of one рахунок is its розрахунковий баланс — except for a рахунок of вид
  `investment`, whose внесок is its **поточна вартість** where the app holds one (the number
  `investments-value` introduces) and its розрахунковий баланс otherwise. No second «вартість для
  цілі» field is created anywhere.
- No рахунок is counted twice: the склад is a set.
- An archived рахунок keeps contributing, exactly as today — archiving must not quietly rewrite
  what a ціль ever meant.

### Multi-currency progress, marked as approximate, never silently partial

- A ціль carries **its own currency**, chosen by the owner — not derived from a рахунок.
- A внесок in the ціль's currency is exact. A внесок in another currency is converted at monobank's
  current rate through the mechanism the Місяць tab already uses, and the whole progress is then
  marked **приблизний** («≈»).
- Because every monobank rate is UAH per unit of a currency, a ціль whose склад mixes currencies
  SHALL be in UAH; a ціль in any other currency accepts only рахунки of that one currency. No cross
  rate is invented.
- Nothing stored moves: no converted amount is written anywhere, no транзакція carries one, no
  розрахунковий баланс and no monthly number changes.
- **A missing rate withholds the progress**, exactly as it withholds the Місяць tab's approximate
  total: no total, no percentage, no reached/overdue verdict — the ціль says which currency it
  cannot convert, and the per-рахунок внески it *can* read are still shown. A currency is never
  quietly counted as zero.

### The two kinds never wear each other's words

- Ціль-накопичення: «487 300 / 700 000 UAH», «69 %», «Залишилось накопичити 212 700 UAH», or
  «Досягнуто».
- Ціль витрат within its ceiling: «1 320 / 2 000 UAH», «Використано 66 %», «Можна витратити ще
  680 UAH».
- Ціль витрат over it: «2 480 / 2 000 UAH», «Перевищено на 480 UAH» — and **no percentage at all**,
  because «виконано на 124 %» is a lie about a thing the owner did not want to happen.
- A ціль витрат's month ends with one final answer for that month: «завершено в межах» or
  «перевищено на X».

### The screens

- **«Звіти»** keeps the ціль list and now reads both kinds at a glance, in two visually separate
  groups, without opening anything: a ціль-накопичення shows progress / target, its percentage and
  how many рахунки it counts; a ціль витрат shows spent / cap, what is left of it and which month.
- **New screen `goal/[id]`** — the breakdown of one ціль-накопичення: every рахунок of its склад
  with its внесок, foreign ones showing their native сума and their «≈» equivalent, so «why does
  cap1tal think there is already 487 300 for the car» has an answer on one screen.
- A ціль витрат opens the **existing** category-month screen. No second copy of a transaction list
  is built.
- **«Цілі»** in Налаштування asks the kind first and then shows only the fields that kind has.

### The AI-аналіз and the settled month

- The **пакет для аналізу** carries only цілі-накопичення among the цілі: a ціль витрат is already
  in it as the ліміт it is, and a second row for one ceiling would let the assistant read it as two.
  A ціль with no дата is carried without a pace; a ціль whose progress would need a conversion is
  carried with its target and дата and **without** a progress — the пакет's own rule is that every
  сума in it is exact and in one currency, and this change does not bend it.
- The **категорія's month** — where a ціль витрат leads — states the settled verdict of a month that
  has ended: «завершено в межах», beside the overrun it already states. That is where the third
  state of a ціль витрат is read.

### Documentation

- `docs/glossary.md` — «Ціль» redefined; «ціль-накопичення», «ціль витрат», «склад цілі», «внесок
  рахунку», «прогрес цілі» and «приблизний прогрес» added; «Ліміт» gains the sentence that it is
  the ціль витрат of its категорія.
- `docs/product-vision.md` — §4 «Categories, limits, goals» and §11 «Reports and goals» lose the
  claim that a ціль hangs on one рахунок.
- `docs/tech-task.md` — FR-R3 rewritten; a roadmap row for this change.

### Non-goals (deliberate)

- **No second budgeting system.** The ціль витрат has no stored сума of its own; it reads and writes
  the ліміт row. Nothing here changes how spent is computed — `monthly-picture`'s breakdown and
  `limits`' «over» rule are used verbatim, повернення included.
- **No investment позиції, інструменти or automatic prices** — vision §14.2 stands; a ціль reads the
  hand-entered поточна вартість and never asks the outside world for one.
- **No cross rates.** UAH is the only currency the app can convert *into*, because it is the only
  currency monobank quotes rates in. A EUR ціль backed by USD рахунки is refused with a reason, not
  approximated.
- **No forecasting** — vision §14.10. **No gamification, no streaks, no badges**: досягнення and
  виклики are the in-flight change `achievements-and-financial-challenges`, which will read цілі
  rather than redefine them; nothing here anticipates it.
- **No recurring or scheduled транзакції** — vision §14.6.
- **No періоди beyond the calendar month** for a ціль витрат: the ліміт is monthly, the monthly
  picture is monthly, and a second period vocabulary would need a second spent.
- **No new tab**, no bank API beyond what exists, and no AI anywhere near a progress number.

## Capabilities

### New Capabilities

- `goal-screen`: the detail of one ціль-накопичення — its progress with the approximate mark it
  earned, and the внесок of every рахунок of its склад (native сума plus «≈» equivalent for a
  foreign one, «в архіві» for an archived рахунок, «курс невідомий» for one that cannot be
  converted); and that a ціль витрат has no such screen because it opens the existing category-month
  screen instead.

### Modified Capabilities

- `goals`: a ціль is of one of two kinds; a ціль-накопичення holds a склад of one or more рахунки
  and its own currency instead of one linked рахунок, its дата becomes optional, its progress is
  the sum of the внески with the conversion and missing-rate rules, and a ціль витрат is defined
  as the ліміт of its категорія with its own states and its own progress words.
- `limits`: the ліміт is the same thing as the ціль витрат of its категорія — one row, two names,
  edited from either place — and a month that has ended carries a final verdict.
- `reports-screen`: the цілі section lists both kinds, each in its own words, separated, and each
  row opens the screen that explains it.
- `settings-screen`: the «Цілі» section asks the kind first, offers a multi-рахунок склад with
  kind shortcuts and an optional дата for a ціль-накопичення and a категорія for a ціль витрат;
  the «Ліміти» section says that a ліміт is a ціль витрат.
- `persistence`: a ціль's склад survives a restart as its own stored relation, at most once per
  рахунок; a ціль's дата may be absent; a ціль's currency is its own and no longer has to equal a
  рахунок's; the new shape arrives by new append-only migrations that keep every stored row, and an
  existing one-рахунок ціль becomes a ціль-накопичення with that one рахунок in its склад and the
  same progress.
- `ai-analysis-package`: the пакет carries only цілі-накопичення; a ціль with no дата has no pace,
  a ціль whose progress would rest on a conversion is carried without a progress, and a ціль витрат
  is in the пакет only as its ліміт — so no сума in the пакет is approximate or mixes currencies.
- `month-screen`: a категорія's month states that a month which has ended finished within its
  ліміт, which is where a ціль витрат's settled state is read.
- `backup-file`: a ціль travels with its склад and its optional дата; a бекап of the previous
  format version restores its цілі as one-рахунок ціль-накопичення; a ціль витрат needs nothing new
  because it is the ліміт the бекап already carries.

## Impact

- **Domain**: `src/domain/goals.ts` rewritten (kinds, склад, внески, progress, states); it stays
  rate-free — conversion lives outside the domain, as `approx-uah.ts` does.
- **UI logic**: `src/ui/goals-section.ts` (the form: kind first, multi-select склад, optional дата,
  the currency rule), `src/ui/reports-screen.ts` (two ціль groups), a new `src/ui/goal-screen.ts`
  (the breakdown), `src/ui/approx-uah.ts` (a per-сума conversion the ціль can reuse),
  `src/ui/labels.ts`.
- **Screens**: `src/app/manage/goals.tsx`, `src/app/(tabs)/reports.tsx`, new `src/app/goal/[id].tsx`.
- **Storage**: `src/db/schema.ts` (a `goal_accounts` relation; `goals` loses its `account_id` and
  its дата becomes nullable), `src/db/goals-repo.ts`, `src/db/migrations.test.ts`, and **two new
  migrations** under `drizzle/` — committed ones stay untouched.
- **Backup**: `src/backup/format.ts` (the ціль shape, a format-version bump and the reader for the
  previous one), `src/backup/backup.ts`, `BACKUP_SCHEMA_VERSION`.
- **AI-аналіз**: `src/analysis/goals.ts` (the ціль report loses its required дата and its single
  рахунок, gains the «no progress unless exact» rule), and the file it feeds.
- **Docs**: `docs/glossary.md`, `docs/product-vision.md`, `docs/tech-task.md`, `docs/app-overview.md`.
- **Not touched**: `monthly-picture`, `reports`, `accounts`, `money`, `categories`, the monobank and
  notification capabilities, and every migration already committed.
- No new dependency, no native module, no permission, no Expo config change and no new network call.
  `npm run verify` stays Node-only and under a minute.
- **In flight beside this**, and each overlapping it somewhere:
  - `investments-value` — adds a migration, and adds the поточна вартість this change contracts
    against (design D7).
  - `fiscal-receipts` — MODIFIES the **same three `backup-file` requirements** as this change, and
    its copies still carry the one-рахунок ціль («a ціль whose currency differs from its
    рахунок's»). Whichever archives second reinstates its own copy into the truth spec, so the two
    `backup-file` deltas must be read together and the second one rebased before it is applied.
    This is the sharpest of the three overlaps.
  - `achievements-and-financial-challenges` — also delta's `reports-screen` and `backup-file`, and
    its catalogue of досягнення is written over «every ціль». Once every ліміт is also a ціль
    витрат, «Перша ціль» and «Ціль досягнута» would fire on a spending ceiling, which is not what
    they mean. Not this change's spec to fix, but that change must be re-read against this one
    before it is applied.

  Whichever of them lands first also shifts the others' migration numbers and their
  `BACKUP_SCHEMA_VERSION`; none of that is a behavioural conflict.
