import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ALERT_NOTICES, REMINDER_NOTICE } from '../reminders/notices';
import { inMemoryLocalNotifications } from './local-notifications';

const at21 = { hour: 21, minute: 0 };

describe('the double the tests notify through', () => {
  it('records what was arranged, under the notice`s own id', async () => {
    const port = inMemoryLocalNotifications();
    await port.scheduleDaily(REMINDER_NOTICE, at21);

    expect(port.scheduled()).toEqual([{ id: 'reminder', at: at21 }]);
    expect(await port.scheduledIds()).toEqual(['reminder']);
  });

  it('shows two arrangements when a caller schedules without cancelling first', async () => {
    // Not merged by id, deliberately: "exactly one нагадування at a time" is a rule the callers
    // keep, and a double that quietly deduplicated would make every test of it pass for free.
    const port = inMemoryLocalNotifications();
    await port.scheduleDaily(REMINDER_NOTICE, at21);
    await port.scheduleDaily(REMINDER_NOTICE, { hour: 9, minute: 30 });

    expect(port.scheduled()).toHaveLength(2);
  });

  it('records what was cancelled, and takes it off the list', async () => {
    const port = inMemoryLocalNotifications();
    await port.scheduleDaily(REMINDER_NOTICE, at21);
    await port.cancelDaily(REMINDER_NOTICE.id);

    expect(port.cancelled()).toEqual(['reminder']);
    expect(await port.scheduledIds()).toEqual([]);
    // Idempotent: nothing arranged is not an error, because both callers are unconditional.
    await port.cancelDaily(REMINDER_NOTICE.id);
    expect(port.cancelled()).toEqual(['reminder', 'reminder']);
  });

  it('records what was posted and what is showing, and clearing takes one off', async () => {
    const port = inMemoryLocalNotifications();
    await port.post(ALERT_NOTICES.collection);
    await port.post(ALERT_NOTICES['monobank-sync']);
    expect(port.posted()).toEqual(['alert:collection', 'alert:monobank-sync']);
    expect(port.showing()).toEqual(['alert:collection', 'alert:monobank-sync']);

    await port.clear(ALERT_NOTICES.collection.id);
    expect(port.cleared()).toEqual(['alert:collection']);
    expect(port.showing()).toEqual(['alert:monobank-sync']);
  });

  it('replaces rather than stacks a notice posted twice', async () => {
    const port = inMemoryLocalNotifications();
    await port.post(ALERT_NOTICES.backup);
    await port.post(ALERT_NOTICES.backup);

    expect(port.showing()).toEqual(['alert:backup']);
  });

  it('starts from what the system already holds', async () => {
    // A phone that survived a restart with the нагадування arranged: the launch path asks, and
    // re-asserts what it finds rather than trusting it (design D12).
    const port = inMemoryLocalNotifications({ alreadyScheduled: [{ id: 'reminder', at: at21 }] });
    expect(await port.scheduledIds()).toEqual(['reminder']);
  });
});

describe('a phone that has not granted the permission', () => {
  it('arranges nothing and posts nothing, and says so rather than throwing', async () => {
    const port = inMemoryLocalNotifications({ permission: 'denied' });
    await port.scheduleDaily(REMINDER_NOTICE, at21);
    await port.post(ALERT_NOTICES.backup);

    expect(await port.permission()).toBe('denied');
    expect(await port.scheduledIds()).toEqual([]);
    expect(port.posted()).toEqual([]);
  });

  it('offers the system screen, because that is where it is granted', async () => {
    const port = inMemoryLocalNotifications({ permission: 'denied' });
    await port.openSettings();
    expect(port.opened()).toBe(1);
  });

  it('answers the dialog the owner was shown', async () => {
    const granting = inMemoryLocalNotifications({ permission: 'denied', answer: 'granted' });
    expect(await granting.ask()).toBe('granted');
    expect(await granting.permission()).toBe('granted');
    expect(granting.asked()).toBe(1);

    const refusing = inMemoryLocalNotifications({ permission: 'denied', answer: 'denied' });
    expect(await refusing.ask()).toBe('denied');
    expect(await refusing.permission()).toBe('denied');
  });
});

describe('Scenario: A build that cannot notify says so', () => {
  it('answers unavailable rather than refused, and offers no system screen', async () => {
    const port = inMemoryLocalNotifications({ permission: 'unsupported' });

    expect(await port.permission()).toBe('unsupported');
    // There is no screen the app appears on, so there is nothing to send the owner to.
    await port.openSettings();
    expect(port.opened()).toBe(0);
  });

  it('cannot be asked into granting, and arranges and posts nothing', async () => {
    const port = inMemoryLocalNotifications({ permission: 'unsupported', answer: 'granted' });

    expect(await port.ask()).toBe('unsupported');
    await port.scheduleDaily(REMINDER_NOTICE, at21);
    await port.post(ALERT_NOTICES.collection);

    expect(await port.scheduledIds()).toEqual([]);
    expect(port.posted()).toEqual([]);
  });

  it('raises nothing to the owner`s screen on any path', async () => {
    const port = inMemoryLocalNotifications({ permission: 'unsupported' });
    // Every call answers a value; no path throws. This is the whole of the requirement.
    await expect(
      Promise.all([
        port.permission(),
        port.ask(),
        port.openSettings(),
        port.scheduleDaily(REMINDER_NOTICE, at21),
        port.cancelDaily(REMINDER_NOTICE.id),
        port.scheduledIds(),
        port.post(ALERT_NOTICES.backup),
        port.clear(ALERT_NOTICES.backup.id),
      ]),
    ).resolves.toBeDefined();
  });
});

describe('what `verify` may load', () => {
  it('never reaches a native module through the port', () => {
    const port = readFileSync(new URL('./local-notifications.ts', import.meta.url), 'utf8');

    // The device adapter is `local-notifications-device.ts`; this file names it in prose only.
    for (const native of ['expo-notifications', 'react-native', "from 'expo'"]) {
      expect(port).not.toContain(`import ${native}`);
      expect(port).not.toContain(`from '${native}'`);
    }
  });
});
