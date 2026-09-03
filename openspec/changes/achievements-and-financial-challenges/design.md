# achievements-and-financial-challenges — design

## Context

Everything this change needs to know is already in the database and already computed by pure
functions: `monthlyPicture` gives витрачено / дохід / інвестовано / відкладено / позичено /
залишилось per currency per month, `categoryBreakdown` gives the categories of a month,
`computeBalance` gives a рахунок's розрахунковий баланс, `goalProgress` / `isReached` / `isOverdue`
give a ціль's standing, `overLimit` gives a category's month. What does not exist is anything that
looks at all of it at once and says *this went well*.

Three constraints shape every decision below.

1. **`npm run verify` never renders JSX and never touches a device.** Everything worth testing is a
   plain-TypeScript decision under `src/`, and the screens are wiring. (CLAUDE.md; rules/testing.md)
2. **Money is integer minor units with a currency code, and currencies are never summed.**
   (rules/domain.md, vision §5, glossary «Приблизно в гривні»)
3. **Committed migrations are immutable.** New state arrives by a new migration that keeps every
   stored row. (rules/database.md)

And one constraint that is not technical: this is **one person's local app**. There is no
leaderboard and no audience, so a determined self-deceiver can always fake a досягнення by faking a
транзакція — and gains nothing but a wrong «залишилось». The design therefore does not try to be
tamper-proof. It guards against the failure that actually matters: the app **accidentally** telling
the owner something untrue — by mixing currencies, by guessing what a category means, by dating a
retroactive award to today, or by rewarding a behaviour nobody wants. That is the bar every
decision below is held to.

## Goals / Non-Goals

**Goals:**

- A досягнення is a permanent, explainable fact, earned exactly once, provable from the транзакції.
- The whole existing history earns everything it deserves the first time the engine runs, in one
  grouped, quiet event.
- At most three виклики stand at a time, each with a reason, a progress and a finish.
- Evaluating never reads the history транзакція by транзакція, and Головний never evaluates.
- Nothing here is a second source of financial truth. No balance, no total, no score is stored.

**Non-Goals:**

- Not a game: no XP, no coins, no levels, no daily streak, no confetti, no blocking modal.
- Not a nag: refusing a виклик costs nothing, and a day the app was not opened costs nothing.
- Not a redesign of `goals`, `limits`, `monthly-picture` or `reports`. They are read, never touched.
- Not a place for a language model. The catalogue and the ranking are deterministic code.

## Decisions

### D1 — Two concepts, two capabilities, two kinds of state

A **досягнення** is about the past; a **виклик** is about the present. They differ in every way that
matters, so they are two capabilities rather than one:

| | Досягнення | Виклик |
| --- | --- | --- |
| what it is | a fact that was true | a thing that could be done |
| when it is decided | once, forever | every time it is shown |
| what is stored | that it was earned, when, and its свідчення | only the owner's decision about it |
| what happens when the data changes | nothing — it stays | its progress is recomputed |
| how many exist | as many as the history proves | at most three |

They share exactly one thing — the **зведення прогресу** of D10 — and nothing else.

### D2 — Earned is a historical fact; progress is always derived

The two candidate models, and why one wins.

*Derived state* — a досягнення exists exactly while its condition holds. Honest in the small, but it
means an edit to a 2024 транзакція can silently un-earn «1000 транзакцій», and the owner is punished
for correcting their own record. That is the one behaviour this change must never discourage.
Rejected.

*Historical fact* — a досягнення is written once and stays. The risk is drift: the badge says
«1000 транзакцій» while storage now holds 998. Answered by keeping the two apart in the UI: the
досягнення shows its **свідчення** — «1000 транзакцій, 2026-03-14» — as what was true then, and
every current number on the screen is recomputed from the транзакції. A frozen witness beside a live
number, never one pretending to be the other.

**Chosen: historical fact.** With three rules that make it safe:

