## Context

See proposal.md — Why. What matters here is the shape of what exists.

The import is two halves and they are already cleanly split. `src/saldo/` is the engine: `survey`
finds the entries, `resolveAccountMap` follows the redirects and rejects the illegal ones,
`interpret` builds the plan, `verify` proves it. `src/ui/saldo-import.ts` is the flow with no JSX —
the step it stands on, the `Decisions` the owner has built, and the engine re-run over them on
every transition. `src/app/manage/saldo-import.tsx` draws it and holds no rule.

Two facts about that screen are the whole of the problem:

- `mergeTargets(state, key)` returns **every other entry that is not itself merged away, of any
  currency**, plus every unarchived рахунок the owner has. The screen draws all of them, on every
  row, always.
- Beside them it draws `KIND_CHOICES` — five chips — on every row, always.

On the owner's own export (23 (Saldo account, currency) pairs, `saldo_export_478575 (1).csv`) that
is 23 × (5 + 22) ≈ 621 chips in one column.

Two things this change reuses rather than invents, both landed by `shortlist-pickers` (18/19 at the
time of writing):

- `src/ui/shortlist.ts` — `narrow(offered, query)`, `PICKER_SIZE`, `NOTHING_FOUND`,
  `COLLAPSE_LABEL`: the search of a long picker, already proven by `verify`.
- `src/ui/labels.ts` — `folded` (`toLocaleLowerCase('uk')`), `nameMatches`, `accountChoiceLabel`,
  `KIND_CHOICES`.

And one rule this codebase already states once and reuses: `backGesture` in
`src/ui/back-gesture.ts` with `useCloseOnBack` — the editor the owner opened last is the first
thing «назад» undoes.

## Goals / Non-Goals

**Goals:**

- The resting state of the account map draws no chips at all: one row is three lines of text and
  two small actions.
- Every rule the spec states is decided in `src/ui/`, because `verify` never runs JSX — which
  targets are offered, in what order, whether a підказка про дубль may be stated, what the summary
  says.
- The engine (`src/saldo/**`) is not touched, and the plan a given set of `Decisions` produces is
  bit-for-bit what it produces today.
- A підказка про дубль the app states is one the owner can reconstruct by reading the two names.

**Non-Goals:**

- Reworking `Picker` from `src/components/form.tsx` (§D8 says why the selector is its own thing).
- A route, a modal or a bottom sheet for the selector.
- Any ranking, learning or scoring the owner cannot reconstruct — nothing is counted or stored.
- The step machine, the file step, the звірка, the commit, the second-import confirmation.
- The English text the engine puts in `report.droppedRows` and in a rejected redirect's reason.
  BACKLOG owns the first; the second becomes practically unreachable here (§D5) and translating it
  is that same item's job.

## Decisions

### D1. The engine keeps every rule; the screen decides what it draws

`src/saldo/**` is not edited by this change, and `openspec/specs/saldo-import/spec.md` gains no
delta. Merging stays currency-bound, the plan is still built before anything is written, the звірка
still stands before the commit, the write is still one transaction, and no merge happens without a
`Decisions` entry the owner produced.

The screen's job narrows to: of the answers the engine considers legal, which does it draw, in what
order, and when. That framing is what keeps this a UX change — every scenario in the delta spec can
be satisfied without a single line under `src/saldo/`.

*Consequence worth stating:* `mergeTargets` filtering by currency does not make the engine's
cross-currency rejection dead code. `Decisions` is serialisable and replayable (its own comment
says so), the dry-run script builds it by hand, and `resolveAccountMap` must stay total over
anything it is handed. The rejection stays, its `saldo-import` scenario stays, and the screen keeps
rendering it — it is simply no longer reachable by tapping.

### D2. The row model grows; the flow module keeps owning it

`accountRows(state)` already returns one row per entry with `becomes`, `mergedInto`, `ontoExisting`
and `rejection`. It gains what the compact row needs and nothing more:

| Field | What it is |
| --- | --- |
| `state` | `'new' \| 'merged-entry' \| 'merged-existing'` — the row's one line of state, decided once instead of re-derived from three optional fields at every call site |
| `receives` | the назви of the entries merged onto this row's рахунок, so a merge reads from both ends |
| `kindOverridden` | whether the owner changed the вид, i.e. whether «Повернути вид із Saldo» is offered |
| `duplicateHint` | the підказка про дубль to state on this row, or nothing (§D4, §D11) |

