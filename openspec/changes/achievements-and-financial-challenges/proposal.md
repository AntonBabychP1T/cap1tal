# achievements-and-financial-challenges — proposal

## Why

cap1tal answers two questions — where the money went, and how much is left — and answers them only
as well as the record behind them. Vision §15 says as much: v1 has worked when three consecutive
months hold every транзакція from every рахунок and «залишилось» is a number the owner trusts. But
nothing in the app ever says whether that is happening. The owner keeps the record, and the app
keeps score of nothing.

Two silences follow from that.

The first: **effort that already succeeded is invisible.** The owner's stored history spans two
years, thousands of транзакції, long stretches in which nothing was left «Без категорії», a резерв
that was actually built and інвестиційні рахунки that were actually fed. Every one of those is a
fact the app can already prove from its own tables, and none of them is ever said out loud. An
owner who is doing this well has no way to see that they are.

The second: **there is no next thing.** «Потребує уваги» names what is broken right now, and Місяць
names what a month cost. Neither names anything worth *reaching* — a резерв of one month's витрати,
a ціль's next quarter, a ліміт held three months running. The app has цілі, but a ціль is a number
the owner already declared; nothing ever proposes one.

This change adds the smallest thing that closes both: **досягнення**, a permanent record of what
the history already proves, and **виклики**, at most three standing suggestions with a reason, a
measurable progress and a clear finish. It is not a game. There are no points, no currency, no
streak of app openings, no leaderboard, no server, no confetti. Every element in it answers one
question — *яку корисну фінансову поведінку це підсилює?* — and anything that could not answer it
was left out (see design D12, and «Deliberately not in v1» below).

It serves the first product question directly: a досягнення is a statement about money that already
moved and a record that is already complete, and both are read off the транзакції, never entered.

## What Changes

- **New capability `achievements`** — the pure model of a **досягнення**: a permanent fact about a
  result the owner has already reached. A catalogue of templates lives versioned in code; what is
  stored per earned досягнення is only its stable key, the дата it was reached, the moment the app
  recorded it, whether the owner has seen it, and a small **свідчення** — the number that justified
  it, frozen at that moment and never read back as money.
  - **Earned is permanent; progress is always recomputed.** A досягнення describes the past, so it
    is never taken away by a later edit; every current number beside it — a ціль's progress, the
    резерв, the count of транзакції — is read from the транзакції each time it is shown, and is
    never stored. This is the same decision `goals` made about progress, applied once more.
  - **Retroactive by construction.** The engine evaluates the whole stored history, so installing
    this on an existing phone earns everything the history already proves — and so does a Saldo
    імпорт, a відновлення, a large monobank sync and an edit of an old транзакція. It can only ever
    add: a key already earned is never earned twice, however many times the engine runs.
- **New capability `challenges`** — the **виклик**: one thing worth doing now, with the reason it
  was proposed, a measurable progress, an unambiguous finish and one action to start from. At most
  three stand at a time, chosen deterministically from local aggregates — never by a language
  model, which is not a source of truth here any more than anywhere else. The owner may accept,
  dismiss or hide one; refusing costs nothing and is never counted against them.
- **New capability `progress-screen`** — «Прогрес»: a pushed Stack screen reached from Головний and
  from Звіти, with «Виклики», «У процесі» and «Отримані»; a detail screen per досягнення and per
  виклик naming its exact condition; a conditional card on Головний that appears only when
  something is genuinely waiting; and one grouped, unobtrusive celebration — «Ви вже маєте 12
  досягнень →», never twelve dialogs in a row and never a blocking modal.
- **New concept «місячна норма витрат»** — the owner-confirmed сума that «one month of витрати»
  means, per currency. The app proposes a number (the median of «витрачено» over the last six
  завершені активні місяці in that currency) and the owner confirms or replaces it. Until it is
  confirmed there is no норма, and every досягнення and виклик that depends on one simply does not
  exist. The app never guesses «базові витрати» from category names.
- **Modified `persistence`** — three new tables behind append-only migrations: earned досягнення,
  the owner's decisions about виклики, and the норми. Nothing derived is stored: no progress, no
  balance, no score. Storage also gains the bounded aggregate reading the engine runs on
  («зведення прогресу»), so evaluating never loads the history транзакція by транзакція.
- **Modified `backup-file`** — a бекап carries the earned досягнення, the decisions about виклики
  and the норми. They are the owner's own state, not a derivation of the money, and a відновлення
  that dropped them would silently unearn two years of history.
