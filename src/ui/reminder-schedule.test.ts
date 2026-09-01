import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { remindersRepo, type RemindersRepo } from '../db/reminders-repo';
import { openTestDb, type TestStorage } from '../db/test-db';
import {
  inMemoryLocalNotifications,
  type LocalNotificationPermission,
  type LocalNotificationsDouble,
} from '../platform/local-notifications';
import {
  reconcileOnLaunch,
  setTime,
  turnOff,
  turnOn,
  type ReminderPorts,
} from './reminder-schedule';

const at21 = { hour: 21, minute: 0 };
const at930 = { hour: 9, minute: 30 };

describe('arranging the нагадування through the phone', () => {
  let storage: TestStorage;
  let repo: RemindersRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = remindersRepo(storage.db);
  });
  afterEach(() => storage.close());

  function phoneWith(options?: {
    readonly permission?: LocalNotificationPermission;
    readonly answer?: LocalNotificationPermission;
    readonly alreadyScheduled?: readonly { readonly id: string; readonly at: typeof at21 }[];
  }): { readonly phone: LocalNotificationsDouble; readonly ports: ReminderPorts } {
    const phone = inMemoryLocalNotifications(options);
    return { phone, ports: { notifications: phone, storage: repo } };
  }

  it('Scenario: Turning it on arranges it for the chosen time', async () => {
    const { phone, ports } = phoneWith({ permission: 'denied', answer: 'granted' });

    const state = await turnOn(at21, ports);

    expect(state.arranged).toBe(true);
    expect(phone.scheduled()).toEqual([{ id: 'reminder', at: at21 }]);
    expect(repo.preference()).toEqual({ enabled: true, time: at21 });
  });

  it('Scenario: A granted permission arranges it', async () => {
    const { phone, ports } = phoneWith({ permission: 'granted' });

    const state = await turnOn(at21, ports);

    expect(state.permission).toBe('granted');
    // Already granted: the dialog is not shown a second time.
    expect(phone.asked()).toBe(0);
    expect(phone.scheduled()).toEqual([{ id: 'reminder', at: at21 }]);
  });

  it('Scenario: A refused permission leaves it off', async () => {
    const { phone, ports } = phoneWith({ permission: 'denied', answer: 'denied' });

    const state = await turnOn(at21, ports);

    expect(state.arranged).toBe(false);
    expect(state.permission).toBe('denied');
    expect(phone.scheduled()).toEqual([]);
    // Nothing is stored: the switch does not lie about being on, and a later grant does not find
    // a нагадування the owner never managed to turn on.
    expect(repo.preference()).toEqual({ enabled: false });
  });

  it('leaves a phone that cannot post them off, without pretending it was refused', async () => {
    const { phone, ports } = phoneWith({ permission: 'unsupported', answer: 'granted' });

    const state = await turnOn(at21, ports);

    expect(state.permission).toBe('unsupported');
    expect(state.arranged).toBe(false);
    expect(phone.scheduled()).toEqual([]);
  });

  it('Scenario: Turning it off leaves nothing arranged', async () => {
    const { phone, ports } = phoneWith();
    await turnOn(at21, ports);

    const state = await turnOff(ports);

    expect(state.arranged).toBe(false);
    expect(await phone.scheduledIds()).toEqual([]);
    expect(phone.cancelled()).toContain('reminder');
    // Nothing is asked for: there is no permission needed to stop posting.
    expect(phone.asked()).toBe(0);
    // And the hour the owner chose is kept, so turning it back on offers it rather than 21:00.
    expect(repo.preference()).toEqual({ enabled: false, time: at21 });
  });

  it('Scenario: Changing the time moves the one нагадування', async () => {
    const { phone, ports } = phoneWith();
    await turnOn(at21, ports);

    const state = await setTime(at930, ports);

    expect(state.arranged).toBe(true);
    // Exactly one, for the new time — the old one is cancelled before the new one is arranged.
    expect(phone.scheduled()).toEqual([{ id: 'reminder', at: at930 }]);
    expect(repo.preference()).toEqual({ enabled: true, time: at930 });
  });

  it('keeps a time set before the switch, so the hour is waiting when it goes on', async () => {
    const { phone, ports } = phoneWith();

    await setTime(at930, ports);
    expect(phone.scheduled()).toEqual([]);

    await turnOn(at930, ports);
    expect(phone.scheduled()).toEqual([{ id: 'reminder', at: at930 }]);
  });

  it('Scenario: No network is needed', async () => {
    // Nothing on this path can reach a network: the port is the phone's own shade and the record
    // is the phone's own database. There is no push token to obtain and no server to register
    // with — the double would have nowhere to make a request even if something asked it to.
    const { phone, ports } = phoneWith();

    await turnOn(at21, ports);

    expect(phone.scheduled()).toEqual([{ id: 'reminder', at: at21 }]);
    expect(Object.keys(phone)).not.toContain('token');
  });
});

