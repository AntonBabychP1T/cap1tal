import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_WIDGETS,
  defaultDashboardLayout,
  moveWidget,
  normalizeDashboardLayout,
  sameDashboardLayout,
  setWidgetVisibility,
  toStoredDashboardLayout,
  type DashboardLayoutItem,
} from './layout';

describe('DASHBOARD_WIDGETS', () => {
  it('Scenario: Every known widget is listed once', () => {
    expect(DASHBOARD_WIDGETS).toHaveLength(5);
    const ids = DASHBOARD_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(5);
    for (const widget of DASHBOARD_WIDGETS) {
      expect(widget.label.length).toBeGreaterThan(0);
    }
  });
});

describe('defaultDashboardLayout', () => {
  it('Scenario: Fresh install uses the four-widget default', () => {
    const layout = defaultDashboardLayout();
    expect(layout.map((i) => i.id)).toEqual([
      'month-spent',
      'latest-transactions',
      'top-categories',
      'net-worth',
      'progress',
    ]);
    expect(layout.filter((i) => i.visible).map((i) => i.id)).toEqual([
      'month-spent',
      'latest-transactions',
      'top-categories',
      'net-worth',
    ]);
    expect(layout.find((i) => i.id === 'progress')!.visible).toBe(false);
  });
});

describe('normalizeDashboardLayout', () => {
  it('Scenario: Fresh install uses the four-widget default (no row)', () => {
    const result = normalizeDashboardLayout(undefined);
    expect(result.diagnostic).toBeUndefined();
    expect(result.items).toEqual(defaultDashboardLayout());
  });

  it('Scenario: A newly introduced widget does not disrupt a customised dashboard', () => {
    // A saved layout predating «progress» — only the first four ids, reordered and one hidden.
    const raw = {
      version: 1,
      items: [
        { id: 'net-worth', visible: true },
        { id: 'month-spent', visible: true },
        { id: 'latest-transactions', visible: false },
        { id: 'top-categories', visible: true },
      ],
    };
    const result = normalizeDashboardLayout(raw);
    expect(result.diagnostic).toBeUndefined();
    expect(result.items).toEqual([
      { id: 'net-worth', visible: true },
      { id: 'month-spent', visible: true },
      { id: 'latest-transactions', visible: false },
      { id: 'top-categories', visible: true },
      { id: 'progress', visible: false },
    ]);
  });

  it('Scenario: Unknown and duplicate identities are harmless', () => {
    const raw = {
      version: 1,
      items: [
        { id: 'month-spent', visible: true },
        { id: 'net-worth', visible: true },
        { id: 'some-future-widget', visible: true },
        { id: 'net-worth', visible: false },
        { id: 'latest-transactions', visible: true },
        { id: 'top-categories', visible: false },
      ],
    };
    const result = normalizeDashboardLayout(raw);
    expect(result.diagnostic).toBeUndefined();
    const ids = result.items.map((i) => i.id);
    expect(ids).toEqual(['month-spent', 'net-worth', 'latest-transactions', 'top-categories', 'progress']);
    // Only the first «net-worth» entry is used.
    expect(result.items.find((i) => i.id === 'net-worth')!.visible).toBe(true);
  });

  it('Scenario: A removed widget is ignored', () => {
    const raw = {
      version: 1,
      items: [
        { id: 'month-spent', visible: true },
        { id: 'a-retired-widget', visible: true },
        { id: 'latest-transactions', visible: true },
        { id: 'top-categories', visible: true },
        { id: 'net-worth', visible: true },
      ],
    };
    const result = normalizeDashboardLayout(raw);
    expect(result.items.map((i) => i.id)).not.toContain('a-retired-widget');
    // Every remaining known widget appears at most once.
    const ids = result.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Scenario: A future or damaged preference falls back safely (future version)', () => {
    const result = normalizeDashboardLayout({ version: 2, items: [] });
    expect(result.diagnostic).toBe('future-version');
    expect(result.items).toEqual(defaultDashboardLayout());
  });

  it('Scenario: A future or damaged preference falls back safely (not an object)', () => {
    expect(normalizeDashboardLayout('nonsense').diagnostic).toBe('malformed');
    expect(normalizeDashboardLayout(null).diagnostic).toBe('malformed');
    expect(normalizeDashboardLayout(42).diagnostic).toBe('malformed');
  });

  it('Scenario: A future or damaged preference falls back safely (bad version)', () => {
    expect(normalizeDashboardLayout({ version: 0, items: [] }).diagnostic).toBe('malformed');
    expect(normalizeDashboardLayout({ version: 1.5, items: [] }).diagnostic).toBe('malformed');
    expect(normalizeDashboardLayout({ version: '1', items: [] }).diagnostic).toBe('malformed');
  });

  it('Scenario: A future or damaged preference falls back safely (bad items)', () => {
    expect(normalizeDashboardLayout({ version: 1, items: 'nope' }).diagnostic).toBe('malformed');
    expect(
      normalizeDashboardLayout({ version: 1, items: [{ id: 'month-spent', visible: 'yes' }] })
        .diagnostic,
    ).toBe('malformed');
    expect(
      normalizeDashboardLayout({ version: 1, items: [{ visible: true }] }).diagnostic,
    ).toBe('malformed');
  });

  it("falls back safely for a damaged preference without touching what it does not own", () => {
    const result = normalizeDashboardLayout({ version: 1, items: [{ id: 42, visible: true }] });
    expect(result.diagnostic).toBe('malformed');
    expect(result.items).toEqual(defaultDashboardLayout());
  });
});

