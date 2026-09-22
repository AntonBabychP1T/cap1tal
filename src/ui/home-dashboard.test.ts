import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  defaultDashboardLayout,
  moveWidget,
  setWidgetVisibility,
  type DashboardLayoutItem,
} from '../dashboard/layout';
import { homeDashboardReadPlan } from './home-dashboard';

describe('homeDashboardReadPlan', () => {
  it('the exact fresh default', () => {
    const plan = homeDashboardReadPlan(defaultDashboardLayout());
    expect(plan.visibleIds).toEqual([
      'month-spent',
      'latest-transactions',
      'top-categories',
      'net-worth',
    ]);
    expect(plan.needsMonthTransactions).toBe(true);
    expect(plan.needsFeed).toBe(true);
    expect(plan.needsNetWorth).toBe(true);
    expect(plan.needsProgress).toBe(false);
  });

  it('Scenario: A saved layout controls only known widgets', () => {
    // «Статок» saved before the month widget, «Топ категорій» hidden.
    const items: DashboardLayoutItem[] = [
      { id: 'net-worth', visible: true },
      { id: 'month-spent', visible: true },
      { id: 'latest-transactions', visible: true },
      { id: 'top-categories', visible: false },
      { id: 'progress', visible: false },
    ];
    const plan = homeDashboardReadPlan(items);
    expect(plan.visibleIds).toEqual(['net-worth', 'month-spent', 'latest-transactions']);
    // «Топ категорій» is hidden, but «Витрачено» is visible — the shared month read still happens.
    expect(plan.needsMonthTransactions).toBe(true);
  });

  it('needs month rows for «Топ категорій» alone, without «Витрачено» being visible', () => {
    const items = setWidgetVisibility(
      setWidgetVisibility(defaultDashboardLayout(), 'month-spent', false),
      'latest-transactions',
      false,
    );
    const plan = homeDashboardReadPlan(setWidgetVisibility(items, 'net-worth', false));
    expect(plan.visibleIds).toEqual(['top-categories']);
    expect(plan.needsMonthTransactions).toBe(true);
    expect(plan.needsFeed).toBe(false);
    expect(plan.needsNetWorth).toBe(false);
  });

  it('Scenario: Every widget may be hidden', () => {
    const allHidden: DashboardLayoutItem[] = defaultDashboardLayout().map((item) => ({
      ...item,
      visible: false,
    }));
    const plan = homeDashboardReadPlan(allHidden);
    expect(plan.visibleIds).toEqual([]);
    expect(plan.needsMonthTransactions).toBe(false);
    expect(plan.needsFeed).toBe(false);
    expect(plan.needsNetWorth).toBe(false);
    expect(plan.needsProgress).toBe(false);
  });

  it('reads for «Прогрес» only when it is visible', () => {
    const withProgress = setWidgetVisibility(defaultDashboardLayout(), 'progress', true);
    expect(homeDashboardReadPlan(withProgress).needsProgress).toBe(true);
    expect(homeDashboardReadPlan(defaultDashboardLayout()).needsProgress).toBe(false);
  });

  it('hidden Статок and Прогрес reads are skipped, never merely computed and discarded', () => {
    // `needsNetWorth`/`needsProgress` are what the screen's own conditional reads key off —
    // false here means the expensive read (every transaction ever recorded, or a full progress
    // evaluation) never happens at all, not that its result goes unused.
    const hidden = setWidgetVisibility(
      setWidgetVisibility(defaultDashboardLayout(), 'net-worth', false),
      'progress',
      false,
    );
    const plan = homeDashboardReadPlan(hidden);
    expect(plan.needsNetWorth).toBe(false);
    expect(plan.needsProgress).toBe(false);
    expect(plan.visibleIds).not.toContain('net-worth');
    expect(plan.visibleIds).not.toContain('progress');
  });

  it('Scenario: Financial distinctions survive layout changes', () => {
    // Hiding, showing or reordering «Статок», «Прогрес» or the feed changes nothing about
    // whether — or how — the month's own transactions are read for «Витрачено цього місяця»/
    // «Топ категорій»: the two concerns are decided by entirely separate flags, so nothing here
    // can perturb the money `homeViewModel`/`monthlyPicture` compute from what is read (already
    // proven, transaction type by transaction type, in `home-screen.test.ts`).
    const customised = moveWidget(
      setWidgetVisibility(setWidgetVisibility(defaultDashboardLayout(), 'net-worth', false), 'progress', true),
      'latest-transactions',
      'down',
    );
    expect(homeDashboardReadPlan(customised).needsMonthTransactions).toBe(
      homeDashboardReadPlan(defaultDashboardLayout()).needsMonthTransactions,
    );
    expect(homeDashboardReadPlan(customised).needsMonthTransactions).toBe(true);

    // And hiding «Топ категорій» too, while «Витрачено» stays visible, still reads the month.
    const onlyMonthSpent = setWidgetVisibility(
      setWidgetVisibility(customised, 'top-categories', false),
      'latest-transactions',
      false,
    );
    expect(homeDashboardReadPlan(onlyMonthSpent).needsMonthTransactions).toBe(true);
  });

  it('Scenario: Editing a layout works offline', () => {
    // Every module the read plan and the preference's own storage/edit path touch is
    // repository-only: no fetch, no monobank import, nothing that could reach the network merely
    // by reading, editing, saving or resetting the layout.
    const sources = [
      readFileSync(new URL('./home-dashboard.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../dashboard/layout.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../db/dashboard-layout-repo.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('./dashboard-layout-editor.ts', import.meta.url), 'utf8'),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(/fetch\(|monobank|axios|XMLHttpRequest/i);
    }
  });
});