describe('what the app does about the нагадування every time it opens', () => {
  let storage: TestStorage;
  let repo: RemindersRepo;

  beforeEach(() => {
    storage = openTestDb();
    repo = remindersRepo(storage.db);
  });
  afterEach(() => storage.close());

  it('Scenario: A fresh install reminds the owner of nothing', async () => {
    const phone = inMemoryLocalNotifications({ permission: 'denied' });

    const state = await reconcileOnLaunch({ notifications: phone, storage: repo });

    expect(state.arranged).toBe(false);
    expect(phone.scheduled()).toEqual([]);
    expect(phone.cancelled()).toEqual([]);
    // And nothing is asked for on a launch: the permission is requested where the switch is.
    expect(phone.asked()).toBe(0);
  });

  it('Scenario: A restart does not lose it', async () => {
    repo.setPreference({ enabled: true, time: at21 });
    // The system kept it across the reboot, as expo-notifications' boot receiver arranges.
    const phone = inMemoryLocalNotifications({ alreadyScheduled: [{ id: 'reminder', at: at21 }] });

    const state = await reconcileOnLaunch({ notifications: phone, storage: repo });

    expect(state.arranged).toBe(true);
    expect(await phone.scheduledIds()).toEqual(['reminder']);
  });

  it('Scenario: What the app believes is reconciled with what the phone holds', async () => {
    repo.setPreference({ enabled: true, time: at21 });
    // The system did not keep it — a reboot it did not survive, or a бекап restored onto a phone
    // that had nothing arranged.
    const phone = inMemoryLocalNotifications();

    await reconcileOnLaunch({ notifications: phone, storage: repo });

    expect(phone.scheduled()).toEqual([{ id: 'reminder', at: at21 }]);
    expect(phone.asked()).toBe(0);
  });

  it('Scenario: A time zone change keeps the hour the owner chose', async () => {
    repo.setPreference({ enabled: true, time: at21 });
    const phone = inMemoryLocalNotifications({ alreadyScheduled: [{ id: 'reminder', at: at21 }] });

    await reconcileOnLaunch({ notifications: phone, storage: repo });

    // Re-asserted even though one was already there: only re-scheduling re-computes the alarm in
    // the zone the phone is now in. Exactly one stands afterwards, and it names the owner's hour.
    expect(phone.cancelled()).toEqual(['reminder']);
    expect(phone.scheduled()).toEqual([{ id: 'reminder', at: at21 }]);
  });

  it('Scenario: A permission revoked behind the app`s back is not hidden', async () => {
    repo.setPreference({ enabled: true, time: at21 });
    const phone = inMemoryLocalNotifications({
      permission: 'denied',
      alreadyScheduled: [{ id: 'reminder', at: at21 }],
    });

    const state = await reconcileOnLaunch({ notifications: phone, storage: repo });

    expect(state.permission).toBe('denied');
    expect(state.arranged).toBe(false);
    expect(await phone.scheduledIds()).toEqual([]);
    // The owner's own answer is not thrown away: granting it again brings the нагадування back.
    expect(repo.preference()).toEqual({ enabled: true, time: at21 });
  });

  it('brings it back on the launch after the permission is granted again', async () => {
    repo.setPreference({ enabled: true, time: at21 });
    const phone = inMemoryLocalNotifications({ permission: 'granted' });

    const state = await reconcileOnLaunch({ notifications: phone, storage: repo });

    expect(state.arranged).toBe(true);
    expect(phone.scheduled()).toEqual([{ id: 'reminder', at: at21 }]);
  });

  it('takes away what a restored бекап turned off elsewhere', async () => {
    repo.setPreference({ enabled: false, time: at21 });
    const phone = inMemoryLocalNotifications({ alreadyScheduled: [{ id: 'reminder', at: at21 }] });

    await reconcileOnLaunch({ notifications: phone, storage: repo });

    expect(await phone.scheduledIds()).toEqual([]);
  });
});

/**
 * Two facts live in JSX that `verify` never runs: *when* the нагадування is reconciled, and that
 * a tapped notification is routed through the table rather than followed. Both are SHALLs in the
 * delta spec and neither can be reached by executing a pure module, so they are held structurally
 * — the technique `notifications-screen.test.ts` uses, and for the same reason.
 */
describe('the app reconciles and routes when it opens', () => {
  const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');

  it('Scenario: A restart does not lose it', () => {
    // After the migrations, because the preference this reads is in the storage they prepare.
    expect(layout).toMatch(/if \(success\) \{\s*void reconcileOnLaunch\(NOTIFY\);/);
    // And nothing here re-asks the owner for the permission: that happens at the switch.
    expect(layout).not.toContain('.ask()');
    expect(layout).not.toContain('turnOn(');
  });

  it('holds no scheduling decision of its own', () => {
    // Every rule about what should be arranged is `reconcile`, proven above.
    for (const decided of ['reconcile({', 'scheduleDaily(', 'cancelDaily(', 'REMINDER_ID']) {
      expect(layout, decided).not.toContain(decided);
    }
  });

  it('Scenario: A tap while the app is closed opens Головний', () => {
    // The response waiting from a launch the app was not running for, read once — and read after
    // the migrations, because every screen a tap can land on reads storage.
    expect(layout).toContain('const cold = tappedOnColdStart();');
    expect(layout).toContain('router.push(cold)');
  });

  it('Scenario: A tap while the app is running opens Головний', () => {
    expect(layout).toContain('return onNotificationTapped((route) => router.push(route));');
    // The destination is never taken from the notification itself: `routeOf` maps it through the
    // table in `local-notifications-device.ts`, and anything unknown becomes Головний.
    expect(layout).not.toContain('content.data');
    expect(layout).not.toContain('expo-notifications');
  });
});
