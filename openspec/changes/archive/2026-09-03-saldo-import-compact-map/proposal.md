## Why

The «Рахунки» step of «Імпорт Saldo» draws every possible merge as a chip. One row per (Saldo
account, currency) pair, and on each row: 5 chips for the вид, then one chip for **every other
entry of the import** — whatever its currency — plus every unarchived рахунок the owner already
has. On the owner's own export that is 23 rows × (5 + 22) ≈ **621 chips** in one scroll, a near
matrix of every рахунок against every other. The screenshot in `docs/app-overview.md` §4.8 shows it
already unreadable on the five-account demo.

The task behind that wall is small and the owner already knows the answer: *"I have 20 рахунки and
two of them are the same card."* Vision §16 names the case exactly — Saldo holds a hand-kept
"mono black" beside an auto-imported "Monobank UAH, Black", and they are one card. Two merges. To
make them the owner reads 621 chips and scrolls past all of them to reach «Далі — звірка».

Worse, this is where a fresh phone starts. «Перші кроки» asks for a рахунок first and the Saldo
import third, so the owner arrives here having just created «гаманець» by hand — with the one
existing рахунок the import most likely duplicates — and meets what reads like database
configuration. The import is the move that makes the app worth opening (vision §2, §6.4); this
screen is the toll on it.

Nothing about what the import *means* is wrong. The engine's rules — merge only within a currency,
build the plan before writing, звірка before commit, one atomic write, no automatic merge — are
right and are not touched here. What is wrong is that the screen asks the owner to read the whole
answer space to give a two-tap answer.

## What Changes

- **The «Рахунки» step becomes a compact list.** One row per entry showing назва, валюта,
  the вид it will get, and one line of state: «Новий рахунок», «Об'єднується з «…»» or «Додається
  до наявного «…»». No chips in the resting state — 23 rows of three lines instead of 621 chips.
- **The merge targets stop being furniture.** They are drawn only after the owner opens «Об'єднати
  з…» on one row, one row open at a time.
- **The selector shows only what can actually be merged**: рахунки of that row's currency. Today a
  UAH row offers USD рахунки and the import rejects the tap afterwards with a reason — an offer
  that exists to be refused. The engine's cross-currency rejection stays exactly as it is; the
  screen simply stops offering the refusal.
- **The selector ranks and searches.** Candidates most like the row's name come first, a search
  field narrows them when there are more than five, and «Створити окремий рахунок» is always the
  first choice — the way back out of a merge, from inside the selector as well as from the row.
- **A new thing the owner reads: a «підказка про дубль»** — one sentence on a row saying «Схоже,
  це той самий рахунок → «Monobank UAH, Black»», with «Об'єднати» beside «Ні, окремо». It merges
  nothing by itself, it names only a рахунок that row's own merge targets would offer, it is
  carried by at most one side of a pair, and it is deliberately conservative: identical names after
  folding, or every word of the shorter name matching a word of the longer. The rows carrying one
  are grouped first under «Схоже на дублі (N)», and that grouping is fixed when the export is read,
  so nothing reorders while the owner works. The term goes into `docs/glossary.md` as **[PROPOSED]**,
  because it is a word the owner reads on screen and hard rule 7 forbids a second name for it.
- **A row nobody touches needs no touch.** The default answer stays «створити окремо», and the step
  opens with one line saying so: how many рахунки were found, how many look like duplicates, and
  that the rest will simply be created.
- **«Далі — звірка» is reachable without the list.** It stands under that summary line as well as
  at the end of the list.
- **The вид is still changed before the import**, now behind «Вид» on the row rather than five
  chips drawn 23 times; «Повернути вид із Saldo» stays where it was.
- **The «нові категорії та джерела» block on the same step** gets the same treatment where it has
  the same fault: its «Обрати наявну» list draws every категорія as a chip with no search. It gains
  the selector's search, and it opens under the one-editor rule of the bullet below rather than
  keeping a flag of its own.
- **One editor is open on the step at a time** — a row's merge targets, a row's вид, or the
  existing rows offered to a proposed категорія — and the phone's «назад» closes it before leaving
  the step, the rule `backGesture` already states for every other editor in the app.
