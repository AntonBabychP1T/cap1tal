## Why

Правила автокатегоризації exist, match deterministically, and are reachable in Налаштування —
and in daily use they almost never fire. Three gaps put together:

1. They run on imports only. The витрата the owner types by hand — «АТБ», «Сільпо» — is
   categorised from scratch every time, even though a правило for exactly that merchant exists.
2. Nothing ever offers to write one down. Categorising a витрата in Головний is one tap; turning
   that decision into a правило is a separate trip to Налаштування → Правила, retyping the
   merchant by hand. So the owner categorises the same merchant for the hundredth time and the
   app learns nothing. `docs/tech-task.md` FR-C3 already asks for the offer; it was never built.
3. A правило written today does nothing about the витрати already sitting in «Без категорії».
   The pile the owner is looking at right now stays a pile.

The result is the first of the vision's two questions — «куди пішли гроші» — answered by a Місяць
whose largest категорія is «Без категорії». This change closes all three gaps.

## What Changes

- The entry form applies правила to the опис the owner is typing: a match pre-selects that
  категорія, visibly, on the chip the owner can still change. An owner who picked a категорія
  themselves is never overridden.
- Setting a категорія on a витрата that carries an опис offers to remember it as a правило — from
  Головний's one-tap mark and from the editing screen alike. The offer arrives with a merchant
  pattern already proposed from the опис, editable before it is saved, and it is an offer: dismissed
  leaves no правило.
- **BREAKING (behaviour, not data):** a правило no longer acts at import time only. Creating or
  editing one recategorises the already-stored витрати in «Без категорії» that it matches — silently,
  automatically, and only those: a категорія the owner chose themselves is never touched, and no
  other transaction type is. Each pass is recorded in the журнал as an operation with its counts.
- The glossary's «Опис» and the `transactions` spec are corrected where they say an опис takes no
  part in choosing a категорія. It does now, everywhere, by the owner's own правила — which is
  what the опис was being kept for.

Non-goals of this change, deliberately:

- No built-in merchant list and no MCC template. That is the next change (`rule-template`); this
  one only makes the правила the owner has work everywhere.
- No retroactive move **out** of a категорія the owner (or an earlier правило) already chose. The
  sweep touches «Без категорії» and nothing else, so it can never argue with a decision.
- No change to how правила are matched or ranked — `matchRule`'s ladder stands untouched.
- Nothing from vision §14 is entered. Category hierarchy and tags (§14.8) stay out; a правило
  still targets exactly one flat категорія.

## Capabilities

### New Capabilities

None. Every behaviour here belongs to a capability that already exists.

### Modified Capabilities

- `categorisation-rules`: правила act wherever a категорія is decided — the manual entry form as
  well as the three import sources — and a new правило sweeps the stored «Без категорії» витрати it
  matches instead of acting only forward. Adds the merchant pattern proposed from an опис.
- `main-screen`: the entry form pre-selects the категорія a правило gives the typed опис, and both
  paths that set a категорія on a stored транзакція — the «Без категорії» mark and the editing
  screen — offer to remember it as a правило.
- `transactions`: drops «the опис takes no part in choosing its категорія» — it now does, through
  the owner's правила, at recording as at import.

## Impact

- `src/domain/rules.ts` — the proposed merchant pattern and the sweep's decision, both pure.
- `src/ui/entry-form.ts` — the категорія a typed опис proposes; `src/ui/list-management.ts` — the
  draft правило an offer starts from.
- `src/db/rules-repo.ts` and `src/db/transactions-repo.ts` — saving a правило runs the sweep in one
  transaction; the журнал operation around it.
- Screens: `src/app/transaction/new.tsx`, `src/app/transaction/[id].tsx`, `src/app/(tabs)/index.tsx`,
  `src/app/manage/rules.tsx`.
- Docs: `docs/glossary.md` («Опис»), `docs/tech-task.md` (FR-C2/FR-C3 now built).
- No schema change and no migration — правила and транзакції both already have every column this
  needs.