1. **A key is earned at most once.** The key is the primary key of the stored row; re-evaluating an
   already-earned key writes nothing. Editing a транзакція a hundred times awards nothing a hundred
   times.
2. **The engine only ever adds.** No evaluation removes a row. There is no code path that unearns.
3. **A відновлення replaces them with the бекап's**, exactly as it replaces every рахунок and
   транзакція (D8). That is what keeps the earned set consistent with the data it describes — and
   it is the only thing that can ever reduce it.

### D3 — What a stored earned досягнення holds, and what it must not

```
earned_achievements
  key          TEXT PRIMARY KEY   'ledger.transactions:500'  'reserve.norm:100:UAH'  'goal.reached:<id>'
  template     TEXT NOT NULL      'ledger.transactions'      — the catalogue entry, without parameters
  achieved_on  TEXT NOT NULL      IsoDate — D4
  recorded_at  INTEGER NOT NULL   ms, when the engine wrote the row
  seen_at      INTEGER            ms, or NULL while the owner has not been shown it — D11
  evidence     TEXT NOT NULL      small deterministic JSON — the свідчення
```

The **key** carries every parameter that makes the fact distinct — the tier, the currency, the ціль's
id, the місяць — so two currencies earn two rows and are never one. The **template** is the
catalogue entry the key belongs to, stored so a row can still be grouped and rendered.

The **свідчення** is one of a closed set of shapes: `{count: n}`, `{months: n, from, to}`,
`{money: {amount, currency}}`, `{month}`, `{goalId}`. It is deliberately *not* a balance and nothing
in the app ever reads it as money: no total, no monthly number, no ліміт and no ціль is computed
from it. It exists so the detail screen can say «чому його отримано» without re-deriving a fact
about a history that has since changed.

**Catalogue keys are permanent.** A template may be renamed, its Ukrainian text rewritten and its
description improved; its key never changes. A template that is retired keeps its key and gains a
`retired` flag in code, so a row earned under it still renders. Retiring is not deleting: a row
whose key the current catalogue does not know is kept in storage and simply not shown — earned rows
are never deleted by a code change.

### D4 — `achieved_on`: the history's date where the history has one, otherwise today

Two kinds of condition, two honest answers:

- **A condition the history dates.** The перша транзакція, the 500th, the end of the 6th активний
  місяць, the перше відкладення, the перший внесок в інвестиції. `achieved_on` is that date, read
  from the транзакції. A retroactive award for a 2024 fact is dated 2024, not today — which is the
  whole point of retroactive awarding, and the difference between «Рік історії» meaning something
  and meaning nothing.
- **A condition that is a balance.** A ціль's 50 %, the резерв reaching a норма, інвестиційний
  капітал reaching one. `goals` defines progress as «the linked рахунок's розрахунковий баланс,
  read at the moment the ціль is shown» — a *current* number with no history the ціль owns. A ціль
  created yesterday over a рахунок that has held money for a year did not reach 50 % a year ago, and
  dating it there would be a fiction the app invented. `achieved_on` is **the day the app recorded
  it**.

Stated in the spec as one rule, and testable both ways. The detail screen never claims more than
this: a balance-dated досягнення says «помічено», a history-dated one says «досягнуто».

### D5 — The catalogue lives in code, versioned; only keys live in SQLite

`src/progress/catalogue.ts` holds the templates: key, Ukrainian назва, the sentence that states the
condition, the group, the tier parameters and the predicate. It is ordinary TypeScript under
`verify`, so a template's condition is unit-tested against fixtures like any other pure function.

SQLite holds keys and свідчення. Copying the catalogue into the database would mean a migration
for every wording fix, two places to keep in step, and a бекап carrying text that the code already
carries. Rejected.

### D6 — The engine reads a ціль through the `goals` capability, never through `goal.accountId`

