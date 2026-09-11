## Context

See proposal.md — Why. What shapes the approach:

- `matchRule(rules, { description, mcc? })` is pure, and its ladder (both criteria > merchant >
  MCC, longest pattern, newest, id) is already specified and tested. Nothing about the шаблон needs
  a second ranking.
- `rules-everywhere` has just moved every caller onto one place that decides a категорія, and given
  storing a правило a sweep of «Без категорії». This change extends both rather than adding a third
  path.
- `src/db/starter-set.ts` is the precedent for built-in data: a module that is the one
  representation of a spec list, with no colocated test, because a test reading it back would only
  prove it equals itself. The шаблон follows it exactly.
- Money, dates and currencies do not enter this change at all. The шаблон is text and integers.

## Goals / Non-Goals

**Goals:**

- The шаблон ranked by the existing ladder, with no second implementation of it.
- One entry point that consults both tiers, so no caller can accidentally consult one.
- The owner's правило always wins, by construction and not by pattern length.
- The шаблон works on an untouched device and after a restore, without a data migration writing
  rows.

**Non-Goals:**

- No editing of the шаблон in the app, and therefore no storage of merchants or MCC codes.
- No per-merchant on/off — the unit the owner controls is the базова категорія.
- No attempt to guess the owner's категорія by name. «Продукти» points at Groceries because the
  spec says so, not because the app matched two strings.

## Decisions

### T1 — The шаблон is data in `src/domain/rule-template.ts`

```ts
export interface TemplateGroup {
  readonly id: string;          // stable slug: 'groceries', 'eating-out', …
  readonly name: string;        // «Продукти» — what the menu lists
  readonly defaultCategoryId: string;  // a starter-set id
  readonly merchants: readonly string[];  // folded patterns
  readonly mcc: readonly number[];
}
export const TEMPLATE_GROUPS: readonly TemplateGroup[];
export const TEMPLATE_VERSION: number;
```

Ids are stable slugs, as the starter set's are, because a stored choice addresses one. `name` is
the Ukrainian label of the базова категорія; `defaultCategoryId` is a starter-set slug, so a device
that renamed «Groceries» to «Їжа» keeps the mapping — the id survives a rename, which is exactly
why the starter set has readable ids at all.

Patterns are written folded and asserted so in a test, since `matchRule` folds the pattern anyway
and an unfolded one in the data would only be a pattern whose length ranks differently than it
reads.

*Two collisions the data has to get right, both handled by the ladder rather than by ordering:*
«bolt» belongs to Транспорт and «bolt food» to Доставка їжі — the longer pattern wins. «метро» is
not in Продукти at all, because it is a substring of «метрополітен»; Metro is covered by its Latin
spelling and Kyiv's metro by the longer Ukrainian one.

### T2 — The second tier is the first tier's matcher over synthetic rules

The шаблон's targets are resolved to a `Rule[]` and handed to the same `matchRule`:

```ts
export function templateRules(
  targets: ReadonlyMap<string, string>,   // group id → category id, already resolved
): readonly Rule[]
```

One synthetic `Rule` per merchant pattern and one per MCC, id `tpl:<group>:m<n>` / `tpl:<group>:c<n>`,
`createdAt` a fixed epoch. Then:

```ts
export function resolveCategoryId(
  context: { readonly rules: readonly Rule[]; readonly templateRules: readonly Rule[] },
  transaction: { readonly description: string; readonly mcc?: number },
): string | undefined {
  return matchRule(context.rules, transaction) ?? matchRule(context.templateRules, transaction);
}
```

*Why synthetic rules over a bespoke matcher:* the ladder, the folding, the blank-pattern guard and
the total ordering are already written, specified and tested. A second matcher would be a second
place for «СІЛЬПО» not to meet «сільпо». The fixed `createdAt` keeps the tier deterministic — ties
fall to the id comparison, and the ids are fixed by the data.

*Why strict tiers rather than one merged ranking:* «my own rule wins» has to be explainable in one
sentence. Merged, an owner's MCC rule would silently lose to a шаблон merchant pattern, and the
owner would have no way to see why.

*Cost:* the шаблон expands to a few hundred synthetic rules, rebuilt per resolution context, not
per транзакція. A sync of a thousand items builds it once.

