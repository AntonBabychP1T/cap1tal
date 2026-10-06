## Why

Зобов'язання exist since 2026-10-02, but the owner still has to type every one in by hand, and
that first step is the longest one: Netflix, інтернет, мобільний are already in the history,
charged every month, and the app already knows it — the спостереження «a regular payment whose
price changed» reads exactly that regularity. Once a plan exists, its reading «Вільно після
зобов'язань» lives only on Місяць, one tap away from the screen the owner opens every day, and a
зобов'язання that matters (оренда) gives no warning before its платіж, while a розстрочка does.

The owner's decision of 2026-10-06 (below) asks for three things, and this change is those three;
`docs/roadmap.md` §1.5 describes the same request. All of them serve the vision's second question, *"how much can I still spend"*
(§1): a plan the owner never got round to recording is a платіж missing from «Вільно після
зобов'язань», and a reading nobody sees answers nothing.

## Owner's decision, 2026-10-06 (Горизонт 1 request)

In the /opsx:propose request of 2026-10-06 the owner asked, verbatim, for «зобов'язання з
знайдених регулярних платежів і нагадування перед платежем» and for «"Вільно після зобов'язань"
на Головному». That decision, not the roadmap, is the authority for this change. It covers:

- **(a)** a warning before a зобов'язання's платіж — overturning vision §4's **[PROPOSED]** line
  «No warning before a зобов'язання's платіж», and widening the §13 «Нагадування про платіж»
  decision and the glossary's «Нагадування про платіж» (which today says «never of a
  зобов'язання») to a зобов'язання;
- **(b)** «Вільно після зобов'язань» as a secondary line on Головний — amending §3, where
  «скільки лишилось» stays one tap away on Місяць; залишилось itself still stays there;
- **(c)** the пропозиція — extending §4's «The owner enters it by hand»: a пропозиція only
  pre-fills the form the owner stores, so the owner still enters every зобов'язання.

What the owner did **not** state — the warning off by default, at 10:00 the day before, one switch
per зобов'язання, and the «Ні» remembered — are this proposal's defaults, listed under Open
questions pending the owner's confirmation.

## What Changes

- **Пропозиція зобов'язання.** For the current month, a regular витрата — grouped by its **description key**, the folded опис —
  charged in one currency in each
  of the three calendar months before it, every month's largest charge within 5 % of their median
  — the same regularity the price-change спостереження already uses — and not yet covered by a
  plan, is offered as «Схоже на підписку: Netflix, 299,00 UAH щомісяця — записати зобов'язанням?»
  on the «Зобов'язання» screen, with «Записати» and «Ні». Місяць of the current month says how
  many there are and leads there.
- **The owner accepts; the app never records.** «Записати» opens the ordinary зобов'язання form,
  filled in from the latest of those charges (назва, сума, «Щомісяця», its дата as the дата
  першого платежу, its рахунок and категорія, and an ознака only when the сума moved). Nothing is
  stored until the owner stores the form. A пропозиція creates no plan, no транзакція and moves no
  number by itself (vision §14.6 stands: no recurring or scheduled транзакція, ever).
- **«Ні» is remembered.** Declining stores the owner's answer for that description key (the folded опис) and currency, so
  the same пропозиція is never made again; it can be taken back with «Скасувати» while the screen
  still shows it was given. The answer survives a restart and travels in the бекап, as «Не дубль»
  does — it is the owner's word and cannot be recomputed. This needs one append-only migration and
  one optional бекап section.
- **Нагадування about a зобов'язання's платіж.** Each зобов'язання gets its own switch
  «Нагадувати за день до платежу», **off** when it is recorded. With it on, the phone holds one
  local notification at 10:00 the day before each дата on which such a зобов'язання has an
  очікується платіж — one per дата, a fixed text naming no сума and no назва, leading to
  «Зобов'язання» — exactly the розстрочка's mechanism, re-asserted at the same moments. Per the
  owner's decision (a); off by default keeps the overturned §4 line's reason — a dozen підписки
  make no noise — pending confirmation.
  The switch is stored per зобов'язання (the same migration) and travels in the бекап.
- **«Вільно після зобов'язань» on Головний.** The «Витрачено» card gets a second line, per
  currency, «Вільно після зобов'язань: …», whenever Місяць would show that reading for the current
  month — the same number, computed the same way, never a forecast, absent when nothing is owed.
  Per the owner's decision (b), vision §3 is amended for this one secondary reading.

## Non-goals

