import { describe, expect, it } from 'vitest';

import { CORRECTION_CATEGORY_ID } from '../domain/transaction';
import { categoryMonthRoute, currentMonthRoute, remainderRoute } from './home-navigation';

describe('currentMonthRoute', () => {
  it('Scenario: A retained old selection does not win — always the current month', () => {
    // Місяць may still be showing July internally; the route Головний builds never reads that
    // state at all, so it cannot be won by it.
    const september = new Date('2026-09-19T12:00:00');
    expect(currentMonthRoute(september)).toBe('/month?month=2026-09');
  });

  it('Scenario: Rollover updates the month', () => {
    const sept30 = new Date('2026-09-30T23:59:00');
    const oct1 = new Date('2026-10-01T00:05:00');
    expect(currentMonthRoute(sept30)).toBe('/month?month=2026-09');
    expect(currentMonthRoute(oct1)).toBe('/month?month=2026-10');
  });
});

describe('categoryMonthRoute', () => {
  it('Scenario: Currency selection does not narrow the existing detail contract', () => {
    // The route names only the category and the month — no currency parameter exists for a
    // selected currency to narrow it with, whatever the donut widget currently shows.
    const now = new Date('2026-09-19T12:00:00');
    expect(categoryMonthRoute('groceries', now)).toBe('/category/2026-09/groceries');
  });

  it('Scenario: Remainder and corrections are reachable — «Коригування» uses the same route', () => {
    const now = new Date('2026-09-19T12:00:00');
    expect(categoryMonthRoute(CORRECTION_CATEGORY_ID, now)).toBe(
      `/category/2026-09/${CORRECTION_CATEGORY_ID}`,
    );
  });
});

describe('remainderRoute', () => {
  it('Scenario: Remainder and corrections are reachable — «Ще N» opens the full current month', () => {
    const now = new Date('2026-09-19T12:00:00');
    expect(remainderRoute(now)).toBe(currentMonthRoute(now));
    expect(remainderRoute(now)).toBe('/month?month=2026-09');
  });
});