Every goal-shaped condition is expressed over three values the capability gives: the ціль's
**target** (a `Money`), its **progress** (a `Money` in the same currency), and its **дата**. The
achievement code never sees `accountId`, never reads a рахунок to compute a ціль's progress, and
never assumes there is exactly one.

This is not decoration. The owner has separately asked for цілі that may name a set of рахунки or a
global pool of the matching ones; `openspec list` holds no change for it yet, so this change cannot
integrate with one — but when it lands, `goalProgress` returns a different number from a different
place and **not one line here changes**. The seam is `goalProgress(goal) → Money` plus
`goal.target`, and it is the only seam.

The `goal.reached-in-time` template is the one that also reads the дата, and it reads it as the
capability defines it — reached while `today <= дата`.

### D7 — «Базові витрати» is a number the owner confirms, never one the app infers

The financially meaningful money milestone is *how many months of my life does this cover*, which
needs to know what a month costs. Three ways to get it:

- *Guess from category names* — «Продукти», «Комуналка», «Оренда» are essential; «Розваги» is not.
  The app would be classifying the owner's own flat list of categories by their text, silently, and
  a renamed category would change a досягнення. Vision §7 keeps category meaning with the owner and
  the glossary says nothing computes from a назва. **Rejected outright.**
- *Use total витрачено of the last month* — one bad month makes the norm wrong, and it moves every
  month, so a досягнення could appear and the underlying money never change.
- **Chosen: the owner confirms one number per currency.** The app proposes the **median** of
  «витрачено» over the last six **завершені активні місяці** in that currency — median, not mean, so
  one holiday does not move it — and shows exactly which six months and which number. The owner
  accepts it or types their own. It is stored per currency and can be changed later.

**Until a currency has a confirmed норма, every досягнення and виклик that needs one does not
exist** — it is not shown as locked, not shown greyed, not counted in «У процесі». The one place the
norm is asked for is the first step of the «Фінансова подушка» виклик, where the question has an
obvious reason. Changing the норма later re-derives progress and never unearns anything (D2).

### D8 — All three tables are in the бекап

They are the owner's own state, not a derivation of the money: `recorded_at`, `seen_at`, a
dismissal, a confirmed норма cannot be recomputed from транзакції. And a відновлення that dropped
them would show a phone that has just restored two years of history as having achieved nothing,
then re-earn everything with today's `achieved_on` — losing the very dates D4 exists to protect.

Because they are in the бекап, restoring an older бекап restores that бекап's earned set, and the
next evaluation re-earns whatever the restored data still proves. That is correct, and it is the
only way a досягнення is ever "taken back": not by an edit, but by the owner deliberately replacing
their whole state.

**Delta shape:** as an **ADDED** requirement in `backup-file`, not a MODIFIED one. The
"holds the owner's whole state" requirement is already being rewritten by `fiscal-receipts`
(in flight); a second MODIFIED of the same header would collide on archive for no benefit.

### D9 — «Закрити місяць» ships as a виклик, not as a stored marker

Worth having as a loop, and here is why it is not a stored state in v1.

A stored «місяць закрито» is a **second truth about a month** that goes stale the moment the owner
edits a транзакція in it — and editing an old транзакція is a normal daily action (FR-T8). The app
would then either lie ("закрито") or unclose the month behind the owner's back, and both are worse
than not storing it. There is also a product reason: closing is a ritual that requires opening the
app on a particular week, and this change is explicitly not allowed to punish an owner whose
автоматичний імпорт was doing the work.

So v1 ships the **виклик** «Закрий <місяць>» — proposed once a місяць is завершений and still holds
чернетки, «Без категорії» or «Без джерела» — whose completion is *derived*: the conditions are met
or they are not, and it says which. The досягнення it can leave behind are the ones that already
exist («Чистий місяць», «Місяць без чернеток»).

