/**
 * The closed registry of Головний's widgets, and the one compatibility algorithm that turns
 * whatever an old, damaged or future preference row holds into something this version can render.
 *
 * Pure TypeScript, no React, no repository, no money: this module owns identity, default order,
 * default visibility and normalization only. Rendering an id is a compile-time decision the Home
 * renderer makes through an exhaustive `switch` (design D1) — nothing here can invent a widget a
 * screen does not already draw.
 */

/** The five widgets this version of the app knows. Adding one is a registry decision, never a UI one. */
export const DASHBOARD_WIDGET_IDS = [
  'month-spent',
  'latest-transactions',
  'top-categories',
  'net-worth',
  'progress',
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

function isKnownWidgetId(id: string): id is DashboardWidgetId {
  return (DASHBOARD_WIDGET_IDS as readonly string[]).includes(id);
}

/** One entry in an ordered dashboard layout: which widget, and whether it is shown. */
export interface DashboardLayoutItem {
  readonly id: DashboardWidgetId;
  readonly visible: boolean;
}

/** A widget's identity: its stable id, its Ukrainian preview title, and its fresh-install visibility. */
export interface DashboardWidgetDescriptor {
  readonly id: DashboardWidgetId;
  readonly label: string;
  readonly defaultVisible: boolean;
}

/**
 * The registry, in canonical order — version 1's order and also the fresh-install order of the
 * first four. «Прогрес» is known from the first version but starts hidden (proposal: «Прогрес»
 * never precedes the primary financial readings in the default layout).
 */
export const DASHBOARD_WIDGETS: readonly DashboardWidgetDescriptor[] = [
  { id: 'month-spent', label: 'Витрачено цього місяця', defaultVisible: true },
  { id: 'latest-transactions', label: 'Останні 5 транзакцій', defaultVisible: true },
  { id: 'top-categories', label: 'Топ категорій', defaultVisible: true },
  { id: 'net-worth', label: 'Статок', defaultVisible: true },
  { id: 'progress', label: 'Прогрес', defaultVisible: false },
];

const WIDGET_LABELS: ReadonlyMap<DashboardWidgetId, string> = new Map(
  DASHBOARD_WIDGETS.map((w) => [w.id, w.label]),
);

/** A widget's Ukrainian preview title, for the editor and anywhere else that names one. */
export function widgetLabel(id: DashboardWidgetId): string {
  return WIDGET_LABELS.get(id)!;
}

/** The persisted payload's own version. Bumped only when the stored shape itself changes. */
export const CURRENT_DASHBOARD_LAYOUT_VERSION = 1;

/** The shape a preference row or a бекап carries. `id` is `string`, not the closed union — see design D2. */
export interface StoredDashboardLayout {
  readonly version: number;
  readonly items: readonly { readonly id: string; readonly visible: boolean }[];
}

/** The current default: the registry's own order and visibility, exactly. */
export function defaultDashboardLayout(): readonly DashboardLayoutItem[] {
  return DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: w.defaultVisible }));
}

/** Why normalization fell back to the current default, when it did. */
export type DashboardLayoutDiagnostic = 'malformed' | 'future-version';

export interface NormalizedDashboardLayout {
  readonly items: readonly DashboardLayoutItem[];
  /** Present only when a stored payload could not be used as saved — absent for "no row" too. */
  readonly diagnostic?: DashboardLayoutDiagnostic;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether `value` is a well-typed stored item — the one shape `normalizeDashboardLayout` trusts. */
function isStoredItem(value: unknown): value is { id: string; visible: boolean } {
  return (
    isPlainObject(value) && typeof value.id === 'string' && typeof value.visible === 'boolean'
  );
}

const fallback = (diagnostic: DashboardLayoutDiagnostic): NormalizedDashboardLayout => ({
  items: defaultDashboardLayout(),
  diagnostic,
});

/**
 * The one compatibility algorithm (design D2), run on every read:
 *
 * 1. No row (`raw` is `undefined`) → the current default, no diagnostic — this is the ordinary
 *    fresh-install state, not an error.
 * 2. A malformed payload — not an object, a version that is not a positive integer, an `items`
 *    that is not an array, or any entry that is not `{ id: string, visible: boolean }` — falls
 *    back to the current default with a `'malformed'` diagnostic. Total parse: one bad entry
 *    invalidates the whole payload rather than being silently skipped, the same rule
 *    `src/backup/format.ts` applies to every other stored shape.
 * 3. A version newer than this app understands falls back the same way, with `'future-version'`.
 * 4. Otherwise: keep the first occurrence of each currently known id in saved order and state;
 *    ignore later duplicates and unknown/removed ids; append every registry id not seen, in
 *    canonical registry order, hidden — regardless of its own fresh-install default, so an
 *    upgrade never surprises a customised dashboard.
 */
export function normalizeDashboardLayout(raw: unknown): NormalizedDashboardLayout {
  if (raw === undefined) {
    return { items: defaultDashboardLayout() };
  }
  if (!isPlainObject(raw)) {
    return fallback('malformed');
  }
  const { version, items } = raw;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fallback('malformed');
  }
  if (version > CURRENT_DASHBOARD_LAYOUT_VERSION) {
    return fallback('future-version');
  }
  if (!Array.isArray(items) || !items.every(isStoredItem)) {
    return fallback('malformed');
  }

  const seen = new Set<DashboardWidgetId>();
  const kept: DashboardLayoutItem[] = [];
  for (const entry of items) {
    if (!isKnownWidgetId(entry.id) || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    kept.push({ id: entry.id, visible: entry.visible });
  }
  for (const widget of DASHBOARD_WIDGETS) {
    if (!seen.has(widget.id)) {
      kept.push({ id: widget.id, visible: false });
    }
  }
  return { items: kept };
}

/** Serializes a normalized layout for storage or a бекап: current version, one entry per id. */
export function toStoredDashboardLayout(items: readonly DashboardLayoutItem[]): StoredDashboardLayout {
  return {
    version: CURRENT_DASHBOARD_LAYOUT_VERSION,
    items: items.map((item) => ({ id: item.id, visible: item.visible })),
  };
}

/** Whether two layouts name the same widgets, visible states and order — position included. */
export function sameDashboardLayout(
  a: readonly DashboardLayoutItem[],
  b: readonly DashboardLayoutItem[],
): boolean {
  return (
    a.length === b.length && a.every((item, i) => item.id === b[i]!.id && item.visible === b[i]!.visible)
  );
}

/**
 * Marks one widget visible or hidden in place. The entry keeps its position either way — showing
 * a hidden widget again returns it to the same place rather than moving it to the end.
 */
export function setWidgetVisibility(
  items: readonly DashboardLayoutItem[],
  id: DashboardWidgetId,
  visible: boolean,
): readonly DashboardLayoutItem[] {
  return items.map((item) => (item.id === id ? { ...item, visible } : item));
}

/**
 * Moves one entry one place higher or lower in the ordered list, hidden or not — a hidden widget
 * keeps moving through the same list it is shown in. A no-op, returning the same array, when the
 * widget is already first (`'up'`) or last (`'down'`): the pure boundary a caller can rely on
 * without first checking the list's own length.
 */
export function moveWidget(
  items: readonly DashboardLayoutItem[],
  id: DashboardWidgetId,
  direction: 'up' | 'down',
): readonly DashboardLayoutItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    return items;
  }
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) {
    return items;
  }
  const next = items.slice();
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
