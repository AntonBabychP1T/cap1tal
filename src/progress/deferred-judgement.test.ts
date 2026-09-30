import { describe, expect, it } from 'vitest';

import { queuedIdle } from '../platform/idle';
import { judgeAfterSettle } from './deferred-judgement';

describe('judging прогрес after the screen settles', () => {
  it('Scenario: Saving a транзакція returns to the previous screen before прогрес is judged', () => {
    const idle = queuedIdle();
    const verdicts: string[][] = [];
    const judge = () => {
      const verdict = ['first-expense'];
      verdicts.push(verdict);
      return verdict;
    };

    // The save's own path: judging is scheduled, and the screen changes while nothing is judged.
    judgeAfterSettle({ schedule: idle.afterScreenSettles, judge, announce: () => {} });
    expect(verdicts).toEqual([]);
    expect(idle.pending).toBe(1);

    // Once the screen has settled: judged exactly once, the verdict the inline call would reach.
    idle.flush();
    expect(verdicts).toEqual([['first-expense']]);
    idle.flush();
    expect(verdicts).toHaveLength(1);
  });

  it('Scenario: A досягнення earned by a save appears on the screen in sight', () => {
    const idle = queuedIdle();
    let announced = 0;
    const announce = () => {
      announced += 1;
    };

    judgeAfterSettle({ schedule: idle.afterScreenSettles, judge: () => ['uncategorised-zero'], announce });
    judgeAfterSettle({ schedule: idle.afterScreenSettles, judge: () => [], announce });
    expect(announced).toBe(0);

    idle.flush();
    // Announced for the judging that earned something, and not for the one that earned nothing.
    expect(announced).toBe(1);
  });
});
