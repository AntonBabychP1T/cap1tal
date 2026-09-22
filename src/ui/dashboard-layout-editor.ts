import { widgetLabel, type DashboardLayoutItem, type DashboardWidgetId } from '../dashboard/layout';

/**
 * What dashboard editing (`/manage/home-dashboard`) shows and reads out for one widget — pure
 * TypeScript, so «every widget is offered exactly once, in its saved order, with an accessible
 * move action or none» is a property `npm run verify` checks rather than a promise about the
 * screen (design D4).
 */

export interface DashboardLayoutEditorRow {
  readonly id: DashboardWidgetId;
  readonly label: string;
  readonly visible: boolean;
  /** «2 з 5» — its place among every known widget, shown before the owner leaves the screen. */
  readonly ordinal: string;
  /** Absent (not merely disabled) at the top of the list — this row is already first. */
  readonly canMoveUp: boolean;
  /** Absent at the bottom of the list — this row is already last. */
  readonly canMoveDown: boolean;
  /** Names the widget and the direction, for a screen reader with no color to lean on. */
  readonly moveUpLabel: string;
  readonly moveDownLabel: string;
}

/**
 * One row per entry, in the saved order — the same order the caller already normalized. Adding a
 * widget to the registry needs no change here: it is exactly one more entry in `items`.
 */
export function dashboardLayoutEditorRows(
  items: readonly DashboardLayoutItem[],
): readonly DashboardLayoutEditorRow[] {
  const total = items.length;
  return items.map((item, index) => {
    const label = widgetLabel(item.id);
    return {
      id: item.id,
      label,
      visible: item.visible,
      ordinal: `${index + 1} з ${total}`,
      canMoveUp: index > 0,
      canMoveDown: index < total - 1,
      moveUpLabel: `Перемістити «${label}» вище`,
      moveDownLabel: `Перемістити «${label}» нижче`,
    };
  });
}
