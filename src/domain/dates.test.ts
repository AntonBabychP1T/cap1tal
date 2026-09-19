import { describe, expect, it } from 'vitest';

import { daysBetween } from './dates';

describe('daysBetween', () => {
  it('is zero for the same date', () => {
    expect(daysBetween('2026-09-12', '2026-09-12')).toBe(0);
  });

  it('counts whole days either direction', () => {
    expect(daysBetween('2026-09-12', '2026-09-13')).toBe(1);
    expect(daysBetween('2026-09-13', '2026-09-12')).toBe(1);
  });

  it('a month boundary is still one day', () => {
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
  });

  it('a year boundary is still one day', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});