describe('setWidgetVisibility and moveWidget', () => {
  it('Scenario: Repeated editing cannot create a duplicate', () => {
    let items = defaultDashboardLayout();
    items = setWidgetVisibility(items, 'net-worth', false);
    items = setWidgetVisibility(items, 'net-worth', true);
    items = moveWidget(items, 'net-worth', 'up');
    items = moveWidget(items, 'net-worth', 'down');
    items = moveWidget(items, 'net-worth', 'up');
    const netWorthEntries = items.filter((i) => i.id === 'net-worth');
    expect(netWorthEntries).toHaveLength(1);
    expect(items).toHaveLength(5);
  });

  it('Scenario: Showing a hidden widget restores its chosen place', () => {
    // «Топ категорій» hidden between «Останні 5 транзакцій» and «Статок».
    const items: DashboardLayoutItem[] = [
      { id: 'month-spent', visible: true },
      { id: 'latest-transactions', visible: true },
      { id: 'top-categories', visible: false },
      { id: 'net-worth', visible: true },
      { id: 'progress', visible: false },
    ];
    const shown = setWidgetVisibility(items, 'top-categories', true);
    expect(shown.map((i) => i.id)).toEqual([
      'month-spent',
      'latest-transactions',
      'top-categories',
      'net-worth',
      'progress',
    ]);
    expect(shown.find((i) => i.id === 'top-categories')!.visible).toBe(true);
    expect(shown.filter((i) => i.id === 'top-categories')).toHaveLength(1);
  });

  it('list-boundary moves are a no-op rather than a wraparound', () => {
    const items = defaultDashboardLayout();
    const movedFirstUp = moveWidget(items, 'month-spent', 'up');
    expect(movedFirstUp).toEqual(items);
    const movedLastDown = moveWidget(items, 'progress', 'down');
    expect(movedLastDown).toEqual(items);
  });

  it('moves an interior widget one place in the requested direction', () => {
    const items = defaultDashboardLayout();
    const moved = moveWidget(items, 'net-worth', 'up');
    expect(moved.map((i) => i.id)).toEqual([
      'month-spent',
      'latest-transactions',
      'net-worth',
      'top-categories',
      'progress',
    ]);
  });
});

describe('toStoredDashboardLayout and sameDashboardLayout', () => {
  it('serializes one entry per known id under the current version', () => {
    const stored = toStoredDashboardLayout(defaultDashboardLayout());
    expect(stored.version).toBe(1);
    expect(stored.items).toHaveLength(5);
  });

  it('compares layouts by id, visibility and order', () => {
    const a = defaultDashboardLayout();
    const b = setWidgetVisibility(a, 'progress', true);
    expect(sameDashboardLayout(a, a)).toBe(true);
    expect(sameDashboardLayout(a, b)).toBe(false);
  });
});
