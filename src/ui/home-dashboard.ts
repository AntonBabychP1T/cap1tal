import type { DashboardLayoutItem, DashboardWidgetId } from '../dashboard/layout';

/**
 * What Головний renders and what it therefore has to read, decided once from the normalized
 * dashboard layout — so a hidden widget costs its screen no dedicated local read, and a visible
 * one always renders in the owner's saved order (design D6).
 *
 * Pure TypeScript: this module holds no repository, no React and no money. It turns an already
 * normalized layout into a rendering order and a small set of read flags; the screen itself reads
 * conditionally on those flags and renders `visibleIds` through its own exhaustive `switch`.
 */

export interface HomeDashboardReadPlan {
  /** Every visible widget, in the owner's saved order — exactly what Головний renders. */
  readonly visibleIds: readonly DashboardWidgetId[];
  /** «Витрачено цього місяця» or «Топ категорій» is visible — both read the same month rows. */
  readonly needsMonthTransactions: boolean;
  /** «Останні 5 транзакцій» is visible. */
  readonly needsFeed: boolean;
  /** «Статок» is visible — the only widget that reads every transaction ever recorded. */
  readonly needsNetWorth: boolean;
  /** «Прогрес» is visible. */
  readonly needsProgress: boolean;
}

export function homeDashboardReadPlan(items: readonly DashboardLayoutItem[]): HomeDashboardReadPlan {
  const visibleIds = items.filter((item) => item.visible).map((item) => item.id);
  const visible = new Set(visibleIds);
  return {
    visibleIds,
    needsMonthTransactions: visible.has('month-spent') || visible.has('top-categories'),
    needsFeed: visible.has('latest-transactions'),
    needsNetWorth: visible.has('net-worth'),
    needsProgress: visible.has('progress'),
  };
}