### T3 — Storage holds only what the owner decided

```sql
CREATE TABLE rule_template_choices (
  group_id    TEXT PRIMARY KEY NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT   -- NULL = switched off
);
```

Absent row = follow the типова категорія. Row with a `category_id` = the owner's target. Row with
NULL = off. Three states in two, the same way `rules.merchant` already encodes "no criterion" as
NULL.

*Why not seed a row per group:* seeding would freeze today's defaults onto the device, and a later
app version that improves a default would never reach it. Absent-means-default is what lets the
шаблон keep evolving for an owner who never opened the menu.

A `group_id` in storage that the шаблон no longer carries is ignored on read and left in place —
an app downgrade must not throw the owner's choices away.

Targets are resolved once, in `src/db/`: choice if present, типова категорія otherwise, dropped
entirely when the target id matches no `categories` row. That last check is what makes "a target
that does not exist matches nothing" true for the типова категорія too — a device that somehow
lacks a seeded row behaves as if that базова категорія were off.

### T4 — One reader for the resolution context

`src/db/repos.ts` gains `categorisationContext()`: the правила, plus the `templateRules` built from
the resolved targets. The monobank sync, the notification drain, the entry form and the sweep all
take it. A caller that reads `rulesRepo.list()` alone would silently lose the шаблон, so there is
one call that gives both and it is the one every caller uses.

### T5 — Two sweep triggers, one sweep

`rules-everywhere` gives the sweep to `rulesRepo.save`. This change adds two more callers of the
same sweep, both in one transaction with the write that triggers them:

1. `ruleTemplateRepo.choose(groupId, categoryId | off)` — the menu.
2. The first open under a `TEMPLATE_VERSION` that storage has not recorded.

For (2), the version last swept lives beside the choices — a one-row table, as
`bug_report_capture` and `monobank_request_pace` already do. It is written **after** a successful
sweep and inside the same transaction, so a sweep that throws leaves the version unrecorded and the
next open tries again. The open-time sweep runs where `seedStarterSet` runs, right after the
migrations, and is wrapped in the same journal step as every other sweep.

*Why a version and not "sweep on every open":* an owner with twenty thousand транзакції would pay a
full scan at every launch for nothing. The version makes the cost proportional to what actually
changed, and gives an app update carrying new merchants a way to reach the pile exactly once.

`TEMPLATE_VERSION` is raised by hand whenever `TEMPLATE_GROUPS` changes, and a test asserts that a
snapshot of the groups' content and the version move together — so raising it cannot be forgotten
in the one way that matters.

### T6 — The бекап carries choices, never the шаблон

One more list in the file, `BACKUP_SCHEMA_VERSION` 2. A version-1 file simply has no such list and
reads as "no choice for any базова категорія" — the format already restores a later version's list
as absent, so nothing special is needed on the read path. The restore's existing dangling-reference
check covers a choice naming a категорія the file does not carry.

## Risks / Trade-offs

- **A built-in pattern is wrong for this owner and now moves their history.** «Розетка» sells
  televisions and nappies; «Аврора» is Home here and might be Gifts elsewhere. → The sweep only
  ever moves витрати out of «Без категорії», never between two real категорії. The menu shows every
  pattern before it is changed. And the owner's own правило outranks the whole шаблон, which is the
  documented way to correct one merchant without switching a базова категорія off.
- **A broad pattern quietly captures an unrelated merchant.** A two-letter pattern in the data
  would match half the описи. → Patterns are reviewed as data, the known collisions are named in
  T1, and a test asserts every pattern is at least three characters and folded.
- **The open-time sweep runs before the first screen.** A slow sweep on a large device delays
  launch. → It is one scan of `transactions` on an indexed column, synchronous SQLite, and it
  happens once per шаблон version. If it ever does become visible, the version marker makes it safe
  to move off the launch path without changing any requirement.
- **The шаблон's Ukrainian retail knowledge ages.** Chains rename, new ones appear. → It is data in
  the app with a version; an update raises the version and reaches the pile once. Nothing in the
  owner's storage has to migrate for that.
- **`BACKUP_SCHEMA_VERSION` 2 arrives days after it was reset to 1.** A бекап written under 1 stays
  restorable — that is what the requirement says — and version 1 files are only days old.
