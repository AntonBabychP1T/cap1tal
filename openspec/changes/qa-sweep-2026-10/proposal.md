## Why

A hand-driven pass over the whole app on the emulator on 2026-10-05, on the owner's real data
([docs/qa/2026-10-05-emulator-qa.md](../../../docs/qa/2026-10-05-emulator-qa.md), «QA» below),
found twenty-six defects. Two of them can write a wrong категорія into the whole history with one
tap, one leaves a twelve-day-old bank picture looking current, one makes «чистий місяць» — the
measure of a trusted month in vision §15 — practically unreachable, and the rest are the app
saying, drawing or offering something that is not true of the state it is in.

Both problems of vision §1 are touched. *Where did the money go* is answered wrongly when a
proposed правило or продавець is built from the bank's transliterated service words (QA 2.1), when
«Без джерела» has no way to be answered (QA 2.3), and when спостереження bury the one notable fact
under ten (QA 2.8). *How much can I still spend* is trusted on stale data when the token is gone
and Головний says nothing (QA 2.2). They are carried as one change, as `qa-sweep-2026-09` was,
because they are one kind of fault — the app misreporting its own state — and most are a few lines
behind a spec sentence that was never written or is written too broadly.

## What Changes

**What can write a wrong number**

- **Proposals skip the bank's words in every alphabet.** The proposed написання, the proposed назва
  of a продавець and the proposed pattern of a правило skip the bank's leading service words in
  Latin transliteration as well («Oplata poslug», «Pokupka», «Perekaz»), a payment processor's
  prefix (`LIQPAY*`, `WFP*`, `GOOGLE *` and the like), and never keep a phone number or a run of
  digits in a назва. An опис that names a person («Від: …», «Переказ …») or a банка top-up
  («Поповнення «…»») is not listed under «Без продавця» (QA 2.1).