`state` replaces nothing — `mergedInto` and `ontoExisting` stay, because the screen still needs the
target's name — it names the three cases so the screen cannot invent a fourth.

*Alternative rejected:* computing the state in the screen from the existing optional fields. That
is exactly what the screen does today (a nested ternary in JSX), and it is a rule (`ontoExisting`
and `mergedInto` are indistinguishable by name) sitting where `verify` cannot reach it.

### D3. One editor open at a time, held by the screen

The screen holds `open: { key: string; editor: 'merge' | 'kind' | 'name' } | undefined`, the third
being the existing rows offered to a proposed категорія or джерело — today that block keeps its own
`open` flag inside `NameRow`, so once §D8 puts a search field and a keyboard in it, «назад» would
leave the whole screen from under it. Opening anything replaces whatever was open; choosing,
«Згорнути» and «назад» clear it.

It lives in the screen and not in `FlowState` for the reason `shortlist-pickers` gave for the same
decision (§D5 there): expansion is presentation, and `FlowState` is the thing whose every field
feeds the engine or the commit. The *rule* — that «назад» closes it before leaving — is `backGesture`,
already proven; `useCloseOnBack(open !== undefined, close)` is the four lines of subscription.

One at a time across all three, rather than any number: with 23 rows, several open selectors mean
several search fields with several keyboards and a screen whose height changes under the thumb. It
also gives «назад» one unambiguous answer, which is the whole reason the flag is one field and not
three booleans.

*Not changed:* with nothing open, «назад» leaves the whole flow, exactly as today, from any step.
The report step keeps its «Назад — рахунки» action. Making the hardware key walk the step machine
is a separate question about a four-state flow, and nothing is written until the commit, so leaving
early costs nothing.

### D4. How alike two назви are: a new pure module, deliberately dumb

`src/ui/name-similarity.ts`, generic over two strings, no Saldo in it:

```
tokens(name)     = folded(name) split on everything that is not a letter or a digit, empties dropped
wordMatch(a, b)  = a === b, or neither is a number and the shorter is at least 4 characters
                   and one is a prefix of the other
similarity(a, b) = 3  folded names are equal
                   2  every token of the shorter matches a distinct token of the longer
                   1  at least one token matches
                   0  otherwise
looksLikeSameAccount(a, b) = similarity is 3, or it is 2 and the shorter name has ≥ 2 tokens
```

The distinct-token matching is two passes — exact matches consumed first, then prefixes — so the
answer does not depend on the order the tokens happen to be in.

Why this and not something cleverer:

- **It is explainable in one sentence to the owner**: same name, or every word of the shorter one is
  a word of the longer one. A підказка the owner cannot reconstruct by looking is a підказка
  they cannot trust, and the app is asking them to merge two рахунки on the strength of it.
- **It answers the case the vision actually names.** Vision §16: Saldo holds "mono black" beside
  "Monobank UAH, Black" and they are one card. Tokens `{mono, black}` against
  `{monobank, uah, black}`: `black` is exact, `mono` is a prefix of `monobank` — both matched,
  shorter has two tokens, so it qualifies. And «гаманець» against a hand-made «Гаманець» is score 3.
- **It says nothing when it should say nothing.** Run over the owner's real export it states **zero**
  підказки: "mono black"/"mono white" and "binance crypto"/"binance usdt" both stop at score 1
  (`black`≠`white`, `crypto`≠`usdt`), "конверт приват"/"приват степендія" likewise, and
  "валюта моно" (UAH) / "валюта моно" (USD) are never candidates because the currencies differ. A
  recommendation engine whose first act on real data is to recommend nothing is the right one for a
  screen where a wrong merge is a wrong balance.
- **`≥ 2 tokens` for the score-2 gate** is what keeps «Готівка» from being called the same рахунок
  as «Готівка вдома». One word in common is a coincidence; two are a name.
- **`≥ 4 characters` for a prefix, and never on a number.** Three was the first guess and it is
  wrong in two ways found by trying it: "Binance USD" against "binance usdt" reaches score 2 on
  `usd`→`usdt`, and «Приват 516» against «Приват 5168» does the same on the digits. Four keeps
  `mono`→`monobank`, which is the case the vision actually names, and drops `usd`→`usdt`; excluding
  numbers drops the account-number case, where a prefix means the opposite of a likeness — two
  different cards of one bank.

