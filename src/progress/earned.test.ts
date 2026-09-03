import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import {
  decodeEvidence,
  encodeEvidence,
  isEvidence,
  isUnseen,
  newestFirst,
  type EarnedAchievement,
  type Evidence,
} from './earned';

const SHAPES: Evidence[] = [
  { kind: 'count', count: 2459 },
  { kind: 'months', months: 3, from: '2026-04', to: '2026-06' },
  { kind: 'money', money: money(4_000_000, 'UAH') },
  { kind: 'month', month: '2026-06' },
  { kind: 'goal', goalId: 'g1', name: 'Авто' },
];

function earned(over: Partial<EarnedAchievement> = {}): EarnedAchievement {
  return {
    key: 'k',
    template: 't',
    achievedOn: '2026-01-01',
    recordedAtMs: 0,
    evidence: { kind: 'count', count: 1 },
    ...over,
  };
}

describe('the свідчення', () => {
  it('survives its own encoding, in every shape it has', () => {
    for (const shape of SHAPES) {
      expect(decodeEvidence(encodeEvidence(shape))).toEqual(shape);
    }
  });

  it('encodes deterministically, so an unchanged бекап stays byte for byte the same', () => {
    for (const shape of SHAPES) {
      expect(encodeEvidence(shape)).toBe(encodeEvidence(shape));
    }
  });

  it('Scenario: A money свідчення carries its currency', () => {
    const encoded = encodeEvidence({ kind: 'money', money: money(3_000_000, 'UAH') });

    expect(encoded).toContain('UAH');
    expect(decodeEvidence(encoded)).toEqual({ kind: 'money', money: money(3_000_000, 'UAH') });
    // Through the domain's own constructor, so a сума with no currency cannot come back out.
    expect(() => decodeEvidence('{"kind":"money","amount":100}')).toThrow();
  });

  it('names a ціль by its identifier and the назва it had then', () => {
    const encoded = encodeEvidence({ kind: 'goal', goalId: 'g1', name: 'Авто' });

    expect(decodeEvidence(encoded)).toEqual({ kind: 'goal', goalId: 'g1', name: 'Авто' });
  });

  it('refuses what this app did not write', () => {
    expect(() => decodeEvidence('not json')).toThrow();
    expect(() => decodeEvidence('null')).toThrow();
    expect(() => decodeEvidence('{"kind":"constellation"}')).toThrow();
    expect(() => decodeEvidence('{"kind":"count","count":-1}')).toThrow();
    expect(() => decodeEvidence('{"kind":"count","count":1.5}')).toThrow();
    expect(() => decodeEvidence('{"kind":"month","month":"2026-13"}')).toThrow();
    expect(() => decodeEvidence('{"kind":"goal","goalId":""}')).toThrow();
  });

  it('answers whether a text is one without throwing', () => {
    expect(isEvidence(encodeEvidence({ kind: 'count', count: 1 }))).toBe(true);
    expect(isEvidence('{"kind":"constellation"}')).toBe(false);
  });
});

describe('reading a set of earned досягнення', () => {
  it('knows which the owner has not been shown', () => {
    expect(isUnseen(earned())).toBe(true);
    expect(isUnseen(earned({ seenAtMs: 1 }))).toBe(false);
  });

  it('Scenario: Отримані are newest first', () => {
    const listed = newestFirst([
      earned({ key: 'a', achievedOn: '2024-12-03' }),
      earned({ key: 'b', achievedOn: '2026-09-02' }),
      earned({ key: 'c', achievedOn: '2025-03-31' }),
    ]);

    expect(listed.map((one) => one.achievedOn)).toEqual(['2026-09-02', '2025-03-31', '2024-12-03']);
  });

  it('breaks a tie by key, so one day`s досягнення always list in the same order', () => {
    const listed = newestFirst([
      earned({ key: 'b', achievedOn: '2026-09-02' }),
      earned({ key: 'a', achievedOn: '2026-09-02' }),
    ]);

    expect(listed.map((one) => one.key)).toEqual(['a', 'b']);
  });
});