**The room left for v2:** a виклик is keyed `template:parameters` and its state is one row of owner
decision; a досягнення is keyed the same way and its свідчення shape is a closed union. Adding a
stored «закрито <місяць>» later is a fourth table, one template with a `{month}` свідчення and one
extra clause in the виклик's completion — no engine change, no key change, nothing re-earned. The
«переглянув проблемні ліміти» clause the owner sketched needs exactly that stored marker, so it is
not in v1's completion criterion either.

### D10 — Evaluation is event-driven and reads bounded aggregates; Головний never evaluates

**When it runs.** Once at app start (after migrations), and after each of: a транзакція recorded,
edited or deleted; a monobank sync that committed anything; a чернетка confirmed or dismissed; a
committed Saldo імпорт; a відновлення; a ціль created, edited or deleted; a норма confirmed or
changed. Every one of those is already a single, named place in the code. Nothing evaluates on
render, on scroll, or on a timer.

**What it reads.** One **зведення прогресу** built by storage as aggregates, never as rows:

- per (місяць, currency): витрачено, дохід, інвестовано, відкладено, the count of транзакції, the
  count carrying «Без категорії», the count carrying «Без джерела» — one `GROUP BY` over the
  transactions table;
- per (вид рахунку, currency): the sum of розрахункові баланси — which is what «резерв» and
  «інвестиційний капітал» are;
- the total count of транзакції, and the дата of the earliest and the latest;
- the count of pending чернетки per місяць.

Its size is bounded by (months × currencies) + (kinds × currencies) — for the owner's real history,
about a hundred rows against 2 459 транзакції. **No requirement anywhere makes the engine read a
транзакція individually**, and the persistence spec says so as a testable SHALL.

The one exception is deliberate and cheap: `achieved_on` for «the Nth транзакція» is a single
indexed `ORDER BY дата, rowid LIMIT 1 OFFSET n-1`, run only in the evaluation that crosses that
tier — at most four such queries in the lifetime of a database.

**Why no cache table.** A cached зведення needs an invalidation stamp bumped inside every mutating
write — a cross-cutting change to eleven repositories, with a stale-cache failure mode that shows
the owner wrong numbers. The aggregates above are the same order of cost as the `monthlyPicture`
Головний already computes on every focus and far cheaper than the whole-history array `reports`
already loads for Звіти. If a real device ever measures otherwise, the зведення is already the
single seam a cache would sit behind — that is what makes it a v2 decision rather than a rewrite.

### D11 — One grouped celebration, never a modal

`seen_at NULL` means "the owner has not been shown this". After the first evaluation on an existing
phone that is twelve or twenty rows at once, and the failure mode to avoid is twenty dialogs.

- **0 unseen** → no «Прогрес» section on Головний at all. No heading, no empty state.
- **exactly 1** → the card names that one досягнення.
- **2 or more** → one line: «Ви вже маєте 12 досягнень» with «Переглянути ›».

Opening «Прогрес» marks every unseen row seen, in one write. The card is an inline section of a
screen the owner chose to open — never a modal, never a dialog, never a toast that can be missed,
never a sound. It is a financial app: a досягнення is stated the way a balance is stated.

### D12 — The test every template had to pass, and the one that failed it

*Яку корисну фінансову поведінку це підсилює, і чи можна отримати це, поводячись гірше?*

Each surviving template and its answer is in `specs/achievements/spec.md`. One candidate the owner
asked about failed the second half and is not in v1: **коригування under 2 % of витрачено for three
months running** (vision §15's own criterion).

The perverse reading is direct. «Звірити» creates a коригування only when the bank and the app
disagree; the app stores no record that a рахунок was звірено at all. So a month with **zero**
коригування is indistinguishable from a month in which the owner never reconciled — and the badge
rewards the second exactly as much as the first. The brief's own ban («не робити потрібне
коригування заради badge») names this case.

