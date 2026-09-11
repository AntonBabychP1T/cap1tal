## Why

`rules-everywhere` makes the owner's правила work wherever a витрата is created, and offers to
write one down after each categorisation. It still starts from nothing: on a fresh device, and on
the owner's device today, there are no правила at all, so the first hundred purchases are
categorised by hand before the app knows that АТБ is продукти.

Nothing about «АТБ → продукти», «Аврора → дім» or «MCC 5411 → продукти» is personal. What is
personal is the name the owner gives that категорія — one person's «Groceries» is another's
«Продукти» — which is the only reason the app does not simply ship the правила: it cannot know
which категорія of *this* device each obvious merchant belongs to.

So: ship the knowledge, ask only for the mapping.

## What Changes

- A built-in **шаблон категоризації** ships with the app: about twenty **базові категорії** —
  «Продукти», «Кафе і ресторани», «Транспорт», «Дім», «Здоровʼя», «Цифрове», «Комунальні й звʼязок»
  and the rest — each carrying the merchant patterns and the MCC codes that obviously belong to it.
  It is data in the app, not rows in storage: updating the app updates the шаблон.
- Each базова категорія carries a **default target** among the categories the app already seeds, so
  the шаблон works the moment the app is updated, with no setup at all.
- A new **«Базові категорії»** section in Налаштування is the menu: every базова категорія with
  what it covers, the категорія of *this* device it currently lands in, and two things the owner
  can do to it — point it at one of their own категорії instead, or switch it off entirely. The
  choice is stored; an untouched базова категорія keeps following its default.
- Matching gains a second tier: the owner's own правила are tried first and decide alone when any
  of them matches; only when none does is the шаблон consulted. So a правило the owner wrote — or
  accepted from the offer — always beats the built-in knowledge, and the шаблон can never argue
  with a decision.
- The шаблон acts everywhere a правило acts, on the same terms: the monobank sync, the чернетки
  from bank сповіщення, the entry form, and the sweep of «Без категорії». Changing a mapping or
  switching a група off sweeps «Без категорії» exactly as storing a правило does.
- The бекап carries the mapping, so restoring a device restores it. **BREAKING (file format):**
  `BACKUP_SCHEMA_VERSION` becomes 2; a version-1 file restores with no mapping stored, which is the
  defaults — the same as the device it was made on.

Non-goals of this change, deliberately:

- No editing of the шаблон's merchants or MCC codes in the app. A merchant the шаблон gets wrong is
  fixed by the owner's own правило, which outranks it — that is what the first tier is for.
- No new базова категорія created by the owner. A group the owner wants is a правило.
- No hierarchy: a базова категорія is not a parent of the owner's категорія, it points at exactly
  one of them. Vision §14.8 (category hierarchy and tags) stays out.
- No change to how патерни are folded, ranked or tie-broken — the шаблон is ranked by the same
  ladder inside its own tier.

## Capabilities

### New Capabilities

None. The шаблон is part of автокатегоризація, not a capability of its own.

### Modified Capabilities

- `categorisation-rules`: adds the built-in шаблон as a second matching tier under the owner's
  правила, the owner's mapping of each базова категорія to a категорія of this device (or to
  nothing), and the sweep of «Без категорії» when that mapping changes.
- `settings-screen`: adds the «Базові категорії» section and names it among the sections the tab
  offers.
- `persistence`: the mapping survives a restart.
- `backup-file`: the бекап carries the mapping; format version 2.

## Impact

- `src/domain/rule-template.ts` (new) — the базові категорії, their merchants, their MCC codes and
  their defaults; `src/domain/rules.ts` — the two-tier resolution every caller moves to.
- `src/db/schema.ts` + one new migration — the mapping table; `src/db/rule-template-repo.ts` (new).
- Every place that matched before: `src/monobank/sync.ts`, `src/notifications/draft.ts`,
  `src/ui/entry-form.ts`, and the sweep from `rules-everywhere`.
- `src/backup/format.ts` and `src/db/backup-repo.ts` — one more list in the file, version 2.
- Screens: `src/app/manage/rule-template.tsx` (new), `src/app/(tabs)/settings.tsx`.
- Docs: `docs/glossary.md` gains «Шаблон категоризації» and «Базова категорія»;
  `docs/tech-task.md` records the change.

## Depends on

`rules-everywhere`. This change extends the matching entry point and the sweep that change
introduces; it must be implemented after it.