- **Every action of the step is a full touch target and the step reads on a narrow screen**: a long
  Saldo назва wraps rather than pushing the currency and the state off the row, and nothing needs a
  horizontal gesture. Stated as a requirement because the compact row is what makes it a question —
  three lines and two actions where there used to be a card of chips.

Non-goals, deliberately:

- **No change to what the import means.** `saldo-import` is untouched: what a row becomes, how
  balances reconcile, that merging is currency-bound, that the plan is built before it is written
  and written atomically. This change decides which of the engine's legal answers the screen draws
  and in what order — never which answers are legal.
- **No automatic merge, ever, and no stored guess.** A підказка про дубль is a sentence with two
  buttons. Dismissing one lasts for the flow and is written nowhere.
- **No new step, route, modal or bottom sheet.** The selector expands in place, as
  `shortlist-pickers` decided for the recording form (its §D5).
- **No change to the step machine or to what «назад» does with nothing open** — it leaves the
  screen, exactly as today. The report step keeps its own «Назад — рахунки».
- **Not the English text in the звірка report** (BACKLOG has that as its own item), not a sticky
  footer button, not the file step, not the commit.

## Capabilities

### New Capabilities

None. Every rule here already belongs to `saldo-import-screen`: what the map step shows, how a
redirect is offered, and what the owner must have seen before the commit.

### Modified Capabilities

- `saldo-import-screen`: the requirement "The owner confirms the account map before the plan is
  built" is amended — today it says the targets "SHALL be offered on the entry's own row as a list
  to choose from", and that sentence is what draws the matrix; it now says they are offered there
  *and only after the owner asks for them*, and points at the new requirement for the rest. Four
  requirements are added: what a compact row shows and which states it has; what the «Об'єднати з…»
  selector offers, in what order, how it is searched, and which editor may be open; when a підказка
  про дубль appears and what it may and may not do; and that every action of the step is reachable
  with a thumb on a narrow screen. The requirement "A proposed категорія or джерело can be
  redirected onto an existing row" is amended so its list opens under the same one-editor rule and
  is searched the same way.

## Impact

- `src/ui/name-similarity.ts` — new pure module: how alike two назви are, and the conservative gate
  that decides whether the app may call a pair the same рахунок. Provable under `verify`, which
  never runs JSX.
- `src/ui/saldo-import.ts` — `mergeTargets` gains the currency filter and the similarity order;
  `accountRows` gains each row's state, the рахунки it receives and its підказка про дубль; new
  `mapSections`, `mapSummary`, the «Створити окремий рахунок» way back, and the flow state that
  remembers a dismissed підказка.
- `src/app/manage/saldo-import.tsx` — the accounts step redrawn: compact rows, one open editor at a
  time, the selector, the summary line and the second «Далі — звірка»; `useCloseOnBack` wired.
- `src/ui/shortlist.ts` — used, not changed: `narrow`, `NOTHING_FOUND`, `COLLAPSE_LABEL` and
  `PICKER_SIZE` are the same search and the same threshold the recording form already uses.
  `src/ui/labels.ts` (`folded`, `nameMatches`, `accountChoiceLabel`, `KIND_CHOICES`) likewise.
- `src/hooks/use-close-on-back.ts` and `src/ui/back-gesture.ts` — used, unchanged.
- `docs/app-overview.md` §4.8 and its screenshot `screens/26-saldo-import-map.png` — restated and
  retaken after the emulator pass.
- `docs/glossary.md` — one **[PROPOSED]** entry for «підказка про дубль», the one word this change
  puts in front of the owner that the glossary does not already have.
- **In flight, same files:** `shortlist-pickers` (18/19) owns `src/ui/shortlist.ts`,
  `src/ui/labels.ts` and `src/components/form.tsx` and is what this change reuses — implement after
  it merges, or in a lane rebased on it. It touches no file of the Saldo flow, so the delta specs
  do not collide.
- Unchanged on purpose: `src/saldo/**` (parse, survey, interpret, verify), `src/domain/**`,
  `src/db/**`, `drizzle/`, `openspec/specs/saldo-import/spec.md`, `app.json`, `modules/`.