The two cheap repairs both fail too: requiring **at least one** коригування per month rewards
recording a 1 UAH fiction; measuring the ratio only over months that hold a коригування makes the
condition meaningless for an owner whose accounts genuinely agree. The honest condition needs
evidence the app does not yet store — **the moment each рахунок was last звірено** — which is one
column shaped exactly like the «поточна вартість … з датою» that `investments-value` is adding. The
template ships when that column does.

Two other candidates were dropped for the same test: anything counting purchases or витрати
(rewards spending), and any daily streak (rewards opening the app, and punishes an owner whose
автоматичний імпорт was working perfectly while they were on holiday).

### D13 — Documentation this change proposes (applied by `/opsx:apply`, not by the proposal)

**docs/glossary.md — new section «Прогрес», after «The month»:**

- **Досягнення** (achievement) — постійний факт про результат, якого власник уже досяг: віха
  обліку (стільки-то транзакцій, стільки-то активних місяців), якість запису (чистий місяць), або
  гроші, що дійшли до значущої позначки (ціль досягнута, резерв дорівнює місячній нормі витрат).
  Досягнення описує минуле, тому його **не забирають**: пізніше редагування історії його не
  скасовує. Кожне отримується щонайбільше один раз.
- **Свідчення** (evidence) — число, яким досягнення пояснює себе в мить отримання: скільки
  транзакцій, які місяці, яка сума з якою валютою. Це заморожене «як було тоді», а не баланс:
  жодна сума, жодна місячна картина, жоден ліміт чи ціль з нього не рахуються.
- **Виклик** (challenge) — одна річ, яку варто зробити зараз: причина, з якої його запропоновано,
  вимірюваний прогрес, однозначний критерій завершення й одна дія, з якої почати. Одночасно стоять
  щонайбільше три. Виклик можна прийняти, відхилити або сховати; відмова не коштує нічого й ніде
  не рахується.
- **Активний місяць** — календарний місяць, у якому є щонайменше одна транзакція. Імпортована
  транзакція робить місяць активним так само, як записана рукою: активність — це про дані, а не
  про те, чи власник відкривав застосунок.
- **Завершений місяць** — активний місяць, останній день якого вже минув.
- **Чистий місяць** — завершений активний місяць, у якому жодна витрата не має «Без категорії» і
  жоден дохід — «Без джерела».
- **Місячна норма витрат** — сума на місяць, яку **власник підтвердив** як міру «одного місяця
  витрат», окремо для кожної валюти. Застосунок пропонує медіану «витрачено» за останні шість
  завершених активних місяців тієї валюти й показує, які саме це місяці; поки власник не
  підтвердив число, норми немає. Застосунок ніколи не вгадує «базові витрати» за назвами
  категорій.
- **Резерв** — сума розрахункових балансів рахунків виду `savings` в одній валюті. Ніколи не
  змішує валюти й ніщо в ньому не конвертується.

**docs/glossary.md — three rows for «Distinctions the owner drew»:**

| This | is not that | because |
| --- | --- | --- |
| Досягнення | Виклик | одне про те, що вже сталося, і не забирається; інший про те, що ще можна зробити, і його прогрес перечитується щоразу |
| Активний місяць | день, коли власник відкривав застосунок | активність міряють транзакції, а не візити: імпортована історія робить місяці активними так само |
| Свідчення досягнення | Розрахунковий баланс | свідчення — заморожене число «як було тоді»; баланс — правда «як є зараз», і рахують завжди його |

**docs/product-vision.md — new §18 «Досягнення і виклики» [PROPOSED]:**

