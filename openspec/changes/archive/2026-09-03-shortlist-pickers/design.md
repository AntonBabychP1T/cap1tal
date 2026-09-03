## Context

See proposal.md — Why. What matters here is the shape of what exists.

One component draws every choice in this app: `Choices` in `src/components/form.tsx`. It takes a
label and a flat array of `{ value, label }` and paints one chip per element, wrapping. It has no
notion of "too many": twenty-eight рахунки are twenty-eight chips over five rows, and that is the
whole of the problem — the component cannot be told to show fewer, so every caller shows everything.

Two decisions this change must respect are already made and are not reopened:

- **Recency is read, never stored.** `recentlyUsed` in `src/ui/category-choices.ts` walks the
  стрічка the screen has already loaded (`transactionsRepo.listLatest(50)`) and returns the
  категорії and джерела in the order they were used. No table, no counter, no migration — the app
  learns nothing about the owner it cannot show them. This change adds рахунки to that walk and
  changes nothing else about it.
- **Screen logic is pure TypeScript under `src/ui/`, because `verify` never runs JSX.** Whatever
  the shortlist decides has to be decidable without React, or it cannot be proven by the gate.

The forms themselves are `src/app/transaction/new.tsx` (recording), `src/app/transaction/[id].tsx`
(editing, which has no recents at all today) and the inline categorising picker inside a feed row
on `src/app/(tabs)/index.tsx`.

## Goals / Non-Goals

**Goals:**

- One shortlist rule, written once, used by рахунок, категорія and джерело on all three screens.
- Provable under `verify`: which rows the shortlist holds, in what order, whether the «Всі …»
  offer appears, what it says, and what a typed search narrows to — all decided in `src/ui/`.
- No stored state, no schema change, no migration, no new dependency, no native code.
- The chips of a picker do not move while the owner is picking within it.

**Non-Goals:**

- Reworking `Choices` itself. Its shape, its chip and its selected-outline stay; the new picker is
  built on it, and its twenty-odd existing callers are untouched.
- Converting the pickers outside the recording path (§D10 names all of them).
- A modal, a bottom sheet, a new route, or any navigation for the full list (§D5).
- Ranking, frequency, learning, or any ordering the owner cannot reconstruct by looking at their
  own стрічка.

## Decisions

### D1. The rule lives in one new pure module, generic over the row

`src/ui/shortlist.ts`, generic over `{ readonly id: string; readonly name: string }`, so that
рахунки, категорії and джерела share exactly one implementation and cannot drift into three
slightly different behaviours. It answers three questions and nothing else:

- what the shortlist holds, given the offered rows, the recent ids and what is chosen;
- whether an «Всі …» offer is shown, and with what count;
- what a typed query narrows the offered rows to.

*Alternative rejected:* growing `category-choices.ts`. It is already the module that decides
*which* rows may be picked; how *many* are drawn is a different question, and mixing them makes
both harder to read. `shortlist.ts` takes an already-offered list and never second-guesses it —
which is also what keeps the "no change to what may be picked" promise mechanically true.

### D2. Five, one number for all three pickers

The owner records on three or four рахунки; five leaves a margin and fills two chip rows for
рахунки (whose labels carry « · UAH») and roughly two for категорії. `RECENT_SIZE` is already 5 in
`transaction/new.tsx` and has been in the owner's hands since `daily-usability`, so this is the
number already proven in use rather than a new guess.

*Alternative rejected:* a per-picker number (say 4 рахунки, 6 категорії). Two constants to explain
and no evidence either way; one number is one thing to change if five turns out wrong.

### D3. Shortlist = recents, topped up from the head, chosen appended

In order:

