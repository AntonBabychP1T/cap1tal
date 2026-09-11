## Context

See proposal.md — Why. What shapes the approach is what already exists:

- `matchRule(rules, { description, mcc? })` in `src/domain/rules.ts` is pure, total, and already
  the one matcher three import sources call. Nothing here replaces it.
- `rulesRepo.save` in `src/db/rules-repo.ts` is the single write path for a правило — create and
  edit are one upsert. Restore writes the `rules` table directly in `src/db/backup-repo.ts` and
  never goes through the repo.
- The entry form's decisions live in `src/ui/entry-form.ts` as plain TypeScript, because
  `npm run verify` never runs JSX. Every decision this change adds has to land there or in
  `src/domain/`, or it cannot be proven by the gate.
- The журнал already has `journal.step(name, fn, { ending })`, which writes both ends under one
  mark and takes `counts` — the exact shape the sweep needs, and the reason no new журнал concept
  is introduced.
- `transactionsRepo` has `save(t, storedAt)` and `listAll()`; there is no "set the category of one
  row" call. `save` would work — it already keeps `createdAt` out of its update set — but it rebuilds
  the whole row from a domain value, and the sweep changes exactly one column on rows it never
  parsed as a whole.

## Goals / Non-Goals

**Goals:**

- One matcher, one ladder, four callers. The hand-recorded витрата goes through exactly the code
  the monobank sync goes through.
- Every new decision pure and testable under `verify`: what a опис proposes, what a categorisation
  offers, which stored витрати a sweep moves.
- The sweep impossible to forget — no call site may store a правило and skip it, and the журнал
  entry and the sentence the owner reads live in the same seam rather than in a screen.

**Non-Goals:**

- No new table, no migration. Nothing here needs a column that does not exist.
- No change to `matchRule`'s ranking, folding or tie-breaks.
- No sweep on restore, on seeding, or on app open — only on a правило the owner stored.
- No background work: the sweep is synchronous inside the same SQLite transaction as the store.

## Decisions

### D1 — The sweep is a pure function over transactions, applied by the repository

`src/domain/rules.ts` gains

```ts
export function sweepUncategorised(
  rules: readonly Rule[],
  transactions: readonly Transaction[],
): readonly { readonly id: string; readonly categoryId: string }[]
```

— it filters to `type === 'expense' && categoryId === UNCATEGORISED_CATEGORY_ID`, runs `matchRule`
on each опис with no MCC, and returns the moves. It decides; it does not write.

*Why:* the whole spec of "what the sweep touches and what it leaves" — повернення untouched,
коригування untouched, a chosen категорія untouched, the most specific правило winning — becomes a
table-driven unit test over plain values, with no database in it. The alternative, a SQL `UPDATE …
WHERE` with the matching expressed in SQL, cannot express `matchRule`'s ladder at all and would be
a second implementation of it.

`sweepUncategorised` also drops any move whose target is «Без категорії». Creating such a правило is
refused (task 2.2) at the only write path the app has, but `backup-repo.ts` writes the `rules` table
directly, so a бекап written elsewhere can land one. One line in the pure function covers it without
a second rejection anywhere else.

The MCC is deliberately absent: a stored транзакція has no MCC column — the bank's code is not kept
past import — so an MCC-only правило sweeps nothing. That is the same restriction чернетки already
carry, and it is stated in the spec rather than being a silent property of the storage.

### D2 — The sweep runs inside `rulesRepo.save`, in one transaction

`save` becomes: upsert the rule, read the правила back, read the транзакції, apply
`sweepUncategorised`, write the moves — all inside one `db.transaction`.

*Why here:* "storing a правило sweeps" is an invariant, and an invariant enforced at the only write
path cannot be forgotten by a second call site (today the rules screen; tomorrow the offer from the
feed, the offer from editing, and the template change that follows this one — four callers, one of
which would eventually miss it). One transaction because a правило stored while its sweep failed
would leave the owner with a правило that quietly did nothing.

*Why this does not catch restore:* `backup-repo.ts` writes `rules` through Drizzle directly. A
restore therefore replaces правила and транзакції together without sweeping — which is right: a
backup is a state, not a decision, and re-deciding it on restore would make restore non-idempotent.

*Alternative rejected:* a separate `applyRules()` the screens call after saving. Cheaper to read,
one forgotten call away from a feature that silently half-works.

### D3 — The proposed merchant pattern: the leading run of letters

`proposeMerchantPattern(description): string | undefined` in `src/domain/rules.ts`, folded with the
same `fold()` the matcher uses.

Bank описи are `NAME [branch] [city] [street]` — «СІЛЬПО 123 Київ, вул. Хрещатик», «АТБ 421»,
«Нова Пошта відділення 5». The name is the leading letters; everything that identifies the branch
starts at the first digit or punctuation. So: take the leading run of letters and the spaces
between them, fold, trim; if that is empty (the опис starts with a digit or a symbol — «7-Eleven»),
propose the whole folded, trimmed опис.

*Why not the first word:* «Нова Пошта» and «Meest Express» lose half their name, and the owner is
then offered a pattern that matches things it should not. *Why not the whole опис:* «СІЛЬПО 123
Київ, вул. Хрещатик» as a pattern matches that one shop on that one street and never fires again —
the most common way a learned rule turns out useless. *Why editable anyway:* «Оплата послуг АТБ»
proposes «оплата послуг» and is simply wrong; a heuristic that is right most of the time and always
visible beats one that is never wrong because it never guesses.

### D4 — The entry form follows the опис until the owner picks

