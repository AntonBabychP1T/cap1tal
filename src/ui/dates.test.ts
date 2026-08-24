import { describe, expect, it } from 'vitest';

import { monthOf } from '../domain/transaction';
import { todayIso } from './dates';

describe('todayIso', () => {
  it('The date defaults to today', () => {
    expect(todayIso(new Date(2026, 7, 24, 12, 0, 0))).toBe('2026-08-24');
  });

  it('A late evening keeps the local day, not the UTC one', () => {
    // 23:30 local on 24 August is already 25 August in UTC east of Greenwich; the transaction
    // still belongs to the 24th, because a date here is a calendar date.
    const late = new Date(2026, 7, 24, 23, 30, 0);
    expect(todayIso(late)).toBe('2026-08-24');
    expect(monthOf(todayIso(late))).toBe('2026-08');
  });

  it('Single digits are padded so the date is always YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 0, 5, 9, 0, 0))).toBe('2026-01-05');
  });
});
