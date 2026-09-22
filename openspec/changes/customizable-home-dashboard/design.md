## Context

See `proposal.md` for the product decision and the three delta specs for observable behaviour. The current Головний is implemented in `src/app/(tabs)/index.tsx`: one focus reload reads the month, latest five транзакції, category breakdown inputs, all-account Статок inputs, sync state and compact alerts, then JSX renders the four financial widgets in a fixed order. `home-dashboard-redesign` deliberately removed Home's Progress block and kept the full Прогрес surface under Звіти.

The existing code already provides the financial readings this change must preserve: `homeViewModel`, `categoryPresentation`, `netWorthWidgetModel`, `transactionLine`, `progressScreenData`/`progressViewModel`, and their repositories. The customization layer must select and order those presentations, never recompute their amounts. Sync freshness, uncategorised count, чернетки and actionable failure state are also already decided outside the widgets.

Preferences in this codebase use dedicated single-purpose SQLite tables rather than a generic settings store. `daily_reminder` is backed up because it is the owner's non-secret preference; `entry_defaults` and `bug_report_capture` are excluded because they are device habits. Dashboard layout is an explicit owner choice and therefore belongs with the first class. The backup format is versioned and its table allow-list forces a decision for every new table.

The worktree contains unrelated changes, including a pending generated migration. Implementation must build on the then-current migration journal and must not edit, reorder or replace any committed or pre-existing migration.

## Goals / Non-Goals

**Goals:**

- one pure source of truth for widget identities, labels, default order and default visibility;
- deterministic normalization of missing, duplicate, unknown and future data;
- a small accessible editor with immediate persistence and explicit reset;
- conditional local reads so hiding an expensive widget also avoids its dedicated read;
- atomic backup/restore of the preference without changing any money definition.

**Non-Goals:**

- a component/plugin API, arbitrary JSON-driven UI, grids, sizes or conditional visibility rules;
- a second calculation path for витрачено, category breakdown, Статок or Прогрес;
- changing when досягнення are earned or marked seen;
- a generic application settings table;
- schema downgrade or destructive cleanup on rollback.

## Decisions

### D1. A closed pure registry owns identity and defaults

Create a dependency-free module such as `src/dashboard/layout.ts` with the closed union:

```ts
type DashboardWidgetId =
  | 'month-spent'
  | 'latest-transactions'
  | 'top-categories'
  | 'net-worth'
  | 'progress';

type DashboardLayoutItem = {
  readonly id: DashboardWidgetId;
  readonly visible: boolean;
};
```

The module exports `DASHBOARD_WIDGETS` in canonical order, each descriptor carrying only stable id, Ukrainian preview title and current default visibility. Version 1's order is the five ids above; the first four are visible and `progress` is hidden. `defaultDashboardLayout()`, `normalizeDashboardLayout(raw)`, `moveWidget`, `setWidgetVisibility` and equality helpers live here and are tested as plain TypeScript.

The registry does **not** hold React components, repository functions, money or navigation. This keeps the compatibility algorithm reusable by storage, backup tests and UI without making the data model depend on React. The Home renderer owns an exhaustive `switch` from id to the existing component/presentation. Adding an id therefore requires both a registry decision and a compile-time render decision.

Alternative considered: let each component register itself dynamically. Rejected because module load order would become product order, arbitrary modules could become widgets, and defaults/backup migrations would no longer be reviewable as one closed list.

### D2. Layout schema v1 is an ordered list, normalized against the registry

The persisted payload is deliberately small:

```ts
interface StoredDashboardLayout {
  readonly version: 1;
  readonly items: readonly {
    readonly id: string;
    readonly visible: boolean;
  }[];
}
```

`id` is `string` at the storage boundary so an old app can read a value containing a future id and ignore it instead of throwing during decode. Normalization is deterministic:

1. No row means `defaultDashboardLayout()`.
2. A supported payload is traversed in saved order. Keep the first entry for each currently known id; ignore later duplicates and unknown/removed ids.
3. Append every registry id not seen in the payload, in canonical registry order, with `visible: false` regardless of its fresh-install default. This protects an existing owner's layout from surprise UI after an upgrade while keeping the new widget discoverable.
4. A malformed payload or `version > CURRENT_DASHBOARD_LAYOUT_VERSION` yields the current default for display and a recoverable diagnostic, without touching money or overwriting the row automatically.
5. Any owner write serializes the normalized current list with the current version, exactly once per known id.

