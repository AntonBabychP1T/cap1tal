import { currentMonth } from './months';

/**
 * Where Головний's month card, category rows and «Ще N» lead — pure route strings, built once so
 * a screen never computes a month of its own for a navigation. See `router.push(...)` call sites
 * in `src/app/(tabs)/index.tsx`.
 */

/**
 * The month card's own destination: the device's current calendar month, always — even when
 * Місяць itself has retained a past month from earlier stepping, and across a local date rollover
 * while Головний stays open (main-screen, "The month card always opens the current month").
 * `Місяць` (`src/app/(tabs)/month.tsx`) reads the `month` search param and resets its own retained
 * selection to it.
 */
export function currentMonthRoute(now: Date): string {
  return `/month?month=${currentMonth(now)}`;
}

/**
 * A category row's destination: the existing `/category/[month]/[categoryId]` detail, for the
 * current month — never the currency currently selected in the donut, which the route itself
 * ignores entirely and shows every currency for (main-screen, "Currency selection does not narrow
 * the existing detail contract"). The same route a «Коригування» row already opens with both
 * signs, and «Ще N» opens the full current-month breakdown by leading to the month card's own
 * destination rather than a category at all.
 */
export function categoryMonthRoute(categoryId: string, now: Date): string {
  return `/category/${currentMonth(now)}/${categoryId}`;
}

/** «Ще N»'s own destination: the full current-month breakdown, i.e. the month card's route. */
export function remainderRoute(now: Date): string {
  return currentMonthRoute(now);
}
