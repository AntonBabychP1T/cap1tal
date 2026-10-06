import { describe, expect, it } from 'vitest';

import { defaultDashboardLayout, setWidgetVisibility } from '../dashboard/layout';
import { dashboardLayoutEditorRows } from './dashboard-layout-editor';

describe('dashboardLayoutEditorRows', () => {
  it('Scenario: Every known widget is listed once', () => {
    const rows = dashboardLayoutEditorRows(defaultDashboardLayout());
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.id)).size).toBe(6);
    expect(rows.find((r) => r.id === 'observations')!.label).toBe('Спостереження');
    for (const row of rows) {
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it('Scenario: A screen reader can move one widget', () => {
    const rows = dashboardLayoutEditorRows(defaultDashboardLayout());
    const topCategories = rows.find((r) => r.id === 'top-categories')!;
    // «Топ категорій» has a widget above («Спостереження») and below (net-worth).
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
    expect(rows.map((r) => r.ordinal)).toEqual(['1 з 6', '2 з 6', '3 з 6', '4 з 6', '5 з 6', '6 з 6']);
    expect(rows.find((r) => r.id === 'top-categories')!.visible).toBe(false);
    expect(rows.find((r) => r.id === 'net-worth')!.visible).toBe(true);
  });
});

/**
 * app-shell, "Every switch and every coloured mark has an accessible name", and dashboard-layout,
 * "Each widget's switch names its widget": the switch's name is decided here, and
 * `screens.test.ts` holds the screen to passing it. Whether it is shown is the switch's own state,
 * which a screen reader reads with the name.
 */
describe('the switch of each widget', () => {
  it('Scenario: A widget switch says which widget', () => {
    const rows = dashboardLayoutEditorRows(defaultDashboardLayout());
    const netWorth = rows.find((r) => r.id === 'net-worth')!;
    expect(netWorth.switchLabel).toBe('Статок');
    expect(netWorth.visible).toBe(true);
  });

  it('Scenario: Six switches, six names', () => {
    const items = setWidgetVisibility(defaultDashboardLayout(), 'top-categories', false);
    const rows = dashboardLayoutEditorRows(items);
    expect(rows.map((r) => r.switchLabel)).toEqual([
      'Витрачено цього місяця',
      'Останні 5 транзакцій',
      'Спостереження',
      'Топ категорій',
      'Статок',
      'Прогрес',
    ]);
    // Each name stands with its own state: a hidden widget's switch is off, a shown one's on.
    expect(rows.map((r) => r.visible)).toEqual([true, true, true, false, true, false]);
  });
});
