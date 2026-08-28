import { describe, expect, it } from 'vitest';

import { fingerprintOf, type CapturedNotification } from './capture';

const capture = (over: Partial<CapturedNotification> = {}): CapturedNotification => ({
  packageName: 'ua.privatbank.ap24',
  postedAt: Date.UTC(2026, 7, 26, 9, 30, 0),
  title: 'Оплата',
  text: '250.00UAH. Сільпо',
  ...over,
});

describe('fingerprintOf', () => {
  it('Scenario: The same notification does not draft twice — equal records fingerprint equally', () => {
    expect(fingerprintOf(capture())).toBe(fingerprintOf(capture()));
  });

  it('Scenario: The same notification does not draft twice — a different package is a different notification', () => {
    expect(fingerprintOf(capture({ packageName: 'ua.other.bank' }))).not.toBe(
      fingerprintOf(capture()),
    );
  });

  it('Scenario: The same notification does not draft twice — a different posted moment is a different notification', () => {
    expect(fingerprintOf(capture({ postedAt: capture().postedAt + 1 }))).not.toBe(
      fingerprintOf(capture()),
    );
  });

  it('Scenario: The same notification does not draft twice — a different title is a different notification', () => {
    expect(fingerprintOf(capture({ title: 'Поповнення' }))).not.toBe(fingerprintOf(capture()));
  });

  it('Scenario: The same notification does not draft twice — a different text is a different notification', () => {
    expect(fingerprintOf(capture({ text: '250.00UAH. АТБ' }))).not.toBe(fingerprintOf(capture()));
  });

  it('Scenario: The same notification does not draft twice — the fingerprint carries all four fields', () => {
    const fingerprint = fingerprintOf(capture());
    expect(fingerprint).toContain('ua.privatbank.ap24');
    expect(fingerprint).toContain(String(capture().postedAt));
    expect(fingerprint).toContain('Оплата');
    expect(fingerprint).toContain('250.00UAH. Сільпо');
  });
});