Reset deletes the preference row. Absence is the durable meaning of “follow this installed version's current default”, so a later reset or restore of an old backup cannot freeze a copied historical default. A user customization, including “all hidden”, always creates a row.

Alternative considered: automatically insert a new widget at its position in the new default and make it visible. Rejected because it silently rearranges a dashboard the owner explicitly customized. Urgent information belongs to the fixed service area, so it never needs this exception.

### D3. Store one dedicated SQLite preference row

Add `dashboard_layout` with:

- `id TEXT PRIMARY KEY`, constrained to `'home'`;
- `schema_version INTEGER NOT NULL`, constrained positive;
- `items_json TEXT NOT NULL`.

`src/db/dashboard-layout-repo.ts` owns JSON parsing and writes. `read()` returns the normalized layout plus a source/diagnostic state needed by the editor; `save()` normalizes before one upsert; `reset()` deletes only the `'home'` row. Synchronous SQLite means a move/toggle can write first and update visible state only after success; a failure leaves both stored and shown order unchanged and uses the existing failure/report path.

A single row is preferable to one row per widget because order, version and visibility are one preference and must change atomically. JSON is not financial data and contains no amount; validation remains total at the module boundary. A generic key/value settings table is rejected because the repository explicitly has none and this feature needs a typed compatibility contract, not untyped storage.

Add the table through `src/db/schema.ts` and a newly generated append-only migration. Do not backfill: no row already means the required fresh default. Bump `BACKUP_SCHEMA_VERSION` to the resulting migration count and extend the migration/schema tripwire tests.

### D4. Use a separate editor with immediate writes

Add `/manage/home-dashboard` as a card route. The Головний header gains a 48 dp action with accessibility label «Налаштувати Головний». The editor uses existing `Screen`, `ScreenHeader`, `ListCard`, `ListRow`, `Switch`/form actions and theme tokens.

Each row shows the registry preview title, visible switch, ordinal position and «Вище»/«Нижче» controls. Boundary controls are absent, not merely disabled. The controls have explicit accessibility labels naming the widget and direction; this satisfies reorder without requiring precision dragging. Hidden rows remain in the same ordered list and can still move.

Every toggle/move persists immediately. This avoids a second draft-vs-saved state, an unsaved-changes back interception and a destructive “Save” race. «Скинути до стандартного вигляду» uses the existing confirmation pattern, deletes the row and reloads the current default. With all widgets hidden, Home shows a short empty sentence and keeps the header action available.

Alternative considered: gesture-based drag-and-drop. Rejected for v1 because it adds gesture, autoscroll, large-text and TalkBack complexity while the requirement explicitly permits another clear mechanism. Existing gesture-handler/reanimated dependencies do not remove those behavioural and test costs. A later UI may add drag as a second input without changing the stored shape or specs, provided the named buttons remain available.

### D5. Service state is a fixed rail, not a widget

Keep the compact sync freshness/control in the header. Directly below it, render a fixed service rail containing only currently actionable items: uncategorised banner, collapsed pending-чернетка row and actionable sync-failure row. The no-account invitation remains fixed as an enabling state. None has a registry id, appears in the editor or participates in reset/order.

The rail has no wrapper or reserved space when empty and retains the current caps: one compact row per condition, draft bodies only after explicit expansion. This intentionally replaces positional assumptions like “between latest records and categories” once those two widgets can move or disappear. `перенесено` remains a healthy outcome and produces no row.

Alternative considered: attach uncategorised state to the latest-transactions widget. Rejected because hiding that widget would hide work awaiting the owner, contrary to the new contract. The banner still opens the existing exact filter and therefore stays content-related without becoming customizable content.

### D6. Home loads base state plus data for visible widgets only

At focus reload, read the layout first (SQLite is synchronous), build a visible-id set, then read:

- always: minimal first-run/account state, sync coverage/attempt, uncategorised count and pending draft count/details needed for the service rail;
- `month-spent`: current-month rows needed by `homeViewModel`;
- `latest-transactions`: `listLatest(5)`, names/limits and the bounded recency window needed by its one-tap category picker;
- `top-categories`: current-month rows and category names used by `categoryPresentation` (sharing the already-read month rows if `month-spent` is visible too);
- `net-worth`: the current contribution inputs and bounded history reads already passed to `netWorthWidgetModel`;
- `progress`: one read-only `progressScreenData()` and the existing `progressViewModel`.

