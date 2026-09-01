import { describe, expect, it } from 'vitest';

import { isArranged, NO_REMINDER, reconcile, REMINDER_ID } from './schedule';
import type { TimeOfDay } from './time';

const at21: TimeOfDay = { hour: 21, minute: 0 };
const at930: TimeOfDay = { hour: 9, minute: 30 };

describe('reconciling what the app believes with what the phone holds', () => {
  it('Scenario: A fresh install reminds the owner of nothing', () => {
    // Never asked: off, no time of the owner's, and — on Android 13 — a permission that reads as
    // refused because nothing has ever asked for it. Nothing is arranged and nothing is called.
    expect(reconcile({ preference: NO_REMINDER, permission: 'denied', scheduled: [] })).toEqual({
      act: 'nothing',
    });
    expect(reconcile({ preference: NO_REMINDER, permission: 'granted', scheduled: [] })).toEqual({
      act: 'nothing',
    });
  });

  it('Scenario: A granted permission arranges it', () => {
    expect(
      reconcile({ preference: { enabled: true, time: at21 }, permission: 'granted', scheduled: [] }),
    ).toEqual({ act: 'schedule', at: at21 });
  });

  it('Scenario: What the app believes is reconciled with what the phone holds', () => {
    // The phone holds nothing — a reboot the system did not survive, or a restored бекап that
    // brought the setting and no arrangement. It is arranged again, and the owner is not asked.
    expect(
      reconcile({ preference: { enabled: true, time: at21 }, permission: 'granted', scheduled: [] }),
    ).toEqual({ act: 'schedule', at: at21 });
  });

  it('Scenario: A time zone change keeps the hour the owner chose', () => {
    // The system already holds one, and it is *still* re-asserted: a daily trigger becomes an
    // alarm when it is scheduled, so only re-scheduling re-computes it in the zone the phone is
    // now in. The answer names the owner's hour, never a shifted one (design D12).
    expect(
      reconcile({
        preference: { enabled: true, time: at21 },
        permission: 'granted',
        scheduled: [REMINDER_ID],
      }),
    ).toEqual({ act: 'schedule', at: at21 });
  });

  it('Scenario: Changing the time moves the one нагадування', () => {
    // Nothing about the answer depends on what hour is currently arranged: it names the new one,
    // and the caller cancels the single stable id before scheduling, so two can never stand.
    expect(
      reconcile({
        preference: { enabled: true, time: at930 },
        permission: 'granted',
        scheduled: [REMINDER_ID],
      }),
    ).toEqual({ act: 'schedule', at: at930 });
  });

  it('Scenario: A permission revoked behind the app`s back is not hidden', () => {
    // On, and no longer allowed: what the phone holds goes, and nothing claims it will arrive.
    expect(
      reconcile({
        preference: { enabled: true, time: at21 },
        permission: 'denied',
        scheduled: [REMINDER_ID],
      }),
    ).toEqual({ act: 'cancel' });
    expect(isArranged({ enabled: true, time: at21 }, 'denied')).toBe(false);
  });

  it('Scenario: Turning it off leaves nothing arranged', () => {
    expect(
      reconcile({
        preference: { enabled: false, time: at21 },
        permission: 'granted',
        scheduled: [REMINDER_ID],
      }),
    ).toEqual({ act: 'cancel' });
    // And the launch after that has nothing left to do.
    expect(
      reconcile({ preference: { enabled: false, time: at21 }, permission: 'granted', scheduled: [] }),
    ).toEqual({ act: 'nothing' });
  });

  it('cancels for a phone that cannot post them at all while the owner has it on', () => {
    expect(
      reconcile({ preference: { enabled: true, time: at21 }, permission: 'unsupported', scheduled: [] }),
    ).toEqual({ act: 'cancel' });
    expect(isArranged({ enabled: true, time: at21 }, 'unsupported')).toBe(false);
  });

  it('ignores arrangements that are not ours', () => {
    // Only the app's own stable id decides whether there is anything to cancel.
    expect(
      reconcile({ preference: NO_REMINDER, permission: 'granted', scheduled: ['someone-else'] }),
    ).toEqual({ act: 'nothing' });
  });

  it('answers the owner`s time even for a preference storage could not have written', () => {
    // `enabled` with no time cannot come out of the repository; the default stands in rather than
    // leaving the launch path with nothing to schedule.
    expect(reconcile({ preference: { enabled: true }, permission: 'granted', scheduled: [] })).toEqual(
      { act: 'schedule', at: { hour: 21, minute: 0 } },
    );
  });
});

describe('whether the section may say a нагадування will arrive', () => {
  it('is on and granted, and nothing else', () => {
    expect(isArranged({ enabled: true, time: at21 }, 'granted')).toBe(true);
    expect(isArranged({ enabled: false, time: at21 }, 'granted')).toBe(false);
    expect(isArranged(NO_REMINDER, 'granted')).toBe(false);
  });
});
