import { describe, expect, it } from 'vitest';

import { inMemoryBackgroundSync } from './background-sync';

describe('the background-sync double', () => {
  it('remembers the дочитування it was asked for, in order', () => {
    const phone = inMemoryBackgroundSync();
    phone.continueLater(62_000);
    phone.continueLater(5_000);
    expect(phone.continuations).toEqual([62_000, 5_000]);
  });

  it('Scenario: No link, no поштовх — a notification notes nothing while unwanted', () => {
    const phone = inMemoryBackgroundSync();
    phone.nudge(1_000);
    expect(phone.nudgedAtMs()).toBeUndefined();

    phone.setNudgesWanted(true);
    phone.nudge(2_000);
    expect(phone.nudgedAtMs()).toBe(2_000);
  });

  it('answers a restriction and records the fix it was asked to open', async () => {
    const phone = inMemoryBackgroundSync({ restriction: 'optimised' });
    expect(phone.restriction()).toBe('optimised');
    await phone.openRestrictionFix('optimised');
    phone.setRestriction('allowed');
    expect(phone.opened).toEqual(['optimised']);
    expect(phone.restriction()).toBe('allowed');
  });

  it('a phone that cannot tell answers unknown', () => {
    expect(inMemoryBackgroundSync().restriction()).toBe('unknown');
  });
});