- **A правило and a написання match where a word begins.** «коло» recognises «Коло 12» and
  «WFP*KOLO», not «Навколо»; matching is still case-folded and still finds the pattern anywhere in
  the опис, but only at the start of a word (QA 2.17; owner's choice, 2026-10-06).
- **Головний says when monobank cannot be heard because the token is gone.** With рахунки still
  linked and no token, the service rail carries one row naming how many рахунки are not being
  updated and since when; its tap opens monobank. An owner who never connected a bank still sees
  nothing (QA 2.2, vision §3).

**What makes a month impossible to close**

- **«Без джерела» is answered like «Без категорії».** «Транзакції» narrows to «Без джерела» (and
  can be opened so narrowed); a дохід «Без джерела» in the feed and the list carries «Обрати
  джерело» in one tap. The підсумок's «Що ще без відповіді» and the виклик «Закрий <місяць>» open
  the month already narrowed to what is unanswered (QA 2.3).
- **A possible duplicate can be answered both ways.** Two витрати with the same опис are a
  можливий дубль too when neither carries an MCC (owner's choice, 2026-10-06) and — this change's
  own refinement, confirmed by the owner on 2026-10-06 — their рахунок is not linked to monobank,
  because older monobank imports carry no MCC. Two real purchases with equal описи from another
  bank's сповіщення are then asked about too, and two hand records with one опис on a linked
  рахунок are not; «Не дубль» can be undone from where it was given; the спостереження offers «Видалити одну» beside
  «Не дубль» (QA 2.15). «Видалити одну» is the owner's own delete, the same one the editing screen
  offers — the app still never deletes on its own — and vision §19's "The only answer is to a possible
  duplicate: «Не дубль»" stays true: the fact is not dismissed, it disappears because the транзакції stop making it true.
- **Fewer, plainer спостереження.** A категорія with nothing spent this month says «цього місяця не
  було» instead of «на 100 % менше»; Місяць and the підсумок show the first five in the existing
  order and fold the rest under «Ще N» (QA 2.8). Thresholds and order are unchanged.

**What says or draws something untrue**

- **A коригування reads as one.** Its screen shows сума, рахунок, дата and опис, lets the опис be
  edited, and deletes with a confirmation naming the сума; the stale «зʼявиться разом зі
  «звірити»» goes (QA 2.4).
- **The status bar is legible in both themes** (QA 2.5).
- **Labels never collide, charts say there is more.** Month labels under «Статок» thin out instead
  of overlapping when the forecast is on (QA 2.6); the «Звіти» history chart opens on its latest
  month and marks that earlier months lie to the left (QA 2.7).
- **One way to write money, dates and lists.** Every сума reads with its ISO code («80,00 UAH»,
  never «₴» — owner's choice, 2026-10-06); every дата in running text is a day and a month in words («5 листопада», never «5
  лист.» or «2026-09-21»); every alphabetical list sorts by Ukrainian collation, case-folded;
  every date and month the owner sets is set with the app's own date control, not typed as a
  code (QA 2.10, 2.11, 2.26).
- **The зобов'язання form picks like the entry form** — five recent and «Всі (N)» with a search,
  for both рахунок списання and категорія (QA 2.10).
- **Ukrainian grammar in sentences that carry a month** — «Закрий вересень 2026», «У вересні 2026 ще
  9 записів» (QA 2.9); «У вересні не записано доходу» for a finished month (QA 2.21).
- **Accessible names say what colour says.** A feed or list line over its ліміт says so in its
  accessible name, and so does the зміна of Статок that fell on the «Статок» card; every switch on
  «Налаштувати Головний» names its widget (QA 2.12).
- **Long names break between words.** A переказ line at large text sizes shortens a name with «…»
  and never breaks inside a word (QA 2.13).
- **The quick категорія picker suggests and stays readable.** The категорія a правило or the шаблон
  would give is offered first; opening the full list does not raise the keyboard over it (QA 2.14).
- **Words that fit what they describe.** An empty сума is refused with «Напишіть суму», a zero or
  negative one with «Сума має бути більшою за нуль»; the правило-переказ offer says the опис will
  become a переказ, not a категорія; the search hint fits its field (QA 2.16).
- **The підсумок explains its two витрати.** When коригування are part of витрачено, the «Витрачено»
  section says by how much (QA 2.20).
- **Smaller honesty fixes.** «Звірити» offers the bank's balance as a one-tap value when it is
  known (QA 2.22); «Оновити список рахунків» stands down without a token (QA 2.23); the empty
  «Спостереження» widget is drawn as a widget (QA 2.24); a транзакція keeps its place in a day's
  list when it is edited (QA 2.19).
- **Hardware «назад» on an edited form asks first.** A form with unsaved edits asks «Відкинути
  зміни?»; an untouched form still closes at once (QA 2.18; owner's choice, 2026-10-06).
- **Also found while mapping the code, fixed with a failing test first.** Two need no spec change,
  the specs already requiring them: the editing of a коригування offers no опис although
  main-screen's «The опис is visible everywhere and correctable» says it must; same-day monobank
  items are stored in the API's newest-first order, so the feed lists a day's bank транзакції
  oldest on top. Two bring a spec in line with what is meant: the зобов'язання form can offer «Без
  категорії» twice and offers «Коригування» and «Комісія» (commitments-screen now says it offers
  neither), and the PLN the forms already offer is missing from accounts-screen's list of
  currencies (accounts-screen adds it).

Non-goals, deliberately:

- **No new thresholds.** Every number in `src/observations/thresholds.ts` stays; only how many
  facts are shown, in what order, and how a zero is phrased change.
- **No правила for дохід.** «Обрати джерело» is a one-tap answer; rules that set a джерело are a
  feature (roadmap 1.1), not a defect, and stay out.
- **No field-level validation redesign.** Refusals keep their dialog; only their words change.
- **No change to what Місяць counts.** коригування stay inside витрачено (monthly-picture); the
  підсумок only says so.
- **Not the cold-start blank «Місяць» (QA 2.25)** — seen once at 200 % text and not reproduced;
  the smoke pass watches for it.
- Nothing from vision §14 is touched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: seven requirements added — сума with its currency code; дата in words; dates and
  місяці set with the app's own control; Ukrainian alphabetical order; a legible status bar; «Відкинути
  зміни?» before «назад» discards edits; accessible names for switches and coloured marks (a line
  over its ліміт, a зміна of Статок that fell); names that break between words.
- `main-screen`: «Sync occupies a compact header» and «Головний says how fresh the bank data is»
  amended for linked рахунки without a token; the in-flight «Спостереження» widget requirement
  amended (its empty sentence inside the card); added — the no-token row, «Обрати джерело», the
  suggested категорія and a keyboard-free full list, the two сума refusals.
- `transactions`: added — a коригування shows what it did and its опис is editable.
- `transaction-search`: added — the «Без джерела» narrowing, opening so narrowed, a hint that fits.
- `categorisation-rules`: «Matching is deterministic and most-specific-first» amended (word start);
  «A правило is proposed from a транзакція that carries an опис» amended to defer to the merchants
  proposal instead of restating it; «The app ships a шаблон of базові категорії» amended — the
  шаблон keeps substring matching, being written as fragments; added — the правило offer says what
  the правило will do.
- `merchants` (in flight): the proposal and recognition requirements amended.
- `merchants-screen` (in flight): «Без продавця» amended — payments to a person or a банка are not
  listed.
- `observations` (in flight): typical-сума, можливий дубль and «Не дубль» requirements amended.
- `month-screen`: the numbers requirement amended («ще» only for the current month); the
  спостереження block (in flight) amended; the two «Платежі місяця» requirements (in flight) in UAH.
- `month-summary` (in flight): витрачено names its коригування; each unanswered count leads to its
  narrowing; the спостереження as Місяць lists them.
- `month-summary-screen` (in flight): «Every part of the підсумок leads to what it is made of» —
  one route per unanswered count.
- `challenges`: «Закрий <місяць>» in grammatical case and opening on what is left, in both
  requirements whose scenarios name it.
- `bug-report-screen`, `bug-report-here`: the репорт form and sheet ask before «назад» discards.
- `commitments-screen` (in flight): short-list pickers without «Коригування» or «Комісія», and UAH
  in four requirements.
- `installments-screen`, `fiscal-receipts-screen`: UAH and full dates; the розстрочка form asks
  before «назад» discards.
- `settings-screen`: the Ліміти, Цілі and list editors ask before «назад» discards.
- `net-worth-screen`: forecast months count for the label rule; names never overlap; the розбивка
  writes each сума with its currency code.
- `reports-screen`: added — the history chart shows there are earlier months and a short scale.
- `accounts-screen`: PLN among the currencies; «Звірити» offers the bank's balance.
- `monobank-sync-screen`: «Оновити список рахунків» unavailable without a token.
- `ai-analysis-screen`: range ends are stepped as місяці, not typed.
- `dashboard-layout`: added — each switch names its widget.

## Impact

- **Order.** `merchants`, `merchants-screen`, `observations`, `month-summary-screen` and
  `commitments-screen` exist only inside three changes merged into `main` but not archived
  (`merchant-normalization`, `observations-and-month-summary`, `commitments`). This change's deltas
  on them validate today but archive only after those three are archived; task 0 records that.
- **Domain:** `src/domain/merchants.ts` (service words, prefixes, word-start matching),
  `src/domain/rules.ts` (word-start matching, proposal), `src/observations/{duplicates,vs-typical,order}.ts`,
  `src/progress/challenges.ts`.
- **UI logic (Node-proven):** `src/ui/labels.ts` (one money and one date formatter, collation),
  `src/ui/main-screen*`, `src/ui/merchants-screen.ts`, `src/ui/month-screen.ts`,
  `src/ui/month-summary-screen.ts`, `src/ui/commitment*.ts`, `src/ui/installments-screen.ts`,
  `src/ui/receipt-screen.ts`, the transactions-screen module, the transaction form's amount
  refusals, the observation view model.
- **Screens:** `src/app/(tabs)/{index,month,reports,accounts}.tsx`, `src/app/transaction/[id].tsx`,
  `src/app/transactions.tsx`, `src/app/net-worth.tsx`, `src/app/manage/{commitments,goals,monobank,home-dashboard}.tsx`,
  `src/app/ai-analysis.tsx`, `src/app/_layout.tsx` (status bar), the shared picker, date control
  and close-on-back hook.
- **Emulator, not `verify`:** status bar, chart labels, 200 % text, keyboard over the picker and the
  «Відкинути зміни?» gesture are layout and are proven by the smoke pass with screenshots.
- **Other work in flight that must follow:** the untracked `local-model-guesses` draft writes «₴»
  in `model-guesses` and `bank-notifications-screen` scenarios, and `category-icons-and-transaction-visuals`
  (3/31) has an icon editor that «назад» closes; both are to adopt app-shell's new money and
  «Відкинути зміни?» requirements when they are next touched — noted, not edited here.
- **Behaviour the owner will notice on existing data:** stored категорії never move — правила
  only decide at import and when filling «Без категорії», and the шаблон keeps matching inside words —
  but a продавець recognised only inside a word stops being shown at once, since recognition is read every time. The task that lands it
  reports, from the owner's own бекап, every опис whose правило or продавець would differ, before it
  is merged (design D7).
- **Storage:** none — no migration. «Не дубль» undo deletes the answer it just wrote.