*Alternatives rejected:* edit distance (Levenshtein) — "mono black" to "Monobank UAH, Black" is a
large distance and «Готівка»/«Готівка вдома» a small one, i.e. it ranks the two cases backwards;
trigram/Jaccard similarity — a threshold nobody can explain and one the owner cannot check by eye;
anything learned from what the owner picked — stored state, and the app is not allowed to know
things about the owner it cannot show them.

### D5. `mergeTargets` filters by currency, then ranks

Three filters, all of them promises the spec now makes rather than conveniences: the entry itself
is out; an entry that is itself merged away is out (it would build a chain no row displays, and it
is what makes the engine's cycle rejection unreachable); an archived рахунок is out (an archived
рахунок takes no new money). To them this change adds the fourth: **another currency is out**.

Then `sort` by `similarity(entry.saldoAccount, target.name)` descending, stable, so the original
order (entries in the export's order, then existing рахунки in theirs) survives every tie. A stable
sort is what keeps the list from shuffling when two targets are equally unalike, which on a list of
seventeen is most of them.

`MergeTarget` changes shape from `{ value, label }` to `{ id, name }` — `id` still the encoded
`entry:` / `account:` value, `name` still what the owner reads. That is not cosmetic: `narrow` in
`src/ui/shortlist.ts` is generic over `{ readonly id: string; readonly name: string }`, so the
search this change reuses applies to the targets with no adapter and no second matching rule. The
screen maps `{ id, name }` to `Choices`'s `{ value, label }` at the one place it draws them.

The currency filter is where an offer stops existing to be refused. Today a UAH row offers every
USD рахунок; the owner taps; the import rejects it; a red banner appears on the row. The screenshot
in `docs/app-overview.md` §4.8 shows «mono USD · USD» offered to a UAH entry. That whole loop is
deleted at the source.

### D6. «Створити окремий рахунок» is a choice inside the selector, not only an action outside it

The selector's first choice is «Створити окремий рахунок», marked as chosen while the entry is not
merged. `targetOf` gains the `separate` value alongside `entry:` and `account:`, and it maps to
"pass no redirect", which is exactly what `redirectAccount(state, key)` already means.

**It is not an element of `mergeTargets`,** and that is the point rather than a detail. If it were,
`narrow` would delete it the moment the owner typed anything — typing «mono» would remove the only
way back out of a merge — and it would count toward `PICKER_SIZE`, so five real targets plus it
would raise a search field over a five-item list. So `mergeTargets` returns the рахунки and nothing
else, `SEPARATE_TARGET` is its own exported constant, and the selector draws it above the narrowed
list, unconditionally. The spec says so in its own words, because "always" was the requirement's
word first.

Two reasons it is inside rather than only the row's «Скасувати об'єднання»: it makes the selector a
complete answer to one question ("what does this рахунок become?") rather than a one-way door, and
it is the "clearly allow going back to a separate рахунок" the requirement asks for from the place
the owner is standing when they change their mind. The row keeps «Скасувати об'єднання» as well —
undoing without opening a list is one tap and should stay one tap.

### D7. The grouping is decided from the survey, never from the decisions

`mapSections(state)` splits the rows into those that carried a підказка про дубль **when the export
was read** and the rest. Membership is computed from `state.survey` and `state.existing` only — never
from `state.decisions` and never from the dismissals — so merging, undoing or dismissing moves no
row.

This is `shortlist-pickers` §D4 restated for a list of 23: the requirement "no row moves under the
owner's finger" becomes a property of the function rather than a discipline the screen has to keep.
The alternative — recomputing membership as decisions change — empties the «Схоже на дублі» group
as the owner works, which reads as rows vanishing.

The підказка *itself* does disappear from a row when that row is merged, when the рахунок it names
is merged away, or when the owner dismisses it (§D11). That is the row's own state changing, not
the list reordering.

### D8. The selector reuses the search, not the `Picker`

`Picker` (added by `shortlist-pickers`) is built for `{ id, name }` rows with recency, a
`PickerNoun` and an «Всі …» offer. The merge selector has no recency (there is no стрічка of merges),
its values are prefixed (`entry:` / `account:` / `separate`) because two kinds of target with
identical names live in one list, and its first choice is not a row at all. Bending `Picker` to
carry all that would put Saldo-specific branches into the component every recording form uses.

So: a small selector of its own in `src/app/manage/saldo-import.tsx`, built on the same `Choices`
and `Field`, reusing `narrow`, `NOTHING_FOUND`, `COLLAPSE_LABEL` and `PICKER_SIZE` from
`src/ui/shortlist.ts` — so «прод» folds identically in the merge selector, in the recording form
and on «Транзакції», and the threshold for showing a search field is one constant for the app.

The same treatment reaches the «нові категорії та джерела» block on the same step, whose
«Обрати наявну» draws every категорія with no search today. It is three lines of the same reuse on
a list with the same fault, on the same screen, in the same capability — leaving it a wall while
de-walling the rows above it would be an odd place to stop.

### D9. The words

- Row state: «Новий рахунок · Витратні» / «Об'єднується з «Monobank UAH, Black»» / «Додається до
  наявного «гаманець»»; a receiving row adds «Приймає: «mono black»».
- Row actions: «Об'єднати з…», «Вид», «Скасувати об'єднання», «Повернути вид із Saldo».
- Selector: the label «Об'єднати «mono black» (UAH) з», the first choice «Створити окремий
  рахунок», «Згорнути» to close, «Нічого не знайдено» for an empty search, and «Немає рахунків у
  валюті EUR, з якими можна об'єднати» when the currency has no candidate.
- The підказка про дубль: «Схоже, це той самий рахунок → «Monobank UAH, Black»», with «Об'єднати»
  and «Ні, окремо».
- Headings: «Схоже на дублі (2)» and «Решта рахунків (21)».
- The opening line: «23 рахунки з Saldo. 2 схожі на дублі — перевірте їх; решту буде створено
  окремо.» With none: «23 рахунки з Saldo. Дублів не видно — усі буде створено окремо.»

Every one of them is Ukrainian, per the `app-shell` rule that what the owner reads is in their
language. The counts are declined with the existing `plural` helper in `src/ui/labels.ts`.

**One name for the new thing.** It is a **підказка про дубль**, and that word is the spec's, the
design's, the screen heading's («Схоже на дублі (2)») and the code's (`duplicateHint`,
`dismissedHints`, `duplicateHintFor`). Hard rule 7 forbids synonyms, and the first draft of this
change had four — «рекомендація», "resemblance", "suggestion", «Схоже на дублі». Since it is a word
the owner reads on screen and the glossary is where the owner's words live, it gets an entry in
`docs/glossary.md`, marked **[PROPOSED]** the way every term the owner has not yet ruled on is:

> **Підказка про дубль** **[PROPOSED]** — one sentence the Saldo імпорт states on a рахунок of the
> account map when another рахунок of the same currency can only be the same one, offering to merge
> them. It is an offer and never an act: nothing merges until the owner takes it, it names only a
> рахунок the row could have been merged onto anyway, and dismissing it is remembered for that
> import and stored nowhere.

### D10. A dismissed підказка lives in `FlowState`, not in `Decisions`

`FlowState` gains `dismissedHints: readonly string[]`. `Decisions` does not.

`Decisions` is the engine's input and its comment states the contract: serialisable end to end,
replaying the same value over the same export reproduces the same plan. A dismissal changes no
plan — it changes one sentence on one row. Putting it there would make two exports with the same
decisions produce the same plan and a different screen, which is the kind of drift that contract
exists to prevent.

Nothing about a dismissal is stored on the device, per the proposal's promise: leaving the flow
forgets it, which is right for a one-time import.

### D11. What a підказка may name, and which side of a pair carries it

A підказка may name only a рахунок that row's own merge targets would offer — same currency, an
unarchived existing рахунок or another entry, and not one already merged away. Otherwise the
sentence "taking it applies exactly the redirect the owner could have made through the targets"
stops being true in two concrete ways: an archived рахунок would be named and then refused, and an
entry that has since been merged onto a third рахунок would send the redirect down a chain
`resolveAccountMap` follows to its far end, so the row would end up stating a рахунок the підказка
never named.

That splits the rule in two, and the split is deliberate. **Which rows are grouped** is static —
computed from the survey and the existing рахунки, per §D7, so the sections never move. **Whether a
row still states its підказка** is dynamic: it stops once that row is merged, once the рахунок it
names is merged away, or once the owner dismisses it. A row whose підказка is gone stays in its
group, saying what it now is. Nothing moves; one sentence disappears.

When two entries of the import qualify for each other, the **later** one in the map's order carries
the line and points at the earlier. Otherwise the same pair is offered twice — two lines, two
buttons, and a second offer that becomes stale the moment the first is taken.