1. the recently used ids resolved against the **offered** rows (`recentRows`, moved into this
   module from `category-choices.ts` — resolving remembered ids against an offered list is the
   shortlist's question, and `shortlist` is now its only caller);
2. topped up from the **head of the offered list** until five, skipping what is already in;
3. capped at five;
4. then every row the picker has had chosen — the one the screen opened on and each one picked
   since — appended in that order, each once, if not already there.

Step 2 is what makes a fresh device — and a device whose latest fifty транзакції all landed on one
synced рахунок — still show five choices rather than one. The head of the offered list is a
deliberate choice of "what to top up with": for категорії that head is «Без категорії» followed by
the Ukrainian-ordered rest (`expenseCategoryChoices` already orders it that way), and for рахунки
and джерела it is their name order (`accountsRepo.list()` sorts by name, `sourceChoices` by
`byName`). It is arbitrary but stable, and stability is the point — a topped-up chip that is in the
same place tomorrow is learnable. The spec names that order, so it is a promise and not an
artefact.

Step 4 is the `withCurrent` idiom this codebase already uses, and for the same reason its comment
gives: such a row "is not an offer; it is what is already there", so it goes last rather than into
its place in the order. That is what keeps an archived рахунок of a stored транзакція visible
without offering it for anything new, and it is what makes the shortlist **six** chips wide in the
case where the row the screen opened on was not in the five.

It is *plural* — every row chosen while the screen is open, not just the current one — and that was
found by building it. With a single chosen row the chips shrink under the owner: the form opens on
the remembered рахунок as a sixth chip, the owner taps one of the five, and the remembered one
vanishes off the end, so going back to it means opening «Всі рахунки» a second time for a рахунок
that was on the screen a moment ago. Appending every chosen row makes the picker monotonic — chips
only ever appear — which is the honest reading of "nothing moves under the finger" and costs one
chip per row actually reached for. The spec was widened to say so.

*Alternative rejected:* putting the chosen row first. It reads better for one frame and then
reorders the row every time the owner picks — chips move under the finger, and the second tap of a
double-tap lands on a different категорія. §D4 is the same objection stated as a rule.

### D4. The shortlist is computed from what was loaded, not from what is picked

The shortlist depends on the stored data the screen loaded (accounts, categories, sources, the
стрічка) and on the rows chosen since it opened — never on a re-read. Picking within the shortlist
changes which chip is outlined and nothing else. Picking from the expanded list adds one chip via
step 4, at the end, where nothing that was already drawn moves.

This makes the requirement "Picking does not reorder the short list" a property of the function,
not a discipline the screens have to keep.

### D5. The full list expands in place; it is not a screen

Taking «Всі рахунки (28)» replaces the shortlist row, in place, with a search field and the full
list; picking or «Згорнути» puts the shortlist back.

*Alternatives rejected:*

- **A pushed route** (`/pick/account`) would need a value handed back through expo-router params
  or a module-level box, on a form that holds half-typed сума, дата and опис in component state.
  Every one of those returns is a place to lose what was typed, and none of it is provable by
  `verify`.
- **A modal / bottom sheet** adds a presentation mode this app uses nowhere and an Android back
  path of its own.

In place costs one thing: the fields below the picker are pushed down while the list is open. That
is transient, and the list closes on the pick.

The hardware «назад» is already solved here: `backGesture` in `src/ui/back-gesture.ts` and
`useCloseOnBack` exist for exactly this shape ("the editor is the last thing the owner opened, so
it is the first thing «назад» undoes"), and an open expanded picker is another such editor. On
`transaction/new.tsx` and `transaction/[id].tsx` the subscription is new; the rule is not.

### D6. The search folds the way «Транзакції» already folds

Substring match anywhere in the name, over the offered rows only, folded with
`toLocaleLowerCase('uk')` — `toLowerCase()` folds ASCII only, which is why
`src/ui/transaction-search.ts` has that private helper today. It moves to `src/ui/labels.ts` and
both call it, so a search for «прод» behaves identically in a picker and on «Транзакції». No
behaviour changes on either side; this is a move, not a rewrite.

Archived rows are **not** searchable here, unlike on «Транзакції» — and deliberately. That screen
searches *history*, where an archived категорія still has транзакції in it; a picker offers what
may be *picked now*, and an archived row may not be. `shortlist.ts` never sees them: it filters
what `expenseCategoryChoices` / `accountChoicesFor` / `sourceChoices` already handed it.

### D7. The words

- The offer: «Всі рахунки (28)», «Всі категорії (27)», «Всі джерела (14)». The count is what makes
  it an informed tap rather than a mystery door — the owner knows whether the thing they want is
  four rows away or twenty-three.
- Expanded, the same control reads «Згорнути» — the word Головний already uses for exactly this
  ("Обрати категорію" / "Згорнути" on a feed row).
- A search that matches nothing: «Нічого не знайдено», the app's existing wording
  (`transaction-search.ts`).
- The surviving picker keeps the question as its label — «Рахунок», «Звідки», «Куди», «Категорія»,
  «До якої категорії», «Джерело». The overline «Нещодавні» disappears with the second row: with one
  row, saying that it is the recent ones is both untrue (it is topped up) and unhelpful.

### D8. Рахунок recency counts both legs of a переказ

`recentlyUsed` gains `accounts: readonly string[]` beside `categories` and `sources`, filled from
the same walk: a витрата, дохід, повернення and коригування contribute their `accountId`, a переказ
contributes `fromAccountId` then `toAccountId` in that order. A переказ genuinely touched two
рахунки and both are ones the owner is using.

The walk keeps its window of fifty and its early exit, now waiting until all three lists are full.
Fifty транзакції is what the screen already reads for the категорії; widening it would cost a
larger query for a case §D3's top-up already covers.

*Alternative considered and rejected:* deriving рахунок recency from hand-recorded транзакції only,
to match how the remembered рахунок works. A `Transaction` carries no record of what created it —
there is no origin flag in the domain or the schema — so this would need one, i.e. exactly the
stored state this change promised not to add. And the remembered рахунок is pre-chosen anyway, so
§D3 step 4 already guarantees the hand-recording рахунок is on screen.

### D9. What each screen does with it

| Screen | Picker | Offered from | Chosen |
| --- | --- | --- | --- |
| `transaction/new.tsx` | Рахунок / Звідки | `activeAccounts` | the remembered рахунок, or none |
| `transaction/new.tsx` | Куди | `activeAccounts` | none until picked |
| `transaction/new.tsx` | Категорія | `expenseCategoryChoices` | «Без категорії» for a витрата, none for a повернення |
| `transaction/new.tsx` | Джерело | `sourceChoices` | none until picked |
| `transaction/[id].tsx` | Рахунок / Звідки / Куди | `accountChoicesFor` (per leg) | what the транзакція carries |
| `transaction/[id].tsx` | Категорія / Джерело | `categoryChoicesFor` / `sourceChoicesFor` | what the транзакція carries |
| `(tabs)/index.tsx` | Категорія on a «Без категорії» row | `expenseCategoryChoices` minus «Без категорії» | none — the pick is the act |

The «Тип» picker on both transaction screens is left alone: four choices (five shapes when
retyping) is not a wall, and they are not a list that grows.

`transaction/[id].tsx` needs the стрічка it does not read today — one `listLatest` call, the same
one `new.tsx` makes — to have recents at all. That is the only new read this change introduces.

### D10. The inventory: every picker in the app, and why the rest wait

The owner asked for an analysis of the interface's components, so here is the whole census. "Rows"
is the count on the owner's own data: the Saldo імпорт brought in 27 рахунки (BACKLOG) and creates
the рахунок-борг «Борги» per currency on top of them, so a рахунок picker draws **28**; the starter
set seeds **27** pickable категорії; and the seeded 13 pickable джерела become **14** once the
import's own "Uncategorised income" lands, since the джерело side has no reserved-name mapping.
Precise figures matter only for the argument's scale — every one of these lists grows, and none of
them shrinks.

| Screen | Picker | Rows | This change |
| --- | --- | --- | --- |
| Нова транзакція | Тип | 4 | no — fixed, and short |
| Нова транзакція | Рахунок / Звідки / Куди | **28** (×2 for a переказ) | **yes** |
| Нова транзакція | Нещодавні (категорії / джерела) | ≤5 | **merged into the picker below** |
| Нова транзакція | Категорія | **27** | **yes** |
| Нова транзакція | Джерело | **14** | **yes** |
| Транзакція (editing) | Тип | 2–5 shapes | no |
| Транзакція (editing) | Рахунок / Звідки / Куди | **28** | **yes** |
| Транзакція (editing) | Категорія / Джерело | **27** / **14** | **yes** |
| Головний | Категорія on a «Без категорії» row | **26** | **yes** |
| Транзакції (search) | Рахунок | **28** | no — `transaction-search`'s spec, next in line |
| Транзакції (search) | Місяць | ≤13 | no |
| Звіти | Категорія («одна категорія за місяцями») | **27** | no — `reports-screen`, and BACKLOG already has a Звіти item |
| Звіти | Валюта | 1–3 | no |
| Рахунки | Вид / Валюта | 5 / 1–3 | no |
| Рахунок (editing) | Вид / Валюта | 5 / 1–3 | no — fixed at creation, shown disabled |
| AI-аналіз | Вид / Період | 1 / ~4 | no |
| Правила | Категорія | **27** | no — `categorisation-rules` |
| Ліміти | Валюта | 1–3 | no |
| Цілі | Рахунок | **28** | no — `goals` |
| monobank | рахунок linking | ≤28 | no — a setup screen, walked once |
| Сповіщення банків | застосунок / рахунок | few / ≤28 | no |
| Saldo імпорт | рахунок mapping | ≤28 | no — a one-time import |

Everything in the last column marked "no" that draws a full list is a candidate for the same treatment,
and after this change each is one screen edit rather than a design question. They are held back for
one reason: each belongs to a different capability, needs its own delta spec, and would turn a
focused change into a five-capability one. The recording path is where the owner stands most often
and where the wall is worst — it is worth landing on its own.

## Risks / Trade-offs

- **The category the owner wants is behind one more tap.** → For anything recorded in the last
  fifty транзакції it is not: that is what the recents are. For the rest, the offer names the count
  and the expanded list has a search, so the worst case is tap-type-tap instead of scroll-and-hunt
  through twenty-seven wrapped chips. If it proves wrong, §D2's five is one constant.
- **A synced рахунок can crowd the стрічка.** A monobank sync of a busy card can fill the latest
  fifty транзакції with one рахунок, leaving the recents thin. → §D3's top-up fills the rest from
  the head of the list, and §D3 step 4 keeps the remembered (pre-chosen) рахунок on screen. The
  owner is never left with one chip.
- **The expanded list pushes the fields below it down.** → It is transient and closes on the pick;
  the alternative (a route or a modal) costs the typed state or a new navigation shape (§D5).
- **`verify` cannot press a chip.** Everything above is proven in `src/ui/`, but that the screens
  actually call it is not. → The existing structural assertions in `src/ui/entry-form.test.ts` are
  the precedent, and the change is smoke-tested on the emulator before archiving, per CLAUDE.md
  step 6 — including the hardware «назад» over an open list, which no unit test reaches.
- **Two changes are in flight over the same three files** (`home-daily-overview` 17/20,
  `fiscal-receipts` 25/30). → Implement after they merge, or in a lane rebased on them. The delta
  spec itself does not collide: neither touches the requirements this change modifies or removes.
- **The рахунок row does reorder once — after «Записати».** The form clears for the next
  транзакція and re-reads the стрічка, so the рахунок just recorded on is now the most recent and
  leads the row. Seen on the emulator. It is not the thing the spec forbids ("Picking a choice
  SHALL NOT reorder the short list") — nothing moved under a finger, the recording is over, and the
  рахунок leading the row afterwards is the one most likely wanted next. Accepted knowingly, and
  written down here so it is not rediscovered as a defect.
- **A selected chip is a couple of pixels wider than an unselected one**, because the label is
  bold, so its right-hand neighbours shift ~3px. Pre-existing to `Choices` and cosmetic, but the
  requirement's own words are "nothing moves under the owner's finger", so it is named rather than
  left to be found.
- **The emulator's own back key is not the gesture.** `adb shell input keyevent 4` reaches this app
  on no screen at all on the AVD the smoke ran on; the left-edge swipe is what works. That is a
  fact about the harness, not about this change — but every «назад» verdict of the smoke depended
  on knowing it, so it belongs in `.claude/rules/android.md` rather than in one agent's memory.
- **The «Нещодавні» label disappears**, so a shortlist chip no longer announces itself as recent.
  → Accepted deliberately: the row is no longer purely the recents (§D3 tops it up), so the old
  label would be a lie, and one honest label per question is the simplification being asked for.
