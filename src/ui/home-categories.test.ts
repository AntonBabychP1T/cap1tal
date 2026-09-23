import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import {
  CORRECTION_CATEGORY_ID,
  expenseByDefault,
  refund,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from '../domain/transaction';
import { categoryMonthRoute, currentMonthRoute, remainderRoute } from './home-navigation';
import { categoryPresentation, legendSwatch, sectorOpacity } from './home-categories';
import { donutGeometry } from './dashboard-charts';

const names = new Map<string, string>([
  ['groceries', 'Продукти'],
  ['eating-out', 'Кафе'],
  ['transport', 'Транспорт'],
  ['pets', 'Тварини'],
  ['clothes', 'Одяг'],
  ['electronics', 'Електроніка'],
  ['fees', 'Комісія'],
  [UNCATEGORISED_CATEGORY_ID, 'Без категорії'],
  [CORRECTION_CATEGORY_ID, 'Коригування'],
]);

const spent = (
  id: string,
  categoryId: string,
  amountMinor: number,
  currency = 'UAH',
  accountId = 'card',
): Transaction =>
  expenseByDefault({ id, date: '2026-09-10', accountId, amount: money(amountMinor, currency), categoryId });

describe('categoryPresentation', () => {
  it('Scenario: An empty breakdown says «Ще немає витрат»', () => {
    const result = categoryPresentation({ month: '2026-09', transactions: [], categoryNames: names });
    expect(result).toEqual({
      currencies: [],
      currencyChips: [],
      rows: [],
      emptyMessage: 'Ще немає витрат',
    });
  });

  it('Scenario: Five plus the remainder reconcile', () => {
    const amounts = [700, 600, 500, 400, 300, 200, 100];
    const transactions = amounts.map((a, i) =>
      spent(`e${i}`, `cat${i}`, a * 100),
    );
    for (const t of transactions) {
      if (t.type === 'expense') names.set(t.categoryId, `Категорія ${t.categoryId}`);
    }
    const result = categoryPresentation({ month: '2026-09', transactions, categoryNames: names });

    expect(result.center).toEqual(money(280000, 'UAH'));
    expect(result.rows).toHaveLength(5);
    expect(result.rows.map((r) => r.amount.amount)).toEqual([70000, 60000, 50000, 40000, 30000]);
    expect(result.remainder).toEqual({
      count: 2,
      label: 'Ще 2',
      amount: money(30000, 'UAH'),
      accessibilityLabel: 'Ще 2 категорії, 300,00 UAH',
    });
    // The five plus the remainder sum back to the exact spent center.
    const total = result.rows.reduce((s, r) => s + r.amount.amount, 0) + (result.remainder?.amount.amount ?? 0);
    expect(total).toBe(result.center!.amount);
  });

  it('Scenario: Tied categories rank by Ukrainian name then id', () => {
    const transactions = [
      spent('e1', 'eating-out', 10000),
      spent('e2', 'groceries', 10000),
      spent('e3', 'transport', 10000),
    ];
    const result = categoryPresentation({ month: '2026-09', transactions, categoryNames: names });
    // All tied at 10000: Кафе, Продукти, Транспорт — Ukrainian alphabetical order.
    expect(result.rows.map((r) => r.categoryId)).toEqual(['eating-out', 'groceries', 'transport']);
  });

  it('Scenario: Reserved and archived categories participate', () => {
    const transactions: Transaction[] = [
      spent('e1', UNCATEGORISED_CATEGORY_ID, 5000),
      spent('e2', 'fees', 2000),
      {
        type: 'correction',
        id: 'c1',
        date: '2026-09-15',
        accountId: 'card',
        amount: money(-3000, 'UAH'),
      },
      spent('e3', 'archived-cat', 1000),
    ];
    names.set('archived-cat', 'Стара категорія');
    const result = categoryPresentation({ month: '2026-09', transactions, categoryNames: names });
    const ids = result.rows.map((r) => r.categoryId).sort();
    expect(ids).toEqual([CORRECTION_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID, 'archived-cat', 'fees'].sort());
    expect(result.center).toEqual(money(11000, 'UAH'));
  });

  it('Scenario: A negative category keeps its exact signed amount', () => {
    const transactions = [
      spent('e1', 'groceries', 10000),
      refund({ id: 'r1', date: '2026-09-12', accountId: 'card', amount: money(2000, 'UAH'), categoryId: 'clothes' }),
    ];
    const result = categoryPresentation({ month: '2026-09', transactions, categoryNames: names });
    expect(result.center).toEqual(money(8000, 'UAH'));
    const clothes = result.rows.find((r) => r.categoryId === 'clothes');
    expect(clothes?.amount).toEqual(money(-2000, 'UAH'));
  });

  it('Scenario: A refund-only month has an exact negative center, not a hidden or clamped one', () => {
    const transactions = [
      refund({ id: 'r1', date: '2026-09-12', accountId: 'card', amount: money(5000, 'UAH'), categoryId: 'clothes' }),
    ];
    const result = categoryPresentation({ month: '2026-09', transactions, categoryNames: names });
    expect(result.center).toEqual(money(-5000, 'UAH'));
    expect(result.rows).toEqual([
      {
        categoryId: 'clothes',
        name: 'Одяг',
        amount: money(-5000, 'UAH'),
        accessibilityLabel: 'Одяг, −50,00 UAH',
      },
    ]);
  });

  it('Scenario: Two currencies select independently', () => {
    const transactions = [spent('e1', 'groceries', 10000, 'UAH'), spent('e2', 'transport', 5000, 'USD')];
    const first = categoryPresentation({ month: '2026-09', transactions, categoryNames: names });
    expect(first.selectedCurrency).toBe('UAH');
    expect(first.currencies).toEqual(['UAH', 'USD']);

    const usdSelected = categoryPresentation({
      month: '2026-09',
      transactions,
      categoryNames: names,
      requestedCurrency: 'USD',
    });
    expect(usdSelected.selectedCurrency).toBe('USD');
    expect(usdSelected.center).toEqual(money(5000, 'USD'));
    expect(usdSelected.rows.every((r) => r.amount.currency === 'USD')).toBe(true);

    // Selected-state labels: never a colour alone standing for which chip is chosen.
    expect(first.currencyChips).toEqual([
      { currency: 'UAH', selected: true, accessibilityLabel: 'UAH, обрано' },
      { currency: 'USD', selected: false, accessibilityLabel: 'USD' },
    ]);
    expect(usdSelected.currencyChips).toEqual([
      { currency: 'UAH', selected: false, accessibilityLabel: 'UAH' },
      { currency: 'USD', selected: true, accessibilityLabel: 'USD, обрано' },
    ]);
  });

  it('Scenario: A single currency offers no selector at all', () => {
    const transactions = [spent('e1', 'groceries', 10000, 'UAH')];
    const result = categoryPresentation({ month: '2026-09', transactions, categoryNames: names });
    expect(result.currencies).toEqual(['UAH']);
    expect(result.currencyChips).toEqual([]);
  });

  it('Scenario: No UAH or a removed selection', () => {
    const transactions = [spent('e1', 'groceries', 10000, 'EUR'), spent('e2', 'transport', 5000, 'USD')];
    const opened = categoryPresentation({ month: '2026-09', transactions, categoryNames: names });
    // No UAH: first in the existing order (EUR before USD via `byCurrency`).
    expect(opened.selectedCurrency).toBe('EUR');

    const usdChosen = categoryPresentation({
      month: '2026-09',
      transactions,
      categoryNames: names,
      requestedCurrency: 'USD',
    });
    expect(usdChosen.selectedCurrency).toBe('USD');

    // USD's only record disappears — the requested currency is no longer available, so the
    // selection falls back rather than requesting something that no longer exists.
    const usdGone = categoryPresentation({
      month: '2026-09',
      transactions: [spent('e1', 'groceries', 10000, 'EUR')],
      categoryNames: names,
      requestedCurrency: 'USD',
    });
    expect(usdGone.selectedCurrency).toBe('EUR');
    expect(usdGone.currencies).toEqual(['EUR']);
  });

  it('Scenario: Currency selection does not narrow the existing detail contract — route descriptors', () => {
    // Each row and the remainder carry exactly what `categoryMonthRoute`/`remainderRoute`
    // (`home-navigation.ts`) need — a categoryId and nothing about the currently selected
    // currency, since the route they build shows every currency regardless.
    const transactions = [spent('e1', 'groceries', 10000, 'UAH'), spent('e2', 'transport', 5000, 'USD')];
    const result = categoryPresentation({
      month: '2026-09',
      transactions,
      categoryNames: names,
      requestedCurrency: 'USD',
    });
    const now = new Date('2026-09-19T12:00:00');
    expect(result.rows.map((r) => categoryMonthRoute(r.categoryId, now))).toEqual([
      '/category/2026-09/transport',
    ]);
    if (result.remainder) {
      expect(remainderRoute(now)).toBe(currentMonthRoute(now));
    }
  });
});

describe('sectorOpacity', () => {
  it('Legend rows match their sectors — one tone per index, quieter down the list', () => {
    const tones = Array.from({ length: 11 }, (_, i) => sectorOpacity(i));
    for (const tone of tones) {
      expect(tone).toBeGreaterThan(0);
      expect(tone).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < tones.length; i += 1) {
      expect(tones[i]).toBeLessThanOrEqual(tones[i - 1]!);
    }
    expect(tones[0]).toBe(1);
  });
});

describe('legendSwatch', () => {
  it('Legend rows match their sectors', () => {
    const ring = donutGeometry([
      { categoryId: 'a', amount: 300 },
      { categoryId: 'b', amount: 200 },
    ]);
    expect(ring.kind).toBe('positive');
    expect(legendSwatch(ring.kind, 0)).toBe(sectorOpacity(0));
    expect(legendSwatch(ring.kind, 1)).toBe(sectorOpacity(1));
  });

  it('A negative category draws no swatch', () => {
    const ring = donutGeometry([
      { categoryId: 'a', amount: 300 },
      { categoryId: 'family', amount: -98231 },
    ]);
    expect(ring.kind).toBe('neutral');
    expect(legendSwatch(ring.kind, 0)).toBeUndefined();
    expect(legendSwatch(ring.kind, 1)).toBeUndefined();
  });
});
