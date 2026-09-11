## 1. The шаблон as data

- [ ] 1.1 Write `src/domain/rule-template.ts` — `TemplateGroup`, `TEMPLATE_GROUPS` for the twenty-two
  базові категорії the spec names with their типові категорії, folded merchant patterns and MCC
  codes, and `TEMPLATE_VERSION` (design T1).
- [ ] 1.2 Tests in `src/domain/rule-template.test.ts` restating the spec's table independently:
  every базова категорія of the spec exists with that типова категорія, no group names
  «Коригування», «Комісія» or «Без категорії», every pattern is folded and at least three
  characters, every MCC is a whole number, every group id and every pattern is unique across the
  шаблон, and «bolt food» is longer than «bolt» ("The longest шаблон pattern wins inside the
  шаблон").

## 2. Two tiers, one matcher

- [ ] 2.1 Add `templateRules(targets)` and `resolveCategoryId(context, transaction)` to
  `src/domain/rules.ts` (design T2). Tests in `src/domain/rules.test.ts` prove "A правило beats the
  шаблон", "An owner's MCC rule beats a шаблон merchant match", "The longest шаблон pattern wins
  inside the шаблон", "Both spellings of one merchant are covered", "A known MCC is enough on its
  own", "A switched-off базова категорія matches nothing" and "Neither tier matches".
- [ ] 2.2 Extend `sweepUncategorised` to take the same two-tier context instead of правила alone,
  with a test proving a витрата in «Без категорії» is swept by the шаблон with no правило present.

## 3. Storage

- [ ] 3.1 Add `rule_template_choices` and the one-row swept-version table to `src/db/schema.ts` and
  generate the migration with `npm run db:generate` (design T3, T5). A test in
  `src/db/migrations.test.ts` proves "The migration keeps what is stored".
- [ ] 3.2 Write `src/db/rule-template-repo.ts`: read the choices, resolve group → категорія
  (choice, else типова категорія, else dropped when no such row exists), `choose(groupId, target)`
  and the swept-version read/write. Tests in `src/db/rule-template-repo.test.ts` prove "A choice is
  read back after a restart", "One choice per базова категорія", "A категорія a choice points at
  cannot be deleted out from under it", "A target that no longer exists matches nothing" and that an
  unknown stored group id is ignored and left in place.
- [ ] 3.3 Make `choose` sweep «Без категорії» in the same transaction, as `rulesRepo.save` does
  (design T5). Tests prove "Changing a mapping sweeps «Без категорії»" and "Switching a базова
  категорія off takes nothing back".
- [ ] 3.4 Add `categorisationContext()` to `src/db/repos.ts` and move `src/monobank/sync.ts`,
  `src/notifications/draft.ts`, the entry form's caller and the sweep onto it (design T4). Existing
  tests in `src/monobank/sync.test.ts` and `src/notifications/draft.test.ts` must stay green; add
  one proving "The шаблон auto-confirms a чернетка" and one proving "The шаблон reaches the entry
  form".

## 4. The open-time sweep

- [ ] 4.1 Sweep once per `TEMPLATE_VERSION` where `seedStarterSet` runs, recording the version in
  the same transaction, wrapped in the journal step (design T5). Tests prove "The first open after
  an update clears what it can", "Opening again sweeps nothing", "A new шаблон version reaches the
  pile again" and "A категорія the owner chose is still never taken away".
- [ ] 4.2 Add the test that ties `TEMPLATE_VERSION` to a snapshot of the groups' content, so
  changing the шаблон without raising the version fails (design T1, T5).

## 5. The бекап

- [ ] 5.1 Carry the choices in `src/backup/format.ts` as one more list, `BACKUP_SCHEMA_VERSION` 2,
  and read a version-1 file as no choices (design T6). Tests in `src/backup/format.test.ts` and
  `src/db/backup-repo.test.ts` prove "The mapping survives the round trip", "A відновлення replaces
  the mapping", "A бекап of the previous format restores the defaults" and "A choice naming an
  absent категорія is refused whole".

## 6. The menu

- [ ] 6.1 Write the screen logic in `src/ui/rule-template-screen.ts` — the rows the menu shows: each
  базова категорія with its current target, whether that is its типова категорія, the owner's choice
  or off, and what it covers. Tests in `src/ui/rule-template-screen.test.ts` prove "The section
  lists every базова категорія with where it lands", "Pointing one at another категорія" and "A
  switched-off базова категорія stays in the list".
- [ ] 6.2 Build `src/app/manage/rule-template.tsx` over that logic — the category picker per row,
  «Вимкнути», the patterns and MCC codes shown and not editable, and the line saying the owner's own
  правило always wins ("What a базова категорія covers is visible and not editable").
- [ ] 6.3 Add the «Базові категорії» section to `src/app/(tabs)/settings.tsx` in the spec's order,
  with its test in `src/ui/settings-sections.test.ts` proving "The tab opens on its sections".

## 7. Docs and verification

- [ ] 7.1 Add «Шаблон категоризації» and «Базова категорія» to `docs/glossary.md`, and record this
  change in `docs/tech-task.md`.
- [ ] 7.2 Run the `smoke-runner` subagent over this change's scenarios on the emulator: open
  «Базові категорії», remap one group, switch one off, record a витрата with the опис «АТБ» and
  confirm it lands where the menu says.
- [ ] 7.3 Run `npm run verify` and paste the final lines
- [ ] 7.4 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