Later→earlier rather than the reverse is a coin toss with one thin argument: the earlier entry is
the one the export met first, so it is marginally more likely to be the longer-lived рахунок, and
the surviving рахунок takes the target's name. The owner can merge the other way through the
selector, and a wrongly-named рахунок is renameable afterwards. It is written down here so it is
recognised as a decision rather than rediscovered as a defect.

When an entry qualifies against a рахунок the owner already has, the entry states it — there is no
other side to state it from.

### D12. «Далі — звірка» twice, no sticky footer

Under the opening line and again after the last row. The step's honest default is "everything is
fine, go on", so the way on belongs where the owner first learns that; and an owner who does read
all 23 rows should not scroll back up.

*Alternative rejected:* a pinned footer button. It is a presentation mode this app uses nowhere, it
costs a safe-area and keyboard-avoidance question on a screen that now has a search field in it,
and `shortlist-pickers` already recorded "no sticky «Записати»" as a separate BACKLOG item. Two
plain actions cost nothing and need no new component.

### D13. What proves it

Everything decidable without JSX is decided in `src/ui/` and tested there:
`src/ui/name-similarity.test.ts` (new) for §D4, and additions to `src/ui/saldo-import.test.ts` for
the currency filter, the order, the row states, `receives`, the sections, the summary, which
рахунок a підказка may name, when it is withdrawn, and the dismissals.

That the screen actually calls them is the gate's blind spot, and it gets the same two answers
`shortlist-pickers` used: structural assertions over the screen source (`readFileSync`, in the
style of `src/ui/entry-form.test.ts`) proving the accounts step no longer draws `KIND_CHOICES` or
merge targets unconditionally and that `useCloseOnBack` is wired; and the emulator pass of CLAUDE.md
step 6, which is where a screen is actually seen. `.cache/android/saldo-slice.csv` (12 entries) and
the owner's own export (23) are what it is driven with.

## Risks / Trade-offs

- **A merge now costs two taps instead of one** (open «Об'єднати з…», then pick) where before the
  target chip was already on screen. → It is one extra tap on the two rows that need it, against
  621 chips of reading on the 23 that do not. For the pairs the app recognises, the підказка puts it
  back to one tap.
- **The підказка rule can be wrong in both directions.** It can point at a pair that is not one
  card (two рахунки genuinely named alike), and it will stay silent on pairs a human would spot at
  once («mono біла» / "Monobank UAH, White" — the words are translations of each other, which no
  rule here understands). → Nothing merges without the owner's tap, and the selector is always
  there for what the rule missed. Silence is the failure mode this design prefers.
- **Later→earlier for a mutual pair may name the surviving рахунок the "wrong" way** (§D11). →
  Undoable in the selector, renameable afterwards, and stated in the design so the smoke pass knows
  it is intended.
- **`verify` cannot press a chip.** The row states, the order and the підказки are proven in
  `src/ui/`, but that the screen draws them is not. → §D13's structural assertions plus the
  emulator pass, including the hardware «назад» over an open selector, which no unit test reaches.
  Note `.claude/rules/android.md`: `adb shell input keyevent 4` does not reach this app on the AVD —
  the left-edge swipe is what works.
- **The selector expanding in place pushes the rows below it down**, on a list where the owner may
  be at row 20. → Transient, closes on the pick, and the alternative is a route or a modal (§D5 of
  `shortlist-pickers` has the full argument). One open at a time bounds it to one displacement.
- **`shortlist-pickers` must land first** — this change imports `narrow`, `PICKER_SIZE`,
  `NOTHING_FOUND` and `COLLAPSE_LABEL` from `src/ui/shortlist.ts`, which that change creates. → It
  is at 18/19. Implement after it merges, or in a lane rebased on it; it touches no file of the
  Saldo flow, so nothing collides but the import line.
- **A rejected redirect's reason is still English** («cannot redirect a UAH entry onto the USD
  рахунок …»). This change makes it practically unreachable rather than translated. → Named as a
  non-goal above; the BACKLOG item about the звірка's English text is where the engine's words get
  translated, and it should take this one with it.
- **The opening line's counts are a promise about a number the owner can check.** If the підказка
  rule and the grouping ever disagree, the line lies. → Both read the same function, and the section
  headings name the same counts; `mapSummary` and `mapSections` are tested against one another.
