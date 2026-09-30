import { describe, expect, it } from 'vitest';

import { recordingHaptics } from './haptics';

describe('recordingHaptics', () => {
  it('lists every effect it was asked to play, in order, and plays nothing', () => {
    const haptics = recordingHaptics();
    expect(haptics.played).toEqual([]);
    haptics.play('confirm');
    haptics.play('tick');
    haptics.play('reject');
    expect(haptics.played).toEqual(['confirm', 'tick', 'reject']);
  });
});
