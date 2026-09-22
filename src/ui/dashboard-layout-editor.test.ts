import { describe, expect, it } from 'vitest';

import { defaultDashboardLayout, setWidgetVisibility } from '../dashboard/layout';
import { dashboardLayoutEditorRows } from './dashboard-layout-editor';

describe('dashboardLayoutEditorRows', () => {
  it('Scenario: Every known widget is listed once', () => {
    const rows = dashboardLayoutEditorRows(defaultDashboardLayout());
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.id)).size).toBe(5);
    for (const row of rows) {
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it('Scenario: A screen reader can move one widget', () => {
    const rows = dashboardLayoutEditorRows(defaultDashboardLayout());
    const topCategories = rows.find((r) => r.id === 'top-categories')!;
    // «Топ категорій» has a widget above (latest-transactions) and below (net-worth).
    expect(topCategories.canMoveUp).toBe(true);
    expect(topCategories.canMoveDown).toBe(true);
    expect(topCategories.moveUpLabel).toBe('Перемістити «Топ категорій» вище');
    expect(topCategories.moveDownLabel).toBe('Перемістити «Топ категорій» нижче');
    // No color: the labels alone name the widget and the direction.
    expect(topCategories.moveUpLabel).not.toMatch(/#|rgb|color/i);
  });

  it('Scenario: List boundaries have no false action', () => {
    const rows = dashboardLayoutEditorRows(defaultDashboardLayout());
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    expect(first.id).toBe('month-spent');
    expect(first.canMoveUp).toBe(false);
    expect(last.id).toBe('progress');
    expect(last.canMoveDown).toBe(false);
  });

  it('shows the ordinal position and visible state, and follows the given order', () => {
    const items = setWidgetVisibility(defaultDashboardLayout(), 'top-categories', false);
    const rows = dashboardLayoutEditorRows(items);
    expect(rows.map((r) => r.ordinal)).toEqual(['1 з 5', '2 з 5', '3 з 5', '4 з 5', '5 з 5']);
    expect(rows.find((r) => r.id === 'top-categories')!.visible).toBe(false);
    expect(rows.find((r) => r.id === 'net-worth')!.visible).toBe(true);
  });
});