- Any транзакція created, predicted or scheduled by the app (§14.6). A пропозиція is a question;
  only the owner's own store of the form makes a зобов'язання.
- Suggesting other періодичності than «щомісяця» (quarterly, yearly) — three monthly charges are
  the only regularity the existing detector reads.
- A list of declined пропозиції, or undoing «Ні» later than the screen that shows it was given.
- Entering «Що потребує відповіді» (sibling `answer-queue`): a пропозиція is optional and does
  not make a month unclean (§15).
- A Головний widget of its own, or the пропозиція on Головний.
- One switch for all зобов'язання, or a change to the розстрочка's нагадування про платіж.
- A forecast of the month (§14.10): Головний shows only what Місяць already shows.
- Зобов'язання or пропозиції in the AI-аналіз пакет.

## Vision §14 items touched

- **§14.6 recurring or scheduled transactions** — touched, not crossed: a пропозиція becomes a
  plan only after the owner accepts and stores it; a plan still records nothing.
- **§14.10 forecasts** — touched, not crossed: Головний repeats Місяць's declared-платежі reading;
  the пропозиція itself counts nowhere.
- **§14.14 remote push** — not crossed: the new notification is local.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `commitments`: ADDED the пропозиція зобов'язання, the remembered «Ні», and the day-before
  warning; MODIFIED what a зобов'язання holds (its нагадування switch).
- `commitments-screen`: ADDED the пропозиції on the screen, «Записати» filling the form, and the
  per-зобов'язання switch with its permission handling.
- `main-screen`: ADDED the second line of the «Витрачено» card.
- `month-screen`: ADDED the line on the current month leading to the пропозиції.
- `reminders-and-alerts`: MODIFIED what the app may post (the warning of a зобов'язання's платіж).
- `persistence`: MODIFIED what a stored зобов'язання keeps (its switch); ADDED the declined
  пропозиції surviving a restart.
- `backup-file`: MODIFIED the зобов'язання section (its switch); ADDED the declined пропозиції.

`observations`, `installments`, `dashboard-layout` and `monthly-picture` are read, not changed:
the regularity test is reused as it is, the розстрочка's warning is mirrored without being
touched, and the «Витрачено цього місяця» widget keeps its identity in the registry.

## Impact

- Domain: a pure пропозиція detector beside the commitments domain, reusing the price-change
  regularity helpers; a pure planner of зобов'язання warnings beside the розстрочка's.
- Storage: one migration — a `remind` column on `commitments` and a new table of declined
  пропозиції; `BACKUP_SCHEMA_VERSION` +1; one optional бекап section and one optional field.
- Screens: «Зобов'язання» (list and one зобов'язання), Місяць, Головний's month card.
- Notifications: a second dated notice kind on the existing local-notifications port; no new
  native module, permission, package or config-plugin change.
- Docs at apply time, citing the owner's decision of 2026-10-06: vision §3, §4 (l.106 and the
  [PROPOSED] warning line), §13; glossary «Зобов'язання», «Нагадування про платіж» (l.322–323), and
  a new entry «Пропозиція зобов'язання» that says a пропозиція is not a спостереження.

## Open questions (defaults pending the owner's confirmation)

- The warning of a зобов'язання's платіж is **off by default** per зобов'язання (розстрочки: on).
- It comes **at 10:00 the day before**, as the розстрочка's does.
- There is **one switch per зобов'язання**, not one for all.
- «Ні» is **remembered for good** (until a restore), with no list of declined пропозиції.
- A дата with a розстрочка платіж and a reminded зобов'язання платіж gives two notifications.
- Пропозиції appear only on «Зобов'язання» and as a count on Місяць, not on Головний or in
  «Що потребує відповіді».

**Sequencing with siblings.**
- `backup-reminder` and `answer-queue` may each add a migration and bump
  `BACKUP_SCHEMA_VERSION`: not in the same wave as either, or the second to land regenerates its
  migration and re-bumps the constant.
- `main-screen` is touched by every sibling; this change only ADDS one requirement there, but the
  «Витрачено» card code is shared with `backup-reminder` (a quiet line on Головний) and
  `quick-entry` — integrate one at a time.
- `uniform-fields` replaces the date and picker fields of the зобов'язання form; the prefill here
  sets values, not widgets, so either order works, but not in the same wave.
- `observations-by-weight` re-ranks спостереження and may retune thresholds; the пропозиція reuses
  the price-change regularity test, so a retuned band changes both at once — land that one first or
  in a later wave.
