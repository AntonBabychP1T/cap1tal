## Why

Roadmap «Горизонт 1» §1.3 («Однакові поля всюди») asks for one way to pick a рахунок, a категорія
or a джерело, one money format, one date text and one date control across the whole app. Most of it
already landed with `qa-sweep-2026-10`: app-shell now says a сума is written with its ISO code
(«80,00 UAH», never «₴»), a дата in running text is «5 листопада», every дата the owner sets uses the
entry form's date control, alphabetical lists follow Ukrainian order, and the зобов'язання form and
the quick «Без категорії» mark use the entry form's short-list picker. What is left is the part that
still makes the owner learn a different control on every screen:

- Six forms still pick a рахунок or a категорія from a bare wall of chips — the розстрочка form
  («Рахунок списання», «Категорія» in a sideways strip), the правило form («Категорія», «Переказ на»),
  the шаблон's «Базові категорії», the ціль витрат's «Категорія», the рахунок of a watched bank app
  in «Сповіщення банків», and the рахунок a monobank card is linked to. With 29 рахунки and 27
  категорії that is the ~10 swipes QA 2.10 counted.
- Plans and bank watches offer a рахунок that cannot pay anything: a рахунок-борг is a person, yet
  it is offered as «Рахунок списання» of a зобов'язання (QA 2.10) and of a розстрочка, and as the
  рахунок a bank's сповіщення lands on.
- Only the quick mark's full list opens without the keyboard covering it (QA 2.14); app-shell says
  nothing about the others.
- Seven places still draw a date code in running text: a ціль's «до 2026-12-31» (Налаштування →
  Цілі, the ціль screen, «Звіти»), a чернетка's line on Головний, the monobank link confirmation
  («з 2026-09-11 включно»), a чек's «Чек виписано 2026-09-21», a досягнення's condition, and the
  Saldo screen's «Імпорт уже виконано 06.10.2026, 14:03:00» (QA 2.11's remainder).
- The date control stops its «день ›» step at today everywhere, which is right for a транзакція and
  wrong for a ціль «До дати» or a «Дата першого платежу», which are usually in the future.

Vision mapping: both problems of §1 are served indirectly — every answer the owner gives the app
(a правило, a план, a ціль) is the material for *where the money went* and *how much is left*, and
a field that behaves the same everywhere is what makes giving it cheap (vision §3: «what is waiting
for an answer»). No new reading is added.

## What Changes

- **One picker everywhere.** Every place that picks one рахунок, one категорія or one джерело to be
  stored — beyond the recording path, which main-screen already governs — uses the entry form's
  picker: at most five shown (last reached for, topped up in Ukrainian order), whatever is chosen
  always among them, one offer «Всі … (N)» opening the full list with a search, «назад» closing the
  list first. Named list: розстрочка form, правило form, шаблон's базова категорія, ціль витрат, a
  watched bank app's рахунок, the рахунок a monobank card links to.
- **No рахунок-борг is offered to pay.** «Рахунок списання» of a зобов'язання and of a розстрочка,
  and the рахунок of a watched bank app, offer no рахунок-борг. An інвестиційний рахунок stays
  offered (the owner's real розстрочка is paid from UAH military bonds; a broker's fee can be a
  зобов'язання). A plan already stored on a рахунок-борг keeps showing it as chosen. «Переказ на» of
  a правило, both legs of a переказ and the склад of a ціль keep offering every вид.
- **Every full list is read before it is searched.** Opening any full list raises no keyboard; the
  keyboard opens when the owner taps the search, and the matches stay in sight above it.
- **No date code in running text, anywhere.** The seven leaks above are written as «31 грудня»,
  «11 вересня 2025», and an instant as «6 жовтня о 14:03».
- **A дата that looks ahead steps ahead.** For a ціль «До дати» and a «Дата першого платежу» the date
  control offers «день ›» past today; for a транзакція, «станом на» and the monobank start it still
  stops at today.

### Scope

The pickers, the рахунок sets and the date texts named above; the date control's forward step.

### Non-goals

- The money format: already decided and specified (ISO code after the amount, never «₴»; «≈ … грн»
  for the approximate hryvnia reading). This change only keeps it, no requirement is touched.
- The recording path's pickers (entry form, editing, the quick marks): main-screen already
  specifies them and `quick-entry` reworks the form; this change does not touch main-screen.
  Whether the entry form's витрата should stop offering a рахунок-борг is an open question, not
  decided here.
- Narrowing rows — «Транзакції»'s рахунок/місяць rows and the «Звіти» категорія row
  (transaction-search, "The filters leave the list on the first screen") — stay as rows: a filter
  holds «Всі» and is read, not answered.
- The склад of a ціль (several рахунки ticked at once) and the Saldo import's merge targets and
  redirects (ordered most alike first, already searchable — saldo-import-screen) keep their own
  shape.
- The нагадування time field («ЧЧ:ХХ») — a time of day, not a дата.
- The typed value inside a date field stays the code it is typed as; only running text is covered.
- Vision §14: no item is touched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: ADDED "Every picker of one рахунок, категорія or джерело is the entry form's
  picker" and "A full list is read before it is searched"; MODIFIED "A транзакція's дата reads as a
  day" (the чернетка line), "A дата in running text is a day and a month in words" (instants, and
  the places named) and "A дата or a місяць the owner sets is set with the app's own control" (the
  forward step of a дата that looks ahead).
- `commitments-screen`: MODIFIED "The зобов'язання form starts monthly and refuses in Ukrainian" —
  «Рахунок списання» offers no рахунок-борг.
- `installments-screen`: MODIFIED "The form fills in what it can and refuses in Ukrainian" —
  «Рахунок списання» offers no рахунок-борг.
- `bank-notifications-screen`: MODIFIED "A watch is added by picking an app and its рахунок,
  accepted by the capture layer first" — no рахунок-борг is offered.

## Impact

- Screens: Налаштування → Розстрочки, Правила, Базові категорії, Цілі, Сповіщення банків, monobank,
  Зобов'язання (рахунок set only); the ціль screen and «Звіти» (date text); Головний's чернетки
  section and the чек screen (date text); «Досягнення» (condition text); Saldo import (moment text).
  Every one of them changes on screen, so the emulator smoke covers them.
- Code: screen view models in `src/ui/` (no domain or storage change, no migration, no new native
  module, permission or package).
- **Sequencing with siblings:**
  - `answer-queue` shows чернетки and «Обрати джерело» in its queue — it should reuse this change's
    date text and picker rule; not in the same wave if it rewrites `drafts-section`. It also adds a
    «Джерело» target to a правило as a bare chip row: that field is covered by app-shell's general
    picker requirement, and whichever change merges second puts it on `Picker` (this change is
    implemented in its own worktree while answer-queue is applied in the main checkout; the merge
    resolves `rules.tsx`, `list-management.ts` and `docs/glossary.md`).
  - `quick-entry` reworks the entry form and its default рахунок; no spec overlap (this change does
    not modify main-screen), but both edit the shared `Picker` component — do not run them in the
    same wave.
  - `commitments-from-recurring` writes a зобов'язання from a suggestion: its pre-filled «Рахунок
    списання» must respect commitments-screen's «no рахунок-борг» rule; land this change first
    or in a later wave, not in the same one, since both touch `commitment-form`.
  - `observations-by-weight`, `backup-reminder`: no overlap.