> Застосунок може сказати власникові, що вже вийшло, і що варто зробити далі. **Досягнення** — це
> постійний факт про вже досягнутий результат, який застосунок доводить з власних транзакцій;
> отримане не забирається. **Виклик** — одна конкретна річ, до якої можна рухатися зараз, з
> причиною, прогресом і однозначним завершенням; одночасно їх щонайбільше три, і відмова від
> виклика не коштує нічого.
>
> Це не гра. Немає очок, внутрішньої валюти, рівнів, серій відкривань застосунку, рейтингу й
> нікого, з ким порівнюватися. Ніщо не винагороджує витрачання грошей, кількість покупок чи
> дорогі категорії, і ніщо не створює причини приховати витрату або не зробити потрібне
> коригування. Кожен елемент відповідає на одне питання — яку корисну фінансову поведінку він
> підсилює; те, що не відповідає, у застосунок не потрапляє.
>
> Усе рахується локально з уже збережених транзакцій, по валютах і без конвертацій. Досягнення й
> виклики нікуди не йдуть: їх немає в пакеті для AI-аналізу, і поза бекапом власника вони телефон
> не покидають.

**docs/product-vision.md §12, one sentence appended to the first bullet:**

> Досягнення й виклики рахуються з тієї ж локальної бази, ніде не публікуються й у пакет для
> AI-аналізу не потрапляють.

**docs/tech-task.md §5** gains a roadmap row for this change, and **BACKLOG.md** loses nothing —
this change was not on it.

### D14 — Where the code goes

```
src/progress/            pure TypeScript, no React, no storage — the whole model
  summary.ts             the зведення прогресу: its shape, and the pure derivations over it
  catalogue.ts           the achievement templates, versioned, with their predicates
  achievements.ts        evaluate(summary, goals, norms, earned) → the keys newly earned
  norm.ts                the median proposal and the confirmed норма
  challenges.ts          candidate виклики, their progress, their ranking, the cap of three
src/ui/progress-screen.ts   what «Прогрес», the Головний card and the detail screens say
src/db/progress-repo.ts     the three tables + the aggregate that builds the зведення
src/app/progress.tsx        the pushed screen
src/app/achievement/[key].tsx   the detail screen
```

`src/progress/` is a new top-level pure module, following `src/analysis/`, `src/reminders/` and
`src/backup/` rather than growing `src/domain/`, which holds the money core the whole app depends
on. It imports from `src/domain/` and nothing imports from it except `src/ui/`, `src/db/` and the
screens.

## Risks / Trade-offs

- **The catalogue could still grow into badge soup.** Mitigated by D12 as a written test every
  future template must pass, by the tier lists being short (four counts, four month-counts, three
  goal quarters) and by the explicit refusal of a badge per 5 %.
- **A досягнення's свідчення drifts from the current history.** Accepted and made visible (D2): the
  свідчення is labelled as what was true then, and every live number beside it is recomputed.
- **The норма is a number the owner might set carelessly**, making a резерв milestone easy. Accepted:
  single-player, no audience, and the app shows the six months it derived the proposal from.
- **A ціль deleted and recreated re-earns its milestones** under a new id. Accepted: it is a new
  ціль, and pretending otherwise would need to remember deleted цілі.
- **Evaluating at app start costs a query on a cold open.** Bounded by D10 and measured in the smoke
  run on the owner's real history; the зведення is the seam a cache would sit behind if it ever
  needs one.

## Migration Plan

One new migration generated by `npm run db:generate`, adding `earned_achievements`,
`challenge_decisions` and `spending_norms`. It creates tables only — no committed migration is
touched, no existing table is altered, and every stored row survives it (rules/database.md).
`src/db/migrations.test.ts` proves an empty database reaches the new shape and that a database at
the previous migration keeps its rows.

There is no data migration: the first evaluation after the app starts is what fills
`earned_achievements`, from the history that is already there.

## Open Questions

- **The норма's proposal window is six months.** Fewer than six завершені активні місяці in a
  currency: propose from what exists (at least three), or offer no proposal and let the owner type
  the number? The spec takes the second — a median of two months is not a median — and this is the
  one number the owner may want to overturn.
- **Whether «Прогрес» belongs on Звіти at all**, given Головний already leads to it. Kept because
  Звіти is where цілі already live and where the owner goes to read the history rather than the day.
