## 1. The шаблон as data

- [x] 1.1 Write `src/domain/rule-template.ts` — `TemplateGroup`, `TEMPLATE_GROUPS` for the twenty-two
  базові категорії the spec names with their типові категорії, folded merchant patterns and MCC
  codes, and `TEMPLATE_VERSION` (design T1).
- [x] 1.2 Tests in `src/domain/rule-template.test.ts` restating the spec's table independently:
  every базова категорія of the spec exists with that типова категорія, no group names
  «Коригування», «Комісія» or «Без категорії», every pattern is folded and at least three
  characters, every MCC is a whole number, every group id and every pattern is unique across the
  шаблон, and «bolt food» is longer than «bolt» ("The longest шаблон pattern wins inside the
  шаблон").

## 2. Two tiers, one matcher

- [x] 2.1 Add `templateRules(targets)`, `RuleTiers`, `resolveTarget` and `resolveCategory` to
  `src/domain/rules.ts` (design T2). Tests in `src/domain/rules.test.ts` prove "A правило beats the
  шаблон", "An owner's MCC rule beats a шаблон merchant match", "The longest шаблон pattern wins
  inside the шаблон", "Both spellings of one merchant are covered", "A known MCC is enough on its
  own", "A switched-off базова категорія matches nothing", "An ineligible правило-переказ does
  not silence the шаблон" and "Neither tier matches".
- [x] 2.2 Extend `sweepUncategorised` to take the same two-tier context instead of правила alone,
  with a test proving a витрата in «Без категорії» is swept by the шаблон with no правило present.

## 3. Storage

- [x] 3.1 Add `rule_template_choices` and the one-row swept-version table to `src/db/schema.ts` and
  generate the migration with `npm run db:generate` (design T3, T5). A test in
  `src/db/migrations.test.ts` proves "The migration keeps what is stored".
- [x] 3.2 Write `src/db/rule-template-repo.ts`: read the choices, resolve group → категорія
  (choice, else типова категорія, else dropped when no such row exists), `choose(groupId, target)`
  and the swept-version read/write. Tests in `src/db/rule-template-repo.test.ts` prove "A choice is
  read back after a restart", "One choice per базова категорія", "A категорія a choice points at
  cannot be deleted out from under it", "A target that no longer exists matches nothing" and that an
  unknown stored group id is ignored and left in place.
- [x] 3.3 Move the sweep body out of `rulesRepo.save` into `src/db/categorisation.ts` over both
  tiers, and make `choose` sweep «Без категорії» in the same transaction (design T5). Tests prove
  "Changing a mapping sweeps «Без категорії»", "Switching a базова категорія off takes nothing
  back", "The шаблон fills what the new правило does not", and the reworded "An MCC-only правило
  moves nothing".
- [x] 3.4 Add `categorisationContext()` to `src/db/repos.ts` and move `src/monobank/sync.ts`,
  `src/notifications/draft.ts`, the entry form's caller and the sweep onto it (design T4). Existing
  tests in `src/monobank/sync.test.ts` and `src/notifications/draft.test.ts` must stay green; add
  one proving "The шаблон auto-confirms a чернетка" and one proving "The шаблон reaches the entry
  form". The offer (`use-rule-offer.ts`) keeps reading the owner's правила alone ("A шаблон match
  still offers the правило").

## 4. The open-time sweep

- [x] 4.1 Sweep once per `TEMPLATE_VERSION` as a launch chore right after `seed`, recording the
  version in the same transaction, wrapped in `journal.step` (design T5). Tests prove "The first open after
  an update clears what it can", "Opening again sweeps nothing", "A new шаблон version reaches the
  pile again" and "A категорія the owner chose is still never taken away".
- [x] 4.2 Add the test that ties `TEMPLATE_VERSION` to a snapshot of the groups' content, so
  changing the шаблон without raising the version fails (design T1, T5).

## 5. The бекап

- [x] 5.1 Carry the choices in `src/backup/format.ts` as one more optional list, with
  `BACKUP_SCHEMA_VERSION` at the new migration count and the swept-version table among the
  exclusions, and read a file without the list as no choices (design T6). Tests in
  `src/backup/format.test.ts` and `src/db/backup-repo.test.ts` prove "The mapping survives the round
  trip", "A відновлення replaces the mapping", "A бекап written before the mapping existed restores
  the defaults" and "A choice naming an absent категорія is refused whole".

## 6. The menu

- [x] 6.1 Write the screen logic in `src/ui/rule-template-screen.ts` — the rows the menu shows: each
  базова категорія with its current target, whether that is its типова категорія, the owner's choice
  or off, and what it covers. Tests in `src/ui/rule-template-screen.test.ts` prove "The section
  lists every базова категорія with where it lands", "Pointing one at another категорія" and "A
  switched-off базова категорія stays in the list".
- [x] 6.2 Build `src/app/manage/rule-template.tsx` over that logic — the category picker per row,
  «Вимкнути», the patterns and MCC codes shown and not editable, and the line saying the owner's own
  правило always wins ("What a базова категорія covers is visible and not editable").
- [x] 6.3 Add «Базові категорії» to `SETTINGS_SECTIONS` in `src/ui/settings-sections.ts` right
  after «Правила», with its test in `src/ui/settings-sections.test.ts` proving "The tab offers
  «Базові категорії» after «Правила»".

## 7. Docs and verification

- [x] 7.1 Add «Шаблон категоризації», «Базова категорія» and «Типова категорія» to
  `docs/glossary.md`, widen the «Sweep (розбір)» entry to its three triggers and both tiers, and
  record this
  change in `docs/tech-task.md`.
- [x] 7.2 Run the `smoke-runner` subagent over this change's scenarios on the emulator: open
  «Базові категорії», remap one group, switch one off, record a витрата with the опис «АТБ» and
  confirm it lands where the menu says.
- [x] 7.3 Run `npm run verify` and paste the final lines
- [x] 7.4 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