The fixed service rail may require small reads even when every widget is hidden; that is intentional. Heavy reads for hidden Статок/Прогрес are skipped. Existing refresh triggers—focus, committed sync/capture, local date rollover and in-session writes—remain the single invalidation path. Layout save causes Home to reload on return. No renderer or edit action invokes rate refresh or sync; the app's pre-existing shared refresh policies remain the only network work.

The Progress widget is a compact projection of the already ordered `progressViewModel`: title, at most one first row from its existing sections/quiet unseen badge, and an action to `/progress`. It calls neither evaluation nor `markAllSeen`; only opening the full Прогрес screen keeps that existing write. This reuses business decisions instead of recreating challenge or achievement rules on Home.

Alternative considered: keep the current unconditional mega-load and only hide JSX. Rejected because a hidden widget should not pay for all-account history/progress work and future widgets would make that cost grow invisibly.

### D7. Backup carries the preference as an optional typed field

Add `dashboard_layout` to the backup table allow-list and an optional `dashboardLayout` value to the backup data shape:

```ts
dashboardLayout?: {
  readonly schemaVersion: number;
  readonly items: readonly { readonly id: string; readonly visible: boolean }[];
};
```

Snapshot includes it only when the dedicated row exists. Parser validation checks structural types and positive version but deliberately allows unknown ids and duplicates; registry normalization, not backup parsing, defines what the installed app knows. Restore deletes the local row with the rest of covered state and inserts the backup row when present, within the existing single immediate transaction. Absence leaves no row, which means current default.

The backup format version stays unchanged because the field is optional and the storage-schema bump already makes an older app refuse a backup from the newer storage shape rather than silently dropping it. Older backups remain readable and restore to no row/current default. Integrity coverage and Google Drive encryption apply automatically to the added field; it contains no secret.

Alternative considered: exclude the layout as a device habit like `entry_defaults`. Rejected because the owner deliberately configures it, the same reason `daily_reminder` travels, and the user preference is useful on a replacement phone.

### D8. Financial and platform boundaries remain unchanged

The layout module contains no money and no imports from financial domain calculation modules. Existing widget view models remain authoritative for exact minor-unit arithmetic, per-currency separation and the distinctions among витрата, повернення, переказ, інвестиція, позика, комісія, відсотки and коригування. Layout tests assert identity/order/visibility; existing financial tests continue to prove values.

New native modules: none. New permissions: none. Expo configuration changes: none. New npm dependencies: none. No network API or server state is added. The SQLite migration is the only platform-persistent change.

## Risks / Trade-offs

- **A malformed row could otherwise blank Home** → total parse/normalize with current-default fallback; report a recoverable storage diagnostic and never throw through render.
- **A new widget may be easy to miss on a customized dashboard** → append it hidden but visible in the editor; reset advertises and applies the new current default. This is the explicit cost of not surprising the owner.
- **Fixed alerts can consume the first viewport when several actions are pending** → one compact collapsed row per condition, no empty wrapper, no draft bodies until expanded; retain the compact-screen smoke acceptance.
- **Conditional reads make Home wiring more branched** → one visible-id read plan with shared month/account inputs and pure tests, rather than conditionals scattered through components.
- **Immediate writes provide no multi-step Cancel** → every action is small and reversible, reset is confirmed, and failures do not update the shown order. This is simpler and less lossy than a draft state.
- **JSON cannot enforce one widget id per entry in SQLite** → normalize on every read and write, plus property tests for arbitrary duplicates/unknown ids; the closed registry and UI never emit duplicates.
- **A rollback cannot remove the new table** → follow append-only policy: rollback stops reading it and leaves the inert preference row in place; no destructive down migration.

## Migration Plan

1. Add the pure registry/normalizer and exhaustive tests, including arbitrary duplicate/unknown/missing inputs and the exact default.
2. Add the dedicated schema table and repository, generate a new migration after the current journal head, bump `BACKUP_SCHEMA_VERSION`, and prove empty/current installations migrate without backfill.
3. Extend backup snapshot, parser and atomic restore with the optional preference; prove old-backup default, round-trip and failure rollback.
4. Add the editor route and header action, then refactor Home into the fixed header/service rail plus registry-driven widget renderer and conditional read plan.
5. Add the compact read-only Progress widget, preserving the existing evaluation/seen boundaries.
6. Run focused tests, compact Android/TalkBack smoke for reorder/large text/all-hidden/service alerts, then the repository gate and diff review.

Rollback is a code revert that ignores the dedicated table; the append-only migration and data remain harmlessly in place. A later corrected build can read the preference again. No рахунок, транзакція, balance, current value, progress record or backup secret is transformed by rollout or rollback.