- **Modified `main-screen`** — a «Прогрес» section, rendered only when there is an unseen
  досягнення or an accepted виклик; nothing at all otherwise.
- **Modified `reports-screen`** — «Звіти», where the цілі already live, leads to «Прогрес».
- **Documentation** — docs/glossary.md gains «Досягнення», «Виклик», «Активний місяць»,
  «Завершений місяць», «Чистий місяць», «Місячна норма витрат», «Резерв» and «Свідчення», plus
  three rows in «Distinctions the owner drew»; docs/product-vision.md gains §18 and one line in
  §12 stating that nothing here leaves the phone. The exact proposed wording is in design D13 —
  this change proposes it, the owner approves it, and `/opsx:apply` writes it.

### Scope

The pure model of a досягнення and a виклик, the catalogue of both, the evaluation the engine runs
at named moments, the three tables, the бекап, and one pushed screen with one conditional card on
Головний.

### Non-goals

- **No sixth tab.** «Прогрес» is pushed over the tabs like `transactions`, `transaction/[id]` and
  `account/[id]`.
- **No XP, no coins, no «очки багатства», no level.** A number with no financial meaning is a
  number this app will not compute.
- **No streak of app openings.** Every streak here is a streak of *місяці that hold good data* —
  which an імпорт can satisfy retroactively and a phone left in a drawer cannot break, so long as
  the автоматичний імпорт kept working.
- **No reward for spending.** Nothing is earned by витрачати, by the number of purchases, by a
  category, by a card or by credit. The catalogue rewards recording, categorising, saving,
  reaching a declared ціль and contributing to інвестиції — nothing else.
- **No leaderboard, no profile, no server, no telemetry, no share.** Vision §12 is untouched: the
  only outbound connections stay monobank, the курс, the tax service and the opt-in Google Drive.
- **No AI.** No досягнення, виклик or норма enters a пакет для аналізу, and no language model
  decides, ranks or names anything here.
- **No stored «місяць закрито» marker.** Design D9 says why, and how the API leaves room for one.
- **No change to how any money number is computed.** `monthlyPicture`, `computeBalance`,
  `goalProgress`, `overLimit` are read and never touched. No транзакція, баланс, ліміт or ціль
  changes because a досягнення was earned.
- **No redesign of `goals`.** See «What this change depends on» — the engine reads a ціль's
  progress through the capability, never through `goal.accountId`.

### Deliberately not in v1, with the reason

- **«Точний облік» — коригування under 2 % of витрачено for three months running.** Vision §15's
  own criterion, and the one template that failed the test in design D12: with the app storing no
  record that a рахунок was ever **звірено**, the condition is satisfiable by *not reconciling* —
  by never recording the коригування that the honest owner records. That is precisely the
  incentive this change refuses to create. It ships when storage remembers the moment each рахунок
  was last звірено (one column, the shape `investments-value` already uses for «поточна вартість»),
  and not before. Nothing else in the catalogue depends on it.
- **A composite «місяць у порядку» badge** on top of «Чистий місяць» and «Місяць без чернеток» —
  badge inflation, three names for one fact.
- **Absolute money milestones** (1 000 / 10 000 / 100 000 UAH). A round number means something
  different to every owner and to every year; it reinforces no behaviour. Money milestones here
  are measured in місячні норми витрат instead, which is the same number for everyone: *how long
  could I live on this*.
- **Інвестиційний капітал milestones in a currency with no норма** (USD, EUR for this owner). They
  would need a per-currency milestone the owner sets by hand — the same confirmation pattern as
  the норма, and a second thing to confirm before anything appears. v2.

## What this change depends on

- **Nothing in flight blocks it.** It adds tables and one screen; it modifies no requirement any
  in-flight change modifies. `home-daily-overview` and this change both add to Головний, in
  separate sections, as separate ADDED requirements.
- **`goals` has not been redesigned.** As of this proposal `openspec/specs/goals/spec.md` still
  says a ціль names **one рахунок** and its progress is that рахунок's розрахунковий баланс, and
  `openspec list` holds no change that alters it. This change therefore does **not** assume
  multi-рахунок цілі — and does not hardcode against them either: every досягнення and виклик
  about a ціль reads `goalProgress(ціль)` and the ціль's own currency through the `goals`
  capability, and knows nothing about which рахунок or рахунки that progress came from (design
  D6). When the ціль redesign the owner asked for lands as its own change, nothing here needs
  rewriting — the goals capability changes, and this one reads the new answer.
