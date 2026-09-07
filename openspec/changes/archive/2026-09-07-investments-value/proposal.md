# investments-value — proposal

## Why

Every інвестиція the owner has ever made is already in the app: it is a переказ onto a рахунок of
вид `investment`, and that рахунок's розрахунковий баланс is the money put into it. What the app
cannot say is what that money is worth now. Inzhur, військові облігації, IBKR and Binance each
report a current value the app has never heard of, so today the owner opens four other apps to
answer one question — and the Рахунки screen shows an інвестиційний рахунок as if nothing had
happened to the money since it arrived there.

This is step 10 of tech-task §5 (FR-I1–I2) and vision §10. It serves the first product question,
"where did my money go": money that left a картка for облігації is not spent and not gone, and the
owner should be able to see where it now stands without leaving the app. It deliberately does
**not** touch the second question, "how much can I still spend": a прибуток is not дохід, it is
not available money, and no monthly number moves because of it.

## What Changes

- **New capability `investments`** — the three numbers vision §10 names, for a рахунок of вид
  `investment`:
  - **вкладено** is that рахунок's розрахунковий баланс: початковий залишок plus every
    транзакція touching it, which for an інвестиційний рахунок is exactly what went in minus what
    came back out (FR-I1's «нетто цих переказів», with the money that was there before the app
    included). One number, already explained by транзакції — never a second, separately
    maintained total that could drift from them, the same decision `goals` made about progress.
  - **поточна вартість** is what the owner types in: a сума in the рахунок's own currency, with
    the дата it was entered, at most one per рахунок, replaced when entered again and clearable.
    Entering it **creates no транзакція** and moves no баланс — this is the one number in the app
    that is an observation of the outside world rather than a consequence of the owner's money
    moving, and it is kept apart from the розрахунковий баланс exactly as баланс банку is.
  - **прибуток / збиток** is поточна вартість − вкладено, in that one currency, and exists only
    while a вартість does.
- **Modified `accounts-screen`** — an інвестиційний рахунок shows вкладено, its поточна вартість
  with the дата that вартість describes, and the прибуток/збиток between them; the owner records,
  replaces and clears the вартість from that рахунок's own row. A рахунок of any other вид shows
  what it shows today and offers nothing of this.
- **Modified `persistence`** — a поточна вартість survives a restart, arrives by a new
  append-only migration that keeps every stored row, and is rejected unless it names a stored
  рахунок of вид `investment` and carries that рахунок's own currency.
- **Modified `backup-file`** — a бекап carries every поточна вартість and a restore puts them
  back, replacing wholesale like the rest of the state; a вартість naming a рахунок the бекап does
  not hold, a рахунок of another вид, another currency or a negative сума refuses the бекап whole.
  A вартість is hand-entered and derivable from nothing, so a бекап that dropped it would lose the
  only record of what an інвестиція is worth.
- **The цілі finally get what they were promised** — the `goals` capability already says an
  інвестиційний рахунок's внесок **is** its поточна вартість where the app holds one; until now the
  app held none, and the four places that read a внесок carry an unfed вартості map each marked
  «empty until `investments-value` lands». This change feeds them: the ціль's own screen, the цілі
  group on Звіти and the пакет for the AI-аналіз. It is the one thing a вартість moves, and the
  investments spec says so where it says a вартість moves nothing else.
- **Documentation** — docs/glossary.md gains «Вкладено» (it already defines «Поточна вартість»,
  which the goals change put there, and «Прибуток / збиток» by both), and the tech-task §5 roadmap
  row for step 10 moves to ✅.

Non-goals of this change (deliberate):

- No позиції, інструменти, кількості or prices, and no automatic prices — vision §14.2 keeps this
  step to one hand-entered number per рахунок, and this change stays inside that.
- No history of values and no value-over-time chart: a вартість replaces the previous one. Only
  the current worth is asked for, and a series of hand-typed numbers would invent a record of
  what the owner never recorded.
- No number this change shows reaches any monthly number: прибуток is neither дохід nor
  інвестовано, and a вартість is not a транзакція. When a real profit actually arrives — a
  coupon — the owner records it as дохід «Інвестиції», exactly as they do today; nothing here
  does it for them.
- No коригування: unlike баланс банку, a вартість is never reconciled against the розрахунковий
  баланс, and «Звірити» is not offered for it. Reconciling would turn a прибуток into дохід and
  destroy the very difference this step exists to show.
- No rate conversion: вкладено, вартість and прибуток live in the рахунок's own currency and are
  never summed across рахунки or converted. The приблизний підсумок у гривні stays the Місяць
  screen's concern.
- The Звіти history series stay витрачено / дохід / інвестовано: no прибуток joins them, and no
  chart of вартість over time exists. The цілі group on that screen does start counting a вартість
  as the внесок — that is the goals capability's own requirement, not a new series.
- No звірка is taken away: «Звірити» against a typed фактичний залишок stays offered on every
  unarchived рахунок, інвестиційний included. What this change refuses is a звірка **of the
  поточна вартість** against the розрахунковий баланс, which would turn a прибуток into a
  коригування and so into дохід.

## Capabilities

### New Capabilities

- `investments`: for a рахунок of вид `investment` — вкладено (its розрахунковий баланс), the
  hand-entered поточна вартість with its дата (record, replace, clear; rejected in another
  currency, on another вид of рахунок, or below zero), and the прибуток/збиток between them;
  and the rule that none of this writes a транзакція or moves a monthly number.

### Modified Capabilities

- `accounts-screen`: an інвестиційний рахунок's row shows вкладено / поточна вартість (with its
  дата) / прибуток, and is where the вартість is entered, replaced and cleared. No «Звірити» is
  offered against the вартість; the рахунок's own звірка against a typed фактичний залишок is
  untouched.
- `persistence`: the поточна вартість round-trips through storage under a new append-only
  migration, one per рахунок, and is rejected unless its рахунок is stored, of вид `investment`
  and of the same currency.
- `backup-file`: a бекап carries every поточна вартість, a restore replaces them wholesale, and a
  вартість the бекап cannot stand behind refuses the бекап whole.

## Impact

- New code: `src/domain/investments.ts` (вкладено, прибуток/збиток, the `CurrentValue` type
  `src/ui/goal-screen.ts` declared ahead of it), `src/db/investments-repo.ts` and one new table
  with its append-only migration under `drizzle/`; names indicative, final layout in design.md.
- Touched code: `src/ui/account-groups.ts` (the Рахунки row view model gains the three
  investment numbers), `src/app/(tabs)/accounts.tsx` (showing and entering them),
  `src/ui/amount-input.ts` (the zero-or-positive parser), `src/db/schema.ts`, `src/db/repos.ts`,
  `src/db/migrations.test.ts`; `docs/glossary.md` and `docs/tech-task.md`.
- The бекап: `src/backup/format.ts` (the carried shape, the table list and the storage-shape
  version), `src/backup/canonical.ts` if the shape needs an ordering, `src/db/backup-repo.ts`
  (snapshot, and the delete that must happen before `accounts` under `onDelete: 'restrict'`), with
  their tests.
- The consumers of a внесок, each of which already takes a вартості map and is handed none:
  `src/app/goal/[id].tsx`, `src/app/(tabs)/reports.tsx` and `src/ui/ai-analysis-screen.ts`.
- No new dependencies, no native module, no permission, no Expo config change, and no network
  call anywhere in this change — `npm run verify` stays Node-only and under a minute.