`src/ui/entry-form.ts` gains a pure

```ts
export function proposedCategoryId(
  draft: { type: EntryType; description?: string; categoryId?: string; pickedByOwner: boolean },
  rules: readonly Rule[],
): string | undefined
```

`type` is in the signature because the requirement excludes three of the four: a дохід carries a
джерело, a переказ carries neither, and a повернення returns to the категорія of what was bought.
Without it that exclusion could not be tested at all, and the function would answer for a draft it
has no business answering for.

The screen holds one extra piece of state, `pickedByOwner`, set the first time the owner taps a
категорія chip and cleared with the rest of the form after a store. While it is false the chosen
категорія is whatever the current опис matches; once true the form stops looking.

*Why a flag and not "the категорія differs from what the правило says":* the owner may deliberately
pick the very категорія the правило proposes, and the form must not then resume following the опис
behind their back. The flag records an act, not a value.

*Why the короткий список still holds it:* `shortlist-pickers` already guarantees the chosen
категорія is always shown even when it is not among the five most recent. The proposed one is
chosen, so that guarantee already covers it, and nothing in the picker changes.

### D5 — The offer is decided purely, shown by the screen

`src/ui/list-management.ts` gains

```ts
export function ruleOffer(input: {
  description?: string;
  categoryId: string;
  rules: readonly Rule[];
}): { merchant: string; categoryId: string } | undefined
```

— nothing when there is no опис, nothing when the категорія being set is «Без категорії» (not a
target a правило may carry, so an offer could only end in a refusal), nothing when `matchRule`
already gives that опис that same категорія, otherwise the proposed pattern and the target. Both
screens build the правило with the same `ruleFromDraft` the «Правила» form uses and store it through
the one `storeRule` seam of D6, so the refusals («Правило потребує продавця або MCC») are one set of
words in one place.

The категорія is written to the транзакція **before** the offer is raised, never in the same step:
a dialog dismissed by the back gesture must not be able to lose the categorisation the owner
already made. That ordering is in the spec because it is the difference between a helpful offer and
a trap.

### D6 — One seam stores a правило: the журнал and the sentence live there

`src/ui/list-management.ts` gains

```ts
export async function storeRule(rule: Rule): Promise<string | undefined>
```

— it wraps `rulesRepo.save` in `journal.step('rules/sweep', …, { ending: ({ examined, moved }) =>
({ counts: { examined, moved } }) })` and returns the sentence the screen shows when anything
moved, or nothing when nothing did. All three screens that store a правило — «Правила», the offer
from the feed, the offer from editing — call it, and the fourth (`rule-template`'s menu) will too.

*Why not a `journal.step` at each screen:* a `.tsx` call site cannot be tested by `verify`, which
never runs JSX, so "each pass is recorded in the журнал" would be a requirement no test could
prove; and it is the same forgettable-call-site failure D2 rejects for the sweep itself. This is
the shape `src/ui/backup-screen.ts` and `src/ui/saldo-import.ts` already use — the decision and the
journaling in a Node-testable module, the screen only rendering what it returns.

`journal.step` is async and `rulesRepo.save` is synchronous; the wrapper is an
`async () => save(rule)`, which is the smallest thing that keeps "both ends under one mark" in the
one place that already guarantees it.

`counts` holds two numbers and nothing else — the журнал may not hold an опис, a сума or a назва,
and the sweep's whole subject matter is описи, so nothing but counts may leave it. `examined`
counts the «Без категорії» витрати the pass considered, not everything stored.

### D7 — Why the owner is told afterwards, having declined to be asked before

The owner chose a silent sweep over a preview. That choice removes the only moment at which a
pattern written too broadly could have been caught — and the витрати it moved are then the hardest
kind to find, since they no longer carry the «Без категорії» mark and the журнал deliberately holds
nothing that leads back to them. One sentence after the fact («11 витрат перекатегоризовано»)
costs nothing, interrupts nothing, and is the difference between a sweep the owner can react to and
one they can only discover in Місяць a week later. It is a statement, not a question: the owner's
decision stands.

## Risks / Trade-offs

- **A wrong правило now rewrites history, silently.** The owner types a too-broad pattern («а»),
  and forty витрати move at once with no undo. → The sweep only ever moves витрати **out of** «Без
  категорії», never between two real категорії, so nothing the owner decided is lost and the worst
  case is a pile of витрати in the wrong категорія, each fixable exactly as before. The offer shows
  the pattern before it is stored, and «Правила» still lists every правило for editing. This is the
  owner's explicit choice over the alternative («show me what will change first»).
- **The sweep reads every транзакція on every правило save.** A device with tens of thousands of
  rows does one full scan per правило stored. → Storing a правило is a deliberate, rare act, the
  scan is in-process SQLite over an already-indexed table, and the alternative (a `category_id =
  'uncategorised'` prefilter in SQL) is a one-line optimisation this design leaves available
  without changing anything else.
- **The entry form's proposal can surprise.** A опис typed for a переказ that is later retyped into
  a витрата could carry a категорія the owner never read. → The proposal only ever runs for the
  витрата type, is always visible as the chosen chip before «Записати», and the confirmation line
  already names the категорія stored.
- **The glossary and the tech task now disagree with older archived changes.** `docs/glossary.md`
  says an опис decides no категорія and that manual entry never asks for one; both stopped being
  true before this change (the entry form has had an опис since `manual-description`). → The
  glossary entry is corrected as part of this change, which is the point at which it becomes wrong
  in a way that matters.
