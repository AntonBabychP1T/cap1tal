## 1. Registry and compatibility

- [x] 1.1 Add the closed widget ids, preview labels, schema version and exact four-visible/Progress-hidden default in `src/dashboard/layout.ts`; add `src/dashboard/layout.test.ts` for «Every known widget is listed once» and «Fresh install uses the four-widget default».
- [x] 1.2 Implement total parsing/normalization for old, duplicate, unknown, removed, malformed and future-version layouts; add table/property cases in `src/dashboard/layout.test.ts` for «A newly introduced widget does not disrupt a customised dashboard», «Unknown and duplicate identities are harmless», «A removed widget is ignored» and «A future or damaged preference falls back safely».
- [x] 1.3 Implement pure visibility and move operations that preserve one entry and hidden positions; add `src/dashboard/layout.test.ts` cases for «Repeated editing cannot create a duplicate», «Showing a hidden widget restores its chosen place» and list-boundary moves.

## 2. Preference storage and migration

- [x] 2.1 Add the dedicated `dashboard_layout` schema row and generate a new append-only migration after the then-current journal head without changing existing migrations; extend `src/db/migrations.test.ts` and `src/db/apply-migrations.test.ts` for «Fresh install uses the four-widget default» through no-row/default semantics and successful upgrade with no backfill.
- [x] 2.2 Add `src/db/dashboard-layout-repo.ts`, export it from `src/db/repos.ts`, and implement normalized read, atomic upsert and reset-by-delete; add `src/db/dashboard-layout-repo.test.ts` for «A widget is hidden and the choice survives restart», normalized one-copy saves, malformed/future fallback and «Reset restores the current default».
- [x] 2.3 Add a repository failure/constraint test in `src/db/dashboard-layout-repo.test.ts` proving an invalid write or failed reset leaves the previous preference unchanged, covering the persistence side of «Cancelled reset changes nothing».

## 3. Backup and restore

- [x] 3.1 Add optional typed dashboard layout parsing/serialization and the table allow-list/schema-version decision in `src/backup/format.ts`; extend `src/backup/format.test.ts` for unknown ids/duplicates as structurally valid data and «An older backup restores to the current default».
- [x] 3.2 Snapshot and replace the preference inside `src/db/backup-repo.ts`'s existing immediate transaction; add `src/db/backup-repo.test.ts` for «Custom layout survives the round trip», «Restore replaces the local preference» and absence in an older backup.
- [x] 3.3 Extend the forced-restore-failure fixture in `src/db/backup-repo.test.ts` for «Layout restore is atomic with the money», proving both the prior layout and financial state survive rollback.

## 4. Dashboard editor

- [x] 4.1 Add a pure editor view model in `src/ui/dashboard-layout-editor.ts` for ordered preview rows, visible state, ordinal text, boundary actions and accessible move labels; add `src/ui/dashboard-layout-editor.test.ts` for «Every known widget is listed once», «A screen reader can move one widget» and «List boundaries have no false action».
- [x] 4.2 Add `/manage/home-dashboard` with immediate toggle/move persistence, current-order preview, failure/report handling and confirmed reset; extend `src/ui/screens.test.ts` plus `src/ui/dashboard-layout-editor.test.ts` for «A widget is hidden and the choice survives restart», «Reordering visible widgets changes Головний» and «Cancelled reset changes nothing».
- [x] 4.3 Register the editor route and add the 48 dp «Налаштувати Головний» header action without coupling it to sync; extend `src/ui/screens.test.ts` for «Header action opens the editor» and its no-sync/no-write path.

## 5. Registry-driven Головний

- [x] 5.1 Extract a pure visible-widget render/read plan in `src/ui/home-dashboard.ts` that preserves saved order, renders each known id once and shares month inputs; add `src/ui/home-dashboard.test.ts` for «A saved layout controls only known widgets», «Every widget may be hidden» and the exact fresh default.
- [x] 5.2 Refactor `src/app/(tabs)/index.tsx` to read the layout first, conditionally load only visible widget data, and render existing month/feed/category/Статок presentations through an exhaustive id switch; add `src/ui/home-dashboard.test.ts` instrumentation cases for «Editing a layout works offline» and hidden Статок/Прогрес reads being skipped, while retaining existing financial tests for «Financial distinctions survive layout changes».
- [x] 5.3 Move the uncategorised banner, collapsed чернетки and actionable sync failure into the fixed service rail outside the registry, with no empty wrapper; extend `src/ui/home-screen.test.ts` for «Hiding the feed does not hide the required action», «Many drafts do not bury the dashboard» and «Routine postponement is not an error».
- [x] 5.4 Preserve draft expansion/confirm/dismiss, uncategorised filter navigation, refresh invalidation and the all-hidden recovery sentence; extend `src/ui/home-screen.test.ts` and `src/ui/home-dashboard.test.ts` for «Draft confirmation updates the same record», «Confirming the last чернетка into Без категорії hands off between both alerts» and «Every widget may be hidden».

## 6. Optional Progress widget

- [x] 6.1 Add a compact pure projection of existing `progressViewModel` order and unseen-achievement badge without evaluation or marking seen; add `src/ui/progress-screen.test.ts` for «A deliberately visible Progress widget shows the same quiet badge, then loses it».
- [x] 6.2 Render the optional Progress widget from the existing bounded read and route it to `/progress`; extend `src/ui/home-dashboard.test.ts` and `src/ui/screens.test.ts` for hidden-by-default, deliberate visibility and navigation while keeping the four-widget default unchanged.

## 7. Documentation and device acceptance

- [x] 7.1 Update `docs/product-vision.md`, `docs/app-overview.md` and `docs/tech-task.md` to describe the controlled known-widget preference, current default, fixed service rail and backup decision; add or update the relevant documentation consistency assertion if one exists. Add a `src/dashboard/` row to CLAUDE.md's Layout table.
- [x] 7.2 Run focused unit/database tests named above and record a compact Android smoke at 360 × 640 dp for default, reordered, one-hidden and all-hidden layouts, then repeat at 200% text and with TalkBack to prove «Reordering is understandable and accessible» and non-overlapping header/FAB/report controls.
- [x] 7.3 Capture updated real documentation screenshots showing the default Головний and dashboard editor, without replacing unrelated screenshots.

## 8. Close

- [x] 8.1 Run `npm run verify` and paste the final lines
- [x] 8.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
